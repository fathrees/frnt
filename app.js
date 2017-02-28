const express = require('express');
const _ = require('lodash');

const { mongoose } = require('./db/mongoose');
const { Ad, User } = require('./db/models');
const { olx, categories, getPhone } = require( './olx/olx');

const app = express();
const port = process.env.PORT || 3000;

app.get('/olx/realtyRentFlatLong/:city', (req, response) => {
  const path = getPath(req.params.city);
  const promises = [];
  olx({ path }).then((resolveObj) => {
    for (let page = 2; page <= resolveObj.pages; page++) {
      promises.push(olx({ path, page }));
    }
    let allAdRefs;
    if (promises.length) {
      Promise.all(promises).then((resolvesArr) => {
        allAdRefs = _.uniq(resolveObj.cleanedAdRefs.concat(_.flatten(resolvesArr)));
        insertNewAds(allAdRefs, response);
      }).catch((e) => response.send(e));
    } else {
      allAdRefs = _.uniq(resolveObj);
      insertNewAds(allAdRefs, response);
    }
  }).catch((e) => response.send(e));
});

app.listen(`${port}`, () => console.log(`Server up on port ${port}`));

const getPath = (city) => { //todo separate funcs to other file
  const realty = categories['realty'];
  const rentFlat = realty['rentFlat'];
  const longTherm = rentFlat['longTherm'];
  return `${realty.path}${rentFlat.path}${longTherm.path}${city}`;
};

const getAdIdFromRef = (ref) => {
  const asIdRegex = new RegExp(/-ID(.+)\.html$/);
  const match = ref.match(asIdRegex);
  return match && match[1] || null;
};

const insertBatchNewAds = (newAdRefs, cb) => {
  const newAdObjs = newAdRefs.map(ref => {
    const olxAdId = getAdIdFromRef(ref);
    if (!olxAdId) {
      console.log(`'${ref}' doesn't has ID, check source of Olx`);
      return { ref };
    }
    const promisePhone = getPhone(olxAdId);
    return { ref, promisePhone};
  });
  Promise.all(newAdObjs.map((ad) => ad.promisePhone)).then((phones) => {
    const batchAds = phones.map((phone, i) => ({
      ref: newAdObjs[i].ref,
      phone,
    }));
    Ad.collection.insert(batchAds, cb);
  }).catch((e) => cb(e));
};

const insertNewAds = (receivedAdRefs, response) => {
  Ad.find().then((ads) => {
    const newAdRefs = _.difference(receivedAdRefs, ads.map(ad => ad.ref));
    if (newAdRefs.length) {
      insertBatchNewAds(newAdRefs, (err, res) => {
        console.log(err || `${res.insertedCount} new ads were successfully stored`);
        if (err) response.send({ err });
        else response.send(res.ops);
      });
    } else {
      console.log('No new ads');
      response.send('No new ads');
    }
  }).catch(e => console.log('Unable connect to db', e));
};
