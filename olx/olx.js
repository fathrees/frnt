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
      let adRefs = getAdRefs($, ads);
      const cleanedAdRefs = adRefs.map((ref) => ref.replace(/.html#.+$/, '.html'));
      if (!page) {
        const pages = $('.pager .item').length;
        if (pages >= 2) resolve({ cleanedAdRefs, pages })
      }
      resolve(cleanedAdRefs);
    });
  });
};

const getPhone = (userId) => {
  return new Promise((resolve, reject) => {
    request(`https://www.olx.ua/ajax/misc/contact/phone/${userId}`, (err, res, body) => {
      if (err) reject(err);
      resolve(body.value);
    });
  });
};

module.exports = {
  categories,
  olx,
  getPhone,
};

//https://www.olx.ua/ajax/misc/contact/phone/qGRvE/
//https://www.olx.ua/ajax/misc/contact/desc/qGRvE/