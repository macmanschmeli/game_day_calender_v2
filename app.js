/**
 * Month View Calendar — app.js
 * Schema: { title, start }
 * Color and time are derived automatically from the title string.
 *
 * Title format: "<PREFIX> <Heim|Auswärts> vs <Opponent> <HH:MM>"
 * PREFIX → color mapping defined in PREFIX_COLORS below.
 */

const WEEKDAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];
const MAX_VISIBLE_ENTRIES = 3;

// ---- Colour palette ---------------------------------------------------------
// 20 colours across the full RGB spectrum.
// Each entry: [light-bg, saturated-border, dark-text]

const PALETTE = {
  red:     ['#fde8e8', '#d93025', '#8b1a12'],
  crimson: ['#fde8f0', '#c41c5a', '#7a1038'],
  pink:    ['#fde8f7', '#c0399e', '#7a1467'],
  magenta: ['#f8e8fd', '#a020a0', '#5e0d68'],
  violet:  ['#f0e8fd', '#7c3aed', '#450f99'],
  purple:  ['#ede8fd', '#6627cc', '#380e84'],
  indigo:  ['#e8ecfd', '#3b4fe8', '#1a2699'],
  blue:    ['#e8f0fd', '#1a73e8', '#0c3d8a'],
  sky:     ['#e8f6fd', '#0284c7', '#064e7d'],
  cyan:    ['#e8fafd', '#0891b2', '#065769'],
  teal:    ['#e8fdf7', '#0d9488', '#065951'],
  mint:    ['#e8fdf1', '#16a34a', '#0a5c2b'],
  green:   ['#eafde8', '#22c55e', '#145c2b'],
  lime:    ['#f3fde8', '#65a30d', '#3a5c08'],
  yellow:  ['#fdfce8', '#ca8a04', '#6b4a02'],
  amber:   ['#fdf5e8', '#d97706', '#7a3e02'],
  orange:  ['#fdf0e8', '#ea580c', '#7a2b04'],
  coral:   ['#fdeae8', '#e2441a', '#7a1e08'],
  brown:   ['#faf0e8', '#92400e', '#4a1f06'],
  slate:   ['#edf0f5', '#475569', '#1e293b'],
};
const PALETTE_FALLBACK = ['#f0f2f5', '#6b7280', '#1f2937'];

// ---- Prefix → color + label mapping ----------------------------------------
// One entry per team code that appears at the start of a title.
// "label" is the human-readable team name shown in the popup chip.

const PREFIX_COLORS = {
  'H1':    { color: 'blue',    label: 'Herren 1' },
  'H2':    { color: 'sky',     label: 'Herren 2' },
  'D1':    { color: 'crimson', label: 'Damen 1'  },
  'D2':    { color: 'pink',    label: 'Damen 2'  },
  'D3':    { color: 'magenta', label: 'Damen 3'  },
  'U20M':  { color: 'indigo',  label: 'U20 Männer' },
  'U18M':  { color: 'violet',  label: 'U18 Männer' },
  'U20W':  { color: 'orange',  label: 'U20 Frauen' },
  'U18W1': { color: 'amber',   label: 'U18 Frauen 1' },
  'U18W2': { color: 'yellow',  label: 'U18 Frauen 2' },
  'U18W3': { color: 'lime',    label: 'U18 Frauen 3' },
  'U16W':  { color: 'teal',    label: 'U16 Frauen' },
};

// ---- Title parsing ----------------------------------------------------------

/** Extract trailing "HH:MM" from a title string, return null if not found. */
function extractTime(title) {
  const m = title.match(/\b(\d{1,2}:\d{2})\s*$/);
  return m ? m[1] : null;
}

/** Strip the trailing time from the display title. */
function stripTime(title) {
  return title.replace(/\s*\d{1,2}:\d{2}\s*$/, '').trim();
}

/**
 * Detect the team prefix from the title.
 * Checks longest keys first so "U18W1" matches before "U18W".
 */
function detectPrefix(title) {
  const sorted = Object.keys(PREFIX_COLORS).sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (title.startsWith(prefix + ' ') || title === prefix) return prefix;
  }
  return null;
}

function colorVarsFor(colorKey) {
  const entry = PALETTE[colorKey] ?? PALETTE_FALLBACK;
  return { bg: entry[0], border: entry[1], text: entry[2] };
}

/** Return { bg, border, text, label } for an appointment. */
function resolveStyle(appt) {
  // Explicit color field takes priority
  if (appt.color && PALETTE[appt.color]) {
    return { ...colorVarsFor(appt.color), label: appt.color };
  }
  const prefix = detectPrefix(appt.title);
  if (prefix) {
    const { color, label } = PREFIX_COLORS[prefix];
    return { ...colorVarsFor(color), label };
  }
  return { ...colorVarsFor(null), label: 'Termin' };
}

// ---- State ------------------------------------------------------------------

let allAppointments = [];
let appointmentsByDate = new Map();

let viewDate = new Date();
viewDate.setHours(0, 0, 0, 0);
viewDate.setDate(1);

const todayKey = formatDateKey(new Date());

// ---- DOM refs ---------------------------------------------------------------

const monthLabelEl = document.getElementById('monthLabel');
const weekdayRowEl = document.getElementById('weekdayRow');
const gridEl       = document.getElementById('calendarGrid');
const prevBtn      = document.getElementById('prevBtn');
const nextBtn      = document.getElementById('nextBtn');
const todayBtn     = document.getElementById('todayBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');

let lastFocusedElement = null;

// ---- Date helpers -----------------------------------------------------------

function parseDateKey(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLongDate(date) {
  return date.toLocaleDateString('de-AT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
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
    if (!appt?.start) continue;
    const list = appointmentsByDate.get(appt.start) || [];
    list.push(appt);
    appointmentsByDate.set(appt.start, list);
  }
}

// ---- Badge ------------------------------------------------------------------

function applyBadgeColor(el, style) {
  el.style.setProperty('--badge-bg',     style.bg);
  el.style.setProperty('--badge-border', style.border);
  el.style.setProperty('--badge-text',   style.text);
}

function buildBadge(appt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'appointment-badge';
  // Show title without trailing time for cleaner badges
  btn.textContent = stripTime(appt.title);
  btn.title = appt.title;
  applyBadgeColor(btn, resolveStyle(appt));
  btn.addEventListener('click', () => openDetailModal(appt));
  return btn;
}

// ---- Calendar grid ----------------------------------------------------------

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
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  monthLabelEl.textContent = `${MONTH_LABELS[month]} ${year}`;

  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const totalCells   = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  gridEl.innerHTML = '';
  gridEl.style.gridTemplateRows = `repeat(${totalCells / 7}, 1fr)`;

  const startDate = new Date(year, month, 1 - startWeekday);
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    gridEl.appendChild(buildDayCell(d, month));
  }
}

function buildDayCell(cellDate, currentMonth) {
  const dateKey   = formatDateKey(cellDate);
  const isOutside = cellDate.getMonth() !== currentMonth;
  const isToday   = dateKey === todayKey;

  const cell = document.createElement('div');
  cell.className = 'day-cell' + (isOutside ? ' outside' : '') + (isToday ? ' today' : '');
  cell.setAttribute('role', 'gridcell');

  const dayNum = document.createElement('div');
  dayNum.className = 'day-number';
  dayNum.textContent = String(cellDate.getDate());
  cell.appendChild(dayNum);

  const entries = appointmentsByDate.get(dateKey) || [];
  const list    = document.createElement('div');
  list.className = 'entries-list';

  entries.slice(0, MAX_VISIBLE_ENTRIES).forEach(appt => list.appendChild(buildBadge(appt)));

  const overflow = entries.length - MAX_VISIBLE_ENTRIES;
  if (overflow > 0) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'more-link';
    moreBtn.textContent = `+ ${overflow} Mehr`;
    moreBtn.addEventListener('click', () => openDayListModal(cellDate, entries));
    list.appendChild(moreBtn);
  }

  cell.appendChild(list);
  return cell;
}

// ---- Navigation -------------------------------------------------------------

prevBtn.addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  renderCalendar();
});
nextBtn.addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  renderCalendar();
});
todayBtn.addEventListener('click', () => {
  const n = new Date();
  viewDate = new Date(n.getFullYear(), n.getMonth(), 1);
  renderCalendar();
});

// ---- Modal ------------------------------------------------------------------

function openModal() {
  lastFocusedElement = document.activeElement;
  modalOverlay.hidden = false;
  document.addEventListener('keydown', handleModalKey);
}

function closeModal() {
  modalOverlay.hidden = true;
  modalContent.innerHTML = '';
  document.removeEventListener('keydown', handleModalKey);
  lastFocusedElement?.focus();
}

function handleModalKey(e) { if (e.key === 'Escape') closeModal(); }
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

const ICON_DATE = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1" y="2" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M1 6h14" stroke="currentColor" stroke-width="1.4"/><path d="M5 1v2M11 1v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const ICON_TIME = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.5V8l2.5 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_HOME = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 7L8 2l6 5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 16v-5h4v5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const ICON_AWAY = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.4"/><path d="M8 5l3 3-3 3M5 8h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function detailRow(iconSvg, label, value) {
  return `
    <div class="modal-detail-row">
      <span class="modal-detail-icon">${iconSvg}</span>
      <div>
        <div class="modal-detail-label">${label}</div>
        <div class="modal-detail-value">${escapeHtml(value)}</div>
      </div>
    </div>`;
}

function openDetailModal(appt) {
  const style = resolveStyle(appt);
  const date  = parseDateKey(appt.start);
  const time  = appt.time || extractTime(appt.title);
  const cleanTitle = stripTime(appt.title);

  // Detect home vs away from the title
  const isHome = /\bHeim\b/i.test(appt.title);
  const isAway = /\bAuswärts\b/i.test(appt.title);
  const venueLabel = isHome ? 'Heimspiel' : isAway ? 'Auswärtsspiel' : null;
  const venueIcon  = isHome ? ICON_HOME : ICON_AWAY;

  const rows = [
    detailRow(ICON_DATE, 'Datum', formatLongDate(date)),
    time        ? detailRow(ICON_TIME, 'Uhrzeit', time) : '',
    venueLabel  ? detailRow(venueIcon, 'Spielort', venueLabel) : '',
  ].join('');

  modalContent.innerHTML = `
    <div class="modal-color-bar" style="background:${style.border}"></div>
    <div class="modal-inner">
      <button type="button" class="modal-close-x" aria-label="Schließen">&times;</button>
      <div class="modal-badge-chip" style="background:${style.bg};border-left:3px solid ${style.border};color:${style.text}">
        ${escapeHtml(style.label)}
      </div>
      <h2 class="modal-title" id="modalTitle">${escapeHtml(cleanTitle)}</h2>
      <div class="modal-details">${rows}</div>
      <div class="modal-actions">
        <button type="button" class="modal-close-btn">Schließen</button>
      </div>
    </div>
  `;

  wireClose();
  openModal();
  modalContent.querySelector('.modal-close-btn').focus();
}

function openDayListModal(date, entries) {
  const items = entries.map((appt, idx) => {
    const style = resolveStyle(appt);
    return `<button type="button" class="appointment-badge" data-idx="${idx}"
      style="--badge-bg:${style.bg};--badge-border:${style.border};--badge-text:${style.text}">
      ${escapeHtml(stripTime(appt.title))}
    </button>`;
  }).join('');

  modalContent.innerHTML = `
    <div class="modal-inner">
      <button type="button" class="modal-close-x" aria-label="Schließen">&times;</button>
      <h2 class="modal-title" id="modalTitle">${escapeHtml(formatLongDate(date))}</h2>
      <p class="modal-meta">${entries.length} Termin${entries.length === 1 ? '' : 'e'}</p>
      <div class="day-list">${items}</div>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" class="modal-close-btn">Schließen</button>
      </div>
    </div>
  `;

  modalContent.querySelectorAll('.day-list .appointment-badge').forEach(el => {
    el.addEventListener('click', () => openDetailModal(entries[+el.dataset.idx]));
  });

  wireClose();
  openModal();
  modalContent.querySelector('.modal-close-btn').focus();
}

function wireClose() {
  modalContent.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
  modalContent.querySelector('.modal-close-x')?.addEventListener('click', closeModal);
}

function escapeHtml(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// ---- Init -------------------------------------------------------------------

async function init() {
  renderWeekdayRow();
  await loadAppointments();
  renderCalendar();
}

init();
