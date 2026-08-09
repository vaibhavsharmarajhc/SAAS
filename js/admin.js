/**
 * VSH Legal - Super Admin Platform Intelligence Module (Fixed)
 */

import api from './api.js';
import db from './db.js';

const SUPER_ADMIN_EMAIL = 'vaibhavsharmarajhc@gmail.com';

// Local safety fallback for string sanitization
const escapeHtml = (str) => {
  if (typeof window.sanitizeText === 'function') return window.sanitizeText(str);
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const adminModule = {
  isSuperAdmin(user) {
    const extractEmail = (obj) => {
      if (!obj) return '';
      if (typeof obj === 'string') return obj.toLowerCase().trim();
      if (obj.email) return obj.email.toLowerCase().trim();
      if (obj.user && obj.user.email) return obj.user.email.toLowerCase().trim();
      return '';
    };

    let email = extractEmail(user);
    if (!email) {
      try {
        const u = db.getUser() || JSON.parse(localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || '{}');
        email = extractEmail(u);
      } catch (e) {}
    }
    if (!email) {
      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token) {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            email = extractEmail(payload);
          }
        }
      } catch (e) {}
    }

    const isTargetEmail = email === SUPER_ADMIN_EMAIL.toLowerCase();
    const isSuperRole = (user && (user.role === 'superadmin' || (user.user && user.user.role === 'superadmin')));
    return isTargetEmail || isSuperRole;
  },

  init(user) {
    console.log("AdminModule: Initializing Super Admin Console...");
    this.updateAdminVisibility(user);
    this.setupExitImpersonationHandler();
  },

  setupExitImpersonationHandler() {
    const exitBtn = document.getElementById('btn-exit-impersonation');
    if (exitBtn && !exitBtn.getAttribute('data-bound')) {
      exitBtn.setAttribute('data-bound', 'true');
      exitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const backup = localStorage.getItem('adminSessionBackup');
        if (backup) {
          localStorage.setItem('currentUser', backup);
          localStorage.removeItem('adminSessionBackup');
        }
        const banner = document.getElementById('superadmin-impersonation-banner');
        if (banner) banner.style.display = 'none';

        const currentUser = db.getUser() || JSON.parse(localStorage.getItem('currentUser') || '{}');
        this.updateAdminVisibility(currentUser);

        if (typeof window.switchView === 'function') {
          window.switchView('superadmin-page');
        } else {
          this.render();
        }
      });
    }
  },

  updateAdminVisibility(user) {
    const isSuper = this.isSuperAdmin(user);
    const adminNavItems = document.querySelectorAll('[data-target="superadmin-page"], .superadmin-nav-item');
    adminNavItems.forEach(item => {
      if (isSuper) {
        item.style.setProperty('display', 'flex', 'important');
      } else {
        item.style.display = 'none';
      }
    });

    const settingsLauncher = document.getElementById('settings-superadmin-launcher-card');
    if (settingsLauncher) {
      settingsLauncher.style.display = isSuper ? 'block' : 'none';
    }
  },

  async render() {
    try {
      const user = db.getUser() || JSON.parse(localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || '{}');
      const container = document.getElementById('superadmin-page-content') || document.getElementById('superadmin-page');
      if (!container) return;

      if (!this.isSuperAdmin(user)) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 3rem 1.5rem; max-width: 520px; margin: 3rem auto; border: 1px solid rgba(239,68,68,0.3); background: var(--card-bg, #fff);">
            <div style="width: 56px; height: 56px; background: rgba(239,68,68,0.1); color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto;">
              <i data-lucide="shield-alert" style="width: 32px; height: 32px;"></i>
            </div>
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.2rem; color: var(--text-primary);">Super Admin Area Restricted</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.5;">
              This management console is exclusively reserved for platform administration (<strong>${escapeHtml(SUPER_ADMIN_EMAIL)}</strong>).
            </p>
            <button type="button" class="btn btn-primary" onclick="window.location.href='/dashboard'" style="display: inline-flex; align-items: center; gap: 6px; margin: 0 auto;">
              <i data-lucide="arrow-left"></i> Return to Chamber Dashboard
            </button>
          </div>
        `;
        if (window.safeCreateIcons) window.safeCreateIcons(container);
        return;
      }

      // Render local metrics immediately
      const localData = this.calculateLocalMetrics();
      this.renderAdminConsole(container, localData);
      try { this.loadAdminSupportDesk(); } catch (e) {}

      // Asynchronously fetch server metrics without destroying search input focus if active
      try {
        const serverUsers = (api.admin && typeof api.admin.getUsers === 'function') ? await api.admin.getUsers() : [];
        const serverMetrics = (api.admin && typeof api.admin.getMetrics === 'function') ? await api.admin.getMetrics() : {};
        const serverData = {
          ...serverMetrics,
          users: (Array.isArray(serverUsers) && serverUsers.length > 0) ? serverUsers : (serverMetrics.users || localData.users)
        };
        
        // Avoid DOM replacement if admin is currently typing in search
        const activeSearch = document.activeElement;
        if (!activeSearch || activeSearch.id !== 'admin-user-search') {
          this.renderAdminConsole(container, serverData);
          try { this.loadAdminSupportDesk(); } catch (e) {}
        }
      } catch (err) {
        console.warn("Admin API async background update fallback active:", err);
      }
    } catch (topRenderErr) {
      console.error("Top-level Super Admin Console render caught exception:", topRenderErr);
      const container = document.getElementById('superadmin-page-content') || document.getElementById('superadmin-page');
      if (container) {
        const localFallbackData = this.calculateLocalMetrics();
        try { this.renderAdminConsole(container, localFallbackData); } catch (fErr) {}
      }
    }
  },

  calculateLocalMetrics() {
    const clients = db.getClients() || [];
    const cases = db.getCases() || [];
    const tasks = db.getTasks() || [];
    const txs = db.getTransactions() || [];
    const currentUser = db.getUser() || {};

    let totalReceived = 0;
    if (Array.isArray(txs)) {
      txs.forEach(t => {
        if (t && t.type === 'Received') totalReceived += (t.amount || 0);
      });
    }

    const lawyerName = currentUser.settings?.lawyerName || currentUser.lawyerName || 'Adv. Vaibhav Sharma';
    const firmName = currentUser.settings?.firmName || currentUser.firmName || 'VSH Legal Chambers';

    return {
      totalUsers: 1,
      totalClients: Array.isArray(clients) ? clients.length : 0,
      totalCases: Array.isArray(cases) ? cases.length : 0,
      totalTasks: Array.isArray(tasks) ? tasks.length : 0,
      totalRevenue: totalReceived,
      users: [
        {
          id: (currentUser && currentUser.id) || '1',
          lawyerName,
          firmName,
          email: (currentUser && currentUser.email) || SUPER_ADMIN_EMAIL,
          createdAt: new Date().toISOString().split('T')[0],
          casesCount: Array.isArray(cases) ? cases.length : 0,
          clientsCount: Array.isArray(clients) ? clients.length : 0,
          tasksCount: Array.isArray(tasks) ? tasks.length : 0,
          totalRevenue: totalReceived,
          status: cases.length > 5 ? 'High' : (cases.length > 2 ? 'Moderate' : 'New')
        }
      ]
    };
  },

  renderAdminConsole(container, data) {
    const users = data.users || [];
    const totalUsers = data.totalUsers || users.length;
    const totalClients = data.totalClients || 0;
    const totalCases = data.totalCases || 0;
    const totalTasks = data.totalTasks || 0;
    const totalRevenue = data.totalRevenue || 0;

    const existingSearch = document.getElementById('admin-user-search');
    const previousQuery = existingSearch ? existingSearch.value : '';
    const wasFocused = document.activeElement === existingSearch;

    let html = `
      <div class="card" style="background: linear-gradient(135deg, rgba(217,119,6,0.08) 0%, rgba(16,185,129,0.08) 100%); border: 1px solid var(--color-primary); margin-bottom: 1.5rem; padding: 1.25rem;">
        <div style="display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
          <div style="background: var(--color-primary); color: #fff; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i data-lucide="shield-check" style="width: 24px; height: 24px;"></i>
          </div>
          <div style="flex: 1; min-width: 250px;">
            <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-primary);">Super Admin Platform Intelligence</h3>
            <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
              <strong style="color: var(--color-success);">Confidentiality Preserved:</strong> Client names, CNR numbers, and case contents remain end-to-end isolated and private to each respective advocate account.
            </p>
          </div>
        </div>
      </div>

      <div class="grid-cols-4" style="gap: 1rem; margin-bottom: 1.5rem;" id="admin-kpi-grid">
        <div class="card kpi-card">
          <div class="kpi-info">
            <span class="kpi-label">Registered Advocates</span>
            <span class="kpi-value">${totalUsers}</span>
          </div>
          <div class="kpi-icon-wrapper info"><i data-lucide="users"></i></div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-info">
            <span class="kpi-label">Platform Clients</span>
            <span class="kpi-value">${totalClients}</span>
          </div>
          <div class="kpi-icon-wrapper success"><i data-lucide="user-check"></i></div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-info">
            <span class="kpi-label">Cases Managed</span>
            <span class="kpi-value">${totalCases}</span>
          </div>
          <div class="kpi-icon-wrapper"><i data-lucide="gavel"></i></div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-info">
            <span class="kpi-label">Processed Finances</span>
            <span class="kpi-value">₹${(Number(totalRevenue) || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="kpi-icon-wrapper success"><i data-lucide="wallet"></i></div>
        </div>
      </div>

      <div class="card" style="padding: 1.25rem;">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <div>
            <h3 style="margin: 0; font-size: 1.1rem;">Registered User Engagement Leaderboard</h3>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.2rem 0 0 0;">Telemetries & tenant account management controls</p>
          </div>
          <div style="position: relative; max-width: 280px; width: 100%;">
            <input type="text" id="admin-user-search" class="form-control" placeholder="Search advocate, firm, email..." style="padding-left: 2.2rem; font-size: 0.85rem;" value="${escapeHtml(previousQuery)}">
            <i data-lucide="search" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--text-muted);"></i>
          </div>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Advocate / Chamber Firm</th>
                <th>Account Email</th>
                <th>Cases</th>
                <th>Tasks</th>
                <th>Finances</th>
                <th>Engagement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="admin-users-table-body">
              ${this.renderUserRows(users)}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top: 1.5rem; padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="life-buoy"></i> Chamber Support Desk Portal
          </h3>
          <button type="button" class="btn btn-secondary" id="btn-admin-refresh-tickets" style="font-size: 0.8rem;">
            <i data-lucide="refresh-cw"></i> Refresh Tickets
          </button>
        </div>
        <div id="admin-support-tickets-container">
          <div style="text-align:center; padding: 2rem;" class="text-muted">Loading support tickets...</div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    if (window.safeCreateIcons) window.safeCreateIcons(container);

    this.attachUserActionListeners(container, users);

    const searchInput = document.getElementById('admin-user-search');
    if (searchInput) {
      if (wasFocused) searchInput.focus();

      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = users.filter(u => 
          (u.lawyerName && u.lawyerName.toLowerCase().includes(query)) ||
          (u.firmName && u.firmName.toLowerCase().includes(query)) ||
          (u.email && u.email.toLowerCase().includes(query))
        );
        const tbody = document.getElementById('admin-users-table-body');
        if (tbody) {
          tbody.innerHTML = this.renderUserRows(filtered);
          this.attachUserActionListeners(container, filtered);
          if (window.safeCreateIcons) window.safeCreateIcons(tbody);
        }
      });
    }
  },

  attachUserActionListeners(container, users) {
    if (!container) return;

    // 1. Impersonate / View Account Listener
    container.querySelectorAll('.btn-impersonate-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-user-id');
        const email = btn.getAttribute('data-user-email');
        const name = btn.getAttribute('data-user-name');
        
        const banner = document.getElementById('superadmin-impersonation-banner');
        const nameSpan = document.getElementById('impersonated-account-name');
        const emailSpan = document.getElementById('impersonated-account-email');

        if (banner && nameSpan && emailSpan) {
          nameSpan.textContent = name || 'Advocate Account';
          emailSpan.textContent = email || '';
          banner.style.display = 'flex';
        }

        if (!localStorage.getItem('adminSessionBackup')) {
          localStorage.setItem('adminSessionBackup', localStorage.getItem('currentUser') || '');
        }

        // Target user session swap
        const targetUser = users.find(u => String(u.id) === String(userId)) || { id: userId, email, lawyerName: name };
        localStorage.setItem('currentUser', JSON.stringify(targetUser));

        if (typeof window.switchView === 'function') {
          window.switchView('dashboard-page');
        }
      });
    });

    // 2. Suspend Listener
    container.querySelectorAll('.btn-suspend-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-user-id');
        const email = btn.getAttribute('data-user-email');
        const isSuspended = btn.getAttribute('data-suspended') === 'true';

        if (email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase()) {
          alert("Action Protected: Super Admin account cannot be suspended.");
          return;
        }

        const confirmMsg = isSuspended ? 
          `Reactivate access for account (${email})?` : 
          `Suspend account access for (${email})?`;

        if (confirm(confirmMsg)) {
          try {
            await api.admin.setUserSuspended(userId, !isSuspended);
            alert(`Account ${!isSuspended ? 'suspended' : 'reactivated'} successfully.`);
            this.render();
          } catch (err) {
            alert("Failed to update suspension status: " + err.message);
          }
        }
      });
    });

    // 3. Delete Listener
    container.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-user-id');
        const email = btn.getAttribute('data-user-email');

        if (email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase()) {
          alert("Action Protected: Super Admin account cannot be deleted.");
          return;
        }

        const confirmName = prompt(`SECURITY CONFIRMATION:\nType the user's email (${email}) to permanently delete this account:`);
        if (confirmName && confirmName.toLowerCase().trim() === email.toLowerCase().trim()) {
          try {
            await api.admin.deleteUserAccount(userId);
            alert(`Account (${email}) deleted successfully.`);
            this.render();
          } catch (err) {
            alert("Failed to delete account: " + err.message);
          }
        }
      });
    });
  },

  renderUserRows(users) {
    if (!users || users.length === 0) {
      return `<tr><td colspan="7" style="text-align:center; padding:2rem;" class="text-muted">No registered users match search filter.</td></tr>`;
    }

    return users.map(u => {
      let badgeBg = 'rgba(16, 185, 129, 0.15)';
      let badgeColor = '#10b981';
      let statusText = '🔥 High Activity';

      if (u.isSuspended) {
        badgeBg = 'rgba(239, 68, 68, 0.15)';
        badgeColor = '#ef4444';
        statusText = '🚫 Suspended';
      } else if (u.status === 'Moderate' || (u.casesCount > 2 && u.casesCount <= 10)) {
        badgeBg = 'rgba(217, 119, 6, 0.15)';
        badgeColor = '#d97706';
        statusText = '🟢 Active';
      } else if (u.status === 'New' || u.casesCount <= 2) {
        badgeBg = 'rgba(59, 130, 246, 0.15)';
        badgeColor = '#3b82f6';
        statusText = '⚡ New Account';
      }

      const rawDisplayName = u.lawyerName || u.firmName || 'Legal Advocate';
      const displayName = escapeHtml(rawDisplayName);
      const email = escapeHtml(u.email || 'N/A');
      const userId = escapeHtml(u.id);
      
      const firmLabel = u.firmName && u.firmName !== rawDisplayName ? `<div style="font-size:0.7rem; color:var(--text-muted);">${escapeHtml(u.firmName)}</div>` : '';
      const isSuper = (u.email && u.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase());

      const actionButtons = isSuper ? 
        `<span style="font-size:0.75rem; color:var(--color-primary); font-weight:700;"><i data-lucide="shield"></i> Super Admin</span>` : 
        `
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-impersonate-user" data-user-id="${userId}" data-user-email="${email}" data-user-name="${displayName}" style="padding:0.2rem 0.5rem; font-size:0.72rem;">
              <i data-lucide="eye" style="width:12px; height:12px;"></i> View Account
            </button>
            <button type="button" class="btn btn-secondary btn-suspend-user" data-user-id="${userId}" data-user-email="${email}" data-suspended="${!!u.isSuspended}" style="padding:0.2rem 0.5rem; font-size:0.72rem; color: ${u.isSuspended ? '#10b981' : '#d97706'};">
              <i data-lucide="user-x" style="width:12px; height:12px;"></i> ${u.isSuspended ? 'Reactivate' : 'Suspend'}
            </button>
            <button type="button" class="btn btn-secondary btn-delete-user" data-user-id="${userId}" data-user-email="${email}" style="padding:0.2rem 0.5rem; font-size:0.72rem; color:var(--color-danger);">
              <i data-lucide="trash-2" style="width:12px; height:12px;"></i> Delete
            </button>
          </div>
        `;

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-primary);">${displayName}</div>
            ${firmLabel}
          </td>
          <td style="font-size:0.8rem; color:var(--text-secondary);">${email}</td>
          <td style="font-size:0.85rem; font-weight:600;">${u.casesCount || 0} Case(s)</td>
          <td style="font-size:0.85rem;">${u.tasksCount || 0} Task(s)</td>
          <td style="font-size:0.85rem; font-weight:700; color:var(--color-success);">₹${(Number(u.totalRevenue) || 0).toLocaleString('en-IN')}</td>
          <td>
            <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:700; font-size:0.72rem; padding:0.25rem 0.6rem; border-radius:10px;">
              ${statusText}
            </span>
          </td>
          <td>
            ${actionButtons}
          </td>
        </tr>
      `;
    }).join('');
  },

  async loadAdminSupportDesk() {
    const container = document.getElementById('admin-support-tickets-container');
    const refreshBtn = document.getElementById('btn-admin-refresh-tickets');
    if (!container) return;

    if (refreshBtn && !refreshBtn.getAttribute('data-bound')) {
      refreshBtn.setAttribute('data-bound', 'true');
      refreshBtn.addEventListener('click', () => this.loadAdminSupportDesk());
    }

    try {
      const tickets = (api.admin && typeof api.admin.getTickets === 'function') ? await api.admin.getTickets() : [];
      if (!tickets || tickets.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 2rem;" class="text-muted">No open support desk tickets found.</div>`;
        return;
      }

      container.innerHTML = tickets.map(t => `
        <div class="card" style="margin-bottom: 1rem; border: 1px solid var(--border-color); padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem;">${escapeHtml(t.subject)}</h4>
              <div style="font-size: 0.75rem; color: var(--text-muted);">From: ${escapeHtml(t.userEmail)} | ${new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <span class="badge" style="background: ${t.status === 'Open' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${t.status === 'Open' ? '#ef4444' : '#10b981'}; font-weight: 700; font-size: 0.72rem;">
              ${escapeHtml(t.status)}
            </span>
          </div>
          <p style="font-size: 0.85rem; margin: 0.75rem 0; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(t.message)}</p>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div style="text-align:center; padding: 1.5rem; color: var(--color-danger);">Failed to load tickets: ${escapeHtml(err.message)}</div>`;
    }
};

if (typeof window !== 'undefined') {
  window.adminModule = adminModule;
}

export default adminModule;
