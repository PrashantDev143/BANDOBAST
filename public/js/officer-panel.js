// Global variables
let socket;
let currentUser;
let currentAssignment = null;
let locationTracking = false;
let trackingInterval = null;

// Initialize officer panel
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
    initializeSocket();
    loadAssignment();
    bindEventHandlers();
    requestNotificationPermission();
});

async function initializeAuth() {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    
    if (!token || !userData || JSON.parse(userData).role !== 'officer') {
        window.location.href = '/';
        return;
    }

    currentUser = JSON.parse(userData);
    document.getElementById('officerName').textContent = currentUser.name;
}

function initializeSocket() {
    socket = io();
    
    socket.emit('join', {
        supabaseId: currentUser.supabaseId,
        name: currentUser.name,
        role: currentUser.role,
        badgeNumber: currentUser.badgeNumber,
        eventId: currentAssignment?.event?._id
    });

    // Listen for location update acknowledgments
    socket.on('locationUpdateAck', (data) => {
        updateLocationStatus(data);
    });

    // Listen for emergency acknowledgment
    socket.on('emergencyAck', (data) => {
        showToast('Emergency alert sent successfully', 'success');
    });

    // Listen for push notifications
    socket.on('dutyNotification', (data) => {
        showPushNotification(data);
    });
}

async function loadAssignment() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/officers/${currentUser.supabaseId}/assignment`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success && data.assignment) {
            currentAssignment = data.assignment;
            displayAssignment();
        } else {
            showNoAssignment();
        }

    } catch (error) {
        console.error('Load assignment error:', error);
        showNoAssignment();
    }
}

function displayAssignment() {
    const event = currentAssignment.event;
    
    // Update status banner
    document.getElementById('statusMessage').textContent = `On Duty: ${event.name}`;
    document.getElementById('statusIndicator').innerHTML = `
        <span class="badge bg-success">Active Assignment</span>
    `;

    // Populate event details
    document.getElementById('eventName').textContent = event.name;
    document.getElementById('eventDescription').textContent = event.description || 'No description provided';
    document.getElementById('eventDate').textContent = new Date(event.date).toLocaleDateString();
    document.getElementById('eventTime').textContent = `${event.startTime} - ${event.endTime}`;
    document.getElementById('eventLocation').textContent = event.location.name;
    document.getElementById('supervisorName').textContent = 'Assigned Supervisor';

    // Show assignment container
    document.getElementById('activeAssignmentContainer').style.display = 'block';
    document.getElementById('noAssignmentCard').style.display = 'none';

    // Update duty status timeline
    updateStatusTimeline();

    // Show appropriate action buttons
    updateActionButtons();

    // If already checked in, start location tracking
    if (currentAssignment.officerStatus === 'checked-in' || currentAssignment.officerStatus === 'active') {
        startLocationTracking();
    }
}

function showNoAssignment() {
    document.getElementById('statusMessage').textContent = 'No Active Assignment';
    document.getElementById('statusIndicator').innerHTML = `
        <span class="badge bg-secondary">Offline</span>
    `;
    
    document.getElementById('noAssignmentCard').style.display = 'block';
    document.getElementById('activeAssignmentContainer').style.display = 'none';
}

function updateStatusTimeline() {
    const timeline = document.getElementById('statusTimeline');
    const status = currentAssignment.officerStatus;
    
    const steps = [
        { id: 'assigned', label: 'Assigned', icon: 'bi-person-check' },
        { id: 'checked-in', label: 'Checked In', icon: 'bi-geo-alt' },
        { id: 'active', label: 'On Duty', icon: 'bi-shield-check' },
        { id: 'checked-out', label: 'Completed', icon: 'bi-check-circle' }
    ];

    timeline.innerHTML = '';
    
    steps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = 'status-step';
        
        // Determine step status
        let stepClass = '';
        if (step.id === status) {
            stepClass = 'active';
        } else if (isStepCompleted(step.id, status)) {
            stepClass = 'completed';
        }
        
        div.className += ` ${stepClass}`;
        div.innerHTML = `
            <i class="${step.icon} me-2"></i>
            <span>${step.label}</span>
            ${step.id === 'checked-in' && currentAssignment.checkInTime ? 
                `<small class="text-muted ms-2">${new Date(currentAssignment.checkInTime).toLocaleTimeString()}</small>` : ''
            }
        `;
        
        timeline.appendChild(div);
    });
}

function isStepCompleted(stepId, currentStatus) {
    const order = ['assigned', 'checked-in', 'active', 'checked-out'];
    const stepIndex = order.indexOf(stepId);
    const currentIndex = order.indexOf(currentStatus);
    return stepIndex < currentIndex;
}

function updateActionButtons() {
    const checkInBtn = document.getElementById('checkInBtn');
    const locationCard = document.getElementById('locationCard');
    const locationInfoCard = document.getElementById('locationInfoCard');
    
    if (currentAssignment.officerStatus === 'assigned') {
        checkInBtn.style.display = 'block';
        locationCard.style.display = 'none';
        locationInfoCard.style.display = 'none';
    } else {
        checkInBtn.style.display = 'none';
        locationCard.style.display = 'block';
        locationInfoCard.style.display = 'block';
    }
}

function bindEventHandlers() {
    // Check-in button
    document.getElementById('checkInBtn').addEventListener('click', handleCheckIn);
    
    // Holiday request form
    document.getElementById('holidayForm').addEventListener('submit', handleHolidayRequest);
    
    // Emergency button (press and hold)
    let emergencyTimer;
    const emergencyBtn = document.getElementById('emergencyBtn');
    
    emergencyBtn.addEventListener('mousedown', () => {
        emergencyTimer = setTimeout(() => {
            bootstrap.Modal.getOrCreateInstance(document.getElementById('emergencyModal')).show();
        }, 3000);
    });
    
    emergencyBtn.addEventListener('mouseup', () => {
        clearTimeout(emergencyTimer);
    });
    
    emergencyBtn.addEventListener('mouseleave', () => {
        clearTimeout(emergencyTimer);
    });
    
    // Confirm emergency
    document.getElementById('confirmEmergencyBtn').addEventListener('click', sendEmergencyAlert);
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
}

async function handleCheckIn() {
    if (!currentAssignment) {
        showToast('No active assignment found', 'error');
        return;
    }

    setButtonLoading('checkInBtn', true);

    try {
        // Get current location
        const position = await getCurrentLocation();
        
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/officers/${currentUser.supabaseId}/checkin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                eventId: currentAssignment.event._id,
                latitude: position.latitude,
                longitude: position.longitude,
                accuracy: position.accuracy
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Check-in successful!', 'success');
            currentAssignment.officerStatus = 'checked-in';
            currentAssignment.checkInTime = new Date();
            
            updateStatusTimeline();
            updateActionButtons();
            startLocationTracking();
            
        } else {
            showToast(data.error || 'Check-in failed', 'error');
        }

    } catch (error) {
        console.error('Check-in error:', error);
        showToast('Check-in failed. Please try again.', 'error');
    } finally {
        setButtonLoading('checkInBtn', false);
    }
}

function startLocationTracking() {
    if (locationTracking) return;
    
    locationTracking = true;
    document.getElementById('locationStatus').textContent = 'Active - Tracking every 30s';
    
    // Get initial battery level
    updateBatteryStatus();
    
    // Start tracking interval
    trackingInterval = setInterval(async () => {
        try {
            const position = await getCurrentLocation();
            updateLocationDisplay(position);
            sendLocationUpdate(position);
            updateBatteryStatus();
        } catch (error) {
            console.error('Location tracking error:', error);
        }
    }, 30000); // Every 30 seconds

    // Get initial location
    getCurrentLocation()
        .then(position => {
            updateLocationDisplay(position);
            sendLocationUpdate(position);
        })
        .catch(error => console.error('Initial location error:', error));
}

function stopLocationTracking() {
    locationTracking = false;
    document.getElementById('locationStatus').textContent = 'Inactive';
    
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
}

async function sendLocationUpdate(position) {
    if (!currentAssignment || !socket) return;

    socket.emit('locationUpdate', {
        eventId: currentAssignment.event._id,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        batteryLevel: await getBatteryLevel()
    });
}

function updateLocationDisplay(position) {
    document.getElementById('currentCoords').textContent = 
        `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

function updateLocationStatus(data) {
    const zoneStatus = document.getElementById('zoneStatus');
    
    if (data.isInZone) {
        zoneStatus.className = 'badge bg-success';
        zoneStatus.textContent = 'In Zone';
    } else {
        zoneStatus.className = 'badge bg-danger';
        zoneStatus.textContent = 'Out of Zone';
    }

    if (data.alerts && data.alerts.length > 0) {
        data.alerts.forEach(alert => {
            showAlert(alert);
        });
    }
}

function showAlert(alert) {
    let alertClass = 'alert-warning';
    let alertIcon = 'bi-exclamation-triangle';
    let alertMessage = '';

    switch (alert.type) {
        case 'idle':
            alertMessage = 'You have been idle for more than 10 minutes. Please resume active duty.';
            break;
        case 'out-of-zone':
            alertClass = 'alert-danger';
            alertIcon = 'bi-geo-alt';
            alertMessage = 'You are outside the designated zone. Please return to your assigned area.';
            break;
        case 'low-battery':
            alertMessage = 'Your device battery is low. Please charge your device.';
            break;
    }

    const alertHtml = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            <i class="${alertIcon} me-2"></i>
            <strong>Alert:</strong> ${alertMessage}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;

    const container = document.querySelector('.container-fluid');
    container.insertAdjacentHTML('afterbegin', alertHtml);
}

async function handleHolidayRequest(e) {
    e.preventDefault();

    if (!currentAssignment) {
        showToast('No active assignment to request holiday from', 'error');
        return;
    }

    const formData = new FormData(e.target);
    const reason = formData.get('reason');
    const customReason = formData.get('customReason');
    const finalReason = reason === 'other' ? customReason : reason;
    
    formData.set('reason', finalReason);
    formData.append('eventId', currentAssignment.event._id);

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/holidays', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Holiday request submitted successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('holidayModal')).hide();
            e.target.reset();
        } else {
            showToast(data.error || 'Failed to submit request', 'error');
        }

    } catch (error) {
        console.error('Holiday request error:', error);
        showToast('Network error. Please try again.', 'error');
    }
}

async function sendEmergencyAlert() {
    const message = document.getElementById('emergencyMessage').value;
    
    try {
        const position = await getCurrentLocation();
        
        socket.emit('emergency', {
            eventId: currentAssignment.event._id,
            latitude: position.latitude,
            longitude: position.longitude,
            message: message || 'Emergency assistance required'
        });

        bootstrap.Modal.getInstance(document.getElementById('emergencyModal')).hide();
        
    } catch (error) {
        console.error('Emergency alert error:', error);
        showToast('Failed to send emergency alert', 'error');
    }
}

// Location services
async function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}

async function getBatteryLevel() {
    try {
        if ('getBattery' in navigator) {
            const battery = await navigator.getBattery();
            return Math.round(battery.level * 100);
        }
    } catch (error) {
        console.error('Battery API error:', error);
    }
    return null;
}

async function updateBatteryStatus() {
    const batteryLevel = await getBatteryLevel();
    const batteryElement = document.getElementById('batteryLevel');
    const batteryPercentage = document.getElementById('batteryPercentage');
    
    if (batteryLevel !== null) {
        batteryPercentage.textContent = batteryLevel;
        
        // Update battery indicator styling
        if (batteryLevel < 20) {
            batteryElement.className = 'battery-level low';
        } else if (batteryLevel < 50) {
            batteryElement.className = 'battery-level medium';
        } else {
            batteryElement.className = 'battery-level';
        }
    }
}

// Notification services
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

function showPushNotification(data) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(data.title, {
            body: data.message,
            icon: '/images/favicon.ico',
            badge: '/images/badge.png'
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
}

async function logout() {
    try {
        // Stop location tracking
        stopLocationTracking();
        
        const token = localStorage.getItem('authToken');
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        localStorage.clear();
        window.location.href = '/';
    }
}

// Utility functions
function setButtonLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');
    
    if (isLoading) {
        btnText.classList.add('d-none');
        btnLoading.classList.remove('d-none');
        button.disabled = true;
    } else {
        btnText.classList.remove('d-none');
        btnLoading.classList.add('d-none');
        button.disabled = false;
    }
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    
    const toastHtml = `
        <div class="toast align-items-center text-white bg-${getToastBg(type)} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bi ${getToastIcon(type)} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    const toastElement = toastContainer.lastElementChild;
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

function getToastBg(type) {
    switch (type) {
        case 'success': return 'success';
        case 'error': return 'danger';
        case 'warning': return 'warning';
        default: return 'primary';
    }
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'bi-check-circle';
        case 'error': return 'bi-x-circle';
        case 'warning': return 'bi-exclamation-triangle';
        default: return 'bi-info-circle';
    }
}

// Auto-refresh assignment data every 2 minutes
setInterval(loadAssignment, 120000);