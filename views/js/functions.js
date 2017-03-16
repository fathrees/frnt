const _ = require('lodash');

const getCitiesList = (cities, prevCity) => {
   let citiesList = _.without(cities, prevCity);
   citiesList.unshift(prevCity);
   return citiesList;
};

module.exports = { getCitiesList };

