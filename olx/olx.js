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

const olx = ({ rootPath = 'https://www.olx.ua/', path, page }) => {
  return new Promise((resolve, reject) => {
    const url = `${rootPath}${path}${page ? `?page=${page}`: ''}`;
    request(url, (err, res, html) => {
      if (err) reject(err);
      const $ = cheerio.load(html);
      const ads = $(`.listHandler table${page ? '#offers_table' : ''} tr.wrap a.thumb`);
      const adRefs = getAdRefs($, ads);
      if (!page) {
        const pages = $('.pager .item').length;
        if (pages >= 2) resolve({ adRefs, pages })
      }
      resolve(adRefs);
    });
  });
};


module.exports = {
  categories,
  olx,
};