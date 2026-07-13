/**
 * VSH Legal - Case & Practice Manager Cases Module
 * Manages the case register, linking cases to clients, recording hearings, and timeline trackers.
 */

import db from './db.js';
import accountsModule from './accounts.js';

const casesModule = {
  init() {
    this.setupFilters();
    this.setupRegisterCaseForm();
    this.setupHearingForm();
    this.setupEditHearingForm();
    this.setupCaseDossierEvents();
    this.populateReferralDatalist();

    // Listen for custom logged transaction events to refresh views in real-time
    document.addEventListener('transactionLogged', (e) => {
      this.renderCaseGrid();
      const overlay = document.getElementById('case-dossier-overlay');
      if (overlay.classList.contains('active') && this.currentCaseId === e.detail.caseId) {
        this.showCaseDossier(this.currentCaseId);
      }
    });
  },

  render() {
    this.renderCaseGrid();
    this.populateClientDropdowns();
    this.populateReferralDatalist();
  },

  /**
   * Populate dropdown select lists with active onboarded clients
   */
  populateClientDropdowns() {
    const clients = db.getClients();
    const dropdown = document.getElementById('add-case-client-id');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="" disabled selected>-- Select Onboarded Client --</option>';
    clients.forEach(c => {
      dropdown.innerHTML += `<option value="${c.id}">${c.name} (${c.type})</option>`;
    });
  },

  /**
   * Populate referral datalist with unique referrers
   */
  populateReferralDatalist() {
    const list = document.getElementById('referral-partners-list');
    if (!list) return;

    const partners = db.getReferralPartners();
    list.innerHTML = '';
    partners.forEach(p => {
      list.innerHTML += `<option value="${p}"></option>`;
    });
  },

  /**
   * Setup Filter inputs
   */
  setupFilters() {
    const searchInput = document.getElementById('case-search-input');
    const filterStatus = document.getElementById('case-filter-status');
    const filterCategory = document.getElementById('case-filter-category');

    searchInput.addEventListener('input', () => this.renderCaseGrid());
    filterStatus.addEventListener('change', () => this.renderCaseGrid());
    filterCategory.addEventListener('change', () => this.renderCaseGrid());

    // Register Case trigger modal btn
    const registerBtn = document.getElementById('btn-add-case');
    const modal = document.getElementById('add-case-modal');
    registerBtn.addEventListener('click', () => {
      this.populateClientDropdowns();
      modal.classList.add('active');
    });
  },

  /**
   * Case Registration form
   */
  setupRegisterCaseForm() {
    const form = document.getElementById('add-case-form');
    const modal = document.getElementById('add-case-modal');
    const cancelBtn = document.getElementById('add-case-cancel');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clientId = document.getElementById('add-case-client-id').value;
      const title = document.getElementById('add-case-title').value.trim();
      const caseNumber = document.getElementById('add-case-number').value.trim();
      const caseType = document.getElementById('add-case-type').value;
      const court = document.getElementById('add-case-court').value.trim();
      const stage = document.getElementById('add-case-stage').value.trim();
      const nextHearingDate = document.getElementById('add-case-next-date').value || null;
      const referredBy = document.getElementById('add-case-referred-by').value.trim() || 'Self';
      const description = document.getElementById('add-case-desc').value.trim();

      if (!clientId) {
        alert("Please select a client.");
        return;
      }

      // Add Case
      const newCase = await db.addCase({
        clientId, title, caseNumber, caseType, court, stage, nextHearingDate, description, referredBy
      });

      // Log an initial blank hearing in history if next hearing is defined
      if (nextHearingDate) {
        await db.addHearing(newCase.id, {
          date: new Date().toISOString().split('T')[0],
          stage: "Register",
          notes: "Case registered. First hearing listed on: " + nextHearingDate,
          nextHearingDate
        });
      }

      alert("Case registered successfully.");
      form.reset();
      modal.classList.remove('active');
      this.render();
    });

    cancelBtn.addEventListener('click', () => {
      form.reset();
      modal.classList.remove('active');
    });
  },

  /**
   * Render Cases
   */
  renderCaseGrid() {
    const cases = db.getCases();
    const searchVal = document.getElementById('case-search-input').value.toLowerCase();
    const filterStatus = document.getElementById('case-filter-status').value;
    const filterCategory = document.getElementById('case-filter-category').value;
    const gridContainer = document.getElementById('cases-grid-list');

    gridContainer.innerHTML = '';

    const filteredCases = cases.filter(c => {
      const client = db.getClient(c.clientId);
      const clientName = client ? client.name.toLowerCase() : '';
      
      const matchesSearch = c.title.toLowerCase().includes(searchVal) || 
                            c.caseNumber.toLowerCase().includes(searchVal) || 
                            c.court.toLowerCase().includes(searchVal) ||
                            clientName.includes(searchVal);
      
      const matchesStatus = filterStatus === 'All' || c.status === filterStatus;
      const matchesCategory = filterCategory === 'All' || c.caseType === filterCategory;

      return matchesSearch && matchesStatus && matchesCategory;
    });

    if (filteredCases.length === 0) {
      gridContainer.innerHTML = `<div class="card" style="grid-column: 1/-1; text-align:center; padding:3rem;" class="text-muted"><p>No cases registered matching the criteria.</p></div>`;
      return;
    }

    filteredCases.forEach(c => {
      const client = db.getClient(c.clientId);
      const balance = db.getCaseBalance(c.id);
      const card = document.createElement('div');
      card.className = 'card';
      
      const badgeStyle = c.status === 'Active' ? 'badge-active' : 'badge-closed';
      const balanceStyle = balance.outstanding > 0 ? 'color: var(--color-danger); font-weight:600;' : 'color: var(--color-success);';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:600;">${c.caseType}</span>
          <span class="badge ${badgeStyle}">${c.status}</span>
        </div>
        <h3 style="font-size:1.15rem; color:var(--text-primary); line-height:1.3; margin-bottom:0.5rem;" class="case-title-link">${c.title}</h3>
        
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem; display:flex; flex-direction:column; gap:0.25rem;">
          <div><i data-lucide="user" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Client: <strong>${client ? client.name : 'Unknown'}</strong></div>
          <div><i data-lucide="hash" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> CNR/Ref: ${c.caseNumber}</div>
          <div><i data-lucide="map-pin" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Court: ${c.court}</div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding: 0.75rem 0; margin-bottom:0.5rem; display:flex; justify-content:space-between; font-size:0.8rem;">
          <div>Stage: <strong style="color:var(--text-primary);">${c.stage}</strong></div>
          <div style="${balanceStyle}">O/S: ₹${balance.outstanding.toLocaleString('en-IN')}</div>
        </div>

        <div style="background-color: rgba(217, 119, 6, 0.05); padding:0.5rem; border-radius: var(--radius-sm); border:1px solid rgba(217, 119, 6, 0.15); margin-bottom:1rem; text-align:center; font-size:0.8rem;">
          <span style="color:var(--text-secondary);">Next Hearing:</span> 
          <strong style="color:var(--color-primary);">${c.nextHearingDate ? c.nextHearingDate : 'Not Scheduled'}</strong>
        </div>

        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-secondary btn-case-ledger" style="flex:1; padding:0.4rem 0.5rem; font-size:0.75rem;" data-id="${c.id}"><i data-lucide="book-open"></i> Ledger</button>
          <button class="btn btn-primary btn-case-hearing" style="flex:1; padding:0.4rem 0.5rem; font-size:0.75rem;" data-id="${c.id}"><i data-lucide="calendar"></i> Hearing</button>
          <button class="btn btn-secondary btn-case-toggle" style="padding:0.4rem 0.6rem;" data-id="${c.id}" title="Toggle Case Status (Active/Closed)">
            <i data-lucide="${c.status === 'Active' ? 'check-circle-2' : 'rotate-ccw'}" style="width:14px; height:14px;"></i>
          </button>
        </div>
      `;

      // Set up click handlers
      card.querySelector('.case-title-link').addEventListener('click', () => this.showCaseDossier(c.id));
      card.querySelector('.btn-case-ledger').addEventListener('click', () => this.showCaseDossier(c.id));
      card.querySelector('.btn-case-hearing').addEventListener('click', () => this.showAddHearingModal(c.id));
      
      card.querySelector('.btn-case-toggle').addEventListener('click', async () => {
        const newStatus = c.status === 'Active' ? 'Closed' : 'Active';
        if (confirm(`Do you want to mark this case status as "${newStatus}"?`)) {
          await db.updateCase(c.id, { status: newStatus });
          this.render();
        }
      });

      gridContainer.appendChild(card);
    });

    lucide.createIcons();
  },

  /**
   * Hearing log registering
   */
  setupHearingForm() {
    const form = document.getElementById('add-hearing-form');
    const modal = document.getElementById('add-hearing-modal');
    const cancelBtn = document.getElementById('add-hearing-cancel');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const caseId = document.getElementById('add-hearing-case-id').value;
      const date = document.getElementById('add-hearing-date').value;
      const stage = document.getElementById('add-hearing-stage').value.trim();
      const nextHearingDate = document.getElementById('add-hearing-next-date').value || null;
      const nextStage = document.getElementById('add-hearing-next-stage').value.trim() || null;
      const notes = document.getElementById('add-hearing-notes').value.trim();

      // Register Hearing
      await db.addHearing(caseId, { date, stage, nextHearingDate, nextStage, notes });

      alert("Hearing history logged.");
      form.reset();
      modal.classList.remove('active');
      
      // If we are looking at a dossier modal, refresh it
      const dossierOverlay = document.getElementById('case-dossier-overlay');
      if (dossierOverlay.classList.contains('active')) {
        this.showCaseDossier(caseId);
      }

      this.render();
    });

    cancelBtn.addEventListener('click', () => {
      form.reset();
      modal.classList.remove('active');
    });
  },

  showAddHearingModal(caseId) {
    const cs = db.getCase(caseId);
    if (!cs) return;

    document.getElementById('add-hearing-case-id').value = caseId;
    // Set default date to today
    document.getElementById('add-hearing-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('add-hearing-stage').value = cs.stage || '';
    document.getElementById('add-hearing-next-stage').value = '';
    document.getElementById('add-hearing-next-date').value = '';
    
    const modal = document.getElementById('add-hearing-modal');
    modal.classList.add('active');
  },

  setupEditHearingForm() {
    const form = document.getElementById('edit-hearing-form');
    const modal = document.getElementById('edit-hearing-modal');
    const closeBtn = document.getElementById('edit-hearing-close');
    const cancelBtn = document.getElementById('edit-hearing-cancel');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const caseId = document.getElementById('edit-hearing-case-id').value;
      const hearingId = document.getElementById('edit-hearing-id').value;
      const date = document.getElementById('edit-hearing-date').value;
      const stage = document.getElementById('edit-hearing-stage').value.trim();
      const notes = document.getElementById('edit-hearing-notes').value.trim();

      await db.updateHearing(caseId, hearingId, { date, stage, notes });

      alert("Hearing entry updated.");
      form.reset();
      modal.classList.remove('active');

      // Refresh dossier
      this.showCaseDossier(caseId);
      this.render();
    });

    const hide = () => {
      form.reset();
      modal.classList.remove('active');
    };
    closeBtn.addEventListener('click', hide);
    cancelBtn.addEventListener('click', hide);
  },

  showEditHearingModal(caseId, hearingId) {
    const cs = db.getCase(caseId);
    if (!cs) return;
    const hearing = (cs.hearings || []).find(h => h.id === hearingId);
    if (!hearing) return;

    document.getElementById('edit-hearing-case-id').value = caseId;
    document.getElementById('edit-hearing-id').value = hearingId;
    document.getElementById('edit-hearing-date').value = hearing.date;
    document.getElementById('edit-hearing-stage').value = hearing.stage || '';
    document.getElementById('edit-hearing-notes').value = hearing.notes || '';

    const modal = document.getElementById('edit-hearing-modal');
    modal.classList.add('active');
  },

  /**
   * Case Dossier (Ledger with Timeline)
   */
  setupCaseDossierEvents() {
    const overlay = document.getElementById('case-dossier-overlay');
    const closeBtn = document.getElementById('case-dossier-close');
    const closeBtn2 = document.getElementById('case-dossier-close-btn');
    const addHearingBtn = document.getElementById('case-dossier-add-hearing-btn');
    const editBtn = document.getElementById('case-dossier-edit-btn');

    const hide = () => overlay.classList.remove('active');
    closeBtn.addEventListener('click', hide);
    closeBtn2.addEventListener('click', hide);
    
    addHearingBtn.addEventListener('click', () => {
      const caseId = addHearingBtn.getAttribute('data-case-id');
      this.showAddHearingModal(caseId);
    });

    // Edit Modal Elements
    const editModal = document.getElementById('edit-case-modal');
    const editClose = document.getElementById('edit-case-close');
    const editCancel = document.getElementById('edit-case-cancel');
    const editForm = document.getElementById('edit-case-form');
    const deleteBtn = document.getElementById('edit-case-delete-btn');

    const hideEditModal = () => editModal.classList.remove('active');
    editClose.addEventListener('click', hideEditModal);
    editCancel.addEventListener('click', hideEditModal);

    editBtn.addEventListener('click', () => {
      if (!this.currentCaseId) return;
      const cs = db.getCase(this.currentCaseId);
      if (!cs) return;

      document.getElementById('edit-case-id').value = cs.id;
      document.getElementById('edit-case-title').value = cs.title || '';
      document.getElementById('edit-case-number').value = cs.caseNumber || '';
      document.getElementById('edit-case-type').value = cs.caseType || 'Civil';
      document.getElementById('edit-case-court').value = cs.court || '';
      document.getElementById('edit-case-stage').value = cs.stage || '';
      document.getElementById('edit-case-status').value = cs.status || 'Active';
      document.getElementById('edit-case-referred-by').value = cs.referredBy || 'Self';
      document.getElementById('edit-case-desc').value = cs.description || '';

      hide();
      editModal.classList.add('active');
      lucide.createIcons();
    });

    deleteBtn.addEventListener('click', async () => {
      if (!this.currentCaseId) return;
      const cs = db.getCase(this.currentCaseId);
      if (!cs) return;

      if (confirm(`Are you sure you want to delete the case "${cs.title}"? This will permanently delete the case, all associated hearings, and linked transactions.`)) {
        await db.deleteCase(this.currentCaseId);
        hideEditModal();
        this.renderCaseGrid();
        alert("Case deleted successfully.");
      }
    });

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-case-id').value;
      const title = document.getElementById('edit-case-title').value.trim();
      const caseNumber = document.getElementById('edit-case-number').value.trim();
      const caseType = document.getElementById('edit-case-type').value;
      const court = document.getElementById('edit-case-court').value.trim();
      const stage = document.getElementById('edit-case-stage').value.trim();
      const status = document.getElementById('edit-case-status').value;
      const referredBy = document.getElementById('edit-case-referred-by').value.trim() || 'Self';
      const description = document.getElementById('edit-case-desc').value.trim();

      await db.updateCase(id, { title, caseNumber, caseType, court, stage, status, description, referredBy });

      hideEditModal();
      this.renderCaseGrid();
      this.populateReferralDatalist();
      this.showCaseDossier(id);
    });
  },

  showCaseDossier(id) {
    this.currentCaseId = id;
    const cs = db.getCase(id);
    if (!cs) return;

    const overlay = document.getElementById('case-dossier-overlay');
    const body = document.getElementById('case-dossier-body');
    const addHearingBtn = document.getElementById('case-dossier-add-hearing-btn');
    
    addHearingBtn.setAttribute('data-case-id', id);

    const client = db.getClient(cs.clientId);
    const balance = db.getCaseBalance(cs.id);
    const hearings = cs.hearings || [];

    // Chronological order for hearing history
    const sortedHearings = [...hearings].sort((a, b) => new Date(b.date) - new Date(a.date));

    let timelineMarkup = '';
    
    // Add next scheduled hearing at the top of the timeline if active and defined
    if (cs.status === 'Active' && cs.nextHearingDate) {
      timelineMarkup += `
        <div style="border-left: 2px dashed #f59e0b; padding-left: 1.25rem; position: relative; margin-bottom: 1.25rem;">
          <!-- timeline dot pointer -->
          <div style="width: 10px; height: 10px; border-radius:50%; background-color:#f59e0b; border: 2px solid var(--bg-sidebar); position: absolute; left: -6px; top: 4px;"></div>
          <div style="font-size:0.75rem; color:#f59e0b; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.15rem;">Upcoming Scheduled</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;">${cs.nextHearingDate}</div>
          <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary); margin-top:0.15rem;">Stage: ${cs.stage}</div>
        </div>
      `;
    }

    if (sortedHearings.length === 0 && !cs.nextHearingDate) {
      timelineMarkup = `<p class="text-muted" style="font-size:0.85rem; padding: 1rem 0;">No hearings recorded in history ledger.</p>`;
    } else {
      sortedHearings.forEach(h => {
        timelineMarkup += `
          <div style="border-left: 2px solid var(--color-primary); padding-left: 1.25rem; position: relative; margin-bottom: 1.25rem;">
            <!-- timeline dot pointer -->
            <div style="width: 10px; height: 10px; border-radius:50%; background-color:var(--color-primary); border: 2px solid var(--bg-sidebar); position: absolute; left: -6px; top: 4px;"></div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;">${h.date}</div>
              <button class="btn btn-secondary btn-edit-hearing" data-hearing-id="${h.id}" data-case-id="${cs.id}" style="padding: 2px 6px; font-size: 0.65rem; border-radius: var(--radius-xs); line-height: 1;" title="Edit Hearing Details">
                <i data-lucide="pencil" style="width:10px; height:10px;"></i> Edit
              </button>
            </div>
            <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary); margin-top:0.15rem;">Stage: ${h.stage}</div>
            ${h.nextStage ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.1rem;">Next Purpose/Stage: <strong>${h.nextStage}</strong></div>` : ''}
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem; white-space: pre-wrap;">${h.notes || 'No hearing notes provided.'}</p>
          </div>
        `;
      });
    }

    body.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; border-bottom:1px solid var(--border-color); padding-bottom:1rem;">
        <div>
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:600;">${cs.caseType}</span>
          <h2 style="font-family:'Playfair Display', serif; font-size:1.5rem; color:var(--text-primary); line-height:1.2; margin-top:0.25rem;">${cs.title}</h2>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.5rem; display:flex; flex-direction:column; gap:0.25rem;">
            <div>CNR/Ref Number: <strong>${cs.caseNumber}</strong></div>
            <div>Court/Forum: <strong>${cs.court}</strong></div>
            <div>Linked Client: <strong style="color:var(--color-primary);">${client ? client.name : 'Unknown'}</strong></div>
          </div>
        </div>
        <div style="text-align:right;">
          <span class="badge ${cs.status === 'Active' ? 'badge-active' : 'badge-closed'}" style="margin-bottom:0.5rem;">Status: ${cs.status}</span>
          <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Case Dues</div>
          <h2 style="color:${balance.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)'}; font-size:1.6rem; font-family:'Inter'; font-weight:700;">₹${balance.outstanding.toLocaleString('en-IN')}</h2>
        </div>
      </div>

      <div style="margin-bottom:1.5rem;">
        <h4 style="font-size:0.9rem; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.05em; margin-bottom:0.4rem;">Brief Description & Claims</h4>
        <div style="font-size:0.85rem; color:var(--text-secondary); background-color:rgba(0,0,0,0.1); padding:0.75rem; border-radius:var(--radius-md); border:1px solid var(--border-color);">
          ${cs.description || 'No detailed briefing registered for this case.'}
        </div>
      </div>

      <div class="grid-cols-2" style="grid-template-columns: 3fr 2fr; gap:1.5rem;">
        <!-- Left: Timeline of hearings -->
        <div class="card" style="padding:1.25rem; max-height:350px; overflow-y:auto;">
          <h3 style="font-size:1.05rem; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.4rem;">Hearing History Timeline</h3>
          <div style="margin-top:0.75rem;">
            ${timelineMarkup}
          </div>
        </div>

        <!-- Right: Case Financial Summary -->
        <div class="card" style="padding:1.25rem; height:fit-content;">
          <h3 style="font-size:1.05rem; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.4rem;">Case Account</h3>
          <div style="display:flex; flex-direction:column; gap:0.55rem; font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between;">
              <span>Professional Fees Billed:</span>
              <strong>₹${balance.billed.toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span>Disbursements:</span>
              <strong>₹${balance.disbursed.toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; ${balance.writtenOff > 0 ? '' : 'border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;'}">
              <span>Payments Logged:</span>
              <strong style="color:var(--color-success);">₹${balance.received.toLocaleString('en-IN')}</strong>
            </div>
            ${balance.writtenOff > 0 ? `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
              <span>Bad Debt Written Off:</span>
              <strong style="color:var(--text-secondary); text-decoration: line-through;">₹${balance.writtenOff.toLocaleString('en-IN')}</strong>
            </div>
            ` : ''}
            <div style="display:flex; justify-content:space-between; font-size:0.95rem; font-weight:700; margin-top:0.25rem;">
              <span>Outstanding Fees:</span>
              <span style="color:${balance.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)'}">₹${balance.outstanding.toLocaleString('en-IN')}</span>
            </div>
            
            <button class="btn btn-primary" style="width:100%; margin-top:1rem; font-size:0.75rem; padding:0.4rem;" id="case-ledger-log-tx-btn">
              <i data-lucide="plus-circle" style="width:12px; height:12px; margin-right:4px; vertical-align:middle;"></i> Log Financial Entry
            </button>

            <button class="btn btn-secondary" style="width:100%; margin-top:0.5rem; font-size:0.75rem; padding:0.4rem;" id="case-ledger-go-accounts-btn">
              Go to Financial Ledger
            </button>

            ${balance.outstanding > 0 ? `
            <button class="btn btn-danger" style="width:100%; margin-top:0.5rem; font-size:0.75rem; padding:0.4rem;" id="case-ledger-writeoff-btn">
              Write Off Bad Debt
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Event listener to open Log Transaction modal pre-filled
    body.querySelector('#case-ledger-log-tx-btn').addEventListener('click', () => {
      accountsModule.showLogTransactionModal(cs.clientId, cs.id);
    });

    // Event listeners to edit specific past hearings
    body.querySelectorAll('.btn-edit-hearing').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const caseId = btn.getAttribute('data-case-id');
        const hearingId = btn.getAttribute('data-hearing-id');
        this.showEditHearingModal(caseId, hearingId);
      });
    });

    // Event link inside case ledger to jump directly to Accounts
    body.querySelector('#case-ledger-go-accounts-btn').addEventListener('click', () => {
      overlay.classList.remove('active');
      window.switchView('accounts-page');
      
      // Filter the ledger by this client
      setTimeout(() => {
        const clientFilter = document.getElementById('ledger-filter-client');
        if (clientFilter) {
          clientFilter.value = cs.clientId;
          clientFilter.dispatchEvent(new Event('change'));
        }
      }, 50);
    });

    const writeOffBtn = body.querySelector('#case-ledger-writeoff-btn');
    if (writeOffBtn) {
      writeOffBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to write off the outstanding balance of ₹' + balance.outstanding.toLocaleString('en-IN') + ' for this case as bad debt?')) {
          await db.addTransaction({
            clientId: cs.clientId,
            caseId: cs.id,
            amount: balance.outstanding,
            type: 'WrittenOff',
            description: `Write-off bad debt (Client fled: ${cs.title})`
          });
          
          this.renderCaseGrid();
          this.showCaseDossier(id);
        }
      });
    }

    overlay.classList.add('active');
    lucide.createIcons();
  }
};

export default casesModule;
