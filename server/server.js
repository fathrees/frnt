const express = require('express');
const timeout = require('connect-timeout');
const { ObjectID } = require('mongodb');
const _ = require('lodash');
const path = require('path');
const hbs = require('hbs');

const { olxScrapTimeout, batchDelay, adsPerBatch } = require('./constants');
const { getPath, getAdIdFromRef } = require('./functions');
const { mongoose } = require('./db/mongoose');
const { Ad, User } = require('./db/models');
const { olx, getPhones, getAdContent } = require( '../olx/olx');
const { cities } = require('../olx/constants');
const { toDate, getBackgroundColorClass } = require('../views/js/helpers');
const { getCitiesList } = require('../views/js/functions');

const app = express();
const port = process.env.PORT || 3000;

const viewsPath = path.join(__dirname, '../views');

app.set('view engine', 'hbs');

hbs.registerPartials(`${viewsPath}/partials`);

hbs.registerHelper('toDate', toDate);
hbs.registerHelper('getBackgroundColorClass', getBackgroundColorClass);

app.use(timeout(olxScrapTimeout));

app.get('/', (req, response) => {
  response.render('home.hbs');
});

let isRequestSent = false; // It's needed to resolve issue below

app.get('/olx/realtyRentFlatLong/:city', (req, response) => {
  // const keepAliveOps = `timeout=${olxScrapTimeout/1000}, max=1`; ////////////////////////////////////////////////////////////////////////////////////////
  // req.headers['Connection'] = 'Keep-Alive';
  // req.headers['Keep-Alive'] = keepAliveOps;
  // response.set({                                                 Doesn't help to prevent request repeating by browser while it is waiting for response
  //   'Connection': 'Keep-Alive',                                  Similar to express.js bug https://github.com/expressjs/express/issues/2121
  //   'Keep-Alive': keepAliveOps,                                  (using response inside local setTimeout (94:1))
  // });
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  if (!isRequestSent) {
    isRequestSent = true;
    console.log('Gathering new ads started...');
    const city = req.params.city;
    const path = getPath(city);
    const promises = [];
    olx({ path }).then((resolveObj) => {
      console.log(`Scanning page 1/${resolveObj.pages || 1}`);
      for (let page = 2; page <= resolveObj.pages; page++) {
        console.log(`Scanning page ${page}/${resolveObj.pages}`);
        promises.push(olx({path, page}));
      }
      let receivedAdRefs;
      if (promises.length) {
        Promise.all(promises).then((resolvesArr) => {
          receivedAdRefs = _.uniq(resolveObj.cleanedAdRefs.concat(_.flatten(resolvesArr)));
          insertNewAds(city, receivedAdRefs, response);
        }).catch((e) => response.send(e));
      } else {
        receivedAdRefs = _.uniq(resolveObj);
        insertNewAds(receivedAdRefs, response);
      }
    }).catch((e) => response.send(e));
  }
});

app.get('/upsertUsersByGroupAds', (req, response) => {
  Ad.find().then((ads) => {
    const ungroupedAds = _.clone(ads);
    groupAdsByUserPhones(ungroupedAds, response);
  }).catch((e) => console.log(e));
});

app.get('/users/:city', (req, response) => {
  User.find({ city: req.params.city }, {}, { sort: 'adsCount' }).then((users) => {
    response.render('users.hbs', { users });
  }).catch((e) => response.send(e));
});

app.get('/flats', (req, response) => {
  const { city, lowRooms, highRooms, lowPrice, highPrice, sortBy, sortDirection } = req.query;
  const query = {};
  if (city) query.city = city;
  if (lowRooms && highRooms) query.rooms = { $gte: + lowRooms, $lte: + highRooms };
  if (lowPrice && highPrice) query.price = { $gte: + lowPrice, $lte: + highPrice };
  let nUpdatedAds = 0;
  Ad.find(query).then((ads) => {
    ads.forEach((ad) => {
      User.findOne({ adRefs: ad.ref }).then((user) => {
        ad.update({ $set: { isRealtorScale: user.adsCount } }).then(() => {
          if (++ nUpdatedAds === ads.length) {
            const options = { sort: { isRealtorScale: 1 } };
            if (sortBy) options.sort[sortBy] = + sortDirection || 1;
            Ad.find(query, {}, options).then((res) => response.render('flats.hbs', {
              query: req.query,
              flats: res,
              cities: getCitiesList(cities, req.query.city),
            })).catch((e) => response.send(e));
          }
        }).catch((e) => response.send(e))
      }).catch((e) => response.send(e));
    });
  }).catch((e) => response.send(e));
});

app.listen(`${port}`, () => console.log(`Server up on port ${port}`));

const insertNewAds = (city, receivedAdRefs, response) => {
  Ad.find({ city }).then((ads) => {
    const newAdRefs = _.difference(receivedAdRefs, ads.map(ad => ad.ref));
    if (newAdRefs.length) {
      console.log(`${newAdRefs.length} new ads were got from Olx`);
      const batchesAdRefs = _.chunk(newAdRefs, adsPerBatch);
      let insertedAds = [];
      let isErr;
      let i = 0;
      while (!isErr && i < batchesAdRefs.length) {
        const delay = i * batchDelay;
        console.log(`${i + 1}/${batchesAdRefs.length} batch of ${adsPerBatch} ads taken in parsing`);
        setTimeout(insertBatchNewAds, delay, city, batchesAdRefs[i], i, (err, res) => {
          if (isErr) {
            response.end();
            return null;
          }
          console.log(err || `${res.insertedCount} new ads were successfully stored. Waiting for next batch...`);
          if (err) {
            response.send(err);
            isErr = true;
          } else {
            insertedAds = insertedAds.concat(res.ops);
            if (insertedAds.length === newAdRefs.length) {
              response.send(insertedAds);
              console.log(`All new ads (${insertedAds.length}) from Olx (${ads.length}) were successfully stored`);
            }
          }
        });
        i++;
      }
    } else {
      console.log('No new ads');
      response.send('No new ads');
    }
  }).catch(e => console.log('Unable connect to db', e));
};

const insertBatchNewAds = (city, batchAdRefs, i, cb) => {
  console.log(`${i + 1} batch is parsing... It will take ${batchDelay/60000} min to prevent Olx ban ;)`);
  const newAdObjs = batchAdRefs.map((ref) => {
    const olxAdId = getAdIdFromRef(ref);
    if (!olxAdId) {
      console.log(`'${ref}' doesn't has ID, check source of Olx`);
      return { ref };
    }
    const promisePhones = getPhones(olxAdId);
    const promiseAdContent = getAdContent(ref);
    return { ref, promisePhones, promiseAdContent };
  });
  Promise.all(newAdObjs.map((ad) => ad.promisePhones)).then((phoneArrs) => {
    Promise.all(newAdObjs.map((ad) => ad.promiseAdContent)).then((contents) => {
      const batchAds = phoneArrs.map((phones, i) => (
        _.extend({
          ref: newAdObjs[i].ref,
          phones,
          city,
        }, contents[i])));
      groupAdsByUserPhones(_.clone(batchAds), null, (msg) => {
        console.log(msg);
        Ad.collection.insert(batchAds, cb);
      });
    }).catch((e) => cb(e));
  }).catch((e) => cb(e));
};

const groupAdsByUserPhones = (ungroupedAds, response, cb) => {
  const { phones: phonesForSearch, city } = ungroupedAds[0];
  const foundAds = ungroupedAds.filter((ad) => _.intersection(ad.phones, phonesForSearch).length > 0);
  User.findOne({ city, phones: { $in: phonesForSearch } }).then((res) => {
    const userId = (res && res._id) || new ObjectID();
    const adRefs = _.union((res && res.adRefs) || [], foundAds.map(({ ref }) => ref));
    const phones = _.union((res && res.phones) || [], phonesForSearch);
    const options = { $set: { city, phones, adRefs, adsCount: adRefs.length } };
    User.update({ _id: userId }, options, { upsert: true }).then(() => {
      const successMsg = 'Users upserted by grouping ads with similar phones';
      _.pullAll(ungroupedAds, foundAds);
      if (ungroupedAds.length) {
        groupAdsByUserPhones(ungroupedAds, response, cb);
      } else if (response) {
        User.find().sort('adsCount').then((users) => {
          response.send(users);
          console.log(successMsg);
        }).catch((e) => response.send(e));
      } else cb(successMsg);
    }).catch((e) => console.log(e))
  }).catch((e) => console.log(e));
};
