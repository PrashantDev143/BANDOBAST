const mongoose = require('mongoose');

const checkInSchema = new mongoose.Schema({
  officerId: {
    type: String,
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  location: {
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    accuracy: Number,
    address: String
  },
  status: {
    type: String,
    enum: ['active', 'idle', 'out-of-zone', 'offline'],
    default: 'active'
  },
  batteryLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  notes: String,
  alertsTriggered: [{
    type: {
      type: String,
      enum: ['idle', 'out-of-zone', 'low-battery', 'emergency']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true
});

// Indexes for performance
checkInSchema.index({ officerId: 1, eventId: 1 });
checkInSchema.index({ eventId: 1 });
checkInSchema.index({ timestamp: -1 });
checkInSchema.index({ "location.coordinates": "2dsphere" });

module.exports = mongoose.model('CheckIn', checkInSchema);