const mongoose = require('mongoose');

const Ad = mongoose.model('Ad', {
  ref: {
    type: String,
    required: true,
    minlength: 1,
  },
  phones: {
    type: Array,
  },
});

const User = mongoose.model('User', {
  phones: {
    type: Array,
  },
  ads: {
    type: Array,
  },
});

module.exports = { Ad, User };