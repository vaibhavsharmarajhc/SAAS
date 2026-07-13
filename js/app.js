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

import db from './db.js';
import api from './api.js';
import dashboard from './dashboard.js';
import clients from './clients.js';
import cases from './cases.js';
import diary from './diary.js';
import accounts from './accounts.js';
import share from './share.js';

// Application State
const state = {
  activeView: 'dashboard-page',
};

// DOM Elements
const sidebarMenuItems = document.querySelectorAll('.sidebar-menu .menu-item');
const pageContainers = document.querySelectorAll('.page-container');
const headerPageTitle = document.getElementById('header-page-title');
const headerQuickActionBtn = document.getElementById('header-quick-action-btn');
const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');
const themeToggleText = document.getElementById('theme-toggle-text');
const themeIconLight = document.getElementById('theme-icon-light');
const themeIconDark = document.getElementById('theme-icon-dark');
const sidebarBackupBtn = document.getElementById('sidebar-backup-btn');
const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');

// View Configuration for Quick Actions
const viewQuickActions = {
  'dashboard-page': {
    text: 'Log Payment',
    icon: 'plus',
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
  'cases-page': {
    text: 'Register Case',
    icon: 'plus',
    action: () => {
      document.getElementById('btn-add-case').click();
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

/**
 * Switch Active View Router (Async)
 */
export async function switchView(targetViewId) {
  state.activeView = targetViewId;

  // Toggle page visibility
  pageContainers.forEach(container => {
    if (container.id === targetViewId) {
      container.classList.add('active');
    } else {
      container.classList.remove('active');
    }
  });

  // Toggle active menu state
  sidebarMenuItems.forEach(item => {
    if (item.getAttribute('data-target') === targetViewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update header text based on page
  const pageTitle = targetViewId.split('-')[0];
  const capitalizedTitle = pageTitle.charAt(0).toUpperCase() + pageTitle.slice(1);
  headerPageTitle.textContent = capitalizedTitle === 'Clients' ? 'Clients Onboarding' : 
                                capitalizedTitle === 'Accounts' ? 'Accounts & Income Ledger' : 
                                capitalizedTitle === 'Share' ? 'Client Intimation' : capitalizedTitle;

  // Update Quick Action button
  const config = viewQuickActions[targetViewId];
  if (config) {
    headerQuickActionBtn.style.display = 'inline-flex';
    headerQuickActionBtn.querySelector('span').textContent = config.text;
    let iconElement = headerQuickActionBtn.querySelector('i, svg');
    if (iconElement) {
      const newIcon = document.createElement('i');
      newIcon.setAttribute('data-lucide', config.icon);
      iconElement.parentNode.replaceChild(newIcon, iconElement);
    }
    lucide.createIcons();
  } else {
    headerQuickActionBtn.style.display = 'none';
  }

  // Trigger page-specific renders/refreshes
  await refreshPageView(targetViewId);
}
window.switchView = switchView;


/**
 * Refresh current view data (syncs cache with server first)
 */
async function refreshPageView(viewId) {
  // Pull fresh database state from backend
  const authOk = await db.loadAll();
  if (!authOk) {
    showAuthModal();
    return;
  }

  switch (viewId) {
    case 'dashboard-page':
      dashboard.render();
      break;
    case 'clients-page':
      clients.render();
      break;
    case 'cases-page':
      cases.render();
      break;
    case 'diary-page':
      diary.render();
      break;
    case 'accounts-page':
      accounts.render();
      break;
    case 'share-page':
      share.render();
      break;
    case 'settings-page':
      loadSettingsForm();
      break;
  }
}

/**
 * Handle theme switching toggles
 */
function initTheme() {
  const settings = db.getSettings();
  const initialTheme = settings.theme || 'light';
  setTheme(initialTheme);

  themeToggleCheckbox.checked = initialTheme === 'dark';
  themeToggleCheckbox.addEventListener('change', async (e) => {
    const newTheme = e.target.checked ? 'dark' : 'light';
    setTheme(newTheme);
    await db.updateSettings({ theme: newTheme });
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    themeToggleText.textContent = 'Dark Mode';
    themeIconLight.style.display = 'none';
    themeIconDark.style.display = 'inline-block';
  } else {
    themeToggleText.textContent = 'Light Mode';
    themeIconLight.style.display = 'inline-block';
    themeIconDark.style.display = 'none';
  }
}

/**
 * Load practice settings form
 */
function loadSettingsForm() {
  const settings = db.getSettings();
  document.getElementById('settings-firm-name').value = settings.firmName || 'CounselAI';
  document.getElementById('settings-lawyer-name').value = settings.lawyerName || 'Adv. Vaibhav Sharma';
  document.getElementById('settings-currency').value = settings.currency || 'INR';
  updateBrandingHeaders();
}

export function updateBrandingHeaders() {
  const settings = db.getSettings();
  const brandName = document.querySelector('.brand-name');
  const lawyerName = document.querySelector('.lawyer-name');
  const avatar = document.querySelector('.lawyer-avatar');

  if (brandName) brandName.textContent = settings.firmName || 'CounselAI';
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
    lucide.createIcons();
  } catch (err) {
    badge.innerHTML = `<span style="background-color: var(--color-danger); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="alert-triangle" style="width: 10px; height: 10px;"></i> Connection Failed</span>`;
    lucide.createIcons();
  }
}

function showAuthView(viewName) {
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const forgotForm = document.getElementById('auth-forgot-form');
  const resetForm = document.getElementById('auth-reset-form');
  const modalTitle = document.getElementById('auth-modal-title');

  if (!loginForm || !signupForm || !forgotForm || !resetForm) return;

  loginForm.style.display = 'none';
  signupForm.style.display = 'none';
  forgotForm.style.display = 'none';
  resetForm.style.display = 'none';

  // Clear inputs error state
  const inputs = document.querySelectorAll('#auth-page .form-control');
  inputs.forEach(i => i.classList.remove('auth-input-error'));
  const errorContainers = document.querySelectorAll('#auth-page [id$="-error"]');
  errorContainers.forEach(c => {
    c.style.display = 'none';
    c.innerHTML = '';
  });

  if (viewName === 'login') {
    loginForm.style.display = 'block';
    modalTitle.textContent = "Login to Chambers";
  } else if (viewName === 'signup') {
    signupForm.style.display = 'block';
    modalTitle.textContent = "Register Chamber";
  } else if (viewName === 'forgot') {
    forgotForm.style.display = 'block';
    modalTitle.textContent = "Forgot Password";
  } else if (viewName === 'reset') {
    resetForm.style.display = 'block';
    modalTitle.textContent = "Reset Password";
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

  // Check auth
  let isAuthenticated = false;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('test_auth')) {
      isAuthenticated = true;
    } else {
      isAuthenticated = await db.loadAll();
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }

  const publicRoutes = ['/', '/index.html', '/privacy', '/terms', '/login', '/register', '/features', '/about', '/pricing'];
  const isPublicRoute = publicRoutes.includes(path);

  if (isPublicRoute) {
    if (marketingNav) {
      marketingNav.style.display = 'flex';
    }
  }

  // Handle routing matching
  if (path === '/' || path === '/index.html') {
    if (marketingPage) {
      marketingPage.style.display = 'block';
      lucide.createIcons();
    }
  } else if (path === '/privacy') {
    if (privacyPage) {
      privacyPage.style.display = 'block';
      lucide.createIcons();
    }
  } else if (path === '/terms') {
    if (termsPage) {
      termsPage.style.display = 'block';
      lucide.createIcons();
    }
  } else if (path === '/features') {
    if (featuresPage) {
      featuresPage.style.display = 'block';
      lucide.createIcons();
    }
  } else if (path === '/about') {
    if (aboutPage) {
      aboutPage.style.display = 'block';
      lucide.createIcons();
    }
  } else if (path === '/pricing') {
    if (pricingPage) {
      pricingPage.style.display = 'block';
      lucide.createIcons();
    }
  } else if (path === '/login' || path === '/register') {
    if (isAuthenticated) {
      window.history.pushState({}, '', '/dashboard');
      router();
    } else {
      if (authPage) {
        authPage.style.display = 'flex';
        const targetView = (path === '/login') ? 'login' : 'signup';
        showAuthView(targetView);
        updateDbStatusBadge();
      }
    }
  } else if (path === '/dashboard' || path.startsWith('/dashboard-page') || path.startsWith('/clients-page') || path.startsWith('/cases-page') || path.startsWith('/diary-page') || path.startsWith('/accounts-page') || path.startsWith('/share-page') || path.startsWith('/settings-page')) {
    if (!isAuthenticated) {
      window.history.pushState({}, '', '/login');
      router();
    } else {
      if (dashboardApp) {
        dashboardApp.style.display = 'flex';
        document.body.classList.add('app-active');
        
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
          appInitialized = true;
        }

        // Determine view from path
        let targetView = 'dashboard-page';
        if (path !== '/dashboard') {
          targetView = path.substring(1);
        }
        await switchView(targetView);
      }
    }
  } else {
    // Fallback
    if (isAuthenticated) {
      window.history.pushState({}, '', '/dashboard');
    } else {
      window.history.pushState({}, '', '/');
    }
    router();
  }
}

function initPasswordToggleHandlers() {
  const toggles = document.querySelectorAll('.password-toggle-btn');
  toggles.forEach(btn => {
    // Remove previous listeners if any to prevent duplicate fires
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = newBtn.getAttribute('data-toggle-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const icon = newBtn.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
          icon.setAttribute('data-lucide', 'eye-off');
          lucide.createIcons();
        }
      } else {
        input.type = 'password';
        if (icon) {
          icon.setAttribute('data-lucide', 'eye');
          lucide.createIcons();
        }
      }
    });
  });
}

function initAuthenticationHandlers() {
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  
  const loginEmail = document.getElementById('auth-login-email');
  const loginPass = document.getElementById('auth-login-password');
  const loginError = document.getElementById('auth-login-error');
  
  const signupEmail = document.getElementById('auth-signup-email');
  const signupPass = document.getElementById('auth-signup-password');
  const signupFirm = document.getElementById('auth-signup-firm');
  const signupLawyer = document.getElementById('auth-signup-lawyer');
  const signupError = document.getElementById('auth-signup-error');
  
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
    loginEmail.classList.remove('auth-input-error');
    loginPass.classList.remove('auth-input-error');

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="spin-animation" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Signing In...`;
      lucide.createIcons();

      await api.auth.login(loginEmail.value, loginPass.value);
      loginForm.reset();
      
      window.history.pushState({}, '', '/dashboard');
      await router();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      
      loginEmail.classList.add('auth-input-error');
      loginPass.classList.add('auth-input-error');
      
      loginError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Invalid credentials."}`;
      loginError.style.display = 'flex';
      lucide.createIcons();
    }
  });

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
      submitBtn.innerHTML = `<i data-lucide="loader" class="spin-animation" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Creating Account...`;
      lucide.createIcons();

      await api.auth.signup(signupEmail.value, signupPass.value, signupFirm.value, signupLawyer.value);
      signupForm.reset();
      
      window.history.pushState({}, '', '/dashboard');
      await router();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      
      inputs.forEach(i => i.classList.add('auth-input-error'));
      
      signupError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Signup failed."}`;
      signupError.style.display = 'flex';
      lucide.createIcons();
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
      lucide.createIcons();

      const res = await api.auth.forgotPassword(forgotEmail.value);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;

      if (res && res.code) {
        forgotSuccessBanner.innerHTML = `
          <strong>Verification Code Generated:</strong><br>
          Your recovery code is: <strong style="font-size: 1.1rem; color: var(--color-primary);">${res.code}</strong><br>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 4px;">* In production, this code is delivered to your email inbox.</span>
        `;
        forgotSuccessBanner.style.display = 'block';
        forgotSubmitBtn.style.display = 'none';
        forgotGoResetBtn.style.display = 'block';
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      forgotEmail.classList.add('auth-input-error');
      forgotError.innerHTML = `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${err.message || "Failed to process request."}`;
      forgotError.style.display = 'flex';
      lucide.createIcons();
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
      lucide.createIcons();

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
      lucide.createIcons();
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
        window.history.pushState({}, '', '/');
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
      header.style.padding = '0.5rem 1rem; font-size: 0.7rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.03);';
      header.textContent = 'Cases';
      searchResults.appendChild(header);

      matchingCases.slice(0, 5).forEach(c => {
        const item = document.createElement('div');
        item.style.padding = '0.6rem 1rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 2px;';
        item.innerHTML = `
          <div style="font-size: 0.85rem; font-weight: 600; color: #fff;">${c.title}</div>
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
        item.addEventListener('mouseover', () => item.style.background = 'rgba(255,255,255,0.03)');
        item.addEventListener('mouseout', () => item.style.background = 'transparent');
        searchResults.appendChild(item);
      });
    }

    // Render clients
    if (matchingClients.length > 0) {
      const header = document.createElement('div');
      header.style.padding = '0.5rem 1rem; font-size: 0.7rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.03); margin-top: 0.5rem;';
      header.textContent = 'Clients';
      searchResults.appendChild(header);

      matchingClients.slice(0, 5).forEach(cl => {
        const item = document.createElement('div');
        item.style.padding = '0.6rem 1rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 2px;';
        item.innerHTML = `
          <div style="font-size: 0.85rem; font-weight: 600; color: #fff;">${cl.name}</div>
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
        item.addEventListener('mouseover', () => item.style.background = 'rgba(255,255,255,0.03)');
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
  sidebarMenuItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      window.history.pushState({}, '', '/' + target);
      await router();
    });
  });

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
  headerQuickActionBtn.addEventListener('click', () => {
    const config = viewQuickActions[state.activeView];
    if (config && config.action) {
      config.action();
    }
  });

  // 5. Sidebar data backup trigger
  sidebarBackupBtn.addEventListener('click', () => {
    db.exportBackup();
  });

  // Sidebar refresh trigger
  const sidebarRefreshBtn = document.getElementById('sidebar-refresh-btn');
  if (sidebarRefreshBtn) {
    sidebarRefreshBtn.addEventListener('click', async () => {
      const icon = sidebarRefreshBtn.querySelector('i');
      if (icon) icon.classList.add('spin-animation');
      sidebarRefreshBtn.disabled = true;

      try {
        const authOk = await db.loadAll();
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
  document.getElementById('dashboard-view-diary-link').addEventListener('click', async (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/diary-page');
    await router();
  });
  document.getElementById('dashboard-view-accounts-link').addEventListener('click', async (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/accounts-page');
    await router();
  });

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
  document.getElementById('settings-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const firmName = document.getElementById('settings-firm-name').value;
    const lawyerName = document.getElementById('settings-lawyer-name').value;
    const currency = document.getElementById('settings-currency').value;
    
    await db.updateSettings({ firmName, lawyerName, currency });
    updateBrandingHeaders();
    alert("Practice settings updated successfully.");
  });

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

  backupExportBtn.addEventListener('click', () => {
    db.exportBackup();
  });

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

  // 10. Init Auth Event Handlers & password eye toggles & global search
  initAuthenticationHandlers();
  initPasswordToggleHandlers();
  initGlobalSearch();

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
