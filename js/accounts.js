/**
 * VSH Legal - Case & Practice Manager Accounts Module
 * Manages the ledger entries, billing calculators, log transactions, and printable invoices.
 */

import db from './db.js';
import historyManager from './history.js';

let incomeChartInstance = null;

const accountsModule = {
  worker: null,
  currentPage: 1,
  pageSize: 50,

  init() {
    this.initWorker();
    this.setupFilters();
    this.setupLogTransactionForm();
    this.setupInvoiceModalEvents();
    this.setupChartEvents();
  },

  initWorker() {
    if (typeof Worker !== 'undefined' && !this.worker) {
      try {
        this.worker = new Worker('/js/workers/ledger.worker.js');
        this.worker.onmessage = (e) => {
          if (e.data.action === 'ledgerProcessed') {
            this.handleWorkerResult(e.data);
          }
        };
      } catch (err) {
        console.warn("Web Worker init fallback to main thread:", err);
      }
    }
  },

  render() {
    this.populateClientDropdowns();
    this.processAndRenderLedger();
    this.renderIncomeChart();
  },

  processAndRenderLedger() {
    const txs = db.getTransactions();
    const filterClient = document.getElementById('ledger-filter-client')?.value || 'All';
    const filterType = document.getElementById('ledger-filter-type')?.value || 'All';

    if (this.worker) {
      this.worker.postMessage({
        action: 'processLedger',
        txs,
        filterClient,
        filterType,
        page: this.currentPage,
        pageSize: this.pageSize
      });
    } else {
      this.renderLedgerTableFallback(txs, filterClient, filterType);
    }
  },

  handleWorkerResult(data) {
    const { totals, totalItems, totalPages, currentPage, pageItems } = data;
    this.currentPage = currentPage;

    // Update KPIs from worker pre-computed totals
    const clients = db.getClients();
    let unpaidDues = 0;
    clients.forEach(c => {
      const balance = db.getClientBalance(c.id);
      unpaidDues += balance.outstanding;
    });

    const elMonthly = document.getElementById('ledger-monthly-income');
    const elAnnual = document.getElementById('ledger-annual-income');
    if (elMonthly) elMonthly.textContent = '₹' + totals.monthlyIncome.toLocaleString('en-IN');
    if (elAnnual) elAnnual.textContent = '₹' + totals.annualIncome.toLocaleString('en-IN');

    const elCum = document.getElementById('ledger-cumulative-income');
    const elFees = document.getElementById('ledger-fees-billed');
    const elDisb = document.getElementById('ledger-disbursements-billed');
    const elDues = document.getElementById('ledger-unpaid-dues');

    if (elCum) elCum.textContent = '₹' + totals.cumulativeIncome.toLocaleString('en-IN');
    if (elFees) elFees.textContent = '₹' + totals.feesBilled.toLocaleString('en-IN');
    if (elDisb) elDisb.textContent = '₹' + totals.disbursementsBilled.toLocaleString('en-IN');
    if (elDues) elDues.textContent = '₹' + unpaidDues.toLocaleString('en-IN');

    // Render table rows using DocumentFragment
    const tableBody = document.getElementById('ledger-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (pageItems.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;" class="text-muted">No transactions matching filter criteria.</td></tr>`;
      this.renderPaginationControls(0, 1);
      return;
    }

    const fragment = document.createDocumentFragment();

    pageItems.forEach(t => {
      const client = db.getClient(t.clientId);
      const linkedCase = t.caseId ? db.getCase(t.caseId) : null;
      const row = document.createElement('tr');
      row.className = `transaction-row-${t.type}`;

      const creditColorStyle = t.type === 'WrittenOff' ? 'color: var(--text-secondary); text-decoration: line-through;' : 'color: var(--color-success);';

      row.innerHTML = `
        <td>${t.date}</td>
        <td>
          <div style="font-weight:600; color:var(--text-primary);">${client ? client.name : 'Unknown'}</div>
          ${linkedCase ? `<div style="font-size:0.75rem; color:var(--color-primary); cursor:pointer; text-decoration:underline;" onclick="viewCaseDetails('${t.caseId}')">${linkedCase.title}</div>` : `<div style="font-size:0.75rem; color:var(--text-muted);">Standalone account</div>`}
        </td>
        <td>${t.description}</td>
        <td><span class="badge ${t.typeBadgeClass}">${t.type}</span></td>
        <td style="font-weight:500;">${t.debitVal}</td>
        <td style="${creditColorStyle} font-weight:500;">${t.creditVal}</td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-secondary btn-invoice" style="padding:0.25rem 0.4rem;" data-id="${t.id}" title="Print Invoice/Receipt"><i data-lucide="printer" style="width:12px; height:12px;"></i></button>
            <button class="btn btn-danger btn-delete-tx" style="padding:0.25rem 0.4rem;" data-id="${t.id}" title="Delete Transaction"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>
          </div>
        </td>
      `;

      row.querySelector('.btn-invoice').addEventListener('click', () => this.showInvoice(t.id));
      row.querySelector('.btn-delete-tx').addEventListener('click', () => this.deleteTransaction(t.id));

      fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);
    this.renderPaginationControls(totalItems, totalPages);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ root: tableBody });
    }
  },

  /**
   * Populate filters dropdown lists with client entries
   */
  populateClientDropdowns() {
    const clients = db.getClients();
    
    // 1. Filter bar client select
    const filterSelect = document.getElementById('ledger-filter-client');
    const selectedFilterVal = filterSelect.value || 'All';
    
    filterSelect.innerHTML = '<option value="All">All Clients</option>';
    clients.forEach(c => {
      filterSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
    filterSelect.value = selectedFilterVal;

    // 2. Add entry form client select
    const formSelect = document.getElementById('log-tx-client-id');
    if (formSelect) {
      formSelect.innerHTML = '<option value="" disabled selected>-- Choose Client --</option>' +
        clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
        '<option value="__ONBOARD_NEW__" style="font-weight:600; color:var(--color-primary);">+ Onboard New Client...</option>';

      if (!formSelect.hasAttribute('data-onboard-listener')) {
        formSelect.setAttribute('data-onboard-listener', 'true');
        formSelect.addEventListener('change', (e) => {
          if (e.target.value === '__ONBOARD_NEW__') {
            const modal = document.getElementById('log-tx-modal');
            if (modal) modal.classList.remove('active');
            formSelect.selectedIndex = 0;
            if (typeof window.switchView === 'function') {
              window.switchView('onboarding-page');
            }
          }
        });
      }
    }
  },

  /**
   * Set up filters
   */
  setupFilters() {
    const filterClient = document.getElementById('ledger-filter-client');
    const filterType = document.getElementById('ledger-filter-type');

    if (filterClient) filterClient.addEventListener('change', () => { this.currentPage = 1; this.processAndRenderLedger(); });
    if (filterType) filterType.addEventListener('change', () => { this.currentPage = 1; this.processAndRenderLedger(); });

    // Trigger modal btn
    const logBtn = document.getElementById('btn-log-transaction');
    const modal = document.getElementById('log-tx-modal');
    
    logBtn.addEventListener('click', () => {
      this.populateClientDropdowns();
      const editInput = document.getElementById('log-tx-edit-id');
      const titleEl = document.getElementById('log-tx-title');
      const submitBtn = document.getElementById('log-tx-submit-btn');

      if (editInput) editInput.value = '';
      if (titleEl) titleEl.textContent = 'Log Financial Transaction';
      if (submitBtn) submitBtn.textContent = 'Save Entry';

      document.getElementById('log-tx-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('log-tx-amount').value = '';
      document.getElementById('log-tx-desc').value = '';
      modal.classList.add('active');
    });
  },

  showEditTransaction(txId) {
    const tx = db.getTransactions().find(t => t.id === txId);
    if (!tx) return;

    this.populateClientDropdowns();

    const editInput = document.getElementById('log-tx-edit-id');
    const titleEl = document.getElementById('log-tx-title');
    const submitBtn = document.getElementById('log-tx-submit-btn');

    if (editInput) editInput.value = tx.id;
    if (titleEl) titleEl.textContent = 'Edit Financial Entry';
    if (submitBtn) submitBtn.textContent = 'Save Changes';

    const clientSelect = document.getElementById('log-tx-client-id');
    const caseSelect = document.getElementById('log-tx-case-id');

    clientSelect.value = tx.clientId || '';

    const cases = db.getCasesForClient(tx.clientId);
    caseSelect.innerHTML = '<option value="">Standalone Client billing (No Case link)</option>';
    cases.forEach(cs => {
      caseSelect.innerHTML += `<option value="${cs.id}">${cs.title} (${cs.caseNumber})</option>`;
    });
    caseSelect.value = tx.caseId || '';

    document.getElementById('log-tx-date').value = tx.date || new Date().toISOString().split('T')[0];
    document.getElementById('log-tx-type').value = tx.type || 'Billed';
    document.getElementById('log-tx-amount').value = tx.amount || 0;
    document.getElementById('log-tx-desc').value = tx.description || '';

    const modal = document.getElementById('log-tx-modal');
    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
  },

  /**
   * Log transaction form actions
   */
  setupLogTransactionForm() {
    const form = document.getElementById('log-tx-form');
    const modal = document.getElementById('log-tx-modal');
    const cancelBtn = document.getElementById('log-tx-cancel');
    const clientSelect = document.getElementById('log-tx-client-id');
    const caseSelect = document.getElementById('log-tx-case-id');

    // Cascade: change client -> load their cases
    clientSelect.addEventListener('change', (e) => {
      const clientId = e.target.value;
      const cases = db.getCasesForClient(clientId);

      caseSelect.innerHTML = '<option value="">Standalone Client billing (No Case link)</option>';
      cases.forEach(cs => {
        caseSelect.innerHTML += `<option value="${cs.id}">${cs.title} (${cs.caseNumber})</option>`;
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('log-tx-edit-id')?.value;
      const clientId = clientSelect.value;
      const caseId = caseSelect.value || null;
      const date = document.getElementById('log-tx-date').value;
      const type = document.getElementById('log-tx-type').value;
      const amount = parseFloat(document.getElementById('log-tx-amount').value);
      const description = document.getElementById('log-tx-desc').value.trim();

      if (!clientId) {
        alert("Please select a client.");
        return;
      }

      if (editId) {
        const prevTx = db.getTransactions().find(t => t.id === editId);
        const updated = await db.updateTransaction(editId, { clientId, caseId, date, type, amount, description });
        
        historyManager.push({
          description: `Financial entry (${type} ₹${amount}) updated`,
          undo: async () => {
            if (prevTx) await db.updateTransaction(editId, prevTx);
            this.render();
          },
          redo: async () => {
            await db.updateTransaction(editId, updated);
            this.render();
          }
        });
        alert("Financial transaction entry updated.");
      } else {
        const tx = await db.addTransaction({ clientId, caseId, date, type, amount, description });
        
        historyManager.push({
          description: `Financial entry (${type} ₹${amount}) logged`,
          undo: async () => {
            await db.deleteTransaction(tx.id);
            this.render();
          },
          redo: async () => {
            await db.addTransaction(tx);
            this.render();
          }
        });
        alert("Financial transaction logged.");
      }

      // Dispatch a custom event to notify other modules to refresh
      document.dispatchEvent(new CustomEvent('transactionLogged', { detail: { clientId, caseId } }));
      
      form.reset();
      if (document.getElementById('log-tx-edit-id')) document.getElementById('log-tx-edit-id').value = '';
      caseSelect.innerHTML = '<option value="">Standalone Client billing (No Case link)</option>';
      modal.classList.remove('active');
      this.render();
    });

    cancelBtn.addEventListener('click', () => {
      form.reset();
      caseSelect.innerHTML = '<option value="">Standalone Client billing (No Case link)</option>';
      modal.classList.remove('active');
    });
  },

  showLogTransactionModal(clientId, caseId) {
    this.populateClientDropdowns();
    const modal = document.getElementById('log-tx-modal');
    const clientSelect = document.getElementById('log-tx-client-id');
    const caseSelect = document.getElementById('log-tx-case-id');

    if (clientId) {
      clientSelect.value = clientId;
      clientSelect.dispatchEvent(new Event('change'));
      
      if (caseId) {
        caseSelect.value = caseId;
      }
    }

    document.getElementById('log-tx-date').value = new Date().toISOString().split('T')[0];
    modal.classList.add('active');
  },

  /**
   * Render ledger list
   */
  currentPage: 1,
  pageSize: 50,

  /**
   * Render ledger list with 50-row pagination and DocumentFragment batching
   */
  renderLedgerTable() {
    const txs = db.getTransactions();
    const filterClient = document.getElementById('ledger-filter-client').value;
    const filterType = document.getElementById('ledger-filter-type').value;
    const tableBody = document.getElementById('ledger-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    const filteredTxs = txs.filter(t => {
      const matchesClient = filterClient === 'All' || t.clientId === filterClient;
      const matchesType = filterType === 'All' || t.type === filterType;
      return matchesClient && matchesType;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

    if (filteredTxs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;" class="text-muted">No transactions matching filter criteria.</td></tr>`;
      this.renderPaginationControls(0, 1);
      return;
    }

    const totalPages = Math.ceil(filteredTxs.length / this.pageSize);
    if (this.currentPage > totalPages) this.currentPage = 1;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const pageTxs = filteredTxs.slice(startIdx, startIdx + this.pageSize);

    const fragment = document.createDocumentFragment();

    pageTxs.forEach(t => {
      const client = db.getClient(t.clientId);
      const linkedCase = t.caseId ? db.getCase(t.caseId) : null;
      const row = document.createElement('tr');
      row.className = `transaction-row-${t.type}`;

      let typeBadgeClass = 'badge-pending';
      if (t.type === 'Received') typeBadgeClass = 'badge-active';
      else if (t.type === 'Disbursed') typeBadgeClass = 'badge-closed';
      else if (t.type === 'WrittenOff') typeBadgeClass = 'badge-danger';

      const debitVal = t.type === 'Billed' || t.type === 'Disbursed' ? `₹${t.amount.toLocaleString('en-IN')}` : '-';
      const creditVal = t.type === 'Received' || t.type === 'WrittenOff' ? `₹${t.amount.toLocaleString('en-IN')}` : '-';
      const creditColorStyle = t.type === 'WrittenOff' ? 'color: var(--text-secondary); text-decoration: line-through;' : 'color: var(--color-success);';

      row.innerHTML = `
        <td>${t.date}</td>
        <td>
          <div style="font-weight:600; color:var(--text-primary);">${client ? client.name : 'Unknown'}</div>
          ${linkedCase ? `<div style="font-size:0.75rem; color:var(--color-primary); cursor:pointer; text-decoration:underline;" onclick="viewCaseDetails('${t.caseId}')">${linkedCase.title}</div>` : `<div style="font-size:0.75rem; color:var(--text-muted);">Standalone account</div>`}
        </td>
        <td>${t.description}</td>
        <td><span class="badge ${typeBadgeClass}">${t.type}</span></td>
        <td style="font-weight:500;">${debitVal}</td>
        <td style="${creditColorStyle} font-weight:500;">${creditVal}</td>
        <td>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            <button class="btn btn-secondary btn-edit-tx" style="padding:0; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;" data-id="${t.id}" title="Edit Transaction Entry"><i data-lucide="edit-3" style="width:12px; height:12px;"></i></button>
            <button class="btn btn-secondary btn-invoice" style="padding:0; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;" data-id="${t.id}" title="Print Invoice/Receipt"><i data-lucide="printer" style="width:12px; height:12px;"></i></button>
            <button class="btn btn-danger btn-delete-tx" style="padding:0; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;" data-id="${t.id}" title="Delete Transaction"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>
          </div>
        </td>
      `;

      row.querySelector('.btn-edit-tx').addEventListener('click', () => this.showEditTransaction(t.id));
      row.querySelector('.btn-invoice').addEventListener('click', () => this.showInvoice(t.id));
      row.querySelector('.btn-delete-tx').addEventListener('click', () => this.deleteTransaction(t.id));

      fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);
    this.renderPaginationControls(filteredTxs.length, totalPages);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ root: tableBody });
    }
  },

  renderPaginationControls(totalItems, totalPages) {
    let container = document.getElementById('accounts-pagination-container');
    const ledgerCard = document.getElementById('ledger-table-body')?.closest('.card');
    if (!ledgerCard) return;

    if (!container) {
      container = document.createElement('div');
      container.id = 'accounts-pagination-container';
      container.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem 0 0 0; border-top: 1px solid var(--border-color); margin-top: 1rem; font-size: 0.85rem; color: var(--text-secondary);';
      ledgerCard.appendChild(container);
    }

    if (totalItems <= this.pageSize) {
      container.innerHTML = `<span>Showing all ${totalItems} transactions</span>`;
      return;
    }

    container.innerHTML = `
      <span>Showing ${((this.currentPage - 1) * this.pageSize) + 1}–${Math.min(this.currentPage * this.pageSize, totalItems)} of ${totalItems} entries</span>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button id="accounts-prev-page" class="btn btn-secondary" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;" ${this.currentPage === 1 ? 'disabled' : ''}>← Prev</button>
        <span style="font-weight: 600; color: #fff;">Page ${this.currentPage} of ${totalPages}</span>
        <button id="accounts-next-page" class="btn btn-secondary" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;" ${this.currentPage === totalPages ? 'disabled' : ''}>Next →</button>
      </div>
    `;

    const prevBtn = document.getElementById('accounts-prev-page');
    const nextBtn = document.getElementById('accounts-next-page');

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderLedgerTable();
        }
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.renderLedgerTable();
        }
      };
    }
  },

  async deleteTransaction(id) {
    if (confirm("Are you sure you want to delete this accounting transaction? Outstanding balance will recalculate.")) {
      await db.deleteTransaction(id);
      this.render();
    }
  },

  /**
   * Invoice Display Modal setup
   */
  setupInvoiceModalEvents() {
    const overlay = document.getElementById('invoice-modal');
    const closeBtn = document.getElementById('invoice-close');
    const closeBtn2 = document.getElementById('invoice-close-btn');

    const hide = () => overlay.classList.remove('active');
    closeBtn.addEventListener('click', hide);
    closeBtn2.addEventListener('click', hide);
  },

  showInvoice(txId) {
    const tx = db.getTransactions().find(t => t.id === txId);
    if (!tx) return;

    const overlay = document.getElementById('invoice-modal');
    const body = document.getElementById('invoice-modal-body');
    const client = db.getClient(tx.clientId);
    const linkedCase = tx.caseId ? db.getCase(tx.caseId) : null;
    const settings = db.getSettings();

    const titleText = tx.type === 'Received' ? 'RECEIPT ACKNOWLEDGEMENT' : 'PROFESSIONAL FEE MEMORANDUM';

    body.innerHTML = `
      <div style="padding: 1.5rem; background:#fff; color:#1e293b; border-radius: var(--radius-md); font-family: 'Inter', sans-serif;">
        <!-- Logo Branding Header -->
        <div style="display:flex; justify-content:space-between; border-bottom:3px solid #0f172a; padding-bottom:1rem; margin-bottom:1.5rem;">
          <div>
            <h1 style="font-family:'Playfair Display', serif; font-size:1.8rem; color:#0f172a; margin:0;">${settings.firmName || 'VSH Legal'}</h1>
            <div style="font-size:0.75rem; color:#475569; text-transform:uppercase; letter-spacing:0.1em; margin-top:0.25rem;">
              Chamber of ${settings.lawyerName || 'Adv. Vaibhav Sharma'} | Advocates & Solicitors
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.8rem; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.05em;">${titleText}</div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:0.25rem;">Ref ID: ${tx.id}</div>
            <div style="font-size:0.75rem; color:#64748b;">Date: ${tx.date}</div>
          </div>
        </div>

        <!-- Client & Subject Block -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1.5rem; font-size:0.85rem; line-height:1.4;">
          <div>
            <div style="font-weight:700; color:#475569; text-transform:uppercase; font-size:0.75rem; margin-bottom:0.25rem;">Billed To:</div>
            <strong style="color:#0f172a; font-size:0.95rem;">${client ? client.name : 'Unknown'}</strong>
            <div style="color:#64748b; margin-top:0.2rem;">${client ? client.address || 'N/A' : ''}</div>
            <div style="color:#64748b;">Phone: ${client ? client.phone || 'N/A' : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700; color:#475569; text-transform:uppercase; font-size:0.75rem; margin-bottom:0.25rem;">Case / Subject Matter:</div>
            <strong style="color:#0f172a; font-size:0.9rem;">${linkedCase ? linkedCase.title : 'Standalone Client Account'}</strong>
            <div style="color:#64748b; margin-top:0.2rem;">CNR/Number: ${linkedCase ? linkedCase.caseNumber : 'N/A'}</div>
            <div style="color:#64748b;">Court Forum: ${linkedCase ? linkedCase.court : 'N/A'}</div>
          </div>
        </div>

        <!-- Description Table -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:2rem; font-size:0.85rem;">
          <thead>
            <tr style="background-color:#f1f5f9; color:#0f172a;">
              <th style="padding:0.75rem; border:1px solid #cbd5e1; text-align:left; font-weight:700;">Description of Legal Services</th>
              <th style="padding:0.75rem; border:1px solid #cbd5e1; text-align:right; font-weight:700; width:120px;">Category</th>
              <th style="padding:0.75rem; border:1px solid #cbd5e1; text-align:right; font-weight:700; width:140px;">Amount (INR ₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:1rem 0.75rem; border:1px solid #e2e8f0; color:#334155; font-size:0.85rem;">
                ${tx.description}
              </td>
              <td style="padding:1rem 0.75rem; border:1px solid #e2e8f0; text-align:right; color:#475569;">
                ${tx.type}
              </td>
              <td style="padding:1rem 0.75rem; border:1px solid #e2e8f0; text-align:right; font-weight:700; color:#0f172a; font-size:0.95rem;">
                ₹${tx.amount.toLocaleString('en-IN')}
              </td>
            </tr>
            <tr style="background:#f8fafc; font-weight:700;">
              <td colspan="2" style="padding:0.75rem; border:1px solid #cbd5e1; text-align:right; color:#0f172a;">Total Invoice Value:</td>
              <td style="padding:0.75rem; border:1px solid #cbd5e1; text-align:right; color:#0f172a; font-size:1rem;">
                ₹${tx.amount.toLocaleString('en-IN')}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Signature Section -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:3rem; font-size:0.8rem;">
          <div style="color:#64748b; line-height:1.4; max-width:60%;">
            <strong>VSH Legal Terms:</strong><br>
            All professional fee invoices are payable immediately. Out-of-pocket disbursements are charged strictly on actuals. 
            This is a computer generated document, requiring no physical signature.
          </div>
          <div style="text-align:center; min-width:180px;">
            <div style="font-family:'Playfair Display', serif; font-style:italic; font-size:1rem; margin-bottom:0.25rem;">
              Vaibhav Sharma
            </div>
            <div style="border-top:1px solid #94a3b8; padding-top:0.4rem; font-weight:600; color:#0f172a; text-transform:uppercase; font-size:0.7rem; letter-spacing:0.05em;">
              Adv. Vaibhav Sharma
            </div>
          </div>
        </div>
      </div>
    `;

    overlay.classList.add('active');
  },

  setupChartEvents() {
    const viewSelect = document.getElementById('income-chart-view-select');
    if (viewSelect) {
      viewSelect.addEventListener('change', () => {
        this.renderIncomeChart();
      });
    }
  },

  renderIncomeChart() {
    const transactions = db.getTransactions();
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const labelColor = theme === 'dark' ? '#94a3b8' : '#475569';
    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';

    const viewSelect = document.getElementById('income-chart-view-select');
    const selectedView = viewSelect ? viewSelect.value : '2026';

    const canvas = document.getElementById('incomeChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (incomeChartInstance) {
      incomeChartInstance.destroy();
    }

    if (selectedView === 'year-wise') {
      const yearlyCreditMap = {};
      const yearlyDebitMap = {};

      transactions.forEach(t => {
        const year = new Date(t.date).getFullYear();
        if (isNaN(year)) return;
        if (!yearlyCreditMap[year]) {
          yearlyCreditMap[year] = 0;
          yearlyDebitMap[year] = 0;
        }
        if (t.type === 'Received') {
          yearlyCreditMap[year] += t.amount;
        } else if (t.type === 'Billed') {
          yearlyDebitMap[year] += t.amount;
        }
      });

      let years = Object.keys(yearlyCreditMap).map(Number).sort((a, b) => a - b);
      const defaultYears = [2024, 2025, 2026];
      defaultYears.forEach(y => {
        if (!years.includes(y)) {
          years.push(y);
        }
      });
      years.sort((a, b) => a - b);

      const billedData = years.map(y => yearlyDebitMap[y] || 0);
      const receivedData = years.map(y => yearlyCreditMap[y] || 0);

      incomeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: years.map(String),
          datasets: [
            {
              label: 'Fees Billed (₹)',
              data: billedData,
              backgroundColor: 'rgba(217, 119, 6, 0.65)',
              borderColor: '#d97706',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Payments Received (₹)',
              data: receivedData,
              backgroundColor: 'rgba(16, 185, 129, 0.65)',
              borderColor: '#10b981',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: labelColor, font: { family: 'Inter' } }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: labelColor }
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: labelColor }
            }
          }
        }
      });
    } else {
      const year = parseInt(selectedView) || 2026;
      const monthlyCreditMap = Array(12).fill(0);
      const monthlyDebitMap = Array(12).fill(0);

      transactions.forEach(t => {
        const tDate = new Date(t.date);
        if (tDate.getFullYear() === year) {
          const monthIndex = tDate.getMonth();
          if (t.type === 'Received') {
            monthlyCreditMap[monthIndex] += t.amount;
          } else if (t.type === 'Billed') {
            monthlyDebitMap[monthIndex] += t.amount;
          }
        }
      });

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      incomeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: months,
          datasets: [
            {
              label: 'Fees Billed (₹)',
              data: monthlyDebitMap,
              backgroundColor: 'rgba(217, 119, 6, 0.65)',
              borderColor: '#d97706',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Payments Received (₹)',
              data: monthlyCreditMap,
              backgroundColor: 'rgba(16, 185, 129, 0.65)',
              borderColor: '#10b981',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: labelColor, font: { family: 'Inter' } }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: labelColor }
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: labelColor }
            }
          }
        }
      });
    }
  }
};

export default accountsModule;
