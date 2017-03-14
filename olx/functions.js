const cheerio = require('cheerio');

const parseDate = (str) => {
  const date = str.match(/.+(\d{2}:\d{2}),\s+(\d+)\s+(.+)\s+(\d{4}),/);
  const rusMonths = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return new Date(`${rusMonths.indexOf(date[3]) + 1}/${date[2]}/${date[4]} ${date[1]}:00`).getTime();
};

const getAdRefs = (ads) => {
  const $ = cheerio;
  return ads.map(function() {
    return $(this).attr('href');
  }).get();
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

module.exports = { parseDate, getAdRefs, parsePhones };