// ── External registers: ECR (Change Management), Production Incidents, Kaizen ──
// Three separate, view-only Google Sheets the Department of Production keeps
// by hand. Each is read through /export?format=csv (literal cell text, so a
// hand-typed date is seen exactly as typed — gviz would blank any cell whose
// type disagrees with its column's majority) and parsed into plain objects
// here, kept apart from the hook so the date rules are testable on their own.
//
// The house date format is dd.mm.yyyy (agreed 2026-10-22). Anything else is
// still read when it is unambiguous ("5th June 2026", "05.10.26",
// "23-Jul-2026") but carries a `flag`, so the board can list the rows whose
// dates need correcting in the sheet. A date that can't be placed on a single
// day ("29.05–03.06.2026", "Aug-Sep 2026", a bare "2026") is flagged and left
// out of every period count, and so is one dated in the future (a typed
// "6.8.2027" for 2026).

export const ECR_SHEET_ID = '1vvNIvag9JTFGHCgUOWfzTzDYst65PjXI';
export const INCIDENT_SHEET_ID = '1B4nhGrFBIc7-HqBorBaSYJPh8-MkKfeU';
export const csvExportUrl = id => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d2 = n => String(n).padStart(2, '0');
export const isoOf = d => `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;

function monthIndex(word) {
  const w = String(word).toLowerCase();
  return MONTHS.findIndex(m => w.startsWith(m));
}

function build(y, m, d) {
  const dt = new Date(y, m, d);
  // reject roll-overs such as 31.02.2026
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
}

export const FLAG_TEXT = {
  format: 'not dd.mm.yyyy',
  unreadable: 'cannot be read as one date',
  future: 'dated in the future',
};

/**
 * @param {string} raw     the cell text
 * @param {object} opts
 * @param {boolean} opts.strict  flag anything not written dd.mm.yyyy (default true)
 * @param {Date}    opts.today   for the future-date check (default now)
 * @returns {{ iso: string|null, raw: string, flag: null|'format'|'unreadable'|'future' }}
 *   `iso` is null whenever the row must not be counted in a period.
 */
export function parseRegisterDate(raw, { strict = true, today = new Date() } = {}) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s || /^(n\/?a|-|—|–)$/i.test(s)) return { iso: null, raw: s, flag: null };

  let dt = null, exact = false;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) {
    dt = build(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    exact = m[1].length === 2 && m[2].length === 2;
  }
  if (!dt && (m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(s))) {
    dt = build(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  if (!dt && (m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    dt = build(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  // "5th June 2026", "15 June 2026", "23-Jul-2026", "15-Sept-2026"
  if (!dt && (m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{4})$/.exec(s))) {
    const mi = monthIndex(m[2]);
    if (mi !== -1) dt = build(Number(m[3]), mi, Number(m[1]));
  }
  // ISO, as a fallback for a real date cell exported in ISO form
  if (!dt && (m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) {
    dt = build(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  if (!dt) return { iso: null, raw: s, flag: 'unreadable' };
  const todayIso = isoOf(today);
  const iso = isoOf(dt);
  if (iso > todayIso) return { iso: null, raw: s, flag: 'future' };
  return { iso, raw: s, flag: strict && !exact ? 'format' : null };
}

// dd.mm.yyyy for display — the house format, whatever the sheet held.
export function displayDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
export function shortLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${SHORT[Number(m[2]) - 1]}` : '';
}

const inRange = (iso, range) => !!iso && (!range?.start || iso >= range.start) && (!range?.end || iso <= range.end);

// Find the header row by a predicate, then map each later row through
// `toRecord(cells, col)`, where `col(name)` resolves a header (case- and
// whitespace-insensitive, prefix match) to its index.
function readTable(grid, isHeader, toRecord) {
  const hIdx = grid.findIndex(isHeader);
  if (hIdx === -1) return [];
  const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const header = grid[hIdx].map(norm);
  const col = (name, fallback) => {
    const n = norm(name);
    const i = header.findIndex(h => h === n || h.startsWith(n));
    return i === -1 ? fallback : i;
  };
  const out = [];
  for (let i = hIdx + 1; i < grid.length; i++) {
    const rec = toRecord(grid[i].map(c => String(c ?? '').trim()), col, i + 1);
    if (rec) out.push(rec);
  }
  return out;
}

// ── ECR / Change Management Register ────────────────────────────────────
// Header row starts "Change ID | Date Raised | Change Requester | …". Rows
// are counted in a period when they were RAISED in it or IMPLEMENTED in it
// (Actual Implementation Date, or Closure Date when that is all there is).
export function parseEcrRegister(grid, opts = {}) {
  return readTable(grid, r => /^change id$/i.test(String(r[0] || '').trim()), (r, col, sheetRow) => {
    const id = r[col('change id', 0)];
    const title = r[col('change title', 5)];
    if (!id && !title) return null;
    const raised = parseRegisterDate(r[col('date raised', 1)], opts);
    const decided = parseRegisterDate(r[col('decision date', 14)], opts);
    const implemented = parseRegisterDate(r[col('actual implementation date', 17)], opts);
    const closed = parseRegisterDate(r[col('closure date', 19)], opts);
    return {
      sheetRow,
      id: id.replace(/\.0$/, ''),
      raised, decided, implemented, closed,
      requester: r[col('change requester', 2)],
      project: r[col('project', 3)],
      model: r[col('vehicle model', 4)],
      title,
      description: r[col('change description', 6)],
      category: r[col('change category', 7)],
      type: r[col('change type', 8)],
      scope: r[col('scope', 9)],
      risk: r[col('risk level', 10)],
      owner: r[col('change owner', 11)],
      decision: r[col('approval decision', 13)],
      status: r[col('status', 18)],
    };
  });
}

// An ECR's implementation date: the Actual Implementation Date, or the Closure
// Date for a change closed without one being recorded.
const ecrImplementedIso = e => e.implemented.iso || e.closed.iso;

export function summarizeEcr(rows, range) {
  const raised = rows.filter(e => inRange(e.raised.iso, range));
  const implemented = rows.filter(e => inRange(ecrImplementedIso(e), range));
  const inPeriod = rows.filter(e => inRange(e.raised.iso, range) || inRange(ecrImplementedIso(e), range));
  const byDecision = {};
  inPeriod.forEach(e => {
    const k = e.decision || 'No decision yet';
    byDecision[k] = (byDecision[k] || 0) + 1;
  });
  return {
    rows: inPeriod.map(e => ({
      ...e,
      raisedInPeriod: inRange(e.raised.iso, range),
      implementedInPeriod: inRange(ecrImplementedIso(e), range),
    })),
    raisedCount: raised.length,
    implementedCount: implemented.length,
    total: inPeriod.length,
    byDecision,
    flagged: flaggedRows(rows, e => [['Date Raised', e.raised], ['Decision Date', e.decided],
      ['Actual Implementation Date', e.implemented], ['Closure Date', e.closed]], e => e.id || e.title),
  };
}

// ── Production Incident Register ────────────────────────────────────────
// Header row starts "Incident No | Date | Time | Location | …" (the No cell
// carries a line break inside the sheet).
export const SEVERITIES = ['Catastrophic', 'Major', 'Moderate', 'Minor'];

export function parseIncidentRegister(grid, opts = {}) {
  return readTable(grid, r => /^incident\s*no/i.test(String(r[0] || '').trim()), (r, col, sheetRow) => {
    const no = r[col('incident no', 0)];
    const description = r[col('description', 7)];
    if (!no && !description) return null;
    return {
      sheetRow,
      no: no.replace(/\.0$/, ''),
      date: parseRegisterDate(r[col('date', 1)], opts),
      time: r[col('time', 2)],
      location: r[col('location', 3)],
      involves: r[col('involves', 4)],
      classification: r[col('classification', 5)],
      severity: r[col('severity', 6)],
      description,
      causes: r[col('possible causes', 8)],
      actions: r[col('immediate actions', 9)],
      effect: r[col('effect on process', 10)],
      recommendations: r[col('recommendations', 11)],
      reportedBy: r[col('reported by', 13)],
    };
  });
}

export function summarizeIncidents(rows, range) {
  const inPeriod = rows.filter(x => inRange(x.date.iso, range));
  const bySeverity = Object.fromEntries(SEVERITIES.map(s => [s, 0]));
  inPeriod.forEach(x => {
    const s = SEVERITIES.find(v => v.toLowerCase() === x.severity.toLowerCase()) || 'Other';
    bySeverity[s] = (bySeverity[s] || 0) + 1;
  });
  return {
    rows: inPeriod,
    total: inPeriod.length,
    bySeverity,
    flagged: flaggedRows(rows, x => [['Date', x.date]], x => `#${x.no}`),
  };
}

// ── Kaizen / Improvement Ideas ──────────────────────────────────────────
// Date | Kaizen Idea | Workshop | Proposed By | Status | Impact | Notes. This
// sheet has always been written dd-Mmm-yyyy, so only dates that can't be
// placed (a bare "2026") or lie in the future are flagged, not the style.
export function parseKaizenRegister(grid, opts = {}) {
  return readTable(grid, r => /kaizen idea/i.test(r[1] || ''), (r, col, sheetRow) => {
    const idea = r[col('kaizen idea', 1)];
    if (!idea) return null;
    return {
      sheetRow,
      date: parseRegisterDate(r[col('date', 0)], { ...opts, strict: false }),
      idea,
      workshop: r[col('workshop', 2)],
      proposedBy: r[col('proposed by', 3)],
      status: r[col('status', 4)],
      impact: r[col('impact', 5)],
      notes: r[col('notes', 6)],
    };
  });
}

export function summarizeKaizen(rows, range) {
  const inPeriod = rows.filter(k => inRange(k.date.iso, range))
    // not-yet-implemented first: that is what needs attention
    .sort((a, b) => (/^implemented$/i.test(a.status) ? 1 : 0) - (/^implemented$/i.test(b.status) ? 1 : 0)
      || (a.date.iso < b.date.iso ? -1 : 1));
  const implemented = inPeriod.filter(k => /^implemented$/i.test(k.status)).length;
  return {
    rows: inPeriod,
    total: inPeriod.length,
    implemented,
    open: inPeriod.length - implemented,
    flagged: flaggedRows(rows, k => [['Date', k.date]], k => k.idea),
  };
}

function flaggedRows(rows, datesOf, nameOf) {
  const out = [];
  rows.forEach(r => datesOf(r).forEach(([field, d]) => {
    if (d.flag) out.push({ name: nameOf(r), sheetRow: r.sheetRow, field, raw: d.raw, flag: d.flag, reason: FLAG_TEXT[d.flag] });
  }));
  return out;
}
