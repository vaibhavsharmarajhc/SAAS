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
    return !!(user && user.email && user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase());
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
      item.style.display = isSuper ? 'block' : 'none';
    });
  },

  async render() {
    const user = db.getUser() || JSON.parse(localStorage.getItem('currentUser') || '{}');
    const container = document.getElementById('superadmin-page-content') || document.getElementById('superadmin-page');
    if (!container) return;

    if (!this.isSuperAdmin(user)) {
      console.warn("Access denied: Super Admin console restricted.");
      container.innerHTML = `
        <div class="card" style="padding: 2.5rem; text-align: center; max-width: 600px; margin: 2rem auto;">
          <h3 style="color: var(--color-danger); margin-bottom: 0.75rem; font-size: 1.25rem;">⚠️ Access Denied</h3>
          <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
            Super Admin Console features are strictly restricted to platform administration account <strong>vaibhavsharmarajhc@gmail.com</strong>.
          </p>
        </div>
      `;
      return;
    }

    let data = null;
    try {
      data = await api.admin.getMetrics();
    } catch (err) {
      console.warn("Admin API fallback active:", err);
    }

    if (!data || !data.users || data.users.length === 0) {
      data = this.calculateLocalMetrics();
    }

    this.renderAdminConsole(container, data);
  },

  calculateLocalMetrics() {
    const clients = db.getClients() || [];
    const cases = db.getCases() || [];
    const txs = db.getTransactions() || [];
    const tasks = db.getTasks() || [];
    const currentUser = db.getUser() || { email: SUPER_ADMIN_EMAIL, lawyerName: 'Adv. Vaibhav Sharma', firmName: 'VSH Legal Chambers' };

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
              </tr>
            </thead>
            <tbody id="admin-users-table-body">
              ${this.renderUserRows(users)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();

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
        }
      });
    }
  },

  renderUserRows(users) {
    if (!users || users.length === 0) {
      return `<tr><td colspan="6" style="text-align:center; padding:2rem;" class="text-muted">No registered users match search filter.</td></tr>`;
    }

    return users.map(u => {
      let badgeBg = 'rgba(16, 185, 129, 0.15)';
      let badgeColor = '#10b981';
      let statusText = '🔥 High Activity';

      if (u.status === 'Moderate' || (u.casesCount > 2 && u.casesCount <= 10)) {
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
        </tr>
      `;
    }).join('');
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
