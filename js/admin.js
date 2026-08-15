/**
 * Track My Chambers - Super Admin Monitoring Portal
 * Safe ES module implementation with zero top-level code and robust error handling.
 */

import api from './api.js';

let currentMetricsData = null;
let isAdminAuthorized = false;

export const adminModule = {
  /**
   * Check admin authorization on boot and reveal sidebar link if 200 OK (Fail Closed)
   */
  async init() {
    try {
      const sidebarLink = document.getElementById('sidebar-menu-admin');
      if (!sidebarLink) return;

      // Fail closed by default
      sidebarLink.style.display = 'none';

      try {
        const res = await api.admin.getMetrics();
        if (res && res.success) {
          isAdminAuthorized = true;
          sidebarLink.style.display = '';
        }
      } catch (err) {
        isAdminAuthorized = false;
        sidebarLink.style.display = 'none';
      }
    } catch (e) {
      console.warn("adminModule init safe warning:", e);
    }
  },

  /**
   * Render Admin Metrics Portal
   */
  async render() {
    try {
      const container = document.getElementById('admin-metrics-page');
      if (!container) return;

      // 1. Render immediate loading state
      container.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: var(--text-muted);">
          <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(217, 119, 6, 0.2); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s infinite linear; margin-bottom: 1rem;"></div>
          <h3 style="margin: 0; color: #fff; font-size: 1.1rem; font-weight: 600;">Loading Super Admin Metrics...</h3>
          <p style="margin-top: 0.5rem; font-size: 0.85rem;">Verifying server authorization and gathering chamber analytics.</p>
        </div>
      `;

      // 2. Fetch metrics from backend
      try {
        const res = await api.admin.getMetrics();
        if (!res || !res.success || !res.metrics) {
          throw new Error(res?.error || "Unauthorized or invalid metrics response.");
        }
        currentMetricsData = res.metrics;
        isAdminAuthorized = true;
      } catch (err) {
        // Render user-facing unauthorized / error state
        container.innerHTML = `
          <div style="max-width: 600px; margin: 4rem auto; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 2.5rem; text-align: center; box-shadow: 0 15px 35px rgba(0,0,0,0.4);">
            <div style="width: 56px; height: 56px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto;">
              <i data-lucide="shield-alert" style="width: 28px; height: 28px;"></i>
            </div>
            <h2 style="font-family: 'Playfair Display', serif; color: #fff; font-size: 1.6rem; margin-bottom: 0.75rem; font-weight: 700;">Access Restricted</h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem;">
              You do not have Super Admin permissions to access the platform monitoring portal. This view is restricted to founder administrators.
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

      // Render Admin Dashboard Markup
      container.innerHTML = `
        <div style="padding: 1.5rem; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.75rem;">
          <!-- Top Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1.25rem;">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-primary); font-weight: 700;">PLATFORM MONITORING & ANALYTICS</span>
              <h1 style="font-family: 'Playfair Display', serif; font-size: 1.8rem; color: #fff; margin: 0.2rem 0; font-weight: 700;">Super Admin Portal</h1>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Real-time chamber activity, signups growth, and system health status.</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                <i data-lucide="server" style="width: 12px; height: 12px;"></i> ${m.dbStatus || 'Connected'}
              </span>
              <button class="btn btn-secondary btn-sm" id="admin-refresh-btn" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem;">
                <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i> Refresh Data
              </button>
            </div>
          </div>

          <!-- Overview Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div class="stat-card" style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Total Chambers</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #fff;">${m.totalChambers || 0}</div>
              <div style="font-size: 0.75rem; color: var(--color-success); margin-top: 0.25rem;">${m.activeChambers || 0} Active / ${m.dormantChambers || 0} Dormant</div>
            </div>

            <div class="stat-card" style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Total Cases Logged</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--color-primary);">${m.totalCases || 0}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Across all legal matters</div>
            </div>

            <div class="stat-card" style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Onboarded Clients</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #38bdf8;">${m.totalClients || 0}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Active litigation clients</div>
            </div>

            <div class="stat-card" style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.4rem;">Hearings & Proceedings</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #fbbf24;">${m.totalHearings || 0}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Recorded case proceedings</div>
            </div>
          </div>

          <!-- Signup Growth Visualizer -->
          <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="font-size: 1rem; color: #fff; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="trending-up" style="width: 16px; height: 16px; color: var(--color-primary);"></i> Chamber Signups Growth (Last 30 Days)
              </h3>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 4px; height: 90px; padding-top: 10px; border-bottom: 1px solid var(--border-color);">
              ${(m.signupsOverTime || []).map(s => {
                const heightPct = s.count > 0 ? Math.min(100, s.count * 40 + 20) : 8;
                return `
                  <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;" title="${s.date}: ${s.count} new signups">
                    <div style="width: 100%; max-width: 18px; height: ${heightPct}%; background: ${s.count > 0 ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)'}; border-radius: 3px 3px 0 0;"></div>
                  </div>
                `;
              }).join('')}
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.4rem;">
              <span>30 Days Ago</span>
              <span>Today</span>
            </div>
          </div>

          <!-- Chamber Usage Directory Table -->
          <div style="background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
              <h3 style="font-size: 1rem; color: #fff; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="users" style="width: 16px; height: 16px; color: var(--color-primary);"></i> Chamber Usage Directory
              </h3>
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <input type="text" id="admin-search-input" class="form-control" placeholder="Filter firm name or email..." style="max-width: 250px; font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                <button class="btn btn-secondary btn-sm" id="admin-export-csv-btn" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem;">
                  <i data-lucide="download" style="width: 14px; height: 14px;"></i> Export CSV
                </button>
              </div>
            </div>

            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">
                    <th style="padding: 0.75rem 1rem;">Chamber Firm & Advocate</th>
                    <th style="padding: 0.75rem 1rem;">Contact Email</th>
                    <th style="padding: 0.75rem 1rem;">Registered</th>
                    <th style="padding: 0.75rem 1rem; text-align: center;">Cases</th>
                    <th style="padding: 0.75rem 1rem; text-align: center;">Clients</th>
                    <th style="padding: 0.75rem 1rem; text-align: center;">Hearings</th>
                    <th style="padding: 0.75rem 1rem; text-align: center;">Ledgers</th>
                    <th style="padding: 0.75rem 1rem;">Last Activity</th>
                    <th style="padding: 0.75rem 1rem; text-align: center;">Status</th>
                  </tr>
                </thead>
                <tbody id="admin-chambers-tbody">
                  <!-- Rendered via filterAndRenderTable -->
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      // 3. Attach Event Listeners cleanly
      const refreshBtn = document.getElementById('admin-refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => adminModule.render());
      }

      const searchInput = document.getElementById('admin-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => adminModule.filterAndRenderTable(e.target.value));
      }

      const exportBtn = document.getElementById('admin-export-csv-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => adminModule.exportCSV());
      }

      // Initial table render
      adminModule.filterAndRenderTable('');

      if (typeof window.safeCreateIcons === 'function') {
        window.safeCreateIcons();
      }
    } catch (err) {
      console.error("adminModule.render error:", err);
    }
  },

  /**
   * Filter and populate chambers table
   */
  filterAndRenderTable(query = '') {
    try {
      const tbody = document.getElementById('admin-chambers-tbody');
      if (!tbody) return;

      if (!currentMetricsData || !Array.isArray(currentMetricsData.chambers)) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 2rem; text-align: center; color: var(--text-muted);">No chamber activity data available.</td></tr>`;
        return;
      }

      const q = (query || '').toLowerCase().trim();
      const filtered = currentMetricsData.chambers.filter(c => {
        if (!q) return true;
        return (
          (c.firmName && c.firmName.toLowerCase().includes(q)) ||
          (c.lawyerName && c.lawyerName.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
        );
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 2rem; text-align: center; color: var(--text-muted);">No chambers matching search filter "${query}".</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(c => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s;">
          <td style="padding: 0.75rem 1rem;">
            <div style="font-weight: 600; color: #fff;">${window.sanitizeText ? window.sanitizeText(c.firmName) : c.firmName}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${window.sanitizeText ? window.sanitizeText(c.lawyerName) : c.lawyerName}</div>
          </td>
          <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${window.sanitizeText ? window.sanitizeText(c.email) : c.email}</td>
          <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">${(c.createdAt || '').split('T')[0]}</td>
          <td style="padding: 0.75rem 1rem; text-align: center; font-weight: 600; color: var(--color-primary);">${c.casesCount || 0}</td>
          <td style="padding: 0.75rem 1rem; text-align: center; font-weight: 600; color: #38bdf8;">${c.clientsCount || 0}</td>
          <td style="padding: 0.75rem 1rem; text-align: center; font-weight: 600; color: #fbbf24;">${c.hearingsCount || 0}</td>
          <td style="padding: 0.75rem 1rem; text-align: center; font-weight: 600; color: #34d399;">${c.transactionsCount || 0}</td>
          <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">${(c.lastActivityAt || '').split('T')[0]}</td>
          <td style="padding: 0.75rem 1rem; text-align: center;">
            <span style="background: ${c.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)'}; color: ${c.isActive ? '#34d399' : '#94a3b8'}; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600;">
              ${c.isActive ? 'Active' : 'Dormant'}
            </span>
          </td>
        </tr>
      `).join('');

    } catch (err) {
      console.error("adminModule.filterAndRenderTable error:", err);
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
        c.isActive ? "Active" : "Dormant"
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `track_my_chambers_metrics_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error("adminModule.exportCSV error:", err);
    }
  }
};

window.adminModule = adminModule;
export default adminModule;
