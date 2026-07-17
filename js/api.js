/**
 * VSH Legal Practice Manager - Frontend API client
 * Interacts with the backend REST APIs.
 */

async function fetchAPI(url, options = {}) {
  // Set JSON headers by default
  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Convert body to string if object
  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    let errorMsg = 'An error occurred on the server.';
    try {
      const errData = await response.json();
      errorMsg = errData.error || errorMsg;
    } catch (e) {
      // Not JSON
    }
    throw new Error(errorMsg);
  }

  // Return json or true if no content
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  return true;
}

const api = {
  auth: {
    async login(email, password) {
      return await fetchAPI('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
    },

    async signup(email, password, firmName, lawyerName) {
      return await fetchAPI('/api/auth/signup', {
        method: 'POST',
        body: { email, password, firmName, lawyerName }
      });
    },

    async logout() {
      return await fetchAPI('/api/auth/logout', {
        method: 'POST'
      });
    },

    async me() {
      try {
        return await fetchAPI('/api/auth/me', { method: 'GET' });
      } catch (err) {
        // If unauthenticated, return null rather than throwing
        return null;
      }
    }
  },

  settings: {
    async update(settingsData) {
      return await fetchAPI('/api/settings', {
        method: 'PUT',
        body: settingsData
      });
    }
  },

  clients: {
    async getAll() {
      return await fetchAPI('/api/clients');
    },

    async get(id) {
      return await fetchAPI(`/api/clients/${id}`);
    },

    async create(clientData) {
      return await fetchAPI('/api/clients', {
        method: 'POST',
        body: clientData
      });
    },

    async update(id, clientData) {
      return await fetchAPI(`/api/clients/${id}`, {
        method: 'PUT',
        body: clientData
      });
    },

    async delete(id) {
      return await fetchAPI(`/api/clients/${id}`, {
        method: 'DELETE'
      });
    }
  },

  cases: {
    async getAll() {
      return await fetchAPI('/api/cases');
    },

    async get(id) {
      return await fetchAPI(`/api/cases/${id}`);
    },

    async create(caseData) {
      return await fetchAPI('/api/cases', {
        method: 'POST',
        body: caseData
      });
    },

    async update(id, caseData) {
      return await fetchAPI(`/api/cases/${id}`, {
        method: 'PUT',
        body: caseData
      });
    },

    async delete(id) {
      return await fetchAPI(`/api/cases/${id}`, {
        method: 'DELETE'
      });
    },

    async addHearing(caseId, hearingData) {
      return await fetchAPI(`/api/cases/${caseId}/hearings`, {
        method: 'POST',
        body: hearingData
      });
    },

    async updateHearing(caseId, hearingId, hearingData) {
      return await fetchAPI(`/api/cases/${caseId}/hearings/${hearingId}`, {
        method: 'PUT',
        body: hearingData
      });
    }
  },

  transactions: {
    async getAll() {
      return await fetchAPI('/api/transactions');
    },

    async create(txData) {
      return await fetchAPI('/api/transactions', {
        method: 'POST',
        body: txData
      });
    },

    async delete(id) {
      return await fetchAPI(`/api/transactions/${id}`, {
        method: 'DELETE'
      });
    }
  },

  backup: {
    async import(jsonData) {
      return await fetchAPI('/api/backup/import', {
        method: 'POST',
        body: jsonData
      });
    }
  },

  tasks: {
    async getAll() {
      return await fetchAPI('/api/tasks');
    },
    async create(taskData) {
      return await fetchAPI('/api/tasks', {
        method: 'POST',
        body: taskData
      });
    },
    async update(id, taskData) {
      return await fetchAPI(`/api/tasks/${id}`, {
        method: 'PUT',
        body: taskData
      });
    },
    async delete(id) {
      return await fetchAPI(`/api/tasks/${id}`, {
        method: 'DELETE'
      });
    },
    async addComment(taskId, commentData) {
      return await fetchAPI(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: commentData
      });
    },
    async getColleagues() {
      return await fetchAPI('/api/colleagues');
    },
    async addColleague(email, role = 'work') {
      return await fetchAPI('/api/colleagues', {
        method: 'POST',
        body: { email, role }
      });
    }
  }
};

export default api;
