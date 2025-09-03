const CheckIn = require('../models/CheckIn');
const Event = require('../models/Event');
const notificationService = require('../services/notifications');
const geoService = require('../services/geoService');

const socketHandler = (io) => {
  // Store connected users
  const connectedUsers = new Map();
  
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User joins with their ID and role
    socket.on('join', (userData) => {
      connectedUsers.set(socket.id, userData);
      
      // Join role-specific rooms
      socket.join(userData.role);
      
      if (userData.eventId) {
        socket.join(`event_${userData.eventId}`);
      }
      
      console.log(`${userData.name} (${userData.role}) joined`);
    });

    // Officer location updates
    socket.on('locationUpdate', async (data) => {
      try {
        const { eventId, latitude, longitude, accuracy, batteryLevel } = data;
        const user = connectedUsers.get(socket.id);
        
        if (!user || user.role !== 'officer') {
          return;
        }

        const event = await Event.findById(eventId);
        if (!event) {
          socket.emit('error', { message: 'Event not found' });
          return;
        }

        // Check geofence
        const isInZone = geoService.isWithinGeofence(
          { latitude, longitude },
          event.location.coordinates,
          event.location.radius
        );

        // Get last location to check for movement
        const lastCheckIn = await CheckIn.findOne({
          officerId: user.supabaseId,
          eventId
        }).sort({ timestamp: -1 });

        let status = 'active';
        const alerts = [];

        // Check for idle status (no movement for >10 minutes)
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
            
            // Send idle notification
            const officer = event.officers.find(o => o.userId === user.supabaseId);
            if (officer) {
              await notificationService.sendIdleAlert(officer, event);
            }
          }
        }

        // Check zone violation
        if (!isInZone) {
          status = 'out-of-zone';
          alerts.push({ type: 'out-of-zone', timestamp: new Date() });

          // Send zone violation alert if out for >5 minutes
          if (lastCheckIn && lastCheckIn.status === 'out-of-zone') {
            const outOfZoneTime = (Date.now() - lastCheckIn.timestamp) / (1000 * 60);
            if (outOfZoneTime > 5) {
              const officer = event.officers.find(o => o.userId === user.supabaseId);
              if (officer) {
                await notificationService.sendZoneViolationAlert(officer, event);
              }
            }
          }
        }

        // Save location update
        const checkIn = new CheckIn({
          officerId: user.supabaseId,
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
        const officer = event.officers.find(o => o.userId === user.supabaseId);
        if (officer) {
          officer.status = status;
        }
        await event.save();

        // Broadcast to supervisors monitoring this event
        socket.to(`event_${eventId}`).emit('officerLocationUpdate', {
          officerId: user.supabaseId,
          name: user.name,
          badgeNumber: user.badgeNumber,
          location: { latitude, longitude },
          status,
          timestamp: new Date(),
          batteryLevel,
          alerts
        });

        // Send acknowledgment to officer
        socket.emit('locationUpdateAck', {
          status,
          isInZone,
          alerts
        });

      } catch (error) {
        console.error('Location update error:', error);
        socket.emit('error', { message: 'Failed to update location' });
      }
    });

    // Emergency alert
    socket.on('emergency', async (data) => {
      try {
        const { eventId, latitude, longitude, message } = data;
        const user = connectedUsers.get(socket.id);
        
        if (!user || user.role !== 'officer') {
          return;
        }

        const event = await Event.findById(eventId);
        if (!event) {
          return;
        }

        const officer = event.officers.find(o => o.userId === user.supabaseId);
        const location = await geoService.reverseGeocode(latitude, longitude);

        // Save emergency check-in
        const emergencyCheckIn = new CheckIn({
          officerId: user.supabaseId,
          eventId,
          location: {
            coordinates: [longitude, latitude],
            address: location.address
          },
          status: 'active',
          alertsTriggered: [{
            type: 'emergency',
            timestamp: new Date()
          }],
          notes: message || 'Emergency alert triggered'
        });

        await emergencyCheckIn.save();

        // Send emergency notifications
        await notificationService.sendEmergencyAlert(officer, event, location);

        // Broadcast emergency to all supervisors
        io.to('supervisor').emit('emergency', {
          eventId,
          officer: {
            id: user.supabaseId,
            name: user.name,
            badgeNumber: user.badgeNumber
          },
          location: { latitude, longitude, address: location.address },
          message,
          timestamp: new Date()
        });

        socket.emit('emergencyAck', {
          message: 'Emergency alert sent successfully',
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Emergency alert error:', error);
        socket.emit('error', { message: 'Failed to send emergency alert' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        console.log(`${user.name} (${user.role}) disconnected`);
        connectedUsers.delete(socket.id);
      }
    });
  });

  return io;
};

module.exports = socketHandler;