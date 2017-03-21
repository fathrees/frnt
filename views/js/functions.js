const _ = require('lodash');

const getListWithFirstItem = (list, item) => {
   let newList = _.without(list, item);
   newList.unshift(item);
   return newList;
};

module.exports = { getListWithFirstItem };
