const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  location: {
    name: {
      type: String,
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    radius: {
      type: Number,
      default: 100 // meters
    }
  },
  supervisorId: {
    type: String,
    required: true
  },
  officers: [{
    userId: {
      type: String,
      required: true
    },
    name: String,
    badgeNumber: String,
    phone: String,
    email: String,
    status: {
      type: String,
      enum: ['assigned', 'checked-in', 'active', 'idle', 'out-of-zone', 'checked-out'],
      default: 'assigned'
    },
    checkInTime: Date,
    checkOutTime: Date
  }],
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  requiredOfficers: {
    type: Number,
    required: true
  },
  actualOfficers: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Geospatial index for location queries
eventSchema.index({ "location.coordinates": "2dsphere" });
eventSchema.index({ supervisorId: 1 });
eventSchema.index({ date: 1 });
eventSchema.index({ status: 1 });

module.exports = mongoose.model('Event', eventSchema);