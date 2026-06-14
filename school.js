// =============================================
// SCHOOL DASHBOARD — school.js (Supabase REST API)
// =============================================

// ── Supabase Configuration ────────────────────────────────────────────────
const SUPABASE_URL = 'https://bbbaawqqgjzrbadmvpwu.supabase.co/rest/v1';
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
        if (!res.ok) { const err = await res.text(); throw new Error(err); }
        return res.json();
    },
    async insert(table, data) {
        const res = await fetch(`${SUPABASE_URL}/${table}`, {
            method: 'POST',
            headers: SB_HEADERS,
            body: JSON.stringify(data)
        });
        if (!res.ok) { const err = await res.text(); throw new Error(err); }
        return res.json();
    },
    async update(table, match, data) {
        const q = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
        const res = await fetch(`${SUPABASE_URL}/${table}?${q}`, {
            method: 'PATCH',
            headers: SB_HEADERS,
            body: JSON.stringify(data)
        });
        if (!res.ok) { const err = await res.text(); throw new Error(err); }
        return res.json();
    },
    async upsert(table, data) {
        const res = await fetch(`${SUPABASE_URL}/${table}`, {
            method: 'POST',
            headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const err = await res.text(); throw new Error(err); }
        return res.json();
    }
};
// ── Capitalization Helper ────────────────────────────────────────────────────
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
// ── Session / Auth ────────────────────────────────────────────────────────
let schoolSession = null;
let currentSchoolDoc = null;
function checkSchoolSession() {
    // ==========================================
    // STEP 1: Get the stored login data
    // ==========================================
    const raw = localStorage.getItem('schoolLoginData');
    
    // ==========================================
    // STEP 2: Check if there's NO stored data
    // ==========================================
    if (!raw) {
        console.error('❌ No school login data found');
        // Redirect back to login page
        window.location.href = 'index.html';
        return;
    }
    
    // ==========================================
    // STEP 3: Try to parse the JSON data
    // ==========================================
    try {
        schoolSession = JSON.parse(raw);
        currentSchoolDoc = schoolSession.schoolData || null;
        
        // Check if school data exists
        if (!currentSchoolDoc) {
            console.error('❌ No school data in session');
            window.location.href = 'index.html';
            return;
        }
    } catch (e) {
        console.error('❌ Error parsing school session:', e);
        localStorage.removeItem('schoolLoginData');
        window.location.href = 'index.html';
        return;
    }
    
    // ==========================================
    // STEP 4: Extract school information
    // ==========================================
    const schoolDocId = getSchoolDocId();
    const schoolName = currentSchoolDoc.schoolname || 'School';
    const username = currentSchoolDoc.username || 'School User';
    
    console.log('✅ School session loaded:');
    console.log('   School ID:', schoolDocId);
    console.log('   School Name:', schoolName);
    console.log('   Username:', username);
    
    // ==========================================
    // STEP 5: Update the disabled school filter
    // ==========================================
    const schoolFilter = document.getElementById('schoolFilter');
    const schoolFilterOption = document.getElementById('schoolFilterOption');
    
    if (schoolFilter && schoolFilterOption) {
        // Clear all options
        schoolFilter.innerHTML = '';
        
        // Add ONLY the current school (disabled)
        const option = document.createElement('option');
        option.value = schoolDocId;
        option.textContent = schoolName;
        option.selected = true;
        schoolFilter.appendChild(option);
        
        // Make sure the select is disabled
        schoolFilter.disabled = true;
        
        console.log('🔒 School filter locked to:', schoolName);
    }
    
    // Set the global variable so other functions can use it (always a string)
    currentSchool = String(schoolDocId);
    
    // ==========================================
    // STEP 6: Update the navbar greetings
    // ==========================================
    document.querySelectorAll('#userDropdownText, #mobileUserDropdownText').forEach(function(el) {
        el.textContent = 'Hello, ' + username;
    });
    
    // ==========================================
    // STEP 7: Update the sidebar label
    // ==========================================
    const sidebarLabel = document.getElementById('sidebarSchoolName');
    if (sidebarLabel) {
        sidebarLabel.textContent = schoolName;
    }
    
    // ==========================================
    // STEP 8: Update page title
    // ==========================================
    document.title = schoolName + ' Dashboard - UTOWN DATA NAME';
    
    console.log('✅ School session setup complete');
}

function getSchoolDocId() {
    // ==========================================
    // This function gets the school ID from the current session
    // ==========================================
    
    if (!currentSchoolDoc) {
        console.warn('⚠️ No school document loaded');
        return '';
    }
    
    // Try multiple possible ID fields (in order of priority)
    const schoolId = 
        currentSchoolDoc.school_id ||      // Primary: school_id
        currentSchoolDoc.id ||              // Secondary: id
        currentSchoolDoc.docId ||           // Tertiary: docId
        currentSchoolDoc.schoolabbrev ||    // Fallback: abbreviation
        '';
    
    if (!schoolId) {
        console.warn('⚠️ Could not find school ID in session data');
    }
    
    return schoolId;
}

// ── IP / PC helpers ───────────────────────────────────────────────────────
let cachedIP = '';
async function fetchClientIP() {
    if (cachedIP) return cachedIP;
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const json = await res.json();
        cachedIP = json.ip || 'unknown';
    } catch (e) { cachedIP = 'unknown'; }
    return cachedIP;
}

function getPCIdentifier() {
    const ua = navigator.userAgent;
    let osInfo = navigator.platform || 'unknown';
    if (ua.indexOf('Windows NT 10.0') !== -1) osInfo = 'Windows 10/11';
    else if (ua.indexOf('Windows NT 6.3') !== -1) osInfo = 'Windows 8.1';
    else if (ua.indexOf('Windows NT 6.1') !== -1) osInfo = 'Windows 7';
    else if (ua.indexOf('Windows') !== -1) osInfo = 'Windows';
    else if (ua.indexOf('Mac') !== -1) osInfo = 'MacOS';
    else if (ua.indexOf('Linux') !== -1) osInfo = 'Linux';
    else if (ua.indexOf('Android') !== -1) osInfo = 'Android';
    else if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) osInfo = 'iOS';
    return osInfo;
}

// ── Supabase ActivityLog writer ───────────────────────────────────────────
function generateActivityLogId() {
    return 'ActivityID_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

async function saveActivityLog(description, location) {
    try {
        const ip = await fetchClientIP();
        const pc = getPCIdentifier();
        const schoolDoc = currentSchoolDoc || {};
        // BUG FIX 3: Retry loop — if a duplicate-key collision still occurs (e.g. from
        // a concurrent session), increment the ID and retry up to 5 times
        var nextLogId;
        var _logInserted = false;
        for (var _logTry = 0; _logTry < 5 && !_logInserted; _logTry++) {
            try {
                var maxLogRows = await SB.get('ActivityLog', 'select=ActivityLog_ID&order=ActivityLog_ID.desc&limit=1');
                nextLogId = (maxLogRows.length > 0 ? (parseInt(maxLogRows[0].ActivityLog_ID) || 0) : 0) + 1 + _logTry;
            } catch (_e) { nextLogId = Math.floor(Date.now() / 1000) % 2147483647 + _logTry; }
            try {
                await SB.insert('ActivityLog', {
                    ActivityLog_ID: nextLogId,
            ActivityLog_AccountRole: 'school',
            ActivityLog_Description: (schoolDoc.username || 'school') + ' - ' + description,
            ActivityLog_IPAddress: ip,
            ActivityLog_Location: location || 'school.html',
            ActivityLog_DeviceName: pc,
            ActivityLog_created_at: new Date().toISOString()
                });
                _logInserted = true;
            } catch (_insertErr) {
                if (_logTry === 4) console.error('saveActivityLog insert failed after retries:', _insertErr);
            }
        }
    } catch (e) { console.error('saveActivityLog error:', e); }
}

async function logSchoolLogin() {
    const ip = await fetchClientIP();
    const pc = getPCIdentifier();
    const schoolDoc = currentSchoolDoc || {};
    try {
        const description = (schoolDoc.username || 'school') + ' has logged in to school portal | IP: ' + ip + ' | Device: ' + pc;
        var nextLogId2;
        var _loginInserted = false;
        for (var _loginTry = 0; _loginTry < 5 && !_loginInserted; _loginTry++) {
            try {
                var maxLogRows2 = await SB.get('ActivityLog', 'select=ActivityLog_ID&order=ActivityLog_ID.desc&limit=1');
                nextLogId2 = (maxLogRows2.length > 0 ? (parseInt(maxLogRows2[0].ActivityLog_ID) || 0) : 0) + 1 + _loginTry;
            } catch (_e) { nextLogId2 = Math.floor(Date.now() / 1000) % 2147483647 + _loginTry; }
            try {
                await SB.insert('ActivityLog', {
                    ActivityLog_ID: nextLogId2,
            ActivityLog_AccountRole: 'school',
            ActivityLog_Description: description,
            ActivityLog_IPAddress: ip,
            ActivityLog_Location: 'school.html',
            ActivityLog_DeviceName: pc,
            ActivityLog_created_at: new Date().toISOString()
                });
                _loginInserted = true;
            } catch (_loginInsertErr) {
                if (_loginTry === 4) console.error('logSchoolLogin insert failed after retries:', _loginInsertErr);
            }
        }
    } catch (e) { console.error('logSchoolLogin error:', e); }
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
function toggleUserDropdown() { document.getElementById('userDropdownContent').classList.toggle('show'); }
function toggleMobileUserDropdown() { document.getElementById('mobileUserDropdownContent').classList.toggle('show'); }
function handleSignIn() {}

function showSection(sectionId) {
    console.log('📄 Showing section:', sectionId);
    
    document.querySelectorAll('.content-section').forEach(function(s) { s.classList.remove('active'); });
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.sidebar-menu a').forEach(function(a) { a.classList.remove('active'); });
    const clicked = event && event.target ? event.target.closest('a') : null;
    if (clicked) clicked.classList.add('active');

    // Load section-specific data
    switch(sectionId) {
        case 'activity-log':
            if (!activityLogState.initialized && !activityLogState.isLoading) {
                console.log('📋 Initializing activity log');
                initActivityLog();
            }
            break;
        case 'add-course':
            console.log('📚 Loading courses');
            clLoadCoursesFromSupabase();
            break;
        case 'school-profile':
            console.log('👤 Loading school profile');
            loadSchoolProfile();
            break;
        case 'settings':
            console.log('⚙️ Loading settings');
            loadSchoolSettingsForm();
            break;
        case 'school-data':
            console.log('📊 Loading school data');
            // Ensure data is refreshed when returning to dashboard
            if (currentEducationalLevel !== 'all') {
                setupDataAnalyticsFetch();
            }
            break;
        case 'dashboard':
            console.log('🏠 Loading dashboard overview');
            updateDashboardStats();
            break;
    }
}

// ── Dashboard Stats (for the new Dashboard section) ───────────────────────
function updateDashboardStats() {
    // Total Courses — count courses loaded for this school
    const totalCourses = clAllCourses.length || courseList.length || 0;
    const dashCourses = document.getElementById('dashTotalCourses');
    if (dashCourses) dashCourses.textContent = totalCourses.toLocaleString();

    // Total Enrollees — sum all categories from schoolsData
    let grandTotal = 0;
    const schoolKey = currentSchool || 'all';
    if (schoolsData[schoolKey]) {
        ['outside','inside','graduates','passers'].forEach(function(cat) {
            if (!schoolsData[schoolKey][cat]) return;
            Object.keys(schoolsData[schoolKey][cat]).forEach(function(course) {
                (schoolsData[schoolKey][cat][course] || []).forEach(function(gd) {
                    if (gd && typeof gd === 'object') grandTotal += (gd.male || 0) + (gd.female || 0);
                });
            });
        });
    }
    const dashEnrollees = document.getElementById('dashTotalEnrollees');
    if (dashEnrollees) dashEnrollees.textContent = grandTotal.toLocaleString();

    // Teaching Staff and Non-Teaching Staff — from currentSchoolDoc
    const schoolDoc = currentSchoolDoc || {};
    const teaching    = parseInt(schoolDoc.teachingstaff)    || parseInt(schoolDoc.TeachingStaff)    || 0;
    const nonTeaching = parseInt(schoolDoc.nonteachingstaff) || parseInt(schoolDoc.NonTeachingStaff) || 0;

    const dashTeach = document.getElementById('dashTeachingStaff');
    if (dashTeach) dashTeach.textContent = teaching.toLocaleString();

    const dashNon = document.getElementById('dashNonTeachingStaff');
    if (dashNon) dashNon.textContent = nonTeaching.toLocaleString();

    // Welcome message
    const schoolName = (currentSchoolDoc && currentSchoolDoc.schoolname) ? currentSchoolDoc.schoolname : 'your school';
    const dashMsg = document.getElementById('dashWelcomeMsg');
    if (dashMsg) dashMsg.textContent = 'Welcome to ' + schoolName + '\'s Dashboard. View and manage your school\'s data from this panel.';
}

// ── Logout Modal ──────────────────────────────────────────────────────────
function handleLogout() { openLogoutModal(); }
function openLogoutModal() {
    document.getElementById('logoutConfirmModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeLogoutModal() {
    document.getElementById('logoutConfirmModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}
async function confirmLogout() {
    closeLogoutModal();

    // Show logout loading animation
    var logoutOverlay = document.getElementById('logoutLoadingOverlay');
    if (logoutOverlay) {
        logoutOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    const schoolDoc = currentSchoolDoc || {};
    await saveActivityLog(schoolDoc.username + ' has logged out of school portal', 'school.html');
    localStorage.removeItem('schoolLoginData');
    window.location.href = 'index.html';
}

function openAboutModal() { document.getElementById('aboutModal').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function openContactModal() { document.getElementById('contactModal').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; document.body.style.overflow = 'auto'; }

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(message, type) {
    type = type || 'success';
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : 'fa-exclamation-circle';
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<i class="fas ' + icon + '"></i> ' + message;
    container.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 3500);
}

// ── Button loading helper ─────────────────────────────────────────────────
function setBtnLoading(btn, loadingText) {
    if (!btn) return function() {};
    const original = btn.innerHTML;
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.dataset._loading = '1';
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (loadingText || 'Saving...');
    return function restore(opts) {
        opts = opts || {};
        if (opts.successText) {
            btn.innerHTML = '<i class="fas fa-check"></i> ' + opts.successText;
            setTimeout(function() {
                btn.innerHTML = original;
                btn.disabled = wasDisabled;
                delete btn.dataset._loading;
            }, opts.holdMs || 900);
        } else {
            btn.innerHTML = original;
            btn.disabled = wasDisabled;
            delete btn.dataset._loading;
        }
    };
}

// ── State Variables ───────────────────────────────────────────────────────
let schoolsData = {
    all: { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} }
};
let academicYears = ['2020-2021','2021-2022','2022-2023','2023-2024','2024-2025'];
const YEAR_WINDOW_SIZE = 10;
let yearWindowStart = 2020;
let currentFilter = 'enrollees';
let currentSchool = 'all';
let currentEducationalLevel = 'all';
let courseList = [];
let allSchoolDocs = [];
let friendlyIdCounter = 0;

// Caches to reduce Supabase calls
let _courseLoadCache = {};
let _summaryLoadCache = {};
let _clCoursesLoaded = false;
let _clLoadingPromise = null;
let _dataListenerKey = '';
let _dataPollingTimer = null;

// Track cells modified since last save so zero-value edits are always written back
let _pendingChanges = new Set();

// Course-list cache
let clAllCourses = [];
let clFiltered = [];
let clPage = 1;
const clPageSize = 10;

function getCurrentAcademicYear() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return m >= 7 ? (y + '-' + (y + 1)) : ((y - 1) + '-' + y);
}
function getVisibleYears() {
    const years = [];
    for (let i = 0; i < YEAR_WINDOW_SIZE; i++) {
        years.push((yearWindowStart + i) + '-' + (yearWindowStart + i + 1));
    }
    return years;
}
function initYearWindowStart() {
    const realYear = new Date().getFullYear();
    yearWindowStart = Math.floor(realYear / 10) * 10;
}
function yearNavPrev() { yearWindowStart -= YEAR_WINDOW_SIZE; renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); }
function yearNavNext() { yearWindowStart += YEAR_WINDOW_SIZE; renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); }
function renderYearNavigator() {}

function syncVisibleYearsToAcademicYears() {
    getVisibleYears().forEach(function(year) {
        if (academicYears.indexOf(year) === -1) {
            academicYears.push(year);
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

/*function filterBySchool() {
    // ==========================================
    // DISABLED: School filtering is locked
    // ==========================================
    // Users cannot change school - they can only view their own school's data
    console.log('🔒 School filter is locked - cannot change school');
    return;
}*/
// ── Session Loading Overlay ───────────────────────────────────────────────
function hideSessionLoadingOverlay() {
    const overlay = document.getElementById('sessionLoadingOverlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(function() { overlay.style.display = 'none'; }, 320);
}

// ── Loading Animation Helpers ─────────────────────────────────────────────
function showDashboardLoading() {
    var overlay = document.getElementById('dashboardLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}
function hideDashboardLoading() {
    var overlay = document.getElementById('dashboardLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

var _statIds = ['totalEnrollees', 'totalOutside', 'totalInside', 'totalGraduates', 'totalPassers'];

function showStatLoading() {
    var spinner = '<span class="summary-stat-spinner"></span>';
    _statIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = spinner;
    });
    document.querySelectorAll('.summary-card').forEach(function(card) { card.classList.add('stat-loading'); });
}

function clearStatLoading() {
    document.querySelectorAll('.summary-card').forEach(function(card) { card.classList.remove('stat-loading'); });
}

function zeroOutSummaryStats() {
    _statIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
    clearStatLoading();
}

async function loadSummaryStatsFromFirestore() {
    if (currentEducationalLevel === 'all' || !currentEducationalLevel) {
        zeroOutSummaryStats();
        return;
    }
    if (!currentSchool || currentSchool === 'all') {
        zeroOutSummaryStats();
        return;
    }

    var eduMap = { bachelor: "BACHELOR'S DEGREE", twoyear: '2-YEAR COURSE', tesda: 'TESDA', graduate: 'GRADUATE COURSE' };
    var targetEdu = eduMap[currentEducationalLevel];
    if (!targetEdu) { zeroOutSummaryStats(); return; }

    var categorySupabaseMap = {
        outside:   'OutsideBataan',
        inside:    'InsideBataan',
        graduates: 'Graduates',
        passers:   'NumberofBoardPasser'
    };

    showStatLoading();
    try {
        var queries = Object.keys(categorySupabaseMap).map(function(catKey) {
            var qs = 'DA_SchoolID=eq.' + encodeURIComponent(currentSchool) +
                     '&DA_EducationalAttainment=eq.' + encodeURIComponent(targetEdu) +
                     '&DA_Category=eq.' + encodeURIComponent(categorySupabaseMap[catKey]);
            return SB.get('Data_Analytics', qs).then(function(rows) {
                var total = 0;
                rows.forEach(function(r) { total += (parseInt(r.DA_Male, 10) || 0) + (parseInt(r.DA_Female, 10) || 0); });
                return { catKey: catKey, total: total };
            });
        });

        var results = await Promise.all(queries);
        var totals = { outside: 0, inside: 0, graduates: 0, passers: 0 };
        results.forEach(function(r) { totals[r.catKey] = r.total; });
        var enrolleesTotal = totals.outside + totals.inside + totals.graduates + totals.passers;

        document.getElementById('totalEnrollees').textContent = enrolleesTotal.toLocaleString();
        document.getElementById('totalOutside').textContent   = totals.outside.toLocaleString();
        document.getElementById('totalInside').textContent    = totals.inside.toLocaleString();
        document.getElementById('totalGraduates').textContent = totals.graduates.toLocaleString();
        document.getElementById('totalPassers').textContent   = totals.passers.toLocaleString();
    } catch (err) {
        console.error('loadSummaryStatsFromFirestore error:', err);
        zeroOutSummaryStats();
        showToast('Error loading summary stats: ' + err.message, 'error');
    } finally {
        clearStatLoading();
    }
}

function updateSummary() {
    if (currentEducationalLevel === 'all') {
        zeroOutSummaryStats();
        return;
    }

    function sumCategory(catKey) {
        var schoolKey = currentSchool || 'all';
        if (!schoolsData[schoolKey] || !schoolsData[schoolKey][catKey]) return 0;
        var catData = schoolsData[schoolKey][catKey];
        var total = 0;
        Object.keys(catData).forEach(function(course) {
            if (catData[course]) {
                catData[course].forEach(function(genderData) {
                    if (genderData && typeof genderData === 'object') {
                        total += (parseInt(genderData.male, 10) || 0) + (parseInt(genderData.female, 10) || 0);
                    } else {
                        total += (parseInt(genderData, 10) || 0);
                    }
                });
            }
        });
        return total;
    }

    var outsideTotal   = sumCategory('outside');
    var insideTotal    = sumCategory('inside');
    var graduatesTotal = sumCategory('graduates');
    var passersTotal   = sumCategory('passers');
    var enrolleesTotal = (outsideTotal|0) + (insideTotal|0) + (graduatesTotal|0) + (passersTotal|0);

    document.getElementById('totalEnrollees').textContent = enrolleesTotal.toLocaleString();
    document.getElementById('totalOutside').textContent   = outsideTotal.toLocaleString();
    document.getElementById('totalInside').textContent    = insideTotal.toLocaleString();
    document.getElementById('totalGraduates').textContent = graduatesTotal.toLocaleString();
    document.getElementById('totalPassers').textContent   = passersTotal.toLocaleString();
}
async function filterByEducationalAttainment() {
    const educationalFilter = document.getElementById('educationalFilter');
    currentEducationalLevel = educationalFilter.value;

    const sectionTitle = document.querySelector('#school-data .section-title');
    const schoolName = currentSchoolDoc ? (currentSchoolDoc.schoolname || 'School') : 'School';
    const eduName = educationalFilter.options[educationalFilter.selectedIndex].text;
    
    // ==========================================
    // Update section title to show current filters
    // ==========================================
    if (sectionTitle) {
        if (currentEducationalLevel === 'all') {
            sectionTitle.innerHTML = '<i class="fas fa-chart-bar"></i> ' + schoolName + ' - Select Courses';
        } else {
            sectionTitle.innerHTML = '<i class="fas fa-chart-bar"></i> ' + schoolName + ' | ' + eduName;
        }
    }

    const cacheKey = currentSchool + '_' + currentEducationalLevel;
    _summaryLoadCache[cacheKey] = false;
    _courseLoadCache[cacheKey] = false;
    _dataListenerKey = '';

    // ==========================================
    // Only load data if specific attainment selected
    // ==========================================
    if (currentEducationalLevel !== 'all') {
        await loadCoursesFromSupabase();
        await setupDataAnalyticsFetch();
        loadSummaryStatsFromFirestore();
        
        // Log the action
        await saveActivityLog(
            (currentSchoolDoc ? currentSchoolDoc.username : 'school') + 
            ' filtered data by courses: ' + eduName, 
            'school.html'
        );
    } else {
        // Reset if "N/A" selected
        zeroOutSummaryStats();
        updateUnifiedTable();
        courseList = [];
    }
}

// ── filterByCategory ──────────────────────────────────────────────────────
function filterByCategory() {
    const categoryFilter = document.getElementById('categoryFilter');
    currentFilter = categoryFilter.value;
    updateUnifiedTable();
    updateSummary();
}
async function setupDataAnalyticsFetch() {
    // Don't fetch if school is invalid or educational level is not selected
    if (!currentSchool || currentSchool === 'all' || !currentEducationalLevel || currentEducationalLevel === 'all') {
        zeroOutSummaryStats();
        updateUnifiedTable();
        return;
    }

    const newKey = currentSchool + '|' + currentEducationalLevel + '|' + currentFilter;
    if (_dataListenerKey === newKey) {
        updateUnifiedTable();
        return;
    }
    _dataListenerKey = newKey;

    showStatLoading();
    try {
        let qs = 'DA_SchoolID=eq.' + encodeURIComponent(currentSchool);
        
        // IMPORTANT: Only add educational attainment filter if not 'all'
        const eduMap = { bachelor: "BACHELOR'S DEGREE", twoyear: '2-YEAR COURSE', tesda: 'TESDA', graduate: 'GRADUATE COURSE' };
        const targetEdu = eduMap[currentEducationalLevel];
        if (targetEdu) {
            qs += '&DA_EducationalAttainment=eq.' + encodeURIComponent(targetEdu);
        }
        
        // IMPORTANT: Only add category filter if not 'enrollees'
        const categorySupabaseMap = {
            outside:   'OutsideBataan',
            inside:    'InsideBataan',
            graduates: 'Graduates',
            passers:   'NumberofBoardPasser'
        };
        if (currentFilter !== 'enrollees' && categorySupabaseMap[currentFilter]) {
            qs += '&DA_Category=eq.' + encodeURIComponent(categorySupabaseMap[currentFilter]);
        }
        
        const rows = await SB.get('Data_Analytics', qs);
        updateTableFromSupabaseRows(rows);
    } catch (e) {
        console.error('setupDataAnalyticsFetch error:', e);
        showToast('Error loading data: ' + e.message, 'error');
    } finally {
        clearStatLoading();
    }
}

// Legacy alias used by other functions
const setupDataAnalyticsListener = setupDataAnalyticsFetch;

function updateTableFromSupabaseRows(rows) {
    const targetKey = String(currentSchool || 'all');
    
    console.log('🔄 Updating table from', rows.length, 'rows, school key:', targetKey);

    if (!schoolsData[targetKey]) {
        console.log('📦 Initializing data structure for school:', targetKey);
        schoolsData[targetKey] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
    }

    var categoryBack = {
        'OutsideBataan':       'outside',
        'InsideBataan':        'inside',
        'Graduates':           'graduates',
        'NumberofBoardPasser': 'passers'
    };
    var allCats = ['enrollees', 'outside', 'inside', 'graduates', 'passers'];

    allCats.forEach(function(cat) {
        if (!schoolsData[targetKey][cat]) schoolsData[targetKey][cat] = {};
        Object.keys(schoolsData[targetKey][cat]).forEach(function(course) {
            schoolsData[targetKey][cat][course] = new Array(academicYears.length).fill(0).map(function() { return { male: 0, female: 0 }; });
        });
    });

    rows.forEach(function(row) {
        var courseName = row.DA_Course;
        var year       = row.DA_Year;
        var male       = parseInt(row.DA_Male,   10) || 0;
        var female     = parseInt(row.DA_Female, 10) || 0;
        var catKey     = categoryBack[row.DA_Category];
        if (!catKey) return;

        var yearIndex = academicYears.indexOf(year);
        if (yearIndex === -1) {
            academicYears.push(year);
            yearIndex = academicYears.length - 1;
            Object.keys(schoolsData).forEach(function(sk) {
                Object.keys(schoolsData[sk]).forEach(function(ct) {
                    Object.keys(schoolsData[sk][ct]).forEach(function(cn) {
                        schoolsData[sk][ct][cn].push({ male: 0, female: 0 });
                    });
                });
            });
        }

        if (!schoolsData[targetKey][catKey][courseName]) {
            schoolsData[targetKey][catKey][courseName] = new Array(academicYears.length).fill(0).map(function() { return { male: 0, female: 0 }; });
        }
        schoolsData[targetKey][catKey][courseName][yearIndex] = { male: male, female: female };
    });

    var _eduMap = { bachelor: "BACHELOR'S DEGREE", twoyear: '2-YEAR COURSE', tesda: 'TESDA', graduate: 'GRADUATE COURSE' };
    var _targetEduLabel = _eduMap[currentEducationalLevel];

    courseList.forEach(function(c) {
        var matchSchool = String(c.school) === String(targetKey);
        var matchEdu = !_targetEduLabel || c.eduLevel === _targetEduLabel;
        if (matchSchool && matchEdu) {
            allCats.forEach(function(cat) {
                if (!schoolsData[targetKey][cat][c.name]) {
                    schoolsData[targetKey][cat][c.name] = new Array(academicYears.length).fill(0).map(function() { return { male: 0, female: 0 }; });
                }
            });
        }
    });

    allCats.forEach(function(cat) {
        var sortedCourses = Object.keys(schoolsData[targetKey][cat]).sort();
        var sortedData = {};
        sortedCourses.forEach(function(course) { sortedData[course] = schoolsData[targetKey][cat][course]; });
        schoolsData[targetKey][cat] = sortedData;
    });

    updateUnifiedTable();
    updateSummary();
}

// ── updateUnifiedTableHeaders ─────────────────────────────────────────────
function updateUnifiedTableHeaders() {
    const mainHeaderRow = document.getElementById('mainHeaderRow');
    const subHeaderRow = document.getElementById('subHeaderRow');
    mainHeaderRow.querySelectorAll('th:not(:first-child)').forEach(function(h) { h.remove(); });
    subHeaderRow.querySelectorAll('th').forEach(function(h) { h.remove(); });
    getVisibleYears().forEach(function(year) {
        const yearHeader = document.createElement('th');
        yearHeader.className = 'year-header' + (year === getCurrentAcademicYear() ? ' year-header-current' : '');
        yearHeader.colSpan = 3;
        yearHeader.textContent = year;
        mainHeaderRow.appendChild(yearHeader);
        const f = document.createElement('th'); f.className = 'gender-subheader female-header'; f.textContent = 'FEMALE'; subHeaderRow.appendChild(f);
        const m = document.createElement('th'); m.className = 'gender-subheader male-header'; m.textContent = 'MALE'; subHeaderRow.appendChild(m);
        const t = document.createElement('th'); t.className = 'gender-subheader total-header'; t.textContent = 'TOTAL'; subHeaderRow.appendChild(t);
    });
}

// ── updateUnifiedTable ────────────────────────────────────────────────────
function updateUnifiedTable() {
    const tableBody = document.getElementById('unifiedTableBody');

    if (!schoolsData[currentSchool]) {
        schoolsData[currentSchool] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
    }
    if (!schoolsData[currentSchool][currentFilter]) {
        schoolsData[currentSchool][currentFilter] = {};
    }

    tableBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    var coursesToShow;

    if (currentEducationalLevel === 'all') {
        coursesToShow = [];
    } else {
        var eduMap = { bachelor: "BACHELOR'S DEGREE", twoyear: '2-YEAR COURSE', tesda: 'TESDA', graduate: 'GRADUATE COURSE' };
        var targetEduLabel = eduMap[currentEducationalLevel];

        var filtered = courseList.filter(function(c) {
            var matchSchool = String(c.school) === String(currentSchool);
            var matchEdu = !targetEduLabel || c.eduLevel === targetEduLabel;
            return matchSchool && matchEdu;
        });

        coursesToShow = filtered.map(function(c) { return c.name; });
        coursesToShow = coursesToShow.filter(function(v, i, a) { return a.indexOf(v) === i; });

        coursesToShow.forEach(function(name) {
            ['enrollees', 'outside', 'inside', 'graduates', 'passers'].forEach(function(cat) {
                if (!schoolsData[currentSchool][cat]) schoolsData[currentSchool][cat] = {};
                if (!schoolsData[currentSchool][cat][name]) {
                    schoolsData[currentSchool][cat][name] = new Array(academicYears.length).fill(0).map(function() { return { male: 0, female: 0 }; });
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

        var rowHTML = '<td><input type="checkbox" class="course-checkbox" data-course="' + alEsc(course) + '"><span class="course-name">' + alEsc(course) + '</span></td>';

        getVisibleYears().forEach(function(yr) {
            if (academicYears.indexOf(yr) === -1) {
                academicYears.push(yr);
                Object.keys(schoolsData).forEach(function(sk) {
                    Object.keys(schoolsData[sk]).forEach(function(ct) {
                        Object.keys(schoolsData[sk][ct]).forEach(function(cn) {
                            schoolsData[sk][ct][cn].push({ male: 0, female: 0 });
                        });
                    });
                });
            }
        });

        getVisibleYears().forEach(function(year) {
            var realYearIndex = academicYears.indexOf(year);
            var femaleValue, maleValue, totalValue;
            if (currentFilter === 'enrollees') {
                var cats = ['outside', 'inside', 'graduates', 'passers'];
                femaleValue = 0; maleValue = 0;
                cats.forEach(function(cat) {
                    var catData = (schoolsData[currentSchool] && schoolsData[currentSchool][cat] && schoolsData[currentSchool][cat][course]) || [];
                    var gd = catData[realYearIndex];
                    if (gd && typeof gd === 'object') { femaleValue += (gd.female || 0); maleValue += (gd.male || 0); }
                });
                totalValue = femaleValue + maleValue;
            } else {
                var genderData = courseData[realYearIndex];
                femaleValue = (genderData && typeof genderData === 'object') ? (genderData.female || 0) : 0;
                maleValue   = (genderData && typeof genderData === 'object') ? (genderData.male   || 0) : 0;
                totalValue  = femaleValue + maleValue;
            }
            var safeCourse = course.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            rowHTML +=
                '<td class="gender-data-cell female"><input type="number" class="editable-input" value="' + femaleValue + '" onchange="updateGenderData(\'' + safeCourse + '\', ' + realYearIndex + ', \'female\', this.value)" min="0"></td>' +
                '<td class="gender-data-cell male"><input type="number" class="editable-input" value="' + maleValue + '" onchange="updateGenderData(\'' + safeCourse + '\', ' + realYearIndex + ', \'male\', this.value)" min="0"></td>' +
                '<td class="gender-data-cell total">' + totalValue + '</td>';
        });

        row.innerHTML = rowHTML;
        fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);
}

// ── updateGenderData ──────────────────────────────────────────────────────
function updateGenderData(course, yearIndex, gender, value) {
    const newValue = parseInt(value) || 0;
    if (!schoolsData[currentSchool]) schoolsData[currentSchool] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
    if (!schoolsData[currentSchool][currentFilter][course]) {
        schoolsData[currentSchool][currentFilter][course] = new Array(academicYears.length).fill(0).map(function() { return {male:0, female:0}; });
    }
    if (!schoolsData[currentSchool][currentFilter][course][yearIndex]) {
        schoolsData[currentSchool][currentFilter][course][yearIndex] = {male:0, female:0};
    }
    schoolsData[currentSchool][currentFilter][course][yearIndex][gender] = newValue;

    // Track this cell as modified so zero values are also written back on save
    _pendingChanges.add(currentSchool + '|' + currentFilter + '|' + course + '|' + yearIndex);

    const row = event.target.closest('tr');
    const cellIndex = Array.from(row.cells).indexOf(event.target.closest('td'));
    const yearGroupIndex = Math.floor((cellIndex - 1) / 3);
    const totalCellIndex = yearGroupIndex * 3 + 3;
    if (row.cells[totalCellIndex]) {
        const femaleV = parseInt(row.cells[totalCellIndex - 2].querySelector('input').value) || 0;
        const maleV   = parseInt(row.cells[totalCellIndex - 1].querySelector('input').value) || 0;
        row.cells[totalCellIndex].textContent = maleV + femaleV;
    }

    updateSummary();

    row.classList.add('highlight');
    setTimeout(function() { row.classList.remove('highlight'); }, 1000);

    var schoolLabel = (currentSchoolDoc && currentSchoolDoc.schoolname) ? currentSchoolDoc.schoolname : getSchoolAbbreviation(currentSchool);
    const yearLabel = academicYears[yearIndex] || ('Year index ' + yearIndex);
    saveActivityLog(
        (currentSchoolDoc ? currentSchoolDoc.username : 'school') +
        ' edited cell | School: ' + schoolLabel +
        ' | Course: ' + course +
        ' | Year: ' + yearLabel +
        ' | ' + gender.charAt(0).toUpperCase() + gender.slice(1) + ': ' + newValue,
        'school.html'
    );
}

// ── Year management ───────────────────────────────────────────────────────
function addNewYear() {
    const newYearInput = document.getElementById('newYearInput');
    const newYear = newYearInput.value.trim();
    if (!newYear) { showToast('Please enter a year.', 'error'); return; }
    if (academicYears.includes(newYear)) { showToast('This year already exists.', 'error'); return; }
    academicYears.push(newYear);
    Object.keys(schoolsData).forEach(function(school) {
        Object.keys(schoolsData[school]).forEach(function(cat) {
            Object.keys(schoolsData[school][cat]).forEach(function(course) {
                schoolsData[school][cat][course].push({male:0,female:0});
            });
        });
    });
    initYearWindowStart(); renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); updateSummary();
    updateYearsList(); newYearInput.value = '';
    showToast('Year ' + newYear + ' added successfully!', 'success');
}

function deleteYear(yearIndex) {
    if (academicYears.length <= 1) { showToast('Cannot delete the last remaining year.', 'error'); return; }
    const yearToDelete = academicYears[yearIndex];
    if (confirm('Delete year ' + yearToDelete + '? All data for this year will be removed.')) {
        academicYears.splice(yearIndex, 1);
        Object.keys(schoolsData).forEach(function(school) {
            Object.keys(schoolsData[school]).forEach(function(cat) {
                Object.keys(schoolsData[school][cat]).forEach(function(course) {
                    schoolsData[school][cat][course].splice(yearIndex, 1);
                });
            });
        });
        initYearWindowStart(); renderYearNavigator(); updateUnifiedTableHeaders(); updateUnifiedTable(); updateSummary(); updateYearsList();
        showToast('Year ' + yearToDelete + ' deleted.', 'success');
    }
}

function updateYearsList() {
    const yearsList = document.getElementById('yearsList');
    if (!yearsList) return;
    yearsList.innerHTML = '';
    academicYears.forEach(function(year, index) {
        const item = document.createElement('div');
        item.className = 'year-item';
        item.innerHTML = '<span class="year-name">' + year + '</span><button class="delete-year-btn" onclick="deleteYear(' + index + ')"><i class="fas fa-trash"></i></button>';
        yearsList.appendChild(item);
    });
}

function showYearManagement() {
    const sec = document.getElementById('yearManagementSection');
    if (!sec) return;
    const vis = sec.style.display !== 'none';
    sec.style.display = vis ? 'none' : 'block';
    if (!vis) updateYearsList();
}

function toggleSelectAllCourses() {
    const selectAll = document.getElementById('selectAllCourses');
    document.querySelectorAll('.course-checkbox').forEach(function(cb) { cb.checked = selectAll.checked; });
}

function deleteSelectedCourses() {
    const checkboxes = document.querySelectorAll('.course-checkbox:checked');
    if (checkboxes.length === 0) { showToast('Please select courses to delete.', 'error'); return; }
    if (confirm('Delete ' + checkboxes.length + ' selected course(s)?')) {
        checkboxes.forEach(function(cb) {
            const course = cb.dataset.course;
            Object.keys(schoolsData[currentSchool]).forEach(function(cat) { delete schoolsData[currentSchool][cat][course]; });
        });
        updateUnifiedTable(); updateSummary();
        document.getElementById('selectAllCourses').checked = false;
    }
}

// ── refreshTableData ──────────────────────────────────────────────────────
function refreshTableData() {
    const cacheKey = currentSchool + '_' + currentEducationalLevel;
    _summaryLoadCache[cacheKey] = false;
    _dataListenerKey = '';
    setupDataAnalyticsFetch();
    loadSummaryStatsFromFirestore();
    saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' refreshed the data table.', 'school.html');
}

// ── Save Data ─────────────────────────────────────────────────────────────
function saveData(event) {
    const saveBtn = event ? event.target : document.querySelector('.btn-primary');
    const originalText = saveBtn ? saveBtn.innerHTML : '';

    if (currentEducationalLevel === 'all') {
        showToast('Please select a specific Courses before saving.', 'error');
        return;
    }
    if (currentFilter === 'enrollees' && document.getElementById('categoryFilter').value === 'enrollees') {
        showToast('Please choose a category before saving.', 'error');
        return;
    }

    if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; saveBtn.disabled = true; }
    saveAllDataToSupabase().then(function() {
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        showToast('All data saved successfully!', 'success');
        saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' saved school data.', 'school.html');
        // BUG FIX 1: Refresh summary statistics automatically after a successful save
        loadSummaryStatsFromFirestore();
        setTimeout(function() { if (saveBtn) { saveBtn.innerHTML = originalText; saveBtn.disabled = false; } }, 2000);
    }).catch(function(err) {
        console.error('saveData error:', err);
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error!';
        showToast('Error saving data to database', 'error');
        setTimeout(function() { if (saveBtn) { saveBtn.innerHTML = originalText; saveBtn.disabled = false; } }, 2000);
    });
}

async function saveAllDataToSupabase() {
    const catVal = document.getElementById('categoryFilter').value;
    if (catVal === 'enrollees') throw new Error('Please choose a category before saving.');
    if (currentEducationalLevel === 'all') throw new Error('Please select a Courses before saving.');
    const data = schoolsData[currentSchool] && schoolsData[currentSchool][currentFilter] ? schoolsData[currentSchool][currentFilter] : {};
    const categoryMap = { enrollees:'N/A', outside:'OutsideBataan', inside:'InsideBataan', graduates:'Graduates', passers:'NumberofBoardPasser' };
    const eduMap = { bachelor:"BACHELOR'S DEGREE", twoyear:'2-YEAR COURSE', tesda:'TESDA', graduate:'GRADUATE COURSE' };
    const category = categoryMap[catVal] || 'N/A';
    const educationalAttainment = eduMap[currentEducationalLevel] || 'N/A';
    // BUG FIX 2: Run saves sequentially (not parallel with Promise.all).
    // Parallel execution caused a race condition: multiple concurrent inserts all
    // fetched the same max ID and tried to insert with the same value, causing
    // "duplicate key" errors. Sequential execution guarantees each insert completes
    // (and each max+1 calculation is fresh) before the next one starts.
    var failures = 0;
    var courseNames = Object.keys(data);
    for (var _ci = 0; _ci < courseNames.length; _ci++) {
        var courseName = courseNames[_ci];
        var courseData = data[courseName];
        for (var _yi = 0; _yi < courseData.length; _yi++) {
            var genderData = courseData[_yi];
            var year = academicYears[_yi];
            if (!year) continue;
            var male   = (genderData && typeof genderData === 'object') ? (genderData.male   || 0) : 0;
            var female = (genderData && typeof genderData === 'object') ? (genderData.female || 0) : 0;
            var changeKey = currentSchool + '|' + currentFilter + '|' + courseName + '|' + _yi;
            var wasModified = _pendingChanges.has(changeKey);
            if (wasModified || male > 0 || female > 0) {
                var result = await saveToDataAnalytics(currentSchool, year, courseName, category, male, female, educationalAttainment);
                if (result === false) failures++;
            }
        }
    }
    _pendingChanges.clear();
    if (failures > 0) throw new Error(failures + ' record(s) failed to save. Check console for details.');
}

// ── Supabase Data_Analytics upsert ────────────────────────────────────────
function getSchoolAbbreviation(schoolId) {
    const s = allSchoolDocs.find(function(s) { return s.docId === schoolId || s.school_id === schoolId; });
    if (s) return s.schoolabbrev;
    if (currentSchoolDoc && currentSchoolDoc.schoolabbrev) return currentSchoolDoc.schoolabbrev;
    return 'UNKNOWN';
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
        var _actor = currentSchoolDoc ? currentSchoolDoc.username : 'school';
        var _schoolLabel = (currentSchoolDoc && currentSchoolDoc.schoolname) ? currentSchoolDoc.schoolname : getSchoolAbbreviation(schoolId);
        var _logBase = ' | School: ' + _schoolLabel + ' | Course: ' + courseName + ' | Year: ' + year + ' | Male: ' + male + ' | Female: ' + female + ' | Category: ' + category;
        if (existing.length > 0) {
            // Row exists — always UPDATE (including to zero)
            await SB.update('Data_Analytics', { DA_ID: existing[0].DA_ID }, {
                DA_Male: male,
                DA_Female: female,
                DA_Timestamp: new Date().toISOString()
            });
            saveActivityLog(_actor + ' updated record' + _logBase, 'school.html');
        } else {
            // No existing row — skip insert if both values are zero
            if (male === 0 && female === 0) return true;
            // BUG FIX 5: Retry loop — with sequential saves the race condition is gone,
            // but a retry guard handles any residual sequence-drift collisions gracefully
            var _daInserted = false;
            for (var _daTry = 0; _daTry < 5 && !_daInserted; _daTry++) {
                var nextId;
                try {
                    var maxRows = await SB.get('Data_Analytics', 'select=DA_ID&order=DA_ID.desc&limit=1');
                    nextId = (maxRows.length > 0 ? (parseInt(maxRows[0].DA_ID) || 0) : 0) + 1 + _daTry;
                } catch (_e) { nextId = Math.floor(Date.now() / 1000) % 2147483647 + _daTry; }
                try {
                    await SB.insert('Data_Analytics', {
                        DA_ID: nextId,
                        DA_Category: category,
                        DA_Course: courseName,
                        DA_EducationalAttainment: educationalAttainment,
                        DA_Year: year,
                        DA_Male: male,
                        DA_Female: female,
                        DA_Timestamp: new Date().toISOString(),
                        DA_SchoolID: schoolId,
                        DA_AddedbyName: _actor
                    });
                    _daInserted = true;
                } catch (_daErr) {
                    if (_daTry === 4) throw _daErr;
                }
            }
            saveActivityLog(_actor + ' inserted new record' + _logBase, 'school.html');
        }
        return true;
    } catch (e) {
        console.error('saveToDataAnalytics error:', e, '| school:', schoolId, '| year:', year, '| course:', courseName);
        return false;
    }
}

// ── loadSchoolAccounts (needed for school abbrev lookup) ──────────────────
async function loadSchoolAccounts() {
    try {
        const rows = await SB.get('ListofSchool', 'deletestats=eq.0');
        allSchoolDocs = rows.map(function(r) {
            return Object.assign({}, r, { docId: String(r.school_id) });
        });
    } catch (e) { console.error('loadSchoolAccounts error:', e); }
}

// ── loadSystemSettings ────────────────────────────────────────────────────
async function loadSystemSettings() {
    try {
        const rows = await SB.get('Settings', '');
        const s = rows[0] || {};
        if (s.SystemName) {
            const navEl = document.getElementById('navSiteName');
            if (navEl) navEl.textContent = s.SystemName;
            document.title = (currentSchoolDoc ? currentSchoolDoc.schoolname : 'School') + ' Dashboard - ' + s.SystemName;
        }
        if (s.AdminEmail) {
            const contactEmailEl = document.getElementById('contactAdminEmail');
            if (contactEmailEl) contactEmailEl.textContent = s.AdminEmail;
        }
    } catch (e) { console.error('loadSystemSettings error:', e); }
}

async function loadCoursesFromSupabase() {
    syncVisibleYearsToAcademicYears();
    if (!currentSchool || currentSchool === 'all') {
        console.log('⚠️ No school selected, skipping course load');
        return;
    }

    const cacheKey = currentSchool + '_' + currentEducationalLevel;
    if (_courseLoadCache[cacheKey]) {
        console.log('✓ Courses already cached for:', cacheKey);
        updateUnifiedTable();
        updateSummary();
        return;
    }
    
    console.log('📚 Loading courses for:', cacheKey);

    try {
        const eduMap = { bachelor:"BACHELOR'S DEGREE", twoyear:'2-YEAR COURSE', tesda:'TESDA', graduate:'GRADUATE COURSE' };
        const targetEduLabel = eduMap[currentEducationalLevel];

        if (_clCoursesLoaded && clAllCourses.length) {
            courseList = courseList.filter(function(c) {
                if (c.school !== currentSchool) return true;
                if (currentEducationalLevel === 'all') return false;
                return c.eduLevel !== targetEduLabel;
            });
            clAllCourses.forEach(function(c) {
                if (c.schoolDocId !== currentSchool) return;
                if (targetEduLabel && c.eduLevel !== targetEduLabel) return;
                const targetKey = String(c.schoolDocId || 'all');
                if (!schoolsData[targetKey]) schoolsData[targetKey] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
                ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
                    if (!schoolsData[targetKey][cat][c.courseName]) {
                        schoolsData[targetKey][cat][c.courseName] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
                    }
                });
                const already = courseList.find(function(x) { return x.name === c.courseName && String(x.school) === String(c.schoolDocId || ''); });
                if (!already) courseList.push({ id: c.docId, name: c.courseName, school: c.schoolDocId, schoolLabel: c.schoolName || '', eduLevel: c.eduLevel || '' });
            });
            _courseLoadCache[cacheKey] = true;
            updateUnifiedTable(); updateSummary();
            return;
        }

        courseList = courseList.filter(function(c) {
            if (c.school !== currentSchool) return true;
            if (currentEducationalLevel === 'all') return false;
            return c.eduLevel !== targetEduLabel;
        });

        let qs = 'course_Deletestats=eq.0&course_SchoolID=eq.' + encodeURIComponent(currentSchool);
        if (currentEducationalLevel !== 'all' && targetEduLabel) {
            qs += '&course_EducationalAttainment=eq.' + encodeURIComponent(targetEduLabel);
        }
        const rows = await SB.get('COURSE', qs);
        rows.forEach(function(r) {
            const targetKey = String(r.course_SchoolID || 'all');
            if (!schoolsData[targetKey]) schoolsData[targetKey] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
            ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
                if (!schoolsData[targetKey][cat][r.course_SchoolCourse]) {
                    schoolsData[targetKey][cat][r.course_SchoolCourse] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
                }
            });
            const already = courseList.find(function(c) { return c.name === r.course_SchoolCourse && c.school === String(r.course_SchoolID || ''); });
            if (!already) courseList.push({ id: r.course_id, name: r.course_SchoolCourse, school: String(r.course_SchoolID || ''), schoolLabel: r.course_SchoolName || '', eduLevel: r.course_EducationalAttainment || '' });
        });

        _courseLoadCache[cacheKey] = true;
        updateUnifiedTable(); updateSummary();
    } catch (e) { console.error('loadCoursesFromSupabase error:', e); }
}

// Legacy alias
const loadCoursesFromFirestore = loadCoursesFromSupabase;

// ── Course List Section (Add Course page) ─────────────────────────────────
async function clLoadCoursesFromSupabase(force) {
    if (!force && _clCoursesLoaded) {
        clFilterCourses();
        return;
    }
    if (_clLoadingPromise) return _clLoadingPromise;

    _clLoadingPromise = (async function() {
        try {
            const schoolDocId = getSchoolDocId();
            let qs = 'course_Deletestats=eq.0';
            if (schoolDocId) qs += '&course_SchoolID=eq.' + encodeURIComponent(schoolDocId);
            const rows = await SB.get('COURSE', qs);
            clAllCourses = rows.map(function(r) {
                return {
                    docId: String(r.course_id),
                    courseName: r.course_SchoolCourse || '',
                    schoolName: r.course_SchoolName || '',
                    schoolAbbrev: r.course_SchoolAbbrev || '',
                    schoolDocId: String(r.course_SchoolID || ''),
                    eduLevel: r.course_EducationalAttainment || ''
                };
            });
            clAllCourses.sort(function(a, b) { return a.courseName.localeCompare(b.courseName); });
            _clCoursesLoaded = true;
            clFilterCourses();
        } catch (e) {
            console.error('clLoadCoursesFromSupabase error:', e);
        } finally {
            _clLoadingPromise = null;
        }
    })();
    return _clLoadingPromise;
}

// Legacy alias
const clLoadCoursesFromFirestore = clLoadCoursesFromSupabase;

function clFilterCourses() {
    const search = (document.getElementById('clSearchInput') ? document.getElementById('clSearchInput').value : '').toLowerCase();
    const eduVal = document.getElementById('clEduFilter') ? document.getElementById('clEduFilter').value : 'all';
    clFiltered = clAllCourses.filter(function(c) {
        const matchSearch = !search || c.courseName.toLowerCase().includes(search) || c.schoolName.toLowerCase().includes(search);
        const matchEdu = eduVal === 'all' || c.eduLevel === eduVal;
        return matchSearch && matchEdu;
    });
    clPage = 1;
    clRenderTable();
}

function clRenderTable() {
    const tbody = document.getElementById('clTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const total = clFiltered.length;
    const totalPages = Math.max(1, Math.ceil(total / clPageSize));
    if (clPage > totalPages) clPage = totalPages;
    const start = (clPage - 1) * clPageSize;
    const end = Math.min(start + clPageSize, total);
    const pageData = clFiltered.slice(start, end);
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-gray);">No courses found. <a href="#" onclick="openAddCourseModal()" style="color:var(--primary-blue);">Add a course</a>.</td></tr>';
    } else {
        pageData.forEach(function(c, i) {
            const tr = document.createElement('tr');
            const _cNum = document.createElement('td'); _cNum.textContent = start + i + 1;
            const _cName = document.createElement('td'); _cName.innerHTML = '<strong>' + alEsc(c.courseName || '—') + '</strong>';
            const _cSchool = document.createElement('td'); _cSchool.textContent = c.schoolName || '—';
            const _cEdu = document.createElement('td'); _cEdu.innerHTML = '<span style="background:#f0f9ff;color:#0369a1;padding:2px 8px;border-radius:6px;font-size:0.82rem;font-weight:600;">' + alEsc(c.eduLevel || '—') + '</span>';
            const _cAct = document.createElement('td'); _cAct.style.whiteSpace = 'nowrap';
            const _cActCell = document.createElement('div'); _cActCell.className = 'action-cell';
            const _cEdit = document.createElement('button');
            _cEdit.className = 'btn btn-secondary btn-small'; _cEdit.title = 'Edit'; _cEdit.innerHTML = '<i class="fas fa-edit"></i> Edit';
            _cEdit.onclick = (function(d) { return function() { openEditCourseFromCL(d); }; })(c.docId);
            const _cDel = document.createElement('button');
            _cDel.className = 'btn btn-danger btn-small'; _cDel.title = 'Delete'; _cDel.innerHTML = '<i class="fas fa-trash"></i> Delete';
            _cDel.onclick = (function(d, n) { return function() { deleteCourseFromCL(d, n); }; })(c.docId, c.courseName || '');
            _cActCell.appendChild(_cEdit); _cActCell.appendChild(_cDel); _cAct.appendChild(_cActCell);
            [_cNum, _cName, _cSchool, _cEdu, _cAct].forEach(function(td) { tr.appendChild(td); });
            tbody.appendChild(tr);
        });
    }
    const pageInfo = document.getElementById('clPageInfo');
    const pageIndicator = document.getElementById('clPageIndicator');
    const prevBtn = document.getElementById('clPrevBtn');
    const nextBtn = document.getElementById('clNextBtn');
    if (pageInfo) pageInfo.textContent = total === 0 ? 'No courses found' : 'Showing ' + (start + 1) + '-' + end + ' of ' + total + ' courses';
    if (pageIndicator) pageIndicator.textContent = 'Page ' + clPage + ' of ' + totalPages;
    if (prevBtn) prevBtn.disabled = clPage <= 1;
    if (nextBtn) nextBtn.disabled = clPage >= totalPages;
}

function clPrevPage() { if (clPage > 1) { clPage--; clRenderTable(); } }
function clNextPage() { const totalPages = Math.max(1, Math.ceil(clFiltered.length / clPageSize)); if (clPage < totalPages) { clPage++; clRenderTable(); } }
function openEditCourseFromCL(docId) { openEditCourse(docId); }

async function deleteCourseFromCL(docId, courseName) {
    if (confirm('Delete course "' + courseName + '"? This cannot be undone.')) {
        try {
            await SB.update('COURSE', { course_id: docId }, { course_Deletestats: '1' });
            showToast('Course deleted successfully!', 'success');
            clAllCourses = clAllCourses.filter(function(c) { return c.docId !== docId; });
            clFilterCourses();
            courseList = courseList.filter(function(c) { return !(c.id === docId || c.name === courseName); });
            _courseLoadCache = {};
            saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' deleted course "' + courseName + '".', 'school.html');
        } catch (e) { console.error('deleteCourseFromCL error:', e); showToast('Error deleting course', 'error'); }
    }
}

// ── Add Course Modal ──────────────────────────────────────────────────────
function openAddCourseModal() {
    const schoolDocId = getSchoolDocId();
    const schoolName = currentSchoolDoc ? (currentSchoolDoc.schoolname || '') : '';
    const displayInput = document.getElementById('modalCourseSchoolDisplay');
    const hiddenInput = document.getElementById('modalCourseSchool');
    if (displayInput) displayInput.value = schoolName;
    if (hiddenInput) hiddenInput.value = schoolDocId;
    document.getElementById('addCourseModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeAddCourseModal() {
    document.getElementById('addCourseModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('sidebarAddCourseForm').reset();
    const schoolDocId = getSchoolDocId();
    const schoolName = currentSchoolDoc ? (currentSchoolDoc.schoolname || '') : '';
    const displayInput = document.getElementById('modalCourseSchoolDisplay');
    const hiddenInput = document.getElementById('modalCourseSchool');
    if (displayInput) displayInput.value = schoolName;
    if (hiddenInput) hiddenInput.value = schoolDocId;
}

async function getNextCourseId(schoolAbbrev, eduAttainment) {
    const safeSchool = schoolAbbrev.replace(/[^a-zA-Z0-9]/g, '');
    const safeEdu = eduAttainment.replace(/[^a-zA-Z0-9]/g, '_');
    const prefix = safeSchool + '_' + safeEdu;
    let max = 0;

    if (_clCoursesLoaded && clAllCourses.length) {
        clAllCourses.forEach(function(c) {
            if (!c.docId) return;
            if (c.docId.startsWith(prefix + '_')) {
                const num = parseInt(c.docId.substring(prefix.length + 1));
                if (!isNaN(num)) max = Math.max(max, num);
            }
        });
        return prefix + '_' + String(max + 1).padStart(4, '0');
    }

    const qs = 'course_SchoolID=eq.' + encodeURIComponent(getSchoolDocId()) + '&course_EducationalAttainment=eq.' + encodeURIComponent(eduAttainment);
    const rows = await SB.get('COURSE', qs);
    rows.forEach(function(r) {
        if (r.course_id && r.course_id.startsWith(prefix + '_')) {
            const num = parseInt(r.course_id.substring(prefix.length + 1));
            if (!isNaN(num)) max = Math.max(max, num);
        }
    });
    return prefix + '_' + String(max + 1).padStart(4, '0');
}

async function submitAddCourseModal(event) {
    event.preventDefault();
    const submitBtn = document.querySelector('#addCourseModal button[type="submit"]');
    const restore = setBtnLoading(submitBtn, 'Adding...');

    try {
        const schoolDocId = getSchoolDocId();
        const schoolLabel = currentSchoolDoc ? (currentSchoolDoc.schoolname || '') : '';
        const schoolAbbrev = currentSchoolDoc ? (currentSchoolDoc.schoolabbrev || schoolLabel) : '';
        const eduLevel = document.getElementById('modalEduAttainment').value;
        const courseName = capitalizeEachSentence(document.getElementById('modalCourseName').value.trim());  
        if (!courseName || !eduLevel || !schoolDocId) {
            showToast('Please complete all required fields.', 'error');
            restore();
            return;
        }

        let isDup = false;
        if (_clCoursesLoaded && clAllCourses.length) {
            isDup = clAllCourses.some(function(c) {
                return c.schoolDocId === schoolDocId
                    && c.eduLevel === eduLevel
                    && (c.courseName || '').toLowerCase() === courseName.toLowerCase();
            });
        } else {
            const qs = 'course_SchoolID=eq.' + encodeURIComponent(schoolDocId) + '&course_EducationalAttainment=eq.' + encodeURIComponent(eduLevel) + '&course_SchoolCourse=eq.' + encodeURIComponent(courseName) + '&course_Deletestats=eq.0';
            const dupRows = await SB.get('COURSE', qs);
            isDup = dupRows.length > 0;
        }
        if (isDup) {
            showToast('Course already exists for this school and educational level!', 'error');
            restore();
            return;
        }

        // BUG FIX 6: Retry loop — if the DB sequence is ahead of the max row value,
        // the first insert attempt may collide; retry with incremented ID until it succeeds
        var nextCourseId;
        var _courseInserted = null;
        for (var _cTry = 0; _cTry < 5 && !_courseInserted; _cTry++) {
            try {
                var maxCourseRows = await SB.get('COURSE', 'select=course_id&order=course_id.desc&limit=1');
                nextCourseId = (maxCourseRows.length > 0 ? (parseInt(maxCourseRows[0].course_id) || 0) : 0) + 1 + _cTry;
            } catch (_e) { nextCourseId = Math.floor(Date.now() / 1000) % 2147483647 + _cTry; }
            try {
                _courseInserted = await SB.insert('COURSE', {
                    course_id: nextCourseId,
                    course_SchoolCourse: courseName,
                    course_AddedbyName: currentSchoolDoc ? currentSchoolDoc.username : 'school',
                    course_TimeStamp: new Date().toISOString(),
                    course_EducationalAttainment: eduLevel,
                    course_SchoolID: schoolDocId,
                    course_SchoolName: schoolLabel,
                    course_SchoolAbbrev: schoolAbbrev,
                    course_Deletestats: '0'
                });
            } catch (_cErr) {
                if (_cTry === 4) throw _cErr;
            }
        }
        const inserted = _courseInserted;
        const newDocId = String(((inserted || [])[0] || {}).course_id || '');

        if (!schoolsData[schoolDocId]) schoolsData[schoolDocId] = { enrollees:{}, outside:{}, inside:{}, graduates:{}, passers:{} };
        ['enrollees','outside','inside','graduates','passers'].forEach(function(cat) {
            schoolsData[schoolDocId][cat][courseName] = new Array(academicYears.length).fill(0).map(function() { return {male:0,female:0}; });
        });
        courseList.push({ id: newDocId, name: courseName, school: schoolDocId, schoolLabel: schoolLabel, eduLevel: eduLevel });

        clAllCourses.push({ docId: newDocId, courseName, schoolName: schoolLabel, schoolAbbrev, schoolDocId, eduLevel });
        clAllCourses.sort(function(a, b) { return a.courseName.localeCompare(b.courseName); });
        _clCoursesLoaded = true;

        clFilterCourses();
        updateUnifiedTable();
        updateSummary();

        showToast('"' + courseName + '" added successfully!', 'success');
        saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' added course "' + courseName + '" (' + eduLevel + ').', 'school.html');

        restore();
        closeAddCourseModal();
    } catch (e) {
        console.error('submitAddCourseModal error:', e);
        showToast('Error adding course: ' + (e.message || 'Unknown error'), 'error');
        restore();
    }
}

// ── Edit Course ───────────────────────────────────────────────────────────
async function openEditCourse(courseDocId) {
    let cached = null;
    if (_clCoursesLoaded && clAllCourses.length) {
        cached = clAllCourses.find(function(c) { return c.docId === courseDocId; });
    }

    if (cached) {
        document.getElementById('editCourseDocId').value = courseDocId;
        document.getElementById('editCourseName').value = cached.courseName || '';
        document.getElementById('editCourseEdu').value = cached.eduLevel || '';
        document.getElementById('editCourseModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        return;
    }

    document.getElementById('editCourseDocId').value = courseDocId;
    document.getElementById('editCourseName').value = '';
    document.getElementById('editCourseEdu').value = '';
    document.getElementById('editCourseModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    try {
        const rows = await SB.get('COURSE', 'course_id=eq.' + encodeURIComponent(courseDocId));
        if (!rows.length) { showToast('Course not found!', 'error'); return; }
        const r = rows[0];
        document.getElementById('editCourseName').value = r.course_SchoolCourse || '';
        document.getElementById('editCourseEdu').value = r.course_EducationalAttainment || '';
    } catch (e) { console.error('openEditCourse error:', e); showToast('Error loading course data', 'error'); }
}

function closeEditCourseModal() {
    document.getElementById('editCourseModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function saveEditCourse() {
    const saveBtn = document.querySelector('#editCourseModal button.btn-primary');
    const restore = setBtnLoading(saveBtn, 'Saving...');

    try {
        const docId = document.getElementById('editCourseDocId').value;
        const courseName = capitalizeEachSentence(document.getElementById('editCourseName').value.trim());
        const eduLevel = document.getElementById('editCourseEdu').value;
        const schoolDocId = getSchoolDocId();
        if (!courseName || !eduLevel) {
            showToast('Please fill in all fields', 'error');
            restore();
            return;
        }

        let isDup = false;
        if (_clCoursesLoaded && clAllCourses.length) {
            isDup = clAllCourses.some(function(c) {
                return c.docId !== docId && c.schoolDocId === schoolDocId && c.eduLevel === eduLevel
                    && (c.courseName || '').toLowerCase() === courseName.toLowerCase();
            });
        } else {
            const qs = 'course_SchoolID=eq.' + encodeURIComponent(schoolDocId) + '&course_EducationalAttainment=eq.' + encodeURIComponent(eduLevel) + '&course_SchoolCourse=eq.' + encodeURIComponent(courseName) + '&course_Deletestats=eq.0';
            const dupRows = await SB.get('COURSE', qs);
            isDup = dupRows.some(function(r) { return r.course_id !== docId; });
        }
        if (isDup) {
            showToast('This course already exists for this school and level!', 'error');
            restore();
            return;
        }

        await SB.update('COURSE', { course_id: docId }, { course_SchoolCourse: courseName, course_EducationalAttainment: eduLevel });

        const idx = clAllCourses.findIndex(function(c) { return c.docId === docId; });
        if (idx !== -1) {
            clAllCourses[idx].courseName = courseName;
            clAllCourses[idx].eduLevel = eduLevel;
            clAllCourses.sort(function(a, b) { return a.courseName.localeCompare(b.courseName); });
        }
        const clIdx = courseList.findIndex(function(c) { return c.id === docId; });
        if (clIdx !== -1) {
            courseList[clIdx].name = courseName;
            courseList[clIdx].eduLevel = eduLevel;
        }

        clFilterCourses();
        updateUnifiedTable();
        updateSummary();

        showToast('Course updated successfully!', 'success');
        saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' edited course "' + courseName + '".', 'school.html');

        restore({ successText: 'Saved!' });
        setTimeout(function() { closeEditCourseModal(); }, 900);
    } catch (e) {
        console.error('saveEditCourse error:', e);
        showToast('Error saving course: ' + (e.message || 'Unknown error'), 'error');
        restore();
    }
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────
let _pendingDeleteFn = null;
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

// ── Password toggle ───────────────────────────────────────────────────────
function toggleInputPassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    const icon = btn.querySelector('i');
    if (icon) icon.className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
}

// ── School Profile ────────────────────────────────────────────────────────
let _profileDocId = '';
let _profileOriginalData = {};

async function loadSchoolProfile() {
    const schoolDocId = getSchoolDocId();
    if (!schoolDocId) return;
    try {
        const rows = await SB.get('ListofSchool', 'school_id=eq.' + encodeURIComponent(schoolDocId));
        if (!rows.length) { showToast('School profile not found.', 'error'); return; }
        const d = rows[0];
        _profileDocId = schoolDocId;
        _profileOriginalData = d;
        document.getElementById('profileSchoolName').textContent = d.schoolname || '—';
        document.getElementById('profileSchoolAbbrev').textContent = d.schoolabbrev || '—';
        document.getElementById('profSchoolName').value = d.schoolname || '';
        document.getElementById('profSchoolAbbrev').value = d.schoolabbrev || '';
        document.getElementById('profSchoolPres').value = d.schoolpres || '';
        document.getElementById('profAddress').value = d.address || '';
        document.getElementById('profEmail').value = d.email_add || '';
        document.getElementById('profPhone').value = d.contact_number || '';
        document.getElementById('profLandline').value = d.landline || '';
        document.getElementById('profWebsite').value = d.website || '';
        document.getElementById('profTeachingStaff').value = d.teaching_staff || 0;
        document.getElementById('profNonTeachingStaff').value = d.nonteachingstaff || 0;
        document.getElementById('profUsername').value = d.username || '';
        document.getElementById('profPassword').value = d.password || '';
        document.getElementById('profDescription').value = d.description || '';
    } catch (e) { console.error('loadSchoolProfile error:', e); showToast('Error loading profile.', 'error'); }
}

function enableProfileEdit() {
    const fields = ['profSchoolName','profSchoolAbbrev','profSchoolPres','profAddress','profEmail','profPhone','profLandline','profWebsite','profTeachingStaff','profNonTeachingStaff','profUsername','profPassword','profDescription'];
    fields.forEach(function(id) { const el = document.getElementById(id); if (el) el.removeAttribute('disabled'); });
    document.getElementById('editProfileBtn').style.display = 'none';
    document.getElementById('saveProfileBtn').style.display = '';
    document.getElementById('cancelProfileBtn').style.display = '';
}

function cancelProfileEdit() {
    const d = _profileOriginalData;
    document.getElementById('profSchoolName').value = d.schoolname || '';
    document.getElementById('profSchoolAbbrev').value = d.schoolabbrev || '';
    document.getElementById('profSchoolPres').value = d.schoolpres || '';
    document.getElementById('profAddress').value = d.address || '';
    document.getElementById('profEmail').value = d.email_add || '';
    document.getElementById('profPhone').value = d.contact_number || '';
    document.getElementById('profLandline').value = d.landline || '';
    document.getElementById('profWebsite').value = d.website || '';
    document.getElementById('profTeachingStaff').value = d.teaching_staff || 0;
    document.getElementById('profNonTeachingStaff').value = d.nonteachingstaff || 0;
    document.getElementById('profUsername').value = d.username || '';
    document.getElementById('profPassword').value = d.password || '';
    document.getElementById('profDescription').value = d.description || '';
    disableProfileFields();
}

function disableProfileFields() {
    const fields = ['profSchoolName','profSchoolAbbrev','profSchoolPres','profAddress','profEmail','profPhone','profLandline','profWebsite','profTeachingStaff','profNonTeachingStaff','profUsername','profPassword','profDescription'];
    fields.forEach(function(id) { const el = document.getElementById(id); if (el) el.setAttribute('disabled', 'disabled'); });
    document.getElementById('editProfileBtn').style.display = '';
    document.getElementById('saveProfileBtn').style.display = 'none';
    document.getElementById('cancelProfileBtn').style.display = 'none';
}

async function saveSchoolProfile() {
    const docId = _profileDocId;
    if (!docId) { showToast('No school profile loaded.', 'error'); return; }
    const schoolname      = document.getElementById('profSchoolName').value.trim();
    const schoolabbrev    = document.getElementById('profSchoolAbbrev').value.trim();
    const schoolpres      = document.getElementById('profSchoolPres').value.trim();
    const address         = document.getElementById('profAddress').value.trim();
    const email_add       = document.getElementById('profEmail').value.trim();
    const contact_number  = document.getElementById('profPhone').value.trim();
    const landline        = document.getElementById('profLandline').value.trim();
    const website         = document.getElementById('profWebsite').value.trim();
    const teaching_staff  = parseInt(document.getElementById('profTeachingStaff').value) || 0;
    const nonteachingstaff = parseInt(document.getElementById('profNonTeachingStaff').value) || 0;
    const username        = document.getElementById('profUsername').value.trim();
    const password        = document.getElementById('profPassword').value;
    const description     = document.getElementById('profDescription').value.trim();
    if (!schoolname) { showToast('School name is required.', 'error'); return; }
    const saveBtn = document.getElementById('saveProfileBtn');
    const orig = saveBtn.innerHTML;
    saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    try {
        await SB.update('ListofSchool', { school_id: docId }, {
            schoolname, schoolabbrev, schoolpres, address, email_add, contact_number,
            landline, website, teaching_staff, nonteachingstaff, username, password, description
        });
        _profileOriginalData = Object.assign({}, _profileOriginalData, { schoolname, schoolabbrev, schoolpres, address, email_add, contact_number, landline, website, teaching_staff, nonteachingstaff, username, password, description });
        document.getElementById('profileSchoolName').textContent = schoolname;
        document.getElementById('profileSchoolAbbrev').textContent = schoolabbrev;
        if (currentSchoolDoc) { currentSchoolDoc.schoolname = schoolname; currentSchoolDoc.schoolabbrev = schoolabbrev; currentSchoolDoc.username = username; currentSchoolDoc.password = password; }
        showToast('School profile updated successfully!', 'success');
        saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' updated school profile.', 'school.html');
        disableProfileFields();
    } catch (e) {
        console.error('saveSchoolProfile error:', e);
        showToast('Error saving profile: ' + e.message, 'error');
    } finally { saveBtn.disabled = false; saveBtn.innerHTML = orig; }
}

// ── Settings ──────────────────────────────────────────────────────────────
let _settingsDocId = '';

async function loadSchoolSettingsForm() {
    try {
        const rows = await SB.get('Settings', '');
        if (rows.length) {
            const d = rows[0];
            _settingsDocId = d.settings_id || '';
            const el = document.getElementById('schoolBackupFreq');
            if (el && d.BackUpFrequency) el.value = d.BackUpFrequency;
        }
    } catch (e) { console.error('loadSchoolSettingsForm error:', e); }
}

let _schoolSettingsSaving = false;
async function saveSchoolSettings() {
    if (_schoolSettingsSaving) return;
    const backupFreq = document.getElementById('schoolBackupFreq').value;
    _schoolSettingsSaving = true;
    const saveBtn = document.querySelector('#settings .btn-primary');
    const orig = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
    try {
        if (_settingsDocId) {
            await SB.update('Settings', { settings_id: _settingsDocId }, { BackUpFrequency: backupFreq });
        }
        showToast('Settings saved successfully!', 'success');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' updated school settings.', 'school.html');
        setTimeout(function() { if (saveBtn) { saveBtn.innerHTML = orig; saveBtn.disabled = false; } _schoolSettingsSaving = false; }, 2000);
    } catch (e) {
        console.error('saveSchoolSettings error:', e);
        showToast('Error saving settings: ' + e.message, 'error');
        if (saveBtn) { saveBtn.innerHTML = orig; saveBtn.disabled = false; }
        _schoolSettingsSaving = false;
    }
}

async function submitProblemReport() {
    const phone = (document.getElementById('reportProblemPhone') ? document.getElementById('reportProblemPhone').value : '').trim();
    const text = (document.getElementById('reportProblemText').value || '').trim();
    if (!phone) { showToast('Please enter your contact number.', 'error'); return; }
    if (!text) { showToast('Please describe the problem first.', 'error'); return; }
    const submitBtn = document.querySelector('#settings .btn-warning');
    const origBtn = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }
    try {
        const schoolDoc = currentSchoolDoc || {};
        const ip = await fetchClientIP();
        const pc = getPCIdentifier();
        // BUG FIX 7: Retry loop for problem report insert
        var nextId;
        var _prInserted = false;
        for (var _prTry = 0; _prTry < 5 && !_prInserted; _prTry++) {
            try {
                var maxRows = await SB.get('ProblemReports', 'select=ProblemReport_ID&order=ProblemReport_ID.desc&limit=1');
                nextId = (maxRows.length > 0 ? (parseInt(maxRows[0].ProblemReport_ID) || 0) : 0) + 1 + _prTry;
            } catch (_e) { nextId = Math.floor(Date.now() / 1000) % 2147483647 + _prTry; }
            try {
                await SB.insert('ProblemReports', {
                    ProblemReport_ID: nextId,
                    ProblemReport_SchoolID: getSchoolDocId(),
                    ProblemReport_SchoolName: schoolDoc.schoolname || '',
                    ProblemReport_Username: schoolDoc.username || 'school',
                    ProblemReport_ContactNumber: phone,
                    ProblemReport_Description: text,
                    ProblemReport_IPAddress: ip,
                    ProblemReport_DeviceName: pc,
                    ProblemReport_created_at: new Date().toISOString()
                });
                _prInserted = true;
            } catch (_prErr) {
                if (_prTry === 4) throw _prErr;
            }
        }
        await saveActivityLog(schoolDoc.username + ' submitted a problem report.', 'school.html');
        showToast('Report submitted successfully! We will review it shortly.', 'success');
        document.getElementById('reportProblemText').value = '';
        var phoneEl = document.getElementById('reportProblemPhone'); if (phoneEl) phoneEl.value = '';
        if (document.getElementById('reportProblemPhone')) document.getElementById('reportProblemPhone').value = '';
    } catch (e) {
        console.error('submitProblemReport error:', e);
        showToast('Error submitting report: ' + (e.message || 'Unknown error'), 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origBtn; }
    }
}

// ── Export ────────────────────────────────────────────────────────────────
function exportTableData() {
    var schoolSelect = document.getElementById('schoolFilter');
    var schoolLabel = schoolSelect ? schoolSelect.options[schoolSelect.selectedIndex].text : 'School';
    var eduSelect = document.getElementById('educationalFilter');
    var eduLabel = eduSelect ? eduSelect.options[eduSelect.selectedIndex].text : '';
    var catSelect = document.getElementById('categoryFilter');
    var catLabel = catSelect ? catSelect.options[catSelect.selectedIndex].text : '';

    var exportYears = getVisibleYears();

    function colToLetter(n) {
        var s = '';
        while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
        return s;
    }

    var totalCols = 1 + exportYears.length * 3;
    var colMaxLen = new Array(totalCols).fill(10);
    colMaxLen[0] = Math.max(colMaxLen[0], ('School: ' + schoolLabel).length + 2);

    var dataRows = [];
    document.querySelectorAll('#unifiedTableBody tr').forEach(function(row) {
        if (row.style.display === 'none') return;
        var dr = [];
        var cnEl = row.querySelector('.course-name');
        var cn = cnEl ? cnEl.textContent.trim() : '';
        dr.push(cn);
        colMaxLen[0] = Math.max(colMaxLen[0], cn.length + 2);
        exportYears.forEach(function(year, yi) {
            var realYearIndex = academicYears.indexOf(year);
            var maleVal = 0, femaleVal = 0;
            try {
                var gd = (realYearIndex !== -1 && schoolsData[currentSchool] && schoolsData[currentSchool][currentFilter] && schoolsData[currentSchool][currentFilter][cn])
                    ? schoolsData[currentSchool][currentFilter][cn][realYearIndex] : null;
                maleVal = (gd && typeof gd === 'object') ? (gd.male || 0) : 0;
                femaleVal = (gd && typeof gd === 'object') ? (gd.female || 0) : 0;
            } catch(e) {}
            var totalVal = maleVal + femaleVal;
            dr.push(femaleVal, maleVal, totalVal);
        });
        dataRows.push(dr);
    });

    if (typeof ExcelJS === 'undefined') { showToast('ExcelJS library not loaded. Cannot export.', 'error'); return; }

    var workbook = new ExcelJS.Workbook();
    var ws = workbook.addWorksheet('School Data');

    ws.addRow(['School: ' + schoolLabel]);
    ws.mergeCells(1, 1, 1, totalCols);
    ws.addRow(['Courses: ' + eduLabel + '   |   Category: ' + catLabel]);
    ws.mergeCells(2, 1, 2, totalCols);
    var yearHeaderRow = ['Course'];
    exportYears.forEach(function(y) { yearHeaderRow.push(y, '', ''); });
    ws.addRow(yearHeaderRow);
    var subHeaderRowData = [''];
    exportYears.forEach(function() { subHeaderRowData.push('FEMALE', 'MALE', 'TOTAL'); });
    ws.addRow(subHeaderRowData);
    exportYears.forEach(function(y, yi) { var col = 2 + yi * 3; ws.mergeCells(3, col, 3, col + 2); });
    dataRows.forEach(function(dr) { ws.addRow(dr); });

    var now = new Date();
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    var dateStr = now.getFullYear() + '' + pad(now.getMonth() + 1) + '' + pad(now.getDate());
    var timeStr = pad(now.getHours()) + '' + pad(now.getMinutes()) + '' + pad(now.getSeconds());
    var safeSchool = schoolLabel.replace(/[^a-zA-Z0-9]/g, '');
    var filename = 'UtownDataName_' + safeSchool + '_' + dateStr + '_' + timeStr + '.xlsx';

    workbook.xlsx.writeBuffer().then(function(buffer) {
        var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' exported table data to Excel.', 'school.html');
    });
}

// ── Download School Data Backup ──────────────────────────────────────────
async function downloadSchoolBackup() {
    var btn = document.getElementById('backupDownloadBtn');
    var orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...'; }

    try {
        var schoolDocId = getSchoolDocId();
        var schoolName = currentSchoolDoc ? (currentSchoolDoc.schoolname || 'School') : 'School';
        if (!schoolDocId) { showToast('No school session found.', 'error'); return; }

        // Fetch all courses for this school
        var courseRows = await SB.get('COURSE', 'course_SchoolID=eq.' + encodeURIComponent(schoolDocId) + '&course_Deletestats=eq.0&order=course_EducationalAttainment.asc,course_SchoolCourse.asc');

        // Fetch all data analytics records for this school
        var analyticsRows = await SB.get('Data_Analytics', 'DA_SchoolID=eq.' + encodeURIComponent(schoolDocId) + '&order=DA_EducationalAttainment.asc,DA_Course.asc,DA_Category.asc,DA_Year.asc');

        // ── MySQL escape helper ───────────────────────────────────────
        function sqlEsc(val) {
            if (val === null || val === undefined) return 'NULL';
            return "'" + String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n') + "'";
        }

        // ── Build SQL dump ────────────────────────────────────────────
        var lines = [];
        var now = new Date();
        var pad = function(n) { return n < 10 ? '0' + n : String(n); };
        var dateStr = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate());
        var timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

        lines.push('-- ================================================');
        lines.push('-- MySQL Backup: ' + schoolName);
        lines.push('-- Generated: ' + dateStr + ' ' + timeStr);
        lines.push('-- School ID: ' + schoolDocId);
        lines.push('-- ================================================');
        lines.push('');
        lines.push('SET NAMES utf8mb4;');
        lines.push('SET FOREIGN_KEY_CHECKS = 0;');
        lines.push('');

        // ── COURSE table ─────────────────────────────────────────────
        lines.push('-- ----------------------------');
        lines.push('-- Table structure for COURSE');
        lines.push('-- ----------------------------');
        lines.push('DROP TABLE IF EXISTS `COURSE`;');
        lines.push('CREATE TABLE `COURSE` (');
        lines.push('  `course_id` int(11) NOT NULL AUTO_INCREMENT,');
        lines.push('  `course_SchoolCourse` varchar(255) DEFAULT NULL,');
        lines.push('  `course_EducationalAttainment` varchar(100) DEFAULT NULL,');
        lines.push('  `course_SchoolID` varchar(100) DEFAULT NULL,');
        lines.push('  `course_SchoolName` varchar(255) DEFAULT NULL,');
        lines.push('  `course_SchoolAbbrev` varchar(50) DEFAULT NULL,');
        lines.push('  `course_AddedbyName` varchar(100) DEFAULT NULL,');
        lines.push('  `course_TimeStamp` datetime DEFAULT NULL,');
        lines.push('  `course_Deletestats` varchar(5) DEFAULT NULL,');
        lines.push('  PRIMARY KEY (`course_id`)');
        lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;');
        lines.push('');

        if (courseRows.length > 0) {
            lines.push('-- ----------------------------');
            lines.push('-- Records for COURSE (' + courseRows.length + ' rows)');
            lines.push('-- ----------------------------');
            courseRows.forEach(function(r) {
                lines.push(
                    'INSERT INTO `COURSE` (`course_id`, `course_SchoolCourse`, `course_EducationalAttainment`, ' +
                    '`course_SchoolID`, `course_SchoolName`, `course_SchoolAbbrev`, `course_AddedbyName`, `course_TimeStamp`, `course_Deletestats`) VALUES (' +
                    sqlEsc(r.course_id) + ', ' +
                    sqlEsc(r.course_SchoolCourse) + ', ' +
                    sqlEsc(r.course_EducationalAttainment) + ', ' +
                    sqlEsc(r.course_SchoolID) + ', ' +
                    sqlEsc(r.course_SchoolName) + ', ' +
                    sqlEsc(r.course_SchoolAbbrev) + ', ' +
                    sqlEsc(r.course_AddedbyName) + ', ' +
                    sqlEsc(r.course_TimeStamp) + ', ' +
                    sqlEsc(r.course_Deletestats) + ');'
                );
            });
            lines.push('');
        }

        // ── Data_Analytics table ──────────────────────────────────────
        lines.push('-- ----------------------------');
        lines.push('-- Table structure for Data_Analytics');
        lines.push('-- ----------------------------');
        lines.push('DROP TABLE IF EXISTS `Data_Analytics`;');
        lines.push('CREATE TABLE `Data_Analytics` (');
        lines.push('  `DA_ID` int(11) NOT NULL AUTO_INCREMENT,');
        lines.push('  `DA_Category` varchar(100) DEFAULT NULL,');
        lines.push('  `DA_Course` varchar(255) DEFAULT NULL,');
        lines.push('  `DA_EducationalAttainment` varchar(100) DEFAULT NULL,');
        lines.push('  `DA_Year` varchar(20) DEFAULT NULL,');
        lines.push('  `DA_Male` int(11) DEFAULT NULL,');
        lines.push('  `DA_Female` int(11) DEFAULT NULL,');
        lines.push('  `DA_Timestamp` datetime DEFAULT NULL,');
        lines.push('  `DA_SchoolID` varchar(100) DEFAULT NULL,');
        lines.push('  `DA_AddedbyName` varchar(100) DEFAULT NULL,');
        lines.push('  PRIMARY KEY (`DA_ID`)');
        lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;');
        lines.push('');

        if (analyticsRows.length > 0) {
            lines.push('-- ----------------------------');
            lines.push('-- Records for Data_Analytics (' + analyticsRows.length + ' rows)');
            lines.push('-- ----------------------------');
            analyticsRows.forEach(function(r) {
                lines.push(
                    'INSERT INTO `Data_Analytics` (`DA_ID`, `DA_Category`, `DA_Course`, `DA_EducationalAttainment`, ' +
                    '`DA_Year`, `DA_Male`, `DA_Female`, `DA_Timestamp`, `DA_SchoolID`, `DA_AddedbyName`) VALUES (' +
                    sqlEsc(r.DA_ID) + ', ' +
                    sqlEsc(r.DA_Category) + ', ' +
                    sqlEsc(r.DA_Course) + ', ' +
                    sqlEsc(r.DA_EducationalAttainment) + ', ' +
                    sqlEsc(r.DA_Year) + ', ' +
                    sqlEsc(r.DA_Male) + ', ' +
                    sqlEsc(r.DA_Female) + ', ' +
                    sqlEsc(r.DA_Timestamp) + ', ' +
                    sqlEsc(r.DA_SchoolID) + ', ' +
                    sqlEsc(r.DA_AddedbyName) + ');'
                );
            });
            lines.push('');
        }

        lines.push('SET FOREIGN_KEY_CHECKS = 1;');

        // ── Download as password-protected .zip containing .sql ─────
        var sqlContent = lines.join('\n');
        var fileDateStr = now.getFullYear() + '' + pad(now.getMonth()+1) + '' + pad(now.getDate());
        var fileTimeStr = pad(now.getHours()) + '' + pad(now.getMinutes()) + '' + pad(now.getSeconds());
        var safeSchool = schoolName.replace(/[^a-zA-Z0-9]/g, '');
        var sqlFilename = 'SchoolBackup_' + safeSchool + '_' + fileDateStr + '_' + fileTimeStr + '.sql';
        var zipFilename = 'SchoolBackup_' + safeSchool + '_' + fileDateStr + '_' + fileTimeStr + '.zip';

        // Get the login password to use as ZIP encryption key
        var zipPassword = '';
        if (currentSchoolDoc && currentSchoolDoc.password) {
            zipPassword = String(currentSchoolDoc.password);
        } else if (schoolSession && schoolSession.password) {
            zipPassword = String(schoolSession.password);
        }

        if (zipPassword && typeof zip !== 'undefined' && zip.ZipWriter) {
            var zipWriter = new zip.ZipWriter(
                new zip.BlobWriter('application/zip'),
                { password: zipPassword, encryptionStrength: 3 }
            );
            await zipWriter.add(sqlFilename, new zip.TextReader(sqlContent));
            var zipBlob = await zipWriter.close();
            var a = document.createElement('a');
            a.href = URL.createObjectURL(zipBlob);
            a.download = zipFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            showToast('Encrypted ZIP downloaded. Use your login password to open it.', 'success');
            saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' downloaded encrypted MySQL backup.', 'school.html');
        } else {
            // Fallback: no password on account or zip.js unavailable - plain .sql
            var blob = new Blob([sqlContent], { type: 'application/sql' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = sqlFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            showToast('MySQL backup downloaded: ' + sqlFilename, 'success');
            saveActivityLog((currentSchoolDoc ? currentSchoolDoc.username : 'school') + ' downloaded MySQL backup.', 'school.html');
        }
    } catch (e) {
        console.error('downloadSchoolBackup error:', e);
        showToast('Error downloading backup: ' + (e.message || 'Unknown error'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

// =============================================
// ACTIVITY LOG MODULE
// =============================================
const activityLogState = {
    allDocs: [], filtered: [], currentPage: 1, perPage: 10,
    sortAsc: false, searchQuery: '', filterUsername: '',
    isLoading: false, initialized: false,
};

async function initActivityLog() {
    if (activityLogState.isLoading) return;
    activityLogState.isLoading = true;
    showActivityLogState('loading');
    spinRefreshBtn(true);
    activityLogState.initialized = false;
    try {
        const schoolDocId = getSchoolDocId();
        let qs = 'order=ActivityLog_created_at.desc';
        const rows = await SB.get('ActivityLog', qs);
        const username = currentSchoolDoc ? (currentSchoolDoc.username || '') : '';
        activityLogState.allDocs = rows
            .filter(function(r) {
                if (!username) return true;
                return (r.ActivityLog_Description || '').startsWith(username);
            })
            .map(function(r) {
                return {
                    id: r.ActivityLog_ID,
                    AccountRole: r.ActivityLog_AccountRole || '',
                    Description: r.ActivityLog_Description || '',
                    Location: r.ActivityLog_Location || '',
                    TimeStamp: r.ActivityLog_created_at,
                    Username: (r.ActivityLog_Description || '').split(' ')[0] || username,
                    UserID: schoolDocId
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
        usernames.forEach(function(u) {
            const opt = document.createElement('option');
            opt.value = u; opt.textContent = u;
            usernameSelect.appendChild(opt);
        });
    }
}

function applyActivityLogFilters() {
    const state = activityLogState;
    const q = state.searchQuery.toLowerCase().trim();
    let results = [...state.allDocs].sort(function(a, b) {
        const tA = alToMs(a.TimeStamp), tB = alToMs(b.TimeStamp);
        return state.sortAsc ? tA - tB : tB - tA;
    });
    if (state.filterUsername) {
        results = results.filter(function(d) { return (d.Username || '').toLowerCase() === state.filterUsername.toLowerCase(); });
    }
    if (q) {
        results = results.filter(function(d) {
            return (d.Description || '').toLowerCase().includes(q) ||
                   (d.Username || '').toLowerCase().includes(q) ||
                   (d.Location || '').toLowerCase().includes(q);
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
    const tr = document.createElement('tr');
    const { dateStr, timeStr } = alFormatTs(doc.TimeStamp);
    const username = doc.Username || '—';
    const role = doc.AccountRole || '';
    const desc = doc.Description || '—';
    const location = doc.Location || '—';
    const initials = username.substring(0, 2).toUpperCase();
    const rowId = 'alrow-' + (doc.id || rowNum).toString().replace(/[^a-zA-Z0-9]/g, '_');
    tr.innerHTML =
        '<td class="al-td al-td-num">' + rowNum + '</td>' +
        '<td class="al-td al-td-time"><span class="al-time-date">' + alEsc(dateStr) + '</span><span class="al-time-clock">' + alEsc(timeStr) + '</span></td>' +
        '<td class="al-td al-td-user"><div class="al-username-wrap"><span class="al-avatar" style="' + alAvatarColor(username) + '">' + alEsc(initials) + '</span><span class="al-username-text">' + alEsc(username) + '</span></div></td>' +
        '<td class="al-td al-td-role"><span class="al-role-badge ' + alRoleClass(role) + '">' + alEsc(alCapFirst(role)) + '</span></td>' +
        '<td class="al-td al-td-desc"><div class="al-desc-text" id="desc-' + rowId + '">' + alEsc(desc) + '</div>' + (desc.length > 60 ? '<button class="al-desc-toggle" onclick="toggleAlDesc(\'desc-' + rowId + '\',this)">See more</button>' : '') + '</td>' +
        '<td class="al-td al-td-loc"><span class="al-location-chip"><i class="fas fa-file-code" style="font-size:.7rem;"></i> ' + alEsc(location) + '</span></td>';
    return tr;
}

function renderAlPagination(totalPages) {
    const current = activityLogState.currentPage;
    const pag = document.getElementById('alPagination');
    if (!pag) return;
    if (totalPages <= 1) { pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    const pageInfo = document.getElementById('alPageInfo');
    const firstBtn = document.getElementById('alFirstBtn');
    const prevBtn  = document.getElementById('alPrevBtn');
    const nextBtn  = document.getElementById('alNextBtn');
    const lastBtn  = document.getElementById('alLastBtn');
    if (pageInfo) pageInfo.textContent = 'Page ' + current + ' of ' + totalPages;
    if (firstBtn) firstBtn.disabled = current === 1;
    if (prevBtn)  prevBtn.disabled  = current === 1;
    if (nextBtn)  nextBtn.disabled  = current === totalPages;
    if (lastBtn)  lastBtn.disabled  = current === totalPages;
    const pageNums = document.getElementById('alPageNumbers');
    if (pageNums) {
        pageNums.innerHTML = '';
        alBuildPageRange(current, totalPages).forEach(function(p) {
            if (p === '...') {
                const s = document.createElement('span'); s.className = 'al-page-ellipsis'; s.textContent = '…'; pageNums.appendChild(s);
            } else {
                const btn = document.createElement('button');
                btn.className = 'al-page-num-btn' + (p === current ? ' al-page-active' : '');
                btn.textContent = p;
                btn.onclick = (function(pg) { return function() { goToActivityLogPage(pg); }; })(p);
                pageNums.appendChild(btn);
            }
        });
    }
}

function alBuildPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, function(_, i) { return i + 1; });
    const pages = [], left = Math.max(2, current - 2), right = Math.min(total - 1, current + 2);
    pages.push(1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < total - 1) pages.push('...');
    pages.push(total);
    return pages;
}

function updateActivityLogStats() {
    const filtered = activityLogState.filtered;
    const todayStr = new Date().toDateString();
    const todayCount = filtered.filter(function(d) { const ms = alToMs(d.TimeStamp); return ms && new Date(ms).toDateString() === todayStr; }).length;
    const uniqueUsers = new Set(filtered.map(function(d) { return d.Username; }).filter(Boolean)).size;
    const badge = document.getElementById('alTotalBadge');
    if (badge) badge.textContent = activityLogState.allDocs.length.toLocaleString() + ' total';
    const ss = document.getElementById('alStatShowing');
    if (ss) ss.textContent = 'Showing ' + filtered.length.toLocaleString() + ' result' + (filtered.length !== 1 ? 's' : '');
    const st = document.getElementById('alStatToday');
    if (st) st.textContent = 'Today: ' + todayCount.toLocaleString();
    const su = document.getElementById('alStatUniqueUsers');
    if (su) su.textContent = 'Users: ' + uniqueUsers.toLocaleString();
}

function updateAlPills() {
    const state = activityLogState;
    const container = document.getElementById('alActiveFilters');
    if (!container) return;
    const pills = [];
    if (state.searchQuery) pills.push({ label: 'Search: "' + state.searchQuery + '"', clear: function() { state.searchQuery = ''; document.getElementById('alSearchInput').value = ''; alToggleClear(); applyActivityLogFilters(); } });
    if (state.filterUsername) pills.push({ label: 'User: ' + state.filterUsername, clear: function() { state.filterUsername = ''; document.getElementById('alUsernameFilter').value = ''; applyActivityLogFilters(); } });
    if (!pills.length) { container.style.display = 'none'; return; }
    container.style.display = 'flex'; container.innerHTML = '';
    pills.forEach(function(pill) {
        const span = document.createElement('span'); span.className = 'al-pill';
        span.innerHTML = alEsc(pill.label) + ' <button class="al-pill-remove" title="Remove"><i class="fas fa-times"></i></button>';
        span.querySelector('button').addEventListener('click', pill.clear);
        container.appendChild(span);
    });
}

function updateAlFilterStyles() {
    const state = activityLogState;
    [['alUsernameFilter', state.filterUsername]].forEach(function(pair) {
        const el = document.getElementById(pair[0]);
        if (!el) return;
        pair[1] ? el.classList.add('al-filter-active') : el.classList.remove('al-filter-active');
    });
}

function showActivityLogState(state, message) {
    ['alLoading', 'alError', 'alEmpty', 'alTableWrap'].forEach(function(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const statsRow = document.getElementById('alStatsRow');
    const pag = document.getElementById('alPagination');
    if (statsRow) statsRow.style.display = (state === 'table' || state === 'empty') ? 'flex' : 'none';
    if (pag) pag.style.display = 'none';
    const map = { loading: 'alLoading', error: 'alError', empty: 'alEmpty', table: 'alTableWrap' };
    const target = document.getElementById(map[state]);
    if (target) target.style.display = (state === 'table') ? 'block' : 'flex';
    if (state === 'error') { const msg = document.getElementById('alErrorMsg'); if (msg) msg.textContent = message || 'Failed to load activity logs.'; }
}

function onActivityLogFilter() {
    const state = activityLogState;
    state.searchQuery    = document.getElementById('alSearchInput')?.value    || '';
    state.filterUsername = document.getElementById('alUsernameFilter')?.value || '';
    alToggleClear();
    applyActivityLogFilters();
}

function clearActivityLogSearch() {
    const input = document.getElementById('alSearchInput');
    if (input) input.value = '';
    activityLogState.searchQuery = '';
    alToggleClear();
    applyActivityLogFilters();
}

function clearAllActivityLogFilters() {
    activityLogState.searchQuery = activityLogState.filterUsername = '';
    const input = document.getElementById('alSearchInput');
    if (input) input.value = '';
    ['alUsernameFilter'].forEach(function(id) { const el = document.getElementById(id); if (el) el.value = ''; });
    alToggleClear();
    applyActivityLogFilters();
}

function alToggleClear() {
    const val = (document.getElementById('alSearchInput')?.value || '').trim();
    const btn = document.getElementById('alSearchClear');
    if (btn) btn.style.display = val.length > 0 ? '' : 'none';
}

function toggleActivityLogSort() {
    activityLogState.sortAsc = !activityLogState.sortAsc;
    const icon = document.getElementById('alSortIcon');
    if (icon) icon.innerHTML = activityLogState.sortAsc ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
    applyActivityLogFilters();
}

function onActivityLogPerPageChange() {
    const sel = document.getElementById('alPerPage');
    if (sel) activityLogState.perPage = parseInt(sel.value, 10) || 10;
    activityLogState.currentPage = 1;
    renderActivityLogPage();
}

function goToActivityLogPage(page) {
    const total = Math.ceil(activityLogState.filtered.length / activityLogState.perPage);
    if (page === null) page = total;
    activityLogState.currentPage = Math.max(1, Math.min(page, total));
    renderActivityLogPage();
    document.getElementById('alTableWrap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function prevActivityLogPage() { goToActivityLogPage(activityLogState.currentPage - 1); }
function nextActivityLogPage() { goToActivityLogPage(activityLogState.currentPage + 1); }

function toggleAlDesc(descId, btn) {
    const el = document.getElementById(descId);
    if (!el) return;
    const expanded = el.classList.toggle('al-expanded');
    btn.textContent = expanded ? 'See less' : 'See more';
}

function spinRefreshBtn(on) {
    const btn = document.getElementById('alRefreshBtn');
    if (!btn) return;
    btn.classList.toggle('al-spinning', on);
    btn.disabled = on;
}

// ── Activity Log utility functions ────────────────────────────────────────
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
    const ms = alToMs(ts);
    if (!ms) return { dateStr: 'Unknown date', timeStr: '' };
    const d = new Date(ms);
    return {
        dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        timeStr: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    };
}

function alCapFirst(str) { if (!str) return ''; return str.charAt(0).toUpperCase() + str.slice(1); }

function alRoleClass(role) {
    const r = (role || '').toLowerCase();
    if (r === 'superadmin') return 'al-role-superadmin';
    if (r === 'admin')      return 'al-role-admin';
    if (r === 'teacher')    return 'al-role-teacher';
    if (r === 'student')    return 'al-role-student';
    if (r === 'school')     return 'al-role-school';
    return 'al-role-default';
}

function alAvatarColor(username) {
    const colors = ['background:linear-gradient(135deg,#1e40af,#3b82f6)','background:linear-gradient(135deg,#0f766e,#14b8a6)','background:linear-gradient(135deg,#b45309,#f59e0b)','background:linear-gradient(135deg,#be185d,#ec4899)','background:linear-gradient(135deg,#064e3b,#34d399)','background:linear-gradient(135deg,#1e3a8a,#60a5fa)','background:linear-gradient(135deg,#78350f,#fbbf24)','background:linear-gradient(135deg,#7e22ce,#a855f7)'];
    let hash = 0;
    for (let i = 0; i < (username || '').length; i++) { hash = (hash << 5) - hash + username.charCodeAt(i); hash |= 0; }
    return colors[Math.abs(hash) % colors.length];
}

function alEsc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Keyboard / Click outside ──────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const logoutModal = document.getElementById('logoutConfirmModal');
        if (logoutModal && logoutModal.style.display === 'flex') { closeLogoutModal(); return; }
        const activeModal = document.querySelector('.modal[style*="block"]');
        if (activeModal) { activeModal.style.display = 'none'; document.body.style.overflow = 'auto'; return; }
        ['addCourseModal','editCourseModal'].forEach(function(id) { const m = document.getElementById(id); if (m && m.style.display === 'flex') { m.style.display = 'none'; document.body.style.overflow = 'auto'; } });
    }
});

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    if (!event.target.closest('#userDropdown')) {
        const dc = document.getElementById('userDropdownContent');
        if (dc) dc.classList.remove('show');
    }
    if (!event.target.closest('#mobileUserDropdown')) {
        const mdc = document.getElementById('mobileUserDropdownContent');
        if (mdc) mdc.classList.remove('show');
    }
};
// ── Security: Disable right-click and browser dev tools shortcuts ────────
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
(function() {
    var _secKeys = function(e) {
        if (e.key === 'F12') { e.preventDefault(); e.stopPropagation(); return false; }
        if (e.ctrlKey && e.shiftKey && ['I','i','J','j','C','c','K','k'].indexOf(e.key) !== -1) { e.preventDefault(); e.stopPropagation(); return false; }
        if (e.ctrlKey && ['U','u','S','s'].indexOf(e.key) !== -1) { e.preventDefault(); e.stopPropagation(); return false; }
    };
    document.addEventListener('keydown', _secKeys, true);
})();

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 School Dashboard initializing...');
    
    try {
        // ==========================================
        // STEP 1: Check if user is logged in as a school
        // ==========================================
        console.log('📋 Checking school session...');
        checkSchoolSession();
        
        // ==========================================
        // STEP 2: Initialize year window
        // ==========================================
        console.log('📅 Setting up year window...');
        initYearWindowStart();
        updateUnifiedTableHeaders();

        // ==========================================
        // STEP 3: Load school accounts (for abbreviations)
        // ==========================================
        console.log('🏫 Loading school accounts...');
        await loadSchoolAccounts();
        
        // ==========================================
        // STEP 4: Load system settings
        // ==========================================
        console.log('⚙️ Loading system settings...');
        await loadSystemSettings();

        // ==========================================
        // STEP 5: Get the logged-in school ID
        // ==========================================
        const schoolDocId = getSchoolDocId();
        if (!schoolDocId) {
            console.error('❌ No school ID found');
            throw new Error('School ID not found');
        }
        
        // ==========================================
        // STEP 6: Load courses for THIS school only
        // ==========================================
        console.log('📚 Loading courses for school:', schoolDocId);
        await loadCoursesFromSupabase();
        
        // ==========================================
        // STEP 7: Set default filter to 'enrollees'
        // ==========================================
        currentFilter = 'enrollees';
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.value = 'enrollees';
        }
        
        // ==========================================
        // STEP 8: Load data analytics for this school
        // ==========================================
        console.log('📊 Loading data analytics...');
        await setupDataAnalyticsFetch();

        // ==========================================
        // STEP 9: Update UI with loaded data
        // ==========================================
        console.log('🎨 Updating UI...');
        updateUnifiedTable();
        updateSummary();

        // ==========================================
        // STEP 9b: Update the new Dashboard stat cards
        // ==========================================
        updateDashboardStats();

        // ==========================================
        // STEP 10: Log the school login
        // ==========================================
        console.log('📝 Logging school login...');
        await logSchoolLogin();
        
        console.log('✅ Dashboard fully loaded');
        
        // Hide overlays
        hideDashboardLoading();
        hideSessionLoadingOverlay();
        
    } catch (error) {
        console.error('❌ Error initializing dashboard:', error);
        showToast('Error loading dashboard. Please refresh the page.', 'error');
        hideDashboardLoading();
        hideSessionLoadingOverlay();
    }
});
