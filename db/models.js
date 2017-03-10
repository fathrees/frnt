const mongoose = require('mongoose');

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
});

const User = mongoose.model('User', {
  phones: {
    type: Array,
    required: true,
  },
  ads: {
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

const Flat = mongoose.model('Flat', {
  title: {
    type: String,
  },
  createdAt: {
    type: Number,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  usersId: {
    type: Array,
    required: true,
  },
  usersCount: {
    type: Number,
    required: true,
  },
  price: {
    type: Object,
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
  }
});

module.exports = { Ad, User, Flat };
