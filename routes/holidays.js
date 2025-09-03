const express = require('express');
const multer = require('multer');
const HolidayRequest = require('../models/HolidayRequest');
const Event = require('../models/Event');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Configure multer for proof file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/holiday-proofs/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});

// Submit holiday request
router.post('/', authMiddleware, upload.single('proofFile'), async (req, res) => {
  try {
    const { eventId, reason, urgency } = req.body;
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

    // Check if already has pending request
    const existingRequest = await HolidayRequest.findOne({
      officerId,
      eventId,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'You already have a pending request for this event' });
    }

    // Create holiday request
    const holidayRequest = new HolidayRequest({
      officerId,
      eventId,
      reason,
      urgency: urgency || 'medium',
      proofFile: req.file ? {
        filename: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : undefined
    });

    await holidayRequest.save();

    res.json({
      success: true,
      message: 'Holiday request submitted successfully',
      request: holidayRequest
    });

  } catch (error) {
    console.error('Holiday request error:', error);
    res.status(500).json({ error: 'Failed to submit holiday request' });
  }
});

// Get holiday requests (for supervisor)
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'supervisor') {
      // Get requests for supervisor's events
      const supervisorEvents = await Event.find({ 
        supervisorId: req.user.supabaseId 
      }).select('_id');
      const eventIds = supervisorEvents.map(e => e._id);
      query.eventId = { $in: eventIds };
    } else {
      // Officer can only see their own requests
      query.officerId = req.user.supabaseId;
    }

    const requests = await HolidayRequest.find(query)
      .populate('eventId', 'name date location')
      .sort({ requestDate: -1 });

    res.json({
      success: true,
      requests
    });

  } catch (error) {
    console.error('Get holiday requests error:', error);
    res.status(500).json({ error: 'Failed to fetch holiday requests' });
  }
});

// Approve/reject holiday request (supervisor only)
router.patch('/:id/respond', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'supervisor') {
      return res.status(403).json({ error: 'Access denied. Supervisor role required.' });
    }

    const { status, comments } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await HolidayRequest.findById(req.params.id)
      .populate('eventId');

    if (!request) {
      return res.status(404).json({ error: 'Holiday request not found' });
    }

    // Verify supervisor has access to this event
    if (request.eventId.supervisorId !== req.user.supabaseId) {
      return res.status(403).json({ error: 'Access denied to this request' });
    }

    // Update request
    request.status = status;
    request.supervisorResponse = {
      supervisorId: req.user.supabaseId,
      responseDate: new Date(),
      comments: comments || ''
    };

    await request.save();

    // If approved, remove officer from event
    if (status === 'approved') {
      const event = await Event.findById(request.eventId._id);
      event.officers = event.officers.filter(o => o.userId !== request.officerId);
      event.actualOfficers = event.officers.length;
      await event.save();
    }

    res.json({
      success: true,
      message: `Holiday request ${status} successfully`,
      request
    });

  } catch (error) {
    console.error('Holiday response error:', error);
    res.status(500).json({ error: 'Failed to respond to holiday request' });
  }
});

module.exports = router;