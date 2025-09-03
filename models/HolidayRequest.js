const mongoose = require('mongoose');

const holidayRequestSchema = new mongoose.Schema({
  officerId: {
    type: String,
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  proofFile: {
    filename: String,
    path: String,
    mimetype: String,
    size: Number
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  supervisorResponse: {
    supervisorId: String,
    responseDate: Date,
    comments: String
  },
  urgency: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
}, {
  timestamps: true
});

// Indexes
holidayRequestSchema.index({ officerId: 1 });
holidayRequestSchema.index({ eventId: 1 });
holidayRequestSchema.index({ status: 1 });
holidayRequestSchema.index({ requestDate: -1 });

module.exports = mongoose.model('HolidayRequest', holidayRequestSchema);