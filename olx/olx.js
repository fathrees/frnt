// import request from 'request';
// import cheerio from 'cheerio';

const request = require('request');
const cheerio = require('cheerio');

const categories = {
  'realty': {
    path: 'nedvizhimost/',
    'rentFlat': {
        path: 'arenda-kvartir/',
        'longTherm': {
            path: 'dolgosrochnaya-arenda-kvartir/',
        },
    },
  },
};

const getAdRefs = ($, ads) => {
  return ads.map(function() {
    return $(this).attr('href');
  }).get();
};

const olx = ({ rootPath = 'https://www.olx.ua/', path, url = `${rootPath}${path}`, adRefs = [], i }) => {

  return new Promise((resolve, reject) => {
    request(url, (err, res, html) => {
      if (err) reject(err);

      const $ = cheerio.load(html);
      const ads = i && $('.listHandler table#offers_table tr.wrap a.thumb')
        || $('.listHandler table tr.wrap a.thumb');
      adRefs.push(getAdRefs($, ads));
      const promises = [];
      // if (!i) {
      //   let i = 2;
      //   const pages = $('.pager .item').length;
      //   while (i <= pages) {
      //     promises.push(olx({ path, url: `${url}?page=${i}`, adRefs, i }));
      //     i++;
      //   }
      // }
      resolve(adRefs);
    });
  });
};


module.exports = {
  categories,
  olx,
};