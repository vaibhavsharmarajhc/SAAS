/**
 * VSH Legal - Case & Practice Manager Clients Module
 * Manages the onboarding wizard, directory filters, and detailed dossiers.
 */

import db from './db.js';
import casesModule from './cases.js';
import historyManager from './history.js';

let currentStep = 1;

const clientsModule = {
  state: {
    sortColumn: 'name',
    sortDirection: 'asc',
    currentPage: 1,
    pageSize: 10
  },

  getInitials(name) {
    if (!name) return 'CL';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  },

  getAvatarColor(str) {
    const colors = ['#d97706', '#2563eb', '#059669', '#7c3aed', '#db2777', '#0891b2', '#ea580c'];
    let hash = 0;
    const s = str || 'Client';
    for (let i = 0; i < s.length; i++) {
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  },

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
    const caseNextDateEl = document.getElementById('case-next-date');
    const caseNextDate = caseNextDateEl ? caseNextDateEl.value || null : null;
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
        nextHearingDate: caseNextDate,
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
    const gotoOnboardBtn = document.getElementById('btn-goto-onboarding');

    if (searchInput) searchInput.addEventListener('input', () => {
      this.state.currentPage = 1;
      this.renderClientList();
    });
    if (filterType) filterType.addEventListener('change', () => {
      this.state.currentPage = 1;
      this.renderClientList();
    });

    // Header Click Event Listeners for Sorting
    document.querySelectorAll('#client-directory-table .client-sort-header').forEach(header => {
      header.addEventListener('click', () => {
        const col = header.dataset.sort;
        if (!col) return;
        if (this.state.sortColumn === col) {
          this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.sortColumn = col;
          this.state.sortDirection = 'asc';
        }
        this.state.currentPage = 1;
        this.renderClientList();
      });
    });

    if (gotoOnboardBtn) {
      gotoOnboardBtn.addEventListener('click', () => {
        this.resetWizard();
        if (typeof window.switchView === 'function') {
          window.switchView('clients-page');
        }
        const wizardCard = document.getElementById('onboard-client-wizard-card') || document.querySelector('#clients-page .card');
        if (wizardCard) {
          wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        const clientNameInput = document.getElementById('client-name');
        if (clientNameInput) {
          setTimeout(() => clientNameInput.focus(), 300);
        }
      });
    }
  },

  /**
   * Render Client Directory Table
   */
  renderClientList() {
    const clients = db.getClients();
    const searchVal = (document.getElementById('client-search-input')?.value || '').toLowerCase();
    const filterVal = document.getElementById('client-filter-type')?.value || 'All';
    const tableBody = document.getElementById('client-list-table-body');
    const paginationBar = document.getElementById('client-pagination-bar');

    if (!tableBody) return;
    tableBody.innerHTML = '';

    const filteredClients = clients.filter(c => {
      const nameMatch = (c.name || '').toLowerCase().includes(searchVal);
      const emailMatch = (c.email || '').toLowerCase().includes(searchVal);
      const phoneMatch = (c.phone || '').toLowerCase().includes(searchVal);
      const matchesSearch = nameMatch || emailMatch || phoneMatch;
      const matchesFilter = filterVal === 'All' || c.type === filterVal;

      return matchesSearch && matchesFilter;
    });

    // Update Header Sort Icons
    document.querySelectorAll('#client-directory-table .client-sort-header').forEach(header => {
      const col = header.dataset.sort;
      const icon = header.querySelector('.sort-icon');
      if (icon) {
        if (col === this.state.sortColumn) {
          icon.setAttribute('data-lucide', this.state.sortDirection === 'asc' ? 'chevron-up' : 'chevron-down');
          header.style.color = 'var(--color-primary)';
        } else {
          icon.setAttribute('data-lucide', 'chevrons-up-down');
          header.style.color = 'var(--text-muted)';
        }
      }
    });

    // Sort filtered list
    const mult = this.state.sortDirection === 'asc' ? 1 : -1;
    filteredClients.sort((a, b) => {
      if (this.state.sortColumn === 'name') {
        return (a.name || '').localeCompare(b.name || '') * mult;
      }
      if (this.state.sortColumn === 'type') {
        return (a.type || '').localeCompare(b.type || '') * mult;
      }
      if (this.state.sortColumn === 'onboardingDate') {
        return (a.onboardingDate || '').localeCompare(b.onboardingDate || '') * mult;
      }
      if (this.state.sortColumn === 'outstanding') {
        const balA = db.getClientBalance(a.id).outstanding || 0;
        const balB = db.getClientBalance(b.id).outstanding || 0;
        return (balA - balB) * mult;
      }
      return 0;
    });

    const totalItems = filteredClients.length;
    if (totalItems === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;" class="text-muted">No clients found matching the criteria.</td></tr>`;
      if (paginationBar) paginationBar.innerHTML = '';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const totalPages = Math.ceil(totalItems / this.state.pageSize) || 1;
    this.state.currentPage = Math.max(1, Math.min(this.state.currentPage, totalPages));
    const startIndex = (this.state.currentPage - 1) * this.state.pageSize;
    const pageClients = filteredClients.slice(startIndex, startIndex + this.state.pageSize);

    pageClients.forEach(c => {
      const balance = db.getClientBalance(c.id);
      const row = document.createElement('tr');
      
      const typeBadge = c.type === 'Corporate' ? 'badge-corporate' : 'badge-individual';
      const balanceStyle = balance.outstanding > 0 ? 'color: var(--color-danger); font-weight: 600;' : 'color: var(--color-success); font-weight: 600;';

      const initials = this.getInitials(c.name);
      const avatarBg = this.getAvatarColor(c.name || c.id);

      row.innerHTML = `
        <td>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <div style="width:26px; height:26px; border-radius:50%; background:${avatarBg}; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; flex-shrink:0; text-transform:uppercase;">
              ${initials}
            </div>
            <strong style="color:var(--text-primary); font-size:0.85rem;">${c.name}</strong>
          </div>
        </td>
        <td><span class="badge ${typeBadge}">${c.type}</span></td>
        <td>
          <div style="font-size:0.8rem;">${c.email || 'N/A'}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${c.phone || ''}</div>
        </td>
        <td>${window.formatDDMMYYYY(c.onboardingDate)}</td>
        <td style="${balanceStyle}">₹${balance.outstanding.toLocaleString('en-IN')}</td>
        <td style="text-align:right;">
          <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.4rem; flex-wrap:nowrap;">
            <button class="btn btn-secondary btn-dossier" style="padding:0 0.6rem; height:28px; font-size:0.75rem; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; gap:0.35rem;" data-id="${c.id}"><i data-lucide="folder" style="width:12px; height:12px; flex-shrink:0;"></i> Dossier</button>
            <button class="btn btn-secondary btn-copy-portal" style="padding:0 0.6rem; height:28px; font-size:0.75rem; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; gap:0.35rem;" data-id="${c.id}"><i data-lucide="link" style="width:12px; height:12px; flex-shrink:0;"></i> Copy Link</button>
            <button class="btn btn-danger btn-delete-client" style="padding:0; width:28px; height:28px; font-size:0.75rem; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;" data-id="${c.id}" title="Delete Client Profile"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>
          </div>
        </td>
      `;

      // Event handlers
      row.querySelector('.btn-dossier').addEventListener('click', () => this.showClientDossier(c.id));
      row.querySelector('.btn-copy-portal').addEventListener('click', () => this.copyClientPortalLink(c.id));
      row.querySelector('.btn-delete-client').addEventListener('click', () => this.deleteClient(c.id));

      tableBody.appendChild(row);
    });

    // Render Pagination Controls
    if (paginationBar) {
      const endItem = Math.min(startIndex + this.state.pageSize, totalItems);
      paginationBar.innerHTML = `
        <div>
          Showing <strong>${startIndex + 1}</strong>-<strong>${endItem}</strong> of <strong>${totalItems}</strong> clients
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
          <select id="client-page-size-select" class="form-control" style="width:auto; padding:0.2rem 0.5rem; font-size:0.75rem; height:28px;">
            <option value="10" ${this.state.pageSize === 10 ? 'selected' : ''}>10 / page</option>
            <option value="25" ${this.state.pageSize === 25 ? 'selected' : ''}>25 / page</option>
            <option value="50" ${this.state.pageSize === 50 ? 'selected' : ''}>50 / page</option>
          </select>
          <button class="btn btn-secondary" id="client-prev-page-btn" ${this.state.currentPage === 1 ? 'disabled' : ''} style="padding:0.2rem 0.6rem; height:28px; font-size:0.75rem; display:inline-flex; align-items:center; gap:0.25rem;">
            <i data-lucide="chevron-left" style="width:12px; height:12px;"></i> Prev
          </button>
          <span style="font-weight:600;">Page ${this.state.currentPage} of ${totalPages}</span>
          <button class="btn btn-secondary" id="client-next-page-btn" ${this.state.currentPage === totalPages ? 'disabled' : ''} style="padding:0.2rem 0.6rem; height:28px; font-size:0.75rem; display:inline-flex; align-items:center; gap:0.25rem;">
            Next <i data-lucide="chevron-right" style="width:12px; height:12px;"></i>
          </button>
        </div>
      `;

      const pageSizeSelect = document.getElementById('client-page-size-select');
      const prevBtn = document.getElementById('client-prev-page-btn');
      const nextBtn = document.getElementById('client-next-page-btn');

      if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', (e) => {
          this.state.pageSize = parseInt(e.target.value, 10) || 10;
          this.state.currentPage = 1;
          this.renderClientList();
        });
      }
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (this.state.currentPage > 1) {
            this.state.currentPage--;
            this.renderClientList();
          }
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (this.state.currentPage < totalPages) {
            this.state.currentPage++;
            this.renderClientList();
          }
        });
      }
    }

    if (window.lucide) window.lucide.createIcons();
  },

  copyClientPortalLink(id) {
    const client = db.getClient(id);
    if (!client) return;

    let token = client.accessToken;
    if (!token) {
      token = 'pt_' + Math.random().toString(36).substring(2, 11);
      client.accessToken = token;
      db.updateClient(id, { accessToken: token });
    }

    const modal = document.getElementById('portal-share-modal');
    const nameEl = document.getElementById('portal-share-client-name');
    const copyBtn = document.getElementById('portal-share-copy-btn');
    const cancelBtn = document.getElementById('portal-share-cancel');
    const closeBtn = document.getElementById('portal-share-close');

    if (nameEl) nameEl.textContent = window.sanitizeText ? window.sanitizeText(client.name) : (client.name || 'Client');

    const baseUrl = window.location.origin;
    const portalUrl = `${baseUrl}/portal?token=${encodeURIComponent(token)}`;

    const handleCopy = async () => {
      let copied = false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(portalUrl);
          copied = true;
          alert(`Verified Client Access Portal Link copied to clipboard:\n\n${portalUrl}`);
        }
      } catch (err) {
        console.warn("Clipboard API write failed, attempting fallback:", err);
      }

      if (!copied) {
        try {
          const ta = document.createElement('textarea');
          ta.value = portalUrl;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          if (ok) {
            alert(`Verified Client Access Portal Link copied to clipboard:\n\n${portalUrl}`);
            copied = true;
          }
        } catch (e) {}
      }

      if (!copied) {
        prompt("Copy Verified Client Access Portal Link below:", portalUrl);
      }
      if (modal) modal.classList.remove('active');
    };

    const handleClose = () => {
      if (modal) modal.classList.remove('active');
    };

    if (copyBtn) copyBtn.onclick = handleCopy;
    if (cancelBtn) cancelBtn.onclick = handleClose;
    if (closeBtn) closeBtn.onclick = handleClose;

    if (modal) {
      modal.classList.add('active');
      if (window.lucide) window.lucide.createIcons();
    }
  },

  async regeneratePortalLink(id) {
    const client = db.getClient(id);
    if (!client) return;

    if (confirm(`Regenerate portal access link for "${client.name}"? The previous link will stop working instantly.`)) {
      try {
        const res = await api.clients.regenerateToken(id);
        if (res && res.accessToken) {
          client.accessToken = res.accessToken;
        }
      } catch (e) {
        client.accessToken = 'pt_' + Math.random().toString(36).substring(2, 11);
      }
      this.render();
      this.showClientDossier(id);
      this.copyClientPortalLink(id);
    }
  },

  async deleteClient(id) {
    const client = db.getClient(id);
    if (!client) return;

    if (!confirm(`Are you sure you want to delete client profile "${client.name}"?\n\nThis action will delete the client record and cannot be undone.`)) {
      return;
    }

    await db.deleteClient(id);
    this.renderClientList();

    historyManager.push({
      description: `Client "${client.name}" deleted`,
      undo: async () => {
        await db.createClient(client);
        this.renderClientList();
      },
      redo: async () => {
        await db.deleteClient(id);
        this.renderClientList();
      }
    });
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
            ${cs.nextHearingDate ? `<div style="font-size:0.75rem; color:var(--color-primary); margin-top:0.25rem;">Next Hearing: ${window.formatDDMMYYYY(cs.nextHearingDate)}</div>` : ''}
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
            <td>${window.formatDDMMYYYY(t.date)}</td>
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
            <div><span>Onboarded:</span> <strong>${window.formatDDMMYYYY(client.onboardingDate)}</strong></div>
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

      <!-- Client Access Portal Link Card -->
      <div class="card" style="background: linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%); border: 1px solid var(--color-primary); margin-bottom: 1.5rem; padding: 1rem 1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
          <div>
            <h4 style="margin:0 0 0.2rem 0; font-size:0.95rem; color:var(--text-primary);">Client Direct Access Portal Link</h4>
            <span style="font-size:0.78rem; color:var(--text-secondary);">Direct link for client to track case progress and hearing dates (no password required, fees hidden).</span>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-primary" onclick="clientsModule.copyClientPortalLink('${client.id}')" style="padding:0.35rem 0.75rem; font-size:0.8rem;"><i data-lucide="copy"></i> Copy Portal Link</button>
            <button class="btn btn-secondary" onclick="clientsModule.regeneratePortalLink('${client.id}')" style="padding:0.35rem 0.75rem; font-size:0.8rem;"><i data-lucide="refresh-cw"></i> Regenerate Link</button>
          </div>
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
