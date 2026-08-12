/**
 * Track My Chambers - Admin Usage & Metrics Dashboard Module
 * Exclusively accessible for authorized platform admin (vaibhavsharmarajhc@gmail.com)
 */

const adminModule = {
  metricsData: null,

  async init() {
    this.setupEvents();
  },

  setupEvents() {
    // Search input listener
    const searchInput = document.getElementById('admin-search-input');
    if (searchInput && !searchInput.hasAttribute('data-bound')) {
      searchInput.setAttribute('data-bound', 'true');
      searchInput.addEventListener('input', () => this.filterAndRenderTable());
    }

    // CSV Export button listener
    const exportBtn = document.getElementById('btn-admin-export-csv');
    if (exportBtn && !exportBtn.hasAttribute('data-bound')) {
      exportBtn.setAttribute('data-bound', 'true');
      exportBtn.addEventListener('click', () => this.exportCSV());
    }
  },

  async render() {
    const tableBody = document.getElementById('admin-chambers-table-body');
    const summaryHeader = document.getElementById('admin-summary-header');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2.5rem;" class="text-muted"><i data-lucide="loader" class="spin-animation" style="width:20px; height:20px; vertical-align:middle; margin-right:8px;"></i> Loading platform metrics...</td></tr>`;
    if (window.safeCreateIcons) window.safeCreateIcons();

    try {
      if (typeof api !== 'undefined' && api.admin && typeof api.admin.getMetrics === 'function') {
        this.metricsData = await api.admin.getMetrics();
      }
    } catch (err) {
      console.error("Failed to load admin metrics:", err);
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--color-danger);">Access Denied: Authorized administrator credentials required.</td></tr>`;
      return;
    }

    if (!this.metricsData || !this.metricsData.chambers) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;" class="text-muted">No chamber accounts found in platform registry.</td></tr>`;
      return;
    }

    if (summaryHeader) {
      summaryHeader.innerHTML = `
        <span style="font-weight: 700; color: var(--text-primary); font-size: 1.1rem;">Registered Chambers Directory</span>
        <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.75rem;">Total: <strong>${this.metricsData.totalChambers || 0}</strong> accounts registered</span>
      `;
    }

    this.setupEvents();
    this.filterAndRenderTable();
  },

  filterAndRenderTable() {
    const tableBody = document.getElementById('admin-chambers-table-body');
    if (!tableBody || !this.metricsData || !this.metricsData.chambers) return;

    const searchVal = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();
    const chambers = this.metricsData.chambers;

    const filtered = chambers.filter(c => {
      const email = (c.email || '').toLowerCase();
      const lawyer = (c.lawyerName || '').toLowerCase();
      const firm = (c.firmName || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();

      return email.includes(searchVal) || lawyer.includes(searchVal) || firm.includes(searchVal) || phone.includes(searchVal);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;" class="text-muted">No registered chambers match "${window.sanitizeText ? window.sanitizeText(searchVal) : searchVal}".</td></tr>`;
      return;
    }

    tableBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    filtered.forEach((c, idx) => {
      const row = document.createElement('tr');
      const formattedDate = window.formatDDMMYYYY ? window.formatDDMMYYYY(c.createdAt) : c.createdAt;

      row.innerHTML = `
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">${window.sanitizeText ? window.sanitizeText(c.lawyerName) : c.lawyerName}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${window.sanitizeText ? window.sanitizeText(c.firmName) : c.firmName}</div>
        </td>
        <td>
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--color-primary);">${window.sanitizeText ? window.sanitizeText(c.email) : c.email}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${c.phone && c.phone !== 'N/A' ? window.sanitizeText(c.phone) : ''}</div>
        </td>
        <td style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
          ${formattedDate}
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
            <span class="badge" style="background: rgba(59, 130, 246, 0.12); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.7rem;" title="Cases logged">${c.casesCount || 0} Cases</span>
            <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.7rem;" title="Clients onboarded">${c.clientsCount || 0} Clients</span>
            <span class="badge" style="background: rgba(234, 179, 8, 0.12); color: #b45309; border: 1px solid rgba(234, 179, 8, 0.3); font-size: 0.7rem;" title="Financial transactions logged">${c.transactionsCount || 0} Ledgers</span>
            <span class="badge" style="background: rgba(168, 85, 247, 0.12); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); font-size: 0.7rem;" title="Tasks assigned">${c.tasksCount || 0} Tasks</span>
          </div>
        </td>
        <td>
          <span class="badge ${c.isSuspended ? 'badge-closed' : 'badge-active'}" style="font-size: 0.7rem;">
            ${c.isSuspended ? 'Suspended' : 'Active Account'}
          </span>
        </td>
      `;
      fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);
    if (window.safeCreateIcons) window.safeCreateIcons(tableBody);
  },

  exportCSV() {
    if (!this.metricsData || !this.metricsData.chambers || this.metricsData.chambers.length === 0) {
      alert("No usage metrics available to export.");
      return;
    }

    const headers = ["Chamber ID", "Lawyer Name", "Firm Name", "Email Address", "Phone", "Registration Date", "Cases Count", "Clients Count", "Transactions Count", "Tasks Count", "Status"];
    const rows = this.metricsData.chambers.map(c => {
      const regDate = window.formatDDMMYYYY ? window.formatDDMMYYYY(c.createdAt) : c.createdAt;
      return [
        `"${(c.id || '').replace(/"/g, '""')}"`,
        `"${(c.lawyerName || '').replace(/"/g, '""')}"`,
        `"${(c.firmName || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(regDate || '').replace(/"/g, '""')}"`,
        c.casesCount || 0,
        c.clientsCount || 0,
        c.transactionsCount || 0,
        c.tasksCount || 0,
        c.isSuspended ? "Suspended" : "Active"
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trackmychambers_usage_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

window.adminModule = adminModule;
export default adminModule;
