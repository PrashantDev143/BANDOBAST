const CheckIn = require('../models/CheckIn');
const Event = require('../models/Event');
const User = require('../models/User');
const geoService = require('../services/geoService');
const notificationService = require('../services/notifications');

const officerController = {
  // Officer check-in
  async checkIn(req, res) {
    try {
      const { eventId, latitude, longitude, accuracy } = req.body;
      const officerId = req.user.supabaseId;

      // Validate input
      if (!eventId || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required location data' });
      }

      // Verify event exists and officer is assigned
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const assignedOfficer = event.officers.find(o => o.userId === officerId);
      if (!assignedOfficer) {
        return res.status(403).json({ error: 'You are not assigned to this event' });
      }

      if (assignedOfficer.status !== 'assigned') {
        return res.status(400).json({ error: 'You have already checked in' });
      }

      // Check if officer is within geofence
      const isInZone = geoService.isWithinGeofence(
        { latitude, longitude },
        event.location.coordinates,
        event.location.radius
      );

      // Create check-in record
      const checkIn = new CheckIn({
        officerId,
        eventId,
        location: {
          coordinates: [longitude, latitude],
          accuracy: accuracy || 0
        },
        status: isInZone ? 'active' : 'out-of-zone'
      });

      await checkIn.save();

      // Update officer status in event
      assignedOfficer.status = 'checked-in';
      assignedOfficer.checkInTime = new Date();
      await event.save();

      res.json({
        success: true,
        message: 'Check-in successful',
        checkIn,
        isInZone,
        warning: !isInZone ? 'You are outside the designated zone' : undefined
      });

    } catch (error) {
      console.error('Check-in controller error:', error);
      res.status(500).json({ error: 'Check-in failed' });
    }
  },

  // Update officer location
  async updateLocation(req, res) {
    try {
      const { eventId, latitude, longitude, accuracy, batteryLevel } = req.body;
      const officerId = req.user.supabaseId;

      // Get current event
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const officer = event.officers.find(o => o.userId === officerId);
      if (!officer) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check geofence
      const isInZone = geoService.isWithinGeofence(
        { latitude, longitude },
        event.location.coordinates,
        event.location.radius
      );

      // Get last check-in to determine status
      const lastCheckIn = await CheckIn.findOne({
        officerId,
        eventId
      }).sort({ timestamp: -1 });

      let status = 'active';
      const alerts = [];

      // Check for idle status (>10 minutes without significant movement)
      if (lastCheckIn) {
        const timeDiff = (Date.now() - lastCheckIn.timestamp) / (1000 * 60);
        const distance = lastCheckIn.location.coordinates 
          ? geoService.calculateDistance(
              { latitude, longitude },
              { 
                latitude: lastCheckIn.location.coordinates[1],
                longitude: lastCheckIn.location.coordinates[0]
              }
            )
          : 0;

        if (timeDiff > 10 && distance < 50) { // Less than 50 meters movement in 10+ minutes
          status = 'idle';
          alerts.push({ type: 'idle', timestamp: new Date() });
        }
      }

      // Check zone violation
      if (!isInZone) {
        status = 'out-of-zone';
        alerts.push({ type: 'out-of-zone', timestamp: new Date() });
      }

      // Check battery level
      if (batteryLevel && batteryLevel < 20) {
        alerts.push({ type: 'low-battery', timestamp: new Date() });
      }

      // Create new check-in
      const checkIn = new CheckIn({
        officerId,
        eventId,
        location: {
          coordinates: [longitude, latitude],
          accuracy: accuracy || 0
        },
        status,
        batteryLevel: batteryLevel || null,
        alertsTriggered: alerts
      });

      await checkIn.save();

      // Update officer status in event
      officer.status = status;
      await event.save();

      res.json({
        success: true,
        checkIn,
        isInZone,
        alerts: alerts.length > 0 ? alerts : undefined
      });

    } catch (error) {
      console.error('Location update controller error:', error);
      res.status(500).json({ error: 'Failed to update location' });
    }
  },

  // Get officer's current assignment
  async getAssignment(req, res) {
    try {
      const officerId = req.user.supabaseId;
      
      // Find active events for this officer
      const activeEvent = await Event.findOne({
        'officers.userId': officerId,
        status: { $in: ['upcoming', 'active'] }
      }).sort({ date: 1 });

      if (!activeEvent) {
        return res.json({
          success: true,
          assignment: null,
          message: 'No active assignments'
        });
      }

      // Get officer's details from the event
      const officerDetails = activeEvent.officers.find(o => o.userId === officerId);

      res.json({
        success: true,
        assignment: {
          event: activeEvent,
          officerStatus: officerDetails.status,
          checkInTime: officerDetails.checkInTime,
          checkOutTime: officerDetails.checkOutTime
        }
      });

    } catch (error) {
      console.error('Get assignment controller error:', error);
      res.status(500).json({ error: 'Failed to fetch assignment' });
    }
  },

  // Get officer tracking history
  async getTrackingHistory(req, res) {
    try {
      const { eventId } = req.params;
      const officerId = req.user.role === 'supervisor' 
        ? req.params.id 
        : req.user.supabaseId;

      // Verify access to event
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const hasAccess = req.user.role === 'supervisor' 
        ? event.supervisorId === req.user.supabaseId
        : event.officers.some(o => o.userId === req.user.supabaseId);

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const checkIns = await CheckIn.find({
        officerId,
        eventId
      }).sort({ timestamp: -1 }).limit(100);

      res.json({
        success: true,
        trackingData: checkIns,
        officer: event.officers.find(o => o.userId === officerId)
      });

    } catch (error) {
      console.error('Get tracking controller error:', error);
      res.status(500).json({ error: 'Failed to fetch tracking data' });
    }
  },

  // Get all officers (for supervisors)
  async getAllOfficers(req, res) {
    try {
      if (req.user.role !== 'supervisor') {
        return res.status(403).json({ error: 'Supervisor access required' });
      }

      const officers = await User.find({ 
        role: 'officer',
        isActive: true 
      }).select('name email phone badgeNumber department lastActive');

      res.json({
        success: true,
        officers
      });

    } catch (error) {
      console.error('Get officers controller error:', error);
      res.status(500).json({ error: 'Failed to fetch officers' });
    }
  }
};

module.exports = officerController;