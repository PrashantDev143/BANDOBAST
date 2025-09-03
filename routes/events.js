const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const Event = require('../models/Event');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const duplicateDetectionService = require('../services/duplicateDetection');
const notificationService = require('../services/notifications');

const router = express.Router();

// Configure multer for Excel file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});

// Create new event
router.post('/', authMiddleware, async (req, res) => {
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

    const event = new Event({
      name,
      description,
      date: new Date(date),
      startTime,
      endTime,
      location: {
        name: location.name,
        coordinates: [location.longitude, location.latitude],
        radius: location.radius || 100
      },
      supervisorId: req.user.supabaseId,
      requiredOfficers,
      priority: priority || 'medium'
    });

    await event.save();

    res.json({
      success: true,
      message: 'Event created successfully',
      event
    });

  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Get all events for supervisor
router.get('/', authMiddleware, async (req, res) => {
  try {
    const query = req.user.role === 'supervisor' 
      ? { supervisorId: req.user.supabaseId }
      : { 'officers.userId': req.user.supabaseId };

    const events = await Event.find(query)
      .sort({ date: -1 })
      .limit(50);

    res.json({
      success: true,
      events
    });

  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get single event
router.get('/:id', authMiddleware, async (req, res) => {
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
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Upload Excel file with officers
router.post('/:id/upload', authMiddleware, upload.single('officerList'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the supervisor of this event
    if (event.supervisorId !== req.user.supabaseId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Parse Excel file
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Process officer data
    const officers = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      try {
        // Validate required fields
        if (!row.name || !row.badgeNumber || !row.phone || !row.email) {
          errors.push(`Row ${i + 1}: Missing required fields`);
          continue;
        }

        // Check for duplicate badge numbers
        const duplicateCheck = await duplicateDetectionService.checkDuplicateOfficer(
          row.badgeNumber,
          event.date
        );

        if (duplicateCheck.isDuplicate) {
          errors.push(`Row ${i + 1}: Officer ${row.badgeNumber} already assigned to another event on this date`);
          continue;
        }

        officers.push({
          userId: row.userId || `temp_${Date.now()}_${i}`,
          name: row.name.trim(),
          badgeNumber: row.badgeNumber.trim(),
          phone: row.phone.trim(),
          email: row.email.trim().toLowerCase(),
          status: 'assigned'
        });

      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    // Update event with officers
    event.officers = officers;
    event.actualOfficers = officers.length;
    event.updatedAt = new Date();
    
    await event.save();

    // Send notifications to officers
    try {
      await notificationService.notifyOfficersAssignment(event, officers);
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.json({
      success: true,
      message: `${officers.length} officers added successfully`,
      officers,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process officer list' });
  }
});

// Start event
router.patch('/:id/start', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.supervisorId !== req.user.supabaseId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    event.status = 'active';
    event.updatedAt = new Date();
    await event.save();

    // Notify all assigned officers
    await notificationService.notifyEventStart(event);

    res.json({
      success: true,
      message: 'Event started successfully',
      event
    });

  } catch (error) {
    console.error('Start event error:', error);
    res.status(500).json({ error: 'Failed to start event' });
  }
});

// End event
router.patch('/:id/end', authMiddleware, async (req, res) => {
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
      if (officer.status === 'active' || officer.status === 'idle') {
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
});

module.exports = router;