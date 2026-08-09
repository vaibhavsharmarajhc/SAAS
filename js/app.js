/**
 * VSH Legal - Case & Practice Manager Core Controller (SaaS Client)
 * Manages view routing, auth state, theme switching, and modal controllers.
 */

// Debug Overlay for uncaught browser errors
window.onerror = function(message, source, lineno, colno, error) {
  const div = document.createElement('div');
  div.id = 'debug-error-banner';
  div.style.position = 'fixed';
  div.style.bottom = '10px';
  div.style.right = '10px';
  div.style.maxWidth = '400px';
  div.style.background = '#ef4444';
  div.style.color = '#fff';
  div.style.padding = '15px';
  div.style.borderRadius = '8px';
  div.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
  div.style.zIndex = '99999';
  div.style.fontSize = '12px';
  div.style.fontFamily = 'monospace';
  div.style.whiteSpace = 'pre-wrap';
  div.innerHTML = '<strong>Uncaught Error detected:</strong><br>' + message + '<br><br>Location: ' + source + ':' + lineno + ':' + colno;
  document.body.appendChild(div);
  console.error(message, error);
};

window.sanitizeText = function(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
};

window.debounce = function(func, wait = 200) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

function safeCreateIcons(rootElement) {
  try {
    if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
      if (rootElement && rootElement instanceof HTMLElement) {
        lucide.createIcons({ root: rootElement });
      } else {
        lucide.createIcons();
      }
    }
  } catch (e) {
    console.warn("Lucide safe icon create error:", e);
  }
}
window.safeCreateIcons = safeCreateIcons;

import db from './db.js';
import api from './api.js';
import historyManager from './history.js';
import dashboard from './dashboard.js';
import clients from './clients.js';
import cases from './cases.js';
import diary from './diary.js';
import accounts from './accounts.js';
import share from './share.js';
import tasks from './tasks.js';
import notificationsModule from './notifications.js';
import adminModule from './admin.js';
import portalModule from './portal.js';
window.tasksModule = tasks;
window.notificationsModule = notificationsModule;
window.casesModule = cases;
window.accountsModule = accounts;
window.clientsModule = clients;
window.dashboardModule = dashboard;
window.adminModule = adminModule;
window.portalModule = portalModule;
window.switchView = switchView;

window.viewCaseDetails = function(caseId) {
  if (!caseId) return;
  if (window.casesModule && typeof window.casesModule.showCaseDossier === 'function') {
    window.casesModule.showCaseDossier(caseId);
  }
};

// Application State
const state = {
  activeView: 'dashboard-page',
};

// DOM Elements (evaluated dynamically per router call)
const getSidebarMenuItems = () => document.querySelectorAll('.sidebar-menu .menu-item');
const getPageContainers = () => document.querySelectorAll('.page-container');
const getHeaderPageTitle = () => document.getElementById('header-page-title');
const getHeaderQuickActionBtn = () => document.getElementById('header-quick-action-btn');
const getThemeToggleCheckbox = () => document.getElementById('theme-toggle-checkbox');
const getThemeToggleText = () => document.getElementById('theme-toggle-text');
const getThemeIconLight = () => document.getElementById('theme-icon-light');
const getThemeIconDark = () => document.getElementById('theme-icon-dark');
const getSidebarBackupBtn = () => document.getElementById('sidebar-backup-btn');
const getSidebarLogoutBtn = () => document.getElementById('sidebar-logout-btn');

// View Configuration for Quick Actions
const viewQuickActions = {
  'tasks-page': {
    text: 'New Task',
    icon: 'plus',
    action: () => {
      if (typeof window.tasksModule !== 'undefined') {
        window.tasksModule.showAddTaskModal();
      }
    }
  },
  'dashboard-page': {
    text: 'Log Payment',
    icon: 'indian-rupee',
    action: () => {
      switchView('accounts-page');
      setTimeout(() => {
        document.getElementById('btn-log-transaction').click();
      }, 50);
    }
  },
  'clients-page': {
    text: 'Reset Wizard',
    icon: 'rotate-ccw',
    action: () => {
      clients.resetWizard();
    }
  },
  'diary-page': {
    text: 'Record Hearing',
    icon: 'calendar',
    action: () => {
      const allCases = db.getCases().filter(c => c.status === 'Active');
      if (allCases.length > 0) {
        cases.showAddHearingModal(allCases[0].id);
      } else {
        alert("Please register a case before recording a hearing.");
        switchView('cases-page');
      }
    }
  },
  'accounts-page': {
    text: 'Log Entry',
    icon: 'plus-circle',
    action: () => {
      document.getElementById('btn-log-transaction').click();
    }
  },
  'share-page': {
    text: 'Share Status',
    icon: 'send',
    action: () => {
      document.getElementById('btn-generate-share').click();
    }
  },
  'settings-page': {
    text: 'Backup DB',
    icon: 'download',
    action: () => {
      db.exportBackup();
    }
  }
};

// View title mappings for the app header
const VIEW_TITLES = {
  'dashboard-page': 'Dashboard',
  'overview-page': 'Practice Overview',
  'clients-page': 'Client Directory & Onboarding',
  'cases-page': 'Case Registry',
  'diary-page': 'Daily Hearings Diary',
  'accounts-page': 'Accounts & Financials',
  'share-page': 'Client Share Portal',
  'tasks-page': 'Task Manager',
  'settings-page': 'System Settings'
};

/**
 * Switch Active View Router (Async)
 */
export async function switchView(targetViewId) {
  // 1. Resolve Current User safely across DB and Storage
  let currentUser = {};
  try {
    if (typeof db !== 'undefined' && typeof db.getUser === 'function') {
      currentUser = db.getUser() || {};
    }
    if (!currentUser.email) {
      currentUser = JSON.parse(localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || '{}');
    }
  } catch (e) {
    currentUser = {};
  }

  const extractEmail = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj.toLowerCase().trim();
    if (obj.email) return obj.email.toLowerCase().trim();
    if (obj.user && obj.user.email) return obj.user.email.toLowerCase().trim();
    return '';
  };

  let userEmail = extractEmail(currentUser);
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  
  if (!userEmail && token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        userEmail = extractEmail(payload);
        if (userEmail) {
          currentUser = { ...currentUser, email: userEmail, role: payload.role || 'lawyer' };
        }
      }
    } catch (e) {}
  }

  // 2. Refresh Admin Nav Link Visibility
  if (typeof adminModule !== 'undefined' && typeof adminModule.updateAdminVisibility === 'function') {
    adminModule.updateAdminVisibility(currentUser);
  }

  // 3. Super Admin Route Visibility Check
  if (typeof adminModule !== 'undefined' && typeof adminModule.updateAdminVisibility === 'function') {
    adminModule.updateAdminVisibility(currentUser);
  }

  // 4. Validate DOM Target (Fallback to dashboard if container missing)
  let targetElem = document.getElementById(targetViewId);
  if (!targetElem) {
    console.warn(`[Router Navigation Failsafe] Target view container '#${targetViewId}' not found in DOM. Falling back to dashboard-page.`);
    targetViewId = 'dashboard-page';
    targetElem = document.getElementById(targetViewId);
  }

  if (typeof state !== 'undefined') {
    state.activeView = targetViewId;
  }
  if (typeof window.state !== 'undefined') {
    window.state.activeView = targetViewId;
  }

  // Auto-close mobile drawer sidebar
  const sidebar = document.querySelector('.app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar && backdrop) {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
  }

  // 5. Toggle Page Containers
  getPageContainers().forEach(container => {
    if (container.id === targetViewId) {
      container.classList.add('active');
      container.style.display = 'block';
    } else {
      container.classList.remove('active');
      container.style.display = 'none';
    }
  });

  // 6. Toggle Active Navigation Link in Sidebar
  getSidebarMenuItems().forEach(item => {
    if (item.getAttribute('data-target') === targetViewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach(item => {
    const target = item.getAttribute('data-target');
    if (target && target === targetViewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 7. Update Top Header Title
  const titleElem = getHeaderPageTitle();
  if (titleElem && VIEW_TITLES[targetViewId]) {
    titleElem.textContent = VIEW_TITLES[targetViewId];
  }

  if (targetViewId === 'tasks-page' && typeof window.tasksModule !== 'undefined') {
    window.tasksModule.render();
  }

  // Update Quick Action button
  const quickActionBtn = getHeaderQuickActionBtn();
  const config = viewQuickActions[targetViewId];
  if (config && quickActionBtn) {
    quickActionBtn.style.display = 'inline-flex';
    const textSpan = quickActionBtn.querySelector('span');
    if (textSpan) textSpan.textContent = config.text;
    let iconElement = quickActionBtn.querySelector('i, svg');
    if (iconElement) {
      const newIcon = document.createElement('i');
      newIcon.setAttribute('data-lucide', config.icon);
      iconElement.parentNode.replaceChild(newIcon, iconElement);
    }
    safeCreateIcons();
  } else if (quickActionBtn) {
    quickActionBtn.style.display = 'none';
  }

  // 8. Dispatch Rendering Phase
  if (typeof refreshPageView === 'function') {
    await refreshPageView(targetViewId);
  } else {
    dispatchViewRender(targetViewId);
  }
}
window.switchView = switchView;


/**
 * Helper to dispatch module render logic cleanly
 */
function dispatchViewRender(viewId) {
  switch (viewId) {
    case 'dashboard-page':
    case 'overview-page':
      if (typeof dashboard !== 'undefined' && dashboard.render) dashboard.render();
      requestAnimationFrame(() => {
        if (typeof dashboard !== 'undefined' && typeof dashboard.renderCharts === 'function') {
          dashboard.renderCharts();
        }
      });
      break;
    case 'clients-page':
      if (typeof clients !== 'undefined' && clients.render) clients.render();
      break;
    case 'cases-page':
      if (typeof cases !== 'undefined' && cases.render) cases.render();
      break;
    case 'diary-page':
      if (typeof diary !== 'undefined' && diary.render) diary.render();
      break;
    case 'accounts-page':
      if (typeof accounts !== 'undefined' && accounts.render) accounts.render();
      break;
    case 'share-page':
      if (typeof share !== 'undefined' && share.render) share.render();
      break;
    case 'settings-page':
      loadSettingsForm();
      break;
    case 'portal-page':
      if (typeof portalModule !== 'undefined' && portalModule.render) portalModule.render();
      break;
  }
}

/**
 * Refresh current view data (syncs cache with server first)
 */
async function refreshPageView(viewId) {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('test_auth')) {
    window.isTestAuth = true;
  }

  // 1. Dispatch view render first so UI canvas displays instantly (0ms)
  try {
    dispatchViewRender(viewId);
  } catch (renderErr) {
    console.warn("View render execution warning:", renderErr);
  }

  // 2. Background session sync & re-render after data load
  try {
    if (!window.isTestAuth && typeof db.loadAll === 'function') {
      const loaded = await db.loadAll();
      if (loaded) {
        updateBrandingHeaders();
        dispatchViewRender(viewId);
      }
    }
  } catch (authErr) {
    console.warn("Session check non-fatal fallback:", authErr);
  }
}

// Network status listeners for Courtroom PWA mode
window.addEventListener('online', () => updateOnlineStatusPill(true));
window.addEventListener('offline', () => updateOnlineStatusPill(false));

function updateOnlineStatusPill(isOnline) {
  const pill = document.querySelector('.security-badge-pill');
  if (pill) {
    if (isOnline) {
      pill.style.background = 'rgba(16, 185, 129, 0.12)';
      pill.style.color = '#059669';
      pill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      pill.innerHTML = `<i data-lucide="shield-check" style="width:13px; height:13px; color:#059669;"></i> <span>256-Bit Encrypted Sandbox</span>`;
    } else {
      pill.style.background = 'rgba(217, 119, 6, 0.15)';
      pill.style.color = '#d97706';
      pill.style.borderColor = 'rgba(217, 119, 6, 0.4)';
      pill.innerHTML = `<i data-lucide="wifi-off" style="width:13px; height:13px; color:#d97706;"></i> <span>Offline Courtroom Mode (IndexedDB)</span>`;
    }
    if (window.safeCreateIcons) window.safeCreateIcons(pill);
  }
}

/**
 * Handle theme switching toggles
 */
function initTheme() {
  const settings = (typeof db !== 'undefined' && typeof db.getSettings === 'function') ? db.getSettings() : {};
  const initialTheme = settings.theme || 'light';
  setTheme(initialTheme);

  const toggleCheckbox = getThemeToggleCheckbox();
  if (toggleCheckbox) {
    toggleCheckbox.checked = initialTheme === 'dark';
    toggleCheckbox.addEventListener('change', async (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      setTheme(newTheme);
      if (typeof db !== 'undefined' && typeof db.updateSettings === 'function') {
        await db.updateSettings({ theme: newTheme });
      }
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggleText = getThemeToggleText();
  const iconLight = getThemeIconLight();
  const iconDark = getThemeIconDark();

  if (theme === 'dark') {
    if (toggleText) toggleText.textContent = 'Dark Mode';
    if (iconLight) iconLight.style.display = 'none';
    if (iconDark) iconDark.style.display = 'inline-block';
  } else {
    if (toggleText) toggleText.textContent = 'Light Mode';
    if (iconLight) iconLight.style.display = 'inline-block';
    if (iconDark) iconDark.style.display = 'none';
  }
}

/**
 * Load practice settings form
 */
function loadSettingsForm() {
  const settings = db.getSettings();
  document.getElementById('settings-firm-name').value = settings.firmName || 'Track My Chambers';
  document.getElementById('settings-lawyer-name').value = settings.lawyerName || 'Adv. Vaibhav Sharma';
  document.getElementById('settings-currency').value = settings.currency || 'INR';
  updateBrandingHeaders();

  if (typeof adminModule !== 'undefined' && adminModule.updateAdminVisibility) {
    adminModule.updateAdminVisibility();
  }
}

export function updateBrandingHeaders() {
  const settings = db.getSettings();
  const brandName = document.querySelector('.brand-name');
  const lawyerName = document.querySelector('.lawyer-name');
  const avatar = document.querySelector('.lawyer-avatar');

  if (brandName) brandName.textContent = settings.firmName || 'Track My Chambers';
  if (lawyerName) lawyerName.textContent = settings.lawyerName || 'Adv. Vaibhav Sharma';
  
  if (avatar && settings.lawyerName) {
    const initials = settings.lawyerName.split(' ')
      .filter(n => n.length > 0 && !n.toLowerCase().includes('adv'))
      .map(n => n[0].toUpperCase())
      .join('')
      .slice(0, 2);
    avatar.textContent = initials || 'VS';
  }
}

// Global modal closer helper
export function initModals() {
  const overlays = document.querySelectorAll('.modal-overlay');
  
  overlays.forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      // Don't allow closing auth-modal by clicking backdrop
      if (overlay.id === 'auth-modal') return;

      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });

    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn && overlay.id !== 'auth-modal') {
      closeBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
      });
    }

    const cancelBtn = overlay.querySelector('button[id$="-cancel"], button[id$="-close-btn"]');
    if (cancelBtn && overlay.id !== 'auth-modal') {
      cancelBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
      });
    }
  });
}

async function updateDbStatusBadge() {
  const badge = document.getElementById('auth-db-status-badge');
  if (!badge) return;
  
  badge.innerHTML = `<span style="background-color: var(--border-color); color: var(--text-secondary); padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">Checking connection...</span>`;
  
  try {
    const status = await fetch('/api/status').then(r => r.json());
    if (status.dbType === 'mongodb') {
      badge.innerHTML = `<span style="background-color: var(--color-success); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="database" style="width: 10px; height: 10px;"></i> Cloud DB Connected</span>`;
    } else if (status.dbType === 'fallback-error') {
      badge.innerHTML = `<span style="background-color: var(--color-danger); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" title="MongoDB URI is configured but connection failed. Fallback storage is active (Temporary)."><i data-lucide="alert-triangle" style="width: 10px; height: 10px;"></i> Cloud DB Error (Temporary Storage Active)</span>`;
    } else {
      badge.innerHTML = `<span style="background-color: #f59e0b; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" title="No MongoDB cloud database configured. Local filesystem storage is active."><i data-lucide="file-text" style="width: 10px; height: 10px;"></i> Local Mode (Temporary Storage)</span>`;
    }
    safeCreateIcons();
  } catch (err) {
    badge.innerHTML = `<span style="background-color: var(--color-danger); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="alert-triangle" style="width: 10px; height: 10px;"></i> Connection Failed</span>`;
    safeCreateIcons();
  }
}

function showAuthView(viewName) {
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const signupOtpForm = document.getElementById('auth-signup-otp-form');
  const forgotForm = document.getElementById('auth-forgot-form');
  const resetForm = document.getElementById('auth-reset-form');
  const modalTitle = document.getElementById('auth-modal-title');

  if (loginForm) loginForm.style.display = viewName === 'login' ? 'block' : 'none';
  if (signupForm) signupForm.style.display = viewName === 'signup' ? 'block' : 'none';
  if (signupOtpForm) signupOtpForm.style.display = viewName === 'otp' ? 'block' : 'none';
  if (forgotForm) forgotForm.style.display = viewName === 'forgot' ? 'block' : 'none';
  if (resetForm) resetForm.style.display = viewName === 'reset' ? 'block' : 'none';

  // Clear inputs error state
  const inputs = document.querySelectorAll('#auth-page .form-control');
  inputs.forEach(i => i.classList.remove('auth-input-error'));
  const errorContainers = document.querySelectorAll('#auth-page [id$="-error"]');
  errorContainers.forEach(c => {
    c.style.display = 'none';
    c.innerHTML = '';
  });

  if (modalTitle) {
    if (viewName === 'login') modalTitle.textContent = 'Login to Chambers';
    else if (viewName === 'signup') modalTitle.textContent = 'Register Chamber';
    else if (viewName === 'otp') modalTitle.textContent = 'Verify Email OTP';
    else if (viewName === 'forgot') modalTitle.textContent = 'Forgot Password';
    else if (viewName === 'reset') modalTitle.textContent = 'Reset Password';
  }
}

let appInitialized = false;

async function router() {
  const path = window.location.pathname;
  console.log("Routing to path:", path);

  const marketingNav = document.getElementById('marketing-nav');
  const marketingPage = document.getElementById('marketing-page');
  const authPage = document.getElementById('auth-page');
  const dashboardApp = document.getElementById('dashboard-app-container');
  const privacyPage = document.getElementById('privacy-page');
  const termsPage = document.getElementById('terms-page');
  const featuresPage = document.getElementById('features-page');
  const aboutPage = document.getElementById('about-page');
  const pricingPage = document.getElementById('pricing-page-standalone');

  // Hide everything first
  if (marketingNav) marketingNav.style.display = 'none';
  if (marketingPage) marketingPage.style.display = 'none';
  if (authPage) authPage.style.display = 'none';
  if (dashboardApp) dashboardApp.style.display = 'none';
  if (privacyPage) privacyPage.style.display = 'none';
  if (termsPage) termsPage.style.display = 'none';
  if (featuresPage) featuresPage.style.display = 'none';
  if (aboutPage) aboutPage.style.display = 'none';
  if (pricingPage) pricingPage.style.display = 'none';
  document.body.classList.remove('app-active');

  const publicRoutes = ['/', '/index.html', '/privacy', '/terms', '/login', '/register', '/features', '/about', '/pricing'];
  const isPublicRoute = publicRoutes.includes(path);

  // If on index.html (!dashboardApp) and trying to access an app route, redirect to app.html via browser location
  if (!dashboardApp && !isPublicRoute) {
    console.log("Navigating from index.html to app workspace route:", path);
    window.location.href = path;
    return;
  }

  // If on app.html (dashboardApp exists) and trying to access a marketing or auth route, redirect to index.html
  if (dashboardApp && isPublicRoute && path !== '/dashboard' && !path.startsWith('/portal')) {
    console.log("Navigating from app.html workspace to public route:", path);
    window.location.href = path;
    return;
  }

  if (isPublicRoute) {
    if (marketingNav) marketingNav.style.display = 'flex';

    if (path === '/' || path === '/index.html') {
      if (marketingPage) marketingPage.style.display = 'block';
    } else if (path === '/privacy') {
      if (privacyPage) privacyPage.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (path === '/terms') {
      if (termsPage) termsPage.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (path === '/features') {
      if (featuresPage) featuresPage.style.display = 'block';
      if (marketingPage) marketingPage.style.display = 'block';
      setTimeout(() => {
        const targetSection = document.getElementById('features') || document.getElementById('features-page');
        if (targetSection) {
          const headerOffset = 70;
          const elementPosition = targetSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({ top: Math.max(0, offsetPosition), behavior: 'smooth' });
        }
      }, 50);
    } else if (path === '/about') {
      if (aboutPage) aboutPage.style.display = 'block';
      if (marketingPage) marketingPage.style.display = 'block';
      setTimeout(() => {
        const targetSection = document.getElementById('about-page') || document.getElementById('about');
        if (targetSection) {
          const headerOffset = 70;
          const elementPosition = targetSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({ top: Math.max(0, offsetPosition), behavior: 'smooth' });
        }
      }, 50);
    } else if (path === '/pricing') {
      if (pricingPage) pricingPage.style.display = 'block';
      if (marketingPage) marketingPage.style.display = 'block';
      setTimeout(() => {
        const targetSection = document.getElementById('pricing') || document.getElementById('pricing-page-standalone');
        if (targetSection) {
          const headerOffset = 70;
          const elementPosition = targetSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({ top: Math.max(0, offsetPosition), behavior: 'smooth' });
        }
      }, 50);
    } else if (path === '/login' || path === '/register') {
      if (marketingPage) marketingPage.style.display = 'block'; // Keep background page intact under modal
      if (authPage) {
        authPage.style.display = 'flex';
        const targetView = (path === '/login') ? 'login' : 'signup';
        showAuthView(targetView);
        updateDbStatusBadge();
        setTimeout(() => {
          const emailInput = document.getElementById(targetView === 'login' ? 'auth-login-email' : 'auth-signup-email');
          if (emailInput) emailInput.focus();
        }, 50);
      }
    }
    safeCreateIcons();
    return; // 0ms instant display for all public routes!
  }

  // Check auth for protected app routes
  let isAuthenticated = false;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('test_auth') || window.isTestAuth) {
      isAuthenticated = true;
      window.isTestAuth = true;
    } else if (path.startsWith('/portal') || path.startsWith('/portal-page')) {
      isAuthenticated = false;
    } else {
      isAuthenticated = await db.loadAll();
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }

  if (path.startsWith('/portal') || path.startsWith('/portal-page')) {
    if (dashboardApp) {
      dashboardApp.style.display = '';
      document.body.classList.add('app-active');
      
      const sidebar = document.querySelector('.app-sidebar');
      if (sidebar) sidebar.style.display = 'none';
      const header = document.querySelector('.app-header');
      if (header) header.style.display = 'none';

      const mainCanvas = document.querySelector('.app-main');
      if (mainCanvas) {
        mainCanvas.style.width = '100%';
        mainCanvas.style.height = '100vh';
        mainCanvas.style.overflowY = 'auto';
      }

      getPageContainers().forEach(container => {
        if (container.id === 'portal-page') {
          container.classList.add('active');
          container.style.display = 'block';
        } else {
          container.classList.remove('active');
          container.style.display = 'none';
        }
      });
      portalModule.render();
    }
  } else {
    if (!isAuthenticated) {
      window.history.pushState({}, '', '/login');
      router();
    } else {
      if (dashboardApp) {
        dashboardApp.style.display = '';
        document.body.classList.add('app-active');
        
        const sidebar = document.querySelector('.app-sidebar');
        if (sidebar) sidebar.style.display = '';
        const header = document.querySelector('.app-header');
        if (header) header.style.display = '';
        
        // Initialize dashboard modules once
        if (!appInitialized) {
          initTheme();
          updateBrandingHeaders();
          dashboard.init();
          clients.init();
          cases.init();
          diary.init();
          accounts.init();
          share.init();
          tasks.init();
          notificationsModule.init();
          if (typeof adminModule !== 'undefined' && adminModule.init) adminModule.init();
          appInitialized = true;
        }

        setupMobileOverviewPage();

        // Determine view from path (supports both short /view and long /view-page formats)
        let targetView = 'dashboard-page';
        if (path.startsWith('/overview-page') || path.startsWith('/overview')) targetView = 'overview-page';
        else if (path.startsWith('/clients-page') || path.startsWith('/clients')) targetView = 'clients-page';
        else if (path.startsWith('/cases-page') || path.startsWith('/cases')) targetView = 'cases-page';
        else if (path.startsWith('/diary-page') || path.startsWith('/diary')) targetView = 'diary-page';
        else if (path.startsWith('/accounts-page') || path.startsWith('/accounts')) targetView = 'accounts-page';
        else if (path.startsWith('/share-page') || path.startsWith('/share')) targetView = 'share-page';
        else if (path.startsWith('/tasks-page') || path.startsWith('/tasks')) targetView = 'tasks-page';
        else if (path.startsWith('/settings-page') || path.startsWith('/settings')) targetView = 'settings-page';
        
        await switchView(targetView);
      }
    }
  }
}

function initPasswordToggleHandlers() {
  const toggles = document.querySelectorAll('.password-toggle-btn, .btn-toggle-password-view');
  toggles.forEach(btn => {
    // Remove previous listeners if any to prevent duplicate fires
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = newBtn.getAttribute('data-toggle-target') || newBtn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const icon = newBtn.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
          icon.setAttribute('data-lucide', 'eye-off');
          safeCreateIcons();
        }
      } else {
        input.type = 'password';
        if (icon) {
          icon.setAttribute('data-lucide', 'eye');
          safeCreateIcons();
        }
      }
    });
  });
}

let pendingSignupState = null;
let otpTimerInterval = null;

function startOtpTimer(seconds = 900) {
  if (otpTimerInterval) clearInterval(otpTimerInterval);
  const countEl = document.getElementById('auth-otp-timer-count');
  let remaining = seconds;

  otpTimerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(otpTimerInterval);
      if (countEl) countEl.textContent = 'Expired';
      return;
    }
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');
    if (countEl) countEl.textContent = `${m}:${s}`;
  }, 1000);
}

function initAuthenticationHandlers() {
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const signupOtpForm = document.getElementById('auth-signup-otp-form');
  
  const loginEmail = document.getElementById('auth-login-email');
  const loginPass = document.getElementById('auth-login-password');
  const loginError = document.getElementById('auth-login-error');
  
  const signupEmail = document.getElementById('auth-signup-email');
  const signupPass = document.getElementById('auth-signup-password');
  const signupFirm = document.getElementById('auth-signup-firm');
  const signupLawyer = document.getElementById('auth-signup-lawyer');
  const signupError = document.getElementById('auth-signup-error');

  const otpInput = document.getElementById('auth-signup-otp-input');
  const otpError = document.getElementById('auth-signup-otp-error');
  const otpBanner = document.getElementById('auth-signup-otp-banner');
  const resendOtpBtn = document.getElementById('auth-resend-otp-btn');
  
  const switchToSignup = document.getElementById('auth-switch-to-signup');
  const switchToLogin = document.getElementById('auth-switch-to-login');

  const forgotForm = document.getElementById('auth-forgot-form');
  const resetForm = document.getElementById('auth-reset-form');

  const forgotEmail = document.getElementById('auth-forgot-email');
  const forgotError = document.getElementById('auth-forgot-error');
  const forgotSuccessBanner = document.getElementById('auth-forgot-success-banner');
  const forgotSubmitBtn = document.getElementById('auth-forgot-submit-btn');
  const forgotGoResetBtn = document.getElementById('auth-forgot-go-reset-btn');

  const resetEmail = document.getElementById('auth-reset-email');
  const resetCode = document.getElementById('auth-reset-code');
  const resetPass = document.getElementById('auth-reset-password');
  const resetError = document.getElementById('auth-reset-error');

  const switchToForgot = document.getElementById('auth-switch-to-forgot');
  const backToLoginLinks = document.querySelectorAll('.auth-back-to-login');

  // Check URL params for logout notice
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('logout')) {
    loginError.style.background = 'rgba(16, 185, 129, 0.15)';
    loginError.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    loginError.style.color = '#34d399';
    loginError.innerHTML = `<i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> You have been logged out successfully.`;
    loginError.style.display = 'flex';
    safeCreateIcons();
  }

  // Toggle views using URL states
  switchToSignup.addEventListener('click', (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/register');
    router();
  });

  switchToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/login');
    router();
  });

  switchToForgot.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthView('forgot');
  });

  backToLoginLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.history.pushState({}, '', '/login');
      router();
    });
  });

  forgotGoResetBtn.addEventListener('click', () => {
    showAuthView('reset');
    resetEmail.value = forgotEmail.value;
  });

  // Form submits
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    loginError.innerHTML = '';
    loginError.style.background = '';
    loginEmail.classList.remove('auth-input-error');
    loginPass.classList.remove('auth-input-error');

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="spin-animation" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Signing In...`;
      safeCreateIcons();

      const resData = await api.auth.login(loginEmail.value, loginPass.value);
      loginForm.reset();
      
      if (resData) {
        try {
          sessionStorage.setItem('bootstrap_preload', JSON.stringify(resData));
        } catch (e) {}
      }
      
      window.location.replace('/dashboard');
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      
      loginEmail.classList.add('auth-input-error');
      loginPass.classList.add('auth-input-error');
      
      loginError.style.background = '';
      loginError.style.borderColor = '';
      loginError.style.color = 'var(--color-danger)';
      loginError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Invalid credentials."}`;
      loginError.style.display = 'flex';
      safeCreateIcons();
    }
  });

  // Signup form submit: Send OTP
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupError.style.display = 'none';
    signupError.innerHTML = '';
    
    const inputs = signupForm.querySelectorAll('.form-control');
    inputs.forEach(i => i.classList.remove('auth-input-error'));

    const submitBtn = signupForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="spin-animation" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Sending Verification OTP...`;
      safeCreateIcons();

      pendingSignupState = {
        email: signupEmail.value.trim(),
        password: signupPass.value,
        firmName: signupFirm.value.trim(),
        lawyerName: signupLawyer.value.trim()
      };

      const res = await api.auth.sendSignupOTP(
        pendingSignupState.email,
        pendingSignupState.password,
        pendingSignupState.firmName,
        pendingSignupState.lawyerName
      );

      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;

      showAuthView('otp');
      startOtpTimer(900); // 15 mins

      if (res && res.code) {
        otpBanner.innerHTML = `
          <strong>Testing Fallback Mode:</strong> Resend email dispatch notice: ${res.emailError || 'Testing environment'}.<br>
          For testing, your 6-digit OTP code is: <strong style="font-size: 1.1rem; color: var(--color-primary);">${res.code}</strong>
        `;
        otpBanner.style.display = 'block';
      } else {
        otpBanner.style.display = 'none';
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      
      inputs.forEach(i => i.classList.add('auth-input-error'));
      signupError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Registration failed."}`;
      signupError.style.display = 'flex';
      safeCreateIcons();
    }
  });

  // Verify Signup OTP Form Submit
  signupOtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    otpError.style.display = 'none';
    otpError.innerHTML = '';

    const submitBtn = signupOtpForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="spin-animation" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Verifying OTP...`;
      safeCreateIcons();

      if (!pendingSignupState || !pendingSignupState.email) {
        throw new Error("Registration session lost. Please fill out the signup form again.");
      }

      await api.auth.verifySignupOTP(pendingSignupState.email, otpInput.value);

      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      signupForm.reset();
      signupOtpForm.reset();
      
      window.history.pushState({}, '', '/dashboard');
      await router();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      otpError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Verification failed."}`;
      otpError.style.display = 'flex';
      safeCreateIcons();
    }
  });

  // Resend OTP button
  resendOtpBtn.addEventListener('click', async () => {
    if (!pendingSignupState || !pendingSignupState.email) return;
    try {
      resendOtpBtn.disabled = true;
      resendOtpBtn.textContent = 'Sending...';

      const res = await api.auth.sendSignupOTP(
        pendingSignupState.email,
        pendingSignupState.password,
        pendingSignupState.firmName,
        pendingSignupState.lawyerName
      );

      resendOtpBtn.disabled = false;
      resendOtpBtn.textContent = 'Resend OTP';
      startOtpTimer(900);

      if (res && res.code) {
        otpBanner.innerHTML = `
          <strong>Testing Fallback Mode:</strong> Fresh OTP generated: <strong style="font-size: 1.1rem; color: var(--color-primary);">${res.code}</strong>
        `;
        otpBanner.style.display = 'block';
      }
    } catch (err) {
      resendOtpBtn.disabled = false;
      resendOtpBtn.textContent = 'Resend OTP';
      alert("Failed to resend OTP: " + err.message);
    }
  });

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    forgotError.style.display = 'none';
    forgotError.innerHTML = '';
    forgotEmail.classList.remove('auth-input-error');
    forgotSuccessBanner.style.display = 'none';

    const submitBtn = forgotForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="spin-animation" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Sending Code...`;
      safeCreateIcons();

      const res = await api.auth.forgotPassword(forgotEmail.value);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;

      if (res && res.success) {
        forgotSuccessBanner.innerHTML = `
          <strong style="color: var(--color-success); display: flex; align-items: center; gap: 4px; margin-bottom: 0.25rem;">
            <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> ${res.code ? 'Recovery Code Generated' : 'Recovery Code Sent'}
          </strong>
          ${res.code ? 'Email dispatch notice: ' + (res.emailError || 'Resend testing mode') + '<br>Check your inbox or use the recovery code below:' : 'A 6-digit recovery code has been sent to your email address. Please check your inbox (and spam folder).'}
          ${res.code ? `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.08);">Local Testing Code: <strong style="font-size: 1.1rem; color: var(--color-primary);">${res.code}</strong></div>` : ''}
        `;
        forgotSuccessBanner.style.display = 'block';
        forgotSubmitBtn.style.display = 'none';
        forgotGoResetBtn.style.display = 'block';
        safeCreateIcons();
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      forgotEmail.classList.add('auth-input-error');
      forgotError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Request failed."}`;
      forgotError.style.display = 'flex';
      safeCreateIcons();
    }
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    resetError.style.display = 'none';
    resetError.innerHTML = '';

    const inputs = resetForm.querySelectorAll('.form-control');
    inputs.forEach(i => i.classList.remove('auth-input-error'));

    const submitBtn = resetForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="spin-animation" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Updating Password...`;
      safeCreateIcons();

      await api.auth.resetPassword(resetEmail.value, resetCode.value, resetPass.value);
      alert("Password updated successfully! Please login with your new credentials.");
      window.history.pushState({}, '', '/login');
      router();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      inputs.forEach(i => i.classList.add('auth-input-error'));
      resetError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Reset failed. Verify email and code."}`;
      resetError.style.display = 'flex';
      safeCreateIcons();
    }
  });

  // Logout trigger
  const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', async () => {
      if (confirm("Are you sure you want to log out of your chamber account?")) {
        try {
          await api.auth.logout();
        } catch (err) {
          console.error("Logout failed:", err);
        }
        
        // Close event source connection
        if (window.tasksEventSource) {
          window.tasksEventSource.close();
          window.tasksEventSource = null;
        }

        // Reset global test flags and local storage
        window.isTestAuth = false;
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {}

        // Clear cookie manually for extra guardrail
        document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

        // Clear database cache completely
        db.clearCache();
        
        // Reset initialization flag so modules rebinding triggers on next login
        appInitialized = false;

        window.history.pushState({}, '', '/login?logout=1');
        await router();
      }
    });
  }
}

function initGlobalSearch() {
  const searchInput = document.getElementById('global-search-input');
  const searchResults = document.getElementById('global-search-results');
  if (!searchInput || !searchResults) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      searchResults.style.display = 'none';
      searchResults.innerHTML = '';
      return;
    }

    const cases = db.getCases();
    const clients = db.getClients();

    // Filter cases
    const matchingCases = cases.filter(c => 
      c.title.toLowerCase().includes(query) || 
      (c.caseNumber && c.caseNumber.toLowerCase().includes(query)) ||
      (c.cnrNumber && c.cnrNumber.toLowerCase().includes(query))
    );

    // Filter clients
    const matchingClients = clients.filter(cl => 
      cl.name.toLowerCase().includes(query) || 
      (cl.phone && cl.phone.toLowerCase().includes(query)) ||
      (cl.email && cl.email.toLowerCase().includes(query))
    );

    if (matchingCases.length === 0 && matchingClients.length === 0) {
      searchResults.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No matches found.</div>`;
      searchResults.style.display = 'block';
      return;
    }

    searchResults.innerHTML = '';
    
    // Render cases
    if (matchingCases.length > 0) {
      const header = document.createElement('div');
      header.style.padding = '0.5rem 1rem; font-size: 0.7rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-color);';
      header.textContent = 'Cases';
      searchResults.appendChild(header);

      matchingCases.slice(0, 5).forEach(c => {
        const item = document.createElement('div');
        item.style.padding = '0.6rem 1rem; cursor: pointer; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 2px; transition: background 0.15s;';
        item.innerHTML = `
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${c.title}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${c.caseNumber || 'No case number'} ${c.cnrNumber ? '• CNR: ' + c.cnrNumber : ''}</div>
        `;
        item.addEventListener('click', async () => {
          searchInput.value = '';
          searchResults.style.display = 'none';
          window.history.pushState({}, '', '/cases-page');
          await router();
          
          setTimeout(() => {
            const row = document.querySelector(`[data-case-id="${c.id}"]`);
            if (row) {
              row.click();
            }
          }, 100);
        });
        item.addEventListener('mouseover', () => item.style.background = 'rgba(217, 119, 6, 0.06)');
        item.addEventListener('mouseout', () => item.style.background = 'transparent');
        searchResults.appendChild(item);
      });
    }

    // Render clients
    if (matchingClients.length > 0) {
      const header = document.createElement('div');
      header.style.padding = '0.5rem 1rem; font-size: 0.7rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-color); margin-top: 0.5rem;';
      header.textContent = 'Clients';
      searchResults.appendChild(header);

      matchingClients.slice(0, 5).forEach(cl => {
        const item = document.createElement('div');
        item.style.padding = '0.6rem 1rem; cursor: pointer; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 2px; transition: background 0.15s;';
        item.innerHTML = `
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${cl.name}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${cl.phone || 'No phone'} • ${cl.email || 'No email'}</div>
        `;
        item.addEventListener('click', async () => {
          searchInput.value = '';
          searchResults.style.display = 'none';
          window.history.pushState({}, '', '/clients-page');
          await router();
          
          setTimeout(() => {
            const row = document.querySelector(`[data-client-id="${cl.id}"]`);
            if (row) {
              row.click();
            }
          }, 100);
        });
        item.addEventListener('mouseover', () => item.style.background = 'rgba(217, 119, 6, 0.06)');
        item.addEventListener('mouseout', () => item.style.background = 'transparent');
        searchResults.appendChild(item);
      });
    }

    searchResults.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
}

/**
 * App Initializer
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Icons
  lucide.createIcons();

  // 2. Initialize common modal click behaviors
  initModals();

  // 3. Setup routing events for sidebar items (HTML5 history)
  getSidebarMenuItems().forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      window.history.pushState({}, '', '/' + target);
      await router();
    });
  });

  // 3b. Setup routing events for mobile bottom navigation bar items
  document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      if (item.id === 'mobile-nav-more-btn') {
        const sidebar = document.querySelector('.app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (sidebar && backdrop) {
          sidebar.classList.toggle('open');
          backdrop.classList.toggle('active');
        }
        return;
      }

      const target = item.getAttribute('data-target');
      if (target) {
        window.history.pushState({}, '', '/' + target);
        await router();
      }
    });
  });

  // 3c. Setup exit impersonation button listener
  const exitImpersonationBtn = document.getElementById('btn-exit-impersonation');
  if (exitImpersonationBtn) {
    exitImpersonationBtn.addEventListener('click', () => {
      const banner = document.getElementById('superadmin-impersonation-banner');
      if (banner) banner.style.display = 'none';
      if (localStorage.getItem('adminSessionBackup')) {
        localStorage.removeItem('adminSessionBackup');
      }
      window.history.pushState({}, '', '/superadmin-page');
      router();
    });
  }

  // Global click interceptor for client-side routing (Features, About, Pricing, FAQs, Privacy, Terms)
  document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[data-link]');
    if (link) {
      e.preventDefault();
      const targetPath = link.getAttribute('data-link');
      window.history.pushState({}, '', targetPath);
      await router();
    }
  });

  // 4. Setup quick action button click
  if (headerQuickActionBtn) {
    headerQuickActionBtn.addEventListener('click', () => {
      const config = viewQuickActions[state.activeView];
      if (config && config.action) {
        config.action();
      }
    });
  }

  // 4b. Setup mobile & desktop sidebar drawer toggle & close (Global Delegation)
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('#btn-sidebar-toggle, .menu-toggle-btn');
    const closeBtn = e.target.closest('#btn-sidebar-close, .sidebar-close-btn');
    const container = document.getElementById('dashboard-app-container') || document.querySelector('.app-container');
    const sidebar = document.querySelector('.app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (toggleBtn) {
      e.stopPropagation();
      if (window.innerWidth <= 900) {
        if (sidebar) sidebar.classList.toggle('open');
        if (backdrop) backdrop.classList.toggle('active');
      } else {
        if (container) container.classList.toggle('sidebar-collapsed');
      }
    } else if (closeBtn) {
      e.stopPropagation();
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
      if (container) container.classList.remove('sidebar-collapsed');
    }
  });

  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      const sidebar = document.querySelector('.app-sidebar');
      if (sidebar) sidebar.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }

  // 5. Sidebar data backup trigger
  const backupBtn = getSidebarBackupBtn();
  if (backupBtn) {
    backupBtn.addEventListener('click', () => {
      db.exportBackup();
    });
  }

  // Sidebar logout trigger
  const logoutBtn = getSidebarLogoutBtn();
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        if (typeof api !== 'undefined' && api.auth && typeof api.auth.logout === 'function') {
          await api.auth.logout();
        }
      } catch (e) {}
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login';
    });
  }

  // Sidebar refresh trigger
  const sidebarRefreshBtn = document.getElementById('sidebar-refresh-btn');
  if (sidebarRefreshBtn) {
    sidebarRefreshBtn.addEventListener('click', async () => {
      const icon = sidebarRefreshBtn.querySelector('i');
      if (icon) icon.classList.add('spin-animation');
      sidebarRefreshBtn.disabled = true;

      try {
        const authOk = await db.loadAll(true);
        if (authOk) {
          await switchView(state.activeView);
          updateBrandingHeaders();
        } else {
          location.reload();
        }
      } catch (err) {
        console.error("Refresh failed:", err);
      } finally {
        if (icon) icon.classList.remove('spin-animation');
        sidebarRefreshBtn.disabled = false;
      }
    });
  }

  // 6. Dashboard links
  const viewDiaryLink = document.getElementById('dashboard-view-diary-link');
  if (viewDiaryLink) {
    viewDiaryLink.addEventListener('click', async (e) => {
      e.preventDefault();
      window.history.pushState({}, '', '/diary-page');
      await router();
    });
  }

  const viewAccountsLink = document.getElementById('dashboard-view-accounts-link');
  if (viewAccountsLink) {
    viewAccountsLink.addEventListener('click', async (e) => {
      e.preventDefault();
      window.history.pushState({}, '', '/accounts-page');
      await router();
    });
  }

  const emptyOnboardBtn = document.getElementById('dashboard-empty-onboard-btn');
  if (emptyOnboardBtn) {
    emptyOnboardBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      window.history.pushState({}, '', '/clients-page');
      await router();
      clients.resetWizard();
    });
  }

  // 7. Settings form save
  const profileForm = document.getElementById('settings-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const firmName = document.getElementById('settings-firm-name')?.value;
      const lawyerName = document.getElementById('settings-lawyer-name')?.value;
      const currency = document.getElementById('settings-currency')?.value;
      
      await db.updateSettings({ firmName, lawyerName, currency });
      updateBrandingHeaders();
      alert("Practice settings updated successfully.");
    });
  }

  // 8. Reset database button with guardrail
  const resetConfirmInput = document.getElementById('settings-reset-confirm-input');
  const resetDatabaseBtn = document.getElementById('settings-reset-database-btn');

  if (resetConfirmInput && resetDatabaseBtn) {
    resetConfirmInput.addEventListener('input', (e) => {
      if (e.target.value === 'DELETE') {
        resetDatabaseBtn.disabled = false;
      } else {
        resetDatabaseBtn.disabled = true;
      }
    });

    resetDatabaseBtn.addEventListener('click', async () => {
      if (resetConfirmInput.value !== 'DELETE') return;
      if (confirm("Are you absolutely sure you want to restore the practice manager database? All custom cases and client logs will be permanently deleted!")) {
        await db.resetDB();
        alert("Database reset to empty state.");
        location.reload();
      }
    });
  }

  // 9. Backup Import Actions
  const backupFileInput = document.getElementById('settings-backup-file-input');
  const backupFilenameSpan = document.getElementById('selected-backup-filename');
  const backupImportBtn = document.getElementById('settings-backup-import-btn');
  const backupExportBtn = document.getElementById('settings-backup-export-btn');

  if (backupExportBtn) {
    backupExportBtn.addEventListener('click', () => {
      db.exportBackup();
    });
  }

  if (backupFileInput && backupFilenameSpan && backupImportBtn) {
    backupFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        backupFilenameSpan.textContent = file.name;
        backupImportBtn.disabled = false;
      } else {
        backupFilenameSpan.textContent = "No file selected";
        backupImportBtn.disabled = true;
      }
    });

    backupImportBtn.addEventListener('click', () => {
      const file = backupFileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function(e) {
        const result = await db.importBackup(e.target.result);
        if (result.success) {
          alert("Database restored successfully!");
          location.reload();
        } else {
          alert("Error restoring backup: " + result.error);
        }
      };
      reader.readAsText(file);
    });
  }

  const launchSuperAdminBtn = document.getElementById('btn-settings-launch-superadmin');
  if (launchSuperAdminBtn) {
    launchSuperAdminBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      window.history.pushState({}, '', '/superadmin-page');
      await router();
    });
  }

  // 10. Init Auth Event Handlers & password eye toggles & global search & features switcher
  initAuthenticationHandlers();
  initPasswordToggleHandlers();
  initGlobalSearch();
  initFeaturesTabs();
  initChangePasswordHandler();
 
  // Test hook to clear DB for visual empty state testing
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('reset_test')) {
    const authOk = await db.loadAll();
    if (authOk) {
      await db.resetDB();
      window.history.replaceState({}, '', '/dashboard');
    }
  }
 
  // 11. Run router to handle initial page load route
  await router();
});

/**
 * Interactive Features Tab Switcher
 */
function initFeaturesTabs() {
  const tabsList = document.querySelectorAll('.feature-tab-btn');
  if (tabsList.length === 0) return;

  const dataMockups = {
    cases: {
      title: "Case Tracking & Registry",
      desc: "Maintain complete litigation details, historical hearing logs, registry stages, and docket histories. Chambers stores active briefs, CNR number tracking, court benches, opposition party advocate details, and next scheduled listing dates securely in a single, unified view.",
      link: "/dashboard?view=cases",
      btnText: "Open Registry",
      highlights: [
        { icon: "shield", title: "Automated CNR Sync", desc: "Live tracking of orders and scheduled dates." },
        { icon: "folder-open", title: "Document Vault", desc: "Attach petitions, briefs, and judgements securely." },
        { icon: "user-check", title: "Opposition Log", desc: "Quick access to opponent details and judges directory." }
      ],
      html: `
        <div style="width: 100%; font-family: sans-serif; display: flex; gap: 2rem; flex-wrap: wrap; text-align: left;">
          <!-- Left Side: Case Registry Table -->
          <div style="flex: 1.2; min-width: 260px; display: flex; flex-direction: column; justify-content: center;">
            <div style="font-weight: 700; color: #fff; margin-bottom: 0.75rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem;">Active Cases</div>
            <div style="font-size: 0.75rem; color: #fff;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-weight: 600; color: #94a3b8;">
                <span>Case Title</span><span>Status</span><span>Next Listed</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                <span>Apex Corp vs. Zenith Ltd</span>
                <span style="background: rgba(16, 185, 129, 0.12); color: #10b981; padding: 1px 5px; border-radius: 3px; font-size: 0.65rem; font-weight: 600;">ACTIVE</span>
                <span>15 Aug 2026</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                <span>State of Rajasthan vs. Verma</span>
                <span style="background: rgba(16, 185, 129, 0.12); color: #10b981; padding: 1px 5px; border-radius: 3px; font-size: 0.65rem; font-weight: 600;">ACTIVE</span>
                <span>22 Aug 2026</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0;">
                <span>M/S Builders vs. Municipal Corp</span>
                <span style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; padding: 1px 5px; border-radius: 3px; font-size: 0.65rem; font-weight: 600;">PENDING</span>
                <span>10 Sep 2026</span>
              </div>
            </div>
          </div>

          <!-- Right Side: Niche & Revenue Analytics Graph -->
          <div style="flex: 1; min-width: 240px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem;">
            <div style="font-weight: 700; color: #fff; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
              <i data-lucide="pie-chart" style="width: 14px; height: 14px; color: #d97706;"></i> Niche & Revenue Share
            </div>
            <!-- Niche 1 -->
            <div style="font-size: 0.7rem; color: #94a3b8;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span style="color: #fff; font-weight: 600;">Corporate Litigation</span>
                <span style="color: #d97706; font-weight: 600;">₹4,50,000 (55%)</span>
              </div>
              <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="background: #d97706; width: 55%; height: 100%; border-radius: 3px; box-shadow: 0 0 8px rgba(217,119,6,0.35);"></div>
              </div>
            </div>
            <!-- Niche 2 -->
            <div style="font-size: 0.7rem; color: #94a3b8;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span style="color: #fff; font-weight: 600;">Civil Property Disputes</span>
                <span style="color: #3b82f6; font-weight: 600;">₹2,10,000 (26%)</span>
              </div>
              <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="background: #3b82f6; width: 26%; height: 100%; border-radius: 3px; box-shadow: 0 0 8px rgba(59,130,246,0.35);"></div>
              </div>
            </div>
            <!-- Niche 3 -->
            <div style="font-size: 0.7rem; color: #94a3b8;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span style="color: #fff; font-weight: 600;">Criminal Defense</span>
                <span style="color: #10b981; font-weight: 600;">₹1,20,000 (15%)</span>
              </div>
              <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="background: #10b981; width: 15%; height: 100%; border-radius: 3px; box-shadow: 0 0 8px rgba(16,185,129,0.35);"></div>
              </div>
            </div>
          </div>
        </div>
      `
    },
    diary: {
      title: "Daily Diary & Listings",
      desc: "Automatically generate daily diaries containing active listings for the day. Filter chambers court boards dynamically, check next scheduled dates, and receive prompt visual alerts for any active litigation matter that is currently missing a next hearing date.",
      link: "/dashboard?view=diary",
      btnText: "Go to Calendar",
      highlights: [
        { icon: "calendar", title: "Auto Listing Boards", desc: "Sync court board listings dynamically each morning." },
        { icon: "bell", title: "Alerts & Reminders", desc: "Flag case matters currently missing next dates." },
        { icon: "users", title: "Chamber Sync", desc: "Share calendars with junior advocates & clerks instantly." }
      ],
      html: `
        <div style="width: 100%; display: flex; gap: 1.5rem; align-items: center; justify-content: center; flex-wrap: wrap;">
          <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 0.6rem; font-size: 0.6rem; width: 110px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-weight: 600; color: #fff;">
              <span>August 2026</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; color: #fff;">
              <span style="opacity: 0.3;">28</span><span style="opacity: 0.3;">29</span><span>1</span><span>2</span><span>3</span><span style="background:#d97706; border-radius: 2px; color:#fff; font-weight:700; padding:1px;">4</span><span>5</span>
            </div>
          </div>
          <div style="flex: 1; min-width: 150px; font-family: sans-serif; font-size: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem;">
            <div style="font-weight: 600; color: #94a3b8; margin-bottom: 0.25rem;">Board Listings (Aug 4)</div>
            <div style="background: rgba(255,255,255,0.02); border-left: 2.5px solid #d97706; padding: 6px; border-radius: 3px;">
              <strong>Item #12:</strong> Apex Corp vs. Zenith - <em>SC (Court 3)</em>
            </div>
            <div style="background: rgba(255,255,255,0.02); border-left: 2.5px solid #94a3b8; padding: 6px; border-radius: 3px;">
              <strong>Item #25:</strong> Verma vs. State - <em>HC (Court 8)</em>
            </div>
          </div>
        </div>
      `
    },
    clients: {
      title: "Client Onboarding Wizard",
      desc: "Streamline advocate chamber intakes using a structured step-by-step onboarding wizard. Record new client profiles, assign customizable professional retainer billing, and concurrently log initial briefs in minutes to avoid separate registry paperwork.",
      link: "/dashboard?view=clients",
      btnText: "Onboard Client",
      highlights: [
        { icon: "user-plus", title: "Structured Intake", desc: "Log case histories and client profiles seamlessly." },
        { icon: "credit-card", title: "Retainer Schedules", desc: "Configure advanced fee structures and milestones." },
        { icon: "file-check", title: "KYC Compliance", desc: "Validate contact records and identity documents." }
      ],
      html: `
        <div style="width: 100%; font-family: sans-serif; font-size: 0.8rem; color: #fff;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem; font-weight: 600; color: #94a3b8;">
            <span>Client Profile</span><span>Registered On</span><span>Retainer Status</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <div style="display: flex; align-items: center; gap: 6px;">
              <div style="background:#d97706; color:#fff; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.6rem; font-weight:700;">AK</div>
              <span>Amit Kumar</span>
            </div>
            <span>Jul 12, 2026</span>
            <span style="color: #10b981; font-weight:600;">PAID (₹45k)</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <div style="display: flex; align-items: center; gap: 6px;">
              <div style="background:#94a3b8; color:#0f172a; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.6rem; font-weight:700;">SD</div>
              <span>Sunita Devi</span>
            </div>
            <span>Jul 14, 2026</span>
            <span style="color: #f59e0b; font-weight:600;">PARTIAL (₹60k)</span>
          </div>
        </div>
      `
    },
    billing: {
      title: "Advocate Ledger & Billings",
      desc: "Plugs revenue leakages in your chamber practice. Create professional fee statements, register cash or bank payments, log office disbursements, and view detailed account summaries detailing high outstanding balances and collection metrics.",
      link: "/dashboard?view=billings",
      btnText: "View Billings",
      highlights: [
        { icon: "wallet", title: "Professional Ledgers", desc: "Track complete receipt records and billing metrics." },
        { icon: "receipt", title: "Court Disbursements", desc: "Log stamp paper, filing fees, and advocate expenses." },
        { icon: "trending-up", title: "Outstanding Alerts", desc: "Flag pending payments with aged receivable reminders." }
      ],
      html: `
        <div style="width: 100%; display: flex; gap: 1.5rem; align-items: center; justify-content: center; flex-wrap: wrap;">
          <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 0.75rem; width: 130px; font-family: sans-serif;">
            <div style="color: #94a3b8; font-size: 0.65rem; font-weight: 600; margin-bottom: 0.25rem;">Total Outstanding</div>
            <div style="color: #ef4444; font-size: 1.3rem; font-weight: 700; margin-bottom: 0.4rem;">₹1,85,000</div>
            <div style="color: #10b981; font-size: 0.6rem; font-weight: 600;">↑ 12% billing collection</div>
          </div>
          <div style="display: flex; align-items: flex-end; gap: 10px; height: 75px;">
            <div style="background: rgba(217,119,6,0.15); width: 18px; height: 35%; border-radius: 2px;"></div>
            <div style="background: rgba(217,119,6,0.3); width: 18px; height: 60%; border-radius: 2px;"></div>
            <div style="background: #d97706; width: 18px; height: 95%; border-radius: 2px; box-shadow: 0 0 10px rgba(217,119,6,0.35);"></div>
            <div style="background: rgba(217,119,6,0.5); width: 18px; height: 50%; border-radius: 2px;"></div>
          </div>
        </div>
      `
    },
    referrals: {
      title: "Referral & Network Tracker",
      desc: "Cultivate professional connections and optimize your chamber's inbound practice growth. Chambers allows advocates to register and track referral partners for every case, map client origins, and analyze structured networking relationships to calculate financial yields from collaborations.",
      link: "/dashboard?view=clients",
      btnText: "Analyze Network",
      highlights: [
        { icon: "network", title: "Partner Directory", desc: "Associate case metrics with colleague advocates." },
        { icon: "bar-chart-2", title: "Yield Analytics", desc: "Monitor revenue volume generated per networking lead." },
        { icon: "arrow-up-right", title: "Outbound Logs", desc: "Track matters referred out to different jurisdictions." }
      ],
      html: `
        <div style="width: 100%; font-family: sans-serif; font-size: 0.8rem; color: #fff;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem; font-weight: 600; color: #94a3b8;">
            <span>Referral Partner</span><span>Referred Cases</span><span>Network Yield</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <span>Adv. Rajesh Sen (High Court)</span>
            <span>4 Matters</span>
            <span style="color: #10b981; font-weight:600;">₹1,80,000</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <span>Adv. Priya Sharma (District Court)</span>
            <span>3 Matters</span>
            <span style="color: #10b981; font-weight:600;">₹95,000</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0;">
            <span>Supreme Court Bar Association</span>
            <span>2 Matters</span>
            <span style="color: #10b981; font-weight:600;">₹3,50,000</span>
          </div>
        </div>
      `
    },
    intimation: {
      title: "Client Intimation Assistant",
      desc: "Instantly create beautifully formatted summaries of next hearing dates, daily court orders, or pending dues. Draft custom message templates dynamically populated with case details, ready to share directly with clients via WhatsApp, email, or SMS in one click.",
      link: "/dashboard?view=cases",
      btnText: "Send Updates",
      highlights: [
        { icon: "message-square", title: "WhatsApp Updates", desc: "Send automated intimation alerts to client phones." },
        { icon: "file-text", title: "Dynamic Templates", desc: "Auto-populate next dates, courtrooms, and dues." },
        { icon: "check-circle", title: "Delivery Receipts", desc: "Verify that clients received critical court date alerts." }
      ],
      html: `
        <div style="width: 100%; display: flex; justify-content: center; align-items: center;">
          <div style="background: rgba(15, 23, 42, 0.85); border: 1.5px solid rgba(217,119,6,0.35); border-radius: 6px; padding: 0.75rem 1.25rem; font-size: 0.75rem; color: #fff; width: 280px; border-left: 4px solid #d97706; box-shadow: 0 4px 10px rgba(0,0,0,0.3); line-height: 1.4; font-family: sans-serif;">
            <strong style="color: #d97706; font-size: 0.8rem; display: block; margin-bottom: 0.25rem;">WhatsApp Notification</strong>
            <span>Dear Client, this is to intimate you that your case <strong>Apex Corp vs. Zenith Ltd</strong> is listed for hearing on <strong>Aug 15, 2026</strong>.</span>
          </div>
        </div>
      `
    }
  };

  function updatePreview(feature) {
    const data = dataMockups[feature];
    if (!data) return;

    document.querySelectorAll('.feature-detail-title').forEach(el => el.textContent = data.title);
    document.querySelectorAll('.feature-detail-desc').forEach(el => el.textContent = data.desc);
    
    document.querySelectorAll('.feature-detail-cta').forEach(el => {
      el.setAttribute('href', data.link);
      el.textContent = data.btnText;
    });

    document.querySelectorAll('.feature-preview-display').forEach(el => {
      el.innerHTML = data.html;
    });

    const highlightsContainer = document.querySelectorAll('.feature-highlights-container');
    if (highlightsContainer.length > 0 && data.highlights) {
      const highlightsHtml = data.highlights.map(item => `
        <div style="display: flex; gap: 0.75rem; align-items: flex-start; text-align: left;">
          <div style="background: rgba(217, 119, 6, 0.1); border: 1px solid rgba(217, 119, 6, 0.2); border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: #d97706; flex-shrink: 0; margin-top: 2px;">
            <i data-lucide="${item.icon}" style="width: 14px; height: 14px;"></i>
          </div>
          <div>
            <h5 style="color: #fff; font-size: 0.8rem; margin: 0 0 2px 0; font-weight: 600;">${item.title}</h5>
            <p style="color: #94a3b8; font-size: 0.7rem; margin: 0; line-height: 1.35;">${item.desc}</p>
          </div>
        </div>
      `).join('');
      
      highlightsContainer.forEach(el => {
        el.innerHTML = highlightsHtml;
      });
    }

    safeCreateIcons();
  }

  tabsList.forEach(btn => {
    btn.addEventListener('click', () => {
      const feature = btn.getAttribute('data-feature');
      
      document.querySelectorAll(`.feature-tab-btn`).forEach(b => {
        if (b.getAttribute('data-feature') === feature) {
          b.classList.add('active');
          b.style.background = 'rgba(30, 41, 59, 0.45)';
          b.style.borderColor = 'rgba(217, 119, 6, 0.35)';
          const icon = b.querySelector('.tab-icon-wrapper');
          if (icon) {
            icon.style.color = '#d97706';
            icon.style.background = 'rgba(217, 119, 6, 0.12)';
            icon.style.borderColor = 'rgba(217, 119, 6, 0.25)';
          }
        } else {
          b.classList.remove('active');
          b.style.background = 'rgba(17, 24, 39, 0.3)';
          b.style.borderColor = 'rgba(255, 255, 255, 0.03)';
          const icon = b.querySelector('.tab-icon-wrapper');
          if (icon) {
            icon.style.color = '#94a3b8';
            icon.style.background = 'rgba(255, 255, 255, 0.03)';
            icon.style.borderColor = 'rgba(255, 255, 255, 0.05)';
          }
        }
      });

      updatePreview(feature);
    });
  });

  // Ensure initial active feature preview and icons are 100% rendered
  updatePreview('cases');
  safeCreateIcons();
}

function setupMobileOverviewPage() {
  // Pure CSS media queries handle responsive layouts without mutating DOM nodes or breaking Chart.js canvases
}

/**
 * Change Password Handler
 */
function initChangePasswordHandler() {
  const form = document.getElementById('settings-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('settings-current-password').value;
    const newPassword = document.getElementById('settings-new-password').value;
    const confirmPassword = document.getElementById('settings-confirm-password').value;
    
    const errorEl = document.getElementById('settings-password-error');
    const successEl = document.getElementById('settings-password-success');
    
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    if (newPassword !== confirmPassword) {
      errorEl.textContent = "Confirm password does not match new password.";
      errorEl.style.display = 'block';
      return;
    }
    
    try {
      const btn = form.querySelector('button[type="submit"]');
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<i class="spinner" style="width: 14px; height: 14px; margin-right: 4px;"></i> Updating...';
      btn.disabled = true;

      await api.auth.changePassword(currentPassword, newPassword);

      btn.innerHTML = originalHtml;
      btn.disabled = false;
      
      successEl.textContent = "Password updated successfully!";
      successEl.style.display = 'block';
      
      document.getElementById('settings-current-password').value = '';
      document.getElementById('settings-new-password').value = '';
      document.getElementById('settings-confirm-password').value = '';
    } catch (err) {
      const btn = form.querySelector('button[type="submit"]');
      btn.innerHTML = '<i data-lucide="lock"></i> Update Password';
      btn.disabled = false;
      safeCreateIcons();

      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  // Re-run password toggle initializer to capture settings password form inputs
  initPasswordToggleHandlers();
}

// Global click interceptor for all client-side navigation links, buttons & CTAs
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-link], button[data-link], .btn-nav-login, .btn-nav-register, .hero-cta-primary, .hero-cta-secondary');
  if (link) {
    const targetPath = link.getAttribute('data-link') || link.getAttribute('href');
    if (targetPath && targetPath !== '#' && !targetPath.startsWith('javascript:')) {
      e.preventDefault();

      // If user clicked Login or Register button, ensure auth modal opens cleanly without resetting scroll position
      if (targetPath === '/login' || targetPath === '/register') {
        const authPage = document.getElementById('auth-page');
        const marketingPage = document.getElementById('marketing-page');
        if (authPage) {
          if (marketingPage && marketingPage.style.display === 'none') {
            marketingPage.style.display = 'block';
          }
          authPage.style.display = 'flex';
          const targetView = (targetPath === '/login') ? 'login' : 'signup';
          if (typeof window.showAuthView === 'function') window.showAuthView(targetView);
          window.history.pushState({}, '', targetPath);
          return;
        }
      }

      window.history.pushState({}, '', targetPath);
      router();
      return;
    }
  }

  const hashLink = e.target.closest('a[href^="#"]');
  if (hashLink) {
    const hash = hashLink.getAttribute('href');
    if (hash && hash !== '#' && hash !== '#!') {
      const marketingPage = document.getElementById('marketing-page');
      if (marketingPage && marketingPage.style.display === 'none') {
        marketingPage.style.display = 'block';
      }
      const targetEl = document.querySelector(hash);
      if (targetEl) {
        e.preventDefault();
        const headerOffset = 70;
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({ top: Math.max(0, offsetPosition), behavior: 'smooth' });
      }
    }
  }
});

// Global popstate listener for browser back/forward buttons
window.addEventListener('popstate', () => {
  router();
});

// Global initialization helper
function startApp() {
  initAuthenticationHandlers();
  router();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startApp();

    // iOS Safari Touchmove Scroll Lock on Backdrop
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) {
      backdrop.addEventListener('touchmove', (e) => {
        if (backdrop.classList.contains('active')) {
          e.preventDefault();
        }
      }, { passive: false });
    }

    // Throttled Window Resize Listener (60fps mobile keyboard transition)
    let resizeTimeout;
    window.addEventListener('resize', () => {
      if (resizeTimeout) cancelAnimationFrame(resizeTimeout);
      resizeTimeout = requestAnimationFrame(() => {
        if (window.safeCreateIcons) window.safeCreateIcons();
      });
    }, { passive: true });
  });
} else {
  startApp();
}

setTimeout(() => {
  initAuthenticationHandlers();
}, 200);

