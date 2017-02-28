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
      const ads = $(`.listHandler table${page ? '#offers_table' : ''} tr.wrap a.thumb`);//todo check for "server banned" page and throw err instead "No new ads"
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

const getPhone = (olxAdId) => {
  return new Promise((resolve, reject) => {
    request({
      url: `https://www.olx.ua/ajax/misc/contact/phone/${olxAdId}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36',
      },
    }, (err, res, body) => {
      if (err) reject(err);
      resolve(JSON.parse(body).value); //todo throw err if body is html => server banned; needs to decrement frequency of request
    });
  });
};

module.exports = {
  categories,
  olx,
  getPhone,
};

//https://www.olx.ua/ajax/misc/contact/desc/qGRvE/