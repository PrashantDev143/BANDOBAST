// Global variables
let currentUser;
let holidayRequests = [];
let selectedRequest = null;
let responseAction = '';

// Initialize holidays page
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
    loadHolidayRequests();
    bindEventHandlers();
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

async function loadHolidayRequests() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/holidays', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            holidayRequests = data.requests;
            updateStats();
            displayRequests();
        } else {
            showError(data.error);
        }

    } catch (error) {
        console.error('Load requests error:', error);
        showError('Failed to load holiday requests');
    }
}

function updateStats() {
    const today = new Date().toDateString();
    
    const pendingCount = holidayRequests.filter(r => r.status === 'pending').length;
    const approvedToday = holidayRequests.filter(r => 
        r.status === 'approved' && 
        r.supervisorResponse && 
        new Date(r.supervisorResponse.responseDate).toDateString() === today
    ).length;
    const rejectedToday = holidayRequests.filter(r => 
        r.status === 'rejected' && 
        r.supervisorResponse && 
        new Date(r.supervisorResponse.responseDate).toDateString() === today
    ).length;
    
    const totalProcessed = holidayRequests.filter(r => r.status !== 'pending').length;
    const approvedTotal = holidayRequests.filter(r => r.status === 'approved').length;
    const approvalRate = totalProcessed > 0 ? Math.round((approvedTotal / totalProcessed) * 100) : 0;

    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('approvedToday').textContent = approvedToday;
    document.getElementById('rejectedToday').textContent = rejectedToday;
    document.getElementById('approvalRate').textContent = `${approvalRate}%`;
}

function displayRequests() {
    const tbody = document.getElementById('holidayRequestsBody');
    tbody.innerHTML = '';
    
    if (holidayRequests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4">
                    <i class="bi bi-calendar-check text-muted" style="font-size: 2rem;"></i>
                    <p class="mt-2 text-muted">No holiday requests found</p>
                </td>
            </tr>
        `;
        return;
    }

    holidayRequests.forEach(request => {
        const row = createRequestRow(request);
        tbody.appendChild(row);
    });
}

function createRequestRow(request) {
    const tr = document.createElement('tr');
    tr.className = 'request-row';
    tr.dataset.status = request.status;
    
    const eventName = request.eventId ? request.eventId.name : 'Unknown Event';
    const eventDate = request.eventId ? new Date(request.eventId.date).toLocaleDateString() : 'N/A';
    const requestDate = new Date(request.requestDate).toLocaleDateString();
    
    tr.innerHTML = `
        <td>
            <div class="fw-semibold">${request.officerId}</div>
            <small class="text-muted">Officer ID</small>
        </td>
        <td>
            <div>${eventName}</div>
            <small class="text-muted">${eventDate}</small>
        </td>
        <td>
            <div>${capitalizeFirst(request.reason.replace('_', ' '))}</div>
        </td>
        <td>
            <span class="badge urgency-${request.urgency}">
                ${capitalizeFirst(request.urgency)}
            </span>
        </td>
        <td>${requestDate}</td>
        <td>
            <span class="badge status-${request.status}">
                ${capitalizeFirst(request.status)}
            </span>
        </td>
        <td>
            <div class="btn-group" role="group">
                <button class="btn btn-sm btn-outline-primary" onclick="viewRequestDetails('${request._id}')">
                    <i class="bi bi-eye"></i>
                </button>
                ${request.status === 'pending' ? `
                    <button class="btn btn-sm btn-outline-success" onclick="respondToRequest('${request._id}', 'approve')">
                        <i class="bi bi-check"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="respondToRequest('${request._id}', 'reject')">
                        <i class="bi bi-x"></i>
                    </button>
                ` : ''}
                ${request.proofFile ? `
                    <button class="btn btn-sm btn-outline-info" onclick="viewProofFile('${request._id}')">
                        <i class="bi bi-paperclip"></i>
                    </button>
                ` : ''}
            </div>
        </td>
    `;
    
    return tr;
}

function bindEventHandlers() {
    // Status filter buttons
    document.querySelectorAll('input[name="statusFilter"]').forEach(radio => {
        radio.addEventListener('change', filterByStatus);
    });
    
    // Response form
    document.getElementById('responseForm').addEventListener('submit', handleResponseSubmit);
    
    // Modal action buttons
    document.getElementById('approveRequestBtn').addEventListener('click', () => {
        showResponseModal('approved');
    });
    
    document.getElementById('rejectRequestBtn').addEventListener('click', () => {
        showResponseModal('rejected');
    });
}

async function viewRequestDetails(requestId) {
    const request = holidayRequests.find(r => r._id === requestId);
    if (!request) return;
    
    selectedRequest = request;
    
    const modal = document.getElementById('requestDetailModal');
    const detailsContainer = document.getElementById('requestDetails');
    
    const eventName = request.eventId ? request.eventId.name : 'Unknown Event';
    const eventDate = request.eventId ? new Date(request.eventId.date).toLocaleDateString() : 'N/A';
    
    detailsContainer.innerHTML = `
        <div class="row mb-3">
            <div class="col-md-6">
                <h6>Officer Information</h6>
                <p><strong>Officer ID:</strong> ${request.officerId}</p>
                <p><strong>Request Date:</strong> ${new Date(request.requestDate).toLocaleDateString()}</p>
            </div>
            <div class="col-md-6">
                <h6>Event Details</h6>
                <p><strong>Event:</strong> ${eventName}</p>
                <p><strong>Event Date:</strong> ${eventDate}</p>
            </div>
        </div>
        
        <div class="mb-3">
            <h6>Request Details</h6>
            <p><strong>Reason:</strong> ${capitalizeFirst(request.reason.replace('_', ' '))}</p>
            <p><strong>Urgency:</strong> 
                <span class="badge urgency-${request.urgency}">
                    ${capitalizeFirst(request.urgency)}
                </span>
            </p>
        </div>
        
        ${request.proofFile ? `
            <div class="mb-3">
                <h6>Proof Document</h6>
                <p class="text-muted">
                    <i class="bi bi-paperclip me-1"></i>
                    ${request.proofFile.filename}
                    <span class="ms-2">(${Math.round(request.proofFile.size / 1024)} KB)</span>
                </p>
                <button class="btn btn-sm btn-outline-primary" onclick="downloadProofFile('${request._id}')">
                    <i class="bi bi-download me-1"></i>Download
                </button>
            </div>
        ` : '<p class="text-muted">No proof file uploaded</p>'}
        
        ${request.status !== 'pending' && request.supervisorResponse ? `
            <div class="mb-3">
                <h6>Supervisor Response</h6>
                <p><strong>Status:</strong> 
                    <span class="badge status-${request.status}">
                        ${capitalizeFirst(request.status)}
                    </span>
                </p>
                <p><strong>Response Date:</strong> ${new Date(request.supervisorResponse.responseDate).toLocaleDateString()}</p>
                ${request.supervisorResponse.comments ? `
                    <p><strong>Comments:</strong></p>
                    <div class="bg-light p-2 rounded">${request.supervisorResponse.comments}</div>
                ` : ''}
            </div>
        ` : ''}
    `;
    
    // Show/hide action buttons based on status
    const approveBtn = document.getElementById('approveRequestBtn');
    const rejectBtn = document.getElementById('rejectRequestBtn');
    
    if (request.status === 'pending') {
        approveBtn.style.display = 'inline-block';
        rejectBtn.style.display = 'inline-block';
    } else {
        approveBtn.style.display = 'none';
        rejectBtn.style.display = 'none';
    }
    
    bootstrap.Modal.getOrCreateInstance(modal).show();
}

function showResponseModal(action) {
    responseAction = action;
    
    const modal = document.getElementById('responseModal');
    const title = document.getElementById('responseModalTitle');
    const submitBtn = document.getElementById('submitResponseBtn');
    
    title.textContent = `${capitalizeFirst(action)} Request`;
    submitBtn.textContent = `${capitalizeFirst(action)} Request`;
    submitBtn.className = `btn ${action === 'approved' ? 'btn-success' : 'btn-danger'}`;
    
    // Hide detail modal and show response modal
    bootstrap.Modal.getInstance(document.getElementById('requestDetailModal')).hide();
    bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function handleResponseSubmit(e) {
    e.preventDefault();
    
    if (!selectedRequest || !responseAction) return;
    
    const formData = new FormData(e.target);
    const comments = formData.get('comments');
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/holidays/${selectedRequest._id}/respond`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: responseAction,
                comments
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(`Request ${responseAction} successfully!`, 'success');
            
            // Update local data
            const request = holidayRequests.find(r => r._id === selectedRequest._id);
            if (request) {
                request.status = responseAction;
                request.supervisorResponse = {
                    supervisorId: currentUser.supabaseId,
                    responseDate: new Date(),
                    comments
                };
            }
            
            // Refresh display
            updateStats();
            displayRequests();
            
            // Close modals
            bootstrap.Modal.getInstance(document.getElementById('responseModal')).hide();
            e.target.reset();
            
        } else {
            showToast(data.error || 'Failed to respond to request', 'error');
        }

    } catch (error) {
        console.error('Response error:', error);
        showToast('Network error. Please try again.', 'error');
    }
}

function filterByStatus() {
    const selectedFilter = document.querySelector('input[name="statusFilter"]:checked').id;
    const rows = document.querySelectorAll('.request-row');
    
    rows.forEach(row => {
        const status = row.dataset.status;
        
        switch (selectedFilter) {
            case 'filterPending':
                row.style.display = status === 'pending' ? '' : 'none';
                break;
            case 'filterApproved':
                row.style.display = status === 'approved' ? '' : 'none';
                break;
            case 'filterRejected':
                row.style.display = status === 'rejected' ? '' : 'none';
                break;
            default: // filterAllRequests
                row.style.display = '';
        }
    });
}

function respondToRequest(requestId, action) {
    const request = holidayRequests.find(r => r._id === requestId);
    if (request) {
        selectedRequest = request;
        showResponseModal(action);
    }
}

function viewProofFile(requestId) {
    const request = holidayRequests.find(r => r._id === requestId);
    if (request && request.proofFile) {
        // In a real implementation, this would open the file
        showToast('Opening proof document...', 'info');
        
        // Simulate file viewing
        setTimeout(() => {
            showToast('Proof document loaded', 'success');
        }, 1000);
    }
}

function downloadProofFile(requestId) {
    const request = holidayRequests.find(r => r._id === requestId);
    if (request && request.proofFile) {
        showToast('Downloading proof document...', 'info');
        
        // Simulate download
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = `data:text/plain,Proof document for request ${requestId}`;
            link.download = request.proofFile.filename || `proof-${requestId}.txt`;
            link.click();
            
            showToast('Download completed', 'success');
        }, 1000);
    }
}

// Utility functions
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showError(message) {
    const tbody = document.getElementById('holidayRequestsBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-4">
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    ${message}
                </div>
            </td>
        </tr>
    `;
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

// Auto-refresh every 5 minutes
setInterval(loadHolidayRequests, 300000);