const express = require('express');
const timeout = require('connect-timeout');
const _ = require('lodash');

const { mongoose } = require('./db/mongoose');
const { Ad, User } = require('./db/models');
const { olx, categories, getPhones } = require( './olx/olx');

const app = express();
const port = process.env.PORT || 3000;

app.use(timeout(15000000));

app.get('/olx/realtyRentFlatLong/:city', (req, response) => {
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
      const adPerBatch = 10;
      const batchesAdRefs = _.chunk(newAdRefs, adPerBatch);
      let insertedAds = [];
      let isErr;
      let i = 0;
      while (!isErr && i < batchesAdRefs.length) {
        const delay = (i && 300000) || 0;
        setTimeout(insertBatchNewAds, delay, batchesAdRefs[i], (err, res) => {
            if (isErr) {
              response.send('Server banned');
              return null;
            }
            console.log(err || `${res.insertedCount} new ads were successfully stored`);
            if (err) {
              response.send(err);
              isErr = true;
            } else {
              insertedAds = insertedAds.concat(res.ops);
              if (insertedAds.length === newAdRefs.length) response.send(insertedAds);
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

const insertBatchNewAds = (batchAdRefs, cb) => {
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
      Ad.collection.insert(batchAds, cb);
    }).catch((e) => cb(e));
};

const getAdIdFromRef = (ref) => {
  const asIdRegex = new RegExp(/-ID(.+)\.html$/);
  const match = ref.match(asIdRegex);
  return match && match[1] || null;
};
