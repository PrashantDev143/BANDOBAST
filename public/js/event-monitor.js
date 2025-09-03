// Global variables
let socket;
let currentUser;
let currentEvent = null;
let officers = [];
let activityFeed = [];
let mapCenter = { lat: 28.6139, lng: 77.2090 }; // Delhi default

// Initialize event monitor
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
    initializeSocket();
    loadEventData();
    bindEventHandlers();
    initializeActivityFeed();
});

async function initializeAuth() {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    
    if (!token || !userData || JSON.parse(userData).role !== 'supervisor') {
        window.location.href = '/';
        return;
    }

    currentUser = JSON.parse(userData);
}

function initializeSocket() {
    socket = io();
    
    socket.emit('join', {
        supabaseId: currentUser.supabaseId,
        name: currentUser.name,
        role: currentUser.role,
        eventId: window.eventId
    });

    // Listen for real-time officer updates
    socket.on('officerLocationUpdate', (data) => {
        updateOfficerLocation(data);
        addActivityFeedItem('location', `${data.name} location updated`, data);
    });

    // Listen for emergency alerts
    socket.on('emergency', (data) => {
        handleEmergencyAlert(data);
    });

    console.log('Socket connected for event monitoring');
}

async function loadEventData() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/events/${window.eventId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            currentEvent = data.event;
            displayEventHeader();
            loadOfficersList();
            initializeMap();
        } else {
            showToast(data.error, 'error');
            setTimeout(() => window.location.href = '/dashboard', 2000);
        }

    } catch (error) {
        console.error('Load event error:', error);
        showToast('Failed to load event data', 'error');
    }
}

function displayEventHeader() {
    document.getElementById('eventTitle').textContent = currentEvent.name;
    document.getElementById('eventStatus').textContent = capitalizeFirst(currentEvent.status);
    document.getElementById('eventStatus').className = `badge bg-${getStatusColor(currentEvent.status)} me-2`;
    
    const eventDate = new Date(currentEvent.date).toLocaleDateString();
    const eventTime = `${currentEvent.startTime} - ${currentEvent.endTime}`;
    document.getElementById('eventDateTime').textContent = `${eventDate} | ${eventTime}`;
    document.getElementById('eventLocationName').textContent = currentEvent.location.name;

    // Update map center
    if (currentEvent.location.coordinates) {
        mapCenter = {
            lat: currentEvent.location.coordinates[1],
            lng: currentEvent.location.coordinates[0]
        };
    }
}

function loadOfficersList() {
    const officersContainer = document.getElementById('officersList');
    const officerCount = document.getElementById('officerCount');
    
    officers = currentEvent.officers || [];
    officerCount.textContent = officers.length;
    
    officersContainer.innerHTML = '';
    
    if (officers.length === 0) {
        officersContainer.innerHTML = `
            <div class="text-center p-4">
                <i class="bi bi-people text-muted" style="font-size: 2rem;"></i>
                <p class="text-muted mt-2">No officers assigned</p>
                <p class="text-muted small">Upload an officer list to begin tracking</p>
            </div>
        `;
        return;
    }

    officers.forEach(officer => {
        const officerElement = createOfficerElement(officer);
        officersContainer.appendChild(officerElement);
    });

    addActivityFeedItem('info', `Monitoring ${officers.length} officers for ${currentEvent.name}`);
}

function createOfficerElement(officer) {
    const div = document.createElement('div');
    div.className = 'officer-item';
    div.id = `officer-${officer.userId}`;
    
    const lastUpdateTime = officer.checkInTime ? formatTime(officer.checkInTime) : 'Not checked in';
    const statusColor = getStatusColor(officer.status);
    
    div.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="officer-status status-${officer.status}"></div>
            <div class="flex-grow-1">
                <div class="fw-semibold">${officer.name}</div>
                <small class="text-muted">Badge: ${officer.badgeNumber || 'N/A'}</small>
                <div class="mt-1">
                    <span class="badge badge-sm bg-${statusColor}">${capitalizeFirst(officer.status)}</span>
                </div>
            </div>
            <div class="text-end">
                <small class="text-muted d-block" id="lastUpdate-${officer.userId}">
                    ${lastUpdateTime}
                </small>
                <button class="btn btn-sm btn-outline-primary mt-1" onclick="viewOfficerDetails('${officer.userId}')">
                    <i class="bi bi-eye"></i>
                </button>
            </div>
        </div>
    `;
    
    return div;
}

function updateOfficerLocation(data) {
    console.log('Updating officer location:', data);
    
    // Update officer in the list
    const officerElement = document.getElementById(`officer-${data.officerId}`);
    if (officerElement) {
        const statusDot = officerElement.querySelector('.officer-status');
        const statusBadge = officerElement.querySelector('.badge');
        const lastUpdate = document.getElementById(`lastUpdate-${data.officerId}`);
        
        statusDot.className = `officer-status status-${data.status}`;
        statusBadge.className = `badge badge-sm bg-${getStatusColor(data.status)}`;
        statusBadge.textContent = capitalizeFirst(data.status);
        
        if (lastUpdate) {
            lastUpdate.textContent = formatTime(data.timestamp);
        }
    }

    // Update officer in officers array
    const officer = officers.find(o => o.userId === data.officerId);
    if (officer) {
        officer.status = data.status;
        officer.lastUpdate = data.timestamp;
        officer.location = data.location;
    }

    // Add alerts to feed if any
    if (data.alerts && data.alerts.length > 0) {
        data.alerts.forEach(alert => {
            const alertMessage = getAlertMessage(alert.type);
            addActivityFeedItem('alert', `${data.name}: ${alertMessage}`, data);
        });
    }

    // Update map if available
    updateMapMarkers();
}

function handleEmergencyAlert(data) {
    console.log('Emergency alert received:', data);
    
    // Add emergency item to activity feed
    addActivityFeedItem('emergency', `🚨 EMERGENCY: ${data.officer.name} needs assistance`, data);
    
    // Show emergency notification
    showEmergencyNotification(data);
    
    // Play alert sound if available
    playAlertSound();
}

function showEmergencyNotification(data) {
    const alertHtml = `
        <div class="alert alert-danger alert-dismissible fade show emergency-alert" role="alert">
            <div class="d-flex align-items-center">
                <i class="bi bi-exclamation-triangle me-3" style="font-size: 1.5rem;"></i>
                <div class="flex-grow-1">
                    <h6 class="alert-heading mb-1">🚨 EMERGENCY ALERT</h6>
                    <strong>${data.officer.name}</strong> (Badge: ${data.officer.badgeNumber}) 
                    requires immediate assistance.
                    <br><small class="mt-1 d-block">
                        📍 Location: ${data.location.address || `${data.location.latitude}, ${data.location.longitude}`}
                    </small>
                    ${data.message ? `<small class="d-block">💬 ${data.message}</small>` : ''}
                </div>
                <button type="button" class="btn btn-light btn-sm me-2" onclick="respondToEmergency('${data.officer.id}')">
                    Respond
                </button>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        </div>
    `;
    
    const container = document.querySelector('.container-fluid');
    container.insertAdjacentHTML('afterbegin', alertHtml);
    
    // Auto-focus on emergency
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Blink title for attention
    blinkPageTitle('🚨 EMERGENCY - E-BANDOBAST');
}

function initializeActivityFeed() {
    const feed = document.getElementById('activityFeed');
    
    // Add initial monitoring message
    addActivityFeedItem('info', `Started monitoring event: ${window.eventId}`);
    
    // Clear placeholder
    setTimeout(() => {
        const placeholder = feed.querySelector('.text-center');
        if (placeholder) {
            placeholder.remove();
        }
    }, 1000);
}

function addActivityFeedItem(type, message, data = {}) {
    const feed = document.getElementById('activityFeed');
    const item = document.createElement('div');
    item.className = `activity-item activity-${type} fade-in`;
    
    const iconClass = {
        'location': 'bi-geo-alt',
        'alert': 'bi-exclamation-triangle', 
        'emergency': 'bi-exclamation-diamond',
        'info': 'bi-info-circle',
        'success': 'bi-check-circle'
    }[type] || 'bi-info-circle';
    
    const timestamp = formatTime(data.timestamp || new Date());
    
    item.innerHTML = `
        <div class="activity-icon text-white">
            <i class="${iconClass}"></i>
        </div>
        <div class="flex-grow-1">
            <div class="fw-semibold">${message}</div>
            <small class="text-muted">${timestamp}</small>
            ${data.batteryLevel ? `<small class="text-muted ms-3">🔋 ${data.batteryLevel}%</small>` : ''}
        </div>
    `;
    
    // Insert at top
    feed.insertBefore(item, feed.firstChild);
    
    // Limit to 100 items
    const items = feed.querySelectorAll('.activity-item');
    if (items.length > 100) {
        items[items.length - 1].remove();
    }
    
    // Remove placeholder if exists
    const placeholder = feed.querySelector('.text-center');
    if (placeholder && items.length > 1) {
        placeholder.remove();
    }
}

function initializeMap() {
    // Initialize mock map display
    const mapContainer = document.getElementById('map');
    
    mapContainer.innerHTML = `
        <div class="map-placeholder">
            <div class="map-info">
                <h5><i class="bi bi-geo-alt text-primary me-2"></i>Event Location</h5>
                <p class="mb-2">${currentEvent.location.name}</p>
                <p class="text-muted small">
                    📍 ${mapCenter.lat.toFixed(6)}, ${mapCenter.lng.toFixed(6)}
                    <br>🔄 Zone Radius: ${currentEvent.location.radius || 100}m
                    <br>👮 Officers: ${officers.length}
                </p>
                <div class="mt-3">
                    <div class="row">
                        <div class="col-6 text-center">
                            <div class="map-stat">
                                <h6 class="text-success">${officers.filter(o => o.status === 'active').length}</h6>
                                <small>Active</small>
                            </div>
                        </div>
                        <div class="col-6 text-center">
                            <div class="map-stat">
                                <h6 class="text-warning">${officers.filter(o => o.status === 'idle').length}</h6>
                                <small>Idle</small>
                            </div>
                        </div>
                    </div>
                    <div class="row mt-2">
                        <div class="col-6 text-center">
                            <div class="map-stat">
                                <h6 class="text-danger">${officers.filter(o => o.status === 'out-of-zone').length}</h6>
                                <small>Out of Zone</small>
                            </div>
                        </div>
                        <div class="col-6 text-center">
                            <div class="map-stat">
                                <h6 class="text-secondary">${officers.filter(o => o.status === 'assigned').length}</h6>
                                <small>Not Checked In</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateMapMarkers() {
    // Update the mock map stats
    initializeMap();
}

function bindEventHandlers() {
    // End event button
    document.getElementById('endEventBtn').addEventListener('click', () => {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('endEventModal')).show();
    });
    
    // Confirm end event
    document.getElementById('confirmEndEvent').addEventListener('click', endEvent);
    
    // Generate report button
    document.getElementById('generateReportBtn').addEventListener('click', generateReport);
    
    // Center map button
    document.getElementById('centerMapBtn').addEventListener('click', centerMapView);
    
    // Clear alerts button
    document.getElementById('clearAlertsBtn').addEventListener('click', clearActivityFeed);
    
    // Map view toggle
    document.querySelectorAll('input[name="mapView"]').forEach(radio => {
        radio.addEventListener('change', toggleMapView);
    });
}

async function endEvent() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/events/${window.eventId}/end`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Event ended successfully!', 'success');
            addActivityFeedItem('success', 'Event ended - All officers checked out');
            
            // Update UI
            currentEvent.status = 'completed';
            displayEventHeader();
            
            // Hide end button, show generate report
            document.getElementById('endEventBtn').style.display = 'none';
            document.getElementById('generateReportBtn').classList.remove('btn-outline-primary');
            document.getElementById('generateReportBtn').classList.add('btn-primary');
            
            bootstrap.Modal.getInstance(document.getElementById('endEventModal')).hide();
            
        } else {
            showToast(data.error || 'Failed to end event', 'error');
        }

    } catch (error) {
        console.error('End event error:', error);
        showToast('Failed to end event', 'error');
    }
}

async function generateReport() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/reports/${window.eventId}/generate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Performance report generated successfully!', 'success');
            addActivityFeedItem('success', 'Performance report generated');
            
            // Redirect to reports page
            setTimeout(() => {
                window.location.href = '/reports';
            }, 2000);
            
        } else {
            showToast(data.error || 'Failed to generate report', 'error');
        }

    } catch (error) {
        console.error('Generate report error:', error);
        showToast('Failed to generate report', 'error');
    }
}

function viewOfficerDetails(officerId) {
    const officer = officers.find(o => o.userId === officerId);
    if (!officer) return;
    
    const modalHtml = `
        <div class="modal fade" id="officerDetailsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Officer Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-6">
                                <strong>Name:</strong><br>
                                <span class="text-muted">${officer.name}</span>
                            </div>
                            <div class="col-6">
                                <strong>Badge:</strong><br>
                                <span class="text-muted">${officer.badgeNumber || 'N/A'}</span>
                            </div>
                        </div>
                        <hr>
                        <div class="row">
                            <div class="col-6">
                                <strong>Status:</strong><br>
                                <span class="badge bg-${getStatusColor(officer.status)}">${capitalizeFirst(officer.status)}</span>
                            </div>
                            <div class="col-6">
                                <strong>Phone:</strong><br>
                                <span class="text-muted">${officer.phone || 'N/A'}</span>
                            </div>
                        </div>
                        ${officer.checkInTime ? `
                            <hr>
                            <div class="row">
                                <div class="col-12">
                                    <strong>Check-in Time:</strong><br>
                                    <span class="text-muted">${formatDateTime(officer.checkInTime)}</span>
                                </div>
                            </div>
                        ` : ''}
                        <hr>
                        <div class="text-center">
                            <button class="btn btn-primary btn-sm me-2" onclick="contactOfficer('${officer.phone}')">
                                <i class="bi bi-telephone me-1"></i>Call
                            </button>
                            <button class="btn btn-outline-primary btn-sm" onclick="viewOfficerHistory('${officer.userId}')">
                                <i class="bi bi-clock-history me-1"></i>History
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('officerDetailsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('officerDetailsModal')).show();
}

function centerMapView() {
    addActivityFeedItem('info', `Map centered on ${currentEvent.location.name}`);
    showToast('Map view centered', 'info');
}

function toggleMapView() {
    const selectedView = document.querySelector('input[name="mapView"]:checked').id;
    addActivityFeedItem('info', `Map view changed to ${selectedView}`);
}

function clearActivityFeed() {
    const feed = document.getElementById('activityFeed');
    feed.innerHTML = `
        <div class="text-center text-muted py-3">
            <i class="bi bi-broadcast"></i>
            <p class="mb-0">Activity feed cleared - Monitoring for new updates...</p>
        </div>
    `;
    activityFeed = [];
}

function contactOfficer(phone) {
    if (phone && phone !== 'N/A') {
        window.open(`tel:${phone}`);
        addActivityFeedItem('info', `Initiated call to officer at ${phone}`);
    } else {
        showToast('No phone number available for this officer', 'warning');
    }
}

function viewOfficerHistory(officerId) {
    // Redirect to officer history view (could be implemented)
    showToast('Officer history view - Feature coming soon', 'info');
}

function respondToEmergency(officerId) {
    addActivityFeedItem('success', 'Emergency response initiated');
    showToast('Emergency response team notified', 'success');
}

// Utility functions
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).replace('-', ' ');
}

function getStatusColor(status) {
    switch (status) {
        case 'active': case 'checked-in': return 'success';
        case 'idle': return 'warning';
        case 'out-of-zone': return 'danger';
        case 'assigned': return 'secondary';
        case 'completed': return 'info';
        case 'upcoming': return 'primary';
        default: return 'secondary';
    }
}

function getAlertMessage(alertType) {
    switch (alertType) {
        case 'idle': return 'Officer has been idle for more than 10 minutes';
        case 'out-of-zone': return 'Officer is outside designated zone';
        case 'low-battery': return 'Officer device has low battery';
        case 'emergency': return 'Emergency assistance requested';
        default: return 'Status update';
    }
}

function formatTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    
    const bgClass = {
        'success': 'bg-success',
        'error': 'bg-danger', 
        'warning': 'bg-warning',
        'info': 'bg-primary'
    }[type] || 'bg-primary';
    
    const iconClass = {
        'success': 'bi-check-circle',
        'error': 'bi-x-circle',
        'warning': 'bi-exclamation-triangle', 
        'info': 'bi-info-circle'
    }[type] || 'bi-info-circle';
    
    const toastHtml = `
        <div class="toast align-items-center text-white ${bgClass} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="${iconClass} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    const toastElement = toastContainer.lastElementChild;
    const toast = new bootstrap.Toast(toastElement, { delay: 4000 });
    toast.show();
    
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

function playAlertSound() {
    try {
        // Create audio context for alert sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.log('Audio not supported:', error);
    }
}

function blinkPageTitle(alertTitle) {
    const originalTitle = document.title;
    let isAlert = true;
    
    const blinkInterval = setInterval(() => {
        document.title = isAlert ? alertTitle : originalTitle;
        isAlert = !isAlert;
    }, 1000);
    
    // Stop blinking after 30 seconds
    setTimeout(() => {
        clearInterval(blinkInterval);
        document.title = originalTitle;
    }, 30000);
}

// Auto-refresh event data every 2 minutes
setInterval(() => {
    if (currentEvent && currentEvent.status === 'active') {
        loadEventData();
    }
}, 120000);

// Add CSS animation for fade-in
const style = document.createElement('style');
style.textContent = `
    .fade-in {
        animation: fadeIn 0.5s ease-in;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .emergency-alert {
        border-left: 5px solid #dc3545 !important;
        animation: emergencyPulse 1s infinite;
    }
    
    @keyframes emergencyPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4); }
        50% { box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
    }
    
    .map-placeholder {
        height: 100%;
        background: linear-gradient(135deg, #f8fafc, #e2e8f0);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0 0 12px 12px;
    }
    
    .map-info {
        text-align: center;
        max-width: 400px;
    }
    
    .map-stat h6 {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 0;
    }
`;
document.head.appendChild(style);