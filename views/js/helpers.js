const hbs = require('hbs');

const toDate = (timestamp) => {
  const date = new Date(timestamp);
  let day = date.getDate();
  let month = date.getMonth();
  day = `${(day < 10 && '0') || ''}${day}`;
  month = `${(month < 10 && '0') || ''}${month}`;
  return `${day}.${month}.${date.getFullYear()}`;
};

const getBackgroundColorClass = (isRealtorScale) => {
  switch (isRealtorScale) {
    case 1 : return 'success';
    case 2 : return 'warning';
    default : return 'danger';
  }
};

module.exports = { toDate, getBackgroundColorClass };
