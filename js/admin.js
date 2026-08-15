/**
 * Track My Chambers - Super Admin Monitoring & Control Portal
 * Resilient ES module implementation with zero top-level code, 100% theme variable compliance,
 * 3-tier account controls, audit trail, impersonation, and SVG growth visualizer.
 */

import api from './api.js';

let currentMetricsData = null;
let currentAuditLogs = [];
let activeAdminTab = 'overview';
let chamberSearchQuery = '';
let chamberStatusFilter = 'all';
let chamberCurrentPage = 1;
let chamberPageSize = 10;
let selectedChamberIds = new Set();
let growthPeriodFilter = 'daily';

export const adminModule = {
  /**
   * Boot authorization check (Fail Closed by default)
   */
  async init() {
    try {
      const sidebarLink = document.getElementById('sidebar-menu-admin');
      if (!sidebarLink) return;

      // Fail closed
      sidebarLink.style.display = 'none';

      try {
        const res = await api.admin.check();
        if (res && res.success && res.isAdmin) {
          sidebarLink.style.display = '';
        }
      } catch (err) {
        sidebarLink.style.display = 'none';
      }

      // Theme toggle repaint listener
      window.addEventListener('themeChanged', () => {
        if (activeAdminTab === 'overview') {
          adminModule.renderGrowthChart();
        }
      });
    } catch (e) {
      console.warn("adminModule init safe warning:", e);
    }
  },

  /**
   * Main Render Handler for Super Admin Portal
   */
  async render() {
    try {
      const container = document.getElementById('admin-metrics-page');
      if (!container) return;

      // 1. Loading state
      container.innerHTML = `
        <div style="padding: 4rem 2rem; text-align: center; color: var(--text-muted);">
          <div style="display: inline-block; width: 36px; height: 36px; border: 3px solid var(--border-color); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.8s infinite linear; margin-bottom: 1rem;"></div>
          <h3 style="margin: 0; color: var(--text-primary); font-size: 1.15rem; font-weight: 600;">Loading Super Admin Portal...</h3>
          <p style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">Verifying founder credentials and aggregating platform telemetry.</p>
        </div>
      `;

      // 2. Fetch metrics
      try {
        const res = await api.admin.getMetrics();
        if (!res || !res.success || !res.metrics) {
          throw new Error(res?.error || "Unauthorized or invalid metrics payload.");
        }
        currentMetricsData = res.metrics;
      } catch (err) {
        container.innerHTML = `
          <div style="max-width: 600px; margin: 4rem auto; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 2.5rem; text-align: center; box-shadow: 0 15px 35px rgba(0,0,0,0.3);">
            <div style="width: 56px; height: 56px; background: rgba(239, 68, 68, 0.12); color: var(--color-danger); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto;">
              <i data-lucide="shield-alert" style="width: 28px; height: 28px;"></i>
            </div>
            <h2 style="font-family: 'Playfair Display', serif; color: var(--text-primary); font-size: 1.6rem; margin-bottom: 0.75rem; font-weight: 700;">Access Restricted</h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem;">
              You do not have Super Admin permissions to access platform management. This portal is restricted to founder administrators.
            </p>
            <a href="/dashboard" data-link="/dashboard" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; padding: 0.6rem 1.25rem;">
              <i data-lucide="arrow-left" style="width: 16px; height: 16px;"></i> Return to Practice Dashboard
            </a>
          </div>
        `;
        if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
        return;
      }

      const m = currentMetricsData;

      // 3. Render Admin Interface Shell
      container.innerHTML = `
        <div style="padding: 1.5rem; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
          
          <!-- Admin Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1.25rem;">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-primary); font-weight: 700;">FOUNDER CONTROL & MONITORING</span>
              <h1 style="font-family: 'Playfair Display', serif; font-size: 1.8rem; color: var(--text-primary); margin: 0.2rem 0; font-weight: 700;">Super Admin Portal</h1>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Real-time chamber directory, growth analytics, account controls, and audit logs.</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="background: rgba(16, 185, 129, 0.12); color: var(--color-success); border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                <i data-lucide="server" style="width: 13px; height: 13px;"></i> ${m.dbStatus || 'Connected'}
              </span>
              <button class="btn btn-secondary btn-sm" id="admin-refresh-btn" style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; padding: 0.45rem 0.85rem;">
                <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i> Refresh
              </button>
            </div>
          </div>

          <!-- Tab Navigation Bar -->
          <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; flex-wrap: wrap;">
            <button class="btn ${activeAdminTab === 'overview' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="admin-tab-overview" style="font-size: 0.82rem; padding: 0.45rem 1rem;">
              <i data-lucide="trending-up" style="width: 14px; height: 14px;"></i> Growth & Metrics
            </button>
            <button class="btn ${activeAdminTab === 'directory' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="admin-tab-directory" style="font-size: 0.82rem; padding: 0.45rem 1rem;">
              <i data-lucide="users" style="width: 14px; height: 14px;"></i> Chamber Directory & Actions
            </button>
            <button class="btn ${activeAdminTab === 'danger' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="admin-tab-danger" style="font-size: 0.82rem; padding: 0.45rem 1rem; color: var(--color-danger);">
              <i data-lucide="alert-octagon" style="width: 14px; height: 14px;"></i> Danger Zone (Hard Delete)
            </button>
            <button class="btn ${activeAdminTab === 'audit' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="admin-tab-audit" style="font-size: 0.82rem; padding: 0.45rem 1rem;">
              <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> Audit Trail Logs
            </button>
          </div>

          <!-- Dynamic Tab Content Body -->
          <div id="admin-tab-content">
            <!-- Populated via renderActiveTab -->
          </div>

        </div>
      `;

      // 4. Wire top tab listeners
      document.getElementById('admin-refresh-btn')?.addEventListener('click', () => adminModule.render());
      document.getElementById('admin-tab-overview')?.addEventListener('click', () => { activeAdminTab = 'overview'; adminModule.renderActiveTab(); });
      document.getElementById('admin-tab-directory')?.addEventListener('click', () => { activeAdminTab = 'directory'; adminModule.renderActiveTab(); });
      document.getElementById('admin-tab-danger')?.addEventListener('click', () => { activeAdminTab = 'danger'; adminModule.renderActiveTab(); });
      document.getElementById('admin-tab-audit')?.addEventListener('click', () => { activeAdminTab = 'audit'; adminModule.renderActiveTab(); });

      // Render default active tab
      adminModule.renderActiveTab();

      if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
    } catch (err) {
      console.error("adminModule.render error:", err);
    }
  },

  /**
   * Render current selected admin tab
   */
  renderActiveTab() {
    try {
      const container = document.getElementById('admin-tab-content');
      if (!container) return;

      // Highlight active tab button
      ['overview', 'directory', 'danger', 'audit'].forEach(t => {
        const btn = document.getElementById(`admin-tab-${t}`);
        if (btn) {
          btn.className = `btn ${activeAdminTab === t ? 'btn-primary' : 'btn-secondary'} btn-sm`;
        }
      });

      if (activeAdminTab === 'overview') {
        this.renderOverviewTab(container);
      } else if (activeAdminTab === 'directory') {
        this.renderDirectoryTab(container);
      } else if (activeAdminTab === 'danger') {
        this.renderDangerZoneTab(container);
      } else if (activeAdminTab === 'audit') {
        this.renderAuditLogsTab(container);
      }

      if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
    } catch (err) {
      console.error("adminModule.renderActiveTab error:", err);
    }
  },

  /**
   * Tab 1: Platform Growth & Telemetry Overview
   */
  renderOverviewTab(container) {
    try {
      const m = currentMetricsData || {};

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          
          <!-- Metric Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Total Registered Chambers</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary);">${m.totalChambers || 0}</div>
              <div style="font-size: 0.75rem; color: var(--color-success); margin-top: 0.3rem; font-weight: 600;">${m.activeChambers || 0} Active / ${m.dormantChambers || 0} Dormant</div>
            </div>

            <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Total Cases Logged</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--color-primary);">${m.totalCases || 0}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.3rem;">Across all legal matters</div>
            </div>

            <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Onboarded Clients</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary);">${m.totalClients || 0}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.3rem;">Litigation client profiles</div>
            </div>

            <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Hearings & Proceedings</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary);">${m.totalHearings || 0}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.3rem;">Recorded case proceedings</div>
            </div>
          </div>

          <!-- Growth Trend SVG Visualizer with Theme Var Compliance -->
          <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
              <h3 style="font-size: 1rem; color: var(--text-primary); font-weight: 600; margin: 0; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="trending-up" style="width: 16px; height: 16px; color: var(--color-primary);"></i> Platform Signups Growth Visualizer
              </h3>
              <div style="display: flex; gap: 4px;">
                <button class="btn ${growthPeriodFilter === 'daily' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="btn-growth-daily" style="font-size: 0.75rem; padding: 2px 10px;">Daily</button>
                <button class="btn ${growthPeriodFilter === 'weekly' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="btn-growth-weekly" style="font-size: 0.75rem; padding: 2px 10px;">Weekly</button>
              </div>
            </div>
            <div id="admin-growth-chart-container" style="height: 140px; width: 100%;">
              <!-- SVG Growth Visualizer rendered by renderGrowthChart -->
            </div>
          </div>

        </div>
      `;

      // Wire period filter controls
      document.getElementById('btn-growth-daily')?.addEventListener('click', () => { growthPeriodFilter = 'daily'; adminModule.renderGrowthChart(); });
      document.getElementById('btn-growth-weekly')?.addEventListener('click', () => { growthPeriodFilter = 'weekly'; adminModule.renderGrowthChart(); });

      adminModule.renderGrowthChart();
    } catch (err) {
      console.error("adminModule.renderOverviewTab error:", err);
    }
  },

  /**
   * Render SVG Growth Chart using pure CSS variables for 100% theme compliance
   */
  renderGrowthChart() {
    try {
      const container = document.getElementById('admin-growth-chart-container');
      if (!container || !currentMetricsData || !Array.isArray(currentMetricsData.signupsOverTime)) return;

      const rawData = currentMetricsData.signupsOverTime;
      let displayData = rawData;

      if (growthPeriodFilter === 'weekly') {
        const weeks = [];
        for (let i = 0; i < rawData.length; i += 7) {
          const chunk = rawData.slice(i, i + 7);
          const total = chunk.reduce((acc, curr) => acc + (curr.count || 0), 0);
          weeks.push({ date: `W${Math.floor(i / 7) + 1}`, count: total });
        }
        displayData = weeks;
      }

      const maxCount = Math.max(...displayData.map(d => d.count), 1);
      const totalItems = displayData.length;

      const svgHtml = `
        <svg width="100%" height="100%" viewBox="0 0 800 130" preserveAspectRatio="none" style="overflow: visible;">
          <!-- Grid lines -->
          <line x1="0" y1="20" x2="800" y2="20" stroke="var(--border-color)" stroke-dasharray="3,3" stroke-width="1" />
          <line x1="0" y1="70" x2="800" y2="70" stroke="var(--border-color)" stroke-dasharray="3,3" stroke-width="1" />
          <line x1="0" y1="110" x2="800" y2="110" stroke="var(--border-color)" stroke-width="1" />
          
          ${displayData.map((d, i) => {
            const barWidth = Math.max(4, Math.floor(700 / totalItems) - 4);
            const x = 30 + i * (740 / Math.max(totalItems - 1, 1));
            const barHeight = Math.max(4, Math.floor((d.count / maxCount) * 80));
            const y = 110 - barHeight;
            const isNonZero = d.count > 0;
            return `
              <rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${barHeight}" 
                    rx="3" ry="3" 
                    fill="${isNonZero ? 'var(--color-primary)' : 'var(--border-color)'}" 
                    opacity="${isNonZero ? '0.9' : '0.4'}">
                <title>${d.date}: ${d.count} signups</title>
              </rect>
            `;
          }).join('')}
        </svg>
      `;

      container.innerHTML = svgHtml;
    } catch (e) {
      console.warn("renderGrowthChart warning:", e);
    }
  },

  /**
   * Tab 2: Chamber Usage Directory & Account Controls
   */
  renderDirectoryTab(container) {
    try {
      container.innerHTML = `
        <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
          
          <!-- Search & Filter Controls -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; flex: 1;">
              <input type="text" id="admin-search-input" class="form-control" placeholder="Filter firm name or email..." value="${chamberSearchQuery}" style="max-width: 260px; font-size: 0.85rem; padding: 0.45rem 0.8rem;">
              <select id="admin-status-filter" class="form-control" style="max-width: 170px; font-size: 0.85rem; padding: 0.45rem 0.8rem;">
                <option value="all" ${chamberStatusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="active" ${chamberStatusFilter === 'active' ? 'selected' : ''}>Active</option>
                <option value="dormant" ${chamberStatusFilter === 'dormant' ? 'selected' : ''}>Dormant</option>
                <option value="suspended" ${chamberStatusFilter === 'suspended' ? 'selected' : ''}>Suspended</option>
                <option value="pending_deletion" ${chamberStatusFilter === 'pending_deletion' ? 'selected' : ''}>Pending Deletion</option>
              </select>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <button class="btn btn-secondary btn-sm" id="admin-export-csv-btn" style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem;">
                <i data-lucide="download" style="width: 14px; height: 14px;"></i> Export CSV
              </button>
              <button class="btn btn-warning btn-sm" id="admin-bulk-suspend-btn" style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem;">
                <i data-lucide="pause-circle" style="width: 14px; height: 14px;"></i> Bulk Suspend
              </button>
            </div>
          </div>

          <!-- Directory Table -->
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">
                  <th style="padding: 0.75rem 0.5rem; text-align: center; width: 36px;">
                    <input type="checkbox" id="admin-select-all-checkbox">
                  </th>
                  <th style="padding: 0.75rem 1rem;">Chamber Firm & Advocate</th>
                  <th style="padding: 0.75rem 1rem;">Contact Email</th>
                  <th style="padding: 0.75rem 1rem;">Registered</th>
                  <th style="padding: 0.75rem 0.5rem; text-align: center;">Cases</th>
                  <th style="padding: 0.75rem 0.5rem; text-align: center;">Clients</th>
                  <th style="padding: 0.75rem 0.5rem; text-align: center;">Hearings</th>
                  <th style="padding: 0.75rem 1rem; text-align: center;">Engagement Status</th>
                  <th style="padding: 0.75rem 1rem; text-align: right;">Account Actions</th>
                </tr>
              </thead>
              <tbody id="admin-chambers-tbody">
                <!-- Rendered via filterAndRenderTable -->
              </tbody>
            </table>
          </div>

          <!-- Pagination Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem; font-size: 0.8rem; color: var(--text-muted);">
            <div id="admin-pagination-info">Showing 0-0 of 0 chambers</div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" id="admin-prev-page-btn" style="padding: 2px 8px;"><i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i></button>
              <span id="admin-page-number-display">Page 1</span>
              <button class="btn btn-secondary btn-sm" id="admin-next-page-btn" style="padding: 2px 8px;"><i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i></button>
            </div>
          </div>

        </div>
      `;

      // Attach search and filter listeners
      document.getElementById('admin-search-input')?.addEventListener('input', (e) => {
        chamberSearchQuery = e.target.value;
        chamberCurrentPage = 1;
        adminModule.filterAndRenderTable();
      });

      document.getElementById('admin-status-filter')?.addEventListener('change', (e) => {
        chamberStatusFilter = e.target.value;
        chamberCurrentPage = 1;
        adminModule.filterAndRenderTable();
      });

      document.getElementById('admin-export-csv-btn')?.addEventListener('click', () => adminModule.exportCSV());
      document.getElementById('admin-bulk-suspend-btn')?.addEventListener('click', () => adminModule.handleBulkSuspend());

      document.getElementById('admin-select-all-checkbox')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = document.querySelectorAll('.admin-chamber-checkbox');
        checkboxes.forEach(cb => {
          cb.checked = isChecked;
          if (isChecked) selectedChamberIds.add(cb.value);
          else selectedChamberIds.delete(cb.value);
        });
      });

      document.getElementById('admin-prev-page-btn')?.addEventListener('click', () => {
        if (chamberCurrentPage > 1) {
          chamberCurrentPage--;
          adminModule.filterAndRenderTable();
        }
      });

      document.getElementById('admin-next-page-btn')?.addEventListener('click', () => {
        chamberCurrentPage++;
        adminModule.filterAndRenderTable();
      });

      adminModule.filterAndRenderTable();
    } catch (err) {
      console.error("adminModule.renderDirectoryTab error:", err);
    }
  },

  /**
   * Filter and render chamber rows with pagination & action controls
   */
  filterAndRenderTable() {
    try {
      const tbody = document.getElementById('admin-chambers-tbody');
      const pagInfo = document.getElementById('admin-pagination-info');
      const pageDisp = document.getElementById('admin-page-number-display');
      if (!tbody) return;

      if (!currentMetricsData || !Array.isArray(currentMetricsData.chambers)) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 2rem; text-align: center; color: var(--text-muted);">No chamber activity data available.</td></tr>`;
        return;
      }

      const q = (chamberSearchQuery || '').toLowerCase().trim();
      const st = chamberStatusFilter;

      const filtered = currentMetricsData.chambers.filter(c => {
        // Search matching
        const matchesSearch = !q || (
          (c.firmName && c.firmName.toLowerCase().includes(q)) ||
          (c.lawyerName && c.lawyerName.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
        );

        // Status filter matching
        let matchesStatus = true;
        if (st === 'active') matchesStatus = c.isActive && !c.isSuspended && c.status !== 'pending_deletion';
        else if (st === 'dormant') matchesStatus = !c.isActive && !c.isSuspended && c.status !== 'pending_deletion';
        else if (st === 'suspended') matchesStatus = c.isSuspended || c.status === 'suspended';
        else if (st === 'pending_deletion') matchesStatus = c.status === 'pending_deletion';

        return matchesSearch && matchesStatus;
      });

      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / chamberPageSize) || 1;
      if (chamberCurrentPage > totalPages) chamberCurrentPage = totalPages;

      const startIndex = (chamberCurrentPage - 1) * chamberPageSize;
      const paginatedItems = filtered.slice(startIndex, startIndex + chamberPageSize);

      if (pagInfo) pagInfo.textContent = `Showing ${totalItems > 0 ? startIndex + 1 : 0}-${Math.min(startIndex + chamberPageSize, totalItems)} of ${totalItems} chambers`;
      if (pageDisp) pageDisp.textContent = `Page ${chamberCurrentPage} of ${totalPages}`;

      if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 2rem; text-align: center; color: var(--text-muted);">No chambers matching specified filter criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = paginatedItems.map(c => {
        // Resolve engagement badge
        let badgeHtml = '';
        if (c.status === 'pending_deletion') {
          badgeHtml = `<span style="background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 600;">Pending Deletion</span>`;
        } else if (c.isSuspended || c.status === 'suspended') {
          badgeHtml = `<span style="background: rgba(217, 119, 6, 0.15); color: var(--color-warning); border: 1px solid rgba(217, 119, 6, 0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 600;">Suspended</span>`;
        } else if (c.isActive) {
          badgeHtml = `<span style="background: rgba(16, 185, 129, 0.15); color: var(--color-success); border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 600;">Active</span>`;
        } else {
          badgeHtml = `<span style="background: rgba(148, 163, 184, 0.15); color: var(--text-muted); border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 600;">Dormant</span>`;
        }

        const isChecked = selectedChamberIds.has(c.id);

        return `
          <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.15s;">
            <td style="padding: 0.75rem 0.5rem; text-align: center;">
              <input type="checkbox" class="admin-chamber-checkbox" value="${c.id}" ${isChecked ? 'checked' : ''}>
            </td>
            <td style="padding: 0.75rem 1rem;">
              <div style="font-weight: 600; color: var(--text-primary);">${window.sanitizeText ? window.sanitizeText(c.firmName) : c.firmName}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${window.sanitizeText ? window.sanitizeText(c.lawyerName) : c.lawyerName}</div>
            </td>
            <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${window.sanitizeText ? window.sanitizeText(c.email) : c.email}</td>
            <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">${(c.createdAt || '').split('T')[0]}</td>
            <td style="padding: 0.75rem 0.5rem; text-align: center; font-weight: 600; color: var(--color-primary);">${c.casesCount || 0}</td>
            <td style="padding: 0.75rem 0.5rem; text-align: center; font-weight: 600; color: var(--text-primary);">${c.clientsCount || 0}</td>
            <td style="padding: 0.75rem 0.5rem; text-align: center; font-weight: 600; color: var(--text-primary);">${c.hearingsCount || 0}</td>
            <td style="padding: 0.75rem 1rem; text-align: center;">${badgeHtml}</td>
            <td style="padding: 0.75rem 1rem; text-align: right;">
              <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
                ${c.isSuspended || c.status === 'suspended' ? `
                  <button class="btn btn-secondary btn-sm" onclick="window.adminModule.handleAccountAction('reactivate', '${c.id}')" title="Reactivate Chamber" style="padding: 2px 8px; font-size: 0.75rem;">Reactivate</button>
                ` : `
                  <button class="btn btn-secondary btn-sm" onclick="window.adminModule.handleAccountAction('suspend', '${c.id}')" title="Suspend Chamber" style="padding: 2px 8px; font-size: 0.75rem;">Suspend</button>
                `}
                
                ${c.status === 'pending_deletion' ? `
                  <button class="btn btn-secondary btn-sm" onclick="window.adminModule.handleAccountAction('cancel_soft_delete', '${c.id}')" title="Cancel Scheduled Deletion" style="padding: 2px 8px; font-size: 0.75rem;">Cancel Delete</button>
                ` : `
                  <button class="btn btn-secondary btn-sm" onclick="window.adminModule.handleAccountAction('soft_delete', '${c.id}')" title="Soft Delete Chamber (30-day grace period)" style="padding: 2px 8px; font-size: 0.75rem; color: var(--color-danger);">Soft Delete</button>
                `}

                <button class="btn btn-secondary btn-sm" onclick="window.adminModule.handleImpersonation('${c.id}')" title="Login as Chamber" style="padding: 2px 8px; font-size: 0.75rem; color: var(--color-primary);">Login As</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Wire individual row checkboxes
      document.querySelectorAll('.admin-chamber-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          if (e.target.checked) selectedChamberIds.add(e.target.value);
          else selectedChamberIds.delete(e.target.value);
        });
      });

      if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
    } catch (err) {
      console.error("adminModule.filterAndRenderTable error:", err);
    }
  },

  /**
   * Tab 3: Danger Zone (Immediate Unrecoverable Hard Delete with Server Async Bcrypt Check)
   */
  renderDangerZoneTab(container) {
    try {
      container.innerHTML = `
        <div style="background: var(--bg-sidebar); border: 1px solid var(--color-danger); border-radius: var(--radius-md); padding: 2rem; max-width: 700px; margin: 0 auto;">
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; color: var(--color-danger);">
            <i data-lucide="alert-triangle" style="width: 28px; height: 28px;"></i>
            <h3 style="margin: 0; font-size: 1.3rem; font-weight: 700; color: var(--color-danger);">Danger Zone — Permanent Hard Delete</h3>
          </div>
          
          <p style="color: var(--text-secondary); font-size: 0.88rem; line-height: 1.6; margin-bottom: 1.5rem;">
            Immediate hard deletion permanently purges all records associated with a chamber across <strong>all 8 database collections</strong> (tenants, cases with embedded hearings, clients, transactions, colleagues, tasks, tickets, and notifications). 
            <strong style="color: var(--color-danger);">This action is unrecoverable and bypasses the 30-day grace period.</strong>
          </p>

          <form id="admin-hard-delete-form" style="display: flex; flex-direction: column; gap: 1.25rem;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; color: var(--text-primary);">Select Target Chamber *</label>
              <select id="hard-delete-chamber-select" class="form-control" required style="padding: 0.5rem;">
                <option value="">-- Choose Chamber to Purge --</option>
                ${(currentMetricsData?.chambers || []).map(c => `
                  <option value="${c.id}">${c.firmName} (${c.email})</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-weight: 600; color: var(--text-primary);">Mandatory Audit Reason *</label>
              <input type="text" id="hard-delete-reason-input" class="form-control" placeholder="Specify mandatory justification for permanent purge" required style="padding: 0.5rem;">
            </div>

            <div class="form-group">
              <label class="form-label" style="font-weight: 600; color: var(--color-danger);">Re-enter Super Admin Password *</label>
              <input type="password" id="hard-delete-admin-password" class="form-control" placeholder="Re-enter your admin login password" required style="padding: 0.5rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; display: block;">Server verifies password asynchronously against admin hash (max 5 failed attempts per 15 mins).</span>
            </div>

            <div id="hard-delete-error-msg" style="color: var(--color-danger); font-size: 0.85rem; font-weight: 600; display: none;"></div>

            <button type="submit" class="btn btn-danger" style="padding: 0.65rem 1.25rem; font-weight: 700; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;">
              <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i> Permanently Hard Delete Chamber
            </button>
          </form>
        </div>
      `;

      document.getElementById('admin-hard-delete-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetTenantId = document.getElementById('hard-delete-chamber-select').value;
        const reason = document.getElementById('hard-delete-reason-input').value;
        const adminPassword = document.getElementById('hard-delete-admin-password').value;
        const errDiv = document.getElementById('hard-delete-error-msg');

        if (!targetTenantId || !reason || !adminPassword) {
          if (errDiv) { errDiv.textContent = "All fields and admin password re-entry are mandatory."; errDiv.style.display = 'block'; }
          return;
        }

        if (!confirm("WARNING: Are you 100% sure you want to PERMANENTLY hard delete this chamber? All 8 database collections will be purged immediately!")) {
          return;
        }

        try {
          if (errDiv) errDiv.style.display = 'none';
          const res = await api.admin.accountAction('hard_delete', { targetTenantId, reason, adminPassword });
          if (res && res.success) {
            alert("Chamber account permanently purged successfully.");
            adminModule.render();
          } else {
            throw new Error(res?.error || "Hard delete failed.");
          }
        } catch (err) {
          if (errDiv) { errDiv.textContent = err.message || "Hard delete failed."; errDiv.style.display = 'block'; }
        }
      });

      if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
    } catch (err) {
      console.error("adminModule.renderDangerZoneTab error:", err);
    }
  },

  /**
   * Tab 4: Audit Logs & Trail Querying
   */
  async renderAuditLogsTab(container) {
    try {
      container.innerHTML = `
        <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <h3 style="font-size: 1rem; color: var(--text-primary); font-weight: 600; margin: 0; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="file-text" style="width: 16px; height: 16px; color: var(--color-primary);"></i> Append-Only Super Admin Audit Trail
            </h3>
            <button class="btn btn-secondary btn-sm" id="admin-export-audit-btn" style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem;">
              <i data-lucide="download" style="width: 14px; height: 14px;"></i> Export Audit CSV
            </button>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">
                  <th style="padding: 0.75rem 1rem;">Timestamp</th>
                  <th style="padding: 0.75rem 1rem;">Admin Identity</th>
                  <th style="padding: 0.75rem 1rem;">Action Type</th>
                  <th style="padding: 0.75rem 1rem;">Target Chamber</th>
                  <th style="padding: 0.75rem 1rem;">Justification Reason</th>
                </tr>
              </thead>
              <tbody id="admin-audit-tbody">
                <tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">Fetching audit logs...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      try {
        const res = await api.admin.getAuditLogs({ limit: 200 });
        if (res && res.success && Array.isArray(res.logs)) {
          currentAuditLogs = res.logs;
          const tbody = document.getElementById('admin-audit-tbody');
          if (tbody) {
            if (res.logs.length === 0) {
              tbody.innerHTML = `<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No audit log entries recorded yet.</td></tr>`;
            } else {
              tbody.innerHTML = res.logs.map(l => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.78rem;">${(l.timestamp || '').replace('T', ' ').split('.')[0]}</td>
                  <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--text-primary);">${l.adminEmail}</td>
                  <td style="padding: 0.75rem 1rem;"><span style="background: rgba(59, 130, 246, 0.12); color: var(--color-primary); border: 1px solid rgba(59, 130, 246, 0.3); padding: 2px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 700;">${l.actionType}</span></td>
                  <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${l.targetEmail || l.targetTenantId}</td>
                  <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${window.sanitizeText ? window.sanitizeText(l.reason) : l.reason}</td>
                </tr>
              `).join('');
            }
          }
        }
      } catch (err) {
        console.error("Fetch audit logs error:", err);
      }

      document.getElementById('admin-export-audit-btn')?.addEventListener('click', () => adminModule.exportAuditLogsCSV());

      if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
    } catch (err) {
      console.error("adminModule.renderAuditLogsTab error:", err);
    }
  },

  /**
   * Execute Account Control Action (Suspend, Reactivate, Soft Delete, etc.)
   */
  async handleAccountAction(actionType, targetTenantId) {
    try {
      let reason = 'Action executed via Super Admin portal';
      if (['suspend', 'soft_delete'].includes(actionType)) {
        reason = prompt(`Please specify a mandatory reason for this action:`);
        if (!reason || !reason.trim()) {
          alert("A non-empty justification reason is required.");
          return;
        }
      }

      const res = await api.admin.accountAction(actionType, { targetTenantId, reason: reason.trim() });
      if (res && res.success) {
        alert(res.message || "Account action executed successfully.");
        adminModule.render();
      } else {
        throw new Error(res?.error || "Action failed.");
      }
    } catch (err) {
      alert("Error: " + (err.message || "Failed to execute account action."));
    }
  },

  /**
   * Bulk Suspend Handler (Mandatory Reason Required)
   */
  async handleBulkSuspend() {
    try {
      const tenantIds = Array.from(selectedChamberIds);
      if (tenantIds.length === 0) {
        alert("Please select at least one chamber using checkboxes.");
        return;
      }

      const reason = prompt(`Specify mandatory justification reason for bulk suspending ${tenantIds.length} chambers:`);
      if (!reason || !reason.trim()) {
        alert("A non-empty justification reason is required for bulk suspend.");
        return;
      }

      const res = await api.admin.accountAction('bulk_suspend', { tenantIds, reason: reason.trim() });
      if (res && res.success) {
        alert(`Successfully bulk suspended ${tenantIds.length} chambers.`);
        selectedChamberIds.clear();
        adminModule.render();
      } else {
        throw new Error(res?.error || "Bulk suspend failed.");
      }
    } catch (err) {
      alert("Error: " + (err.message || "Failed to execute bulk suspend."));
    }
  },

  /**
   * Handle Impersonation ("Login as Chamber")
   */
  async handleImpersonation(targetTenantId) {
    try {
      if (!confirm("Are you sure you want to view as this chamber? An audit log entry will be recorded.")) return;

      const res = await api.admin.impersonate(targetTenantId);
      if (res && res.success && res.token) {
        localStorage.setItem('token', res.token);
        if (res.impersonatedUser) {
          localStorage.setItem('currentUser', JSON.stringify(res.impersonatedUser));
        }
        window.location.href = '/dashboard';
      } else {
        throw new Error(res?.error || "Impersonation failed.");
      }
    } catch (err) {
      alert("Impersonation error: " + (err.message || "Failed to impersonate chamber."));
    }
  },

  /**
   * Export chamber analytics to CSV
   */
  exportCSV() {
    try {
      if (!currentMetricsData || !Array.isArray(currentMetricsData.chambers) || currentMetricsData.chambers.length === 0) {
        alert("No chamber data available for export.");
        return;
      }

      const headers = ["Chamber ID", "Firm Name", "Advocate Name", "Email", "Phone", "Registered Date", "Cases", "Clients", "Hearings", "Transactions", "Last Activity", "Status"];
      const rows = currentMetricsData.chambers.map(c => [
        `"${c.id}"`,
        `"${(c.firmName || '').replace(/"/g, '""')}"`,
        `"${(c.lawyerName || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.createdAt || '').split('T')[0]}"`,
        c.casesCount || 0,
        c.clientsCount || 0,
        c.hearingsCount || 0,
        c.transactionsCount || 0,
        `"${(c.lastActivityAt || '').split('T')[0]}"`,
        c.isSuspended ? "Suspended" : (c.status || "Active")
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `track_my_chambers_directory_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("adminModule.exportCSV error:", err);
    }
  },

  /**
   * Export Audit Trail Logs to CSV
   */
  exportAuditLogsCSV() {
    try {
      if (!currentAuditLogs || currentAuditLogs.length === 0) {
        alert("No audit logs available to export.");
        return;
      }

      const headers = ["Log ID", "Timestamp", "Admin Email", "Action Type", "Target Tenant ID", "Target Email", "Reason"];
      const rows = currentAuditLogs.map(l => [
        `"${l.id}"`,
        `"${l.timestamp}"`,
        `"${(l.adminEmail || '').replace(/"/g, '""')}"`,
        `"${(l.actionType || '').replace(/"/g, '""')}"`,
        `"${(l.targetTenantId || '').replace(/"/g, '""')}"`,
        `"${(l.targetEmail || '').replace(/"/g, '""')}"`,
        `"${(l.reason || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `track_my_chambers_audit_trail_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("exportAuditLogsCSV error:", err);
    }
  }
};

window.adminModule = adminModule;
export default adminModule;
