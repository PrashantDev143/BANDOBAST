// Global variables
let socket;
let currentUser;
let events = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
    initializeSocket();
    loadDashboardData();
    bindEventHandlers();
});

async function initializeAuth() {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    
    if (!token || !userData) {
        window.location.href = '/';
        return;
    }

    try {
        currentUser = JSON.parse(userData);
        document.getElementById('userName').textContent = currentUser.name;
        
        // Verify token is still valid
        const response = await fetch('/api/auth/user', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid session');
        }

    } catch (error) {
        console.error('Auth error:', error);
        logout();
    }
}

function initializeSocket() {
    socket = io();
    
    socket.emit('join', {
        supabaseId: currentUser.supabaseId,
        name: currentUser.name,
        role: currentUser.role
    });

    // Listen for real-time updates
    socket.on('officerLocationUpdate', (data) => {
        updateOfficerStatus(data);
    });

    socket.on('emergency', (data) => {
        showEmergencyAlert(data);
    });
}

async function loadDashboardData() {
    try {
        const token = localStorage.getItem('authToken');
        
        // Load events
        const eventsResponse = await fetch('/api/events', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const eventsData = await eventsResponse.json();
        if (eventsData.success) {
            events = eventsData.events;
            updateStats();
            renderEventsTable();
        }

        // Load holiday requests count
        const holidaysResponse = await fetch('/api/holidays', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const holidaysData = await holidaysResponse.json();
        if (holidaysData.success) {
            const pendingCount = holidaysData.requests.filter(r => r.status === 'pending').length;
            document.getElementById('holidayRequests').textContent = pendingCount;
        }

    } catch (error) {
        console.error('Load data error:', error);
        showToast('Failed to load dashboard data', 'error');
    }
}

function bindEventHandlers() {
    // Create event form
    document.getElementById('createEventForm').addEventListener('submit', handleCreateEvent);
    
    // Upload officers form
    document.getElementById('uploadOfficersForm').addEventListener('submit', handleUploadOfficers);
    
    // Event filters
    document.querySelectorAll('input[name="eventFilter"]').forEach(radio => {
        radio.addEventListener('change', filterEvents);
    });
    
    // View active events button
    document.getElementById('viewActiveEvents').addEventListener('click', () => {
        const activeEvent = events.find(e => e.status === 'active');
        if (activeEvent) {
            window.location.href = `/monitor/${activeEvent._id}`;
        } else {
            showToast('No active events to monitor', 'info');
        }
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Load events for upload modal when opened
    document.getElementById('uploadOfficersModal').addEventListener('show.bs.modal', loadEventsForUpload);
}

async function handleCreateEvent(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const eventData = {
        name: formData.get('name'),
        description: formData.get('description'),
        date: formData.get('date'),
        startTime: formData.get('startTime'),
        endTime: formData.get('endTime'),
        requiredOfficers: parseInt(formData.get('requiredOfficers')),
        priority: formData.get('priority'),
        location: {
            name: formData.get('locationName'),
            latitude: parseFloat(formData.get('latitude')),
            longitude: parseFloat(formData.get('longitude')),
            radius: parseInt(formData.get('radius'))
        }
    };

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Event created successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('createEventModal')).hide();
            e.target.reset();
            loadDashboardData(); // Reload data
        } else {
            showToast(data.error || 'Failed to create event', 'error');
        }

    } catch (error) {
        console.error('Create event error:', error);
        showToast('Network error. Please try again.', 'error');
    }
}

async function handleUploadOfficers(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const eventId = formData.get('eventId');
    
    if (!eventId) {
        showToast('Please select an event', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/events/${eventId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            let message = data.message;
            if (data.errors && data.errors.length > 0) {
                message += ` (${data.errors.length} errors)`;
            }
            showToast(message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('uploadOfficersModal')).hide();
            e.target.reset();
            loadDashboardData(); // Reload data
        } else {
            showToast(data.error || 'Failed to upload officers', 'error');
        }

    } catch (error) {
        console.error('Upload officers error:', error);
        showToast('Network error. Please try again.', 'error');
    }
}

function loadEventsForUpload() {
    const selectElement = document.getElementById('selectEvent');
    selectElement.innerHTML = '<option value="">Choose an event...</option>';
    
    // Only show upcoming and active events
    const availableEvents = events.filter(e => ['upcoming', 'active'].includes(e.status));
    
    availableEvents.forEach(event => {
        const option = document.createElement('option');
        option.value = event._id;
        option.textContent = `${event.name} - ${new Date(event.date).toLocaleDateString()}`;
        selectElement.appendChild(option);
    });
}

function updateStats() {
    // Calculate statistics
    const activeEvents = events.filter(e => e.status === 'active').length;
    const totalOnDuty = events.reduce((sum, event) => {
        if (event.status === 'active') {
            return sum + event.officers.filter(o => o.status === 'active' || o.status === 'checked-in').length;
        }
        return sum;
    }, 0);

    // Update DOM
    document.getElementById('activeEvents').textContent = activeEvents;
    document.getElementById('onDutyOfficers').textContent = totalOnDuty;
    
    // Pending alerts would come from real-time data
    document.getElementById('pendingAlerts').textContent = '0';
}

function renderEventsTable() {
    const tbody = document.getElementById('eventsTableBody');
    tbody.innerHTML = '';

    if (events.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="bi bi-calendar-x me-2"></i>
                    No events found. Create your first event to get started.
                </td>
            </tr>
        `;
        return;
    }

    events.forEach(event => {
        const row = createEventTableRow(event);
        tbody.appendChild(row);
    });
}

function createEventTableRow(event) {
    const tr = document.createElement('tr');
    tr.className = 'fade-in';
    
    const eventDate = new Date(event.date).toLocaleDateString();
    const eventTime = `${event.startTime} - ${event.endTime}`;
    const officerCount = `${event.actualOfficers}/${event.requiredOfficers}`;
    
    tr.innerHTML = `
        <td>
            <div class="fw-semibold">${event.name}</div>
            <small class="text-muted">${event.description || 'No description'}</small>
        </td>
        <td>
            <div>${eventDate}</div>
            <small class="text-muted">${eventTime}</small>
        </td>
        <td>
            <div>${event.location.name}</div>
            <small class="text-muted">Radius: ${event.location.radius}m</small>
        </td>
        <td>
            <span class="badge ${getOfficerCountBadge(event.actualOfficers, event.requiredOfficers)}">${officerCount}</span>
        </td>
        <td>
            <span class="badge status-${event.status}">${capitalizeFirst(event.status)}</span>
            <span class="badge ms-1 priority-${event.priority}">${capitalizeFirst(event.priority)}</span>
        </td>
        <td>
            <div class="btn-group" role="group">
                ${getEventActions(event)}
            </div>
        </td>
    `;
    
    return tr;
}

function getOfficerCountBadge(actual, required) {
    if (actual === 0) return 'bg-secondary';
    if (actual < required) return 'bg-warning';
    return 'bg-success';
}

function getEventActions(event) {
    let actions = '';
    
    if (event.status === 'upcoming') {
        actions += `<button class="btn btn-sm btn-success" onclick="startEvent('${event._id}')">Start</button>`;
    }
    
    if (event.status === 'active') {
        actions += `<button class="btn btn-sm btn-primary" onclick="monitorEvent('${event._id}')">Monitor</button>`;
        actions += `<button class="btn btn-sm btn-danger ms-1" onclick="endEvent('${event._id}')">End</button>`;
    }
    
    if (event.status === 'completed') {
        actions += `<button class="btn btn-sm btn-info" onclick="viewReport('${event._id}')">Report</button>`;
    }
    
    actions += `<button class="btn btn-sm btn-outline-secondary ms-1" onclick="viewEventDetails('${event._id}')">Details</button>`;
    
    return actions;
}

function filterEvents() {
    const selectedFilter = document.querySelector('input[name="eventFilter"]:checked').id;
    
    let filteredEvents = events;
    
    if (selectedFilter === 'filterActive') {
        filteredEvents = events.filter(e => e.status === 'active');
    } else if (selectedFilter === 'filterUpcoming') {
        filteredEvents = events.filter(e => e.status === 'upcoming');
    }
    
    // Re-render table with filtered events
    const originalEvents = events;
    events = filteredEvents;
    renderEventsTable();
    events = originalEvents; // Restore original array
}

// Event action handlers
async function startEvent(eventId) {
    if (!confirm('Are you sure you want to start this event?')) return;
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/events/${eventId}/start`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Event started successfully!', 'success');
            loadDashboardData();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Start event error:', error);
        showToast('Failed to start event', 'error');
    }
}

function monitorEvent(eventId) {
    window.location.href = `/monitor/${eventId}`;
}

async function endEvent(eventId) {
    if (!confirm('Are you sure you want to end this event? All officers will be checked out automatically.')) return;
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/events/${eventId}/end`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Event ended successfully!', 'success');
            loadDashboardData();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('End event error:', error);
        showToast('Failed to end event', 'error');
    }
}

function viewReport(eventId) {
    window.location.href = `/reports?event=${eventId}`;
}

function viewEventDetails(eventId) {
    const event = events.find(e => e._id === eventId);
    if (event) {
        // Create and show event details modal (simplified for now)
        alert(`Event: ${event.name}\nDate: ${new Date(event.date).toLocaleDateString()}\nLocation: ${event.location.name}\nOfficers: ${event.actualOfficers}/${event.requiredOfficers}`);
    }
}

function updateOfficerStatus(data) {
    // Update real-time officer status in the interface
    console.log('Officer location update:', data);
    
    // Update stats if needed
    if (data.alerts && data.alerts.length > 0) {
        const currentAlerts = parseInt(document.getElementById('pendingAlerts').textContent);
        document.getElementById('pendingAlerts').textContent = currentAlerts + data.alerts.length;
    }
}

function showEmergencyAlert(data) {
    // Show emergency notification
    const alertHtml = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
            <i class="bi bi-exclamation-triangle me-2"></i>
            <strong>EMERGENCY ALERT:</strong> ${data.officer.name} (Badge: ${data.officer.badgeNumber}) 
            has triggered an emergency alert during ${data.eventId}.
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const container = document.querySelector('.container-fluid');
    container.insertAdjacentHTML('afterbegin', alertHtml);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        const alert = container.querySelector('.alert-danger');
        if (alert) {
            bootstrap.Alert.getInstance(alert)?.close();
        }
    }, 10000);
}

async function logout() {
    try {
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
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(message, type = 'info') {
    // Create toast notification
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
    
    // Remove toast element after it's hidden
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

// Auto-refresh dashboard data every 30 seconds
setInterval(loadDashboardData, 30000);