/**
 * Track My Chambers - Super Admin Platform Intelligence Module
 * Exclusively enabled for Super Admin account: vaibhavsharmarajhc@gmail.com
 */

import api from './api.js';
import db from './db.js';

const SUPER_ADMIN_EMAIL = 'vaibhavsharmarajhc@gmail.com';

const adminModule = {
  isSuperAdmin(user) {
    if (!user || !user.email) {
      try {
        user = db.getUser() || JSON.parse(localStorage.getItem('currentUser') || '{}');
      } catch (e) {}
    }
    const email = user && user.email ? user.email.toLowerCase().trim() : '';
    return email === SUPER_ADMIN_EMAIL.toLowerCase() || (user && user.role === 'superadmin');
  },

  init(user) {
    console.log("AdminModule: Initializing Super Admin Console...");
    this.updateAdminVisibility(user);
    this.setupCategorySettingsManager();
  },

  updateAdminVisibility(user) {
    const isSuper = this.isSuperAdmin(user);
    const adminNavItems = document.querySelectorAll('[data-target="superadmin-page"]');
    adminNavItems.forEach(item => {
      item.style.display = isSuper ? 'flex' : 'none';
    });
  },

  async render() {
    const user = db.getUser() || JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!this.isSuperAdmin(user)) {
      window.location.replace('/dashboard');
      return;
    }

    const container = document.getElementById('superadmin-page-content') || document.getElementById('superadmin-page');
    if (!container) return;

    // 1. Immediately render local metrics so console displays 100% instantly
    const localData = this.calculateLocalMetrics();
    this.renderAdminConsole(container, localData);
    this.loadAdminSupportDesk();

    // 2. Asynchronously update with server metrics if available
    try {
      const serverUsers = await api.admin.getUsers();
      const serverMetrics = await api.admin.getMetrics();
      const serverData = {
        ...serverMetrics,
        users: (Array.isArray(serverUsers) && serverUsers.length > 0) ? serverUsers : (serverMetrics.users || localData.users)
      };
      this.renderAdminConsole(container, serverData);
      this.loadAdminSupportDesk();
    } catch (err) {
      console.warn("Admin API async background update fallback active:", err);
    }
  },

  calculateLocalMetrics() {
    let clients = [];
    let cases = [];
    let txs = [];
    let tasks = [];
    let currentUser = { email: SUPER_ADMIN_EMAIL, lawyerName: 'Adv. Vaibhav Sharma', firmName: 'VSH Legal Chambers' };

    try { if (typeof db.getClients === 'function') clients = db.getClients() || []; } catch (e) {}
    try { if (typeof db.getCases === 'function') cases = db.getCases() || []; } catch (e) {}
    try { if (typeof db.getTransactions === 'function') txs = db.getTransactions() || []; } catch (e) {}
    try {
      if (typeof db.getTasks === 'function') tasks = db.getTasks() || [];
      else if (window.tasksModule && Array.isArray(window.tasksModule.tasks)) tasks = window.tasksModule.tasks;
    } catch (e) {}
    try { if (typeof db.getUser === 'function') currentUser = db.getUser() || currentUser; } catch (e) {}

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

    let html = `
      <!-- Privacy Integrity & Security Banner -->
      <div class="card" style="background: linear-gradient(135deg, rgba(217,119,6,0.08) 0%, rgba(16,185,129,0.08) 100%); border: 1px solid var(--color-primary); margin-bottom: 1.5rem; padding: 1.25rem;">
        <div style="display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
          <div style="background: var(--color-primary); color: #fff; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i data-lucide="shield-check" style="width: 24px; height: 24px;"></i>
          </div>
          <div style="flex: 1; min-width: 250px;">
            <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-primary);">Super Admin Platform Intelligence</h3>
            <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
              <strong style="color: var(--color-success);">Confidentiality Preserved:</strong> Client names, CNR numbers, and case contents remain end-to-end isolated and private to each respective advocate account. Below are aggregated platform adoption metrics and user activity telemetries.
            </p>
          </div>
        </div>
      </div>

      <!-- Platform KPI Overview Cards -->
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
            <span class="kpi-value">₹${totalRevenue.toLocaleString('en-IN')}</span>
          </div>
          <div class="kpi-icon-wrapper success"><i data-lucide="wallet"></i></div>
        </div>
      </div>

      <!-- User Engagement Directory & Activity Leaderboard -->
      <div class="card" style="padding: 1.25rem;">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <div>
            <h3 style="margin: 0; font-size: 1.1rem;">Registered User Engagement Leaderboard</h3>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Platform adoption, activity levels, and case usage metrics per advocate account</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%; max-width: 250px;">
            <input type="text" class="form-control" id="admin-user-search" placeholder="Search by lawyer or email..." style="font-size: 0.8rem; padding: 0.35rem 0.65rem;">
          </div>
        </div>

        <div class="table-responsive">
          <table class="table-custom" id="admin-users-table">
            <thead>
              <tr>
                <th>Advocate / Firm Name</th>
                <th>Account Email</th>
                <th>Registered Cases</th>
                <th>Work Tasks</th>
                <th>Revenue Processed</th>
                <th>Engagement Level</th>
                <th>Account Management Actions</th>
              </tr>
            </thead>
            <tbody id="admin-users-table-body">
              ${this.renderUserRows(users)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Platform Support Desk Management Panel -->
      <div class="card" style="padding: 1.25rem; margin-top: 1.5rem;">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <div>
            <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="help-circle" style="width: 18px; height: 18px; color: var(--color-primary);"></i> Chamber Support Desk Tickets
            </h3>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Review help tickets submitted by advocates, post official replies, and manage issue statuses</span>
          </div>
          <button type="button" class="btn btn-secondary" id="btn-admin-refresh-tickets" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; display: flex; align-items: center; gap: 4px;">
            <i data-lucide="rotate-cw" style="width: 12px; height: 12px;"></i> Refresh Tickets
          </button>
        </div>

        <div id="admin-support-tickets-container" style="display: flex; flex-direction: column; gap: 1rem;">
          <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">
            Loading chamber support tickets...
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();

    this.attachUserActionListeners(container, users);

    // Attach search filter listener
    const searchInput = document.getElementById('admin-user-search');
    if (searchInput) {
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

        // Store original admin session if not already stored
        if (!localStorage.getItem('adminSessionBackup')) {
          localStorage.setItem('adminSessionBackup', localStorage.getItem('currentUser') || '');
        }

        // Switch to impersonated view
        if (typeof window.switchView === 'function') {
          window.switchView('dashboard-page');
        }
      });
    });

    // 2. Suspend / Soft Delete Listener
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
          `Suspend account access for (${email})? The advocate will be blocked from logging in until reactivated.`;

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

    // 3. Permanent Hard Delete Listener
    container.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-user-id');
        const email = btn.getAttribute('data-user-email');

        if (email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase()) {
          alert("Action Protected: Super Admin account cannot be deleted.");
          return;
        }

        const mode = prompt(
          `ACCOUNT DELETION OPTIONS for (${email}):\n\n` +
          `1. Type 'SUSPEND' to Soft-Delete (block login access while keeping audit logs).\n` +
          `2. Type 'PURGE' to Hard-Delete (PERMANENTLY erase account and all cases/ledgers).\n\n` +
          `Enter your choice ('SUSPEND' or 'PURGE'):`
        );

        if (!mode) return;

        if (mode.trim().toUpperCase() === 'SUSPEND') {
          try {
            await api.admin.setUserSuspended(userId, true);
            alert(`Account (${email}) suspended successfully.`);
            this.render();
          } catch (err) {
            alert("Failed to suspend account: " + err.message);
          }
        } else if (mode.trim().toUpperCase() === 'PURGE') {
          const finalConfirm = prompt(`CRITICAL CONFIRMATION:\nType 'DELETE PERMANENT' to permanently purge (${email}):`);
          if (finalConfirm && finalConfirm.trim() === 'DELETE PERMANENT') {
            try {
              await api.admin.deleteUserAccountPermanent(userId);
              alert(`Account (${email}) and associated data permanently purged.`);
              this.render();
            } catch (err) {
              alert("Failed to delete account: " + err.message);
            }
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

      const displayName = u.lawyerName || u.firmName || 'Legal Advocate';
      const firmLabel = u.firmName && u.firmName !== displayName ? `<div style="font-size:0.7rem; color:var(--text-muted);">${u.firmName}</div>` : '';
      const isSuper = (u.email && u.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase());

      const actionButtons = isSuper ? 
        `<span style="font-size:0.75rem; color:var(--color-primary); font-weight:700;"><i data-lucide="shield"></i> Super Admin</span>` : 
        `
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-impersonate-user" data-user-id="${u.id}" data-user-email="${u.email}" data-user-name="${displayName}" style="padding:0.2rem 0.5rem; font-size:0.72rem;">
              <i data-lucide="eye" style="width:12px; height:12px;"></i> View Account
            </button>
            <button type="button" class="btn btn-secondary btn-suspend-user" data-user-id="${u.id}" data-user-email="${u.email}" data-suspended="${!!u.isSuspended}" style="padding:0.2rem 0.5rem; font-size:0.72rem; color: ${u.isSuspended ? '#10b981' : '#d97706'};">
              <i data-lucide="user-x" style="width:12px; height:12px;"></i> ${u.isSuspended ? 'Reactivate' : 'Suspend'}
            </button>
            <button type="button" class="btn btn-secondary btn-delete-user" data-user-id="${u.id}" data-user-email="${u.email}" style="padding:0.2rem 0.5rem; font-size:0.72rem; color:var(--color-danger);">
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
          <td style="font-size:0.8rem; color:var(--text-secondary);">${u.email}</td>
          <td style="font-size:0.85rem; font-weight:600;">${u.casesCount || 0} Case(s)</td>
          <td style="font-size:0.85rem;">${u.tasksCount || 0} Task(s)</td>
          <td style="font-size:0.85rem; font-weight:700; color:var(--color-success);">₹${(u.totalRevenue || 0).toLocaleString('en-IN')}</td>
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
      const tickets = await api.admin.getTickets();
      if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">
            No chamber support tickets submitted yet.
          </div>
        `;
        return;
      }

      // Sort tickets desc by creation date
      tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      let html = '';
      tickets.forEach(ticket => {
        const dateStr = new Date(ticket.createdAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const statusOptions = ['Open', 'In Progress', 'Resolved'].map(st => 
          `<option value="${st}" ${ticket.status === st ? 'selected' : ''}>${st}</option>`
        ).join('');

        let repliesHtml = '';
        if (ticket.replies && ticket.replies.length > 0) {
          repliesHtml = `
            <div style="margin-top: 0.85rem; border-top: 1px dashed var(--border-color); padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.6rem;">
              <div style="font-size: 0.68rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.5px;">Ticket Thread</div>
              ${ticket.replies.map(r => `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.75rem;">
                  <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                    <strong style="color: #fff;">${r.sender} <span style="font-weight:400; color:var(--text-muted); font-size:0.68rem;">(${r.role})</span></strong>
                    <span style="color: var(--text-muted); font-size: 0.65rem;">${new Date(r.date).toLocaleDateString()}</span>
                  </div>
                  <div style="color: #cbd5e1; line-height: 1.4;">${r.text}</div>
                </div>
              `).join('')}
            </div>
          `;
        }

        html += `
          <div class="card admin-ticket-card" data-ticket-id="${ticket.id}" style="background: rgba(17, 24, 39, 0.4); border: 1px solid var(--border-color); padding: 1rem; border-radius: 8px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
              <div>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <span style="font-size: 0.65rem; color: var(--color-primary); font-weight: 700; background: rgba(217,119,6,0.1); padding: 2px 6px; border-radius: 4px;">TICKET #${ticket.id.split('_')[1] || ticket.id}</span>
                  <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600;">${ticket.category}</span>
                </div>
                <h4 style="color: #fff; margin: 2px 0 4px 0; font-size: 0.95rem; font-weight: 600;">${ticket.subject}</h4>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                  Advocate: <strong style="color: var(--text-primary);">${ticket.tenantLawyerName || 'Advocate'}</strong> (${ticket.tenantFirmName || 'Chamber'}) &bull; ${ticket.tenantEmail || ''}
                </div>
                <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0; line-height: 1.4; white-space: pre-wrap;">${ticket.description}</p>
              </div>

              <!-- Status Dropdown Select -->
              <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                <label style="font-size: 0.68rem; color: var(--text-muted); font-weight: 600;">Status:</label>
                <select class="form-control admin-ticket-status-select" data-ticket-id="${ticket.id}" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; min-height: 32px; background: rgba(0,0,0,0.3);">
                  ${statusOptions}
                </select>
                <span style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Raised: ${dateStr}</span>
              </div>
            </div>

            ${repliesHtml}

            <!-- Reply Form -->
            <form class="admin-ticket-reply-form" data-ticket-id="${ticket.id}" style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
              <input type="text" class="form-control admin-reply-input" placeholder="Type official response from Super Admin..." style="font-size: 0.8rem; min-height: 34px;" required>
              <button type="submit" class="btn btn-primary" style="font-size: 0.78rem; padding: 0.35rem 0.85rem; min-height: 34px; white-space: nowrap;">
                Send Reply
              </button>
            </form>
          </div>
        `;
      });

      container.innerHTML = html;
      if (typeof safeCreateIcons === 'function') safeCreateIcons(container);

      // Attach status change listeners
      container.querySelectorAll('.admin-ticket-status-select').forEach(select => {
        select.addEventListener('change', async (e) => {
          const ticketId = select.getAttribute('data-ticket-id');
          const newStatus = e.target.value;
          try {
            await api.admin.updateTicketStatus(ticketId, newStatus);
            this.loadAdminSupportDesk();
          } catch (err) {
            alert("Failed to update status: " + err.message);
          }
        });
      });

      // Attach reply submission listeners
      container.querySelectorAll('.admin-ticket-reply-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const ticketId = form.getAttribute('data-ticket-id');
          const input = form.querySelector('.admin-reply-input');
          const replyText = input.value.trim();
          if (!replyText) return;

          try {
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Sending...';

            await api.admin.replyTicket(ticketId, replyText);
            this.loadAdminSupportDesk();
          } catch (err) {
            alert("Failed to send reply: " + err.message);
          }
        });
      });

    } catch (err) {
      container.innerHTML = `
        <div style="color: var(--color-danger); padding: 1rem; text-align: center; font-size: 0.85rem;">
          Failed to load support tickets: ${err.message}
        </div>
      `;
    }
  },

  setupCategorySettingsManager() {
    const list = document.getElementById('settings-categories-list');
    const addBtn = document.getElementById('btn-add-settings-category');
    if (!list) return;

    const renderList = () => {
      const categories = db.getCategories();
      list.innerHTML = categories.map(c => `
        <div class="card" style="padding:0.6rem 0.8rem; display:flex; justify-content:space-between; align-items:center; background:var(--bg-sidebar); border:1px solid var(--border-color); border-radius:var(--radius-sm);">
          <div style="display:flex; align-items:center; gap:8px; flex-grow:1; min-width:0; margin-right:8px;">
            <span style="width:12px; height:12px; border-radius:50%; background:${c.color}; flex-shrink:0; display:inline-block;"></span>
            <span style="font-size:0.85rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</span>
          </div>
          <div style="display:flex; gap:4px;">
            <button type="button" class="btn btn-secondary btn-edit-cat" data-id="${c.id}" data-name="${c.name}" style="padding:0.2rem 0.4rem; font-size:0.7rem;"><i data-lucide="edit-2"></i></button>
            <button type="button" class="btn btn-secondary btn-del-cat" data-id="${c.id}" data-name="${c.name}" style="padding:0.2rem 0.4rem; font-size:0.7rem; color:var(--color-danger);"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `).join('');
      if (typeof safeCreateIcons === 'function') safeCreateIcons(list);

      // Edit listeners
      list.querySelectorAll('.btn-edit-cat').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const currentName = btn.getAttribute('data-name');
          const newName = prompt("Rename Category:", currentName);
          if (newName && newName.trim() && newName.trim() !== currentName) {
            await db.updateCategory(id, newName.trim());
            renderList();
          }
        });
      });

      // Delete listeners
      list.querySelectorAll('.btn-del-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          const modal = document.getElementById('reassign-category-modal');
          const targetIdInput = document.getElementById('reassign-category-target-id');
          const targetNameSpan = document.getElementById('reassign-category-target-name');
          const select = document.getElementById('reassign-category-select');

          if (!modal || !select) return;

          targetIdInput.value = id;
          targetNameSpan.textContent = name;

          const remaining = db.getCategories().filter(c => c.id !== id);
          select.innerHTML = remaining.map(c => `<option value="${c.name}">${c.name}</option>`).join('') + '<option value="Uncategorized" selected>Uncategorized (Default)</option>';

          modal.classList.add('active');
        });
      });
    };

    renderList();

    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const catName = prompt("Enter new Case Category name:");
        if (catName && catName.trim()) {
          await db.addCategory(catName.trim());
          renderList();
        }
      });
    }

    // Modal submit listener
    const reassignForm = document.getElementById('reassign-category-form');
    const reassignModal = document.getElementById('reassign-category-modal');
    const reassignCancel = document.getElementById('reassign-category-cancel');
    const reassignClose = document.getElementById('reassign-category-close');

    if (reassignForm) {
      reassignForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetId = document.getElementById('reassign-category-target-id').value;
        const replacementName = document.getElementById('reassign-category-select').value;
        await db.deleteCategory(targetId, replacementName);
        reassignModal.classList.remove('active');
        renderList();
      });
    }
    if (reassignCancel) reassignCancel.addEventListener('click', () => reassignModal.classList.remove('active'));
    if (reassignClose) reassignClose.addEventListener('click', () => reassignModal.classList.remove('active'));

    document.addEventListener('categoriesUpdated', () => renderList());
  }
};

export default adminModule;
