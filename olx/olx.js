const request = require('request');
const cheerio = require('cheerio');

const { parseDate, getTagsAtr, parsePhones } = require('./functions');

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
      reject('Server banned by Olx :( Change code to prevent future ban or try 10 min later');
      return null;
    }
    if (!html) {
      tryOlxAdsRequest(url, resolve, reject, page);
      return null;
    }
    const $ = cheerio.load(html);
    const ads = $('.listHandler table tr.wrap a.thumb');
    const adRefs = getTagsAtr(ads, 'href');
    const cleanedAdRefs = adRefs.map((ref) => ref.replace(/.html#.+$/, '.html'));
    if (!page) {
      const pages = $('.pager .item').length;
      if (pages >= 2) resolve({ cleanedAdRefs, pages });
    }
    resolve(cleanedAdRefs);
  });
};

const getAdContent = (ref) => {
  return new Promise((resolve, reject) => {
    request(ref, (err, res, html) => {
      if (err) {
        console.log(err);
        reject(err);
        return null;
      }
      if (res && res.statusCode === 403) {
        reject('Server banned by Olx :( Change code to prevent future ban or try 10 min later');
        return null;
      }
      const $ = cheerio.load(html);
      const offerDescription = $('div#offerdescription');
      const titleBox = offerDescription.children('div.offer-titlebox');
      let createdAt;
      try {
        createdAt = parseDate(titleBox.find('div.offer-titlebox__details em').text());
      } catch (e) {
        reject(`${ref} outdated`);
        return null;
      }
      const title = titleBox.children('h1').text().trim();
      const descriptionContent = offerDescription.children('div.descriptioncontent').children();
      const details = descriptionContent.first().children().last().children();
      const rooms = + details.first().find('table.item strong').text();
      const wallType = details.last().find('table.item a').text().trim();
      const description = descriptionContent.last().text().trim();
      const pics = getTagsAtr($('.photo-glow img'), 'src');
      const content = { title, createdAt, rooms, wallType, description, pics };
      let price = $('.price-label strong').text().replace(/\s/g, '').match(/(\d+)(.+)/);
      if (price) {
        getPriceInUAH(ref, { value: price[1], currency: price[2] }).then((resPrice) => {
          content.price = resPrice;
          resolve(content);
        }).catch((e) => reject(e));
      } else reject('Price was not found');
    });
  })
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

const getPriceInUAH = (ref, { value, currency }) => {
  return new Promise((resolve, reject) => {
    if (currency === 'грн.') {
      resolve(+value);
      return null;
    }
    const urlStart = 'https://query.yahooapis.com/v1/public/yql?q=select+*+from+yahoo.finance.xchange+where+pair+=+%22';
    const urlEnd = '%22&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=';
    let pair;
    if (currency === '$') pair = 'USDUAH';
    if (currency === '€') pair = 'EURUAH';
    if (!pair) {
      console.log(`Currency at ${ref} was not detected!`);
      resolve(null);
      return null;
    }
    request({ url: `${urlStart}${pair}${urlEnd}` }, (err, response, body) => {
      if (err) {
        reject(err);
        return null;
      }
      const rate = JSON.parse(body).query.results.rate.Rate;
      resolve(Math.round(value * rate));
    });
  });
};

module.exports = { olx, getPhones, getAdContent };
