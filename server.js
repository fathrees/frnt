const express = require('express');
const timeout = require('connect-timeout');
const _ = require('lodash');
const { ObjectID } = require('mongodb');

const { mongoose } = require('./db/mongoose');
const { Ad, User } = require('./db/models');
const { olx, categories, getPhones } = require( './olx/olx');

const olxScrapTimeout = 3000000;// msec
const adsPerBatch = 10;// todo move to constants.js separated file
const batchDelay = 60000;// msec

const app = express();
const port = process.env.PORT || 3000;

app.use(timeout(olxScrapTimeout));

let isRequestSent = false; // needs to resolve issue below

app.get('/olx/realtyRentFlatLong/:city', (req, response) => {
  // const keepAliveOps = `timeout=${olxScrapTimeout/1000}, max=1`; ////////////////////////////////////////////////////////////////////////////////////////
  // req.headers['Connection'] = 'Keep-Alive';
  // req.headers['Keep-Alive'] = keepAliveOps;
  // response.set({                                                 Doesn't help to prevent request repeating by browser while it is waiting for response
  //   'Connection': 'Keep-Alive',                                  Similar to express.js bug https://github.com/expressjs/express/issues/2121
  //   'Keep-Alive': keepAliveOps,                                  (using response inside local setTimeout (79:1))
  // }); ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  if (!isRequestSent) {
    isRequestSent = true;
    console.log('Gathering new ads started...');
    const path = getPath(req.params.city);
    const promises = [];
    olx({path})
    .then((resolveObj) => {
      console.log(`Scanning page 1/${resolveObj.pages || 1}`);
      for (let page = 2; page <= resolveObj.pages; page++) {
        console.log(`Scanning page ${page}/${resolveObj.pages}`);
        promises.push(olx({path, page}));
      }
      let receivedAdRefs;
      if (promises.length) {
        Promise.all(promises)
        .then((resolvesArr) => {
          receivedAdRefs = _.uniq(resolveObj.cleanedAdRefs.concat(_.flatten(resolvesArr)));
          insertNewAds(receivedAdRefs, response);
        }).catch((e) => response.send(e));
      } else {
        receivedAdRefs = _.uniq(resolveObj);
        insertNewAds(receivedAdRefs, response);
      }
    }).catch((e) => response.send(e));
  }
});

app.get('/groupAdsByUserPhones', (req, response) => {
  Ad.find().then((ads) => {
    const ungroupedAds = _.clone(ads);
    groupAdsByUserPhones(ungroupedAds, response);
  }).catch((e) => console.log(e));
});

app.get('/sortUsers/:sortBy', (req, response) => {
  const sortBy = req.params.sortBy;
  if (sortBy === 'adsCount') {
    User.find().sort('adsCount')
      .then((res) => {
        response.send(res);
      }).catch((e) => response.send(e));
  }
});

app.listen(`${port}`, () => console.log(`Server up on port ${port}`));

const getPath = (city) => { //todo separate funcs to other file?
  const realty = categories['realty'];
  const rentFlat = realty['rentFlat'];
  const longTherm = rentFlat['longTherm'];
  return `${realty.path}${rentFlat.path}${longTherm.path}${city}`;
};

const insertNewAds = (receivedAdRefs, response) => {
  Ad.find().then((ads) => {
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
        setTimeout(insertBatchNewAds, delay, batchesAdRefs[i], i, (err, res) => {
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
                response.end();
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

const insertBatchNewAds = (batchAdRefs, i, cb) => {
  console.log(`${i + 1} batch is parsing... It will take ${batchDelay/60000} min to prevent Olx ban ;)`);
  const newAdObjs = batchAdRefs.map((ref) => {
    const olxAdId = getAdIdFromRef(ref);
    if (!olxAdId) {
      console.log(`'${ref}' doesn't has ID, check source of Olx`);
      return { ref };
    }
    const promisePhones = getPhones(olxAdId);
    return { ref, promisePhones};
  });
  Promise.all(newAdObjs.map((ad) => ad.promisePhones))
    .then((phoneArrs) => {
      const batchAds = phoneArrs.map((phones, i) => ({
        ref: newAdObjs[i].ref,
        phones,
      }));
      groupAdsByUserPhones(_.clone(batchAds), undefined, (msg) => {
        console.log(msg);
        Ad.collection.insert(batchAds, cb);
      });
    }).catch((e) => cb(e));
};

const getAdIdFromRef = (ref) => {
  const adIdRegex = new RegExp(/-ID(.+)\.html$/);
  const match = ref.match(adIdRegex);
  return match && match[1] || null;
};

const groupAdsByUserPhones = (ungroupedAds, response, cb) => {
  const phonesForSearch = ungroupedAds[0].phones;
  const foundAds = ungroupedAds.filter((ad) => _.intersection(ad.phones, phonesForSearch).length > 0);
  User.findOne({ phones: { $in: phonesForSearch } })
    .then((res) => {
      const _id = (res && res._id) || new ObjectID();
      const ads = _.union((res && res.adIds) || [], foundAds.map(({ ref }) => ref));
      const phones = _.union((res && res.phones) || [], phonesForSearch);
      User.update({ _id }, { $set: { phones, ads, adsCount: ads.length } }, { upsert: true })
        .then(() => {
          const successMsg = 'Users upserted by grouping ads with similar phones';
          _.pullAll(ungroupedAds, foundAds);
          if (ungroupedAds.length) groupAdsByUserPhones(ungroupedAds, response, cb);
          else if (response) {
            User.find().sort('adsCount')
              .then((users) => {
                response.send(users);
                console.log(successMsg);
              }).catch((e) => response.send(e));
          } else cb(successMsg);
      }).catch((e) => console.log(e))
    }).catch((e) => console.log(e));
};
