const { olx, categories } = require( './olx/olx');
const express = require('express');
const _ = require('lodash');

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
  		res.send(allAdRefs);
  	});
  }).catch((e) => res.send(e));
}); 

app.listen(`${port}`);
console.log(`Server up on port ${port}`);