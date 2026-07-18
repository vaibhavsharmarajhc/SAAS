import api from './api.js';
import db from './db.js';

const notificationsModule = {
  notifications: [],

  init() {
    window.notificationsModule = this;

    const bellBtn = document.getElementById('btn-notification-bell');
    const dropdownMenu = document.getElementById('notification-dropdown-menu');
    const markAllReadBtn = document.getElementById('btn-notification-mark-all-read');
    const clearAllBtn = document.getElementById('btn-notification-clear-all');

    if (!bellBtn || !dropdownMenu) return;

    // Toggle dropdown visibility
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdownMenu.style.display === 'none' || dropdownMenu.style.display === '';
      dropdownMenu.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        this.renderDropdownList();
      }
    });

    // Dismiss dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
        dropdownMenu.style.display = 'none';
      }
    });

    // Mark all read callback
    if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await api.notifications.markAllRead();
          await this.loadAll();
          this.renderDropdownList();
        } catch (err) {
          console.error("Mark all read failed:", err);
        }
      });
    }

    // Clear all callback
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await api.notifications.clear();
          await this.loadAll();
          this.renderDropdownList();
        } catch (err) {
          console.error("Clear notifications failed:", err);
        }
      });
    }

    // Initial load
    this.loadAll();
  },

  async loadAll() {
    try {
      const user = db.getUser();
      if (!user) return;

      this.notifications = await api.notifications.getAll() || [];
      this.updateBadge();
    } catch (err) {
      console.error("Error loading notifications:", err);
    }
  },

  updateBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    const unreadCount = this.notifications.filter(n => !n.read).length;
    if (unreadCount > 0) {
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  },

  renderDropdownList() {
    const listContainer = document.getElementById('notification-list-items');
    if (!listContainer) return;

    if (this.notifications.length === 0) {
      listContainer.innerHTML = `
        <div style="padding:1.5rem 1rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">
          No notifications yet.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    this.notifications.forEach(n => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        gap: 2px;
        cursor: pointer;
        transition: background 0.15s;
        background: ${n.read ? 'transparent' : 'rgba(217, 119, 6, 0.04)'};
        position: relative;
      `;

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <span style="font-size:0.8rem; font-weight:600; color:var(--text-primary); line-height:1.3;">
            ${n.actorName} <span style="font-weight:400; color:var(--text-secondary);">${n.actionText}</span>
          </span>
          ${!n.read ? `<span style="background:var(--color-primary); width:6px; height:6px; border-radius:50%; flex-shrink:0; margin-top:4px;"></span>` : ''}
        </div>
        <div style="font-size:0.75rem; color:var(--color-primary); font-weight:500; margin-top:2px;">
          Task: "${n.taskTitle}"
        </div>
        <div style="font-size:0.65rem; color:var(--text-muted); text-align:right; margin-top:2px;">
          ${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      `;

      item.addEventListener('click', async () => {
        // 1. Mark as read
        if (!n.read) {
          try {
            await api.notifications.markRead(n.id);
            await this.loadAll();
          } catch (err) {
            console.error("Mark read failed:", err);
          }
        }

        // 2. Hide dropdown
        document.getElementById('notification-dropdown-menu').style.display = 'none';

        // 3. Switch views to Task Manager
        if (typeof window.switchView !== 'undefined') {
          window.switchView('tasks-page');
        }

        // 4. Open task details drawer
        setTimeout(() => {
          if (window.tasksModule && typeof window.tasksModule.showTaskDetailsSideOverlay === 'function') {
            window.tasksModule.showTaskDetailsSideOverlay(n.taskId);
          }
        }, 150);
      });

      listContainer.appendChild(item);
    });
  }
};

export default notificationsModule;
