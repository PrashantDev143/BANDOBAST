const Event = require('../models/Event');
const User = require('../models/User');

const duplicateDetectionService = {
  // Check if officer is already assigned to another event on the same date
  async checkDuplicateOfficer(badgeNumber, eventDate) {
    try {
      // Find officer by badge number
      const officer = await User.findOne({ badgeNumber });
      if (!officer) {
        return { isDuplicate: false, reason: 'Officer not found' };
      }

      // Check for overlapping events on the same date
      const startOfDay = new Date(eventDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(eventDate);
      endOfDay.setHours(23, 59, 59, 999);

      const conflictingEvents = await Event.find({
        date: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        'officers.userId': officer.supabaseId,
        status: { $in: ['upcoming', 'active'] }
      });

      if (conflictingEvents.length > 0) {
        return {
          isDuplicate: true,
          reason: 'Officer already assigned to another event on this date',
          conflictingEvents: conflictingEvents.map(event => ({
            id: event._id,
            name: event.name,
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime
          }))
        };
      }

      return { isDuplicate: false };

    } catch (error) {
      console.error('Duplicate detection error:', error);
      return { isDuplicate: false, error: error.message };
    }
  },

  // Analyze officer workload for AI recommendations
  async analyzeOfficerWorkload(officerId, dateRange) {
    try {
      const events = await Event.find({
        'officers.userId': officerId,
        date: {
          $gte: new Date(dateRange.start),
          $lte: new Date(dateRange.end)
        }
      });

      const analysis = {
        totalEvents: events.length,
        completedEvents: events.filter(e => e.status === 'completed').length,
        cancelledEvents: events.filter(e => e.status === 'cancelled').length,
        upcomingEvents: events.filter(e => e.status === 'upcoming').length,
        workloadScore: this.calculateWorkloadScore(events)
      };

      return analysis;

    } catch (error) {
      console.error('Workload analysis error:', error);
      return null;
    }
  },

  // Calculate workload score (0-100, where 100 is overloaded)
  calculateWorkloadScore(events) {
    const baseScore = Math.min(events.length * 10, 70); // Max 70 for event count
    
    const highPriorityEvents = events.filter(e => 
      e.priority === 'high' || e.priority === 'critical'
    ).length;
    
    const priorityScore = Math.min(highPriorityEvents * 5, 30); // Max 30 for priority
    
    return Math.min(baseScore + priorityScore, 100);
  },

  // Detect potential scheduling conflicts
  async detectSchedulingConflicts(supervisorId) {
    try {
      const upcomingEvents = await Event.find({
        supervisorId,
        status: 'upcoming',
        date: { $gte: new Date() }
      }).sort({ date: 1 });

      const conflicts = [];

      for (let i = 0; i < upcomingEvents.length; i++) {
        for (let j = i + 1; j < upcomingEvents.length; j++) {
          const event1 = upcomingEvents[i];
          const event2 = upcomingEvents[j];

          // Check for officer overlaps on same day
          const sameDay = event1.date.toDateString() === event2.date.toDateString();
          
          if (sameDay) {
            const commonOfficers = event1.officers.filter(officer1 =>
              event2.officers.some(officer2 => officer2.userId === officer1.userId)
            );

            if (commonOfficers.length > 0) {
              conflicts.push({
                event1: { id: event1._id, name: event1.name, date: event1.date },
                event2: { id: event2._id, name: event2.name, date: event2.date },
                conflictingOfficers: commonOfficers,
                type: 'officer_overlap'
              });
            }
          }
        }
      }

      return conflicts;

    } catch (error) {
      console.error('Conflict detection error:', error);
      return [];
    }
  }
};

module.exports = duplicateDetectionService;