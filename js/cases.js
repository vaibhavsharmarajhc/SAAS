/**
 * VSH Legal - Case & Practice Manager Cases Module
 * Manages the case register, linking cases to clients, recording hearings, and timeline trackers.
 */

import db from './db.js';
import accountsModule from './accounts.js';
import historyManager from './history.js';

const casesModule = {
  init() {
    this.setupFilters();
    this.setupRegisterCaseForm();
    this.setupHearingForm();
    this.setupEditHearingForm();
    this.setupLockDateForm();
    this.setupCaseDossierEvents();
    this.populateReferralDatalist();
    this.populateCategoryDropdowns();
    this.setupCategoryAddListeners();

    // Listen for custom logged transaction events to refresh views in real-time
    document.addEventListener('transactionLogged', (e) => {
      this.renderCaseGrid();
      const overlay = document.getElementById('case-dossier-overlay');
      if (overlay.classList.contains('active') && this.currentCaseId === e.detail.caseId) {
        this.showCaseDossier(this.currentCaseId);
      }
    });

    document.addEventListener('casesUpdated', () => {
      this.renderCaseGrid();
      const overlay = document.getElementById('case-dossier-overlay');
      if (overlay && overlay.classList.contains('active') && this.currentCaseId) {
        this.showCaseDossier(this.currentCaseId);
      }
    });
  },

  render() {
    this.renderCaseGrid();
    this.populateClientDropdowns();
    this.populateReferralDatalist();
    this.populateCategoryDropdowns();
  },

  /**
   * Populate dropdown select lists with dynamic categories
   */
  populateCategoryDropdowns() {
    const categories = db.getCategories();
    const selects = ['add-case-type', 'edit-case-type', 'case-type'];

    selects.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const currentVal = select.value;
      select.innerHTML = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('') + '<option value="__ADD_NEW__" style="font-weight:600; color:var(--color-primary);">+ Add New Category...</option>';
      if (currentVal && categories.some(c => c.name === currentVal)) {
        select.value = currentVal;
      }
    });

    const filterSelect = document.getElementById('case-filter-category');
    if (filterSelect) {
      const currentFilter = filterSelect.value;
      filterSelect.innerHTML = '<option value="All">All Categories</option>' + categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      if (currentFilter) filterSelect.value = currentFilter;
    }
  },

  setupCategoryAddListeners() {
    const selects = ['add-case-type', 'edit-case-type', 'case-type'];
    selects.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      select.addEventListener('change', async (e) => {
        if (e.target.value === '__ADD_NEW__') {
          const catName = prompt("Enter new Case Category name (e.g. Arbitration, Taxation, IPR):");
          if (catName && catName.trim()) {
            const newCat = await db.addCategory(catName.trim());
            this.populateCategoryDropdowns();
            if (newCat) select.value = newCat.name;
          } else {
            select.selectedIndex = 0;
          }
        }
      });
    });

    document.addEventListener('categoriesUpdated', () => {
      this.populateCategoryDropdowns();
      this.renderCaseGrid();
    });
  },

  /**
   * Populate dropdown select lists with active onboarded clients
   */
  populateClientDropdowns() {
    const clients = db.getClients();
    const dropdown = document.getElementById('add-case-client-id');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="" disabled selected>-- Select Onboarded Client --</option>' +
      clients.map(c => `<option value="${c.id}">${c.name} (${c.type})</option>`).join('') +
      '<option value="__ONBOARD_NEW__" style="font-weight:600; color:var(--color-primary);">+ Onboard New Client...</option>';

    if (!dropdown.hasAttribute('data-onboard-listener')) {
      dropdown.setAttribute('data-onboard-listener', 'true');
      dropdown.addEventListener('change', (e) => {
        if (e.target.value === '__ONBOARD_NEW__') {
          const modal = document.getElementById('add-case-modal');
          if (modal) modal.classList.remove('active');
          dropdown.selectedIndex = 0;
          if (typeof window.switchView === 'function') {
            window.switchView('clients-page');
          }
        }
      });
    }
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
      this.populateCategoryDropdowns();
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

      historyManager.push({
        description: `Case "${title}" registered`,
        undo: async () => {
          await db.deleteCase(newCase.id);
          this.render();
        },
        redo: async () => {
          await db.addCase(newCase);
          this.render();
        }
      });

      // Log an initial hearing record in history if hearing date is defined
      if (nextHearingDate) {
        await db.addHearing(newCase.id, {
          date: nextHearingDate,
          stage: stage || "Filing",
          notes: `Case registered. Listed for ${stage || "Hearing"} on: ${nextHearingDate}`,
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
    const searchVal = (document.getElementById('case-search-input')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('case-filter-status')?.value || 'All';
    const filterCategory = document.getElementById('case-filter-category')?.value || 'All';
    const gridContainer = document.getElementById('cases-grid-list');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    // Setup single delegated event listener once
    if (!gridContainer.hasAttribute('data-delegated')) {
      gridContainer.setAttribute('data-delegated', 'true');
      gridContainer.addEventListener('click', (e) => {
        const titleLink = e.target.closest('.case-title-link');
        if (titleLink) {
          const id = titleLink.getAttribute('data-id');
          if (id) this.showCaseDossier(id);
          return;
        }

        const btnLedger = e.target.closest('.btn-case-ledger');
        if (btnLedger) {
          const id = btnLedger.getAttribute('data-id');
          if (id) this.showCaseDossier(id);
          return;
        }

        const btnHearing = e.target.closest('.btn-case-hearing');
        if (btnHearing) {
          const id = btnHearing.getAttribute('data-id');
          if (id) this.showAddHearingModal(id);
          return;
        }

        const hearingPill = e.target.closest('.next-hearing-pill');
        if (hearingPill) {
          const id = hearingPill.getAttribute('data-id');
          if (id) this.showAddHearingModal(id);
          return;
        }

        const btnEdit = e.target.closest('.btn-edit-case');
        if (btnEdit) {
          const id = btnEdit.getAttribute('data-id');
          if (id) this.showEditCaseModal(id);
          return;
        }

        const btnLock = e.target.closest('.btn-lock-date');
        if (btnLock) {
          const id = btnLock.getAttribute('data-id');
          if (id) this.showLockDateModal(id);
          return;
        }

        const btnToggle = e.target.closest('.btn-case-toggle');
        if (btnToggle) {
          const id = btnToggle.getAttribute('data-id');
          if (id) {
            const cs = db.getCase(id);
            if (cs) {
              const newStatus = cs.status === 'Active' ? 'Closed' : 'Active';
              db.updateCase(id, { status: newStatus }).then(() => {
                document.dispatchEvent(new CustomEvent('casesUpdated'));
                this.render();
              });
            }
          }
          return;
        }
      });
    }

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

    const fragment = document.createDocumentFragment();
    const todayStr = new Date().toISOString().split('T')[0];

    filteredCases.forEach(c => {
      const client = db.getClient(c.clientId);
      const balance = db.getCaseBalance(c.id);
      const card = document.createElement('div');
      card.className = 'card';
      
      const catObj = db.getCategoryByName(c.caseType);
      const catColor = catObj ? catObj.color : '#3b82f6';
      const badgeStyle = c.status === 'Active' ? 'badge-active' : 'badge-closed';
      const balanceStyle = balance.outstanding > 0 ? 'color: var(--color-danger); font-weight:700;' : 'color: var(--color-success); font-weight:700;';
      let badgeBg = 'rgba(217, 119, 6, 0.05)';
      let badgeBorder = 'rgba(217, 119, 6, 0.15)';
      let badgeLabel = 'Next Hearing:';
      let badgeText = 'Not Scheduled';
      let badgeTextColor = 'var(--color-warning)';
      let isRelativeMode = false;

      const notBefore = c.notBeforeDate || (c.listingType === 'relative' ? c.nextHearingDate : null);

      if (c.listingType === 'relative' || (notBefore && notBefore !== 'Not Scheduled')) {
        isRelativeMode = true;
        if (notBefore && todayStr >= notBefore) {
          badgeBg = 'rgba(234, 179, 8, 0.12)';
          badgeBorder = 'rgba(234, 179, 8, 0.35)';
          badgeLabel = '👁️ Cause List Watch:';
          badgeText = `Eligible for Listing (Not Before ${notBefore})`;
          badgeTextColor = '#b45309';
        } else if (notBefore) {
          badgeBg = 'rgba(59, 130, 246, 0.08)';
          badgeBorder = 'rgba(59, 130, 246, 0.25)';
          badgeLabel = 'Not Before:';
          badgeText = notBefore;
          badgeTextColor = 'var(--color-primary)';
        }
      } else {
        const nextDate = this.getNextHearingDate(c);
        if (nextDate) {
          badgeBg = 'rgba(16, 185, 129, 0.08)';
          badgeBorder = 'rgba(16, 185, 129, 0.25)';
          badgeLabel = 'Confirmed Listed:';
          badgeText = nextDate;
          badgeTextColor = 'var(--color-success)';
        }
      }

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
          <span style="font-size:0.7rem; text-transform:uppercase; color:${catColor}; font-weight:700; background:${catColor}18; padding:2px 8px; border-radius:4px; border:1px solid ${catColor}40;">${window.sanitizeText(c.caseType)}</span>
          <span class="badge ${badgeStyle}">${c.status}</span>
        </div>
        <h3 style="font-size:1.15rem; color:var(--text-primary); line-height:1.3; margin-bottom:0.5rem; cursor:pointer;" class="case-title-link" data-id="${c.id}">${window.sanitizeText(c.title)}</h3>
        
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem; display:flex; flex-direction:column; gap:0.25rem;">
          <div><i data-lucide="user" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Client: <strong>${client ? window.sanitizeText(client.name) : 'Unknown'}</strong></div>
          <div><i data-lucide="hash" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> CNR/Ref: ${window.sanitizeText(c.caseNumber)}</div>
          <div><i data-lucide="map-pin" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Court: ${window.sanitizeText(c.court)}</div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding: 0.75rem 0; margin-bottom:0.5rem; display:flex; justify-content:space-between; font-size:0.8rem;">
          <div>Stage: <strong style="color:var(--text-primary);">${window.sanitizeText(c.stage)}</strong></div>
          <div style="${balanceStyle}">O/S: ₹${balance.outstanding.toLocaleString('en-IN')}</div>
        </div>

        <div class="next-hearing-pill" style="background-color: ${badgeBg}; padding:0.5rem; border-radius: var(--radius-sm); border:1px solid ${badgeBorder}; margin-bottom:1rem; text-align:center; font-size:0.8rem; cursor:pointer;" title="Click to log or update next hearing date" data-id="${c.id}">
          <span style="color:var(--text-secondary);">${badgeLabel}</span> 
          <strong style="color:${badgeTextColor};">${badgeText}</strong>
          <i data-lucide="edit-2" style="width:12px; height:12px; margin-left:4px; vertical-align:middle; color:var(--text-secondary);"></i>
        </div>

        <div style="display:flex; gap:0.35rem;">
          <button class="btn btn-secondary btn-case-ledger" style="flex:1; padding:0.4rem 0.4rem; font-size:0.75rem;" data-id="${c.id}"><i data-lucide="book-open"></i> Ledger</button>
          <button class="btn btn-primary btn-case-hearing" style="flex:1; padding:0.4rem 0.4rem; font-size:0.75rem;" data-id="${c.id}"><i data-lucide="calendar"></i> Hearing</button>
          ${isRelativeMode ? `<button class="btn btn-warning btn-lock-date" style="padding:0.4rem 0.4rem; font-size:0.75rem; background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.4); color:#b45309;" data-id="${c.id}" title="Lock confirmed date from Cause List"><i data-lucide="check-circle-2" style="width:13px; height:13px;"></i> Lock</button>` : ''}
          <button class="btn btn-secondary btn-edit-case" style="padding:0.4rem 0.4rem; font-size:0.75rem;" data-id="${c.id}" title="Edit Case File & Hearing Date"><i data-lucide="edit-3" style="width:13px; height:13px;"></i></button>
          <button class="btn btn-secondary btn-case-toggle" style="padding:0.4rem 0.4rem;" data-id="${c.id}" title="Toggle Case Status (Active/Closed)">
            <i data-lucide="${c.status === 'Active' ? 'check-circle-2' : 'rotate-ccw'}" style="width:13px; height:13px;"></i>
          </button>
        </div>
      `;
      fragment.appendChild(card);
    });

    gridContainer.appendChild(fragment);
    if (window.safeCreateIcons) {
      window.safeCreateIcons(gridContainer);
    }
  },

  getNextHearingDate(c) {
    if (c.nextHearingDate && c.nextHearingDate !== 'Not Scheduled' && String(c.nextHearingDate).trim() !== '') {
      return c.nextHearingDate;
    }
    if (c.hearings && c.hearings.length > 0) {
      const sorted = [...c.hearings].sort((a, b) => new Date(b.date) - new Date(a.date));
      for (let h of sorted) {
        if (h.nextHearingDate && String(h.nextHearingDate).trim() !== '') {
          return h.nextHearingDate;
        }
      }
      if (sorted[0] && sorted[0].date) {
        return sorted[0].date;
      }
    }
    return null;
  },

  /**
   * Hearing log registering
   */
  setupHearingForm() {
    const form = document.getElementById('add-hearing-form');
    const modal = document.getElementById('add-hearing-modal');
    if (!form || !modal) return;

    // Dynamic DOM Injection Fallback (Guarantees option renders even if app.html is served from browser/PWA cache)
    const outcomeToggleWrap = modal.querySelector('.form-group div[style*="display:flex"]');
    if (outcomeToggleWrap && !document.getElementById('btn-outcome-transferred')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm flex-1 hearing-outcome-toggle';
      btn.id = 'btn-outcome-transferred';
      btn.style.cssText = 'font-size:0.8rem; padding:0.4rem; border-color:rgba(217,119,6,0.4); color:var(--color-warning);';
      btn.innerHTML = '<i data-lucide="arrow-right-left"></i> Transferred to Another Court';
      
      const btnDisposed = document.getElementById('btn-outcome-disposed');
      if (btnDisposed) {
        outcomeToggleWrap.insertBefore(btn, btnDisposed);
      } else {
        outcomeToggleWrap.appendChild(btn);
      }
      if (window.safeCreateIcons) window.safeCreateIcons(btn);
    }

    if (!document.getElementById('hearing-transfer-wrap')) {
      const wrap = document.createElement('div');
      wrap.id = 'hearing-transfer-wrap';
      wrap.style.cssText = 'display:none; background:rgba(217,119,6,0.08); padding:0.85rem; border-radius:var(--radius-sm); border:1px solid rgba(217,119,6,0.3); margin-bottom:1rem;';
      wrap.innerHTML = `
        <div class="form-group" style="margin-bottom:0.4rem;">
          <label class="form-label" style="color:var(--color-warning); font-weight:600;"><i data-lucide="map-pin" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> New Transferred Court / Forum Name *</label>
          <input type="text" class="form-control" id="add-hearing-new-court" placeholder="e.g. Court of ADJ-04, Saket District Courts / Commercial Bench 2">
        </div>
        <div style="font-size:0.75rem; color:var(--text-secondary);">
          <i data-lucide="info" style="width:13px; height:13px; display:inline-block; vertical-align:middle; margin-right:3px;"></i> The case file's court forum will automatically update to this new court upon saving.
        </div>
      `;
      const disposalWrap = document.getElementById('hearing-disposal-wrap');
      if (disposalWrap && disposalWrap.parentNode) {
        disposalWrap.parentNode.insertBefore(wrap, disposalWrap);
      } else {
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) modalBody.appendChild(wrap);
      }
      if (window.safeCreateIcons) window.safeCreateIcons(wrap);
    }

    const cancelBtn = document.getElementById('add-hearing-cancel');
    const btnFixed = document.getElementById('btn-mode-fixed');
    const btnRelative = document.getElementById('btn-mode-relative');
    const btnContinued = document.getElementById('btn-outcome-continued');
    const btnTransferred = document.getElementById('btn-outcome-transferred');
    const btnDisposed = document.getElementById('btn-outcome-disposed');
    
    const fixedWrap = document.getElementById('hearing-fixed-date-wrap');
    const relativeWrap = document.getElementById('hearing-relative-date-wrap');
    const listingContainer = document.getElementById('next-listing-container');
    const transferWrap = document.getElementById('hearing-transfer-wrap');
    const disposalWrap = document.getElementById('hearing-disposal-wrap');
    
    const modeInput = document.getElementById('add-hearing-listing-mode');
    const outcomeInput = document.getElementById('add-hearing-outcome-status');
    const modeLbl = document.getElementById('add-hearing-mode-lbl');
    const previewTxt = document.getElementById('relative-preview-text');

    let calculatedRelativeDate = null;

    if (btnContinued && btnDisposed) {
      btnContinued.addEventListener('click', () => {
        btnContinued.classList.add('active');
        if (btnTransferred) btnTransferred.classList.remove('active');
        btnDisposed.classList.remove('active');
        if (outcomeInput) outcomeInput.value = 'continued';
        if (listingContainer) listingContainer.style.display = 'block';
        if (transferWrap) transferWrap.style.display = 'none';
        if (disposalWrap) disposalWrap.style.display = 'none';
      });

      if (btnTransferred) {
        btnTransferred.addEventListener('click', () => {
          btnTransferred.classList.add('active');
          btnContinued.classList.remove('active');
          btnDisposed.classList.remove('active');
          if (outcomeInput) outcomeInput.value = 'transferred';
          if (listingContainer) listingContainer.style.display = 'block';
          if (transferWrap) transferWrap.style.display = 'block';
          if (disposalWrap) disposalWrap.style.display = 'none';
        });
      }

      btnDisposed.addEventListener('click', () => {
        btnDisposed.classList.add('active');
        btnContinued.classList.remove('active');
        if (btnTransferred) btnTransferred.classList.remove('active');
        if (outcomeInput) outcomeInput.value = 'disposed';
        if (listingContainer) listingContainer.style.display = 'none';
        if (transferWrap) transferWrap.style.display = 'none';
        if (disposalWrap) disposalWrap.style.display = 'block';
      });
    }

    if (btnFixed && btnRelative) {
      btnFixed.addEventListener('click', () => {
        btnFixed.classList.add('active');
        btnRelative.classList.remove('active');
        if (fixedWrap) fixedWrap.style.display = 'block';
        if (relativeWrap) relativeWrap.style.display = 'none';
        if (modeInput) modeInput.value = 'fixed';
        if (modeLbl) modeLbl.textContent = 'Fixed Calendar Date';
      });

      btnRelative.addEventListener('click', () => {
        btnRelative.classList.add('active');
        btnFixed.classList.remove('active');
        if (fixedWrap) fixedWrap.style.display = 'none';
        if (relativeWrap) relativeWrap.style.display = 'block';
        if (modeInput) modeInput.value = 'relative';
        if (modeLbl) modeLbl.textContent = 'High Court Relative (Not Before)';
      });
    }

    // Relative Presets Click Handlers
    modal.querySelectorAll('.rel-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.rel-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const baseDateStr = document.getElementById('add-hearing-date').value || new Date().toISOString().split('T')[0];
        const dt = new Date(baseDateStr);

        const weeks = btn.getAttribute('data-weeks');
        const months = btn.getAttribute('data-months');

        if (weeks) {
          dt.setDate(dt.getDate() + (parseInt(weeks) * 7));
        } else if (months) {
          dt.setMonth(dt.getMonth() + parseInt(months));
        }

        calculatedRelativeDate = dt.toISOString().split('T')[0];
        if (previewTxt) {
          const formatted = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          previewTxt.textContent = `Not Before: ${calculatedRelativeDate} (${formatted})`;
        }
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const caseId = document.getElementById('add-hearing-case-id').value;
      const rawHearingDate = document.getElementById('add-hearing-date').value;
      const date = rawHearingDate && rawHearingDate.trim() !== '' ? rawHearingDate : null;
      const stageInput = document.getElementById('add-hearing-stage').value.trim();
      const isDisposed = outcomeInput ? outcomeInput.value === 'disposed' : false;
      const isTransferred = outcomeInput ? outcomeInput.value === 'transferred' : false;
      
      let nextHearingDate = null;
      let notBeforeDate = null;
      let listingMode = modeInput ? modeInput.value : 'fixed';
      let finalStage = stageInput;
      let finalNotes = document.getElementById('add-hearing-notes').value.trim();
      let newCourt = null;

      if (isTransferred) {
        const courtInput = document.getElementById('add-hearing-new-court');
        newCourt = courtInput ? courtInput.value.trim() : '';
        if (!newCourt) {
          alert("Please enter the New Transferred Court / Forum name.");
          return;
        }
        finalStage = stageInput ? `Transferred to ${newCourt} (${stageInput})` : `Transferred to ${newCourt}`;
        finalNotes = finalNotes ? `${finalNotes}\n[Transferred to Court: ${newCourt}]` : `[Transferred to Court: ${newCourt}]`;
      }

      if (isDisposed) {
        const disposalType = document.getElementById('add-hearing-disposal-type').value;
        const disposalRemarks = document.getElementById('add-hearing-disposal-remarks').value.trim();
        finalStage = `${stageInput} (Disposed: ${disposalType})`;
        if (disposalRemarks) {
          finalNotes = finalNotes ? `${finalNotes}\n[Disposal Remarks: ${disposalRemarks}]` : `[Disposal Remarks: ${disposalRemarks}]`;
        }
        listingMode = 'disposed';
      } else {
        if (listingMode === 'relative') {
          notBeforeDate = calculatedRelativeDate || document.getElementById('add-hearing-next-date').value || null;
          nextHearingDate = notBeforeDate;
        } else {
          nextHearingDate = document.getElementById('add-hearing-next-date').value || null;
        }
      }

      // Register Hearing (if date is provided or notes/outcome entered)
      if (date || finalNotes || isDisposed || isTransferred) {
        await db.addHearing(caseId, { 
          date: date || new Date().toISOString().split('T')[0], 
          stage: finalStage, 
          nextHearingDate, 
          listingType: listingMode, 
          notBeforeDate, 
          notes: finalNotes 
        });
      } else if (nextHearingDate) {
        await db.updateCase(caseId, {
          stage: finalStage,
          nextHearingDate,
          listingType: listingMode,
          notBeforeDate
        });
      }

      if (isTransferred) {
        await db.updateCase(caseId, {
          court: newCourt,
          stage: finalStage,
          nextHearingDate,
          listingType: listingMode,
          notBeforeDate
        });
        alert(`Case proceedings recorded. File updated & transferred to: ${newCourt}.`);
      } else if (isDisposed) {
        const disposalType = document.getElementById('add-hearing-disposal-type').value;
        const disposalRemarks = document.getElementById('add-hearing-disposal-remarks').value.trim();
        await db.updateCase(caseId, {
          status: 'Closed',
          stage: `Disposed (${disposalType})`,
          nextHearingDate: null,
          listingType: 'disposed',
          notBeforeDate: null,
          disposalType,
          disposalRemarks,
          disposalDate: date
        });
        alert(`Case marked as Finally Disposed (${disposalType}). File closed.`);
      } else {
        alert("Hearing proceedings & listing recorded successfully.");
      }

      form.reset();
      modal.classList.remove('active');
      calculatedRelativeDate = null;

      // Refresh views
      const dossierOverlay = document.getElementById('case-dossier-overlay');
      if (dossierOverlay && dossierOverlay.classList.contains('active')) {
        this.showCaseDossier(caseId);
      }

      document.dispatchEvent(new CustomEvent('casesUpdated'));
      this.render();
    });

    cancelBtn.addEventListener('click', () => {
      form.reset();
      modal.classList.remove('active');
      calculatedRelativeDate = null;
    });
  },

  showAddHearingModal(caseId) {
    const cs = db.getCase(caseId);
    if (!cs) return;

    document.getElementById('add-hearing-case-id').value = caseId;
    
    // Use the case's scheduled listing date if available (e.g. 2026-07-25), else fallback to today
    const listedDate = (cs.nextHearingDate && cs.nextHearingDate !== 'Not Scheduled') 
      ? cs.nextHearingDate 
      : new Date().toISOString().split('T')[0];

    document.getElementById('add-hearing-date').value = listedDate;
    document.getElementById('add-hearing-stage').value = cs.stage || '';
    document.getElementById('add-hearing-next-date').value = '';
    document.getElementById('add-hearing-notes').value = '';
    document.getElementById('add-hearing-disposal-remarks').value = '';
    
    const btnContinued = document.getElementById('btn-outcome-continued');
    if (btnContinued) btnContinued.click();

    const btnFixed = document.getElementById('btn-mode-fixed');
    if (btnFixed) btnFixed.click();

    const modal = document.getElementById('add-hearing-modal');
    modal.classList.add('active');
  },

  setupLockDateForm() {
    const form = document.getElementById('lock-date-form');
    const modal = document.getElementById('lock-hearing-date-modal');
    const closeBtn = document.getElementById('lock-date-close');
    const cancelBtn = document.getElementById('lock-date-cancel');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const caseId = document.getElementById('lock-date-case-id').value;
      const confirmedDate = document.getElementById('lock-date-input').value;
      if (!caseId || !confirmedDate) return;

      await db.updateCase(caseId, {
        nextHearingDate: confirmedDate,
        listingType: 'fixed',
        notBeforeDate: null
      });

      alert("Confirmed listing date locked.");
      modal.classList.remove('active');
      this.render();
    });

    const hide = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.addEventListener('click', hide);
    if (cancelBtn) cancelBtn.addEventListener('click', hide);
  },

  showLockDateModal(caseId) {
    const cs = db.getCase(caseId);
    if (!cs) return;

    document.getElementById('lock-date-case-id').value = caseId;
    const titleEl = document.getElementById('lock-date-case-title');
    if (titleEl) titleEl.textContent = cs.title;

    document.getElementById('lock-date-input').value = cs.nextHearingDate || new Date().toISOString().split('T')[0];

    const modal = document.getElementById('lock-hearing-date-modal');
    if (modal) modal.classList.add('active');
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
      hide();
      this.showEditCaseModal(this.currentCaseId);
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
        const nextHearingDate = document.getElementById('edit-case-next-date').value || null;
        const status = document.getElementById('edit-case-status').value;
        const referredBy = document.getElementById('edit-case-referred-by').value.trim() || 'Self';
        const description = document.getElementById('edit-case-desc').value.trim();

        await db.updateCase(id, { title, caseNumber, caseType, court, stage, nextHearingDate, status, description, referredBy });

        hideEditModal();
        this.renderCaseGrid();
        this.populateReferralDatalist();
        this.showCaseDossier(id);
      });
    },

    showEditCaseModal(id) {
      const cs = db.getCase(id);
      if (!cs) return;

      this.currentCaseId = id;
      document.getElementById('edit-case-id').value = cs.id;
      document.getElementById('edit-case-title').value = cs.title || '';
      document.getElementById('edit-case-number').value = cs.caseNumber || '';
      document.getElementById('edit-case-type').value = cs.caseType || 'Civil';
      document.getElementById('edit-case-court').value = cs.court || '';
      document.getElementById('edit-case-stage').value = cs.stage || '';
      document.getElementById('edit-case-next-date').value = cs.nextHearingDate || '';
      document.getElementById('edit-case-status').value = cs.status || 'Active';
      document.getElementById('edit-case-referred-by').value = cs.referredBy || 'Self';
      document.getElementById('edit-case-desc').value = cs.description || '';

      const editModal = document.getElementById('edit-case-modal');
      if (editModal) {
        editModal.classList.add('active');
        lucide.createIcons();
      }
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
