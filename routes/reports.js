const express = require('express');
const Report = require('../models/Report');
const Event = require('../models/Event');
const CheckIn = require('../models/CheckIn');
const authMiddleware = require('../middleware/auth');
const aiService = require('../services/aiService');

const router = express.Router();

// Generate performance report
router.post('/:eventId/generate', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'supervisor') {
      return res.status(403).json({ error: 'Access denied. Supervisor role required.' });
    }

    const { eventId } = req.params;
    
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.supervisorId !== req.user.supabaseId) {
      return res.status(403).json({ error: 'Access denied to this event' });
    }

    // Get all check-ins for this event
    const checkIns = await CheckIn.find({ eventId });

    // Calculate statistics
    const stats = calculateEventStatistics(event, checkIns);
    
    // Calculate officer performance
    const officerPerformance = await calculateOfficerPerformance(event, checkIns);

    // Generate AI summary
    const aiSummary = await aiService.generatePerformanceSummary({
      event,
      statistics: stats,
      officerPerformance
    });

    // Create report
    const report = new Report({
      eventId,
      generatedBy: req.user.supabaseId,
      summary: aiSummary.summary,
      statistics: stats,
      officerPerformance,
      recommendations: aiSummary.recommendations
    });

    await report.save();

    res.json({
      success: true,
      message: 'Report generated successfully',
      report
    });

  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get reports
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'supervisor') {
      query.generatedBy = req.user.supabaseId;
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const reports = await Report.find(query)
      .populate('eventId', 'name date location status')
      .sort({ generatedAt: -1 });

    res.json({
      success: true,
      reports
    });

  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Get single report
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('eventId');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check access
    if (req.user.role !== 'supervisor' || report.generatedBy !== req.user.supabaseId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Helper functions
function calculateEventStatistics(event, checkIns) {
  const totalOfficers = event.officers.length;
  const attendedOfficers = event.officers.filter(o => 
    o.status !== 'assigned' && o.checkInTime
  ).length;
  
  const idleAlerts = checkIns.reduce((count, checkIn) => 
    count + checkIn.alertsTriggered.filter(alert => alert.type === 'idle').length, 0
  );
  
  const zoneViolations = checkIns.reduce((count, checkIn) => 
    count + checkIn.alertsTriggered.filter(alert => alert.type === 'out-of-zone').length, 0
  );

  const emergencyAlerts = checkIns.reduce((count, checkIn) => 
    count + checkIn.alertsTriggered.filter(alert => alert.type === 'emergency').length, 0
  );

  return {
    totalOfficers,
    attendanceRate: totalOfficers > 0 ? (attendedOfficers / totalOfficers) * 100 : 0,
    averageResponseTime: calculateAverageResponseTime(event.officers),
    totalIdleTime: calculateTotalIdleTime(checkIns),
    zoneViolations,
    emergencyAlerts
  };
}

async function calculateOfficerPerformance(event, checkIns) {
  const performance = [];

  for (const officer of event.officers) {
    const officerCheckIns = checkIns.filter(ci => ci.officerId === officer.userId);
    
    const idleAlerts = officerCheckIns.reduce((count, checkIn) => 
      count + checkIn.alertsTriggered.filter(alert => alert.type === 'idle').length, 0
    );
    
    const zoneViolations = officerCheckIns.reduce((count, checkIn) => 
      count + checkIn.alertsTriggered.filter(alert => alert.type === 'out-of-zone').length, 0
    );

    const totalDutyTime = officer.checkInTime && officer.checkOutTime
      ? (new Date(officer.checkOutTime) - new Date(officer.checkInTime)) / (1000 * 60)
      : 0;

    // Calculate performance score (0-100)
    let performanceScore = 100;
    performanceScore -= idleAlerts * 5; // -5 points per idle alert
    performanceScore -= zoneViolations * 10; // -10 points per zone violation
    performanceScore = Math.max(0, performanceScore); // Minimum 0

    performance.push({
      officerId: officer.userId,
      name: officer.name,
      badgeNumber: officer.badgeNumber,
      attendance: officer.status !== 'assigned',
      checkInTime: officer.checkInTime,
      checkOutTime: officer.checkOutTime,
      totalDutyTime,
      idleAlerts,
      zoneViolations,
      performanceScore
    });
  }

  return performance;
}

function calculateAverageResponseTime(officers) {
  const responseTimes = officers
    .filter(o => o.checkInTime)
    .map(o => {
      const assignedTime = new Date(o.assignedTime || Date.now());
      const checkInTime = new Date(o.checkInTime);
      return checkInTime - assignedTime;
    });

  if (responseTimes.length === 0) return 0;
  
  const average = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  return Math.round(average / (1000 * 60)); // Return in minutes
}

function calculateTotalIdleTime(checkIns) {
  return checkIns.reduce((total, checkIn) => {
    if (checkIn.status === 'idle') {
      return total + 10; // Each idle status represents ~10 minutes
    }
    return total;
  }, 0);
}

module.exports = router;