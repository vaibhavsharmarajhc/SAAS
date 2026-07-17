/**
 * VSH Legal - Case & Practice Manager Tasks Module
 * Implements Todoist-style filters (Inbox, Today, Upcoming), Teammates, and Collaboration Comments.
 */

import db from './db.js';
import api from './api.js';

let tasksState = {
  tasks: [],
  colleagues: [],
  activeFilter: 'inbox', // inbox, today, upcoming, assigned-to-me, assigned-to-colleagues, or project name
  currentTaskDetails: null, // active task displayed in comments sidebar
  showCompleted: false
};

const tasksModule = {
  init() {
    console.log("Tasks: Initializing tasks module...");
    this.setupFilters();
    this.setupTaskForm();
    this.setupInviteForm();
    this.setupCommentsForm();
    this.setupModalToggles();
  },

  async render() {
    console.log("Tasks: Fetching latest tasks and team...");
    try {
      tasksState.tasks = await api.tasks.getAll() || [];
      tasksState.colleagues = await api.tasks.getColleagues() || [];
    } catch (err) {
      console.error("Tasks: Failed to load tasks/colleagues:", err);
    }

    this.renderSidebarCounts();
    this.renderProjectsList();
    this.renderTeamList();
    this.renderTasksContainer();
    this.populateAssigneeDropdowns();
  },

  setupFilters() {
    const filterBtns = document.querySelectorAll('.task-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');

        tasksState.activeFilter = btn.getAttribute('data-filter');
        this.renderTasksContainer();
      });
    });

    const toggleCompleted = document.getElementById('toggle-completed-tasks');
    if (toggleCompleted) {
      toggleCompleted.addEventListener('click', () => {
        tasksState.showCompleted = !tasksState.showCompleted;
        const icon = toggleCompleted.querySelector('i');
        const list = document.getElementById('completed-tasks-container');
        if (tasksState.showCompleted) {
          list.style.display = 'flex';
          if (icon) icon.setAttribute('data-lucide', 'chevron-up');
        } else {
          list.style.display = 'none';
          if (icon) icon.setAttribute('data-lucide', 'chevron-down');
        }
        lucide.createIcons();
      });
    }
  },

  /**
   * Modal trigger buttons setup
   */
  setupModalToggles() {
    const addBtnMain = document.getElementById('btn-add-task-manager');
    const addTaskModal = document.getElementById('add-task-modal');
    const addTaskClose = document.getElementById('add-task-close');
    const addTaskCancel = document.getElementById('add-task-cancel');

    const inviteBtn = document.getElementById('btn-invite-colleague');
    const inviteModal = document.getElementById('invite-colleague-modal');
    const inviteClose = document.getElementById('invite-colleague-close');
    const inviteCancel = document.getElementById('invite-colleague-cancel');

    const detailClose = document.getElementById('task-detail-close');
    const detailOverlay = document.getElementById('task-detail-overlay');

    addBtnMain.addEventListener('click', () => this.showAddTaskModal());

    addTaskClose.addEventListener('click', () => addTaskModal.classList.remove('active'));
    addTaskCancel.addEventListener('click', () => addTaskModal.classList.remove('active'));

    inviteBtn.addEventListener('click', () => {
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-error-container').style.display = 'none';
      inviteModal.classList.add('active');
    });

    inviteClose.addEventListener('click', () => inviteModal.classList.remove('active'));
    inviteCancel.addEventListener('click', () => inviteModal.classList.remove('active'));

    detailClose.addEventListener('click', () => {
      detailOverlay.classList.remove('active');
      tasksState.currentTaskDetails = null;
    });

    // Handle delete task btn click
    const deleteBtn = document.getElementById('task-delete-btn');
    deleteBtn.addEventListener('click', async () => {
      const taskId = document.getElementById('task-edit-id').value;
      if (confirm("Are you sure you want to delete this task?")) {
        try {
          await api.tasks.delete(taskId);
          addTaskModal.classList.remove('active');
          await this.render();
        } catch (err) {
          alert("Failed to delete task: " + err.message);
        }
      }
    });
  },

  /**
   * Trigger Task Creation Form Dialog
   */
  showAddTaskModal(editTaskId = null) {
    const modal = document.getElementById('add-task-modal');
    const titleEl = document.getElementById('task-modal-title');
    const submitBtn = document.getElementById('task-submit-btn');
    const deleteBtn = document.getElementById('task-delete-btn');

    this.populateAssigneeDropdowns();

    // Reset inputs
    document.getElementById('task-edit-id').value = '';
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-due-date').value = '';
    document.getElementById('task-priority').value = 'P4';
    document.getElementById('task-project').value = 'Inbox';
    document.getElementById('task-assignee').value = '';

    if (editTaskId) {
      titleEl.textContent = "Edit Task Parameters";
      submitBtn.textContent = "Save Changes";
      deleteBtn.style.display = 'block';

      const task = tasksState.tasks.find(t => t.id === editTaskId);
      if (task) {
        document.getElementById('task-edit-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.desc;
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-project').value = task.project;
        document.getElementById('task-assignee').value = task.assigneeId || '';
        
        if (task.dueDate) {
          document.getElementById('task-due-date').value = task.dueDate.split('T')[0];
        }
      }
    } else {
      titleEl.textContent = "Create New Task";
      submitBtn.textContent = "Create Task";
      deleteBtn.style.display = 'none';

      // Pre-fill active project if filtering by project
      const coreViews = ['inbox', 'today', 'upcoming', 'assigned-to-me', 'assigned-to-colleagues'];
      if (!coreViews.includes(tasksState.activeFilter)) {
        document.getElementById('task-project').value = tasksState.activeFilter;
      }
    }

    modal.classList.add('active');
  },

  /**
   * Populate assignee drop-downs with linked colleagues
   */
  populateAssigneeDropdowns() {
    const select = document.getElementById('task-assignee');
    if (!select) return;

    select.innerHTML = '<option value="">-- Assign to Me --</option>';
    tasksState.colleagues.forEach(c => {
      select.innerHTML += `<option value="${c.colleagueId}">${c.lawyerName} (${c.colleagueEmail})</option>`;
    });
  },

  /**
   * Create/Edit submit action
   */
  setupTaskForm() {
    const form = document.getElementById('add-task-form');
    const modal = document.getElementById('add-task-modal');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('task-edit-id').value;
      const title = document.getElementById('task-title').value.trim();
      const desc = document.getElementById('task-desc').value.trim();
      const dueDate = document.getElementById('task-due-date').value || null;
      const priority = document.getElementById('task-priority').value;
      const project = document.getElementById('task-project').value;
      const assigneeId = document.getElementById('task-assignee').value || null;

      let assigneeEmail = null;
      let assigneeName = null;
      if (assigneeId) {
        const coll = tasksState.colleagues.find(c => c.colleagueId === assigneeId);
        if (coll) {
          assigneeEmail = coll.colleagueEmail;
          assigneeName = coll.lawyerName;
        }
      }

      const taskData = { title, desc, dueDate, priority, project, assigneeId, assigneeEmail, assigneeName };

      try {
        if (editId) {
          await api.tasks.update(editId, taskData);
        } else {
          await api.tasks.create(taskData);
        }
        modal.classList.remove('active');
        await this.render();
      } catch (err) {
        alert("Failed to save task: " + err.message);
      }
    });
  },

  /**
   * Add colleague invite actions
   */
  setupInviteForm() {
    const form = document.getElementById('invite-colleague-form');
    const modal = document.getElementById('invite-colleague-modal');
    const errorContainer = document.getElementById('invite-error-container');
    const errorText = document.getElementById('invite-error-text');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorContainer.style.display = 'none';
      const email = document.getElementById('invite-email').value.trim();

      try {
        await api.tasks.addColleague(email);
        modal.classList.remove('active');
        await this.render();
      } catch (err) {
        errorText.textContent = err.message;
        errorContainer.style.display = 'flex';
        lucide.createIcons();
      }
    });
  },

  /**
   * Renders the sidebar counts badge numbers
   */
  renderSidebarCounts() {
    const currentUser = db.getUser();
    if (!currentUser) return;

    const myId = currentUser.id;
    const todayStr = new Date().toISOString().split('T')[0];

    const inboxCount = tasksState.tasks.filter(t => t.status === 'pending').length;
    const todayCount = tasksState.tasks.filter(t => t.status === 'pending' && t.dueDate && t.dueDate.split('T')[0] === todayStr).length;
    const upcomingCount = tasksState.tasks.filter(t => t.status === 'pending' && t.dueDate && t.dueDate.split('T')[0] > todayStr).length;
    const assignedMeCount = tasksState.tasks.filter(t => t.status === 'pending' && t.assigneeId === myId).length;
    const assignedColleaguesCount = tasksState.tasks.filter(t => t.status === 'pending' && t.assigneeId && t.assigneeId !== myId).length;

    document.getElementById('task-count-inbox').textContent = inboxCount;
    document.getElementById('task-count-today').textContent = todayCount;
    document.getElementById('task-count-upcoming').textContent = upcomingCount;
    document.getElementById('task-count-assigned-me').textContent = assignedMeCount;
    document.getElementById('task-count-assigned-colleagues').textContent = assignedColleaguesCount;
  },

  /**
   * Render sidebar dynamic projects links
   */
  renderProjectsList() {
    const container = document.getElementById('task-projects-list');
    if (!container) return;

    const projects = ['Inbox', 'Onboarding', 'Drafting', 'Filings', 'Research'];
    let html = '';

    projects.forEach(p => {
      const isSelected = tasksState.activeFilter === p;
      const count = tasksState.tasks.filter(t => t.status === 'pending' && t.project === p).length;

      html += `
        <button class="project-filter-btn ${isSelected ? 'active' : ''}" data-project="${p}">
          <span style="display: flex; align-items: center; gap: 0.5rem;"><i data-lucide="tag" style="width: 12px; height: 12px; color: ${p === 'Onboarding' ? '#10b981' : p === 'Drafting' ? '#fbbf24' : p === 'Filings' ? '#3b82f6' : p === 'Research' ? '#a855f7' : '#94a3b8'};"></i> ${p}</span>
          <span class="badge" style="font-size: 0.65rem; background: rgba(0,0,0,0.05); padding: 1px 5px; border-radius: 10px;">${count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    // Attach click events
    container.querySelectorAll('.project-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.task-filter-btn').forEach(b => {
          b.classList.remove('active');
        });
        container.querySelectorAll('.project-filter-btn').forEach(b => {
          b.classList.remove('active');
        });

        btn.classList.add('active');

        tasksState.activeFilter = btn.getAttribute('data-project');
        this.renderTasksContainer();
      });
    });

    lucide.createIcons();
  },

  /**
   * Render sidebar My Team colleagues listing
   */
  renderTeamList() {
    const container = document.getElementById('task-team-list');
    if (!container) return;

    if (tasksState.colleagues.length === 0) {
      container.innerHTML = `<span style="font-size:0.7rem; color:var(--text-muted); padding:0 0.5rem;">No teammates linked.</span>`;
      return;
    }

    let html = '';
    tasksState.colleagues.forEach(c => {
      const initials = c.lawyerName ? c.lawyerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'TM';
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.25rem 0.5rem;">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #fff;">
            <div style="background: rgba(217,119,6,0.15); color: var(--color-primary); border: 1px solid rgba(217,119,6,0.25); font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem;">${initials}</div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight:600;">${c.lawyerName}</span>
              <span style="font-size:0.6rem; color:var(--text-muted);">${c.colleagueEmail}</span>
            </div>
          </div>
          <span style="width: 6px; height: 6px; background: #10b981; border-radius: 50%; box-shadow: 0 0 6px #10b981;"></span>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  /**
   * Render tasks list filtered by state
   */
  renderTasksContainer() {
    const activeContainer = document.getElementById('task-items-container');
    const completedContainer = document.getElementById('completed-tasks-container');
    const completedSection = document.getElementById('completed-tasks-section');
    const completedCountSpan = document.getElementById('completed-tasks-count');

    if (!activeContainer) return;

    const currentUser = db.getUser();
    const myId = currentUser ? currentUser.id : null;
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter logic
    let filteredList = [...tasksState.tasks];

    if (tasksState.activeFilter === 'inbox') {
      // Show all active tasks
    } else if (tasksState.activeFilter === 'today') {
      filteredList = filteredList.filter(t => t.dueDate && t.dueDate.split('T')[0] === todayStr);
    } else if (tasksState.activeFilter === 'upcoming') {
      filteredList = filteredList.filter(t => t.dueDate && t.dueDate.split('T')[0] > todayStr);
    } else if (tasksState.activeFilter === 'assigned-to-me') {
      filteredList = filteredList.filter(t => t.assigneeId === myId);
    } else if (tasksState.activeFilter === 'assigned-to-colleagues') {
      filteredList = filteredList.filter(t => t.assigneeId && t.assigneeId !== myId);
    } else {
      // Filter by Project Category name
      filteredList = filteredList.filter(t => t.project === tasksState.activeFilter);
    }

    const pendingTasks = filteredList.filter(t => t.status === 'pending');
    const completedTasks = filteredList.filter(t => t.status === 'completed');

    // Title label updating
    const titleEl = document.getElementById('task-active-view-title');
    const descEl = document.getElementById('task-active-view-desc');
    const coreTitles = {
      'inbox': { t: 'All Tasks', d: 'All tasks in your practice space.' },
      'today': { t: 'Today', d: 'Tasks scheduled to complete today.' },
      'upcoming': { t: 'Upcoming', d: 'Matters scheduled for future dates.' },
      'assigned-to-me': { t: 'Assigned to Me', d: 'Tasks assigned to your schedule by teammates.' },
      'assigned-to-colleagues': { t: 'Assigned to Colleagues', d: 'Collaboration tasks assigned to colleagues.' }
    };

    if (coreTitles[tasksState.activeFilter]) {
      titleEl.textContent = coreTitles[tasksState.activeFilter].t;
      descEl.textContent = coreTitles[tasksState.activeFilter].d;
    } else {
      titleEl.textContent = tasksState.activeFilter;
      descEl.textContent = `Tasks classified under the '${tasksState.activeFilter}' project.`;
    }

    // Render Pending
    if (pendingTasks.length === 0) {
      activeContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex-grow:1; padding:3rem 1rem; color:var(--text-muted); text-align:center;">
          <i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: rgba(255,255,255,0.06); margin-bottom: 1rem;"></i>
          <h4 style="color:#fff; font-size:0.95rem; margin:0 0 4px 0;">All Clear!</h4>
          <p style="font-size:0.75rem; margin:0; max-width: 260px;">No pending tasks. Create one or rest easy!</p>
        </div>
      `;
    } else {
      let activeHtml = '';
      pendingTasks.forEach(t => {
        activeHtml += this.generateTaskItemMarkup(t, myId);
      });
      activeContainer.innerHTML = activeHtml;
    }

    // Render Completed
    completedCountSpan.textContent = completedTasks.length;
    if (completedTasks.length > 0) {
      completedSection.style.display = 'block';
      let completedHtml = '';
      completedTasks.forEach(t => {
        completedHtml += this.generateTaskItemMarkup(t, myId);
      });
      completedContainer.innerHTML = completedHtml;
    } else {
      completedSection.style.display = 'none';
      completedContainer.innerHTML = '';
    }

    this.bindTaskItemEvents(activeContainer);
    this.bindTaskItemEvents(completedContainer);

    lucide.createIcons();
  },

  /**
   * Generates single task item line HTML
   */
  generateTaskItemMarkup(t, myId) {
    const isCompleted = t.status === 'completed';
    const isAssignedToOther = t.assigneeId && t.assigneeId !== myId;
    const isAssignedToMe = t.assigneeId === myId;
    
    // Priority properties mapping
    const priMap = {
      'P1': { border: '#ef4444', text: 'P1 - High', bg: 'rgba(239,68,68,0.12)' },
      'P2': { border: '#f97316', text: 'P2 - Medium', bg: 'rgba(249,115,22,0.12)' },
      'P3': { border: '#3b82f6', text: 'P3 - Low', bg: 'rgba(59,130,246,0.12)' },
      'P4': { border: 'var(--border-color)', text: 'P4 - None', bg: 'var(--bg-sidebar)' }
    };
    const pri = priMap[t.priority] || priMap['P4'];

    const formattedDate = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const initials = t.assigneeName ? t.assigneeName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'ME';
    const commentsCount = t.comments ? t.comments.length : 0;

    return `
      <div class="task-item-card" data-task-id="${t.id}" style="border-left: 3px solid ${pri.border};">
        <div style="display:flex; align-items:center; gap:0.75rem; flex-grow:1; min-width:0;">
          
          <!-- Complete trigger checkbox -->
          <button class="btn-toggle-task-status ${isCompleted ? 'is-completed' : ''}" data-task-id="${t.id}">
            ${isCompleted ? '<i data-lucide="check" style="width:12px; height:12px;"></i>' : ''}
          </button>
          
          <div style="min-width:0; display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:0.85rem; color:${isCompleted ? 'var(--text-muted)' : 'var(--text-primary)'}; font-weight:600; text-decoration:${isCompleted ? 'line-through' : 'none'}; cursor:pointer;" class="btn-view-task-details" data-task-id="${t.id}">
              ${t.title}
            </span>
            ${t.desc ? `<span style="font-size:0.75rem; color:var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:320px;">${t.desc}</span>` : ''}
            
            <div style="display:flex; align-items:center; gap:8px; margin-top:2px;">
              <!-- Priority badge -->
              <span style="font-size:0.6rem; font-weight:700; color:${pri.border}; background:${pri.bg}; border:1px solid var(--border-color); padding:1px 4px; border-radius:3px;">
                ${pri.text}
              </span>
              <!-- Project Label -->
              <span style="font-size:0.6rem; color:var(--text-muted);"><i data-lucide="tag" style="width:10px; height:10px; display:inline-block; vertical-align:middle;"></i> ${t.project}</span>
              <!-- Due date if any -->
              ${t.dueDate ? `<span style="font-size:0.65rem; color:#f87171; font-weight:600;"><i data-lucide="calendar" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-right:2px;"></i> ${formattedDate}</span>` : ''}
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:0.75rem; flex-shrink:0;">
          
          <!-- Comments count button -->
          <button class="btn-view-task-details" data-task-id="${t.id}" style="background:none; border:none; display:flex; align-items:center; gap:3px; color:${commentsCount > 0 ? 'var(--color-primary)' : 'var(--text-muted)'}; cursor:pointer; font-size:0.7rem; padding:0.25rem;">
            <i data-lucide="message-square" style="width:14px; height:14px;"></i> ${commentsCount}
          </button>

          <!-- Assignee display badge -->
          ${t.assigneeId ? `
            <div title="Assignee: ${t.assigneeName} (${t.assigneeEmail})" style="background: ${isAssignedToMe ? 'rgba(217,119,6,0.15)' : 'rgba(59,130,246,0.15)'}; border: 1px solid ${isAssignedToMe ? 'rgba(217,119,6,0.25)' : 'rgba(59,130,246,0.25)'}; color: ${isAssignedToMe ? 'var(--color-primary)' : '#60a5fa'}; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700;">
              ${initials}
            </div>
          ` : ''}

          <!-- Edit button -->
          <button class="btn-edit-task" data-task-id="${t.id}" style="background:var(--border-color); border:1px solid var(--border-color); color:var(--text-muted); cursor:pointer; padding:0.25rem 0.4rem; border-radius:4px;" title="Edit Task Parameters">
            <i data-lucide="edit-3" style="width:12px; height:12px;"></i>
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Bind event handlers inside lists
   */
  bindTaskItemEvents(container) {
    // Toggle Status checkbox click
    container.querySelectorAll('.btn-toggle-task-status').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-task-id');
        const task = tasksState.tasks.find(t => t.id === taskId);
        if (!task) return;

        const newStatus = task.status === 'pending' ? 'completed' : 'pending';
        try {
          await api.tasks.update(taskId, { status: newStatus });
          await this.render();
        } catch (err) {
          alert("Failed to toggle status: " + err.message);
        }
      });
    });

    // Edit button click
    container.querySelectorAll('.btn-edit-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-task-id');
        this.showAddTaskModal(taskId);
      });
    });

    // View task details & comments log side overlay click
    container.querySelectorAll('.btn-view-task-details').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-task-id');
        this.showTaskDetailsSideOverlay(taskId);
      });
    });
  },

  /**
   * Trigger Sidebar Details and comments log thread
   */
  showTaskDetailsSideOverlay(taskId) {
    const task = tasksState.tasks.find(t => t.id === taskId);
    if (!task) return;

    tasksState.currentTaskDetails = task;

    const overlay = document.getElementById('task-detail-overlay');
    document.getElementById('task-detail-title').textContent = task.title;
    document.getElementById('task-detail-desc').textContent = task.desc || "No extra description provided.";
    document.getElementById('task-detail-project-tag').textContent = task.project;

    // Due date format
    const dueEl = document.getElementById('task-detail-due');
    if (task.dueDate) {
      dueEl.textContent = new Date(task.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
      dueEl.style.color = '#f87171';
    } else {
      dueEl.textContent = 'No date scheduled';
      dueEl.style.color = 'var(--text-muted)';
    }

    // Priority label
    const priEl = document.getElementById('task-detail-priority');
    const priMap = {
      'P1': { border: '#ef4444', text: '🔴 P1 - Critical' },
      'P2': { border: '#f97316', text: '🟠 P2 - Medium' },
      'P3': { border: '#3b82f6', text: '🔵 P3 - Low' },
      'P4': { border: '#94a3b8', text: '⚪ P4 - None' }
    };
    const pri = priMap[task.priority] || priMap['P4'];
    priEl.textContent = pri.text;
    priEl.style.color = pri.border;

    // Assignee mapping
    document.getElementById('task-detail-assignee').textContent = task.assigneeName ? `${task.assigneeName} (${task.assigneeEmail})` : 'Unassigned (Self)';

    // Creator mapping
    const isMyCreated = task.tenantId === db.getUser().id;
    document.getElementById('task-detail-creator').textContent = isMyCreated ? 'Self (Owner)' : 'Teammate Colleague';

    // Render Comments Log list
    this.renderCommentsList();

    overlay.classList.add('active');
  },

  /**
   * Render comments list log inside dossier
   */
  renderCommentsList() {
    const container = document.getElementById('task-comments-thread');
    if (!container) return;

    const task = tasksState.currentTaskDetails;
    if (!task) return;

    const comments = task.comments || [];
    if (comments.length === 0) {
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex-grow:1; padding:2rem 1rem; color:var(--text-muted); text-align:center;">
          <i data-lucide="messages-square" style="width: 32px; height: 32px; color: rgba(255,255,255,0.06); margin-bottom: 0.5rem;"></i>
          <span style="font-size:0.75rem;">No updates logged yet. Start the thread below.</span>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    const currentEmail = db.getUser().email;
    let html = '';
    
    comments.forEach(c => {
      const isMe = c.senderEmail.toLowerCase() === currentEmail.toLowerCase();
      const initials = c.senderName ? c.senderName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'TM';
      const time = new Date(c.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const date = new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      html += `
        <div style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 0.25rem; ${isMe ? 'flex-direction: row-reverse;' : ''}">
          <!-- Mini avatar bubble -->
          <div class="chat-avatar ${isMe ? 'is-me' : ''}">
            ${initials}
          </div>
          
          <!-- Message text bubble -->
          <div style="display: flex; flex-direction: column; max-width: 80%; align-items: ${isMe ? 'flex-end' : 'flex-start'};">
            <div class="chat-bubble ${isMe ? 'is-me' : ''}">
              ${c.content}
            </div>
            <span style="font-size:0.6rem; color:var(--text-muted); margin-top:2px; display:inline-block;">${c.senderName} • ${date}, ${time}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    
    // Auto Scroll thread to bottom
    container.scrollTop = container.scrollHeight;
  },

  /**
   * Submit comment updates thread
   */
  setupCommentsForm() {
    const form = document.getElementById('task-comment-form');
    const input = document.getElementById('task-comment-input');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const task = tasksState.currentTaskDetails;
      if (!task) return;

      const content = input.value.trim();
      const senderEmail = db.getUser().email;
      const senderName = db.getSettings().lawyerName || senderEmail;

      try {
        const comment = await api.tasks.addComment(task.id, { senderEmail, senderName, content });
        
        // Refresh local cache and list
        task.comments = task.comments || [];
        task.comments.push(comment);
        
        // Update general cache
        const cacheIdx = tasksState.tasks.findIndex(t => t.id === task.id);
        if (cacheIdx !== -1) {
          tasksState.tasks[cacheIdx] = task;
        }

        input.value = '';
        this.renderCommentsList();
        this.renderSidebarCounts();
        this.renderProjectsList();
        this.renderTasksContainer();
      } catch (err) {
        alert("Failed to post comment: " + err.message);
      }
    });
  }
};

export default tasksModule;
