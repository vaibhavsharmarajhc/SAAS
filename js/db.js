/**
 * VSH Legal - Case & Practice Manager Database Layer (Multi-tenant API adapter)
 * Interacts with js/api.js and caches database records in memory to allow
 * synchronous rendering across frontend feature modules.
 */

import api from './api.js';

class LegalDB {
  constructor() {
    this.cache = {
      user: null,
      settings: {
        firmName: "CounselAI",
        lawyerName: "Adv. Vaibhav Sharma",
        currency: "INR",
        theme: "light"
      },
      clients: [],
      cases: [],
      transactions: []
    };
  }

  /**
   * Load all multi-tenant data from server into cache
   */
  async loadAll() {
    const me = await api.auth.me();
    if (!me || !me.user) {
      this.cache.user = null;
      return false; // Not authenticated
    }

    this.cache.user = me.user;
    this.cache.settings = me.user.settings || {};
    
    // Fetch resource collections from backend
    this.cache.clients = await api.clients.getAll() || [];
    this.cache.cases = await api.cases.getAll() || [];
    this.cache.transactions = await api.transactions.getAll() || [];
    return true; // Authenticated and loaded
  }

  getUser() {
    return this.cache.user;
  }

  // --- SETTINGS ---
  getSettings() {
    return this.cache.settings;
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
    const updatedCase = await api.cases.addHearing(caseId, hearing);
    const idx = this.cache.cases.findIndex(c => c.id === caseId);
    if (idx !== -1 && updatedCase) {
      this.cache.cases[idx] = updatedCase;
      document.dispatchEvent(new CustomEvent('casesUpdated'));
    }
    return updatedCase;
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
        firmName: "CounselAI",
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
