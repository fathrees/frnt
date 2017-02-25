// import express from 'express';
// import { olx, categories } from './olx/olx';
// const bodyParser = require('body-parser');

const { olx, categories } = require( './olx/olx');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/olx/realtyRentFlatLong/:city', (req, res) => {
  const realty = categories['realty'];
  const rentFlat = realty['rentFlat'];
  const longTherm = rentFlat['longTherm'];
  const city = req.params.city;
  const path = `${realty.path}${rentFlat.path}${longTherm.path}${city}`;
  olx({ path }).then((adRefs) => {
    res.send({ adRefs });
  }).catch((e) => res.send(e));
});

app.listen(`${port}`);
console.log(`Server up on port ${port}`);