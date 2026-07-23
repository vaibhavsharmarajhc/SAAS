/**
 * Track My Chambers - Undo & Redo History Manager Module
 * Tracks state-changing transactions, displays undo toasts, and handles Ctrl+Z / Ctrl+Y keyboard shortcuts.
 */

class HistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.initGlobalKeys();
    this.initStyles();
  }

  initStyles() {
    const styleId = 'undo-toast-animations-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  initGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      // Ctrl + Z => Undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      }
      // Ctrl + Y => Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      }
    });
  }

  push(action) {
    this.undoStack.push(action);
    this.redoStack = []; // Clear redo stack on new action
    this.showToast(action.description, false);
  }

  async undo() {
    if (this.undoStack.length === 0) {
      this.showSimpleToast("Nothing to undo");
      return;
    }
    const action = this.undoStack.pop();
    try {
      await action.undo();
      this.redoStack.push(action);
      this.showToast(`Undone: ${action.description}`, true);
    } catch (err) {
      console.error("Undo failed:", err);
      this.showSimpleToast(`Failed to undo: ${err.message}`);
    }
  }

  async redo() {
    if (this.redoStack.length === 0) {
      this.showSimpleToast("Nothing to redo");
      return;
    }
    const action = this.redoStack.pop();
    try {
      await action.redo();
      this.undoStack.push(action);
      this.showToast(`Redone: ${action.description}`, false);
    } catch (err) {
      console.error("Redo failed:", err);
      this.showSimpleToast(`Failed to redo: ${err.message}`);
    }
  }

  showSimpleToast(message) {
    const container = document.getElementById('notification-toast-container') || document.body;
    const toast = document.createElement('div');
    toast.style.cssText = `
      display: flex;
      align-items: center;
      background: #1e293b;
      border: 1px solid var(--border-color);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border-radius: var(--radius-md);
      padding: 0.75rem 1.25rem;
      color: #94a3b8;
      font-size: 0.8rem;
      font-weight: 600;
      animation: slideUp 0.3s ease;
      z-index: 10005;
      pointer-events: auto;
    `;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  showToast(description, isUndo = false) {
    const container = document.getElementById('notification-toast-container') || document.body;
    
    // Remove existing toast if any
    const existing = document.getElementById('undo-history-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'undo-history-toast';
    toast.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      background: #1e293b;
      border: 1.5px solid var(--color-primary);
      box-shadow: 0 10px 40px rgba(0,0,0,0.55);
      border-radius: var(--radius-md);
      padding: 0.85rem 1.35rem;
      color: #fff;
      font-size: 0.85rem;
      font-weight: 600;
      pointer-events: auto;
      animation: slideUp 0.3s ease;
      min-width: 300px;
      z-index: 10005;
    `;

    const text = document.createElement('span');
    text.textContent = description;
    toast.appendChild(text);

    const actionBtn = document.createElement('button');
    actionBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--color-primary);
      font-weight: 800;
      cursor: pointer;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.5px;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: background 0.2s;
    `;
    actionBtn.textContent = isUndo ? "Redo" : "Undo";
    actionBtn.addEventListener('click', () => {
      if (isUndo) {
        this.redo();
      } else {
        this.undo();
      }
      toast.remove();
    });
    toast.appendChild(actionBtn);

    container.appendChild(toast);

    // Auto remove after 8 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 8000);
  }
}

const historyManager = new HistoryManager();
export default historyManager;
