/**
 * VSH Legal - Case & Practice Manager Clients Module
 * Manages the onboarding wizard, directory filters, and detailed dossiers.
 */

import db from './db.js';
import casesModule from './cases.js';

let currentStep = 1;

const clientsModule = {
  init() {
    this.setupWizard();
    this.setupSearchAndFilters();
    this.setupDossierEvents();

    // Listen for custom logged transaction events to refresh views in real-time
    document.addEventListener('transactionLogged', (e) => {
      this.renderClientList();
      const overlay = document.getElementById('client-dossier-overlay');
      if (overlay.classList.contains('active') && this.currentClientId === e.detail.clientId) {
        this.showClientDossier(this.currentClientId);
      }
    });
  },

  render() {
    this.renderClientList();
  },

  /**
   * Onboarding Wizard Step Navigation
   */
  setupWizard() {
    const next1 = document.getElementById('wiz-next-1');
    const next2 = document.getElementById('wiz-next-2');
    const back2 = document.getElementById('wiz-back-2');
    const back3 = document.getElementById('wiz-back-3');
    const form = document.getElementById('onboard-client-form');

    next1.addEventListener('click', () => {
      const name = document.getElementById('client-name').value.trim();
      const phone = document.getElementById('client-phone').value.trim();
      
      if (!name || !phone) {
        alert("Please enter both Client Name and Phone Number.");
        return;
      }
      this.goToStep(2);
    });

    next2.addEventListener('click', () => {
      // Step 2 is technically optional, but let's encourage at least a Case Title
      const caseTitle = document.getElementById('case-title').value.trim();
      if (!caseTitle) {
        if (!confirm("Are you sure you want to onboard this client without registering an initial case?")) {
          return;
        }
      }
      this.goToStep(3);
    });

    back2.addEventListener('click', () => this.goToStep(1));
    back3.addEventListener('click', () => this.goToStep(2));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitOnboarding();
    });
  },

  goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.wizard-form-step').forEach(el => el.style.display = 'none');
    
    // Show current step
    document.getElementById(`wiz-content-${step}`).style.display = 'block';

    // Update wizard progress indicator dots
    document.querySelectorAll('.wizard-step').forEach((el, idx) => {
      const elStep = idx + 1;
      el.className = 'wizard-step';
      if (elStep === step) {
        el.classList.add('active');
      } else if (elStep < step) {
        el.classList.add('completed');
      }
    });

    currentStep = step;
  },

  resetWizard() {
    document.getElementById('onboard-client-form').reset();
    this.goToStep(1);
  },

  /**
   * Finalize Onboarding Submission
   */
  async submitOnboarding() {
    const name = document.getElementById('client-name').value.trim();
    const type = document.getElementById('client-type').value;
    const email = document.getElementById('client-email').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const address = document.getElementById('client-address').value.trim();
    
    const caseTitle = document.getElementById('case-title').value.trim();
    const caseNumber = document.getElementById('case-number').value.trim();
    const caseCourt = document.getElementById('case-court').value.trim();
    const caseType = document.getElementById('case-type').value;
    const caseStage = document.getElementById('case-stage').value.trim();
    const caseReferredBy = document.getElementById('case-referred-by').value.trim() || 'Self';
    const caseDesc = document.getElementById('case-description').value.trim();
    
    const retainerAmount = parseFloat(document.getElementById('billing-amount').value) || 0;
    const retainerDesc = document.getElementById('billing-desc').value.trim();

    // 1. Create client
    const newClient = await db.addClient({ name, type, email, phone, address });

    // 2. Create case (if entered)
    let newCase = null;
    if (caseTitle) {
      newCase = await db.addCase({
        clientId: newClient.id,
        title: caseTitle,
        caseNumber: caseNumber || 'Pending',
        court: caseCourt || 'N/A',
        caseType,
        referredBy: caseReferredBy,
        stage: caseStage || 'Filing',
        description: caseDesc
      });
    }

    // 3. Log initial transaction (if retainer > 0)
    if (retainerAmount > 0) {
      await db.addTransaction({
        clientId: newClient.id,
        caseId: newCase ? newCase.id : null,
        amount: retainerAmount,
        type: 'Received',
        description: retainerDesc || 'Advance payment.'
      });
    }

    alert(`Client "${name}" onboarded successfully!`);
    this.resetWizard();
    this.render();
    if (caseTitle) {
      casesModule.populateReferralDatalist();
    }
  },

  /**
   * Setup Client Directory Search and Filters
   */
  setupSearchAndFilters() {
    const searchInput = document.getElementById('client-search-input');
    const filterType = document.getElementById('client-filter-type');

    searchInput.addEventListener('input', () => this.renderClientList());
    filterType.addEventListener('change', () => this.renderClientList());
  },

  /**
   * Render Client Directory Table
   */
  renderClientList() {
    const clients = db.getClients();
    const searchVal = document.getElementById('client-search-input').value.toLowerCase();
    const filterVal = document.getElementById('client-filter-type').value;
    const tableBody = document.getElementById('client-list-table-body');

    tableBody.innerHTML = '';

    const filteredClients = clients.filter(c => {
      // Search matches
      const matchesSearch = c.name.toLowerCase().includes(searchVal) || 
                            c.email.toLowerCase().includes(searchVal) || 
                            c.phone.toLowerCase().includes(searchVal);
      // Filter matches
      const matchesFilter = filterVal === 'All' || c.type === filterVal;

      return matchesSearch && matchesFilter;
    });

    if (filteredClients.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;" class="text-muted">No clients found matching the criteria.</td></tr>`;
      return;
    }

    filteredClients.forEach(c => {
      const balance = db.getClientBalance(c.id);
      const row = document.createElement('tr');
      
      const typeBadge = c.type === 'Corporate' ? 'badge-corporate' : 'badge-individual';
      const balanceStyle = balance.outstanding > 0 ? 'color: var(--color-danger); font-weight: 600;' : 'color: var(--color-success); font-weight: 600;';

      row.innerHTML = `
        <td><strong style="color:var(--text-primary);">${c.name}</strong></td>
        <td><span class="badge ${typeBadge}">${c.type}</span></td>
        <td>
          <div style="font-size:0.8rem;">${c.email}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${c.phone}</div>
        </td>
        <td>${c.onboardingDate}</td>
        <td style="${balanceStyle}">₹${balance.outstanding.toLocaleString('en-IN')}</td>
        <td>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-secondary btn-dossier" style="padding:0.25rem 0.5rem; font-size:0.75rem;" data-id="${c.id}"><i data-lucide="folder" style="width:12px; height:12px;"></i> Dossier</button>
            <button class="btn btn-danger btn-delete-client" style="padding:0.25rem 0.5rem; font-size:0.75rem;" data-id="${c.id}"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>
          </div>
        </td>
      `;

      // Event handlers
      row.querySelector('.btn-dossier').addEventListener('click', () => this.showClientDossier(c.id));
      row.querySelector('.btn-delete-client').addEventListener('click', () => this.deleteClient(c.id));

      tableBody.appendChild(row);
    });

    lucide.createIcons();
  },

  /**
   * Delete Client Action
   */
  async deleteClient(id) {
    const client = db.getClient(id);
    if (!client) return;

    if (confirm(`Are you sure you want to delete client "${client.name}"? This will also permanently delete all associated cases and billing history!`)) {
      await db.deleteClient(id);
      this.render();
    }
  },

  /**
   * Dossier Modal Controllers
   */
  setupDossierEvents() {
    const overlay = document.getElementById('client-dossier-overlay');
    const closeBtn = document.getElementById('client-dossier-close');
    const closeBtn2 = document.getElementById('client-dossier-close-btn');
    const printBtn = document.getElementById('client-dossier-print-btn');
    const editBtn = document.getElementById('client-dossier-edit-btn');

    const hideModal = () => overlay.classList.remove('active');
    closeBtn.addEventListener('click', hideModal);
    closeBtn2.addEventListener('click', hideModal);
    printBtn.addEventListener('click', () => {
      window.print();
    });

    // Edit Modal Elements
    const editModal = document.getElementById('edit-client-modal');
    const editClose = document.getElementById('edit-client-close');
    const editCancel = document.getElementById('edit-client-cancel');
    const editForm = document.getElementById('edit-client-form');

    const hideEditModal = () => editModal.classList.remove('active');
    editClose.addEventListener('click', hideEditModal);
    editCancel.addEventListener('click', hideEditModal);

    editBtn.addEventListener('click', () => {
      if (!this.currentClientId) return;
      const client = db.getClient(this.currentClientId);
      if (!client) return;

      document.getElementById('edit-client-id').value = client.id;
      document.getElementById('edit-client-name').value = client.name || '';
      document.getElementById('edit-client-type').value = client.type || 'Individual';
      document.getElementById('edit-client-phone').value = client.phone || '';
      document.getElementById('edit-client-email').value = client.email || '';
      document.getElementById('edit-client-address').value = client.address || '';
      document.getElementById('edit-client-date').value = client.onboardingDate || '';
      document.getElementById('edit-client-notes').value = client.notes || '';

      hideModal();
      editModal.classList.add('active');
    });

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-client-id').value;
      const name = document.getElementById('edit-client-name').value.trim();
      const type = document.getElementById('edit-client-type').value;
      const phone = document.getElementById('edit-client-phone').value.trim();
      const email = document.getElementById('edit-client-email').value.trim();
      const address = document.getElementById('edit-client-address').value.trim();
      const onboardingDate = document.getElementById('edit-client-date').value;
      const notes = document.getElementById('edit-client-notes').value.trim();

      await db.updateClient(id, { name, type, phone, email, address, onboardingDate, notes });
      
      hideEditModal();
      this.renderClientList();
      this.showClientDossier(id);
    });
  },

  showClientDossier(id) {
    this.currentClientId = id;
    const client = db.getClient(id);
    if (!client) return;

    const overlay = document.getElementById('client-dossier-overlay');
    const body = document.getElementById('client-dossier-body');
    const balance = db.getClientBalance(id);
    const cases = db.getCasesForClient(id);
    const txs = db.getTransactionsForClient(id);

    document.getElementById('client-dossier-title').textContent = `Dossier: ${client.name}`;

    // Compile cases markup
    let casesMarkup = '';
    if (cases.length === 0) {
      casesMarkup = `<p class="text-muted" style="font-size:0.85rem;">No cases registered under this client profile.</p>`;
    } else {
      cases.forEach(cs => {
        casesMarkup += `
          <div style="padding:0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom:0.5rem; background-color: rgba(255,255,255,0.01);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:0.9rem; color:var(--color-primary); cursor:pointer; text-decoration:underline;" onclick="viewCaseDetails('${cs.id}')">${cs.title}</strong>
              <span class="badge ${cs.status === 'Active' ? 'badge-active' : 'badge-closed'}">${cs.status}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
              Court: ${cs.court} | Stage: ${cs.stage}
            </div>
            ${cs.nextHearingDate ? `<div style="font-size:0.75rem; color:var(--color-primary); margin-top:0.25rem;">Next Hearing: ${cs.nextHearingDate}</div>` : ''}
          </div>
        `;
      });
    }

    // Compile transactions markup
    let txsMarkup = '';
    if (txs.length === 0) {
      txsMarkup = `<tr><td colspan="4" style="text-align:center;" class="text-muted">No accounting transactions logged</td></tr>`;
    } else {
      txs.forEach(t => {
        const typeStyle = t.type === 'Billed' ? 'color: var(--color-warning);' : 
                          t.type === 'Received' ? 'color: var(--color-success);' : 'color: var(--color-danger);';
        txsMarkup += `
          <tr>
            <td>${t.date}</td>
            <td>${t.description}</td>
            <td style="${typeStyle} font-weight:600;">${t.type}</td>
            <td>₹${t.amount.toLocaleString('en-IN')}</td>
          </tr>
        `;
      });
    }

    body.innerHTML = `
      <div class="dossier-header">
        <div>
          <h2 style="font-family:'Playfair Display', serif; font-size:1.6rem; color:var(--text-primary);">${client.name}</h2>
          <div class="profile-meta-grid">
            <div><span>Email:</span> <strong>${client.email || 'N/A'}</strong></div>
            <div><span>Phone:</span> <strong>${client.phone || 'N/A'}</strong></div>
            <div><span>Address:</span> <strong>${client.address || 'N/A'}</strong></div>
            <div><span>Onboarded:</span> <strong>${client.onboardingDate}</strong></div>
            <div><span>Client ID:</span> <strong>${client.id}</strong></div>
          </div>
        </div>
        <div style="text-align:right;">
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.05em; display:block;">Outstanding Balance</span>
          <h1 style="color: ${balance.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)'}; font-size:1.8rem; font-family:'Inter',sans-serif; font-weight:700;">
            ₹${balance.outstanding.toLocaleString('en-IN')}
          </h1>
        </div>
      </div>

      <div class="grid-cols-2" style="margin-bottom:1.5rem;">
        <!-- Left: Registered Cases -->
        <div class="card" style="padding:1.25rem;">
          <h3 style="font-size:1.05rem; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.4rem;">Registered Cases (${cases.length})</h3>
          ${casesMarkup}
        </div>

        <!-- Right: Billing Overview Statement -->
        <div class="card" style="padding:1.25rem;">
          <h3 style="font-size:1.05rem; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.4rem;">Financial Summary</h3>
          <div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between;">
              <span>Professional Fees Billed:</span>
              <strong>₹${balance.billed.toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span>Disbursed Expenses:</span>
              <strong>₹${balance.disbursed.toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; ${balance.writtenOff > 0 ? '' : 'border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;'}">
              <span>Payments Received:</span>
              <strong style="color:var(--color-success);">₹${balance.received.toLocaleString('en-IN')}</strong>
            </div>
            ${balance.writtenOff > 0 ? `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
              <span>Bad Debt Written Off:</span>
              <strong style="color:var(--text-secondary); text-decoration: line-through;">₹${balance.writtenOff.toLocaleString('en-IN')}</strong>
            </div>
            ` : ''}
            <div style="display:flex; justify-content:space-between; font-size:1rem; font-weight:700; margin-top:0.25rem;">
              <span>Net Outstanding dues:</span>
              <span style="color: ${balance.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)'}">₹${balance.outstanding.toLocaleString('en-IN')}</span>
            </div>
            ${balance.outstanding > 0 ? `
              <button class="btn btn-danger" style="width:100%; margin-top:1rem; font-size:0.75rem; padding:0.4rem;" id="client-dossier-writeoff-btn">
                Write Off Bad Debt
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Financial Ledger -->
      <div class="card" style="padding:1.25rem;">
        <h3 style="font-size:1.05rem; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.4rem;">Statement Ledger Entries</h3>
        <div class="table-responsive" style="max-height: 250px;">
          <table class="table-custom">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${txsMarkup}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const writeOffBtn = body.querySelector('#client-dossier-writeoff-btn');
    if (writeOffBtn) {
      writeOffBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to write off the entire outstanding balance of ₹' + balance.outstanding.toLocaleString('en-IN') + ' as bad debt? This will reduce outstanding dues to zero.')) {
          const cases = db.getCasesForClient(id);
          let wroteOffAny = false;
          for (const cs of cases) {
            const caseBal = db.getCaseBalance(cs.id);
            if (caseBal.outstanding > 0) {
              await db.addTransaction({
                clientId: id,
                caseId: cs.id,
                amount: caseBal.outstanding,
                type: 'WrittenOff',
                description: `Write-off bad debt (Client fled: ${cs.title})`
              });
              wroteOffAny = true;
            }
          }

          // Also check client-level outstanding balance if any
          const clientTxs = db.getTransactionsForClient(id);
          const clientLevelTxs = clientTxs.filter(t => !t.caseId);
          let clBilled = 0, clReceived = 0, clDisbursed = 0, clWritten = 0;
          clientLevelTxs.forEach(t => {
            if (t.type === 'Billed') clBilled += t.amount;
            else if (t.type === 'Received') clReceived += t.amount;
            else if (t.type === 'Disbursed') clDisbursed += t.amount;
            else if (t.type === 'WrittenOff') clWritten += t.amount;
          });
          const clOutstanding = Math.max(0, (clBilled + clDisbursed) - clReceived - clWritten);
          if (clOutstanding > 0) {
            await db.addTransaction({
              clientId: id,
              caseId: null,
              amount: clOutstanding,
              type: 'WrittenOff',
              description: `Write-off bad debt (Client fled: Unassociated dues)`
            });
            wroteOffAny = true;
          }

          if (!wroteOffAny && balance.outstanding > 0) {
            await db.addTransaction({
              clientId: id,
              caseId: null,
              amount: balance.outstanding,
              type: 'WrittenOff',
              description: `Write-off bad debt (Client fled)`
            });
          }

          this.renderClientList();
          this.showClientDossier(id);
        }
      });
    }

    overlay.classList.add('active');
    lucide.createIcons();
  }
};

export default clientsModule;
