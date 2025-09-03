// Supabase configuration
const supabaseUrl = 'https://your-project.supabase.co'; // This will be set via environment
const supabaseKey = 'your-anon-key'; // This will be set via environment

// Initialize Supabase client (will be configured properly when Supabase is connected)
let supabase;

// Initialize auth system
document.addEventListener('DOMContentLoaded', function() {
    // Form elements
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupFormElement');
    const showSignupBtn = document.getElementById('showSignup');
    const showLoginBtn = document.getElementById('showLogin');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const signupRoleSelect = document.getElementById('signupRole');
    const badgeNumberField = document.getElementById('badgeNumberField');

    // Toggle between login and signup
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').parentElement.classList.add('d-none');
        document.getElementById('signupForm').classList.remove('d-none');
    });

    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('signupForm').classList.add('d-none');
        document.getElementById('loginForm').parentElement.classList.remove('d-none');
    });

    // Password visibility toggle
    togglePasswordBtn.addEventListener('click', () => {
        const passwordInput = document.getElementById('password');
        const icon = togglePasswordBtn.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'bi bi-eye-slash';
        } else {
            passwordInput.type = 'password';
            icon.className = 'bi bi-eye';
        }
    });

    // Show/hide badge number field based on role
    signupRoleSelect.addEventListener('change', (e) => {
        if (e.target.value === 'officer') {
            badgeNumberField.style.display = 'block';
            document.getElementById('badgeNumber').required = true;
        } else {
            badgeNumberField.style.display = 'none';
            document.getElementById('badgeNumber').required = false;
        }
    });

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(loginForm);
        const email = formData.get('email');
        const password = formData.get('password');

        setLoadingState('loginBtn', true);
        hideError();

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                // Store session data
                localStorage.setItem('authToken', data.session.access_token);
                localStorage.setItem('userRole', data.user.role);
                localStorage.setItem('userData', JSON.stringify(data.user));

                // Show success message
                showSuccess('Login successful! Redirecting...');

                // Redirect after short delay
                setTimeout(() => {
                    window.location.href = data.redirectTo;
                }, 1000);

            } else {
                showError(data.error || 'Login failed');
            }

        } catch (error) {
            console.error('Login error:', error);
            showError('Network error. Please try again.');
        } finally {
            setLoadingState('loginBtn', false);
        }
    });

    // Signup form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(signupForm);
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');

        // Validate passwords match
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        const signupData = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            role: formData.get('role'),
            password: password
        };

        // Add badge number for officers
        if (signupData.role === 'officer') {
            signupData.badgeNumber = formData.get('badgeNumber');
        }

        setLoadingState('signupBtn', true);
        hideError();

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(signupData)
            });

            const data = await response.json();

            if (data.success) {
                showSuccess('Account created successfully! You can now sign in.');
                
                // Switch back to login form
                setTimeout(() => {
                    document.getElementById('signupForm').classList.add('d-none');
                    document.getElementById('loginForm').parentElement.classList.remove('d-none');
                }, 2000);

            } else {
                showError(data.error || 'Account creation failed');
            }

        } catch (error) {
            console.error('Signup error:', error);
            showError('Network error. Please try again.');
        } finally {
            setLoadingState('signupBtn', false);
        }
    });
});

// Utility functions
function setLoadingState(buttonId, isLoading) {
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

function showError(message) {
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    
    errorMessage.textContent = message;
    errorAlert.classList.remove('d-none');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        errorAlert.classList.add('d-none');
    }, 5000);
}

function hideError() {
    const errorAlert = document.getElementById('errorAlert');
    errorAlert.classList.add('d-none');
}

function showSuccess(message) {
    // Create success alert if doesn't exist
    let successAlert = document.getElementById('successAlert');
    if (!successAlert) {
        successAlert = document.createElement('div');
        successAlert.id = 'successAlert';
        successAlert.className = 'alert alert-success';
        successAlert.innerHTML = '<i class="bi bi-check-circle me-2"></i><span id="successMessage"></span>';
        
        const errorAlert = document.getElementById('errorAlert');
        errorAlert.parentNode.insertBefore(successAlert, errorAlert.nextSibling);
    }
    
    document.getElementById('successMessage').textContent = message;
    successAlert.classList.remove('d-none');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        successAlert.classList.add('d-none');
    }, 5000);
}

// Check if user is already logged in
function checkExistingSession() {
    const token = localStorage.getItem('authToken');
    const userRole = localStorage.getItem('userRole');
    
    if (token && userRole) {
        // Redirect to appropriate dashboard
        const redirectTo = userRole === 'supervisor' ? '/dashboard' : '/officer';
        window.location.href = redirectTo;
    }
}

// Check on page load
checkExistingSession();