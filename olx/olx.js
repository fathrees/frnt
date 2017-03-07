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

const olx = ({ rootPath = 'https://www.olx.ua/', path, page }) => {
  return new Promise((resolve, reject) => {
    const url = `${rootPath}${path}${page ? `?page=${page}`: ''}`;
    tryOlxAdsRequest(url, resolve, reject, page);
  });
};

const tryOlxAdsRequest = (url, resolve, reject, page) => {
  request(url, (err, res, html) => {
    if (err) {
      reject(err);
      return null;
    }
    if (res && res.statusCode === 403) {
      reject('Server banned by Olx :( Change code to prevent ban or try 10 min later');
      return null;
    }
    if (!html) {
      tryOlxAdsRequest(url, resolve, reject, page);
      return null;
    }
    const $ = cheerio.load(html);
    const ads = $('.listHandler table tr.wrap a.thumb');
    const adRefs = getAdRefs(ads);
    const cleanedAdRefs = adRefs.map((ref) => ref.replace(/.html#.+$/, '.html'));
    if (!page) {
      const pages = $('.pager .item').length;
      if (pages >= 2) resolve({ cleanedAdRefs, pages });
    }
    resolve(cleanedAdRefs);
  });
};

const getAdRefs = (ads) => {
  const $ = cheerio;
  return ads.map(function() {
    return $(this).attr('href');
  }).get();
};

const getPhones = (olxAdId) => {
  return new Promise((resolve, reject) => {
    request({
      url: `https://www.olx.ua/ajax/misc/contact/phone/${olxAdId}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36',
      }},
      (err, res, body) => {
        if (res && res.statusCode === 403) {
          reject(`Server banned by Olx on getting phone from ad (olxAdId: ${olxAdId}). Change code to prevent ban or try 10 min later`);
        } else if (res.headers['content-type'] === 'text/html; charset=utf-8') {
          console.log(`Request for phone of ad (olxAdId: ${olxAdId}) had error`);
          resolve([null]);
        } else {
          const phonesStr = JSON.parse(body).value;
          const phones = parsePhones(phonesStr);
          resolve(phones);
        }
      });
  });
};

const parsePhones = (phonesStr) => {
  const regex = /\s*<span\s+class\s*=\s*"\s*block\s*"\s*>([\d\s+()-]*)/g;
  const phones = [];
  let matchArr;
  while ((matchArr = regex.exec(phonesStr)) !== null) {
    phones.push(cleanPhone(matchArr[1]));
  }
  if (!phones.length) {
    phones.push(cleanPhone(phonesStr));
  }
  return phones;
};

const cleanPhone = (phone) => phone.replace(/(\+38|^\s*8|\s|-|\(|\))/g, '');

module.exports = {
  categories,
  olx,
  getPhones,
};

//https://www.olx.ua/ajax/misc/contact/desc/{adId}/ - get nums from ad description
//https://www.olx.ua/ajax/misc/contact/phone/{adId}/ -get phones from "show phone" btn