const { categories } = require('../olx/constants');

const getPath = (city) => {
  const realty = categories['realty'];
  const rentFlat = realty['rentFlat'];
  const longTherm = rentFlat['longTherm'];
  return `${realty.path}${rentFlat.path}${longTherm.path}${city}`;
};

const getAdIdFromRef = (ref) => {
  const adIdRegex = new RegExp(/-ID(.+)\.html$/);
  const match = ref.match(adIdRegex);
  return match && match[1] || null;
};

module.exports = { getPath, getAdIdFromRef } ;
