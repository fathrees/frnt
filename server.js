const express = require('express');
const timeout = require('connect-timeout');
const _ = require('lodash');
const { ObjectID } = require('mongodb');

const { mongoose } = require('./db/mongoose');
const { Ad, User } = require('./db/models');
const { olx, categories, getPhones } = require( './olx/olx');

const olxScrapTimeout = 3000000; // msec
const adsPerBatch = 10;// todo move to constants.js separated file
const batchDelay = 60000;// msec

const app = express();
const port = process.env.PORT || 3000;

// app.use(timeout(olxScrapTimeout));

app.get('/olx/realtyRentFlatLong/:city', (req, response) => {
  const keepAliveOps = `timeout=${olxScrapTimeout/1000}, max=1`;
  req.headers['Keep-Alive'] = keepAliveOps;
  req.headers['Connection'] = 'Keep-Alive';
  response.append('Keep-Alive', keepAliveOps);
  response.append('Connection', 'Keep-Alive');
  console.log('Gathering new ads started...');
  const path = getPath(req.params.city);
  const promises = [];
  olx({ path })
    .then((resolveObj) => {
      console.log('Scanning page 1');
      for (let page = 2; page <= resolveObj.pages; page++) {
        console.log(`Scanning page ${page}`);
        promises.push(olx({ path, page }));
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
});

app.get('/groupAdsByUserPhones', (req, response) => {
  Ad.find().then((ads) => {
    const ungroupedAds = _.clone(ads);
    groupAdsByUserPhones(ungroupedAds, response, null, { n: 0, nModified: 0 });
  }).catch((e) => console.log(e));
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
  const newAdObjs = batchAdRefs.map((ref, i) => {
    const olxAdId = getAdIdFromRef(ref);
    if (!olxAdId) {
      console.log(`'${ref}' doesn't has ID, check source of Olx`);
      return { ref };
    }
    const promisePhones = getPhones(olxAdId, i);
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
      }, { n: 0, nModified: 0 });
    }).catch((e) => cb(e));
};

const getAdIdFromRef = (ref) => {
  const adIdRegex = new RegExp(/-ID(.+)\.html$/);
  const match = ref.match(adIdRegex);
  return match && match[1] || null;
};

const groupAdsByUserPhones = (ungroupedAds, response, cb, nUpsertedUsers) => {
  const phonesForSearch = ungroupedAds[0].phones;
  const foundAds = ungroupedAds.filter((ad) => _.intersection(ad.phones, phonesForSearch).length > 0);
  let { n, nModified } = nUpsertedUsers;
  const msg = `${n} users created\n${nModified} users updated`;
  User.findOne({ phones: { $in: phonesForSearch } })
    .then((res) => {
      User.update(
        { _id: (res && res._id) || new ObjectID()},
        { $set: {
            phones: _.union((res && res.phones) || [], phonesForSearch),
            ads: _.union((res && res.adIds) || [], foundAds.map(({ ref }) => ref)),
        }},
        { upsert: true }
      ).then((res1) => {
        nModified += res1.nModified;
        n += res1.n - res1.nModified;
        _.pullAll(ungroupedAds, foundAds);
        if (ungroupedAds.length) groupAdsByUserPhones(ungroupedAds, response, cb, { n, nModified });
        else if (response) User.find().then((users) => response.send(users)).catch((e) => response.send(e));
        else cb(msg);
      }).catch((e) => console.log(e))
    }).catch((e) => console.log(e));
};
