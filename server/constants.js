const olxScrapTimeout = 3000000;// msec
const adsPerBatch = 10;
const batchDelay = 60000;// msec
const cities = ['ivano-frankovsk', 'ternopol']; // todo fill all cities
const flatSortFields = ['createdAt', 'rooms', 'price']; // todo add others flat sort fields

module.exports = { olxScrapTimeout, adsPerBatch, batchDelay, cities, flatSortFields };
