/**
 * VSH Legal - Case & Practice Manager Dashboard Controller
 * Handles calculations, rendering KPIs, today's schedule, collection tables, and Chart.js visuals.
 */

import db from './db.js';

let caseTypeChartInstance = null;
let revenueByCaseTypeChartInstance = null;

const dashboardModule = {
  init() {
    // Initial load happens on DOMContentLoaded via app.js
  },

  render() {
    this.updateKPIs();
    this.renderTodaySchedule();
    this.renderHighDuesList();
    this.renderCharts();
    this.renderReferralsList();
  },

  /**
   * Update KPIs
   */
  updateKPIs() {
    const clients = db.getClients();
    const cases = db.getCases();
    const transactions = db.getTransactions();

    // 1. Active Cases Count
    const activeCases = cases.filter(c => c.status === 'Active').length;
    document.getElementById('kpi-active-cases').textContent = activeCases;

    // 2. Active Clients Count
    document.getElementById('kpi-active-clients').textContent = clients.length;

    // 3. Monthly Professional Income
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const monthlyIncome = transactions
      .filter(t => {
        if (t.type !== 'Received') return false;
        const tDate = new Date(t.date);
        return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    document.getElementById('kpi-monthly-income').textContent = '₹' + monthlyIncome.toLocaleString('en-IN');

    // 3.5. Annual Professional Income (YTD 2026)
    const annualIncome = transactions
      .filter(t => {
        if (t.type !== 'Received') return false;
        const tDate = new Date(t.date);
        return tDate.getFullYear() === currentYear;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    document.getElementById('kpi-annual-income').textContent = '₹' + annualIncome.toLocaleString('en-IN');

    // 4. Total Outstanding Fees
    let totalOutstanding = 0;
    clients.forEach(client => {
      const balance = db.getClientBalance(client.id);
      totalOutstanding += balance.outstanding;
    });
    document.getElementById('kpi-outstanding-fees').textContent = '₹' + totalOutstanding.toLocaleString('en-IN');

    // Toggle welcome banner if all metrics are zero
    const isPracticeEmpty = (activeCases === 0 && clients.length === 0 && monthlyIncome === 0 && annualIncome === 0 && totalOutstanding === 0);
    const emptyStateBanner = document.getElementById('dashboard-empty-state-banner');
    if (emptyStateBanner) {
      emptyStateBanner.style.display = isPracticeEmpty ? 'flex' : 'none';
    }
  },

  /**
   * Render schedule for today
   */
  renderTodaySchedule() {
    const cases = db.getCases();
    const tableBody = document.getElementById('dashboard-hearings-table-body');
    tableBody.innerHTML = '';

    // Match nextHearingDate or past hearings to today dynamically
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysHearings = cases.filter(c => {
      const isNext = c.status === 'Active' && c.nextHearingDate === todayStr;
      const hasHearingToday = (c.hearings || []).some(h => h.date === todayStr);
      return isNext || hasHearingToday;
    });

    if (todaysHearings.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; padding: 2.5rem 1rem;">
            <div style="color: var(--text-muted); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
              <i data-lucide="calendar" style="width: 28px; height: 28px; color: var(--text-muted);"></i>
              <span style="font-size: 0.85rem; font-weight: 500;">No hearings scheduled for today</span>
            </div>
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    todaysHearings.forEach(c => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div style="font-weight: 600;">${c.title}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${c.caseNumber}</div>
        </td>
        <td>${c.court}</td>
        <td><span class="badge badge-hearing">${c.stage}</span></td>
      `;
      // Clicking the row redirects to Case Registry view
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        window.viewCaseDetails(c.id);
      });
      tableBody.appendChild(row);
    });
  },

  /**
   * Render High Outstanding Dues table
   */
  renderHighDuesList() {
    const clients = db.getClients();
    const tableBody = document.getElementById('dashboard-dues-table-body');
    tableBody.innerHTML = '';

    const dues = clients.map(client => {
      const balance = db.getClientBalance(client.id);
      return {
        client,
        billed: balance.billed + balance.disbursed,
        outstanding: balance.outstanding
      };
    })
    .filter(d => d.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

    if (dues.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 2.5rem 1rem;">
            <div style="color: var(--text-muted); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
              <i data-lucide="check-circle-2" style="width: 28px; height: 28px; color: var(--color-success);"></i>
              <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted);">All balances settled</span>
            </div>
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    dues.slice(0, 5).forEach(d => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div style="font-weight:600;">${d.client.name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${d.client.phone}</div>
        </td>
        <td>₹${d.billed.toLocaleString('en-IN')}</td>
        <td style="color: var(--color-danger); font-weight: 600;">₹${d.outstanding.toLocaleString('en-IN')}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; border-radius: 4px;" data-client-id="${d.client.id}">
            Remind
          </button>
        </td>
      `;

      // Set click handler on Remind button to go to Share Page
      row.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        const clientId = e.target.getAttribute('data-client-id');
        
        // Switch view to share page
        window.switchView('share-page');
        
        // Wait briefly for share tab to render, then select the client
        setTimeout(() => {
          const clientSelect = document.getElementById('share-client-select');
          if (clientSelect) {
            clientSelect.value = clientId;
            clientSelect.dispatchEvent(new Event('change'));
          }
        }, 50);
      });

      tableBody.appendChild(row);
    });
  },

  /**
   * Render Charts (Professional Income and Case Breakdown)
   */
  renderCharts() {
    const transactions = db.getTransactions();
    const cases = db.getCases();
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    
    // Theme colors for Chart labels
    const labelColor = theme === 'dark' ? '#94a3b8' : '#475569';
    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';

    // --- Chart 2: Case Categories (Doughnut Chart) ---
    const categoriesCount = {};
    cases.forEach(c => {
      categoriesCount[c.caseType] = (categoriesCount[c.caseType] || 0) + 1;
    });

    const chartLabels = Object.keys(categoriesCount);
    const chartData = Object.values(categoriesCount);
    
    const canvas2 = document.getElementById('caseTypeChart');
    const placeholder2 = document.getElementById('caseTypeChart-placeholder');

    if (chartLabels.length === 0) {
      if (canvas2) canvas2.style.display = 'none';
      if (placeholder2) placeholder2.style.display = 'flex';
      if (caseTypeChartInstance) {
        caseTypeChartInstance.destroy();
        caseTypeChartInstance = null;
      }
    } else {
      if (canvas2) canvas2.style.display = 'block';
      if (placeholder2) placeholder2.style.display = 'none';
      
      const ctx2 = canvas2.getContext('2d');
      if (caseTypeChartInstance) {
        caseTypeChartInstance.destroy();
      }
      caseTypeChartInstance = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: chartLabels,
          datasets: [{
            data: chartData,
            backgroundColor: [
              '#3b82f6', // blue (Contracts)
              '#10b981', // green (Civil)
              '#ef4444', // red (Criminal)
              '#ec4899', // pink (Matrimonial)
              '#f59e0b', // orange (Consumer)
              '#06b6d4', // cyan (Service)
              '#eab308', // yellow (Legal Notice)
              '#8b5cf6'  // purple (Consultation)
            ],
            borderColor: theme === 'dark' ? '#0b0f19' : '#ffffff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: window.innerWidth <= 600 ? 'bottom' : 'right',
              labels: { color: labelColor, font: { family: 'Inter' } }
            }
          }
        }
      });
    }

    // --- Chart 3: Revenue by Case Type (Stacked Horizontal Bar Chart) ---
    const caseTypeRevenue = {};
    const categoriesList = ['Civil', 'Criminal', 'Matrimonial', 'Consumer', 'Service', 'Legal Notice', 'Contracts', 'Consultation'];
    categoriesList.forEach(cat => {
      caseTypeRevenue[cat] = { received: 0, outstanding: 0 };
    });

    cases.forEach(c => {
      // Calculate case received payments
      const received = transactions
        .filter(t => t.caseId === c.id && t.type === 'Received')
        .reduce((sum, t) => sum + t.amount, 0);

      // Calculate case billed + disbursed
      const billed = transactions
        .filter(t => t.caseId === c.id && (t.type === 'Billed' || t.type === 'Disbursed'))
        .reduce((sum, t) => sum + t.amount, 0);

      // Calculate case written-off
      const writtenOff = transactions
        .filter(t => t.caseId === c.id && t.type === 'WrittenOff')
        .reduce((sum, t) => sum + t.amount, 0);

      const outstanding = Math.max(0, billed - received - writtenOff);

      const cType = c.caseType || 'Civil';
      if (caseTypeRevenue[cType]) {
        caseTypeRevenue[cType].received += received;
        caseTypeRevenue[cType].outstanding += outstanding;
      }
    });

    const revLabels = [];
    const receivedData = [];
    const outstandingData = [];
    const sortedRevenue = Object.entries(caseTypeRevenue)
      .filter(([_, data]) => data.received > 0 || data.outstanding > 0)
      .sort((a, b) => (b[1].received + b[1].outstanding) - (a[1].received + a[1].outstanding));

    sortedRevenue.forEach(([cat, data]) => {
      revLabels.push(cat);
      receivedData.push(data.received);
      outstandingData.push(data.outstanding);
    });

    const canvas3 = document.getElementById('revenueByCaseTypeChart');
    const placeholder3 = document.getElementById('revenueByCaseTypeChart-placeholder');

    if (revLabels.length === 0) {
      if (canvas3) canvas3.style.display = 'none';
      if (placeholder3) placeholder3.style.display = 'flex';
      if (revenueByCaseTypeChartInstance) {
        revenueByCaseTypeChartInstance.destroy();
        revenueByCaseTypeChartInstance = null;
      }
    } else {
      if (canvas3) canvas3.style.display = 'block';
      if (placeholder3) placeholder3.style.display = 'none';
      
      const ctx3 = canvas3.getContext('2d');
      if (revenueByCaseTypeChartInstance) {
        revenueByCaseTypeChartInstance.destroy();
      }
      revenueByCaseTypeChartInstance = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: revLabels,
          datasets: [
            {
              label: 'Received (₹)',
              data: receivedData,
              backgroundColor: 'rgba(16, 185, 129, 0.65)', // green
              borderColor: '#10b981',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Outstanding (₹)',
              data: outstandingData,
              backgroundColor: 'rgba(239, 68, 68, 0.65)', // red/danger
              borderColor: '#ef4444',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: labelColor, font: { family: 'Inter', size: 10 } }
            }
          },
          scales: {
            x: {
              stacked: true,
              grid: { color: gridColor },
              ticks: { color: labelColor }
            },
            y: {
              stacked: true,
              grid: { display: false },
              ticks: { color: labelColor }
            }
          }
        }
      });
    }
  },

  renderReferralsList() {
    const cases = db.getCases();
    const transactions = db.getTransactions();
    const tableBody = document.getElementById('dashboard-referrals-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    // Group cases by referrer
    const referralsMap = {};

    cases.forEach(c => {
      const referrer = c.referredBy ? c.referredBy.trim() : 'Self';
      if (!referralsMap[referrer]) {
        referralsMap[referrer] = {
          referrer,
          casesCount: 0,
          revenue: 0,
          caseTitles: []
        };
      }
      referralsMap[referrer].casesCount++;
      referralsMap[referrer].caseTitles.push(c.title);

      // Add revenue contributed by this case: sum of 'Received' transactions for this case
      const caseReceivedRevenue = transactions
        .filter(t => t.caseId === c.id && t.type === 'Received')
        .reduce((sum, t) => sum + t.amount, 0);
      
      referralsMap[referrer].revenue += caseReceivedRevenue;
    });

    const referralsList = Object.values(referralsMap).sort((a, b) => b.revenue - a.revenue || b.casesCount - a.casesCount);

    if (referralsList.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;" class="text-muted">No referrals logged.</td></tr>`;
      return;
    }

    referralsList.forEach(item => {
      const row = document.createElement('tr');
      // Create comma-separated list of cases or badges
      const casesListMarkup = item.caseTitles.map(t => `<span class="badge badge-hearing" style="margin-right:4px; display:inline-block; font-size:0.7rem; padding:0.15rem 0.35rem; font-weight:normal; background-color:rgba(59,130,246,0.1); color:#60a5fa; border:1px solid rgba(59,130,246,0.2);">${t}</span>`).join('');
      
      row.innerHTML = `
        <td><strong style="color:var(--text-primary); font-size:0.9rem;">${item.referrer}</strong></td>
        <td><span class="badge badge-active" style="padding:0.25rem 0.5rem; font-size:0.75rem;">${item.casesCount} case(s)</span></td>
        <td style="color:var(--color-success); font-weight:600; font-size:0.9rem;">₹${item.revenue.toLocaleString('en-IN')}</td>
        <td style="max-width:300px; overflow-x:auto; white-space:nowrap;">${casesListMarkup}</td>
      `;
      tableBody.appendChild(row);
    });
  }
};

export default dashboardModule;
