const express = require('express');
const _ = require('lodash');

const { olx, categories } = require( './olx/olx');

const { mongoose } = require('./db/mongoose');
const { Ad } = require('./db/models');

const app = express();
const port = process.env.PORT || 3000;

app.get('/olx/realtyRentFlatLong/:city', (req, res) => {
  const realty = categories['realty'];
  const rentFlat = realty['rentFlat'];
  const longTherm = rentFlat['longTherm'];
  const city = req.params.city;
  const path = `${realty.path}${rentFlat.path}${longTherm.path}${city}`;
  const promises = []; 
  olx({ path }).then((resolveObj) => {
  	for (let page = 2; page <= resolveObj.pages; page++) {
  		promises.push(olx({ path, page }));	
  	}
  	Promise.all(promises).then((resolvesArr) => {
  		const allAdRefs = resolveObj.adRefs.concat(_.flatten(resolvesArr));
  		Ad.find().then((ads) => {
  			const newAdRefs = _.difference(allAdRefs, ads.map(ad => ad.ref));
  			if (newAdRefs.length) {
  				const newAdObjs = newAdRefs.map(ref => ({ ref }));
  				Ad.collection.insert(newAdObjs, (err, res1) => {
  					console.log(!err && `${res1.insertedCount} new ads were successfully stored`);
  				});
  			} else console.log('No new ads');
  		}).catch(e => console.log('Unable connect to db', e));
  		res.send(allAdRefs);
  	}).catch((e) => res.send(e));
  }).catch((e) => res.send(e));
}); 

app.listen(`${port}`);
console.log(`Server up on port ${port}`);

//https://www.olx.ua/ajax/misc/contact/phone/qGRvE/
//https://www.olx.ua/ajax/misc/contact/desc/qGRvE/