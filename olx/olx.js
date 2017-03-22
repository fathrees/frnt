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
      let price = $('.price-label strong').text().replace(/\s/g, '').match(/(\d+)(.+)/);
      price = { value: price[1], currency: price[2] };
      if (price.currency === '€') {
        price = price.value// todo currency
      }
      const pics = getTagsAtr($('.photo-glow img'), 'src');
      const content = { title, createdAt, rooms, wallType, description, price, pics };
      resolve(content);
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

module.exports = { olx, getPhones, getAdContent };
