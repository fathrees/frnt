const express = require('express');
const _ = require('lodash');

const { mongoose } = require('./db/mongoose');
const { Ad } = require('./db/models');
const { olx, categories, getPhone } = require( './olx/olx');

const app = express();
const port = process.env.PORT || 3000;

const getPath = (city) => {
  const realty = categories['realty'];
  const rentFlat = realty['rentFlat'];
  const longTherm = rentFlat['longTherm'];
  return `${realty.path}${rentFlat.path}${longTherm.path}${city}`;
};

const getUserIdFromRef = (ref) => {
  const userIdRegex = new RegExp(/-ID(.+)\.html$/);
  return ref.match(userIdRegex)[1];
};

const insertBatchNewAds = (newAdRefs, cb) => {
  const newAdObjs = newAdRefs.map(ref => ({
  	olxUserId: getUserIdFromRef(ref),
    ref,
  }));
  Ad.collection.insert(newAdObjs, cb);
};

app.get('/olx/realtyRentFlatLong/:city', (req, res) => {
  const path = getPath(req.params.city);
  const promises = [];
  olx({ path }).then((resolveObj) => {
    for (let page = 2; page <= resolveObj.pages; page++) {
      promises.push(olx({ path, page }));
    }
    Promise.all(promises).then((resolvesArr) => {
      const allAdRefs = _.uniq(resolveObj.cleanedAdRefs.concat(_.flatten(resolvesArr)));

      Ad.find().then((ads) => {
        const newAdRefs = _.difference(allAdRefs, ads.map(ad => ad.ref));
        if (newAdRefs.length) {
          insertBatchNewAds(newAdRefs, (err, res1) => {
            console.log(err || `${res1.insertedCount} new ads were successfully stored`);
            if (err) res.send({ err, newAdRefs });
            else res.send({ newAdRefs });
          });
        } else {
          console.log('No new ads');
          res.send('No new ads');
        }
      }).catch(e => console.log('Unable connect to db', e));
    }).catch((e) => res.send(e));
  }).catch((e) => res.send(e));
});

app.listen(`${port}`, () => console.log(`Server up on port ${port}`));
