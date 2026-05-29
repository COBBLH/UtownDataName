// =============================================
// SUPERADMIN DASHBOARD — superadmin.js (Supabase REST API)
// =============================================

// ── Supabase Configuration ────────────────────────────────────────────────
const SUPABASE_URL = 'https://bbbaawqqgjzrbadmvpwu.supabase.co/rest/v1/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiYmFhd3FxZ2p6cmJhZG12cHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTkwMzMsImV4cCI6MjA5NDc3NTAzM30.jlqT2BfghVM7h20Oqb8MAu-eiIAQ2kthB_jlMXe-dYQ';

const SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

const SB = {
    async get(table, query) {
        const url = query ? `${SUPABASE_URL}/${table}?${query}` : `${SUPABASE_URL}/${table}`;
        const res = await fetch(url, { headers: SB_HEADERS });
        if (!res.ok) { const e = await res.text(); throw new Error(e); }
        return res.json();
    },
    async insert(table, data) {
        const res = await fetch(`${SUPABASE_URL}/${table}`, {
            method: 'POST', headers: SB_HEADERS, body: JSON.stringify(data)
        });
        if (!res.ok) { const e = await res.text(); throw new Error(e); }
        return res.json();
    },
    async update(table, match, data) {
        const q = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
        const res = await fetch(`${SUPABASE_URL}/${table}?${q}`, {
            method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(data)
        });
        if (!res.ok) { const e = await res.text(); throw new Error(e); }
        return res.json();
    },
    async upsert(table, data) {
        const res = await fetch(`${SUPABASE_URL}/${table}`, {
            method: 'POST',
            headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const e = await res.text(); throw new Error(e); }
        return res.json();
    }
};

// ── Utility Functions ─────────────────────────────────────────────────────
function capitalizeEachSentence(text) {
    if (!text) return '';
    return text
        .split(/([.!?]+\s+)/)
        .map((part, i) => {
            if (i % 2 === 1) return part;
            return part.trim().split(/\s+/).map(word => {
                if (!word) return '';
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }).join(' ');
        })
        .join('')
        .trim();
}

// ── State ─────────────────────────────────────────────────────────────────
let currentUser = null;
let allAdminDocs  = [];
let allSchoolDocs = [];
let _settingsDocId = '';

let activities = [{ type:'login', title:'Admin Login', description:'Super Admin logged into the system', time:'1 day ago' }];

let schoolsData = { all: { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} } };
let academicYears = ['2020-2021','2021-2022','2022-2023','2023-2024','2024-2025'];
const YEAR_WINDOW_SIZE = 10;
let yearWindowStart = 2020;
let currentFilter = 'enrollees';
let currentSchool = 'all';
let currentEducationalLevel = 'all';

let _courseLoadCache = {};
let _dataLoadCache   = {};
let _summaryLoadCache = {};
let _summaryData = {};

let adminPage = 1;
const adminPageSize = 10;
let adminFilteredDocs = [];
let adminSearchQuery  = '';

let courseList = [];
let courseListPage = 1;
const courseListPageSize = 5;
let courseListFiltered = [];

let slFiltered = [];
let slPage = 1;
const slPageSize = 10;

// Course-list panel state
let clAllCourses = [];
let clFiltered   = [];
let clPage       = 1;
const clPageSize  = 10;
let _clCoursesLoaded = false;

// IP / PC cache
let _cachedIP = '';

// Track cells modified since last save so zero values can be written back (BUG #2 fix)
let _pendingChanges = new Set();

// ── IP / PC helpers ───────────────────────────────────────────────────────
async function fetchClientIP() {
    if (_cachedIP) return _cachedIP;
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const json = await res.json();
        _cachedIP = json.ip || 'unknown';
    } catch (e) { _cachedIP = 'unknown'; }
    return _cachedIP;
}
function getPCIdentifier() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Windows NT 10.0') !== -1) return 'Windows 10/11';
    if (ua.indexOf('Mac') !== -1) return 'MacOS';
    if (ua.indexOf('Linux') !== -1) return 'Linux';
    return navigator.platform || 'Unknown';
}

// ── Supabase Activity Log ─────────────────────────────────────────────────
async function saveActivityLog(description, location) {
    try {
        const ip = await fetchClientIP();
        const pc = getPCIdentifier();
        const payload = {
            ActivityLog_AccountRole: 'superadmin',
            ActivityLog_Description: (currentUser ? currentUser.username : 'SuperAdmin') + ' - ' + description,
            ActivityLog_IPAddress:   ip,
            ActivityLog_Location:    location || 'superadmin.html',
            ActivityLog_DeviceName:  pc,
            ActivityLog_created_at:  new Date().toISOString()
        };
        try {
            await SB.insert('ActivityLog', payload);
        } catch (insertErr) {
            // BUG #3 FIX: PostgreSQL sequence out of sync — retry with explicit next ID
            var errStr = String(insertErr.message || insertErr);
            if (errStr.indexOf('23505') !== -1 || errStr.toLowerCase().indexOf('duplicate key') !== -1) {
                try {
                    var maxRows = await SB.get('ActivityLog', 'select=ActivityLog_ID&order=ActivityLog_ID.desc&limit=1');
                    var nextId = (maxRows.length > 0 ? (parseInt(maxRows[0].ActivityLog_ID) || 0) : 0) + 1;
                    await SB.insert('ActivityLog', Object.assign({ ActivityLog_ID: nextId }, payload));
                } catch (retryErr) { console.error('saveActivityLog retry error:', retryErr); }
            } else { throw insertErr; }
        }
    } catch (e) { console.error('saveActivityLog error:', e); }
}
// ── Alias for compatibility ──────────────────────────────
function logActivity(description, location) {
    return saveActivityLog(description, location);
}



// ── Admin Session Check with Proper Error Handling ────────
function checkAdminSession() {
    console.log('🔄 Checking admin session...');
    
    const urlParams = new URLSearchParams(window.location.search);
    const fromMenu = urlParams.get('fromMenu');
    const sessionInit = urlParams.get('sessionInit');
    
    // Show loading overlay
    const loadingOverlay = document.getElementById('sessionLoadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    
    // Try to get stored user data
    let raw = null;
    try {
        raw = localStorage.getItem('utownUser');
    } catch (e) {
        console.error('❌ Error reading localStorage:', e);
        raw = null;
    }
    
    // If no user data found
    if (!raw) {
        console.warn('⚠️ No stored user session found');
        
        // Wait a moment for potential async storage operations
        setTimeout(function() {
            let rawRetry = null;
            try {
                rawRetry = localStorage.getItem('utownUser');
            } catch (e) {
                console.error('❌ Retry: Error reading localStorage:', e);
            }
            
            if (!rawRetry) {
                console.log('🔄 Redirecting to login...');
                sessionStorage.clear();
                window.location.href = 'index.html?action=login&redirect=superadmin.html';
            }
        }, 300);
        return;
    }
    
    // Try to parse user data
    try {
        currentUser = JSON.parse(raw);
        
        // Validate user object
        if (!currentUser || !currentUser.username) {
            throw new Error('Invalid user data structure');
        }
        
        // Ensure all required fields exist
        currentUser.fname = currentUser.fname || currentUser.username || 'Admin';
        currentUser.lname = currentUser.lname || '';
        currentUser.email = currentUser.email || '';
        currentUser.role = currentUser.role || 'superadmin';
        currentUser.sessionId = currentUser.sessionId || 'unknown';
        
        console.log('✅ Session loaded for user:', currentUser.username);
        console.log('   Session ID:', currentUser.sessionId);
        console.log('   Started:', currentUser.sessionStartTime);
        
        // Update UI
        updateUIForLoggedInAdmin();
        
        // Log the access
        if (sessionInit === '1') {
            console.log('📝 Logging dashboard access...');
            saveActivityLog(
                currentUser.username + ' logged into admin dashboard',
                'superadmin.html'
            ).catch(function(err) {
                console.warn('Warning: Could not log activity:', err);
            });
        }
        
        // Clean up URL parameters
        if (sessionInit === '1' || fromMenu === '1') {
            window.history.replaceState({}, document.title, 'superadmin.html');
        }
        
        // Hide loading overlay and show dashboard
        if (loadingOverlay) {
            setTimeout(function() {
                loadingOverlay.style.opacity = '0';
                loadingOverlay.style.transition = 'opacity 0.3s ease';
                setTimeout(function() {
                    loadingOverlay.style.display = 'none';
                }, 300);
            }, 500);
        }
        
        // Emit ready event
        try {
            window.dispatchEvent(new Event('dashboardReady'));
        } catch (e) {
            console.log('Dashboard ready');
        }
        
    } catch (parseError) {
        console.error('❌ Error parsing user data:', parseError);
        console.log('Raw data was:', raw);
        
        // Clear invalid data
        try {
            localStorage.removeItem('utownUser');
        } catch (e) {
            console.error('Error clearing localStorage:', e);
        }
        
        sessionStorage.clear();
        window.location.href = 'index.html?action=login&redirect=superadmin.html';
    }
}


















function handleSignIn() {
    // If user is already logged in, go to dashboard
    if (currentUser) {
        showSection('school-data');
        return;
    }
    // Otherwise, redirect to home page login
    window.location.href = 'index.html?action=login';
}
// ── Update UI for Logged-In Admin ──────────────────────────────
function updateUIForLoggedInAdmin() {
    const displayName = currentUser.fname || currentUser.username || 'Admin';
    const email = currentUser.email || 'admin@system.com';
    
    // Update all user dropdown text elements
    document.querySelectorAll('#userDropdownText, #mobileUserDropdownText').forEach(function(el) {
        el.textContent = 'Hello, ' + displayName;
    });

    // Update page title to show logged-in user
    document.title = 'ADMIN DASHBOARD - ' + displayName.toUpperCase() + ' | UTOWN DATA';

    // Show user dropdown, hide sign-in buttons
    const signInBtn = document.getElementById('signInButton');
    const mobileSignInBtn = document.getElementById('mobileSignInButton');
    const userDropdown = document.getElementById('userDropdown');
    const mobileUserDropdown = document.getElementById('mobileUserDropdown');

    if (signInBtn) signInBtn.classList.add('hidden');
    if (mobileSignInBtn) mobileSignInBtn.classList.add('hidden');
    if (userDropdown) userDropdown.classList.remove('hidden');
    if (mobileUserDropdown) mobileUserDropdown.classList.remove('hidden');
    
    // Log session info for debugging
    console.log('✅ Admin session loaded:', {
        name: displayName,
        email: email,
        role: currentUser.role || 'superadmin',
        loginTime: new Date().toLocaleString()
    });
    
    // Show a subtle toast to confirm login data was loaded
    if (sessionStorage.getItem('showLoginConfirmation')) {
        sessionStorage.removeItem('showLoginConfirmation');
        showToast('Login information loaded successfully', 'success');
    }
}

// ── Check localStorage Availability ──────────────────────────
function isLocalStorageAvailable() {
    try {
        const test = '__localStorage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        console.warn('localStorage is not available:', e);
        return false;
    }
}

// ── Get Stored User Session ──────────────────────────────────
function getStoredUserSession() {
    if (!isLocalStorageAvailable()) {
        console.warn('Cannot access localStorage for session data');
        return null;
    }
    
    try {
        const raw = localStorage.getItem('utownUser');
        if (!raw) return null;
        
        const user = JSON.parse(raw);
        
        // Validate user object has required fields
        if (!user.username) {
            console.warn('Stored user data is invalid');
            localStorage.removeItem('utownUser');
            return null;
        }
        
        return user;
    } catch (e) {
        console.error('Error parsing stored user session:', e);
        localStorage.removeItem('utownUser');
        return null;
    }
}

// ── Display Session Info in Console ──────────────────────────
function logSessionInfo() {
    const user = getStoredUserSession();
    if (user) {
        console.log('═══════════════════════════════════════');
        console.log('✅ SESSION ACTIVE');
        console.log('═══════════════════════════════════════');
        console.log('User:', user.fullname || user.username);
        console.log('Role:', user.role || 'superadmin');
        console.log('Stored At:', localStorage.getItem('utownUser') ? 'localStorage ✓' : 'Not found');
        console.log('═══════════════════════════════════════');
    }
}


// ── Navigation ────────────────────────────────────────────────────────────
function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.toggle('active');
    document.querySelector('.mobile-menu-btn').classList.toggle('active');
}
function closeMobileMenu() {
    document.getElementById('mobileMenu').classList.remove('active');
    document.querySelector('.mobile-menu-btn').classList.remove('active');
}
function toggleUserDropdown()       { document.getElementById('userDropdownContent').classList.toggle('show'); }
function toggleMobileUserDropdown() { document.getElementById('mobileUserDropdownContent').classList.toggle('show'); }

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById(sectionId).classList.add('active');
    document.querySelectorAll('.sidebar-menu a').forEach(function(link) { link.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');

    if (sectionId === 'activity-log') {
        if (!activityLogState.initialized && !activityLogState.isLoading) initActivityLog();
    }
    if (sectionId === 'add-school') {
        slPopulateFilter();
        slFiltered = allSchoolDocs.slice();
        slFilterSchools();
    }
    if (sectionId === 'add-course') {
        clPopulateFilters();
        clLoadCoursesFromSupabase();
    }
    if (sectionId === 'settings') { loadSettingsIntoForm(); showSettingsTab('reported-issues'); }
}

function handleLogout()   { openLogoutModal(); }
function openLogoutModal() { document.getElementById('logoutConfirmModal').style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeLogoutModal() { document.getElementById('logoutConfirmModal').style.display = 'none'; document.body.style.overflow = 'auto'; }
function confirmLogout() {
    closeLogoutModal();
    currentUser = null;
    localStorage.removeItem('utownUser');
    sessionStorage.removeItem('redirectAfterLogin');
    
    // Log the logout action before redirecting
    logActivity('Logged out from admin dashboard', 'Admin Dashboard').then(function() {
        // Redirect to home page
        window.location.href = 'index.html?loggedOut=true';
    }).catch(function() {
        // If logging fails, still redirect
        window.location.href = 'index.html?loggedOut=true';
    });
}
// ── Handle Login Redirect from URL Parameters ──────────────────
function handleLoginRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const loginAction = urlParams.get('action');
    const redirectPage = urlParams.get('redirect');
    const loggedOut = urlParams.get('loggedOut');

    // If user was logged out, show a logout notification
    if (loggedOut === 'true') {
        setTimeout(function() {
            showToast('You have been logged out successfully');
        }, 300);
        // Clean up URL
        window.history.replaceState({}, document.title, 'index.html');
    }

    // If action is 'login', open the login modal
    if (loginAction === 'login') {
        setTimeout(function() {
            handleSignIn();
            // Clean up URL
            window.history.replaceState({}, document.title, 'index.html');
        }, 100);
    }

    // Store redirect destination for after successful login
    if (redirectPage) {
        sessionStorage.setItem('redirectAfterLogin', redirectPage);
    }
}
function handleSignOut() {
    openLogoutModal();
}
// ── Intercept Login Success to Handle Redirects ──────────────
function handleLoginSuccess(user) {
    currentUser = user;
    
    // ✅ SAVE LOGIN DATA TO localStorage
    localStorage.setItem('utownUser', JSON.stringify(currentUser));
    
    const displayName = currentUser.fname ? currentUser.fname : user.username;
    showToast('Login successful! Welcome back, ' + displayName);
    updateUIForLoggedInUser(currentUser);
    closeLoginModal();
    
    // Clear form
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';

    // Log activity
    logActivityToSupabase(currentUser, 'has Login');
    
    // Set flag to show confirmation when redirecting to dashboard
    sessionStorage.setItem('showLoginConfirmation', 'true');

    // Check if there's a redirect destination
    const redirectPage = sessionStorage.getItem('redirectAfterLogin');
    if (redirectPage) {
        sessionStorage.removeItem('redirectAfterLogin');
        // Redirect to the protected page after a short delay
        setTimeout(function() {
            window.location.href = redirectPage;
        }, 1000);
    }
}
function openAboutModal()   { document.getElementById('aboutModal').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function openContactModal() { document.getElementById('contactModal').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; document.body.style.overflow = 'auto'; }

function adminSearchFilter(searchTerm) {
    document.getElementById('adminSearchInput').value = searchTerm;
    filterAdminAccounts();
}

function handleContactSubmit(event) {
    event.preventDefault();
    const firstName = document.getElementById('firstName').value;
    const lastName  = document.getElementById('lastName').value;
    if (firstName && lastName) {
        alert('Thank you, ' + firstName + ' ' + lastName + '! Your message has been sent successfully.');
        closeModal('contactModal');
        ['firstName','lastName','contactEmail','contactPhone','subject','message'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
}

function toggleInputPassword(inputId, btn) {
    var input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(message, type) {
    type = type || 'success';
    const container = document.getElementById('toastContainer') || document.body;
    const existing = document.querySelector('.toast-sa');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-sa';
    toast.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:' + (type === 'error' ? '#dc2626' : '#1e293b') + ';color:#fff;padding:1rem 1.5rem;border-radius:14px;display:flex;align-items:center;gap:.75rem;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.2);transform:translateX(110%);transition:transform .3s ease;max-width:420px;';
    const icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
    toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
    document.body.appendChild(toast);
    setTimeout(function() { toast.style.transform = 'translateX(0)'; }, 50);
    setTimeout(function() { toast.style.transform = 'translateX(110%)'; setTimeout(function() { if (toast.parentElement) toast.remove(); }, 300); }, 3500);
}

// ── Activity Log in sidebar ───────────────────────────────────────────────
function updateActivityLog() {
    const container = document.getElementById('activityList');
    if (!container) return;
    container.innerHTML = '';
    activities.slice(0, 5).forEach(function(activity) {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML =
            '<div class="activity-icon ' + (activity.type || 'login') + '"><i class="fas fa-' + (activity.type === 'add' ? 'plus' : activity.type === 'delete' ? 'trash' : activity.type === 'edit' ? 'edit' : 'sign-in-alt') + '"></i></div>' +
            '<div class="activity-details"><span class="activity-title">' + (activity.title || '') + '</span><span class="activity-time">' + (activity.time || '') + '</span></div>';
        container.appendChild(item);
    });
}

// ── Phone helpers ─────────────────────────────────────────────────────────
function formatPhoneNumber(input) {
    let digits = input.value.replace(/\D/g, '');
    if (!digits.startsWith('09')) digits = '09' + digits.replace(/^0*9*/, '');
    digits = digits.substring(0, 11);
    let formatted = '';
    if (digits.length <= 4)       formatted = digits;
    else if (digits.length <= 7)  formatted = digits.substring(0,4) + '-' + digits.substring(4);
    else                          formatted = digits.substring(0,4) + '-' + digits.substring(4,7) + '-' + digits.substring(7);
    input.value = formatted;
}

function validatePhoneNumber(value) {
    const digits = value.replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('09');
}

// ── School Filter Dropdown ────────────────────────────────────────────────
function updateSchoolFilterDropdown() {
    const sel = document.getElementById('schoolFilter');
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    allSchoolDocs.forEach(function(school) {
        const opt = document.createElement('option');
        opt.value = school.docId;
        opt.textContent = school.schoolname;
        sel.appendChild(opt);
    });
}

// ── Year Window ───────────────────────────────────────────────────────────
function getCurrentAcademicYear() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    return m >= 7 ? (y + '-' + (y + 1)) : ((y - 1) + '-' + y);
}
function getVisibleYears() {
    var years = [];
    for (var i = 0; i < YEAR_WINDOW_SIZE; i++) years.push((yearWindowStart + i) + '-' + (yearWindowStart + i + 1));
    return years;
}
function initYearWindowStart() {
    var realYear = new Date().getFullYear();
    yearWindowStart = Math.floor(realYear / 10) * 10;
}
function yearNavPrev() { yearWindowStart -= YEAR_WINDOW_SIZE; renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); }
function yearNavNext() { yearWindowStart += YEAR_WINDOW_SIZE; renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); }
function renderYearNavigator() {}

// ── Sync visible years into academicYears ─────────────────────────────────
// Ensures every year shown in the table has a real numeric index in
// academicYears so data can be stored, iterated, and saved correctly.
// Years beyond the original list (e.g. 2025-2026 onwards) were being stored
// at index -1 (a non-iterable JS array property) which caused
// saveAllDataToSupabase .forEach() to silently skip them on save.
function syncVisibleYearsToAcademicYears() {
    getVisibleYears().forEach(function(year) {
        if (academicYears.indexOf(year) === -1) {
            academicYears.push(year);
            // Extend every existing course data array so indices stay aligned
            Object.keys(schoolsData).forEach(function(school) {
                Object.keys(schoolsData[school]).forEach(function(cat) {
                    Object.keys(schoolsData[school][cat]).forEach(function(course) {
                        while (schoolsData[school][cat][course].length < academicYears.length) {
                            schoolsData[school][cat][course].push({ male: 0, female: 0 });
                        }
                    });
                });
            });
        }
    });
}

// ── Summary Stats ─────────────────────────────────────────────────────────
function loadSummaryStatsFromFirestore() {
    var statIds = ['totalEnrollees','totalOutside','totalInside','totalGraduates','totalPassers'];
    if (currentEducationalLevel === 'all' || currentSchool === 'all') {
        statIds.forEach(function(id) { var el = document.getElementById(id); if (el) el.textContent = '0'; });
        return;
    }
    var cacheKey = currentSchool + '_' + currentEducationalLevel;
    if (_summaryLoadCache[cacheKey] && _summaryData[cacheKey]) {
        var c = _summaryData[cacheKey];
        document.getElementById('totalOutside').textContent   = c.outside.toLocaleString();
        document.getElementById('totalInside').textContent    = c.inside.toLocaleString();
        document.getElementById('totalGraduates').textContent = c.graduates.toLocaleString();
        document.getElementById('totalPassers').textContent   = c.passers.toLocaleString();
        document.getElementById('totalEnrollees').textContent = (c.outside + c.inside + c.graduates + c.passers).toLocaleString();
        return;
    }
    var eduMap = { bachelor:'BACHELOR DEGREE', twoyear:'2-YEAR COURSE', tesda:'TESDA', graduate:'GRADUATE COURSE' };
    var targetEdu = eduMap[currentEducationalLevel];
    if (!targetEdu) return;
    var categorySupabaseMap = {
        outside:   'OutsideBataan',
        inside:    'InsideBataan',
        graduates: 'Graduates',
        passers:   'NumberofBoardPasser'
    };
    var statElementMap = {
        outside:   'totalOutside',
        inside:    'totalInside',
        graduates: 'totalGraduates',
        passers:   'totalPassers'
    };
    statIds.forEach(function(id) { var el = document.getElementById(id); if (el) el.textContent = '...'; });
    var totals = { outside: 0, inside: 0, graduates: 0, passers: 0 };
    var completed = 0;
    var totalCategories = Object.keys(categorySupabaseMap).length;
    Object.keys(categorySupabaseMap).forEach(function(catKey) {
        var qs = 'DA_SchoolID=eq.' + encodeURIComponent(currentSchool) +
                 '&DA_EducationalAttainment=eq.' + encodeURIComponent(targetEdu) +
                 '&DA_Category=eq.' + encodeURIComponent(categorySupabaseMap[catKey]);
        SB.get('Data_Analytics', qs).then(function(rows) {
            var catTotal = 0;
            rows.forEach(function(r) { catTotal += (parseInt(r.DA_Male) || 0) + (parseInt(r.DA_Female) || 0); });
            totals[catKey] = catTotal;
            var el = document.getElementById(statElementMap[catKey]);
            if (el) el.textContent = catTotal.toLocaleString();
            var enrolleesTotal = totals.outside + totals.inside + totals.graduates + totals.passers;
            var enrolleesEl = document.getElementById('totalEnrollees');
            if (enrolleesEl) enrolleesEl.textContent = enrolleesTotal.toLocaleString();
            completed++;
            if (completed === totalCategories) {
                _summaryData[cacheKey] = { outside: totals.outside, inside: totals.inside, graduates: totals.graduates, passers: totals.passers };
                _summaryLoadCache[cacheKey] = true;
            }
        }).catch(function(err) {
            console.error('loadSummaryStatsFromFirestore error for ' + catKey + ':', err);
            var el = document.getElementById(statElementMap[catKey]);
            if (el) el.textContent = 'Error';
            completed++;
        });
    });
}
function filterBySchool() {
    const schoolFilter = document.getElementById('schoolFilter');
    currentSchool = schoolFilter.value;
    const sectionTitle = document.querySelector('#school-data .section-title');
    if (sectionTitle) {
        const schoolName = currentSchool === 'all' ? 'All Schools' : schoolFilter.options[schoolFilter.selectedIndex].text;
        sectionTitle.innerHTML = '<i class="fas fa-chart-bar"></i> School Data Analytics - ' + schoolName;
    }
    var cacheKey = currentSchool + '_' + currentEducationalLevel;
    _courseLoadCache[cacheKey] = false;
    _summaryLoadCache[cacheKey] = false;
    delete _summaryData[cacheKey];
    ['outside','inside','graduates','passers','enrollees'].forEach(function(cat) {
        _dataLoadCache[cacheKey + '_' + cat] = false;
    });
    loadCoursesFromSupabase();
    loadDataFromSupabase();
    if (currentEducationalLevel !== 'all' && currentSchool !== 'all') {
        loadSummaryStatsFromFirestore();
    }
    var schoolLabel = schoolFilter.options[schoolFilter.selectedIndex].text;
    activities.unshift({ type:'edit', title:'Filter Applied', description:'Data filtered by school: ' + schoolLabel, time:'Just now' });
    updateActivityLog();
    saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' filtered data by school: ' + schoolLabel, 'superadmin.html');
}

async function filterByEducationalAttainment() {
    const educationalFilter = document.getElementById('educationalFilter');
    currentEducationalLevel = educationalFilter.value;
    var cacheKey = currentSchool + '_' + currentEducationalLevel;
    _courseLoadCache[cacheKey] = false;
    _summaryLoadCache[cacheKey] = false;
    ['outside','inside','graduates','passers','enrollees'].forEach(function(cat) {
        _dataLoadCache[cacheKey + '_' + cat] = false;
    });
    await loadCoursesFromSupabase();
    await loadDataFromSupabase();
    loadSummaryStatsFromFirestore();
    var eduName = educationalFilter.options[educationalFilter.selectedIndex].text;
    activities.unshift({ type:'edit', title:'Educational Filter Applied', description:'Data filtered by educational attainment: ' + eduName, time:'Just now' });
    updateActivityLog();
    saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' filtered data by educational attainment: ' + eduName, 'superadmin.html');
}

async function filterByCategory() {
    const categoryFilter = document.getElementById('categoryFilter');
    currentFilter = categoryFilter.value;
    var cacheKey = currentSchool + '_' + currentEducationalLevel + '_' + currentFilter;
    _dataLoadCache[cacheKey] = false;
    await loadDataFromSupabase();
    if (currentEducationalLevel !== 'all' && currentSchool !== 'all') {
        loadSummaryStatsFromFirestore();
    }
    activities.unshift({ type:'edit', title:'Category Filter Applied', description:'Filtered by category: ' + categoryFilter.options[categoryFilter.selectedIndex].text, time:'Just now' });
    updateActivityLog();
}

// ── Load Courses From Supabase ────────────────────────────────────────────
async function loadCoursesFromSupabase() {
    // BUG FIX: ensure 2025-2026+ are real array indices before initialising course arrays
    syncVisibleYearsToAcademicYears();
    if (currentSchool === 'all' || currentEducationalLevel === 'all') { courseList = []; updateUnifiedTable(); return; }
    var cacheKey = currentSchool + '_' + currentEducationalLevel;
    if (_courseLoadCache[cacheKey]) { updateUnifiedTable(); return; }

    var eduMap = { bachelor:'BACHELOR DEGREE', twoyear:'2-YEAR COURSE', tesda:'TESDA', graduate:'GRADUATE COURSE' };
    var targetEduLabel = eduMap[currentEducationalLevel];

    try {
        if (_clCoursesLoaded && clAllCourses.length) {
            var targetEduFull = targetEduLabel;
            courseList = courseList.filter(function(c) { return c.school !== currentSchool || c.eduLevel !== targetEduFull; });
            clAllCourses.forEach(function(c) {
                if (c.schoolDocId !== currentSchool) return;
                if (targetEduFull && c.eduLevel !== targetEduFull) return;
                var targetKey = c.schoolDocId || 'all';
                if (!schoolsData[targetKey]) schoolsData[targetKey] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
                ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
                    if (!schoolsData[targetKey][cat][c.courseName]) {
                        schoolsData[targetKey][cat][c.courseName] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
                    }
                });
                var already = courseList.find(function(x) { return x.name === c.courseName && x.school === c.schoolDocId; });
                if (!already) courseList.push({ id: c.docId, name: c.courseName, school: c.schoolDocId, schoolLabel: c.schoolName || '', eduLevel: c.eduLevel || '' });
            });
            _courseLoadCache[cacheKey] = true;
            updateUnifiedTable(); updateSummary();
            return;
        }

        let qs = 'course_Deletestats=eq.0&course_SchoolID=eq.' + encodeURIComponent(currentSchool);
        if (targetEduLabel) qs += '&course_EducationalAttainment=eq.' + encodeURIComponent(targetEduLabel);
        const rows = await SB.get('COURSE', qs);
        courseList = courseList.filter(function(c) { return c.school !== currentSchool || c.eduLevel !== targetEduLabel; });
        rows.forEach(function(r) {
            var targetKey = r.course_SchoolID || 'all';
            if (!schoolsData[targetKey]) schoolsData[targetKey] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
            ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
                if (!schoolsData[targetKey][cat][r.course_SchoolCourse]) {
                    schoolsData[targetKey][cat][r.course_SchoolCourse] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
                }
            });
            var already = courseList.find(function(c) { return c.name === r.course_SchoolCourse && c.school === r.course_SchoolID; });
            if (!already) courseList.push({ id: r.course_id, name: r.course_SchoolCourse, school: r.course_SchoolID, schoolLabel: r.course_SchoolName || '', eduLevel: r.course_EducationalAttainment || '' });
        });
        _courseLoadCache[cacheKey] = true;
        updateUnifiedTable(); updateSummary();
    } catch (e) { console.error('loadCoursesFromSupabase error:', e); }
}

// ── Load Data Analytics from Supabase ────────────────────────────────────
async function loadDataFromSupabase() {
    if (currentSchool === 'all') return;
    var cacheKey = currentSchool + '_' + currentEducationalLevel + '_' + currentFilter;
    if (_dataLoadCache[cacheKey]) { updateUnifiedTable(); return; }

    var eduMap = { bachelor:'BACHELOR DEGREE', twoyear:'2-YEAR COURSE', tesda:'TESDA', graduate:'GRADUATE COURSE' };
    var targetEdu = eduMap[currentEducationalLevel];

    var categorySupabaseMap = {
        outside:   'OutsideBataan',
        inside:    'InsideBataan',
        graduates: 'Graduates',
        passers:   'NumberofBoardPasser'
    };
    var targetCategory = categorySupabaseMap[currentFilter];
    if (!targetCategory) { updateUnifiedTable(); return; }

    try {
        let qs = 'DA_SchoolID=eq.' + encodeURIComponent(currentSchool) + '&DA_Category=eq.' + encodeURIComponent(targetCategory);
        if (targetEdu) qs += '&DA_EducationalAttainment=eq.' + encodeURIComponent(targetEdu);
        const rows = await SB.get('Data_Analytics', qs);

        var targetKey = currentSchool;
        var targetCategory2 = currentFilter;

        if (!schoolsData[targetKey]) schoolsData[targetKey] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
        if (!schoolsData[targetKey][targetCategory2]) schoolsData[targetKey][targetCategory2] = {};

        var loadedData = {};
        rows.forEach(function(r) {
            var courseName = r.DA_Course;
            var year = r.DA_Year;
            var male = parseInt(r.DA_Male) || 0;
            var female = parseInt(r.DA_Female) || 0;
            if (!loadedData[courseName]) loadedData[courseName] = {};
            loadedData[courseName][year] = { male: male, female: female };
        });

        Object.keys(loadedData).forEach(function(courseName) {
            if (!schoolsData[targetKey][targetCategory2][courseName]) {
                schoolsData[targetKey][targetCategory2][courseName] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
            }
            Object.keys(loadedData[courseName]).forEach(function(year) {
                var yearIndex = academicYears.indexOf(year);
                if (yearIndex !== -1) {
                    schoolsData[targetKey][targetCategory2][courseName][yearIndex] = loadedData[courseName][year];
                }
            });
        });

        _dataLoadCache[currentSchool + '_' + currentEducationalLevel + '_' + currentFilter] = true;
        updateUnifiedTable(); updateSummary();
    } catch (error) { console.error('loadDataFromSupabase error:', error); }
}

// Legacy alias
const loadDataFromFirestoreAndUpdate = loadDataFromSupabase;
const loadCoursesFromFirestore = loadCoursesFromSupabase;

// ── Unified Table ─────────────────────────────────────────────────────────
function updateUnifiedTableHeaders() {
    const mainHeaderRow = document.getElementById('mainHeaderRow');
    const subHeaderRow  = document.getElementById('subHeaderRow');
    if (!mainHeaderRow || !subHeaderRow) return;
    mainHeaderRow.querySelectorAll('th:not(:first-child)').forEach(function(h) { h.remove(); });
    subHeaderRow.querySelectorAll('th').forEach(function(h) { h.remove(); });
    getVisibleYears().forEach(function(year) {
        const yearHeader = document.createElement('th');
        yearHeader.className = 'year-header' + (year === getCurrentAcademicYear() ? ' year-header-current' : '');
        yearHeader.colSpan = 3; yearHeader.textContent = year;
        mainHeaderRow.appendChild(yearHeader);
        const f = document.createElement('th'); f.className = 'gender-subheader female-header'; f.textContent = 'FEMALE'; subHeaderRow.appendChild(f);
        const m = document.createElement('th'); m.className = 'gender-subheader male-header';   m.textContent = 'MALE';   subHeaderRow.appendChild(m);
        const t = document.createElement('th'); t.className = 'gender-subheader total-header';  t.textContent = 'TOTAL';  subHeaderRow.appendChild(t);
    });
}

function updateUnifiedTable() {
    const tableBody = document.getElementById('unifiedTableBody');
    if (!tableBody) return;
    // BUG FIX: ensure 2025-2026+ are real array indices before rendering
    syncVisibleYearsToAcademicYears();
    if (!schoolsData[currentSchool]) schoolsData[currentSchool] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
    if (!schoolsData[currentSchool][currentFilter]) schoolsData[currentSchool][currentFilter] = {};
    tableBody.innerHTML = '';
    const _tableFragment = document.createDocumentFragment();

    var coursesToShow;
    if (currentSchool === 'all' || currentEducationalLevel === 'all') {
        coursesToShow = [];
    } else {
        var eduMap = { bachelor:'BACHELOR DEGREE', twoyear:'2-YEAR COURSE', tesda:'TESDA', graduate:'GRADUATE COURSE' };
        var targetEduLabel = eduMap[currentEducationalLevel];
        var filtered = courseList.filter(function(c) {
            return c.school === currentSchool && (!targetEduLabel || c.eduLevel === targetEduLabel);
        });
        coursesToShow = filtered.map(function(c) { return c.name; }).filter(function(v, i, a) { return a.indexOf(v) === i; });
        coursesToShow.forEach(function(name) {
            ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
                if (!schoolsData[currentSchool][cat]) schoolsData[currentSchool][cat] = {};
                if (!schoolsData[currentSchool][cat][name]) {
                    schoolsData[currentSchool][cat][name] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
                }
            });
        });
    }

    var data = schoolsData[currentSchool][currentFilter];
    coursesToShow.forEach(function(course) {
        var courseData = data[course];
        if (!courseData) return;
        var row = document.createElement('tr');
        row.className = 'course-row';
        var rowHTML = '<td><input type="checkbox" class="course-checkbox" data-course="' + course + '"><span class="course-name">' + course + '</span></td>';
        getVisibleYears().forEach(function(year) {
            var realYearIndex = academicYears.indexOf(year);
            var genderData = realYearIndex !== -1 ? courseData[realYearIndex] : null;
            var maleValue   = (genderData && typeof genderData === 'object') ? (genderData.male   || 0) : 0;
            var femaleValue = (genderData && typeof genderData === 'object') ? (genderData.female || 0) : 0;
            var totalValue  = maleValue + femaleValue;
            rowHTML +=
                '<td class="gender-data-cell female"><input type="number" class="editable-input" value="' + femaleValue + '" onchange="updateGenderData(\'' + course.replace(/'/g,"\\'") + '\',' + realYearIndex + ',\'female\',this.value)" min="0"></td>' +
                '<td class="gender-data-cell male"><input type="number" class="editable-input" value="' + maleValue + '" onchange="updateGenderData(\'' + course.replace(/'/g,"\\'") + '\',' + realYearIndex + ',\'male\',this.value)" min="0"></td>' +
                '<td class="gender-data-cell total">' + totalValue + '</td>';
        });
        row.innerHTML = rowHTML;
        _tableFragment.appendChild(row);
    });
    tableBody.appendChild(_tableFragment);
}

function updateGenderData(course, yearIndex, gender, value) {
    const newValue = parseInt(value) || 0;
    if (!schoolsData[currentSchool][currentFilter][course][yearIndex]) {
        schoolsData[currentSchool][currentFilter][course][yearIndex] = {male:0,female:0};
    }
    schoolsData[currentSchool][currentFilter][course][yearIndex][gender] = newValue;
    const row = event.target.closest('tr');
    const cellIndex = Array.from(row.cells).indexOf(event.target.closest('td'));
    const yearGroupIndex = Math.floor((cellIndex - 1) / 3);
    const totalCellIndex = yearGroupIndex * 3 + 3;
    if (row.cells[totalCellIndex]) {
        const maleVal   = parseInt(row.cells[totalCellIndex - 2].querySelector('input').value) || 0;
        const femaleVal = parseInt(row.cells[totalCellIndex - 1].querySelector('input').value) || 0;
        row.cells[totalCellIndex].textContent = maleVal + femaleVal;
    }
    updateSummary();
    // Track this cell as modified so zero values are written back on save (BUG #2 fix)
    _pendingChanges.add(currentSchool + '|' + currentFilter + '|' + course + '|' + yearIndex);
    // NOTE: per-cell activity logging removed (caused ActivityLog duplicate-key flood – BUG #3)
    row.classList.add('highlight');
    setTimeout(function() { row.classList.remove('highlight'); }, 1000);
}

function updateSummary() {
    if (currentEducationalLevel === 'all') {
        ['totalEnrollees','totalOutside','totalInside','totalGraduates','totalPassers'].forEach(function(id) {
            var el = document.getElementById(id); if (el) el.textContent = '0';
        });
        return;
    }
    var cacheKey = currentSchool + '_' + currentEducationalLevel;
    if (_summaryLoadCache[cacheKey] && _summaryData[cacheKey]) {
        var c = _summaryData[cacheKey];
        document.getElementById('totalOutside').textContent   = c.outside.toLocaleString();
        document.getElementById('totalInside').textContent    = c.inside.toLocaleString();
        document.getElementById('totalGraduates').textContent = c.graduates.toLocaleString();
        document.getElementById('totalPassers').textContent   = c.passers.toLocaleString();
        document.getElementById('totalEnrollees').textContent = (c.outside + c.inside + c.graduates + c.passers).toLocaleString();
        return;
    }
    function sumCategory(catKey) {
        var schoolKey = currentSchool || 'all';
        if (!schoolsData[schoolKey] || !schoolsData[schoolKey][catKey]) return 0;
        var total = 0;
        Object.keys(schoolsData[schoolKey][catKey]).forEach(function(course) {
            (schoolsData[schoolKey][catKey][course] || []).forEach(function(gd) {
                if (gd && typeof gd === 'object') total += (gd.male || 0) + (gd.female || 0);
                else total += (gd || 0);
            });
        });
        return total;
    }
    var outsideTotal   = sumCategory('outside');
    var insideTotal    = sumCategory('inside');
    var graduatesTotal = sumCategory('graduates');
    var passersTotal   = sumCategory('passers');
    var enrolleesTotal = outsideTotal + insideTotal + graduatesTotal + passersTotal;
    document.getElementById('totalEnrollees').textContent = enrolleesTotal.toLocaleString();
    document.getElementById('totalOutside').textContent   = outsideTotal.toLocaleString();
    document.getElementById('totalInside').textContent    = insideTotal.toLocaleString();
    document.getElementById('totalGraduates').textContent = graduatesTotal.toLocaleString();
    document.getElementById('totalPassers').textContent   = passersTotal.toLocaleString();
}

function toggleSelectAllCourses() {
    const selectAll = document.getElementById('selectAllCourses');
    document.querySelectorAll('.course-checkbox').forEach(function(cb) { cb.checked = selectAll.checked; });
}

function deleteSelectedCourses() {
    const checkboxes = document.querySelectorAll('.course-checkbox:checked');
    if (checkboxes.length === 0) { alert('Please select courses to delete.'); return; }
    if (confirm('Are you sure you want to delete ' + checkboxes.length + ' course(s)?')) {
        const deletedCourses = [];
        checkboxes.forEach(function(cb) {
            const course = cb.dataset.course;
            deletedCourses.push(course);
            Object.keys(schoolsData[currentSchool]).forEach(function(cat) { delete schoolsData[currentSchool][cat][course]; });
        });
        updateUnifiedTable(); updateSummary();
        document.getElementById('selectAllCourses').checked = false;
        activities.unshift({ type:'delete', title:'Courses Deleted', description: deletedCourses.length + ' course(s) removed: ' + deletedCourses.join(', '), time:'Just now' });
        updateActivityLog();
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' deleted ' + deletedCourses.length + ' course(s): ' + deletedCourses.join(', '), 'superadmin.html');
    }
}

function searchTable() {
    const searchTerm = (document.getElementById('tableSearch') ? document.getElementById('tableSearch').value : '').toLowerCase();
    document.querySelectorAll('#unifiedTableBody tr').forEach(function(row) {
        const courseName = row.querySelector('.course-name');
        if (courseName) row.style.display = courseName.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
    });
}

function refreshTableData() {
    var cacheKey = currentSchool + '_' + currentEducationalLevel;
    _summaryLoadCache[cacheKey] = false;
    ['outside','inside','graduates','passers','enrollees'].forEach(function(cat) {
        _dataLoadCache[cacheKey + '_' + cat] = false;
    });
    loadDataFromSupabase(); loadSummaryStatsFromFirestore();
    activities.unshift({ type:'edit', title:'Data Refreshed', description:'Table data has been refreshed', time:'Just now' });
    updateActivityLog();
    saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' refreshed the data table.', 'superadmin.html');
}

// ── Save Data ─────────────────────────────────────────────────────────────
function saveData() {
    const saveBtn = event.target;
    const originalText = saveBtn.innerHTML;
    if (currentEducationalLevel === 'all') { showToast('Please select a specific Educational Attainment before saving.', 'error'); return; }
    if (currentFilter === 'enrollees' && document.getElementById('categoryFilter').value === 'enrollees') { showToast('Please choose a category before saving.', 'error'); return; }
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; saveBtn.disabled = true;
    saveAllDataToSupabase().then(function(changedItems) {
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        showToast('All data saved successfully!', 'success');
        // Refresh dashboard stats: bust cache then re-fetch ALL categories from Supabase
        var _sCacheKey = currentSchool + '_' + currentEducationalLevel;
        _summaryLoadCache[_sCacheKey] = false; delete _summaryData[_sCacheKey];
        if (currentEducationalLevel !== 'all' && currentSchool !== 'all') loadSummaryStatsFromFirestore();
        var schoolDoc = allSchoolDocs.find(function(s) { return s.docId === currentSchool; });
        var schoolName = schoolDoc ? schoolDoc.schoolname : (currentSchool || 'Unknown School');
        var categoryEl = document.getElementById('categoryFilter');
        var categoryLabel = categoryEl ? categoryEl.options[categoryEl.selectedIndex].text : currentFilter;
        var eduEl = document.getElementById('educationalFilter');
        var eduLabel = eduEl ? eduEl.options[eduEl.selectedIndex].text : currentEducationalLevel;
        var detailParts = [];
        if (changedItems && changedItems.length > 0) {
            changedItems.forEach(function(item) {
                detailParts.push(item.course + ' [' + item.year + '] Female=' + item.female + ' Male=' + item.male);
            });
        }
        var actDesc = 'Saved: ' + schoolName + ' | ' + categoryLabel + ' | ' + eduLabel +
            (detailParts.length > 0 ? ' | ' + changedItems.length + ' cell(s) updated' : '');
        var logMsg = (currentUser ? currentUser.username : 'SuperAdmin') +
            ' saved data | School: ' + schoolName +
            ' | Category: ' + categoryLabel +
            ' | Edu: ' + eduLabel +
            (detailParts.length > 0 ? ' | Changes: ' + detailParts.join('; ') : ' | No cell changes detected');
        activities.unshift({ type:'edit', title:'Data Saved', description: actDesc, time:'Just now' });
        updateActivityLog();
        saveActivityLog(logMsg, 'superadmin.html');
        setTimeout(function() { saveBtn.innerHTML = originalText; saveBtn.disabled = false; }, 2000);
    }).catch(function(err) {
        console.error('saveData error:', err);
        saveBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error!';
        showToast('Error saving data to database', 'error');
        setTimeout(function() { saveBtn.innerHTML = originalText; saveBtn.disabled = false; }, 2000);
    });
}

async function saveAllDataToSupabase() {
    const catVal = document.getElementById('categoryFilter').value;
    if (catVal === 'enrollees') throw new Error('Please choose a category before saving.');
    if (currentEducationalLevel === 'all') throw new Error('Please select an Educational Attainment before saving.');
    const data = schoolsData[currentSchool] && schoolsData[currentSchool][currentFilter] ? schoolsData[currentSchool][currentFilter] : {};
    const categoryMap = { enrollees:'N/A', outside:'OutsideBataan', inside:'InsideBataan', graduates:'Graduates', passers:'NumberofBoardPasser' };
    const eduMap = { bachelor:'BACHELOR DEGREE', twoyear:'2-YEAR COURSE', tesda:'TESDA', graduate:'GRADUATE COURSE' };
    const category = categoryMap[catVal] || 'N/A';
    const educationalAttainment = eduMap[currentEducationalLevel] || 'N/A';
    const saveTasks = [];
    var changedItems = [];
    Object.keys(data).forEach(function(courseName) {
        data[courseName].forEach(function(genderData, yearIndex) {
            const year = academicYears[yearIndex];
            if (!year) return;
            const male   = (genderData && typeof genderData === 'object') ? (genderData.male   || 0) : 0;
            const female = (genderData && typeof genderData === 'object') ? (genderData.female || 0) : 0;
            var changeKey = currentSchool + '|' + currentFilter + '|' + courseName + '|' + yearIndex;
            var wasModified = _pendingChanges.has(changeKey);
            if (wasModified || male > 0 || female > 0) {
                // Wrap in a closure so values are captured for sequential execution
                (function(sYear, sCourseName, sMale, sFemale) {
                    saveTasks.push(function() {
                        return saveToDataAnalytics(currentSchool, sYear, sCourseName, category, sMale, sFemale, educationalAttainment);
                    });
                })(year, courseName, male, female);
            }
            if (wasModified) {
                changedItems.push({ course: courseName, year: year, male: male, female: female });
            }
        });
    });
    // Sequential execution — prevents DA_ID sequence collision from parallel inserts
    const results = [];
    for (var _si = 0; _si < saveTasks.length; _si++) { results.push(await saveTasks[_si]()); }
    _pendingChanges.clear();
    var failures = results.filter(function(r) { return r === false; }).length;
    if (failures > 0) throw new Error(failures + ' record(s) failed to save. Check console for details.');
    return changedItems;
}

function getSchoolAbbreviation(schoolId) {
    const s = allSchoolDocs.find(function(s) { return s.docId === schoolId || s.school_id === schoolId; });
    return s ? s.schoolabbrev : 'UNKNOWN';
}
function getCourseAbbreviation(courseName) {
    const words = courseName.split(' ');
    if (words.length === 1) return courseName.substring(0, 4).toUpperCase();
    return words.map(function(w) { return w.charAt(0).toUpperCase(); }).join('').substring(0, 6);
}

async function saveToDataAnalytics(schoolId, year, courseName, category, maleCount, femaleCount, educationalAttainment) {
    try {
        const qs = 'DA_SchoolID=eq.' + encodeURIComponent(schoolId) +
                   '&DA_Year=eq.' + encodeURIComponent(year) +
                   '&DA_Course=eq.' + encodeURIComponent(courseName) +
                   '&DA_Category=eq.' + encodeURIComponent(category);
        const existing = await SB.get('Data_Analytics', qs);
        const male   = parseInt(maleCount)   || 0;
        const female = parseInt(femaleCount) || 0;
        if (existing.length > 0) {
            // Row exists — always UPDATE (including to zero) — BUG #2 fix
            await SB.update('Data_Analytics', { DA_ID: existing[0].DA_ID }, {
                DA_Male: male,
                DA_Female: female,
                DA_Timestamp: new Date().toISOString()
            });
        } else {
            // No existing row — only INSERT if there is actual data
            if (male === 0 && female === 0) return true; // nothing to store
            var _daPayload = {
                DA_Category: category, DA_Course: courseName,
                DA_EducationalAttainment: educationalAttainment, DA_Year: year,
                DA_Male: male, DA_Female: female,
                DA_Timestamp: new Date().toISOString(), DA_SchoolID: schoolId,
                DA_AddedbyName: currentUser ? currentUser.username : 'SuperAdmin'
            };
            try {
                await SB.insert('Data_Analytics', _daPayload);
            } catch (_daInsertErr) {
                var _daErrStr = String(_daInsertErr.message || _daInsertErr);
                if (_daErrStr.indexOf('23505') !== -1 || _daErrStr.toLowerCase().indexOf('duplicate key') !== -1) {
                    // Sequence out of sync — fetch real max ID and retry
                    var _daMax = await SB.get('Data_Analytics', 'select=DA_ID&order=DA_ID.desc&limit=1');
                    var _daNextId = (_daMax.length > 0 ? (parseInt(_daMax[0].DA_ID) || 0) : 0) + 1;
                    await SB.insert('Data_Analytics', Object.assign({ DA_ID: _daNextId }, _daPayload));
                } else { throw _daInsertErr; }
            }
        }
        return true;
    } catch (e) {
        // BUG #1 FIX: surface the real error so silent failures are visible
        console.error('saveToDataAnalytics error:', e, '| school:', schoolId, '| year:', year, '| course:', courseName);
        return false;
    }
}

// ── Year Management ───────────────────────────────────────────────────────
function showYearManagement() {
    var sec = document.getElementById('yearManagementSection');
    if (!sec) return;
    var vis = sec.style.display !== 'none';
    sec.style.display = vis ? 'none' : 'block';
    var btn = document.querySelector('.year-management');
    if (btn) btn.innerHTML = vis ? '<i class="fas fa-calendar-plus"></i> Manage Years' : '<i class="fas fa-calendar-minus"></i> Hide Year Management';
    if (!vis) updateYearsList();
}

function updateYearsList() {
    var yearsList = document.getElementById('yearsList');
    if (!yearsList) return;
    yearsList.innerHTML = '';
    academicYears.forEach(function(year, index) {
        var yearItem = document.createElement('div');
        yearItem.className = 'year-item';
        yearItem.innerHTML = '<span class="year-name">' + year + '</span><button class="delete-year-btn" onclick="deleteYear(' + index + ')"><i class="fas fa-trash"></i></button>';
        yearsList.appendChild(yearItem);
    });
}

function addNewYear() {
    var input = document.getElementById('newYearInput');
    var newYear = input.value.trim();
    if (!newYear) { alert('Please enter a year.'); return; }
    if (academicYears.includes(newYear)) { alert('This year already exists.'); return; }
    academicYears.push(newYear);
    Object.keys(schoolsData).forEach(function(school) {
        Object.keys(schoolsData[school]).forEach(function(cat) {
            Object.keys(schoolsData[school][cat]).forEach(function(course) {
                schoolsData[school][cat][course].push({male:0,female:0});
            });
        });
    });
    initYearWindowStart(); renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); updateSummary(); updateYearsList();
    input.value = '';
    activities.unshift({ type:'add', title:'New Year Added', description:'Academic year ' + newYear + ' was added', time:'Just now' });
    updateActivityLog();
    alert('Year ' + newYear + ' added successfully!');
}

function deleteYear(yearIndex) {
    if (academicYears.length <= 1) { alert('Cannot delete the last remaining year.'); return; }
    var yearToDelete = academicYears[yearIndex];
    if (confirm('Are you sure you want to delete the year ' + yearToDelete + '? This will remove all data for this year.')) {
        academicYears.splice(yearIndex, 1);
        Object.keys(schoolsData).forEach(function(school) {
            Object.keys(schoolsData[school]).forEach(function(cat) {
                Object.keys(schoolsData[school][cat]).forEach(function(course) {
                    schoolsData[school][cat][course].splice(yearIndex, 1);
                });
            });
        });
        initYearWindowStart(); renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); updateSummary(); updateYearsList();
        activities.unshift({ type:'delete', title:'Year Deleted', description:'Academic year ' + yearToDelete + ' was removed', time:'Just now' });
        updateActivityLog();
        alert('Year ' + yearToDelete + ' deleted successfully!');
    }
}

// ── Export ────────────────────────────────────────────────────────────────
function exportTableData() {
    var schoolSelect = document.getElementById('schoolFilter');
    var schoolLabel  = schoolSelect ? schoolSelect.options[schoolSelect.selectedIndex].text : 'School';
    var eduSelect    = document.getElementById('educationalFilter');
    var eduLabel     = eduSelect    ? eduSelect.options[eduSelect.selectedIndex].text : '';
    var catSelect    = document.getElementById('categoryFilter');
    var catLabel     = catSelect    ? catSelect.options[catSelect.selectedIndex].text : '';
    var exportYears  = getVisibleYears();
    var totalCols = 1 + exportYears.length * 3;

    function colToLetter(n) { var s=''; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s; }

    var dataRows = [];
    document.querySelectorAll('#unifiedTableBody tr').forEach(function(row) {
        if (row.style.display === 'none') return;
        var cnEl = row.querySelector('.course-name');
        var cn = cnEl ? cnEl.textContent.trim() : '';
        var dr = [cn];
        exportYears.forEach(function(year) {
            var realYearIndex = academicYears.indexOf(year);
            var maleVal = 0, femaleVal = 0;
            try {
                var gd = (realYearIndex !== -1 && schoolsData[currentSchool] && schoolsData[currentSchool][currentFilter] && schoolsData[currentSchool][currentFilter][cn])
                    ? schoolsData[currentSchool][currentFilter][cn][realYearIndex] : null;
                maleVal   = (gd && typeof gd === 'object') ? (gd.male   || 0) : 0;
                femaleVal = (gd && typeof gd === 'object') ? (gd.female || 0) : 0;
            } catch(e) {}
            dr.push(femaleVal, maleVal, maleVal + femaleVal);
        });
        dataRows.push(dr);
    });

    if (typeof ExcelJS === 'undefined') { showToast('ExcelJS library not loaded. Cannot export.', 'error'); return; }
    var workbook = new ExcelJS.Workbook();
    var ws = workbook.addWorksheet('School Data');
    ws.addRow(['School: ' + schoolLabel]); ws.mergeCells(1,1,1,totalCols);
    ws.addRow(['Educational Attainment: ' + eduLabel + '   |   Category: ' + catLabel]); ws.mergeCells(2,1,2,totalCols);
    var yearHeaderRow = ['Course']; exportYears.forEach(function(y){yearHeaderRow.push(y,'','');});
    ws.addRow(yearHeaderRow);
    var subHeaderRowData = ['']; exportYears.forEach(function(){subHeaderRowData.push('FEMALE','MALE','TOTAL');});
    ws.addRow(subHeaderRowData);
    exportYears.forEach(function(y,yi){var col=2+yi*3;ws.mergeCells(3,col,3,col+2);});
    dataRows.forEach(function(dr){ws.addRow(dr);});
    var now=new Date(),pad=function(n){return n<10?'0'+n:String(n);};
    var dateStr=now.getFullYear()+''+pad(now.getMonth()+1)+''+pad(now.getDate());
    var timeStr=pad(now.getHours())+''+pad(now.getMinutes())+''+pad(now.getSeconds());
    var filename='UtownDataName_'+schoolLabel.replace(/[^a-zA-Z0-9]/g,'')+'_'+dateStr+'_'+timeStr+'.xlsx';
    workbook.xlsx.writeBuffer().then(function(buffer){
        var blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;
        document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
        saveActivityLog((currentUser?currentUser.username:'SuperAdmin')+' exported table data to Excel.','superadmin.html');
    });
}

// ── Add School ────────────────────────────────────────────────────────────
function clearForm()       { const f = document.getElementById('addSchoolForm'); if (f) f.reset(); }
function openAddSchoolModal()  { document.getElementById('addSchoolModal').style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAddSchoolModal() { document.getElementById('addSchoolModal').style.display = 'none'; document.body.style.overflow = 'auto'; clearForm(); }
function openAddAdminModal()   { document.getElementById('addAdminModal').style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAddAdminModal()  { document.getElementById('addAdminModal').style.display = 'none'; document.body.style.overflow = 'auto'; clearAdminForm(); }

async function getNextSchoolId(schoolabbrev) {
    var safeAbbrev = schoolabbrev.replace(/[^a-zA-Z0-9]/g, '');
    var prefix = 'SchoolId_' + safeAbbrev + '_';
    var max = 0;
    if (allSchoolDocs && allSchoolDocs.length) {
        allSchoolDocs.forEach(function(s) {
            var did = s.docId || '';
            if (did.startsWith(prefix)) { var num = parseInt(did.substring(prefix.length)); if (!isNaN(num)) max = Math.max(max, num); }
        });
    } else {
        const rows = await SB.get('ListofSchool', '');
        rows.forEach(function(r) {
            var did = r.school_id || '';
            if (did.startsWith(prefix)) { var num = parseInt(did.substring(prefix.length)); if (!isNaN(num)) max = Math.max(max, num); }
        });
    }
    return prefix + String(max + 1).padStart(4, '0');
}

async function addSchool(event) {
    event.preventDefault();
    var schoolname    = capitalizeEachSentence(document.getElementById('schoolName').value.trim());
    var schoolabbrev  = document.getElementById('schoolAbbreviation').value.trim();
    var schoolpres    = capitalizeEachSentence(document.getElementById('schoolPresident').value.trim());
    var address       = capitalizeEachSentence(document.getElementById('schoolAddress').value.trim());
    var phone         = document.getElementById('schoolPhone').value;

    if (!validatePhoneNumber(phone)) { showToast('Contact number must be 11 digits (09##-###-####)', 'error'); document.getElementById('schoolPhone').focus(); return; }

    var emailInput = document.getElementById('schoolEmail').value.trim();
    var emails = emailInput.split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e; });
    if (emails.length === 0) { showToast('Please enter at least one email address', 'error'); return; }
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (var i = 0; i < emails.length; i++) {
        if (!emailRegex.test(emails[i])) { showToast('Invalid email format: ' + emails[i], 'error'); return; }
    }
    var email_add = emails.join(', ');
    var contact_number = phone;
    var website = document.getElementById('schoolWebsite').value.trim();
    if (website && !website.match(/^https?:\/\/.+/i)) { showToast('Please enter a valid website URL starting with http:// or https://', 'error'); return; }

    var teaching_staff    = parseInt(document.getElementById('teachingStaff').value) || 0;
    var nonteachingstaff  = parseInt(document.getElementById('nonTeachingStaff').value) || 0;
    var password          = document.getElementById('schoolPassword').value;
    var username          = document.getElementById('schoolUsername').value.trim();
    var description       = capitalizeEachSentence(document.getElementById('schoolDescription').value.trim());
    var landline          = document.getElementById('schoolLandline').value.trim();

    var _addSchoolBtn = document.getElementById('addSchoolSubmitBtn');
    var _addSchoolBtnOrig = _addSchoolBtn ? _addSchoolBtn.innerHTML : '';
    function _restoreSchoolBtn() { if (_addSchoolBtn) { _addSchoolBtn.disabled = false; _addSchoolBtn.innerHTML = _addSchoolBtnOrig; } }
    if (_addSchoolBtn) { _addSchoolBtn.disabled = true; _addSchoolBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...'; }

    try {
        for (var i = 0; i < (allSchoolDocs || []).length; i++) {
            var d = allSchoolDocs[i];
            if ((d.schoolname || '').toLowerCase() === schoolname.toLowerCase()) { showToast('School Already Exist', 'error'); _restoreSchoolBtn(); return; }
            if ((d.schoolabbrev || '').toLowerCase() === schoolabbrev.toLowerCase()) { showToast('School Abbreviation Already Exist', 'error'); _restoreSchoolBtn(); return; }
            if (d.username && d.username.toLowerCase() === username.toLowerCase()) { showToast('Username Already Exist', 'error'); _restoreSchoolBtn(); return; }
        }

        var _schoolPayload = {
            schoolname, schoolabbrev, schoolpres, address, email_add, contact_number,
            landline, website, teaching_staff, nonteachingstaff, password, username, description,
            addedbyName: currentUser ? currentUser.username : 'SuperAdmin',
            deletestats: '0', created_at: new Date().toISOString()
        };
        try {
            await SB.insert('ListofSchool', _schoolPayload);
        } catch (_schSeqErr) {
            var _schErrStr = String(_schSeqErr.message || _schSeqErr);
            if (_schErrStr.indexOf('23505') !== -1 || _schErrStr.toLowerCase().indexOf('duplicate key') !== -1) {
                var _schMax = await SB.get('ListofSchool', 'select=school_id&order=school_id.desc&limit=1');
                var _schNextId = (_schMax.length > 0 ? (parseInt(_schMax[0].school_id) || 0) : 0) + 1;
                await SB.insert('ListofSchool', Object.assign({ school_id: _schNextId }, _schoolPayload));
            } else { throw _schSeqErr; }
        }

        showToast(schoolname + ' added successfully!', 'success');
        clearForm(); closeAddSchoolModal(); await loadSchoolAccounts(); updateSchoolCount();
        activities.unshift({ type:'add', title:'New School Added', description: schoolname + ' was added to the system', time:'Just now' });
        updateActivityLog();
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' added school "' + schoolname + '".', 'superadmin.html');
    } catch (_addSchoolErr) {
        console.error('addSchool error:', _addSchoolErr);
        showToast('Error adding school: ' + (_addSchoolErr.message || 'Unknown error'), 'error');
    } finally { _restoreSchoolBtn(); }
}

// ── Load School Accounts ──────────────────────────────────────────────────
async function loadSchoolAccounts() {
    try {
        const rows = await SB.get('ListofSchool', 'deletestats=eq.0&order=created_at.desc');
        allSchoolDocs = rows.map(function(r) { return Object.assign({}, r, { docId: String(r.school_id) }); });
        schoolCredPage = 1;
        refreshSchoolCredentials();
        updateSchoolFilterDropdown();
        updateSchoolCount();
    } catch (e) { console.error('loadSchoolAccounts error:', e); }
}

// ── Delete School ─────────────────────────────────────────────────────────
var _pendingDeleteFn = null;
function showDeleteConfirm(title, message, onConfirm) {
    document.getElementById('dcmTitle').textContent = title;
    document.getElementById('dcmMsg').textContent = message;
    _pendingDeleteFn = onConfirm;
    document.getElementById('deleteConfirmModal').classList.add('open');
}
function closeDeleteConfirm() { document.getElementById('deleteConfirmModal').classList.remove('open'); _pendingDeleteFn = null; }
function confirmDeleteAction() {
    document.getElementById('deleteConfirmModal').classList.remove('open');
    if (typeof _pendingDeleteFn === 'function') _pendingDeleteFn();
    _pendingDeleteFn = null;
}
function confirmDeleteSchool(docId, name) {
    showDeleteConfirm('Delete School Account', 'Are you sure you want to delete "' + name + '"? This action cannot be undone.', function() { deleteSchoolAccount(docId); });
}
async function deleteSchoolAccount(docId) {
    await SB.update('ListofSchool', { school_id: docId }, { deletestats: '1' });
    showToast('School account deleted.', 'success');
    await loadSchoolAccounts();
    activities.unshift({ type:'delete', title:'School Account Deleted', description: docId + ' was removed', time:'Just now' });
    updateActivityLog();
}

// ── School Credentials Table ──────────────────────────────────────────────
var schoolCredPage = 1;
var schoolCredPageSize = 10;
var schoolCredFiltered = [];
var schoolCredSearch = '';

function updateSchoolCount() {
    const el = document.getElementById('totalSchoolsCount');
    if (el) el.textContent = allSchoolDocs.length;
    const slSection = document.getElementById('add-school');
    if (slSection && slSection.classList.contains('active')) { slPopulateFilter(); slFilterSchools(); }
    else { slFiltered = allSchoolDocs.slice(); }
}

function updateSchoolCredFilterDropdown() {
    const select = document.getElementById('schoolCredFilterSelect');
    if (!select) return;
    while (select.options.length > 1) select.remove(1);
    allSchoolDocs.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s.docId; opt.textContent = s.schoolname;
        select.appendChild(opt);
    });
}

function refreshSchoolCredentials() {
    schoolCredSearch = (document.getElementById('schoolCredSearch') ? document.getElementById('schoolCredSearch').value : '').toLowerCase();
    var filterVal = document.getElementById('schoolCredFilterSelect') ? document.getElementById('schoolCredFilterSelect').value : 'all';
    schoolCredFiltered = allSchoolDocs.filter(function(s) {
        var matchSearch = !schoolCredSearch ||
            (s.schoolname || '').toLowerCase().includes(schoolCredSearch) ||
            (s.username || '').toLowerCase().includes(schoolCredSearch) ||
            (s.schoolabbrev || '').toLowerCase().includes(schoolCredSearch);
        var matchFilter = filterVal === 'all' || s.docId === filterVal;
        return matchSearch && matchFilter;
    });
    schoolCredPage = 1;
    renderSchoolCredTable();
    updateSchoolCredFilterDropdown();
}

function renderSchoolCredTable() {
    var tableBody = document.getElementById('schoolCredTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    var total = schoolCredFiltered.length;
    var totalPages = Math.max(1, Math.ceil(total / schoolCredPageSize));
    if (schoolCredPage > totalPages) schoolCredPage = totalPages;
    var start = (schoolCredPage - 1) * schoolCredPageSize;
    var end = Math.min(start + schoolCredPageSize, total);
    var pageData = schoolCredFiltered.slice(start, end);

    pageData.forEach(function(school, idx) {
        var row = document.createElement('tr');
        var sPwId = 'school-pw-' + (school.docId || '').replace(/[^a-zA-Z0-9]/g, '_');
        var safeDocId = (school.docId || '').replace(/'/g, "\\'");
        row.innerHTML =
            '<td>' + (start + idx + 1) + '</td>' +
            '<td><strong>' + (school.schoolname || '') + '</strong></td>' +
            '<td>' + (school.schoolabbrev || '') + '</td>' +
            '<td>' + (school.username || '') + '</td>' +
            '<td><div class="password-wrap"><div class="password-display" id="' + sPwId + '" data-show="0" data-pw="">••••••••</div><button class="password-eye-btn" onclick="togglePasswordById(\'' + sPwId + '\')" title="Show/Hide"><i class="fas fa-eye"></i></button></div></td>' +
            '<td><div class="action-cell">' +
                '<button class="btn btn-warning btn-small" onclick="openEditSchoolModal(\'' + safeDocId + '\')"><i class="fas fa-edit"></i> Edit</button>' +
                '<button class="btn btn-danger btn-small" onclick="confirmDeleteSchool(\'' + safeDocId + '\', \'' + (school.schoolname || '').replace(/'/g,"\\'") + '\')"><i class="fas fa-trash"></i> Delete</button>' +
            '</div></td>';
        var pwEl = row.querySelector('#' + sPwId);
        if (pwEl) pwEl.setAttribute('data-pw', school.password || '');
        tableBody.appendChild(row);
    });

    var pageInfo = document.getElementById('schoolCredPageInfo');
    var pageIndicator = document.getElementById('schoolCredPageIndicator');
    var prevBtn = document.getElementById('schoolCredPrevBtn');
    var nextBtn = document.getElementById('schoolCredNextBtn');
    if (pageInfo) pageInfo.textContent = total === 0 ? 'No records found' : 'Showing ' + (start+1) + '-' + end + ' of ' + total + ' records';
    if (pageIndicator) pageIndicator.textContent = 'Page ' + schoolCredPage + ' of ' + totalPages;
    if (prevBtn) prevBtn.disabled = schoolCredPage <= 1;
    if (nextBtn) nextBtn.disabled = schoolCredPage >= totalPages;
}

function schoolCredPrevPage() { if (schoolCredPage > 1) { schoolCredPage--; renderSchoolCredTable(); } }
function schoolCredNextPage() { var tp=Math.max(1,Math.ceil(schoolCredFiltered.length/schoolCredPageSize)); if(schoolCredPage<tp){schoolCredPage++;renderSchoolCredTable();} }

function togglePasswordDisplay(elId, plainText) {
    var el = document.getElementById(elId);
    if (!el) return;
    var showing = el.getAttribute('data-show') === '1';
    el.textContent = showing ? '••••••••' : plainText;
    el.setAttribute('data-show', showing ? '0' : '1');
}

function togglePasswordById(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    var showing = el.getAttribute('data-show') === '1';
    if (showing) { el.textContent = '••••••••'; el.setAttribute('data-show', '0'); }
    else { el.textContent = el.getAttribute('data-pw') || ''; el.setAttribute('data-show', '1'); }
}

// ── Edit School ───────────────────────────────────────────────────────────
function openEditSchoolModal(docId) {
    var d = (allSchoolDocs || []).find(function(s) { return s.docId === docId; });
    if (!d) { showToast('School not found!', 'error'); return; }
    document.getElementById('editSchoolDocId').value = docId;
    document.getElementById('editSchoolName').value        = d.schoolname    || '';
    document.getElementById('editSchoolAbbreviation').value      = d.schoolabbrev  || '';
    document.getElementById('editSchoolPresident').value        = d.schoolpres    || '';
    document.getElementById('editSchoolAddress').value     = d.address       || '';
    document.getElementById('editSchoolEmail').value       = d.email_add     || '';
    document.getElementById('editSchoolPhone').value       = d.contact_number || '';
    document.getElementById('editSchoolLandline').value    = d.landline      || '';
    document.getElementById('editSchoolWebsite').value     = d.website       || '';
    document.getElementById('editTeachingStaff').value     = d.teaching_staff || 0;
    document.getElementById('editNonTeachingStaff').value  = d.nonteachingstaff || 0;
    document.getElementById('editSchoolPassword').value    = d.password      || '';
    document.getElementById('editSchoolUsername').value    = d.username      || '';
    document.getElementById('editSchoolDescription').value = d.description   || '';
    var saveBtn = document.querySelector('#editSchoolModal .btn-save-enhanced');
    if (saveBtn) { saveBtn.classList.remove('loading'); saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
    document.getElementById('editSchoolModal').classList.add('show');
    document.getElementById('editSchoolModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeEditSchoolModal() {
    document.getElementById('editSchoolModal').classList.remove('show');
    document.getElementById('editSchoolModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function _restoreSchoolSaveBtn() {
    var saveBtn = document.querySelector('#editSchoolModal .btn-save-enhanced');
    if (saveBtn) { saveBtn.classList.remove('loading'); saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
}

async function saveEditSchool() {
    var saveBtn = document.querySelector('#editSchoolModal .btn-save-enhanced');
    try {
        var docId          = document.getElementById('editSchoolDocId').value;
        var schoolname     = capitalizeEachSentence(document.getElementById('editSchoolName').value.trim());
        var schoolabbrev   = document.getElementById('editSchoolAbbreviation').value.trim();
        var schoolpres     = capitalizeEachSentence(document.getElementById('editSchoolPresident').value.trim());
        var address        = capitalizeEachSentence(document.getElementById('editSchoolAddress').value.trim());
        var email_add      = document.getElementById('editSchoolEmail').value.trim();
        var contact_number = document.getElementById('editSchoolPhone').value.trim();
        var landline       = document.getElementById('editSchoolLandline').value.trim();
        var website        = document.getElementById('editSchoolWebsite').value.trim();
        var teaching_staff    = parseInt(document.getElementById('editTeachingStaff').value) || 0;
        var nonteachingstaff  = parseInt(document.getElementById('editNonTeachingStaff').value) || 0;
        var password       = document.getElementById('editSchoolPassword').value;
        var username       = document.getElementById('editSchoolUsername').value.trim();
        var description    = capitalizeEachSentence(document.getElementById('editSchoolDescription').value.trim());

        if (!schoolname || !schoolabbrev || !username) { showToast('Please fill in all required fields', 'error'); return; }

        if (saveBtn) { saveBtn.classList.add('loading'); saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

        await SB.update('ListofSchool', { school_id: docId }, {
            schoolname, schoolabbrev, schoolpres, address, email_add, contact_number,
            landline, teaching_staff, nonteachingstaff, password, username, description, website
        });

        showToast(schoolname + ' updated successfully!', 'success');
        var cachedSchool = (allSchoolDocs || []).find(function(s) { return s.docId === docId; });
        if (cachedSchool) {
            Object.assign(cachedSchool, { schoolname, schoolabbrev, schoolpres, address, email_add, contact_number, landline, website, teaching_staff, nonteachingstaff, password, username, description });
        }
        slFiltered = (allSchoolDocs || []).slice();
        if (typeof slFilterSchools === 'function') slFilterSchools();
        updateSchoolCount();
        refreshSchoolCredentials();
        if (saveBtn) { saveBtn.classList.remove('loading'); saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!'; }
        setTimeout(function() { closeEditSchoolModal(); _restoreSchoolSaveBtn(); }, 1000);
        activities.unshift({ type:'edit', title:'School Updated', description: schoolname + ' was updated', time:'Just now' });
        updateActivityLog();
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' edited school "' + schoolname + '".', 'superadmin.html');
    } catch (e) { console.error('Error saving school:', e); showToast('Error saving school: ' + e.message, 'error'); _restoreSchoolSaveBtn(); }
}

// ── Admin Accounts ────────────────────────────────────────────────────────
function clearAdminForm() { const f = document.getElementById('addAdminForm'); if (f) f.reset(); }

async function getNextAdminId(lname) {
    var safeLname = lname.replace(/[^a-zA-Z0-9]/g, '');
    var prefix = 'AdminId_' + safeLname + '_';
    var max = 0;
    if (allAdminDocs && allAdminDocs.length) {
        allAdminDocs.forEach(function(d) {
            var did = d.docId || '';
            if (did.startsWith(prefix)) { var num = parseInt(did.substring(prefix.length)); if (!isNaN(num)) max = Math.max(max, num); }
        });
    } else {
        const rows = await SB.get('SuperAdminAccount', '');
        rows.forEach(function(r) {
            var did = r.adminID || '';
            if (did.startsWith(prefix)) { var num = parseInt(did.substring(prefix.length)); if (!isNaN(num)) max = Math.max(max, num); }
        });
    }
    return prefix + String(max + 1).padStart(4, '0');
}

async function addAdminAccount(event) {
    event.preventDefault();
    var fname    = document.getElementById('adminFirstName').value.trim();
    var lname    = document.getElementById('adminLastName').value.trim();
    var bday     = document.getElementById('adminBirthday').value;
    var address  = document.getElementById('adminAddress').value.trim();
    var username = document.getElementById('adminUsername').value.trim();
    var password = document.getElementById('adminPassword').value;

    var _addAdminBtn = document.getElementById('addAdminSubmitBtn');
    var _addAdminBtnOrig = _addAdminBtn ? _addAdminBtn.innerHTML : '';
    function _restoreAdminBtn() { if (_addAdminBtn) { _addAdminBtn.disabled = false; _addAdminBtn.innerHTML = _addAdminBtnOrig; } }
    if (_addAdminBtn) { _addAdminBtn.disabled = true; _addAdminBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...'; }

    try {
        for (var i = 0; i < (allAdminDocs || []).length; i++) {
            var d = allAdminDocs[i];
            if ((d.fname || '').toLowerCase() === fname.toLowerCase() && (d.lname || '').toLowerCase() === lname.toLowerCase()) {
                showToast('Account Already Exist', 'error'); _restoreAdminBtn(); return;
            }
            if ((d.username || '').toLowerCase() === username.toLowerCase()) { showToast('Username Already Exist', 'error'); _restoreAdminBtn(); return; }
        }

        var _adminPayload = {
            fullname: fname + ' ' + lname,
            birthday: bday,
            address: address,
            username: username,
            password: password,
            addedbyName: currentUser ? currentUser.username : 'SuperAdmin',
            created_at: new Date().toISOString(),
            delstats: '0'
        };
        try {
            await SB.insert('SuperAdminAccount', _adminPayload);
        } catch (_admSeqErr) {
            var _admErrStr = String(_admSeqErr.message || _admSeqErr);
            if (_admErrStr.indexOf('23505') !== -1 || _admErrStr.toLowerCase().indexOf('duplicate key') !== -1) {
                var _admMax = await SB.get('SuperAdminAccount', 'select=adminID&order=adminID.desc&limit=1');
                var _admNextId = (_admMax.length > 0 ? (parseInt(_admMax[0].adminID) || 0) : 0) + 1;
                await SB.insert('SuperAdminAccount', Object.assign({ adminID: _admNextId }, _adminPayload));
            } else { throw _admSeqErr; }
        }

        showToast(fname + ' ' + lname + ' added as admin.', 'success');
        clearAdminForm(); closeAddAdminModal(); await loadAdminAccounts();
        activities.unshift({ type:'add', title:'New Admin Account Added', description: username + ' was added as an admin account', time:'Just now' });
        updateActivityLog();
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' added admin account "' + username + '".', 'superadmin.html');
    } catch (_addAdminErr) {
        console.error('addAdminAccount error:', _addAdminErr);
        showToast('Error adding admin: ' + (_addAdminErr.message || 'Unknown error'), 'error');
    } finally { _restoreAdminBtn(); }
}

async function loadAdminAccounts() {
    try {
        const rows = await SB.get('SuperAdminAccount', 'delstats=eq.0&order=created_at.desc');
        allAdminDocs = rows.map(function(r) {
            var parts = (r.fullname || '').split(' ');
            return Object.assign({}, r, {
                docId:    String(r.adminID),
                fname:    parts[0] || '',
                lname:    parts.slice(1).join(' ') || '',
                bday:     r.birthday || '',
                username: r.username || '',
                password: r.password || '',
                address:  r.address  || ''
            });
        });
        adminPage = 1;
        filterAdminAccounts();
        updateCourseSchoolDropdowns();
    } catch (e) { console.error('loadAdminAccounts error:', e); }
}

function filterAdminAccounts() {
    adminSearchQuery = (document.getElementById('adminSearch') ? document.getElementById('adminSearch').value : '').toLowerCase();
    adminFilteredDocs = allAdminDocs.filter(function(d) {
        return !adminSearchQuery ||
            (d.fname && d.fname.toLowerCase().includes(adminSearchQuery)) ||
            (d.lname && d.lname.toLowerCase().includes(adminSearchQuery)) ||
            (d.username && d.username.toLowerCase().includes(adminSearchQuery));
    });
    adminPage = 1;
    renderAdminTable();
}

function renderAdminTable() {
    var tableBody = document.getElementById('adminAccountsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    var total = adminFilteredDocs.length;
    var totalPages = Math.max(1, Math.ceil(total / adminPageSize));
    if (adminPage > totalPages) adminPage = totalPages;
    var start = (adminPage - 1) * adminPageSize;
    var end = Math.min(start + adminPageSize, total);
    var pageData = adminFilteredDocs.slice(start, end);

    pageData.forEach(function(admin, idx) {
        var row = document.createElement('tr');
        var aPwId = 'admin-pw-' + (admin.docId || '').replace(/[^a-zA-Z0-9]/g, '_');
        var safeDocId = (admin.docId || '').replace(/'/g, "\\'");
        row.innerHTML =
            '<td>' + (start + idx + 1) + '</td>' +
            '<td><strong>' + (admin.fname||'') + ' ' + (admin.lname||'') + '</strong></td>' +
            '<td>' + (admin.bday||'') + '</td>' +
            '<td>' + (admin.address||'') + '</td>' +
            '<td>' + (admin.username||'') + '</td>' +
            '<td><div class="password-wrap"><div class="password-display" id="' + aPwId + '" data-show="0" data-pw="">••••••••</div><button class="password-eye-btn" onclick="togglePasswordById(\'' + aPwId + '\')" title="Show/Hide Password"><i class="fas fa-eye"></i></button></div></td>' +
            '<td><div class="action-cell">' +
                '<button class="btn btn-warning btn-small" onclick="openEditAdminModal(\'' + safeDocId + '\')"><i class="fas fa-edit"></i> Edit</button>' +
                '<button class="btn btn-danger btn-small" onclick="confirmDeleteAdmin(\'' + safeDocId + '\', \'' + (admin.fname||'') + ' ' + (admin.lname||'') + '\')"><i class="fas fa-trash"></i> Delete</button>' +
            '</div></td>';
        var pwEl = row.querySelector('#' + aPwId);
        if (pwEl) pwEl.setAttribute('data-pw', admin.password || '');
        tableBody.appendChild(row);
    });

    var pageInfo = document.getElementById('adminPageInfo');
    var pageIndicator = document.getElementById('adminPageIndicator');
    var prevBtn = document.getElementById('adminPrevBtn');
    var nextBtn = document.getElementById('adminNextBtn');
    if (pageInfo) pageInfo.textContent = total === 0 ? 'No records found' : 'Showing ' + (start+1) + '-' + end + ' of ' + total + ' records';
    if (pageIndicator) pageIndicator.textContent = 'Page ' + adminPage + ' of ' + totalPages;
    if (prevBtn) prevBtn.disabled = adminPage <= 1;
    if (nextBtn) nextBtn.disabled = adminPage >= totalPages;
}

function adminPrevPage() { if (adminPage > 1) { adminPage--; renderAdminTable(); } }
function adminNextPage() { var tp=Math.max(1,Math.ceil(adminFilteredDocs.length/adminPageSize)); if(adminPage<tp){adminPage++;renderAdminTable();} }

function confirmDeleteAdmin(docId, name) {
    showDeleteConfirm('Delete Admin Account', 'Are you sure you want to delete "' + name + '"? This action cannot be undone.', function() { deleteAdminAccount(docId); });
}

async function deleteAdminAccount(docId) {
    await SB.update('SuperAdminAccount', { adminID: docId }, { delstats: '1' });
    showToast('Admin account deleted.', 'success');
    await loadAdminAccounts();
    activities.unshift({ type:'delete', title:'Admin Account Deleted', description: docId + ' was removed', time:'Just now' });
    updateActivityLog();
}

function openEditAdminModal(docId) {
    try {
        var d = (allAdminDocs || []).find(function(a) { return a.docId === docId; });
        if (!d) { showToast('Admin account not found!', 'error'); return; }
        document.getElementById('editAdminDocId').value       = docId;
        document.getElementById('editAdminFirstName').value  = d.fname    || '';
        document.getElementById('editAdminLastName').value   = d.lname    || '';
        document.getElementById('editAdminBirthday').value   = d.bday     || '';
        document.getElementById('editAdminAddress').value    = d.address  || '';
        document.getElementById('editAdminUsername').value   = d.username || '';
        document.getElementById('editAdminPassword').value   = d.password || '';
        var saveBtn = document.querySelector('#editAdminModal .btn-save-enhanced');
        if (saveBtn) { saveBtn.classList.remove('loading'); saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
        document.getElementById('editAdminModal').classList.add('show');
        document.getElementById('editAdminModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch (e) { console.error('Error opening edit admin modal:', e); showToast('Error loading admin data', 'error'); }
}

function closeEditAdminModal() {
    document.getElementById('editAdminModal').classList.remove('show');
    document.getElementById('editAdminModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function saveEditAdmin() {
    var saveBtnSelector = document.querySelector('#editAdminModal .btn-save-enhanced');
    var originalHTML = saveBtnSelector ? saveBtnSelector.innerHTML : '<i class="fas fa-save"></i> Save Changes';
    try {
        var docId    = document.getElementById('editAdminDocId').value;
        var fname    = document.getElementById('editAdminFirstName').value.trim();
        var lname    = document.getElementById('editAdminLastName').value.trim();
        var bday     = document.getElementById('editAdminBirthday').value;
        var address  = document.getElementById('editAdminAddress').value.trim();
        var username = document.getElementById('editAdminUsername').value.trim();
        var password = document.getElementById('editAdminPassword').value;

        if (!fname || !lname || !bday || !address || !username || !password) { showToast('Please fill in all fields', 'error'); return; }

        var dupAdmin = (allAdminDocs || []).find(function(a) { return a.docId !== docId && (a.username || '').toLowerCase() === username.toLowerCase(); });
        if (dupAdmin) { showToast('Username already exists!', 'error'); return; }

        if (saveBtnSelector) { saveBtnSelector.classList.add('loading'); saveBtnSelector.disabled = true; saveBtnSelector.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

        await SB.update('SuperAdminAccount', { adminID: docId }, {
            fullname: fname + ' ' + lname, birthday: bday, address, username, password
        });

        showToast(fname + ' ' + lname + ' updated successfully!', 'success');
        if (saveBtnSelector) { saveBtnSelector.classList.remove('loading'); saveBtnSelector.innerHTML = '<i class="fas fa-check"></i> Saved!'; }
        var cachedAdmin = (allAdminDocs || []).find(function(a) { return a.docId === docId; });
        if (cachedAdmin) { Object.assign(cachedAdmin, { fname, lname, bday, address, username, password }); filterAdminAccounts(); }
        setTimeout(function() {
            closeEditAdminModal();
            if (saveBtnSelector) { saveBtnSelector.disabled = false; saveBtnSelector.innerHTML = originalHTML; }
        }, 1200);
        activities.unshift({ type:'edit', title:'Admin Account Updated', description: fname + ' ' + lname + '\'s account was updated', time:'Just now' });
        updateActivityLog();
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' edited admin account "' + username + '".', 'superadmin.html');
    } catch (e) {
        console.error('Error saving admin:', e);
        showToast('Error saving admin: ' + e.message, 'error');
        if (saveBtnSelector) { saveBtnSelector.classList.remove('loading'); saveBtnSelector.disabled = false; saveBtnSelector.innerHTML = originalHTML; }
    }
}

// ── Course Management ─────────────────────────────────────────────────────
function updateCourseSchoolDropdowns() {
    ['newCourseSchool','courseListSchoolFilter'].forEach(function(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        while (sel.options.length > 1) sel.remove(1);
        allSchoolDocs.forEach(function(school) {
            var opt = document.createElement('option');
            opt.value = school.docId; opt.textContent = school.schoolname;
            sel.appendChild(opt);
        });
    });
}

function filterCourseList() {
    var search = (document.getElementById('courseListSearch') ? document.getElementById('courseListSearch').value : '').toLowerCase();
    var filterVal = document.getElementById('courseListSchoolFilter') ? document.getElementById('courseListSchoolFilter').value : 'all';
    courseListFiltered = courseList.filter(function(c) {
        var matchSearch = !search || c.name.toLowerCase().includes(search);
        var matchFilter = filterVal === 'all' || String(c.school) === String(filterVal) || c.school === 'all';
        return matchSearch && matchFilter;
    });
    courseListPage = 1;
    renderCourseListTable();
}

function renderCourseListTable() {
    var tableBody = document.getElementById('courseListTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    var total = courseListFiltered.length;
    var totalPages = Math.max(1, Math.ceil(total / courseListPageSize));
    if (courseListPage > totalPages) courseListPage = totalPages;
    var start = (courseListPage - 1) * courseListPageSize;
    var end = Math.min(start + courseListPageSize, total);
    var pageData = courseListFiltered.slice(start, end);

    pageData.forEach(function(c, idx) {
        var row = document.createElement('tr');
        var isSupabaseId = typeof c.id === 'string';
        row.innerHTML =
            '<td>' + (start + idx + 1) + '</td>' +
            '<td><strong>' + (c.name || '') + '</strong></td>' +
            '<td>' + (c.schoolLabel || 'All Schools') + '</td>' +
            '<td>' + (c.eduLevel || '—') + '</td>' +
            '<td style="white-space:nowrap;">' +
                (isSupabaseId ? '<button class="btn btn-warning btn-small" onclick="openEditCourse(\'' + c.id + '\')" style="margin-right:4px;"><i class="fas fa-edit"></i></button>' : '') +
                '<button class="btn btn-danger btn-small" onclick="deleteCourseEntry(\'' + c.id + '\')"><i class="fas fa-trash"></i></button>' +
            '</td>';
        tableBody.appendChild(row);
    });

    var pageInfo = document.getElementById('courseListPageInfo');
    var pageIndicator = document.getElementById('courseListPageIndicator');
    var prevBtn = document.getElementById('courseListPrevBtn');
    var nextBtn = document.getElementById('courseListNextBtn');
    if (pageInfo) pageInfo.textContent = total === 0 ? 'No courses yet' : 'Showing ' + (start+1) + '-' + end + ' of ' + total + ' records';
    if (pageIndicator) pageIndicator.textContent = 'Page ' + courseListPage + ' of ' + totalPages;
    if (prevBtn) prevBtn.disabled = courseListPage <= 1;
    if (nextBtn) nextBtn.disabled = courseListPage >= totalPages;
}

function courseListPrevPage() { if (courseListPage > 1) { courseListPage--; renderCourseListTable(); } }
function courseListNextPage() { var tp=Math.max(1,Math.ceil(courseListFiltered.length/courseListPageSize)); if(courseListPage<tp){courseListPage++;renderCourseListTable();} }

function deleteCourseEntry(id) {
    var entry = courseList.find(function(c) { return String(c.id) === String(id); });
    if (!entry) return;
    if (confirm('Delete course "' + entry.name + '"?')) {
        courseList = courseList.filter(function(c) { return String(c.id) !== String(id); });
        ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
            if (schoolsData['all'] && schoolsData['all'][cat]) delete schoolsData['all'][cat][entry.name];
        });
        filterCourseList(); updateUnifiedTable(); updateSummary();
        activities.unshift({ type:'delete', title:'Course Deleted', description:'"' + entry.name + '" was removed', time:'Just now' });
        updateActivityLog();
    }
}

// ── Add Course Modal (superadmin version) ─────────────────────────────────
function openAddCourseModal() {
    var sel = document.getElementById('modalCourseSchool');
    if (sel) {
        while (sel.options.length > 1) sel.remove(1);
        allSchoolDocs.forEach(function(school) {
            var opt = document.createElement('option');
            opt.value = school.docId; opt.textContent = school.schoolname;
            sel.appendChild(opt);
        });
    }
    document.getElementById('addCourseModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeAddCourseModal() {
    document.getElementById('addCourseModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    var f = document.getElementById('sidebarAddCourseForm');
    if (f) f.reset();
}

async function getNextCourseId(schoolAbbrev, eduAttainment) {
    var safeSchool = schoolAbbrev.replace(/[^a-zA-Z0-9]/g, '');
    var safeEdu = eduAttainment.replace(/[^a-zA-Z0-9]/g, '_');
    var prefix = safeSchool + '_' + safeEdu;
    var max = 0;
    if (_clCoursesLoaded && clAllCourses.length) {
        clAllCourses.forEach(function(c) {
            if (!c.docId) return;
            if (c.docId.startsWith(prefix + '_')) {
                var num = parseInt(c.docId.substring(prefix.length + 1));
                if (!isNaN(num)) max = Math.max(max, num);
            }
        });
        return prefix + '_' + String(max + 1).padStart(4, '0');
    }
    var qs = 'course_Deletestats=eq.0';
    var rows = await SB.get('COURSE', qs);
    rows.forEach(function(r) {
        if (r.course_id && r.course_id.startsWith(prefix + '_')) {
            var num = parseInt(r.course_id.substring(prefix.length + 1));
            if (!isNaN(num)) max = Math.max(max, num);
        }
    });
    return prefix + '_' + String(max + 1).padStart(4, '0');
}

async function submitAddCourseModal(event) {
    event.preventDefault();
    var schoolSel   = document.getElementById('modalCourseSchool');
    var schoolVal   = schoolSel.value;
    var schoolLabel = schoolSel.options[schoolSel.selectedIndex].text;
    var schoolDoc   = allSchoolDocs.find(function(s) { return s.docId === schoolVal; });
    var schoolAbbrev = schoolDoc ? schoolDoc.schoolabbrev : schoolLabel;
    var eduLevel    = document.getElementById('modalEduAttainment').value;
    var courseName  = capitalizeEachSentence(document.getElementById('modalCourseName').value.trim());

    if (!courseName || !eduLevel || !schoolVal) return;

    var _addCourseBtn = document.querySelector('#sidebarAddCourseForm button[type="submit"]');
    var _addCourseBtnOrig = _addCourseBtn ? _addCourseBtn.innerHTML : '';
    function _restoreAddCourseBtn() { if (_addCourseBtn) { _addCourseBtn.disabled = false; _addCourseBtn.innerHTML = _addCourseBtnOrig; } }
    if (_addCourseBtn) { _addCourseBtn.disabled = true; _addCourseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...'; }

    try {
        var dupCached = (_clCoursesLoaded && clAllCourses.length)
            ? clAllCourses.find(function(c) {
                return c.schoolDocId === schoolVal && c.eduLevel === eduLevel && (c.courseName||'').toLowerCase() === courseName.toLowerCase();
              })
            : null;

        if (dupCached) { showToast('Course already exists for this school and educational level!', 'error'); _restoreAddCourseBtn(); return; }

        if (!(_clCoursesLoaded && clAllCourses.length)) {
            var dupQs = 'course_SchoolID=eq.' + encodeURIComponent(schoolVal) + '&course_EducationalAttainment=eq.' + encodeURIComponent(eduLevel) + '&course_SchoolCourse=eq.' + encodeURIComponent(courseName) + '&course_Deletestats=eq.0';
            var dupRows = await SB.get('COURSE', dupQs);
            if (dupRows.length > 0) { showToast('Course already exists for this school and educational level!', 'error'); _restoreAddCourseBtn(); return; }
        }

        var _coursePayload = {
            course_SchoolCourse: courseName,
            course_AddedbyName: currentUser ? currentUser.username : 'SuperAdmin',
            course_TimeStamp: new Date().toISOString(),
            course_EducationalAttainment: eduLevel,
            course_SchoolID: schoolVal, course_SchoolName: schoolLabel, course_SchoolAbbrev: schoolAbbrev,
            course_Deletestats: '0'
        };
        var inserted;
        try {
            inserted = await SB.insert('COURSE', _coursePayload);
        } catch (_crsSeqErr) {
            var _crsErrStr = String(_crsSeqErr.message || _crsSeqErr);
            if (_crsErrStr.indexOf('23505') !== -1 || _crsErrStr.toLowerCase().indexOf('duplicate key') !== -1) {
                var _crsMax = await SB.get('COURSE', 'select=course_id&order=course_id.desc&limit=1');
                var _crsNextId = (_crsMax.length > 0 ? (parseInt(_crsMax[0].course_id) || 0) : 0) + 1;
                inserted = await SB.insert('COURSE', Object.assign({ course_id: _crsNextId }, _coursePayload));
            } else { throw _crsSeqErr; }
        }
        var newDocId = String(((inserted || [])[0] || {}).course_id || '');

        if (!schoolsData[schoolVal]) schoolsData[schoolVal] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
        ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
            schoolsData[schoolVal][cat][courseName] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
            if (!schoolsData['all'][cat][courseName]) schoolsData['all'][cat][courseName] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
        });
        courseList.push({ id: newDocId, name: courseName, school: schoolVal, schoolLabel: schoolLabel, eduLevel: eduLevel });
        updateUnifiedTable(); updateSummary(); filterCourseList();
        showToast('"' + courseName + '" added successfully!', 'success');

        if (_clCoursesLoaded) {
            clAllCourses.push({ docId: newDocId, courseName, schoolName: schoolLabel, schoolAbbrev, schoolDocId: schoolVal, eduLevel });
            clAllCourses.sort(function(a,b){ return a.courseName.localeCompare(b.courseName); });
        }
        activities.unshift({ type:'add', title:'New Course Added', description:'"' + courseName + '" (' + eduLevel + ') added for ' + schoolLabel, time:'Just now' });
        updateActivityLog();
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' added course "' + courseName + '" (' + eduLevel + ') for ' + schoolLabel, 'superadmin.html');
        closeAddCourseModal();
        const clSectionAdd = document.getElementById('add-course');
        if (clSectionAdd && clSectionAdd.classList.contains('active') && typeof clFilterCourses === 'function') clFilterCourses();
    } catch (_addCourseErr) {
        console.error('submitAddCourseModal error:', _addCourseErr);
        showToast('Error adding course: ' + (_addCourseErr.message || 'Unknown error'), 'error');
    } finally { _restoreAddCourseBtn(); }
}

// ── Edit Course (superadmin) ──────────────────────────────────────────────
async function openEditCourse(courseDocId) {
    try {
        var cached = (typeof clAllCourses !== 'undefined' ? clAllCourses : []).find(function(c) { return c.docId === courseDocId; });
        var schoolDocId, courseName, eduLevel;
        if (cached) {
            schoolDocId = cached.schoolDocId; courseName = cached.courseName; eduLevel = cached.eduLevel;
        } else {
            var rows = await SB.get('COURSE', 'course_id=eq.' + encodeURIComponent(courseDocId));
            if (!rows.length) { showToast('Course not found!', 'error'); return; }
            var r = rows[0];
            schoolDocId = r.course_SchoolID; courseName = r.course_SchoolCourse; eduLevel = r.course_EducationalAttainment;
        }

        var schoolSel = document.getElementById('editCourseSchool');
        if (schoolSel) {
            schoolSel.innerHTML = '<option value="">Select School</option>';
            allSchoolDocs.forEach(function(school) {
                var opt = document.createElement('option');
                opt.value = school.docId; opt.textContent = school.schoolname;
                if (school.docId === schoolDocId) opt.selected = true;
                schoolSel.appendChild(opt);
            });
        }
        document.getElementById('editCourseDocId').value = courseDocId;
        document.getElementById('editCourseName').value  = courseName || '';
        document.getElementById('editCourseEdu').value   = eduLevel   || '';
        var ecBtn = document.querySelector('#editCourseModal .btn-primary');
        if (ecBtn) { ecBtn.disabled = false; ecBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
        document.getElementById('editCourseModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch (e) { console.error('Error opening edit course:', e); showToast('Error loading course data', 'error'); }
}

function closeEditCourseModal() { document.getElementById('editCourseModal').style.display = 'none'; document.body.style.overflow = 'auto'; }

async function saveEditCourse() {
    var ecBtn = document.querySelector('#editCourseModal .btn-primary');
    var ecOriginal = ecBtn ? ecBtn.innerHTML : '<i class="fas fa-save"></i> Save Changes';
    function _restoreEcBtn() { if (ecBtn) { ecBtn.disabled = false; ecBtn.innerHTML = ecOriginal; } }
    try {
        var docId      = document.getElementById('editCourseDocId').value;
        var courseName = capitalizeEachSentence(document.getElementById('editCourseName').value.trim());
        var schoolVal  = document.getElementById('editCourseSchool') ? document.getElementById('editCourseSchool').value : '';
        var eduLevel   = document.getElementById('editCourseEdu').value;

        if (!courseName || !eduLevel) { showToast('Please fill in all fields', 'error'); return; }

        var dup = (clAllCourses || []).find(function(c) {
            return c.docId !== docId && c.schoolDocId === schoolVal && c.eduLevel === eduLevel && (c.courseName||'').toLowerCase() === courseName.toLowerCase();
        });
        if (dup) { showToast('This course already exists for this school and level!', 'error'); return; }

        if (ecBtn) { ecBtn.disabled = true; ecBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

        var matchedSchool = allSchoolDocs.find(function(s) { return s.docId === schoolVal; });
        var schoolNameVal = matchedSchool ? matchedSchool.schoolname : '';
        var schoolAbbrevVal = matchedSchool ? matchedSchool.schoolabbrev : '';

        await SB.update('COURSE', { course_id: docId }, {
            course_SchoolCourse: courseName, course_SchoolID: schoolVal,
            course_EducationalAttainment: eduLevel, course_SchoolName: schoolNameVal, course_SchoolAbbrev: schoolAbbrevVal
        });

        showToast('Course updated successfully!', 'success');
        if (clAllCourses) {
            var cachedCourse = clAllCourses.find(function(c) { return c.docId === docId; });
            if (cachedCourse) { cachedCourse.courseName = courseName; cachedCourse.schoolDocId = schoolVal; cachedCourse.schoolName = schoolNameVal; cachedCourse.schoolAbbrev = schoolAbbrevVal; cachedCourse.eduLevel = eduLevel; }
            if (typeof clFilterCourses === 'function') clFilterCourses();
        }
        var cacheKey = currentSchool + '_' + currentEducationalLevel;
        _courseLoadCache[cacheKey] = false;
        filterCourseList();
        if (ecBtn) ecBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        setTimeout(function() { closeEditCourseModal(); _restoreEcBtn(); }, 900);
        activities.unshift({ type:'edit', title:'Course Updated', description:'"' + courseName + '" was updated', time:'Just now' });
        updateActivityLog();
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' edited course "' + courseName + '".', 'superadmin.html');
    } catch (e) { console.error('Error saving course:', e); showToast('Error saving course: ' + e.message, 'error'); _restoreEcBtn(); }
}

async function deleteCourse(courseDocId, courseName) {
    if (confirm('Delete course "' + courseName + '"? This cannot be undone.')) {
        try {
            await SB.update('COURSE', { course_id: courseDocId }, { course_Deletestats: '1' });
            showToast('Course deleted successfully!', 'success');
            filterCourseList();
            var cacheKey = currentSchool + '_' + currentEducationalLevel;
            _courseLoadCache[cacheKey] = false;
            loadCoursesFromSupabase();
            activities.unshift({ type:'delete', title:'Course Deleted', description:'"' + courseName + '" was deleted', time:'Just now' });
            updateActivityLog();
        } catch (e) { console.error('Error deleting course:', e); showToast('Error deleting course', 'error'); }
    }
}

// ── Course List Panel (add-course section) ────────────────────────────────
function clPopulateFilters() {
    var schoolSel = document.getElementById('clSchoolFilter');
    if (schoolSel) {
        while (schoolSel.options.length > 1) schoolSel.remove(1);
        allSchoolDocs.forEach(function(s) {
            var opt = document.createElement('option'); opt.value = s.docId; opt.textContent = s.schoolname; schoolSel.appendChild(opt);
        });
    }
}

async function clLoadCoursesFromSupabase(force) {
    if (!force && _clCoursesLoaded) { clFilterCourses(); return; }
    try {
        const rows = await SB.get('COURSE', 'course_Deletestats=eq.0');
        clAllCourses = rows.map(function(r) {
            return { docId: String(r.course_id), courseName: r.course_SchoolCourse||'', schoolName: r.course_SchoolName||'', schoolAbbrev: r.course_SchoolAbbrev||'', schoolDocId: r.course_SchoolID||'', eduLevel: r.course_EducationalAttainment||'' };
        });
        clAllCourses.sort(function(a, b) { return a.courseName.localeCompare(b.courseName); });
        _clCoursesLoaded = true;
        clFilterCourses();
    } catch (e) { console.error('clLoadCoursesFromSupabase error:', e); }
}

function clFilterCourses() {
    var search = (document.getElementById('clSearchInput') ? document.getElementById('clSearchInput').value : '').toLowerCase();
    var eduVal = document.getElementById('clEduFilter') ? document.getElementById('clEduFilter').value : 'all';
    var schoolVal = document.getElementById('clSchoolFilter') ? document.getElementById('clSchoolFilter').value : 'all';
    clFiltered = clAllCourses.filter(function(c) {
        var matchSearch = !search || c.courseName.toLowerCase().includes(search) || c.schoolName.toLowerCase().includes(search);
        var matchEdu = eduVal === 'all' || c.eduLevel === eduVal;
        var matchSchool = schoolVal === 'all' || c.schoolDocId === schoolVal;
        return matchSearch && matchEdu && matchSchool;
    });
    clPage = 1;
    clRenderTable();
}

function clRenderTable() {
    var tbody = document.getElementById('clTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var total = clFiltered.length;
    var totalPages = Math.max(1, Math.ceil(total / clPageSize));
    if (clPage > totalPages) clPage = totalPages;
    var start = (clPage - 1) * clPageSize;
    var end = Math.min(start + clPageSize, total);
    var pageData = clFiltered.slice(start, end);
    if (!pageData.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;">No courses found.</td></tr>';
    } else {
        pageData.forEach(function(c, i) {
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + (start + i + 1) + '</td>' +
                '<td><strong>' + (c.courseName||'—') + '</strong></td>' +
                '<td>' + (c.schoolName||'—') + '</td>' +
                '<td>' + (c.eduLevel||'—') + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn btn-warning btn-small" onclick="openEditCourse(\'' + c.docId + '\')" style="margin-right:4px;"><i class="fas fa-edit"></i></button>' +
                    '<button class="btn btn-danger btn-small" onclick="deleteCourse(\'' + c.docId + '\',\'' + (c.courseName||'').replace(/'/g,"\\'") + '\')"><i class="fas fa-trash"></i></button>' +
                '</td>';
            tbody.appendChild(tr);
        });
    }
    var pageInfo = document.getElementById('clPageInfo');
    var pageIndicator = document.getElementById('clPageIndicator');
    var prevBtn = document.getElementById('clPrevBtn');
    var nextBtn = document.getElementById('clNextBtn');
    if (pageInfo) pageInfo.textContent = total === 0 ? 'No courses found' : 'Showing ' + (start+1) + '-' + end + ' of ' + total;
    if (pageIndicator) pageIndicator.textContent = 'Page ' + clPage + ' of ' + totalPages;
    if (prevBtn) prevBtn.disabled = clPage <= 1;
    if (nextBtn) nextBtn.disabled = clPage >= totalPages;
}

function clPrevPage() { if (clPage > 1) { clPage--; clRenderTable(); } }
function clNextPage() { var tp=Math.max(1,Math.ceil(clFiltered.length/clPageSize)); if(clPage<tp){clPage++;clRenderTable();} }

// ── Schools List Section ──────────────────────────────────────────────────
function slPopulateFilter() {
    var sel = document.getElementById('slFilterSelect');
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    allSchoolDocs.forEach(function(school) {
        var opt = document.createElement('option'); opt.value = school.docId; opt.textContent = school.schoolname; sel.appendChild(opt);
    });
}

function slFilterSchools() {
    var search   = (document.getElementById('slSearchInput') ? document.getElementById('slSearchInput').value : '').toLowerCase();
    var filterVal = document.getElementById('slFilterSelect') ? document.getElementById('slFilterSelect').value : 'all';
    slFiltered = allSchoolDocs.filter(function(s) {
        var matchSearch = !search || (s.schoolname||'').toLowerCase().includes(search) || (s.schoolabbrev||'').toLowerCase().includes(search) || (s.email_add||'').toLowerCase().includes(search) || (s.schoolpres||'').toLowerCase().includes(search);
        var matchFilter = filterVal === 'all' || s.docId === filterVal;
        return matchSearch && matchFilter;
    });
    slPage = 1;
    slRenderTable();
}

function slRenderTable() {
    var tbody = document.getElementById('slTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var total = slFiltered.length;
    var totalPages = Math.max(1, Math.ceil(total / slPageSize));
    if (slPage > totalPages) slPage = totalPages;
    var start = (slPage - 1) * slPageSize;
    var end = Math.min(start + slPageSize, total);
    var pageData = slFiltered.slice(start, end);
    pageData.forEach(function(s, idx) {
        var row = document.createElement('tr');
        var sPwId = 'school-pw-' + (s.docId || '').replace(/[^a-zA-Z0-9]/g, '_');
        var safeDocId = (s.docId || '').replace(/'/g, "\\'");
        var schoolNameEsc = (s.schoolname||'').replace(/'/g,"\\'");
        row.innerHTML =
            '<td>' + (start + idx + 1) + '</td>' +
            '<td><strong>' + (s.schoolname||'') + '</strong></td>' +
            '<td>' + (s.schoolabbrev||'') + '</td>' +
            '<td>' + (s.schoolpres||'—') + '</td>' +
            '<td>' + (s.email_add||'—') + '</td>' +
            '<td>' + (s.contact_number||'—') + '</td>' +
            '<td>' + (s.username||'') + '</td>' +
            '<td><div class="password-wrap"><div class="password-display" id="' + sPwId + '" data-show="0" data-pw="">••••••••</div><button class="password-eye-btn" onclick="togglePasswordById(\'' + sPwId + '\')" title="Show/Hide"><i class="fas fa-eye"></i></button></div></td>' +
            '<td><div class="action-cell">' +
                '<button class="btn btn-warning btn-small" onclick="openEditSchoolModal(\'' + safeDocId + '\')"><i class="fas fa-edit"></i> Edit</button>' +
                '<button class="btn btn-danger btn-small" onclick="confirmDeleteSchool(\'' + safeDocId + '\', \'' + schoolNameEsc + '\')"><i class="fas fa-trash"></i> Delete</button>' +
            '</div></td>';
        var pwEl = row.querySelector('#' + sPwId);
        if (pwEl) pwEl.setAttribute('data-pw', s.password || '');
        tbody.appendChild(row);
    });
    var pageInfo = document.getElementById('slPageInfo');
    var pageIndicator = document.getElementById('slPageIndicator');
    var prevBtn = document.getElementById('slPrevBtn');
    var nextBtn = document.getElementById('slNextBtn');
    if (pageInfo) pageInfo.textContent = total === 0 ? 'No schools found' : 'Showing ' + (start+1) + '-' + end + ' of ' + total + ' records';
    if (pageIndicator) pageIndicator.textContent = 'Page ' + slPage + ' of ' + totalPages;
    if (prevBtn) prevBtn.disabled = slPage <= 1;
    if (nextBtn) nextBtn.disabled = slPage >= totalPages;
}

function slPrevPage() { if (slPage > 1) { slPage--; slRenderTable(); } }
function slNextPage() { var tp=Math.max(1,Math.ceil(slFiltered.length/slPageSize)); if(slPage<tp){slPage++;slRenderTable();} }

// ── Settings ──────────────────────────────────────────────────────────────
async function loadSettingsIntoForm() {
    try {
        const rows = await SB.get('Settings', '');
        const s = rows[0] || {};
        _settingsDocId = s.settings_id || '';
        var fields = { systemName: s.SystemName, systemEmail: s.SystemEmail, backupFreq: s.BackUpFrequency };
        Object.keys(fields).forEach(function(id) {
            var el = document.getElementById(id);
            if (el && fields[id] !== undefined) el.value = fields[id];
        });
        updatePageWithSettings(s);
        // Auto-backup: check if a scheduled backup is due
        setTimeout(function() { checkAndRunBackup(); }, 1200);
    } catch (e) { console.error('loadSettingsIntoForm error:', e); }
}

function updatePageWithSettings(settings) {
    if (settings.SystemName) {
        document.getElementById('navSiteName').textContent = settings.SystemName;
    }
    if (settings.SystemEmail) {
        var contactCards = document.querySelectorAll('.contact-card');
        contactCards.forEach(function(card) {
            var icon = card.querySelector('i');
            if (icon && icon.classList.contains('fa-envelope')) {
                var pElement = card.querySelector('p');
                if (pElement) pElement.textContent = settings.SystemEmail;
            }
        });
    }
}

var _settingsSaving = false;
async function saveSettings() {
    if (_settingsSaving) return;
    _settingsSaving = true;
    var saveBtn = document.querySelector('#settings .btn-primary');
    var orig = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
    try {
        var systemName  = document.getElementById('systemName')  ? document.getElementById('systemName').value.trim() : '';
        var systemEmail = document.getElementById('systemEmail') ? document.getElementById('systemEmail').value.trim() : '';
        var backupFreq  = document.getElementById('backupFreq')  ? document.getElementById('backupFreq').value : '';

        var settingsData = { SystemName: systemName, SystemEmail: systemEmail, BackUpFrequency: backupFreq, MaintenaceMode: 'false' };
        if (_settingsDocId) {
            await SB.update('Settings', { settings_id: _settingsDocId }, settingsData);
        } else {
            var inserted = await SB.insert('Settings', settingsData);
            _settingsDocId = ((inserted || [])[0] || {}).settings_id || '';
        }
        updatePageWithSettings(settingsData);
        showToast('Settings saved successfully!', 'success');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        saveActivityLog((currentUser ? currentUser.username : 'SuperAdmin') + ' updated system settings.', 'superadmin.html');
        setTimeout(function() { if (saveBtn) { saveBtn.innerHTML = orig; saveBtn.disabled = false; } _settingsSaving = false; }, 2000);
    } catch (e) {
        console.error('saveSettings error:', e);
        showToast('Error saving settings: ' + e.message, 'error');
        if (saveBtn) { saveBtn.innerHTML = orig; saveBtn.disabled = false; }
        _settingsSaving = false;
    }
}


// ── Settings Tabs ─────────────────────────────────────────────────────────────
function showSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.settings-tab-content').forEach(function(pane) {
        pane.classList.remove('active');
    });
    var target = document.getElementById('settingsTab_' + tabName);
    if (target) target.classList.add('active');
    if (tabName === 'reported-issues') loadReportedIssues();
}

// ── Reported Issues (table: ProblemReports) ───────────────────────────────────
var _reportedIssuesLoading = false;

async function loadReportedIssues() {
    if (_reportedIssuesLoading) return;
    _reportedIssuesLoading = true;
    var loadingEl = document.getElementById('reportedIssuesLoading');
    var emptyEl   = document.getElementById('reportedIssuesEmpty');
    var tableEl   = document.getElementById('reportedIssuesTableWrap');
    var tbody     = document.getElementById('reportedIssuesTableBody');
    if (loadingEl) loadingEl.style.display = 'flex';
    if (emptyEl)   emptyEl.style.display   = 'none';
    if (tableEl)   tableEl.style.display   = 'none';
    try {
        var rows = await SB.get('ProblemReports', 'order=ProblemReport_created_at.desc');
        if (loadingEl) loadingEl.style.display = 'none';
        if (!rows || !rows.length) {
            if (emptyEl) emptyEl.style.display = 'flex';
            _reportedIssuesLoading = false;
            return;
        }
        if (tableEl) tableEl.style.display = 'block';
        if (tbody) {
            tbody.innerHTML = '';
            rows.forEach(function(r, idx) {
                var tr = document.createElement('tr');
                var dateStr = r.ProblemReport_created_at
                    ? new Date(r.ProblemReport_created_at).toLocaleString('en-US', {
                        month:'short', day:'numeric', year:'numeric',
                        hour:'2-digit', minute:'2-digit', hour12:true })
                    : '—';
                var school   = r.ProblemReport_SchoolName   || '—';
                var username = r.ProblemReport_Username     || '—';
                var desc     = r.ProblemReport_Description  || '—';
                var contact  = r.ProblemReport_ContactNumber|| '—';
                var device   = r.ProblemReport_DeviceName   || '—';
                tr.innerHTML =
                    '<td style="text-align:center;color:#9ca3af;font-weight:600;font-size:.82rem;">' + (idx + 1) + '</td>' +
                    '<td style="font-size:.85rem;">' + alEsc(school) + '</td>' +
                    '<td><strong style="font-size:.85rem;">' + alEsc(username) + '</strong></td>' +
                    '<td style="max-width:280px;font-size:.85rem;">' + alEsc(desc) + '</td>' +
                    '<td style="font-size:.83rem;">' + alEsc(contact) + '</td>' +
                    '<td style="font-size:.83rem;">' + dateStr + '</td>' +
                    '<td style="font-size:.82rem;color:#6b7280;">' + alEsc(device) + '</td>';
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'flex';
            var spans = emptyEl.querySelectorAll('span');
            if (spans[0]) spans[0].textContent = 'Could not load reports.';
            if (spans[1]) spans[1].textContent = e.message || 'Check console for details.';
        }
        console.error('loadReportedIssues error:', e);
    } finally { _reportedIssuesLoading = false; }
}

// ── Backup Frequency — Auto-Download .sql ─────────────────────────────────────
var _backupRunning = false; // guard against multiple simultaneous runs

function onBackupFreqChange() {
    checkAndRunBackup();
}

function manualBackupNow() {
    var freq = document.getElementById('backupFreq') ? document.getElementById('backupFreq').value : '';
    if (!freq) { showToast('Please select a backup frequency first.', 'error'); return; }
    generateAndDownloadBackup(freq, true);
}

function checkAndRunBackup() {
    if (_backupRunning) return; // already running
    var freq = document.getElementById('backupFreq') ? document.getElementById('backupFreq').value : '';
    if (!freq) return;
    var now     = new Date();
    var lastStr = localStorage.getItem('utownLastBackup_' + freq);
    var shouldRun = false;
    if (!lastStr) {
        shouldRun = true;
    } else {
        var last = new Date(lastStr);
        if (freq === 'daily') {
            shouldRun = now.toDateString() !== last.toDateString();
        } else if (freq === 'weekly') {
            // First day of week = Monday
            var dayIdx    = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
            var diffToMon = (dayIdx === 0) ? -6 : 1 - dayIdx;
            var thisMonday = new Date(now);
            thisMonday.setDate(now.getDate() + diffToMon);
            thisMonday.setHours(0, 0, 0, 0);
            shouldRun = last < thisMonday;
        } else if (freq === 'monthly') {
            shouldRun = (now.getMonth()    !== last.getMonth()) ||
                        (now.getFullYear() !== last.getFullYear());
        }
    }
    if (shouldRun) {
        // Mark as done in localStorage immediately to block parallel calls
        localStorage.setItem('utownLastBackup_' + freq, new Date().toISOString());
        generateAndDownloadBackup(freq, false);
    }
}

async function generateAndDownloadBackup(freq, isManual) {
    if (_backupRunning) { showToast('Backup is already in progress...', 'error'); return; }
    if (!freq) { showToast('No backup frequency selected.', 'error'); return; }
    _backupRunning = true;
    showToast('Generating ' + freq + ' backup — please wait…', 'success');

    var ts    = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    var lines = [];
    lines.push('-- ================================================');
    lines.push('-- UTOWN DATA SYSTEM BACKUP');
    lines.push('-- Generated : ' + new Date().toLocaleString());
    lines.push('-- Frequency : ' + freq + (isManual ? ' (manual)' : ' (auto-scheduled)'));
    lines.push('-- ================================================');
    lines.push('');

    // Uses SB.get(table, filterString) — matches the existing SB helper pattern
    async function dumpTable(tableName, filter, label) {
        lines.push('-- TABLE: ' + label);
        try {
            var rows = await SB.get(tableName, filter);
            if (!rows || !rows.length) { lines.push('-- (no rows)'); lines.push(''); return; }
            rows.forEach(function(r) {
                var keys = Object.keys(r);
                var cols = keys.map(function(k) { return '"' + k + '"'; }).join(', ');
                var vals = keys.map(function(k) {
                    var v = r[k];
                    if (v === null || v === undefined) return 'NULL';
                    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
                    return "'" + String(v).replace(/'/g, "''") + "'";
                }).join(', ');
                lines.push('INSERT INTO "' + tableName + '" (' + cols + ') VALUES (' + vals + ') ON CONFLICT DO NOTHING;');
            });
            lines.push('-- ' + rows.length + ' row(s)');
        } catch (e) {
            lines.push('-- ERROR dumping ' + tableName + ': ' + e.message);
        }
        lines.push('');
    }

    // Use the same filter patterns already proven to work in existing code
    await dumpTable('ListofSchool',      'deletestats=eq.0',  'ListofSchool (schools)');
    await dumpTable('COURSE',            'course_Deletestats=eq.0', 'COURSE');
    await dumpTable('SuperAdminAccount', 'delstats=eq.0',     'SuperAdminAccount');
    await dumpTable('Settings',          '',                   'Settings');
    await dumpTable('ProblemReports',    '',                   'ProblemReports');

    lines.push('-- END OF BACKUP');
    var sql  = lines.join('\n');
    var blob = new Blob([sql], { type: 'application/sql' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'utown_backup_' + freq + '_' + ts + '.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (isManual) {
        // For manual backups also update the auto-schedule timestamp
        localStorage.setItem('utownLastBackup_' + freq, new Date().toISOString());
    }
    _backupRunning = false;
    showToast('Backup saved: utown_backup_' + freq + '_' + ts + '.sql', 'success');
}

// =============================================
// ACTIVITY LOG MODULE
// =============================================
const activityLogState = {
    allDocs: [], filtered: [], currentPage: 1, perPage: 10,
    sortAsc: false, searchQuery: '', filterUsername: '', filterSchool: '', filterRole: '',
    isLoading: false, initialized: false,
};

async function initActivityLog() {
    if (activityLogState.isLoading) return;
    activityLogState.isLoading = true;
    showActivityLogState('loading');
    spinRefreshBtn(true);
    activityLogState.initialized = false;
    try {
        const rows = await SB.get('ActivityLog', 'order=ActivityLog_created_at.desc');
        activityLogState.allDocs = rows.map(function(r) {
            return {
                id:          r.ActivityLog_ID,
                AccountRole: r.ActivityLog_AccountRole || '',
                Description: r.ActivityLog_Description || '',
                Location:    r.ActivityLog_Location    || '',
                TimeStamp:   r.ActivityLog_created_at,
                Username:    (r.ActivityLog_Description || '').split(' ')[0] || '',
                UserID:      ''
            };
        });
        populateActivityLogDropdowns();
        applyActivityLogFilters();
        activityLogState.initialized = true;
    } catch (err) {
        console.error('[ActivityLog] error:', err);
        showActivityLogState('error', err.message || 'Failed to load activity logs.');
    } finally {
        activityLogState.isLoading = false;
        spinRefreshBtn(false);
    }
}

function populateActivityLogDropdowns() {
    const docs = activityLogState.allDocs;
    const usernames = [...new Set(docs.map(function(d) { return d.Username; }).filter(Boolean))].sort();
    const usernameSelect = document.getElementById('alUsernameFilter');
    if (usernameSelect) {
        usernameSelect.innerHTML = '<option value="">All Users</option>';
        usernames.forEach(function(u) { var opt = document.createElement('option'); opt.value = u; opt.textContent = u; usernameSelect.appendChild(opt); });
    }
    const roles = [...new Set(docs.map(function(d) { return d.AccountRole; }).filter(Boolean))].sort();
    const roleSelect = document.getElementById('alRoleFilter');
    if (roleSelect) {
        roleSelect.innerHTML = '<option value="">All Roles</option>';
        roles.forEach(function(r) { var opt = document.createElement('option'); opt.value = r; opt.textContent = alCapFirst(r); roleSelect.appendChild(opt); });
    }
    const schoolSelect = document.getElementById('alSchoolFilter');
    if (schoolSelect && Array.isArray(allSchoolDocs)) {
        schoolSelect.innerHTML = '<option value="">All Schools</option>';
        allSchoolDocs.forEach(function(school) { var opt = document.createElement('option'); opt.value = school.docId; opt.textContent = school.schoolname || school.docId; schoolSelect.appendChild(opt); });
    }
}

function applyActivityLogFilters() {
    const state = activityLogState;
    const q = state.searchQuery.toLowerCase().trim();
    let results = [...state.allDocs].sort(function(a, b) {
        var tA = alToMs(a.TimeStamp), tB = alToMs(b.TimeStamp);
        return state.sortAsc ? tA - tB : tB - tA;
    });
    if (state.filterUsername) results = results.filter(function(d) { return (d.Username||'').toLowerCase() === state.filterUsername.toLowerCase(); });
    if (state.filterRole)     results = results.filter(function(d) { return (d.AccountRole||'').toLowerCase() === state.filterRole.toLowerCase(); });
    if (state.filterSchool) {
        var school = (allSchoolDocs||[]).find(function(s) { return s.docId === state.filterSchool; });
        if (school) {
            var abbrev = (school.schoolabbrev||'').toLowerCase();
            results = results.filter(function(d) { return (d.Username||'').toLowerCase().includes(abbrev) || (d.Description||'').toLowerCase().includes(abbrev); });
        }
    }
    if (q) {
        results = results.filter(function(d) {
            return (d.Description||'').toLowerCase().includes(q) || (d.Username||'').toLowerCase().includes(q) || (d.Location||'').toLowerCase().includes(q) || String(d.id||'').toLowerCase().includes(q);
        });
    }
    state.filtered = results;
    state.currentPage = 1;
    renderActivityLogPage();
    updateActivityLogStats();
    updateAlPills();
    updateAlFilterStyles();
}

function renderActivityLogPage() {
    const state = activityLogState;
    const { filtered, currentPage, perPage } = state;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    const start = (currentPage - 1) * perPage;
    const pageItems = filtered.slice(start, start + perPage);
    if (filtered.length === 0) { showActivityLogState('empty'); return; }
    showActivityLogState('table');
    const tbody = document.getElementById('alTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    pageItems.forEach(function(doc, idx) { tbody.appendChild(buildAlRow(doc, start + idx + 1)); });
    renderAlPagination(totalPages);

}

function buildAlRow(doc, rowNum) {
    var tr = document.createElement('tr');
    var { dateStr, timeStr } = alFormatTs(doc.TimeStamp);
    var username = doc.Username || '—';
    var role = doc.AccountRole || '';
    var desc = doc.Description || '—';
    var location = doc.Location || '—';
    var initials = username.substring(0, 2).toUpperCase();
    var rowId = 'alrow-' + (doc.id || rowNum).toString().replace(/[^a-zA-Z0-9]/g, '_');
    tr.innerHTML =
        '<td class="al-td al-td-num">' + rowNum + '</td>' +
        '<td class="al-td al-td-time"><span class="al-time-date">' + alEsc(dateStr) + '</span><span class="al-time-clock">' + alEsc(timeStr) + '</span></td>' +
        '<td class="al-td al-td-user"><div class="al-username-wrap"><span class="al-avatar" style="' + alAvatarColor(username) + '">' + alEsc(initials) + '</span><span class="al-username-text">' + alEsc(username) + '</span></div></td>' +
        '<td class="al-td al-td-role"><span class="al-role-badge ' + alRoleClass(role) + '">' + (alEsc(alCapFirst(role)) || '—') + '</span></td>' +
        '<td class="al-td al-td-desc"><div class="al-desc-text" id="desc-' + rowId + '">' + alEsc(desc) + '</div>' + '<button class="al-desc-toggle" id="tog-' + rowId + '" onclick="toggleAlDesc(\'desc-' + rowId + '\',this)">Show more</button>' + '</td>' +
        '<td class="al-td al-td-loc"><span class="al-location-chip"><i class="fas fa-file-code" style="font-size:.7rem;"></i> ' + alEsc(location) + '</span></td>';
    return tr;
}

function renderAlPagination(totalPages) {
    var current = activityLogState.currentPage;
    var pag = document.getElementById('alPagination');
    if (!pag) return;
    if (totalPages <= 1) { pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    var pageInfo = document.getElementById('alPageInfo');
    var firstBtn = document.getElementById('alFirstBtn');
    var prevBtn  = document.getElementById('alPrevBtn');
    var nextBtn  = document.getElementById('alNextBtn');
    var lastBtn  = document.getElementById('alLastBtn');
    if (pageInfo) pageInfo.textContent = 'Page ' + current + ' of ' + totalPages;
    if (firstBtn) firstBtn.disabled = current === 1;
    if (prevBtn)  prevBtn.disabled  = current === 1;
    if (nextBtn)  nextBtn.disabled  = current === totalPages;
    if (lastBtn)  lastBtn.disabled  = current === totalPages;
    var pageNums = document.getElementById('alPageNumbers');
    if (pageNums) {
        pageNums.innerHTML = '';
        alBuildPageRange(current, totalPages).forEach(function(p) {
            if (p === '...') { var s = document.createElement('span'); s.className = 'al-page-ellipsis'; s.textContent = '…'; pageNums.appendChild(s); }
            else { var btn = document.createElement('button'); btn.className = 'al-page-num-btn' + (p === current ? ' al-page-active' : ''); btn.textContent = p; btn.onclick = (function(pg){return function(){goToActivityLogPage(pg);};})(p); pageNums.appendChild(btn); }
        });
    }
}

function alBuildPageRange(current, total) {
    if (total <= 7) return Array.from({length:total},function(_,i){return i+1;});
    var pages=[], left=Math.max(2,current-2), right=Math.min(total-1,current+2);
    pages.push(1);
    if (left > 2) pages.push('...');
    for (var i = left; i <= right; i++) pages.push(i);
    if (right < total - 1) pages.push('...');
    pages.push(total);
    return pages;
}

function updateActivityLogStats() {
    var filtered = activityLogState.filtered;
    var todayStr = new Date().toDateString();
    var todayCount = filtered.filter(function(d) { var ms = alToMs(d.TimeStamp); return ms && new Date(ms).toDateString() === todayStr; }).length;
    var uniqueUsers = new Set(filtered.map(function(d) { return d.Username; }).filter(Boolean)).size;
    var badge = document.getElementById('alTotalBadge');
    if (badge) badge.textContent = activityLogState.allDocs.length.toLocaleString() + ' total';
    var ss = document.getElementById('alStatShowing');
    if (ss) ss.textContent = 'Showing ' + filtered.length.toLocaleString() + ' result' + (filtered.length !== 1 ? 's' : '');
    var st = document.getElementById('alStatToday');
    if (st) st.textContent = 'Today: ' + todayCount.toLocaleString();
    var su = document.getElementById('alStatUniqueUsers');
    if (su) su.textContent = 'Users: ' + uniqueUsers.toLocaleString();
}

function updateAlPills() {
    var state = activityLogState;
    var container = document.getElementById('alActiveFilters');
    if (!container) return;
    var pills = [];
    if (state.searchQuery)    pills.push({label:'Search: "'+state.searchQuery+'"',    clear:function(){state.searchQuery='';document.getElementById('alSearchInput').value='';alToggleClear();applyActivityLogFilters();}});
    if (state.filterUsername) pills.push({label:'User: '+state.filterUsername,         clear:function(){state.filterUsername='';document.getElementById('alUsernameFilter').value='';applyActivityLogFilters();}});
    if (state.filterSchool) {
        var school = (allSchoolDocs||[]).find(function(s){return s.docId===state.filterSchool;});
        pills.push({label:'School: '+(school?school.schoolname:state.filterSchool), clear:function(){state.filterSchool='';var el=document.getElementById('alSchoolFilter');if(el)el.value='';applyActivityLogFilters();}});
    }
    if (state.filterRole) pills.push({label:'Role: '+alCapFirst(state.filterRole), clear:function(){state.filterRole='';var el=document.getElementById('alRoleFilter');if(el)el.value='';applyActivityLogFilters();}});
    if (!pills.length) { container.style.display='none'; return; }
    container.style.display='flex'; container.innerHTML='';
    pills.forEach(function(pill){
        var span=document.createElement('span'); span.className='al-pill';
        span.innerHTML=alEsc(pill.label)+' <button class="al-pill-remove" title="Remove"><i class="fas fa-times"></i></button>';
        span.querySelector('button').addEventListener('click', pill.clear);
        container.appendChild(span);
    });
}

function updateAlFilterStyles() {
    var state = activityLogState;
    [['alUsernameFilter',state.filterUsername],['alSchoolFilter',state.filterSchool],['alRoleFilter',state.filterRole]].forEach(function(pair){
        var el=document.getElementById(pair[0]); if(!el) return;
        pair[1]?el.classList.add('al-filter-active'):el.classList.remove('al-filter-active');
    });
}

function showActivityLogState(state, message) {
    ['alLoading','alError','alEmpty','alTableWrap'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});
    var statsRow=document.getElementById('alStatsRow'), pag=document.getElementById('alPagination');
    if (statsRow) statsRow.style.display=(state==='table'||state==='empty')?'flex':'none';
    if (pag) pag.style.display='none';
    var map={loading:'alLoading',error:'alError',empty:'alEmpty',table:'alTableWrap'};
    var target=document.getElementById(map[state]);
    if (target) target.style.display=(state==='table')?'block':'flex';
    if (state==='error'){var msg=document.getElementById('alErrorMsg');if(msg)msg.textContent=message||'Failed to load activity logs.';}
}

function onActivityLogFilter() {
    var state=activityLogState;
    state.searchQuery    = document.getElementById('alSearchInput')?.value    || '';
    state.filterUsername = document.getElementById('alUsernameFilter')?.value || '';
    state.filterSchool   = document.getElementById('alSchoolFilter')?.value   || '';
    state.filterRole     = document.getElementById('alRoleFilter')?.value     || '';
    alToggleClear(); applyActivityLogFilters();
}
function clearActivityLogSearch() { var input=document.getElementById('alSearchInput'); if(input)input.value=''; activityLogState.searchQuery=''; alToggleClear(); applyActivityLogFilters(); }
function clearAllActivityLogFilters() {
    activityLogState.searchQuery=activityLogState.filterUsername=activityLogState.filterSchool=activityLogState.filterRole='';
    var input=document.getElementById('alSearchInput'); if(input)input.value='';
    ['alUsernameFilter','alSchoolFilter','alRoleFilter'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
    alToggleClear(); applyActivityLogFilters();
}
function alToggleClear() { var val=(document.getElementById('alSearchInput')?.value||'').trim(); var btn=document.getElementById('alSearchClear'); if(btn)btn.style.display=val.length>0?'':'none'; }
function toggleActivityLogSort() { activityLogState.sortAsc=!activityLogState.sortAsc; var icon=document.getElementById('alSortIcon'); if(icon)icon.innerHTML=activityLogState.sortAsc?'<i class="fas fa-sort-up"></i>':'<i class="fas fa-sort-down"></i>'; applyActivityLogFilters(); }
function onActivityLogPerPageChange() { var sel=document.getElementById('alPerPage'); if(sel)activityLogState.perPage=parseInt(sel.value,10)||10; activityLogState.currentPage=1; renderActivityLogPage(); }
function goToActivityLogPage(page) { var total=Math.ceil(activityLogState.filtered.length/activityLogState.perPage); if(page===null)page=total; activityLogState.currentPage=Math.max(1,Math.min(page,total)); renderActivityLogPage(); document.getElementById('alTableWrap')?.scrollIntoView({behavior:'smooth',block:'nearest'}); }
function prevActivityLogPage() { goToActivityLogPage(activityLogState.currentPage-1); }
function nextActivityLogPage() { goToActivityLogPage(activityLogState.currentPage+1); }

function toggleAlDesc(descId, btn) {
    var el = document.getElementById(descId);
    if (!el) return;
    var expanded = el.classList.toggle('al-expanded');
    if (expanded) {
        el.style.cssText = 'display:block !important; overflow:visible !important; max-height:none !important; white-space:normal !important; word-break:break-word !important; -webkit-line-clamp:unset !important;';
    } else {
        el.style.cssText = '';
    }
    btn.textContent = expanded ? 'Show less' : 'Show more';
}
function spinRefreshBtn(on) { var btn=document.getElementById('alRefreshBtn'); if(!btn)return; btn.classList.toggle('al-spinning',on); btn.disabled=on; }

function alToMs(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'string') return new Date(ts).getTime() || 0;
    if (typeof ts === 'number') return ts;
    return 0;
}
function alFormatTs(ts) {
    var ms=alToMs(ts);
    if (!ms) return {dateStr:'Unknown date',timeStr:''};
    var d=new Date(ms);
    return { dateStr:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), timeStr:d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}) };
}
function alCapFirst(str) { if(!str)return''; return str.charAt(0).toUpperCase()+str.slice(1); }
function alRoleClass(role) {
    var r=(role||'').toLowerCase();
    if(r==='superadmin') return 'al-role-superadmin';
    if(r==='admin')      return 'al-role-admin';
    if(r==='teacher')    return 'al-role-teacher';
    if(r==='student')    return 'al-role-student';
    if(r==='school')     return 'al-role-school';
    return 'al-role-default';
}
function alAvatarColor(username) {
    var colors=['background:linear-gradient(135deg,#1e40af,#3b82f6)','background:linear-gradient(135deg,#0f766e,#14b8a6)','background:linear-gradient(135deg,#b45309,#f59e0b)','background:linear-gradient(135deg,#be185d,#ec4899)','background:linear-gradient(135deg,#064e3b,#34d399)','background:linear-gradient(135deg,#1e3a8a,#60a5fa)','background:linear-gradient(135deg,#78350f,#fbbf24)','background:linear-gradient(135deg,#7e22ce,#a855f7)'];
    var hash=0;
    for(var i=0;i<(username||'').length;i++){hash=(hash<<5)-hash+username.charCodeAt(i);hash|=0;}
    return colors[Math.abs(hash)%colors.length];
}
function alEsc(str) {
    if(!str)return'';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'n': e.preventDefault(); showSection('add-school'); setTimeout(function(){var el=document.getElementById('schoolName');if(el)el.focus();},100); break;
            case 'r': e.preventDefault(); clearForm(); break;
            case 's': e.preventDefault(); saveData(); break;
        }
    }
    if (e.key === 'Escape') {
        var logoutModal = document.getElementById('logoutConfirmModal');
        if (logoutModal && logoutModal.style.display === 'flex') { closeLogoutModal(); return; }
        var activeModal = document.querySelector('.modal[style*="block"]');
        if (activeModal) { activeModal.style.display = 'none'; document.body.style.overflow = 'auto'; }
        ['addCourseModal','editCourseModal'].forEach(function(id){ var m=document.getElementById(id); if(m&&m.style.display==='flex'){m.style.display='none';document.body.style.overflow='auto';} });
    }
});

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) { event.target.style.display = 'none'; document.body.style.overflow = 'auto'; }
    if (event.target.id === 'addCourseModal') closeAddCourseModal();
    if (event.target.id === 'addSchoolModal') closeAddSchoolModal();
    if (event.target.id === 'addAdminModal')  closeAddAdminModal();
    if (event.target.classList.contains('modal-overlay')) {
        if (event.target.closest('#editAdminModal'))  closeEditAdminModal();
        if (event.target.closest('#editSchoolModal')) closeEditSchoolModal();
        if (event.target.closest('#editCourseModal')) closeEditCourseModal();
    }
    if (!event.target.closest('#userDropdown')) {
        var dc = document.getElementById('userDropdownContent');
        if (dc) dc.classList.remove('show');
    }
    if (!event.target.closest('#mobileUserDropdown')) {
        var mdc = document.getElementById('mobileUserDropdownContent');
        if (mdc) mdc.classList.remove('show');
    }
};
// ── Cross-Tab Session Sync ──────────────────────────────────
window.addEventListener('storage', function(event) {
    if (event.key === 'utownUser') {
        console.log('📡 Storage event detected from another tab');
        
        if (event.newValue === null) {
            // User logged out in another tab
            console.log('❌ Logout detected in another tab');
            currentUser = null;
            showToast('You have been logged out in another tab', 'error');
            
            const overlay = document.getElementById('sessionLoadingOverlay');
            if (overlay) overlay.style.display = 'flex';
            
            setTimeout(function() {
                window.location.href = 'index.html?loggedOut=true';
            }, 1500);
        } else {
            // User logged in in another tab or session changed
            try {
                const newUser = JSON.parse(event.newValue);
                console.log('🔄 New session detected:', newUser.username);
                
                // Check if it's a different session
                if (!currentUser || newUser.sessionId !== currentUser.sessionId) {
                    console.log('📝 Session changed. Reloading...');
                    currentUser = newUser;
                    updateUIForLoggedInAdmin();
                    showToast('Your session was updated', 'info');
                    
                    // Reload page to sync all data
                    setTimeout(function() {
                        window.location.reload();
                    }, 1000);
                }
            } catch (e) {
                console.error('Error parsing storage event:', e);
            }
        }
    }
});
// ── Session Debug Panel ──────────────────────────────────────
function showSessionDebugPanel() {
    const panel = document.getElementById('sessionDebugPanel');
    const content = document.getElementById('sessionDebugContent');
    
    if (!panel || !content) return;
    
    const user = getStoredUserSession();
    const debugInfo = `
        <div style="line-height:1.6;">
            <div>User: <span style="color:#fbbf24;">${user ? (user.fname || user.username) : 'NOT LOGGED IN'}</span></div>
            <div>Role: <span style="color:#fbbf24;">${user ? (user.role || 'superadmin') : 'N/A'}</span></div>
            <div>Email: <span style="color:#fbbf24;">${user ? (user.email || 'N/A') : 'N/A'}</span></div>
            <div>Current Time: <span style="color:#fbbf24;">${new Date().toLocaleTimeString()}</span></div>
            <div>Storage: <span style="color:#10b981;">✓ Available</span></div>
        </div>
    `;
    
    content.innerHTML = debugInfo;
    panel.style.display = 'block';
}
// ── Handle Dashboard Ready Event ──────────────────────────
window.addEventListener('dashboardReady', function() {
    console.log('✅ Dashboard ready event received');
    const overlay = document.getElementById('sessionLoadingOverlay');
    if (overlay && overlay.style.display !== 'none') {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(function() {
            overlay.style.display = 'none';
        }, 300);
    }
});
// ── Keyboard Shortcut to Show Debug Panel (Ctrl+Shift+D) ─────
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        showSessionDebugPanel();
    }
});
// ── Check Session When Page Becomes Visible ──────────────────
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Page just became visible (tab was switched back to this page)
        const storedUser = getStoredUserSession();
        if (!storedUser && currentUser) {
            // User was logged out while we weren't looking
            console.log('⚠️ Session lost while page was hidden');
            currentUser = null;
            showToast('Your session has expired', 'error');
            setTimeout(function() {
                window.location.href = 'index.html?action=login';
            }, 1500);
        } else if (storedUser && !currentUser) {
            // Page was hidden, but user is still logged in elsewhere
            console.log('🔄 Session restored from storage');
            currentUser = storedUser;
            updateUIForLoggedInAdmin();
        }
    }
});
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 SuperAdmin Dashboard loading...');
    
    // ✅ Check session FIRST
    checkAdminSession();
    
    // ✅ Wait for session to be verified
    await new Promise(function(resolve) {
        setTimeout(resolve, 500);
    });
    
    // ✅ Verify currentUser is set
    if (!currentUser || !currentUser.username) {
        console.warn('⚠️ Session not verified. Waiting for redirect...');
        return;
    }
    
    console.log('✅ Session verified. Initializing dashboard...');
    
    // Initialize year window and table
    initYearWindowStart();
    updateUnifiedTableHeaders();

    try {
        // Load all data in parallel
        await Promise.all([
            loadAdminAccounts(), 
            loadSchoolAccounts(),
            loadSettingsIntoForm()
        ]);
        
        updateActivityLog();
        updateSchoolCount();
        
        console.log('✅ Dashboard fully loaded');
        
    } catch (err) {
        console.error('❌ Error initializing dashboard:', err);
        showToast('Error loading dashboard. Please refresh the page.', 'error');
    }
});
