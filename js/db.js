/**
 * VSH Legal - Case & Practice Manager Database Layer (Multi-tenant API adapter)
 * Interacts with js/api.js and caches database records in memory to allow
 * synchronous rendering across frontend feature modules.
 */

import api from './api.js';

class LegalDB {
  constructor() {
    this.clearCache();
  }

  clearCache() {
    this.cache = {
      user: null,
      settings: {
        firmName: "Track My Chambers",
        lawyerName: "Adv. Vaibhav Sharma",
        currency: "INR",
        theme: "light"
      },
      clients: [],
      cases: [],
      transactions: []
    };
  }

  async loadAll(forceReload = false) {
    if (this.cache.user && this.cache.clients.length > 0 && !forceReload) {
      return true; // Instant 0ms memory cache return!
    }

    try {
      const preloadStr = sessionStorage.getItem('bootstrap_preload');
      if (preloadStr) {
        sessionStorage.removeItem('bootstrap_preload');
        const preloadData = JSON.parse(preloadStr);
        if (preloadData && preloadData.user) {
          this.cache.user = preloadData.user;
          this.cache.settings = preloadData.user.settings || {};
          this.cache.clients = preloadData.clients || [];
          this.cache.cases = preloadData.cases || [];
          this.cache.transactions = preloadData.transactions || [];
          return true;
        }
      }
    } catch (e) {
      console.warn("Preload check failed:", e);
    }

    try {
      let data = await api.auth.bootstrap();
      if (!data || !data.user) {
        // Fallback to parallel requests
        const [me, clients, cases, transactions] = await Promise.all([
          api.auth.me(),
          api.clients.getAll(),
          api.cases.getAll(),
          api.transactions.getAll()
        ]);
        if (!me || !me.user) {
          this.clearCache();
          return false;
        }
        data = {
          user: me.user,
          clients: clients || [],
          cases: cases || [],
          transactions: transactions || []
        };
      }

      this.cache.user = data.user;
      this.cache.settings = data.user.settings || {};
      this.cache.clients = data.clients || [];
      this.cache.cases = data.cases || [];
      this.cache.transactions = data.transactions || [];
      return true;
    } catch (e) {
      this.clearCache();
      return false;
    }
  }

  getUser() {
    return this.cache.user;
  }

  // --- SETTINGS & CATEGORIES ---
  getSettings() {
    return this.cache.settings;
  }

  getCategories() {
    const DEFAULT_CATEGORIES = [
      { id: 'cat_civil', name: 'Civil', color: '#3b82f6' },
      { id: 'cat_criminal', name: 'Criminal', color: '#ef4444' },
      { id: 'cat_matrimonial', name: 'Matrimonial', color: '#8b5cf6' },
      { id: 'cat_consumer', name: 'Consumer', color: '#f59e0b' },
      { id: 'cat_service', name: 'Service', color: '#14b8a6' },
      { id: 'cat_notice', name: 'Legal Notice', color: '#f43f5e' },
      { id: 'cat_contracts', name: 'Contracts', color: '#10b981' },
      { id: 'cat_consultation', name: 'Consultation', color: '#06b6d4' },
      { id: 'cat_uncategorized', name: 'Uncategorized', color: '#6b7280' }
    ];

    if (!this.cache.settings.caseCategories || !Array.isArray(this.cache.settings.caseCategories) || this.cache.settings.caseCategories.length === 0) {
      this.cache.settings.caseCategories = [...DEFAULT_CATEGORIES];
    }
    return this.cache.settings.caseCategories;
  }

  getCategoryByName(name) {
    const categories = this.getCategories();
    return categories.find(c => c.name.toLowerCase() === (name || '').toLowerCase()) || { id: 'cat_uncategorized', name: name || 'Uncategorized', color: '#6b7280' };
  }

  async addCategory(name) {
    const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#14b8a6', '#6366f1'];
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const categories = this.getCategories();
    const existing = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const colorIdx = categories.length % PALETTE.length;
    const newCat = {
      id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: trimmed,
      color: PALETTE[colorIdx]
    };
    categories.push(newCat);
    this.cache.settings.caseCategories = categories;
    await this.updateSettings({ caseCategories: categories });
    document.dispatchEvent(new CustomEvent('categoriesUpdated', { detail: { category: newCat } }));
    return newCat;
  }

  async updateCategory(id, newName) {
    const categories = this.getCategories();
    const cat = categories.find(c => c.id === id);
    if (!cat) return null;
    const oldName = cat.name;
    cat.name = newName.trim();
    
    // Update linked cases
    this.cache.cases.forEach(c => {
      if (c.caseType === oldName) {
        c.caseType = cat.name;
      }
    });

    await this.updateSettings({ caseCategories: categories });
    document.dispatchEvent(new CustomEvent('categoriesUpdated'));
    return cat;
  }

  async deleteCategory(id, replacementCategoryName = 'Uncategorized') {
    let categories = this.getCategories();
    const target = categories.find(c => c.id === id);
    if (!target) return false;

    const oldName = target.name;
    categories = categories.filter(c => c.id !== id);
    this.cache.settings.caseCategories = categories;

    // Migrate linked cases
    this.cache.cases.forEach(c => {
      if (c.caseType === oldName) {
        c.caseType = replacementCategoryName;
      }
    });

    await this.updateSettings({ caseCategories: categories });
    document.dispatchEvent(new CustomEvent('categoriesUpdated'));
    return true;
  }

  async updateSettings(settingsData) {
    const updated = await api.settings.update(settingsData);
    this.cache.settings = { ...this.cache.settings, ...updated };
    return this.cache.settings;
  }

  // --- CLIENTS ---
  getClients() {
    return this.cache.clients;
  }

  getClient(id) {
    return this.cache.clients.find(c => c.id === id) || null;
  }

  async addClient(client) {
    const newClient = await api.clients.create(client);
    this.cache.clients.push(newClient);
    return newClient;
  }

  async updateClient(id, clientData) {
    const updated = await api.clients.update(id, clientData);
    const idx = this.cache.clients.findIndex(c => c.id === id);
    if (idx !== -1 && updated) {
      this.cache.clients[idx] = updated;
    }
    return updated;
  }

  async deleteClient(id) {
    await api.clients.delete(id);
    this.cache.clients = this.cache.clients.filter(c => c.id !== id);
    this.cache.cases = this.cache.cases.filter(c => c.clientId !== id);
    this.cache.transactions = this.cache.transactions.filter(t => t.clientId !== id);
  }

  // --- CASES ---
  getCases() {
    return this.cache.cases;
  }

  getCase(id) {
    return this.cache.cases.find(c => c.id === id) || null;
  }

  getCasesForClient(clientId) {
    return this.cache.cases.filter(c => c.clientId === clientId);
  }

  async addCase(caseObj) {
    const newCase = await api.cases.create(caseObj);
    this.cache.cases.push(newCase);
    document.dispatchEvent(new CustomEvent('casesUpdated'));
    return newCase;
  }

  async updateCase(id, caseData) {
    const updated = await api.cases.update(id, caseData);
    const idx = this.cache.cases.findIndex(c => c.id === id);
    if (idx !== -1 && updated) {
      this.cache.cases[idx] = updated;
      document.dispatchEvent(new CustomEvent('casesUpdated'));
    }
    return updated;
  }

  async deleteCase(id) {
    await api.cases.delete(id);
    this.cache.cases = this.cache.cases.filter(c => c.id !== id);
    this.cache.transactions = this.cache.transactions.filter(t => t.caseId !== id);
    document.dispatchEvent(new CustomEvent('casesUpdated'));
  }

  async addHearing(caseId, hearing) {
    let updatedCase;
    try {
      updatedCase = await api.cases.addHearing(caseId, hearing);
    } catch (e) {
      console.warn("api.cases.addHearing error, updating local cache:", e);
    }

    const idx = this.cache.cases.findIndex(c => c.id === caseId);
    if (idx !== -1) {
      if (updatedCase) {
        this.cache.cases[idx] = { ...this.cache.cases[idx], ...updatedCase };
      } else {
        if (!this.cache.cases[idx].hearings) this.cache.cases[idx].hearings = [];
        this.cache.cases[idx].hearings.push({
          id: "h_" + Date.now(),
          date: hearing.date || new Date().toISOString().split('T')[0],
          stage: hearing.stage || "Hearing",
          nextStage: hearing.nextStage || null,
          notes: hearing.notes || ""
        });
        if (hearing.nextHearingDate) {
          this.cache.cases[idx].nextHearingDate = hearing.nextHearingDate;
        }
        if (hearing.nextStage || hearing.stage) {
          this.cache.cases[idx].stage = hearing.nextStage || hearing.stage;
        }
      }
      document.dispatchEvent(new CustomEvent('casesUpdated'));
    }
    return this.cache.cases[idx] || updatedCase;
  }

  async updateHearing(caseId, hearingId, hearingData) {
    const updatedCase = await api.cases.updateHearing(caseId, hearingId, hearingData);
    const idx = this.cache.cases.findIndex(c => c.id === caseId);
    if (idx !== -1 && updatedCase) {
      this.cache.cases[idx] = updatedCase;
      document.dispatchEvent(new CustomEvent('casesUpdated'));
    }
    return updatedCase;
  }

  // --- TRANSACTIONS & FINANCES ---
  getTransactions() {
    return this.cache.transactions;
  }

  getTransactionsForClient(clientId) {
    return this.cache.transactions.filter(t => t.clientId === clientId);
  }

  getTransactionsForCase(caseId) {
    return this.cache.transactions.filter(t => t.caseId === caseId);
  }

  async addTransaction(tx) {
    const newTx = await api.transactions.create(tx);
    this.cache.transactions.push(newTx);
    return newTx;
  }

  async updateTransaction(id, txData) {
    let updated;
    try {
      updated = await api.transactions.update(id, txData);
    } catch (e) {
      updated = { id, ...txData };
    }
    const idx = this.cache.transactions.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.cache.transactions[idx] = { ...this.cache.transactions[idx], ...updated };
    }
    return updated;
  }

  async deleteTransaction(id) {
    await api.transactions.delete(id);
    this.cache.transactions = this.cache.transactions.filter(t => t.id !== id);
  }

  // Calculate client or case finances synchronously from local cache
  getClientBalance(clientId) {
    const txs = this.getTransactionsForClient(clientId);
    let billed = 0;
    let received = 0;
    let disbursed = 0;
    let writtenOff = 0;
    
    txs.forEach(t => {
      if (t.type === "Billed") billed += t.amount;
      else if (t.type === "Received") received += t.amount;
      else if (t.type === "Disbursed") disbursed += t.amount;
      else if (t.type === "WrittenOff") writtenOff += t.amount;
    });

    return {
      billed,
      received,
      disbursed,
      writtenOff,
      outstanding: Math.max(0, (billed + disbursed) - received - writtenOff)
    };
  }

  getCaseBalance(caseId) {
    const txs = this.getTransactionsForCase(caseId);
    let billed = 0;
    let received = 0;
    let disbursed = 0;
    let writtenOff = 0;
    
    txs.forEach(t => {
      if (t.type === "Billed") billed += t.amount;
      else if (t.type === "Received") received += t.amount;
      else if (t.type === "Disbursed") disbursed += t.amount;
      else if (t.type === "WrittenOff") writtenOff += t.amount;
    });

    return {
      billed,
      received,
      disbursed,
      writtenOff,
      outstanding: Math.max(0, (billed + disbursed) - received - writtenOff)
    };
  }

  getReferralPartners() {
    const cases = this.getCases();
    const referrers = new Set();
    cases.forEach(c => {
      if (c.referredBy && c.referredBy.trim()) {
        referrers.add(c.referredBy.trim());
      }
    });
    referrers.add('Self');
    return Array.from(referrers).sort((a, b) => a.localeCompare(b));
  }

  // --- BACKUP & RESTORE ---
  exportBackup() {
    const dbData = {
      version: "1.0.0",
      settings: this.cache.settings,
      clients: this.cache.clients,
      cases: this.cache.cases,
      transactions: this.cache.transactions
    };
    const jsonStr = JSON.stringify(dbData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vsh_legal_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importBackup(jsonData) {
    try {
      let parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      // Send to server
      const result = await api.backup.import(parsed);
      if (result.success) {
        await this.loadAll(); // Reload cache
        return { success: true };
      }
      return { success: false, error: "Import failed on server." };
    } catch (e) {
      console.error("Backup import failed: ", e);
      return { success: false, error: e.message };
    }
  }

  async resetDB() {
    // Reset defaults by pushing empty backup or re-seeding
    const emptyBackup = {
      version: "1.0.0",
      settings: {
        firmName: "Track My Chambers",
        lawyerName: "Adv. Vaibhav Sharma",
        currency: "INR",
        theme: "light"
      },
      clients: [],
      cases: [],
      transactions: []
    };
    await this.importBackup(emptyBackup);
  }
}

// Global database instance
window.dbInstance = new LegalDB();
export default window.dbInstance;
