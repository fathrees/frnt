const mongoose = require('mongoose');

const Ad = mongoose.model('Ad', {
  ref: {
    type: String,
    required: true,
    minlength: 1,
  },
  phone: {
    type: String,
    trim: true,
  },
});

const User = mongoose.model('User', {
  _id: {
    type: String,
    required: true,
  },
  ads: {
    type: Array,
  },
});

module.exports = { Ad, User };