/**
 * VSH Legal - Case & Practice Manager Daily Case Diary Module
 * Implements Month, Week, Day, and Year views with dynamic event badges.
 */

import db from './db.js';
import casesModule from './cases.js';

// Calendar State
const calendarState = {
  currentDate: new Date(), // Default start point (dynamic system date)
  activeView: 'month' // month, week, day, year
};

const diaryModule = {
  init() {
    console.log("Diary: Initializing diary module...");
    this.setupViewSelector();
    this.setupNavigation();
    this.setupModal();

    // Listen for case updates to refresh the unscheduled list in real-time
    document.addEventListener('casesUpdated', () => {
      const diaryPage = document.getElementById('diary-page');
      if (diaryPage && diaryPage.classList.contains('active')) {
        this.renderUnscheduledCases();
      }
    });

    console.log("Diary: Initialization complete.");
  },

  render() {
    console.log("Diary: Rendering active view: " + calendarState.activeView);
    this.renderActiveView();
    this.renderUnscheduledCases();
  },

  /**
   * Calendar View Selector setup (Day/Week/Month/Year)
   */
  setupViewSelector() {
    const selectorBtns = document.querySelectorAll('.calendar-view-selector .view-btn');
    console.log("Diary: Found view selector buttons: " + selectorBtns.length);
    selectorBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = btn.getAttribute('data-view');
        console.log("Diary: View selector button clicked: " + view);
        selectorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        calendarState.activeView = view;
        this.renderActiveView();
      });
    });
  },

  /**
   * Navigation Buttons (Today, Back, Next)
   */
  setupNavigation() {
    const prevBtn = document.getElementById('diary-prev-btn');
    const nextBtn = document.getElementById('diary-next-btn');
    const todayBtn = document.getElementById('diary-today-btn');
    console.log("Diary: Found navigation buttons:", !!prevBtn, !!nextBtn, !!todayBtn);

    prevBtn.addEventListener('click', () => {
      console.log("Diary: Prev button clicked");
      this.navigateCalendar(-1);
    });

    nextBtn.addEventListener('click', () => {
      console.log("Diary: Next button clicked");
      this.navigateCalendar(1);
    });

    todayBtn.addEventListener('click', () => {
      console.log("Diary: Today button clicked");
      calendarState.currentDate = new Date(); // Reset to today (dynamic system date)
      this.renderActiveView();
    });

    const printBtn = document.getElementById('diary-print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }
  },


  navigateCalendar(direction) {
    console.log("Diary: navigateCalendar starting. Direction: " + direction + ", current date before: " + calendarState.currentDate.toDateString());
    const view = calendarState.activeView;
    const date = calendarState.currentDate;

    if (view === 'month') {
      date.setMonth(date.getMonth() + direction);
    } else if (view === 'week') {
      date.setDate(date.getDate() + (direction * 7));
    } else if (view === 'day') {
      date.setDate(date.getDate() + direction);
    } else if (view === 'year') {
      date.setFullYear(date.getFullYear() + direction);
    }

    calendarState.currentDate = date;
    console.log("Diary: navigateCalendar finished. Date after: " + calendarState.currentDate.toDateString());
    this.renderActiveView();
  },

  /**
   * Render Dispatcher
   */
  renderActiveView() {
    const view = calendarState.activeView;
    const date = calendarState.currentDate;
    const label = document.getElementById('diary-current-label');
    const content = document.getElementById('diary-views-content');

    // Update label text
    if (view === 'month') {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      label.textContent = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      this.renderMonthView(content, date);
    } else if (view === 'week') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const formatOption = { month: 'short', day: 'numeric' };
      label.textContent = `${startOfWeek.toLocaleDateString('en-US', formatOption)} - ${endOfWeek.toLocaleDateString('en-US', formatOption)}, ${date.getFullYear()}`;
      this.renderWeekView(content, date);
    } else if (view === 'day') {
      label.textContent = date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
      this.renderDayView(content, date);
    } else if (view === 'year') {
      label.textContent = `${date.getFullYear()}`;
      this.renderYearView(content, date);
    }
  },

  /**
   * Month View Rendering
   */
  renderMonthView(container, date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sun
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    let gridHtml = `<div class="month-grid">`;
    
    // Add Day Names Row
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    dayNames.forEach(name => {
      gridHtml += `<div class="day-name-cell">${name}</div>`;
    });

    const cases = db.getCases();
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Render previous month padding cells
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDay = prevMonthTotalDays - i;
      const prevMonthDateStr = this.formatDateStr(year, month - 1, prevDay);
      gridHtml += this.generateDayCellMarkup(prevDay, prevMonthDateStr, true, cases, todayStr);
    }

    // 2. Render current month cells
    for (let day = 1; day <= totalDays; day++) {
      const currentMonthDateStr = this.formatDateStr(year, month, day);
      const isToday = currentMonthDateStr === todayStr;
      gridHtml += this.generateDayCellMarkup(day, currentMonthDateStr, false, cases, todayStr);
    }

    // 3. Render next month padding cells
    const totalRenderedCells = firstDayIndex + totalDays;
    const remainingCells = 42 - totalRenderedCells; // 6 rows * 7 days = 42 cells
    for (let day = 1; day <= remainingCells; day++) {
      const nextMonthDateStr = this.formatDateStr(year, month + 1, day);
      gridHtml += this.generateDayCellMarkup(day, nextMonthDateStr, true, cases, todayStr);
    }

    gridHtml += `</div>`;
    container.innerHTML = gridHtml;

    // Attach click event listners to day cells
    container.querySelectorAll('.day-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const cellDate = cell.getAttribute('data-date');
        this.showDayDetails(cellDate);
      });
    });
  },

  generateDayCellMarkup(dayNumber, dateStr, isOtherMonth, cases, todayStr) {
    const isToday = dateStr === todayStr;
    const classNames = ['day-cell'];
    if (isOtherMonth) classNames.push('other-month');
    if (isToday) classNames.push('today');

    // Filter hearings on this day (both upcoming and past history)
    const hearings = this.getHearingsForDate(dateStr);

    let eventsHtml = '';
    hearings.slice(0, 3).forEach(h => {
      let badgeClass = 'event-other';
      const cType = h.caseType;
      if (cType === 'Civil') badgeClass = 'event-civil';
      else if (cType === 'Criminal') badgeClass = 'event-criminal';
      else if (cType === 'Matrimonial') badgeClass = 'event-matrimonial';
      else if (cType === 'Consumer') badgeClass = 'event-consumer';
      else if (cType === 'Service') badgeClass = 'event-service';
      else if (cType === 'Legal Notice') badgeClass = 'event-notice';
      else if (cType === 'Contracts') badgeClass = 'event-contracts';
      else if (cType === 'Consultation') badgeClass = 'event-consultation';
      
      eventsHtml += `<div class="event-badge ${badgeClass}" title="${h.title}">${h.title}</div>`;
    });

    if (hearings.length > 3) {
      eventsHtml += `<div class="event-badge event-other" style="text-align:center;">+${hearings.length - 3} more</div>`;
    }

    return `
      <div class="${classNames.join(' ')}" data-date="${dateStr}">
        <span class="day-number">${dayNumber}</span>
        <div class="day-events">
          ${eventsHtml}
        </div>
      </div>
    `;
  },

  /**
   * Week View Rendering
   */
  renderWeekView(container, date) {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay()); // Sunday

    let weekHtml = `<div class="week-grid">`;
    const cases = db.getCases();
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + i);
      const dateStr = this.formatDateStr(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate());
      
      const isToday = dateStr === todayStr;
      const dayNum = currentDay.getDate();
      const dayName = currentDay.toLocaleDateString('en-US', { weekday: 'short' });
      
      const hearings = this.getHearingsForDate(dateStr);
      
      let eventsHtml = '';
      if (hearings.length === 0) {
        eventsHtml = `<span style="font-size:0.8rem;" class="text-muted">No hearings listed.</span>`;
      } else {
        hearings.forEach(h => {
          eventsHtml += `
            <div class="week-event-card" style="cursor:pointer;" data-case-id="${h.id}">
              <div style="font-weight:600; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${h.title}</div>
              <div style="color:var(--text-secondary); font-size:0.7rem;">Court: ${h.court}</div>
              <div style="color:var(--color-primary); font-size:0.65rem; margin-top:0.25rem;">Stage: ${h.stage}</div>
            </div>
          `;
        });
      }

      weekHtml += `
        <div class="week-row">
          <div class="week-day-header ${isToday ? 'today' : ''}">
            <div class="day-num">${dayNum}</div>
            <div class="day-name">${dayName}</div>
          </div>
          <div class="week-events-list">
            ${eventsHtml}
          </div>
        </div>
      `;
    }

    weekHtml += `</div>`;
    container.innerHTML = weekHtml;

    // Event listener click routing for case details in week view cards
    container.querySelectorAll('.week-event-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const caseId = card.getAttribute('data-case-id');
        casesModule.showCaseDossier(caseId);
      });
    });
  },

  /**
   * Day View Rendering
   */
  renderDayView(container, date) {
    const dateStr = this.formatDateStr(date.getFullYear(), date.getMonth(), date.getDate());
    const hearings = this.getHearingsForDate(dateStr);

    let dayHtml = `<div style="display:flex; flex-direction:column; gap:1rem;">`;

    if (hearings.length === 0) {
      dayHtml += `
        <div class="card" style="text-align:center; padding:3rem;" class="text-muted">
          <i data-lucide="calendar-check" style="width:48px; height:48px; stroke-width:1.5; color:var(--text-muted); margin-bottom:1rem; display:inline-block;"></i>
          <p>No listings in diary for today.</p>
        </div>
      `;
    } else {
      hearings.forEach(h => {
        const client = db.getClient(h.clientId);
        dayHtml += `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem; border-left:4px solid ${h.isUpcoming ? 'var(--color-primary)' : 'var(--text-muted)'}; opacity: ${h.isUpcoming ? '1' : '0.85'};">
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <h3 style="font-size:1.15rem; color:var(--text-primary); cursor:pointer;" class="case-link" data-id="${h.id}">${h.title}</h3>
                <span class="badge" style="font-size:0.65rem; padding:0.15rem 0.35rem; background-color:${h.isUpcoming ? 'rgba(217, 119, 6, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color:${h.isUpcoming ? '#d97706' : 'var(--text-secondary)'};">
                  ${h.isUpcoming ? 'Upcoming' : 'Past Outcome'}
                </span>
              </div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
                Client: <strong>${client ? client.name : 'N/A'}</strong> | Case Number: ${h.caseNumber}
              </div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
                Court: <strong>${h.court}</strong> | Stage: <strong style="color:var(--text-primary);">${h.stage}</strong>
              </div>
              ${!h.isUpcoming && h.notes ? `
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.5rem; padding:0.4rem 0.65rem; background:rgba(0,0,0,0.15); border-radius:4px; border-left:2px solid var(--border-color); font-style:italic; white-space: pre-wrap;">
                Outcome: ${h.notes}
              </div>
              ` : ''}
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button class="btn btn-secondary btn-dossier" data-id="${h.id}">Details</button>
              <button class="btn btn-primary btn-add-outcome" data-id="${h.id}">Log Outcome</button>
            </div>
          </div>
        `;
      });
    }

    dayHtml += `</div>`;
    container.innerHTML = dayHtml;

    // Setup actions
    container.querySelectorAll('.btn-dossier, .case-link').forEach(btn => {
      btn.addEventListener('click', () => {
        casesModule.showCaseDossier(btn.getAttribute('data-id'));
      });
    });

    container.querySelectorAll('.btn-add-outcome').forEach(btn => {
      btn.addEventListener('click', () => {
        casesModule.showAddHearingModal(btn.getAttribute('data-id'));
      });
    });

    lucide.createIcons();
  },

  /**
   * Year View Rendering
   */
  renderYearView(container, date) {
    const year = date.getFullYear();
    const cases = db.getCases();
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // List the months and show how many cases are listed each month
      let yearHtml = `<div class="mobile-year-list" style="display:flex; flex-direction:column; gap:0.75rem; width:100%; margin-top:0.5rem;">`;
      const monthNamesFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      
      for (let month = 0; month < 12; month++) {
        // Count total hearings in this month
        let totalMonthHearings = 0;
        const totalDays = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= totalDays; day++) {
          const dateStr = this.formatDateStr(year, month, day);
          const dayHearings = this.getHearingsForDate(dateStr);
          totalMonthHearings += dayHearings.length;
        }
        
        const hasHearings = totalMonthHearings > 0;
        const badgeColor = hasHearings ? 'var(--color-primary)' : 'var(--text-muted)';
        const badgeBg = hasHearings ? 'var(--color-primary-glow)' : 'rgba(255,255,255,0.03)';
        const borderStyle = hasHearings ? '1px solid var(--color-primary)' : '1px solid var(--border-color)';
        
        yearHtml += `
          <div class="card mini-month-list-item" style="display:flex; justify-content:space-between; align-items:center; padding:0.85rem 1.25rem; margin-bottom:0; border:${borderStyle};">
            <span style="font-weight:600; font-size:0.95rem; color:var(--text-primary);">${monthNamesFull[month]}</span>
            <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:700; font-size:0.8rem; padding:0.25rem 0.6rem; border-radius:10px;">
              ${totalMonthHearings} Case(s)
            </span>
          </div>
        `;
      }
      
      yearHtml += `</div>`;
      container.innerHTML = yearHtml;
      return;
    }

    let yearHtml = `<div class="year-grid">`;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let month = 0; month < 12; month++) {
      yearHtml += `
        <div class="mini-month-card">
          <div class="mini-month-name">${monthNames[month]}</div>
          <div class="mini-month-grid">
      `;

      // Mini month header days row
      const miniDayHeaders = ["S", "M", "T", "W", "T", "F", "S"];
      miniDayHeaders.forEach(dh => {
        yearHtml += `<div class="mini-day-cell" style="font-weight:600; color:var(--text-muted); opacity:0.6;">${dh}</div>`;
      });

      const firstDayIndex = new Date(year, month, 1).getDay();
      const totalDays = new Date(year, month + 1, 0).getDate();

      // Prev padding cells
      for (let pad = 0; pad < firstDayIndex; pad++) {
        yearHtml += `<div class="mini-day-cell"></div>`;
      }

      // Month cells
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = this.formatDateStr(year, month, day);
        const dayHearings = this.getHearingsForDate(dateStr);
        
        let cellClass = 'mini-day-cell active-day';
        if (dayHearings.length > 0) {
          cellClass += dayHearings.length > 2 ? ' has-heavy-event' : ' has-event';
        }

        yearHtml += `<div class="${cellClass}" title="${dayHearings.length} hearings on ${dateStr}">${day}</div>`;
      }

      yearHtml += `
          </div>
        </div>
      `;
    }

    yearHtml += `</div>`;
    container.innerHTML = yearHtml;
  },

  /**
   * Daily Details Popup Modal
   */
  setupModal() {
    const overlay = document.getElementById('day-details-modal');
    const closeBtn = document.getElementById('day-details-close');
    const closeBtn2 = document.getElementById('day-details-close-btn');

    const hide = () => overlay.classList.remove('active');
    closeBtn.addEventListener('click', hide);
    closeBtn2.addEventListener('click', hide);
  },

  showDayDetails(dateStr) {
    const date = new Date(dateStr);
    const formattedTitle = date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
    
    document.getElementById('day-details-title').textContent = `Diary: ${formattedTitle}`;

    const hearings = this.getHearingsForDate(dateStr);
    
    const body = document.getElementById('day-details-body');
    body.innerHTML = '';

    if (hearings.length === 0) {
      body.innerHTML = `<p class="text-muted" style="text-align:center; padding:1.5rem 0;">No hearings listed in the diary for this day.</p>`;
    } else {
      hearings.forEach(h => {
        const client = db.getClient(h.clientId);
        const item = document.createElement('div');
        item.style.padding = '0.75rem';
        item.style.border = '1px solid var(--border-color)';
        item.style.borderRadius = 'var(--radius-md)';
        item.style.marginBottom = '0.5rem';
        item.style.backgroundColor = 'rgba(255,255,255,0.02)';
        item.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <strong style="color:var(--text-primary); font-size:0.95rem; cursor:pointer;" class="popup-case-link" data-id="${h.id}">${h.title}</strong>
            <span class="badge" style="background-color: ${h.isUpcoming ? 'var(--color-primary-bg)' : 'rgba(255,255,255,0.06)'}; color: ${h.isUpcoming ? 'var(--color-primary)' : 'var(--text-secondary)'}; font-size:0.7rem; padding:0.15rem 0.35rem; border-radius:4px;">
              ${h.stage}
            </span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
            Court: ${h.court} | Client: ${client ? client.name : 'Unknown'}
          </div>
          ${!h.isUpcoming && h.notes ? `
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem; padding-top:0.5rem; border-top:1px dashed var(--border-color); font-style:italic; white-space: pre-wrap;">
            Outcome notes: ${h.notes}
          </div>
          ` : ''}
        `;
        
        // Link click
        item.querySelector('.popup-case-link').addEventListener('click', () => {
          document.getElementById('day-details-modal').classList.remove('active');
          casesModule.showCaseDossier(h.id);
        });

        body.appendChild(item);
      });
    }

    document.getElementById('day-details-modal').classList.add('active');
  },

  getHearingsForDate(dateStr) {
    const cases = db.getCases();
    const list = [];

    cases.forEach(c => {
      // 1. Check if nextHearingDate matches this date (active upcoming event)
      if (c.status === 'Active' && c.nextHearingDate === dateStr) {
        list.push({
          id: c.id,
          title: c.title,
          court: c.court,
          caseNumber: c.caseNumber,
          clientId: c.clientId,
          caseType: c.caseType,
          status: c.status,
          stage: c.stage,
          notes: 'Upcoming scheduled hearing.',
          isUpcoming: true
        });
      }

      // 2. Check if any hearing in c.hearings matches this date (past recorded outcomes)
      const pastHearings = c.hearings || [];
      pastHearings.forEach(h => {
        if (h.date === dateStr) {
          // Avoid duplicate entries
          if (!list.some(item => item.id === c.id && !item.isUpcoming)) {
            list.push({
              id: c.id,
              title: c.title,
              court: c.court,
              caseNumber: c.caseNumber,
              clientId: c.clientId,
              caseType: c.caseType,
              status: c.status,
              stage: h.stage,
              notes: h.notes || '',
              isUpcoming: false
            });
          }
        }
      });
    });

    return list;
  },

  /**
   * Helper to format date strings YYYY-MM-DD
   */
  formatDateStr(year, month, day) {
    // Handle overflow months from padding
    const d = new Date(year, month, day);
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    const dStr = String(d.getDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  },

  renderUnscheduledCases() {
    const listContainer = document.getElementById('diary-unscheduled-list');
    if (!listContainer) return;

    const cases = db.getCases();
    // Filter active cases for which nextHearingDate is null or empty
    const unscheduledCases = cases.filter(c => c.status === 'Active' && !c.nextHearingDate);

    listContainer.innerHTML = '';

    if (unscheduledCases.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color: var(--text-muted);">
          <i data-lucide="check-circle" style="width:28px; height:28px; color:var(--color-success); margin-bottom:0.5rem; display:inline-block;"></i>
          <p style="font-size:0.8rem; margin:0;">All active cases have next hearing dates scheduled!</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    unscheduledCases.forEach(c => {
      const client = db.getClient(c.clientId);
      const item = document.createElement('div');
      item.style.backgroundColor = 'rgba(239, 68, 68, 0.03)';
      item.style.border = '1px solid rgba(239, 68, 68, 0.15)';
      item.style.borderRadius = 'var(--radius-sm)';
      item.style.padding = '0.75rem';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.gap = '0.25rem';
      item.style.cursor = 'pointer';
      item.style.transition = 'all var(--transition-fast)';

      // Hover effects
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'rgba(239, 68, 68, 0.06)';
        item.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'rgba(239, 68, 68, 0.03)';
        item.style.borderColor = 'rgba(239, 68, 68, 0.15)';
      });

      item.innerHTML = `
        <div style="font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); font-weight:600; display:flex; justify-content:space-between;">
          <span>${c.caseType}</span>
          <span style="color:var(--color-danger); font-weight:700;">No Next Date</span>
        </div>
        <strong style="font-size:0.85rem; color:var(--text-primary); line-height:1.2; margin-top:0.15rem;">${c.title}</strong>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.15rem;">
          CNR/Ref: ${c.caseNumber}
        </div>
        <div style="font-size:0.75rem; color:var(--text-secondary);">
          Client: ${client ? client.name : 'Unknown'}
        </div>
      `;

      item.addEventListener('click', () => {
        casesModule.showCaseDossier(c.id);
      });

      listContainer.appendChild(item);
    });
    
    lucide.createIcons();
  }
};

export default diaryModule;
