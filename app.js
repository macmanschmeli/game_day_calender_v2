/**
 * Month View Calendar — app.js
 * Vanilla JS, no dependencies. Reads ./appointments.json and renders a
 * 7-column SAP UI5-style month grid. Click any appointment badge (or a
 * "+ X More" label) to open a read-only details popover.
 */

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MAX_VISIBLE_ENTRIES = 3;

/** @type {{title: string, start: string}[]} */
let allAppointments = [];

/** Map of "YYYY-MM-DD" -> appointment[] */
let appointmentsByDate = new Map();

/** Currently displayed month (always day 1) */
let viewDate = new Date();
viewDate.setHours(0, 0, 0, 0);
viewDate.setDate(1);

const todayKey = formatDateKey(new Date());

// ---- DOM refs -------------------------------------------------------------

const monthLabelEl = document.getElementById('monthLabel');
const weekdayRowEl = document.getElementById('weekdayRow');
const gridEl = document.getElementById('calendarGrid');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const todayBtn = document.getElementById('todayBtn');

const modalOverlay = document.getElementById('modalOverlay');
const modalBox = document.getElementById('modalBox');
const modalContent = document.getElementById('modalContent');

let lastFocusedElement = null;

// ---- Date helpers -----------------------------------------------------------

/** Parse a "YYYY-MM-DD" string as a local date (avoids UTC offset bugs). */
function parseDateKey(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as a local "YYYY-MM-DD" key. */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// ---- Data loading -----------------------------------------------------------

async function loadAppointments() {
  try {
    const res = await fetch('./appointments.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allAppointments = await res.json();
  } catch (err) {
    console.error('Could not load appointments.json:', err);
    allAppointments = [];
  }
  indexAppointments();
}

function indexAppointments() {
  appointmentsByDate = new Map();
  for (const appt of allAppointments) {
    if (!appt || !appt.start) continue;
    const list = appointmentsByDate.get(appt.start) || [];
    list.push(appt);
    appointmentsByDate.set(appt.start, list);
  }
}

/** Determine badge class from the appointment title, per the schema rule. */
function badgeClassFor(title) {
  if (typeof title !== 'string') return 'badge-default';
  if (title.startsWith('Home')) return 'match-home';
  if (title.startsWith('Away')) return 'match-away';
  return 'badge-default';
}

// ---- Rendering ----------------------------------------------------------

function renderWeekdayRow() {
  weekdayRowEl.innerHTML = '';
  for (const label of WEEKDAY_LABELS) {
    const cell = document.createElement('div');
    cell.setAttribute('role', 'columnheader');
    cell.textContent = label;
    weekdayRowEl.appendChild(cell);
  }
}

function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  monthLabelEl.textContent = `${MONTH_LABELS[month]} ${year}`;

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  gridEl.innerHTML = '';
  gridEl.style.gridTemplateRows = `repeat(${totalCells / 7}, 1fr)`;

  const startDate = new Date(year, month, 1 - startWeekday);

  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    gridEl.appendChild(buildDayCell(cellDate, month));
  }
}

function buildDayCell(cellDate, currentMonth) {
  const dateKey = formatDateKey(cellDate);
  const isOutside = cellDate.getMonth() !== currentMonth;
  const isToday = dateKey === todayKey;

  const cell = document.createElement('div');
  cell.className = 'day-cell';
  cell.setAttribute('role', 'gridcell');
  if (isOutside) cell.classList.add('outside');
  if (isToday) cell.classList.add('today');

  const dayNumber = document.createElement('div');
  dayNumber.className = 'day-number';
  dayNumber.textContent = String(cellDate.getDate());
  cell.appendChild(dayNumber);

  const entries = (appointmentsByDate.get(dateKey) || []);

  const list = document.createElement('div');
  list.className = 'entries-list';

  const visible = entries.slice(0, MAX_VISIBLE_ENTRIES);
  for (const appt of visible) {
    list.appendChild(buildBadge(appt));
  }

  const overflowCount = entries.length - visible.length;
  if (overflowCount > 0) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'more-link';
    moreBtn.textContent = `+ ${overflowCount} More`;
    moreBtn.addEventListener('click', () => openDayListModal(cellDate, entries));
    list.appendChild(moreBtn);
  }

  cell.appendChild(list);
  return cell;
}

function buildBadge(appt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `appointment-badge ${badgeClassFor(appt.title)}`;
  btn.textContent = appt.title;
  btn.title = appt.title;
  btn.addEventListener('click', () => openDetailModal(appt));
  return btn;
}

// ---- Navigation -----------------------------------------------------------

function goToMonth(offset) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
  renderCalendar();
}

function goToToday() {
  const now = new Date();
  viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar();
}

prevBtn.addEventListener('click', () => goToMonth(-1));
nextBtn.addEventListener('click', () => goToMonth(1));
todayBtn.addEventListener('click', goToToday);

// ---- Modal / popover --------------------------------------------------------

function openModal() {
  lastFocusedElement = document.activeElement;
  modalOverlay.hidden = false;
  document.addEventListener('keydown', handleModalKeydown);
}

function closeModal() {
  modalOverlay.hidden = true;
  modalContent.innerHTML = '';
  document.removeEventListener('keydown', handleModalKeydown);
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

function handleModalKeydown(e) {
  if (e.key === 'Escape') {
    closeModal();
  }
}

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

/** Detail view: full title + date for a single appointment. */
function openDetailModal(appt) {
  const badgeClass = badgeClassFor(appt.title);
  const date = parseDateKey(appt.start);

  modalContent.innerHTML = `
    <button type="button" class="modal-close-x" aria-label="Close">&times;</button>
    <h2 class="modal-title" id="modalTitle">${escapeHtml(appt.title)}</h2>
    <p class="modal-meta">
      <span class="modal-meta-pill">
        <span class="modal-badge-dot ${badgeClass}"></span>
        ${escapeHtml(formatLongDate(date))}
      </span>
    </p>
    <div class="modal-actions">
      <button type="button" class="modal-close-btn">Close</button>
    </div>
  `;

  wireModalCloseButtons();
  openModal();
  modalContent.querySelector('.modal-close-btn').focus();
}

/** Overflow view: list every appointment for a given day. */
function openDayListModal(date, entries) {
  const itemsHtml = entries.map((appt) => {
    const cls = badgeClassFor(appt.title);
    return `<button type="button" class="appointment-badge ${cls}" data-title="${escapeHtml(appt.title)}">${escapeHtml(appt.title)}</button>`;
  }).join('');

  modalContent.innerHTML = `
    <button type="button" class="modal-close-x" aria-label="Close">&times;</button>
    <h2 class="modal-title" id="modalTitle">${escapeHtml(formatLongDate(date))}</h2>
    <p class="modal-meta">${entries.length} item${entries.length === 1 ? '' : 's'}</p>
    <div class="day-list">${itemsHtml}</div>
    <div class="modal-actions" style="margin-top:16px;">
      <button type="button" class="modal-close-btn">Close</button>
    </div>
  `;

  // Clicking an entry in the day list drills into its own detail view.
  modalContent.querySelectorAll('.day-list .appointment-badge').forEach((el, idx) => {
    el.addEventListener('click', () => openDetailModal(entries[idx]));
  });

  wireModalCloseButtons();
  openModal();
  modalContent.querySelector('.modal-close-btn').focus();
}

function wireModalCloseButtons() {
  modalContent.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
  modalContent.querySelector('.modal-close-x')?.addEventListener('click', closeModal);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Init -------------------------------------------------------------------

async function init() {
  renderWeekdayRow();
  await loadAppointments();
  renderCalendar();
}

init();
