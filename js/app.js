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

function showAuthModal() {
  const authModal = document.getElementById('auth-modal');
  authModal.style.display = 'flex';
  authModal.classList.add('active');
}

function hideAuthModal() {
  const authModal = document.getElementById('auth-modal');
  authModal.style.display = 'none';
  authModal.classList.remove('active');
}

/**
 * Setup Authentication (Login/Signup) Event Listeners
 */
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
  const modalTitle = document.getElementById('auth-modal-title');

  // Toggle views
  switchToSignup.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    modalTitle.textContent = "Register Chamber";
  });

  switchToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
    modalTitle.textContent = "Login to Chambers";
  });

  // Form submits
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    try {
      await api.auth.login(loginEmail.value, loginPass.value);
      hideAuthModal();
      loginForm.reset();
      
      // Load modules
      await db.loadAll();
      initTheme();
      updateBrandingHeaders();
      
      // Initialize view modules
      dashboard.init();
      clients.init();
      cases.init();
      diary.init();
      accounts.init();
      share.init();
      
      await switchView('dashboard-page');
    } catch (err) {
      loginError.textContent = err.message || "Invalid credentials.";
      loginError.style.display = 'block';
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupError.style.display = 'none';
    try {
      await api.auth.signup(signupEmail.value, signupPass.value, signupFirm.value, signupLawyer.value);
      hideAuthModal();
      signupForm.reset();
      
      // Load modules
      await db.loadAll();
      initTheme();
      updateBrandingHeaders();
      
      // Initialize view modules
      dashboard.init();
      clients.init();
      cases.init();
      diary.init();
      accounts.init();
      share.init();
      
      await switchView('dashboard-page');
    } catch (err) {
      signupError.textContent = err.message || "Signup failed.";
      signupError.style.display = 'block';
    }
  });

  // Logout trigger
  sidebarLogoutBtn.addEventListener('click', async () => {
    if (confirm("Are you sure you want to log out of your chamber account?")) {
      await api.auth.logout();
      location.reload();
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

  // 3. Setup routing events
  sidebarMenuItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      await switchView(target);
    });
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

  // 6. Dashboard links
  document.getElementById('dashboard-view-diary-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await switchView('diary-page');
  });
  document.getElementById('dashboard-view-accounts-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await switchView('accounts-page');
  });

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

  // 8. Reset database button
  document.getElementById('settings-reset-database-btn').addEventListener('click', async () => {
    if (confirm("Are you absolutely sure you want to restore the practice manager database? All custom cases and client logs will be permanently deleted!")) {
      await db.resetDB();
      alert("Database reset to empty state.");
      location.reload();
    }
  });

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

  // 10. Init Auth Event Handlers
  initAuthenticationHandlers();

  // 11. Run Authentication Session Check
  const authOk = await db.loadAll();
  if (authOk) {
    hideAuthModal();
    initTheme();
    updateBrandingHeaders();

    // Kickoff the modules
    dashboard.init();
    clients.init();
    cases.init();
    diary.init();
    accounts.init();
    share.init();

    await switchView('dashboard-page');
  } else {
    showAuthModal();
  }
});
