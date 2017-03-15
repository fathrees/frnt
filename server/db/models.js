const mongoose = require('mongoose');

// todo schemes

const Ad = mongoose.model('Ad', {
  ref: {
    type: String,
    required: true,
    minlength: 1,
  },
  phones: {
    type: Array,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  title: {
    type: String,
  },
  createdAt: {
    type: Number,
    required: true,
  },
  price: {
    type: Number,
  },
  rooms: {
    type: Number,
    required: true,
  },
  wallType: {
    type: String,
  },
  description: {
    type: String,
  },
  isRealtorScale: {
    type: Number,
  },
  pics: {
    type: Array,
  },
});

const User = mongoose.model('User', {
  phones: {
    type: Array,
    required: true,
  },
  adRefs: {
    type: Array,
  },
  adsCount: {
    type: Number,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
});

module.exports = { Ad, User };
