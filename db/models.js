const mongoose = require('mongoose');

const Ad = mongoose.model('Ad', {
  ref: {
    type: String,
    required: true,
    minlength: 1,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
});

module.exports = { Ad };