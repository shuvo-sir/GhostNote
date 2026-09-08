const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  text: { 
    type: String, 
    required: true 
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    // Note: MongoDB requires [longitude, latitude] order!
    coordinates: {
      type: [Number],
      required: true
    }
  },
  expiresAt: { 
    type: Date, 
    required: true 
  },
  // 👇 NEW: Track who dropped it
  deviceId: { 
    type: String, 
    required: true 
  },
  // 👇 NEW: Track how many times it was opened
  views: { 
    type: Number, 
    default: 0 
  }
});

// 1. Geospatial Index for map queries
noteSchema.index({ location: '2dsphere' });

// 2. TTL Index: MongoDB will auto-delete the document when 'expiresAt' is reached
noteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Note', noteSchema);