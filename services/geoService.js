const geolib = require('geolib');

const geoService = {
  // Check if coordinates are within geofence
  isWithinGeofence(currentLocation, centerCoordinates, radiusMeters) {
    const center = {
      latitude: centerCoordinates[1], // lat is second in [lng, lat] format
      longitude: centerCoordinates[0] // lng is first
    };

    const distance = geolib.getDistance(
      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      center
    );

    return distance <= radiusMeters;
  },

  // Calculate distance between two points
  calculateDistance(point1, point2) {
    return geolib.getDistance(
      { latitude: point1.latitude, longitude: point1.longitude },
      { latitude: point2.latitude, longitude: point2.longitude }
    );
  },

  // Get center point from multiple coordinates
  getCenterPoint(coordinates) {
    const points = coordinates.map(coord => ({
      latitude: coord.latitude,
      longitude: coord.longitude
    }));
    
    return geolib.getCenterOfBounds(points);
  },

  // Convert address to coordinates (mock implementation)
  async geocodeAddress(address) {
    // In production, integrate with a geocoding service like Google Maps API
    // For now, return mock coordinates
    return {
      latitude: 28.6139, // Delhi coordinates as example
      longitude: 77.2090,
      address: address
    };
  },

  // Get readable address from coordinates (mock implementation)
  async reverseGeocode(latitude, longitude) {
    // In production, integrate with reverse geocoding service
    return {
      address: `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`,
      locality: 'Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      country: 'India'
    };
  }
};

module.exports = geoService;