const express = require('express');
const timeout = require('connect-timeout');
const _ = require('lodash');
const { ObjectID } = require('mongodb');

const { mongoose } = require('./db/mongoose');
const { Ad, User, Flat } = require('./db/models');
const { olx, categories, getPhones, olxFlat } = require( './olx/olx');

const olxScrapTimeout = 3000000;// msec
const adsPerBatch = 10;// todo move to constants.js separated file
const batchDelay = 60000;// msec

const app = express();
const port = process.env.PORT || 3000;

app.use(timeout(olxScrapTimeout));

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
    olx({ path })
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
  User.find({ city: req.params.city }, { 'ads': true, 'phones': true }, { sort: 'adsCount' })
    .then((res) => {
      response.send(res);
    }).catch((e) => response.send(e));
});

app.get('/flats/:city/:lowRooms/:highRooms/:lowPrice/:highPrice', (req, response) => {
  const { city, lowRooms, highRooms, lowPrice, highPrice, } = req.params;
  const query = {};
  if (city) query.city = city;
  query.rooms = { $gte: lowRooms, $lte: highRooms };
  query.price = { $gte: lowPrice, $lte: highPrice };
  Flat.find(query, {}, { sort: {'usersCount': 1 } })
    .then((flats) => {
      const flatsWithUserPhones = flats.map((flat) => {
        flat.usersId.forEach((userId) => {
          const userWithPhones = { userId };
          User.findById(userId)
            .then((user) => {
              userWithPhones.phones = user.phones;
              return userWithPhones;
            }).catch((e) => console.log(e));
        });
      });
      response.send(flatsWithUserPhones);
    }).catch((e) => response.send(e));
});

app.get('/insertFlats', (req, response) => {
  User.find({}, {}, { sort: 'adsCount' }).then((users) => {
    users.forEach((user, i) => {
      user.ads.forEach((ad) => {
        olxFlat(ad).then((flat) => {
          const newFlat = _.extend(_.clone(flat), { usersId: [user._id] });
          Flat.collection.insert(newFlat).then(() => {
            console.log(`New flat from ad ${ad} stored`);
          }).catch((e) => console.log(e));
        }).catch((e) => {
          console.log(e);
          if (e === `${ad} outdated`) {
            User.findOne({ ads: ad }).then((user) => {
              user.ads = _.without(user.ads, ad);
              user.adsCount --;
              user.save().then((user) => {
                console.log(`User id:${user._id} updated`);
                Ad.findOneAndRemove({ ref: ad }).then((ad1) => console.log(`Ad id:${ad1._id} removed`)).catch((e1) => console.log(e1));
              }).catch((e1) => console.log(e1));
            }).catch((e1) => console.log(e1));
          }
        });
      });
      if (i === users.length) {
        Flat.find().then((flats) => {
          console.log(`${flats.length} flats were successfully stored`);
          response.send({ flats });
        }).catch((e) => console.log(e));
      }
    });
  }).catch((e) => console.log(e));
});

app.listen(`${port}`, () => console.log(`Server up on port ${port}`));

const getPath = (city) => { //todo separate funcs to other file?
  const realty = categories['realty'];
  const rentFlat = realty['rentFlat'];
  const longTherm = rentFlat['longTherm'];
  return `${realty.path}${rentFlat.path}${longTherm.path}${city}`;
};

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

const insertBatchNewAds = (city, batchAdRefs, i, cb) => {
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
        city,
      }));
      groupAdsByUserPhones(_.clone(batchAds), null, (msg) => {
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
  const { phones: phonesForSearch, city } = ungroupedAds[0];
  const foundAds = ungroupedAds.filter((ad) => _.intersection(ad.phones, phonesForSearch).length > 0);
  User.findOne({ city, phones: { $in: phonesForSearch } })
    .then((res) => {
      const _id = (res && res._id) || new ObjectID();
      const ads = _.union((res && res.ads) || [], foundAds.map(({ ref }) => ref));
      const phones = _.union((res && res.phones) || [], phonesForSearch);
      User.update({ _id }, { $set: { city, phones, ads, adsCount: ads.length } }, { upsert: true })
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
