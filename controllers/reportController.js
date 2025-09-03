const Report = require('../models/Report');
const Event = require('../models/Event');
const CheckIn = require('../models/CheckIn');
const aiService = require('../services/aiService');

const reportController = {
  // Generate performance report
  async generateReport(req, res) {
    try {
      if (req.user.role !== 'supervisor') {
        return res.status(403).json({ error: 'Supervisor access required' });
      }

      const { eventId } = req.params;
      
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (event.supervisorId !== req.user.supabaseId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if report already exists
      const existingReport = await Report.findOne({ eventId });
      if (existingReport) {
        return res.json({
          success: true,
          message: 'Report already exists',
          report: existingReport
        });
      }

      // Get all check-ins for this event
      const checkIns = await CheckIn.find({ eventId }).sort({ timestamp: 1 });

      // Calculate statistics
      const stats = calculateEventStatistics(event, checkIns);
      
      // Calculate officer performance
      const officerPerformance = calculateOfficerPerformance(event, checkIns);

      // Generate AI summary and recommendations
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
        recommendations: aiSummary.recommendations,
        generatedAt: new Date()
      });

      await report.save();

      res.json({
        success: true,
        message: 'Performance report generated successfully',
        report
      });

    } catch (error) {
      console.error('Generate report controller error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  },

  // Get all reports
  async getReports(req, res) {
    try {
      let query = {};
      
      if (req.user.role === 'supervisor') {
        query.generatedBy = req.user.supabaseId;
      } else {
        return res.status(403).json({ error: 'Supervisor access required' });
      }

      const reports = await Report.find(query)
        .populate('eventId', 'name date location status priority')
        .sort({ generatedAt: -1 })
        .limit(50);

      res.json({
        success: true,
        reports,
        count: reports.length
      });

    } catch (error) {
      console.error('Get reports controller error:', error);
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  },

  // Get single report
  async getReport(req, res) {
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
      console.error('Get report controller error:', error);
      res.status(500).json({ error: 'Failed to fetch report' });
    }
  }
};

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

  // Calculate average response time (time from event start to check-in)
  const responseTimeSum = event.officers.reduce((sum, officer) => {
    if (officer.checkInTime) {
      const eventStartTime = new Date(`${event.date.toDateString()} ${event.startTime}`);
      const checkInTime = new Date(officer.checkInTime);
      const responseTime = Math.max(0, (checkInTime - eventStartTime) / (1000 * 60)); // minutes
      return sum + responseTime;
    }
    return sum;
  }, 0);

  const avgResponseTime = attendedOfficers > 0 ? Math.round(responseTimeSum / attendedOfficers) : 0;

  return {
    totalOfficers,
    attendanceRate: totalOfficers > 0 ? Math.round((attendedOfficers / totalOfficers) * 100) : 0,
    averageResponseTime: avgResponseTime,
    totalIdleTime: idleAlerts * 10, // Estimate 10 minutes per idle alert
    zoneViolations,
    emergencyAlerts
  };
}

function calculateOfficerPerformance(event, checkIns) {
  const performance = [];

  event.officers.forEach(officer => {
    const officerCheckIns = checkIns.filter(ci => ci.officerId === officer.userId);
    
    const idleAlerts = officerCheckIns.reduce((count, checkIn) => 
      count + checkIn.alertsTriggered.filter(alert => alert.type === 'idle').length, 0
    );
    
    const zoneViolations = officerCheckIns.reduce((count, checkIn) => 
      count + checkIn.alertsTriggered.filter(alert => alert.type === 'out-of-zone').length, 0
    );

    // Calculate total duty time
    let totalDutyTime = 0;
    if (officer.checkInTime) {
      const endTime = officer.checkOutTime || new Date();
      totalDutyTime = Math.max(0, (endTime - new Date(officer.checkInTime)) / (1000 * 60));
    }

    // Calculate performance score (0-100)
    let performanceScore = 100;
    
    // Deduct points for issues
    if (!officer.checkInTime) {
      performanceScore -= 50; // Major penalty for not checking in
    }
    
    performanceScore -= idleAlerts * 5; // -5 points per idle alert
    performanceScore -= zoneViolations * 10; // -10 points per zone violation
    
    // Bonus for long duty time
    if (totalDutyTime > 240) { // More than 4 hours
      performanceScore += 5;
    }
    
    performanceScore = Math.max(0, Math.min(100, performanceScore));

    performance.push({
      officerId: officer.userId,
      name: officer.name,
      badgeNumber: officer.badgeNumber,
      attendance: !!officer.checkInTime,
      checkInTime: officer.checkInTime,
      checkOutTime: officer.checkOutTime,
      totalDutyTime: Math.round(totalDutyTime),
      idleAlerts,
      zoneViolations,
      performanceScore: Math.round(performanceScore)
    });
  });

  return performance.sort((a, b) => b.performanceScore - a.performanceScore);
}

module.exports = reportController;