const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  generatedBy: {
    type: String,
    required: true // supervisorId
  },
  summary: {
    type: String,
    required: true // AI-generated summary
  },
  statistics: {
    totalOfficers: Number,
    attendanceRate: Number,
    averageResponseTime: Number,
    totalIdleTime: Number,
    zoneViolations: Number,
    emergencyAlerts: Number
  },
  officerPerformance: [{
    officerId: {
      type: String,
      required: true
    },
    name: String,
    badgeNumber: String,
    attendance: Boolean,
    checkInTime: Date,
    checkOutTime: Date,
    totalDutyTime: Number, // minutes
    idleAlerts: Number,
    zoneViolations: Number,
    performanceScore: Number, // 0-100
    notes: String
  }],
  recommendations: [String], // AI-generated recommendations
  generatedAt: {
    type: Date,
    default: Date.now
  },
  exportedAs: [{
    format: {
      type: String,
      enum: ['pdf', 'excel', 'csv']
    },
    exportedAt: {
      type: Date,
      default: Date.now
    },
    exportedBy: String
  }]
}, {
  timestamps: true
});

// Indexes
reportSchema.index({ eventId: 1 });
reportSchema.index({ generatedBy: 1 });
reportSchema.index({ generatedAt: -1 });

module.exports = mongoose.model('Report', reportSchema);