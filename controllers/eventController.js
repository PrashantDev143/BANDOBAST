const Event = require('../models/Event');
const User = require('../models/User');
const duplicateDetectionService = require('../services/duplicateDetection');
const notificationService = require('../services/notifications');

const eventController = {
  // Create new event
  async createEvent(req, res) {
    try {
      const {
        name,
        description,
        date,
        startTime,
        endTime,
        location,
        requiredOfficers,
        priority
      } = req.body;

      // Validate required fields
      if (!name || !date || !startTime || !endTime || !location || !requiredOfficers) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const event = new Event({
        name: name.trim(),
        description: description?.trim(),
        date: new Date(date),
        startTime,
        endTime,
        location: {
          name: location.name,
          coordinates: [location.longitude || 0, location.latitude || 0],
          radius: location.radius || 100
        },
        supervisorId: req.user.supabaseId,
        requiredOfficers: parseInt(requiredOfficers),
        priority: priority || 'medium',
        officers: [],
        actualOfficers: 0
      });

      await event.save();

      res.json({
        success: true,
        message: 'Event created successfully',
        event
      });

    } catch (error) {
      console.error('Create event controller error:', error);
      res.status(500).json({ error: 'Failed to create event' });
    }
  },

  // Get events for user
  async getEvents(req, res) {
    try {
      const { status, limit = 50 } = req.query;
      
      let query = {};
      
      if (req.user.role === 'supervisor') {
        query.supervisorId = req.user.supabaseId;
      } else {
        query['officers.userId'] = req.user.supabaseId;
      }
      
      if (status) {
        query.status = status;
      }

      const events = await Event.find(query)
        .sort({ date: -1 })
        .limit(parseInt(limit));

      res.json({
        success: true,
        events,
        count: events.length
      });

    } catch (error) {
      console.error('Get events controller error:', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  },

  // Get single event
  async getEvent(req, res) {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Check authorization
      const hasAccess = req.user.role === 'supervisor' 
        ? event.supervisorId === req.user.supabaseId
        : event.officers.some(officer => officer.userId === req.user.supabaseId);

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        success: true,
        event
      });

    } catch (error) {
      console.error('Get event controller error:', error);
      res.status(500).json({ error: 'Failed to fetch event' });
    }
  },

  // Update event status
  async updateEventStatus(req, res) {
    try {
      const { status } = req.body;
      const validStatuses = ['upcoming', 'active', 'completed', 'cancelled'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (event.supervisorId !== req.user.supabaseId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Update event status
      event.status = status;
      event.updatedAt = new Date();
      
      // Handle specific status changes
      if (status === 'active') {
        await notificationService.notifyEventStart(event);
      } else if (status === 'completed') {
        // Auto check-out all officers
        event.officers.forEach(officer => {
          if (['active', 'idle', 'checked-in'].includes(officer.status)) {
            officer.status = 'checked-out';
            officer.checkOutTime = new Date();
          }
        });
      }

      await event.save();

      res.json({
        success: true,
        message: `Event ${status} successfully`,
        event
      });

    } catch (error) {
      console.error('Update event status error:', error);
      res.status(500).json({ error: 'Failed to update event status' });
    }
  },

  // Start event
  async startEvent(req, res) {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (event.supervisorId !== req.user.supabaseId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (event.status !== 'upcoming') {
        return res.status(400).json({ error: 'Event cannot be started in current status' });
      }

      event.status = 'active';
      event.updatedAt = new Date();
      await event.save();

      // Notify all assigned officers
      if (event.officers.length > 0) {
        await notificationService.notifyEventStart(event);
      }

      res.json({
        success: true,
        message: 'Event started successfully',
        event
      });

    } catch (error) {
      console.error('Start event error:', error);
      res.status(500).json({ error: 'Failed to start event' });
    }
  },

  // End event
  async endEvent(req, res) {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (event.supervisorId !== req.user.supabaseId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      event.status = 'completed';
      event.updatedAt = new Date();
      
      // Update all active officers to checked-out
      event.officers.forEach(officer => {
        if (['active', 'idle', 'checked-in'].includes(officer.status)) {
          officer.status = 'checked-out';
          officer.checkOutTime = new Date();
        }
      });

      await event.save();

      res.json({
        success: true,
        message: 'Event ended successfully',
        event
      });

    } catch (error) {
      console.error('End event error:', error);
      res.status(500).json({ error: 'Failed to end event' });
    }
  }
};

module.exports = eventController;