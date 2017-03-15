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
    case 1 : return 'green-row';
    case 2 : return 'yellow-row';
    default : return 'red-row';
  }
};

module.exports = { toDate, getBackgroundColorClass };
