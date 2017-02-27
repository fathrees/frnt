const express = require('express');
const _ = require('lodash');

const { mongoose } = require('./db/mongoose');
const { Ad, User } = require('./db/models');
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
  	userId: getUserIdFromRef(ref),
    ref,
  }));
  Ad.collection.insert(newAdObjs, cb);
};

const upsertUsers = (ads, cb) => {
  let unfilteredAds = _.clone(ads);
  const promisedUsers = [];
  while (unfilteredAds.length) {
    const userId = unfilteredAds[0].userId;
    const userAds = _.remove(unfilteredAds, (ad) => ad.userId === userId);
    promisedUsers.push({
      userId,
      userAds,
      phone: getPhone(userId),
    });
  }
  Promise.all(promisedUsers.map((user) => user.phone)).then((phones) => {
    phones.forEach((phone, i) => {
      User.findOneAndUpdate({ _id: promisedUsers[i].userId }, { $set: {
        ads: promisedUsers[i].userAds,
        phone,
      }}, { upsert: true }, cb);
    });
  }).catch((e) => console.log(e));
};

app.get('/olx/realtyRentFlatLong/:city', (req, response) => {
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
          insertBatchNewAds(newAdRefs, (err, res) => {
            console.log(err || `${res.insertedCount} new ads were successfully stored`);
            if (!err) {
              upsertUsers(res.ops, (err1, res1) => {
                if (err1) response.send({ err1, newAdRefs });
                else response.send(res1);
              });
            }
          });
        } else {
          console.log('No new ads');
          response.send('No new ads');
        }
      }).catch(e => console.log('Unable connect to db', e));
    }).catch((e) => response.send(e));
  }).catch((e) => response.send(e));
});

app.listen(`${port}`, () => console.log(`Server up on port ${port}`));
