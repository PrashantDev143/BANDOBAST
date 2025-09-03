const express = require('express');
const CheckIn = require('../models/CheckIn');
const Event = require('../models/Event');
const authMiddleware = require('../middleware/auth');
const geoService = require('../services/geoService');

const router = express.Router();

// Officer check-in
router.post('/:id/checkin', authMiddleware, async (req, res) => {
  try {
    const { eventId, latitude, longitude, accuracy } = req.body;
    const officerId = req.user.supabaseId;

    // Verify event exists and officer is assigned
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const assignedOfficer = event.officers.find(o => o.userId === officerId);
    if (!assignedOfficer) {
      return res.status(403).json({ error: 'You are not assigned to this event' });
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
        accuracy
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
      isInZone
    });

  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// Update officer location
router.patch('/:id/location', authMiddleware, async (req, res) => {
  try {
    const { eventId, latitude, longitude, accuracy, batteryLevel } = req.body;
    const officerId = req.user.supabaseId;

    // Get current event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
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

    // Check for idle status (>10 minutes)
    if (lastCheckIn) {
      const timeDiff = (Date.now() - lastCheckIn.timestamp) / (1000 * 60);
      if (timeDiff > 10) {
        status = 'idle';
        alerts.push({ type: 'idle', timestamp: new Date() });
      }
    }

    // Check zone violation
    if (!isInZone) {
      status = 'out-of-zone';
      alerts.push({ type: 'out-of-zone', timestamp: new Date() });
    }

    // Create new check-in
    const checkIn = new CheckIn({
      officerId,
      eventId,
      location: {
        coordinates: [longitude, latitude],
        accuracy
      },
      status,
      batteryLevel,
      alertsTriggered: alerts
    });

    await checkIn.save();

    // Update officer status in event
    const officer = event.officers.find(o => o.userId === officerId);
    if (officer) {
      officer.status = status;
    }
    await event.save();

    res.json({
      success: true,
      checkIn,
      alerts: alerts.length > 0 ? alerts : undefined
    });

  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Get officer's current assignment
router.get('/:id/assignment', authMiddleware, async (req, res) => {
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
    console.error('Get assignment error:', error);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

// Get officer tracking history
router.get('/:id/tracking/:eventId', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const officerId = req.user.role === 'supervisor' 
      ? req.params.id 
      : req.user.supabaseId;

    const checkIns = await CheckIn.find({
      officerId,
      eventId
    }).sort({ timestamp: -1 }).limit(100);

    res.json({
      success: true,
      trackingData: checkIns
    });

  } catch (error) {
    console.error('Get tracking error:', error);
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

module.exports = router;