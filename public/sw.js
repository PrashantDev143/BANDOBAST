// Service Worker for E-BANDOBAST PWA
const CACHE_NAME = 'e-bandobast-v1.0.0';
const urlsToCache = [
  '/',
  '/dashboard',
  '/officer',
  '/css/auth.css',
  '/css/dashboard.css',
  '/css/officer-panel.css',
  '/css/event-monitor.css',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/officer-panel.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('E-BANDOBAST: Cache opened');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        
        return fetch(event.request).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone response for caching
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('E-BANDOBAST: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.message,
    icon: '/images/icon-192.png',
    badge: '/images/badge-72.png',
    vibrate: [200, 100, 200],
    data: data.data,
    actions: [
      {
        action: 'view',
        title: 'View Details',
        icon: '/images/view-icon.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/images/dismiss-icon.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    // Open the app to relevant page
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// Background sync (for offline functionality)
self.addEventListener('sync', (event) => {
  if (event.tag === 'location-sync') {
    event.waitUntil(syncLocationData());
  }
});

async function syncLocationData() {
  try {
    // Sync any pending location updates when online
    const pendingData = await getStoredLocationData();
    
    if (pendingData.length > 0) {
      for (const locationData of pendingData) {
        await sendLocationUpdate(locationData);
      }
      await clearStoredLocationData();
    }
  } catch (error) {
    console.error('Background sync error:', error);
  }
}

async function getStoredLocationData() {
  // Get data from IndexedDB or localStorage
  return JSON.parse(localStorage.getItem('pendingLocationUpdates') || '[]');
}

async function clearStoredLocationData() {
  localStorage.removeItem('pendingLocationUpdates');
}

async function sendLocationUpdate(data) {
  try {
    const response = await fetch('/api/officers/location', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.token}`
      },
      body: JSON.stringify(data.locationData)
    });
    
    return response.ok;
  } catch (error) {
    console.error('Send location update error:', error);
    return false;
  }
}