// Global variables
let currentUser;
let reports = [];
let selectedReport = null;

// Initialize reports page
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
    loadReports();
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

async function loadReports() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/reports', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            reports = data.reports;
            displayReports();
        } else {
            showError(data.error);
        }

    } catch (error) {
        console.error('Load reports error:', error);
        showError('Failed to load reports');
    }
}

function displayReports() {
    const container = document.getElementById('reportsContainer');
    const loadingElement = document.getElementById('loadingReports');
    
    if (loadingElement) {
        loadingElement.remove();
    }
    
    container.innerHTML = '';
    
    if (reports.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-file-earmark-bar-graph text-muted" style="font-size: 4rem;"></i>
                <h4 class="mt-3 text-muted">No Reports Available</h4>
                <p class="text-muted">Reports will appear here after events are completed and analyzed.</p>
            </div>
        `;
        return;
    }

    reports.forEach(report => {
        const reportCard = createReportCard(report);
        container.appendChild(reportCard);
    });
}

function createReportCard(report) {
    const div = document.createElement('div');
    div.className = 'col-lg-6 mb-4';
    
    const eventDate = new Date(report.eventId.date).toLocaleDateString();
    const generatedDate = new Date(report.generatedAt).toLocaleDateString();
    
    // Calculate overall score
    const avgScore = report.officerPerformance.length > 0 
        ? Math.round(report.officerPerformance.reduce((sum, officer) => sum + officer.performanceScore, 0) / report.officerPerformance.length)
        : 0;
    
    const scoreClass = getScoreClass(avgScore);
    
    div.innerHTML = `
        <div class="card report-card h-100" onclick="viewReportDetails('${report._id}')">
            <div class="card-body">
                <div class="report-header mb-3">
                    <div class="flex-grow-1">
                        <h5 class="card-title mb-1">${report.eventId.name}</h5>
                        <div class="report-meta">
                            <span class="text-muted">
                                <i class="bi bi-calendar me-1"></i>${eventDate}
                            </span>
                            <span class="text-muted ms-3">
                                <i class="bi bi-geo-alt me-1"></i>${report.eventId.location.name}
                            </span>
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="performance-score ${scoreClass}">${avgScore}</div>
                        <small class="text-muted">Performance</small>
                    </div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-4 text-center">
                        <h6 class="text-primary mb-0">${report.statistics.totalOfficers}</h6>
                        <small class="text-muted">Officers</small>
                    </div>
                    <div class="col-4 text-center">
                        <h6 class="text-success mb-0">${Math.round(report.statistics.attendanceRate)}%</h6>
                        <small class="text-muted">Attendance</small>
                    </div>
                    <div class="col-4 text-center">
                        <h6 class="text-warning mb-0">${report.statistics.zoneViolations}</h6>
                        <small class="text-muted">Violations</small>
                    </div>
                </div>
                
                <p class="card-text text-muted small">
                    ${report.summary.substring(0, 120)}${report.summary.length > 120 ? '...' : ''}
                </p>
                
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">
                        <i class="bi bi-clock me-1"></i>Generated ${generatedDate}
                    </small>
                    <span class="badge bg-primary">View Details</span>
                </div>
            </div>
        </div>
    `;
    
    return div;
}

function bindEventHandlers() {
    // Export all button
    document.getElementById('exportAllBtn').addEventListener('click', exportAllReports);
    
    // Filter buttons
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active button
            document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('btn-primary'));
            e.target.classList.add('btn-primary');
            
            filterReports(e.target.dataset.filter);
        });
    });
    
    // Export report button in modal
    document.getElementById('exportReportBtn').addEventListener('click', () => {
        if (selectedReport) {
            exportSingleReport(selectedReport._id);
        }
    });
}

async function viewReportDetails(reportId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/reports/${reportId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            selectedReport = data.report;
            displayReportModal(selectedReport);
        } else {
            showToast(data.error, 'error');
        }

    } catch (error) {
        console.error('View report error:', error);
        showToast('Failed to load report details', 'error');
    }
}

function displayReportModal(report) {
    const modal = document.getElementById('reportModal');
    const modalTitle = document.getElementById('reportModalTitle');
    const modalContent = document.getElementById('reportContent');
    
    modalTitle.textContent = `Report: ${report.eventId.name}`;
    
    // Create charts for statistics
    const chartContainer = document.createElement('div');
    chartContainer.innerHTML = `
        <div class="row mb-4">
            <div class="col-md-6">
                <canvas id="attendanceChart" width="300" height="300"></canvas>
            </div>
            <div class="col-md-6">
                <canvas id="performanceChart" width="300" height="300"></canvas>
            </div>
        </div>
    `;
    
    modalContent.innerHTML = `
        <div class="row mb-4">
            <div class="col-12">
                <h6>Event Summary</h6>
                <div class="bg-light p-3 rounded">
                    ${report.summary}
                </div>
            </div>
        </div>
        
        <div class="row mb-4">
            <div class="col-md-3 text-center">
                <h4 class="text-primary">${report.statistics.totalOfficers}</h4>
                <small class="text-muted">Total Officers</small>
            </div>
            <div class="col-md-3 text-center">
                <h4 class="text-success">${Math.round(report.statistics.attendanceRate)}%</h4>
                <small class="text-muted">Attendance Rate</small>
            </div>
            <div class="col-md-3 text-center">
                <h4 class="text-warning">${report.statistics.zoneViolations}</h4>
                <small class="text-muted">Zone Violations</small>
            </div>
            <div class="col-md-3 text-center">
                <h4 class="text-info">${report.statistics.totalIdleTime}m</h4>
                <small class="text-muted">Total Idle Time</small>
            </div>
        </div>
        
        <div class="row mb-4">
            <div class="col-12">
                <h6>Officer Performance</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Officer</th>
                                <th>Attendance</th>
                                <th>Check-in Time</th>
                                <th>Duty Duration</th>
                                <th>Idle Alerts</th>
                                <th>Violations</th>
                                <th>Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${report.officerPerformance.map(officer => `
                                <tr>
                                    <td>
                                        <div>${officer.name}</div>
                                        <small class="text-muted">${officer.badgeNumber}</small>
                                    </td>
                                    <td>
                                        <span class="badge bg-${officer.attendance ? 'success' : 'danger'}">
                                            ${officer.attendance ? 'Present' : 'Absent'}
                                        </span>
                                    </td>
                                    <td>${officer.checkInTime ? formatTime(officer.checkInTime) : 'N/A'}</td>
                                    <td>${Math.round(officer.totalDutyTime || 0)}m</td>
                                    <td>${officer.idleAlerts || 0}</td>
                                    <td>${officer.zoneViolations || 0}</td>
                                    <td>
                                        <span class="badge bg-${getScoreClass(officer.performanceScore)}">
                                            ${officer.performanceScore}/100
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div class="row">
            <div class="col-12">
                <h6>AI Recommendations</h6>
                <ul class="list-group list-group-flush">
                    ${report.recommendations.map(rec => `
                        <li class="list-group-item">
                            <i class="bi bi-lightbulb text-warning me-2"></i>
                            ${rec}
                        </li>
                    `).join('')}
                </ul>
            </div>
        </div>
    `;
    
    bootstrap.Modal.getOrCreateInstance(modal).show();
}

function filterReports(filter) {
    let filteredReports = reports;
    const now = new Date();
    
    switch (filter) {
        case 'recent':
            const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            filteredReports = reports.filter(r => new Date(r.generatedAt) >= sevenDaysAgo);
            break;
        case 'month':
            const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            filteredReports = reports.filter(r => new Date(r.generatedAt) >= thirtyDaysAgo);
            break;
        default:
            filteredReports = reports;
    }
    
    // Re-render with filtered data
    const container = document.getElementById('reportsContainer');
    container.innerHTML = '';
    
    if (filteredReports.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <i class="bi bi-search text-muted" style="font-size: 3rem;"></i>
                <h5 class="mt-3 text-muted">No Reports Found</h5>
                <p class="text-muted">No reports match the selected filter criteria.</p>
            </div>
        `;
        return;
    }
    
    const row = document.createElement('div');
    row.className = 'row';
    
    filteredReports.forEach(report => {
        const reportCard = createReportCard(report);
        row.appendChild(reportCard);
    });
    
    container.appendChild(row);
}

async function exportSingleReport(reportId) {
    try {
        showToast('Preparing report export...', 'info');
        
        // In a real implementation, this would trigger a PDF/Excel export
        setTimeout(() => {
            showToast('Report exported successfully!', 'success');
            
            // Simulate download
            const link = document.createElement('a');
            link.href = `data:text/plain,Report exported for ${selectedReport.eventId.name}`;
            link.download = `report-${selectedReport.eventId.name}-${new Date().toISOString().split('T')[0]}.txt`;
            link.click();
        }, 2000);
        
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed', 'error');
    }
}

async function exportAllReports() {
    try {
        showToast('Preparing bulk export...', 'info');
        
        // Simulate bulk export process
        setTimeout(() => {
            showToast('All reports exported successfully!', 'success');
            
            const link = document.createElement('a');
            link.href = `data:text/plain,Bulk export of ${reports.length} reports`;
            link.download = `all-reports-${new Date().toISOString().split('T')[0]}.txt`;
            link.click();
        }, 3000);
        
    } catch (error) {
        console.error('Bulk export error:', error);
        showToast('Bulk export failed', 'error');
    }
}

// Utility functions
function getScoreClass(score) {
    if (score >= 90) return 'success';
    if (score >= 75) return 'info'; 
    if (score >= 60) return 'warning';
    return 'danger';
}

function formatTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showError(message) {
    const container = document.getElementById('reportsContainer');
    container.innerHTML = `
        <div class="alert alert-danger text-center">
            <i class="bi bi-exclamation-triangle me-2"></i>
            ${message}
        </div>
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