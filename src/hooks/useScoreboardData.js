import { useState, useEffect, useCallback } from 'react';
import { STATIONS } from '../data/stations.js';

// DPN Scoreboard — reads the REAL "KMC_Department_Monthly_Scoreboard" workbook,
// which as of 2026-07-27 is the full IMS-objectives master workbook (README /
// Dashboard / Targets / Tracker / Daily Output / Downtime / Bottlenecks /
// Quality / Safety / Environment / ECR / Cost / Waste / Kaizen / Calc), plus
// our own "Cost Inputs" tab. The Calc tab is a pre-computed label/value +
// workshop-status dump driven by spreadsheet formulas — most KPIs are just a
// lookup into it, not something this hook needs to derive itself. Requires
// the sheet to be shared "Anyone with the link can view".
const SHEET_ID = '1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs';
const TAB_URL = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
// Cross-sheet read: Travel Card headcount (operators/submissions tabs) feeds
// Labour Cost — a person only "costs" once they've actually clocked a station
// on the Travel Card, on the real production sheet, not this one.
const TRAVEL_SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const TRAVEL_TAB_URL = (tab) =>
  `https://docs.google.com/spreadsheets/d/${TRAVEL_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
const REFRESH_INTERVAL = 5 * 60 * 1000;

// The 4 core assembly lines the scoreboard reports per-line figures for —
// must match Scoreboard.jsx's LINE_WORKSHOPS `dataName` values, and the
// Tracker/Calc tabs' own workshop names, exactly.
const LINE_WORKSHOP_NAMES = ['Frame & Body Welding', 'Chassis Production Line 02', 'Paint Shop', 'Trim & Final Assembly'];
// data/stations.js LINES id -> the Tracker workshop name it corresponds to,
// for attributing Travel Card labour hours to one of the 4 reported lines.
const LINE_ID_TO_WORKSHOP = {
  FRAME: 'Frame & Body Welding', CHASSIS2: 'Chassis Production Line 02',
  PAINT: 'Paint Shop', TRIM: 'Trim & Final Assembly',
};

// Quote-aware CSV → array of string arrays
export function parseGrid(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

// "704,000" → 704000 · "35%" → 0.35 · "(3,800)" → -3800 (accounting negative) · "" → null
export function toNum(v) {
  if (v == null || v === '' || v === '—' || v === '-') return null;
  const s = String(v).trim();
  const negative = /^\(.*\)$/.test(s);
  const pct = /%\s*$/.test(s);
  const n = parseFloat(s.replace(/^\(|\)$/g, '').replace(/[, ]/g, '').replace('%', ''));
  if (Number.isNaN(n)) return null;
  const signed = negative ? -Math.abs(n) : n;
  return pct ? signed / 100 : signed;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Several tabs carry the sheet's own one-line instruction banner in the SAME
// cell as the first column heading, so cell A of the header row reads
// "PRODUCTION DOWNTIME LOG — one row per event (…) Date" rather than "Date".
// Other tabs put the banner on its own row above a clean header. Matching the
// end of the cell handles both shapes; an exact `=== 'Date'` test silently
// failed to find the header on Downtime, Environment, Kaizen and Daily Output,
// which made those tabs read as empty even when they had rows.
function headerCellIs(cell, label) {
  const s = String(cell || '').trim().toLowerCase();
  const l = String(label).trim().toLowerCase();
  return s === l || s.endsWith(` ${l}`);
}

// The Tracker tab's per-workshop dates have no year ("20-May") — the workbook
// is scoped to the current programme year — but most other date cells here
// (Targets, Downtime, Daily Output, registers) are full dates; this also
// falls back to plain Date parsing for those.
export function parseTrackerDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  const short = /^(\d{1,2})-([A-Za-z]{3})$/.exec(s);
  if (short) {
    const mi = MONTHS.findIndex(x => x.toLowerCase() === short[2].toLowerCase());
    if (mi !== -1) return new Date(new Date().getFullYear(), mi, Number(short[1]));
  }
  const native = new Date(s);
  if (!Number.isNaN(native.getTime())) return native;
  // Fallback: DD/MM/YYYY typed as text (native Date() assumes MM/DD and
  // silently fails whenever day > 12 — e.g. a hand-typed "25/06/2026" in a
  // register row, vs. a real Excel date value in the row above/below it).
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
function dailyLabel(d) { return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function shortDate(d) { return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function monthLabel(d) { return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`; }
function monthKey(d) { return `${d.getFullYear()}-${d.getMonth()}`; }
function sortMonthKeys(keys) {
  return [...keys].sort((a, b) => {
    const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
    return ay - by || am - bm;
  });
}

// ── Tracker tab: one row per bus, 6 columns per workshop (Plan Start, Plan
// End, Actual Start, Actual End, Status, Delay), 8 workshops starting at
// column 4 (0-indexed) — verified against the live header row on 2026-07-27.
// Only used for the per-line monthly Plan-vs-Actual breakdown now; overall
// progress/workshop-status/daily-output all come from Calc/Daily Output,
// which are formula-driven off this same tab inside the spreadsheet itself.
const WORKSHOP_COLS = [
  { name: 'Machine Shop', base: 4 },
  { name: 'Frame & Body Parts Making', base: 10 },
  { name: 'Chassis Production Line 01', base: 16 },
  { name: 'Frame & Body Welding', base: 22 },
  { name: 'Paint Shop', base: 28 },
  { name: 'Chassis Production Line 02', base: 34 },
  { name: 'Trim & Final Assembly', base: 40 },
  { name: 'Quality Inspection & Testing', base: 46 },
];

// ── Per-line monthly Plan vs Actual, for the 4 reported lines — bucketed by
// calendar month per-line (Calc/Daily Output only give current totals, not
// a monthly-history breakdown, so this still needs the raw Tracker grid).
export function parseLineMonthly(grid) {
  const rows = grid.slice(1).filter(r => r[1]);
  const relevantCols = WORKSHOP_COLS.filter(w => LINE_WORKSHOP_NAMES.includes(w.name));

  const labelByKey = new Map();
  const perLine = {};
  relevantCols.forEach(w => { perLine[w.name] = new Map(); });

  const bump = (name, date, kind) => {
    const key = monthKey(date);
    if (!labelByKey.has(key)) labelByKey.set(key, monthLabel(date));
    const m = perLine[name];
    if (!m.has(key)) m.set(key, { planned: 0, actual: 0, hasActual: false });
    const entry = m.get(key);
    if (kind === 'plan') entry.planned += 1;
    else { entry.actual += 1; entry.hasActual = true; }
  };

  rows.forEach(r => {
    relevantCols.forEach(w => {
      const planEnd = parseTrackerDate(r[w.base + 1]);
      const actEnd = parseTrackerDate(r[w.base + 3]);
      if (planEnd) bump(w.name, planEnd, 'plan');
      if (actEnd) bump(w.name, actEnd, 'actual');
    });
  });

  const sortedKeys = sortMonthKeys(labelByKey.keys());
  const byLine = {};
  relevantCols.forEach(w => {
    byLine[w.name] = sortedKeys.map(k => {
      const e = perLine[w.name].get(k);
      return { label: labelByKey.get(k), planned: e?.planned || 0, actual: e?.hasActual ? e.actual : null };
    });
  });

  return { byLine, overallMonthly: byLine['Trim & Final Assembly'] || [] };
}

// ── Per-line cumulative completion, straight from the Tracker grid — used
// instead of the Calc tab's own workshop-status table for the 4 reported
// lines' "done / applicable" cards. Calc's per-workshop rows for these 4
// lines can drift out of sync with the sheet's own formulas (seen live:
// Calc showed 0/45 for all four while the sheet's own overall Achievement %
// was 56%), so this recomputes "how many buses are Done" directly from the
// same raw grid the per-line monthly chart already trusts. `done`/`target`
// are cumulative (program-to-date, not period-sliced) — the default when no
// manual target is set for a line. `tasks` carries each unit's dates so the
// UI can re-slice to whatever range is selected (see Scoreboard.jsx's
// lineWorkshops) and can sum Planned vs Actual for the scheduled period.
export function parseLineCompletion(grid) {
  const rows = grid.slice(1).filter(r => r[1]);
  const relevantCols = WORKSHOP_COLS.filter(w => LINE_WORKSHOP_NAMES.includes(w.name));
  const out = {};
  relevantCols.forEach(w => { out[w.name] = { done: 0, target: 0, totalUnits: rows.length, tasks: [] }; });
  // Local date parts, NOT toISOString() — the tracker's dates are calendar
  // days with no timezone, and toISOString() converts to UTC, which shifts
  // every date back a day in any UTC+ zone (Kampala is UTC+3), silently
  // putting units in the wrong period at range boundaries.
  const iso = d => d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : null;
  rows.forEach(r => {
    relevantCols.forEach(w => {
      const status = (r[w.base + 4] || '').trim().toLowerCase();
      const planStart = r[w.base], planEnd = r[w.base + 1];
      // No status and no plan dates at all = this workshop doesn't apply to
      // this unit (e.g. a bus model that skips a line) — don't count it.
      if (!status && !planStart && !planEnd) return;
      if (/^n\/?a$/.test(status) || status.includes('not applicable')) return;
      const entry = out[w.name];
      entry.target += 1;
      const done = status.includes('done') || status.includes('complete');
      if (done) entry.done += 1;
      entry.tasks.push({
        planStart: iso(parseTrackerDate(planStart)),
        planEnd: iso(parseTrackerDate(planEnd)),
        // actualStart as well as actualEnd: a unit still on the line has an
        // actual start and no end, and the range cards have to be able to see
        // that it was worked on inside the selected period (see
        // Scoreboard.jsx's lineWorkshops cohort).
        actualStart: iso(parseTrackerDate(r[w.base + 2])),
        actualEnd: iso(parseTrackerDate(r[w.base + 3])),
        done,
      });
    });
  });
  return out;
}

// Two ISO-date windows overlap? Blank ends read as open (−∞ / +∞).
export const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  !!aStart && !!aEnd && aStart <= (bEnd || '9999-12-31') && aEnd >= (bStart || '0000-01-01');

// ── One Production Line Status card, scoped to the selected date range.
//
// `comp` is a parseLineCompletion entry (`{ done, target, tasks }`), `calcRow`
// the matching Calc workshop row (or undefined), `range` `{ start, end }` ISO
// strings, `overrideTarget` the manual per-line target from the ⚙ panel (0 or
// NaN = auto).
//
// Cohort = every unit this line actually had ON it during the range: one the
// line was SCHEDULED for (plan window overlaps the range) OR one it actually
// WORKED ON in the range (actual window overlaps — a unit still on the line
// has an actual start and no end yet, so it counts from its start onward).
// The plan half alone is not enough: the Tracker's plan schedule ends mid-Jul
// while the lines keep running, so from August on "plan window overlaps the
// range" matches nothing and every card reads 0 / 0 · 0% — which is exactly
// why a bus completed on 7 Sep never showed up when the board was filtered to
// September. `done` is counted from that same cohort and only when the unit's
// Actual End falls inside the range, so a bus finished in June can't re-count
// against September and the card can't exceed 100%.
export function computeLineCard(comp, calcRow, range, overrideTarget) {
  const tasks = (comp && comp.tasks) || [];
  const inRange = t =>
    rangesOverlap(t.planStart, t.planEnd, range.start, range.end) ||
    rangesOverlap(t.actualStart, t.actualEnd || range.end, range.start, range.end);
  const cohort = tasks.length > 0 ? tasks.filter(inRange) : null;
  const doneInRange = t => t.done && (!t.actualEnd
    || (t.actualEnd >= range.start && t.actualEnd <= range.end));
  const done = cohort ? cohort.filter(doneInRange).length : (comp ? comp.done : 0);
  const plannedInRange = cohort ? cohort.length : (comp ? comp.target : 0);
  const ovr = Number(overrideTarget);
  const target = ovr > 0 ? ovr : plannedInRange;
  const pct = target ? done / target : 0;
  // Status (and the donut colour) come from the SAME range-scoped figure the
  // card prints, not from Calc's program-to-date Line Status.
  const status = pct >= 0.9 ? 'ON TRACK' : pct >= 0.6 ? 'AT RISK' : 'DELAYED';
  return { done, target, pct, status, constraint: (calcRow && calcRow.constraint) || '—' };
}

// ── Tracker tab → one record per bus, for the Production Report's "buses
// produced" table. Columns 0-3 are the unit's identity (row no. | Full VIN |
// Unit | Batch) and the last three are roll-ups the sheet computes itself
// (Max Delay | Bus Status | Cycle (d)); the trailing three are located by
// header name rather than a fixed index because the workshop block in
// between is what tends to grow. `completedOn` is the LAST actual end across
// all 8 workshops — the date the bus actually rolled off, which no single
// column holds. `ws` carries the plan/actual window per reported line, which
// is what the monthly Production Process Time Analysis report measures
// working days from (Annex A and every process-time table are built off it).
export function parseBusUnits(grid) {
  if (!grid.length) return [];
  const header = grid[0].map(h => (h || '').trim().toLowerCase());
  const col = (re, fallback) => {
    const i = header.findIndex(h => re.test(h));
    return i === -1 ? fallback : i;
  };
  const idxVin = col(/^full vin$/, 1);
  const idxUnit = col(/^unit$/, 2);
  const idxBatch = col(/^batch$/, 3);
  const idxStatus = col(/^bus status$/, 54);
  const idxCycle = col(/^cycle/, 55);
  const idxDelay = col(/^max delay/, 53);
  const iso = d => d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : null;

  return grid.slice(1).filter(r => r[idxVin] || r[idxUnit]).map((r, i) => {
    let last = null;
    WORKSHOP_COLS.forEach(w => {
      const d = parseTrackerDate(r[w.base + 3]);
      if (d && (!last || d > last)) last = d;
    });
    const ws = {};
    WORKSHOP_COLS.filter(w => LINE_WORKSHOP_NAMES.includes(w.name)).forEach(w => {
      ws[w.name] = {
        planStart: iso(parseTrackerDate(r[w.base])),
        planEnd: iso(parseTrackerDate(r[w.base + 1])),
        actualStart: iso(parseTrackerDate(r[w.base + 2])),
        actualEnd: iso(parseTrackerDate(r[w.base + 3])),
        status: (r[w.base + 4] || '').trim(),
      };
    });
    const status = (r[idxStatus] || '').trim();
    return {
      no: toNum(r[0]) ?? i + 1,
      vin: (r[idxVin] || '').trim(),
      unit: (r[idxUnit] || '').trim(),
      batch: (r[idxBatch] || '').trim(),
      status,
      done: /done|complete/i.test(status),
      cycleDays: toNum(r[idxCycle]),
      maxDelay: toNum(r[idxDelay]),
      completedOn: iso(last),
      completedLabel: last ? shortDate(last) : '',
      ws,
    };
  });
}

// ── Calc tab: pre-computed by the spreadsheet itself — a workshop-status
// table (rows) followed by a flat label/value KPI dump (one pair per row,
// grouped under blank-valued section headers like "OVERALL / OBJECTIVE 1").
// Reading this directly means Scoreboard.jsx's KPI cards are a straight
// lookup, not something re-derived here.
export function parseCalc(grid) {
  const kv = {};
  const workshops = [];
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    const c0 = (row[0] || '').trim();
    // `headerCellIs`, not `=== 'Workshop'`: gviz folds the tab's leading
    // instruction banner into the SAME cell as the first column heading, so
    // cell A of Calc's header row arrives as "CALCULATION ENGINE — feeds
    // Dashboard + web scoreboard. Do not edit. Workshop". The exact test
    // silently matched nothing, so `workshops` came back empty and every
    // line card fell back to a pct-guessed status with a "—" constraint.
    if (headerCellIs(c0, 'Workshop') && (row[1] || '').trim() === 'Done') {
      // Stop on the first row that isn't shaped like a workshop row —
      // name + numeric "Due by Today" + a Line Status. The blank spacer row
      // the sheet puts between this table and the KPI dump below it is NOT
      // available to lean on: gviz omits fully-empty rows entirely, so
      // "keep going while column A is non-empty" ran straight through the
      // whole KPI dump and left `kv` empty.
      const isWorkshopRow = r =>
        (r[0] || '').trim() && toNum(r[5]) != null && (r[7] || '').trim();
      let j = i + 1;
      while (j < grid.length && isWorkshopRow(grid[j])) {
        const r = grid[j];
        workshops.push({
          name: r[0].trim(),
          done: toNum(r[1]) || 0, active: toNum(r[2]) || 0,
          notStarted: toNum(r[3]) || 0, na: toNum(r[4]) || 0,
          due: toNum(r[5]) || 0, pct: toNum(r[6]) || 0,
          status: (r[7] || '').trim(), constraint: (r[8] || '').trim() || 'None',
        });
        j++;
      }
      i = j - 1;
      continue;
    }
    if (c0 && row[1] != null && String(row[1]).trim() !== '') {
      kv[c0] = { raw: String(row[1]), num: toNum(row[1]) };
    }
  }
  // gviz types each column from its majority value and returns anything that
  // doesn't match as blank. Calc's value column is overwhelmingly numeric, so
  // the one text KPI in it — "Critical Activity", the worst-performing
  // workshop — arrives empty and the board printed "—" for it. It is a pure
  // function of the workshop table above (the sheet's own formula is
  // INDEX(A4:A11, MATCH(MIN(rank), rank))), so recover it here rather than
  // depending on a value gviz will never hand over.
  if (!kv['Critical Activity'] && workshops.length) {
    const ranked = workshops.filter(w => w.due > 0);
    const pool = ranked.length ? ranked : workshops;
    const worst = pool.reduce((a, b) => (b.pct < a.pct ? b : a));
    if (worst) kv['Critical Activity'] = { raw: worst.name, num: null };
  }
  return { kv, workshops };
}

// ── Targets tab: label/value pairs (Scoreboard Period, Program info, shift
// hours, baselines, "Target: X" rows) — same flat-lookup shape as Calc.
export function parseTargetsKv(grid) {
  const kv = {};
  for (const row of grid) {
    const label = (row[0] || '').trim();
    // Column C is the sheet's text-mirror column, and it is not decoration:
    // gviz types a column from its majority value and returns anything else
    // blank, so the text settings sitting in the otherwise-numeric column B
    // (Program / Project Name, Shift Label) never arrive at all — the board
    // was falling back to a hard-coded "DAY SHIFT". Column C carries only
    // text, so it types as text and comes through; read it when B is empty.
    const value = row[1] != null && String(row[1]).trim() !== '' ? row[1] : row[2];
    if (!label || value == null || String(value).trim() === '') continue;
    kv[label] = { raw: String(value), num: toNum(value) };
  }
  return kv;
}

// ── Daily Output tab: fully formula-driven in the sheet — Date | Planned |
// Actual | Cum. Plan | Cum. Act. | Gap. Read directly rather than re-derived
// from the Tracker grid.
export function parseDailyOutput(grid) {
  const hIdx = grid.findIndex(r => headerCellIs(r[0], 'Date') && (r[1] || '').trim() === 'Planned');
  if (hIdx === -1) return [];
  const out = [];
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r[0] || !r[0].trim()) continue;
    const d = parseTrackerDate(r[0]);
    if (!d) continue;
    const actual = r[2] !== undefined && r[2] !== '' ? toNum(r[2]) : null;
    const cumAct = r[4] !== undefined && r[4] !== '' ? toNum(r[4]) : null;
    out.push({
      date: dailyLabel(d), dateObj: d, planned: toNum(r[1]) || 0, actual,
      cumPlan: toNum(r[3]) || 0, cumAct, gap: toNum(r[5]),
    });
  }
  return out;
}

// ── Downtime tab: one row per breakdown event (Date | Workshop | Equipment |
// Reason Code | Downtime (min) | Description | Reported By) — the period
// M1-M7 totals come from Calc, but this drives the monthly downtime-hours
// trend chart, which needs the full dated history Calc doesn't keep.
export function parseDowntimeMonthly(grid) {
  const hIdx = grid.findIndex(r => headerCellIs(r[0], 'Date') && /reason/i.test(r[3] || ''));
  if (hIdx === -1) return [];
  const byMonth = new Map();
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r[0] || !r[0].trim()) continue;
    const d = parseTrackerDate(r[0]);
    const mins = toNum(r[4]);
    if (!d || mins == null) continue;
    const key = monthKey(d);
    if (!byMonth.has(key)) byMonth.set(key, { label: monthLabel(d), value: 0 });
    byMonth.get(key).value += mins / 60;
  }
  return sortMonthKeys(byMonth.keys()).map(k => ({
    label: byMonth.get(k).label, value: Math.round(byMonth.get(k).value * 100) / 100,
  }));
}

// ── Quality tab: one row per vehicle inspection (Date | Unit | First
// Inspection Result | ...). "Pass" in the result column counts toward First
// Pass Yield; bucketed by month for the FPY trend chart. Assumes the result
// column contains something matching /pass/i for a first-time pass — no real
// rows exist yet to confirm the exact dropdown wording, so this degrades
// gracefully (empty trend) rather than guessing wrong silently.
export function parseQualityMonthly(grid) {
  const hIdx = grid.findIndex(r => headerCellIs(r[0], 'Date') && /inspection result/i.test(r[2] || ''));
  if (hIdx === -1) return [];
  const byMonth = new Map();
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r[0] || !r[0].trim()) continue;
    const d = parseTrackerDate(r[0]);
    const result = (r[2] || '').trim();
    if (!d || !result) continue;
    const key = monthKey(d);
    if (!byMonth.has(key)) byMonth.set(key, { label: monthLabel(d), passed: 0, total: 0 });
    const e = byMonth.get(key);
    e.total += 1;
    if (/pass/i.test(result)) e.passed += 1;
  }
  return sortMonthKeys(byMonth.keys()).map(k => {
    const e = byMonth.get(k);
    return { label: e.label, value: e.total ? e.passed / e.total : 0 };
  });
}

// ── Environment tab: one row per month (Month Start | Energy Used (kWh) |
// ...) — returns the most recently dated row's kWh figure, for Energy Cost.
// Energy per Unit / vs Baseline are already computed by Calc from this same
// tab; this is only for the NEW cost calculation, not those existing KPIs.
export function parseEnvironmentLatestKwh(grid) {
  const hIdx = grid.findIndex(r => headerCellIs(r[0], 'Month Start'));
  if (hIdx === -1) return 0;
  let latestDate = null, latestKwh = 0;
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r[0] || !r[0].trim()) continue;
    const d = parseTrackerDate(r[0]);
    const kwh = toNum(r[1]);
    if (d && kwh != null && (!latestDate || d > latestDate)) { latestDate = d; latestKwh = kwh; }
  }
  return latestKwh;
}

// ── Generic register reader for Bottlenecks / ECR / Waste / Kaizen — finds
// the header row, then reads every row with a non-empty first column,
// formatting it as a date if it parses as one. Returns array-of-arrays in
// the sheet's own column order, which is what Scoreboard.jsx's MiniTable
// row-slicing already expects.
export function parseRegisterRows(grid, isHeaderRow) {
  const hIdx = grid.findIndex(isHeaderRow);
  if (hIdx === -1) return [];
  const rows = [];
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r[0] || !r[0].trim()) continue;
    const d = parseTrackerDate(r[0]);
    rows.push(d ? [shortDate(d), ...r.slice(1)] : r);
  }
  return rows;
}

// ── Cost tab: repeating period blocks of category rows (Labour/Material/
// Energy...). Calc already re-exposes Budget/Actual/Variance for the current
// period, but not the Labour-specific actual — kept here as the fallback
// source for Labour Cost when Travel Card data + a rate aren't available yet.
export function parseCost(grid) {
  const rows = grid.filter(r => r[3] !== undefined && toNum(r[3]) != null && r[2] && !/cost category/i.test(r[2]));
  if (!rows.length) return {};
  const periodKeys = [];
  const byPeriod = new Map();
  rows.forEach(r => {
    const key = `${r[0]}|${r[1]}`;
    if (!byPeriod.has(key)) { byPeriod.set(key, []); periodKeys.push(key); }
    byPeriod.get(key).push(r);
  });
  let chosenKey = periodKeys[periodKeys.length - 1];
  for (let i = periodKeys.length - 1; i >= 0; i--) {
    const total = byPeriod.get(periodKeys[i]).reduce((s, r) => s + (toNum(r[4]) || 0), 0);
    if (total > 0) { chosenKey = periodKeys[i]; break; }
  }
  const periodRows = byPeriod.get(chosenKey);
  const kv = {};
  const labour = periodRows.find(r => /labour/i.test(r[2]));
  if (labour) {
    const v = toNum(labour[4]);
    if (v != null) kv['Labour Cost'] = { raw: String(v), num: v };
  }
  return kv;
}

async function fetchTab(tab) {
  const res = await fetch(TAB_URL(tab));
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith('<')) {
    throw new Error(`Tab "${tab}" is not readable — is the scoreboard sheet shared as "Anyone with the link can view"?`);
  }
  return parseGrid(text);
}

// Same as fetchTab, but for tabs that might not exist yet on the live sheet
// (Cost Inputs) and the Travel Card's own sheet — returns an empty grid
// instead of throwing, so a missing tab degrades to "no data" rather than
// breaking the whole scoreboard.
async function fetchTabSoft(urlFn, tab) {
  try {
    const res = await fetch(urlFn(tab));
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith('<')) return [];
    return parseGrid(text);
  } catch {
    return [];
  }
}

function headerIndex(grid, name) {
  if (!grid.length) return -1;
  return grid[0].findIndex(h => h.trim().toLowerCase() === name);
}

// ── Machine Cost Database (main sheet, cross-sheet like operators/
// submissions): machines + time-bounded rate history for machines/staff/
// energy. Supersedes the old flat "Cost Inputs" tab (DPN Scoreboard sheet,
// no history) — a rate change here never rewrites past costing, because
// resolveRateAsOf always picks whichever entry was actually in force on a
// given date.
export function parseMachines(grid) {
  const idxId = headerIndex(grid, 'record_id');
  const idxStation = headerIndex(grid, 'station_code');
  const idxActive = headerIndex(grid, 'active');
  const idxName = headerIndex(grid, 'machine_name');
  const idxActivity = headerIndex(grid, 'activity');
  if (idxId < 0) return [];
  return grid.slice(1)
    .filter(r => r[idxId] && (idxActive < 0 || String(r[idxActive]).toUpperCase() !== 'FALSE'))
    .map(r => ({
      id: r[idxId], stationCode: idxStation >= 0 ? r[idxStation] || null : null,
      machineName: idxName >= 0 ? r[idxName] || null : null,
      activity: idxActivity >= 0 ? r[idxActivity] || null : null,
    }));
}

export function parseRateHistory(grid, rateColName) {
  const idxId = headerIndex(grid, 'record_id');
  const idxMachine = headerIndex(grid, 'machine_id');
  const idxRate = headerIndex(grid, rateColName);
  const idxFrom = headerIndex(grid, 'valid_from');
  const idxTo = headerIndex(grid, 'valid_to');
  if (idxId < 0 || idxRate < 0) return [];
  return grid.slice(1)
    .filter(r => r[idxId])
    .map(r => ({
      machineId: idxMachine >= 0 ? r[idxMachine] : null,
      rate: toNum(r[idxRate]),
      validFrom: idxFrom >= 0 ? r[idxFrom] || null : null,
      validTo: idxTo >= 0 ? r[idxTo] || null : null,
    }));
}

// Picks whichever rate row applies "as of" a date (ISO YYYY-MM-DD — matches
// the <input type=date> values the Cost Estimation UI writes) — the most
// recent entry whose valid_from is on/before that date and whose valid_to is
// either blank (open-ended) or on/after it.
export function resolveRateAsOf(rateRows, asOf, machineId = null) {
  const pool = machineId == null ? rateRows : rateRows.filter(r => r.machineId === machineId);
  const applicable = pool.filter(r =>
    r.rate != null && r.validFrom && r.validFrom <= asOf && (!r.validTo || r.validTo >= asOf)
  );
  if (!applicable.length) return null;
  applicable.sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  return applicable[applicable.length - 1].rate;
}

// ── Labour cost: cross-sheet read of the Travel Card's operators + submissions
// tabs. Each "operators" row is one staff member on duty for one submission;
// the matching "submissions" row gives how long that stint actually took
// (actual_time_min) and which station — mapped to one of the 4 reported
// lines via data/stations.js. Cost = headcount-instances × hours × hourly rate.
export function parseLabourCost(operatorsGrid, submissionsGrid, hourlyRate) {
  const empty = { totalHours: 0, totalCost: 0, byLine: {} };
  if (!operatorsGrid.length || !submissionsGrid.length) return empty;

  const sIdxId      = headerIndex(submissionsGrid, 'record_id');
  const sIdxTime    = headerIndex(submissionsGrid, 'actual_time_min');
  const sIdxStation = headerIndex(submissionsGrid, 'station_code');
  if (sIdxId < 0) return empty;

  const submissionByRecord = new Map();
  submissionsGrid.slice(1).forEach(r => {
    const id = r[sIdxId];
    if (!id) return;
    submissionByRecord.set(id, {
      hours: (sIdxTime >= 0 ? toNum(r[sIdxTime]) : null) / 60 || 0,
      stationCode: sIdxStation >= 0 ? r[sIdxStation] : null,
    });
  });

  const oIdxId      = headerIndex(operatorsGrid, 'record_id');
  const oIdxStation = headerIndex(operatorsGrid, 'station_code');
  if (oIdxId < 0) return empty;

  let totalHours = 0;
  const hoursByLine = {};
  operatorsGrid.slice(1).forEach(r => {
    const id = r[oIdxId];
    if (!id) return;
    const sub = submissionByRecord.get(id);
    const hours = sub?.hours || 0;
    if (hours <= 0) return;
    totalHours += hours;
    const stationCode = sub?.stationCode || (oIdxStation >= 0 ? r[oIdxStation] : null);
    const lineId = stationCode ? STATIONS[stationCode]?.line : null;
    const workshopName = lineId ? LINE_ID_TO_WORKSHOP[lineId] : null;
    if (workshopName) hoursByLine[workshopName] = (hoursByLine[workshopName] || 0) + hours;
  });

  const byLine = {};
  for (const name of LINE_WORKSHOP_NAMES) byLine[name] = (hoursByLine[name] || 0) * hourlyRate;

  return { totalHours, totalCost: totalHours * hourlyRate, byLine };
}

export function useScoreboardData() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        targetsGrid, trackerGrid, dailyOutputGrid, downtimeGrid, bottlenecksGrid,
        qualityGrid, environmentGrid, ecrGrid, costGrid, wasteGrid, kaizenGrid, calcGrid,
        machinesGrid, machineRatesGrid, staffRatesGrid, energyRatesGrid,
        operatorsGrid, submissionsGrid,
      ] = await Promise.all([
        fetchTab('Targets'), fetchTab('Tracker'), fetchTab('Daily Output'), fetchTab('Downtime'),
        fetchTab('Bottlenecks'), fetchTab('Quality'), fetchTab('Environment'), fetchTab('ECR'),
        fetchTab('Cost'), fetchTab('Waste'), fetchTab('Kaizen'), fetchTab('Calc'),
        // Machine Cost Database — lives on the main sheet (Cost Estimation
        // module writes here via Apps Script), soft-fetched since it may not
        // exist yet on a given deployment.
        fetchTabSoft(TRAVEL_TAB_URL, 'machines'),
        fetchTabSoft(TRAVEL_TAB_URL, 'machine_rates'),
        fetchTabSoft(TRAVEL_TAB_URL, 'staff_rates'),
        fetchTabSoft(TRAVEL_TAB_URL, 'energy_rates'),
        fetchTabSoft(TRAVEL_TAB_URL, 'operators'),
        fetchTabSoft(TRAVEL_TAB_URL, 'submissions'),
      ]);

      const targetsKv = parseTargetsKv(targetsGrid);
      const { kv: calcKv, workshops } = parseCalc(calcGrid);
      const daily = parseDailyOutput(dailyOutputGrid);
      const downtimeTrend = parseDowntimeMonthly(downtimeGrid);
      const fpyTrend = parseQualityMonthly(qualityGrid);
      const latestKwh = parseEnvironmentLatestKwh(environmentGrid);
      const bottlenecks = parseRegisterRows(bottlenecksGrid, r => headerCellIs(r[0], 'Date Raised'));
      const ecr = parseRegisterRows(ecrGrid, r => /^ecr no/i.test(String(r[0] || '').trim()) || /^description$/i.test(String(r[1] || '').trim()));
      const waste = parseRegisterRows(wasteGrid, r => headerCellIs(r[0], 'Date') && /waste type/i.test(r[1] || ''));
      const kaizen = parseRegisterRows(kaizenGrid, r => /kaizen idea/i.test(r[1] || ''));
      const costKv = parseCost(costGrid);
      const lineMonthly = parseLineMonthly(trackerGrid);
      const lineCompletion = parseLineCompletion(trackerGrid);
      const busUnits = parseBusUnits(trackerGrid);

      // ── Cost model: Labour + Energy + Machine, all from time-bounded rate
      // history (Cost Estimation module) instead of a flat un-dated value.
      // Local calendar date, not toISOString() — in Kampala (UTC+3) the UTC
      // form reads back a day early, which can resolve a rate one day out at
      // a valid_from/valid_to boundary.
      const now = new Date();
      const asOf = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const machines = parseMachines(machinesGrid);
      const machineRates = parseRateHistory(machineRatesGrid, 'rate_ugx_per_hour');
      const staffRateRows = parseRateHistory(staffRatesGrid, 'rate_ugx_per_hour');
      const energyRateRows = parseRateHistory(energyRatesGrid, 'rate_ugx_per_kwh');
      const staffHourlyRate = resolveRateAsOf(staffRateRows, asOf) || 0;
      const energyTariffRate = resolveRateAsOf(energyRateRows, asOf) || 0;
      const availableHours = calcKv['Available Hours']?.num || targetsKv['Total Available Production Hours (period)']?.num || 0;

      const labour = parseLabourCost(operatorsGrid, submissionsGrid, staffHourlyRate);

      // Machine Cost — absorption costing: rate × Available Hours for the
      // period, same hours for every machine at a station regardless of
      // which one actually ran (Travel Card only tracks station, not
      // individual machine — see Cost Estimation > Report tab's own note).
      let machineCostTotal = 0;
      const machineCostByLine = {};
      // Per-machine breakdown — the Cost Estimations Engineer's own ranking
      // (same shape as CostEstimation.jsx's Report tab), surfaced on the
      // scoreboard rather than staying CEE-module-only.
      const machineCostRows = [];
      machines.forEach(m => {
        const rate = resolveRateAsOf(machineRates, asOf, m.id);
        if (rate == null) return;
        const cost = rate * availableHours;
        machineCostTotal += cost;
        machineCostRows.push({ id: m.id, stationCode: m.stationCode, activity: m.activity, machineName: m.machineName, rate, cost });
        const lineId = m.stationCode ? STATIONS[m.stationCode]?.line : null;
        const workshopName = lineId ? LINE_ID_TO_WORKSHOP[lineId] : null;
        if (workshopName) machineCostByLine[workshopName] = (machineCostByLine[workshopName] || 0) + cost;
      });
      machineCostRows.sort((a, b) => b.cost - a.cost);
      // Same UGX '000 convention as the rest of the cost cards.
      const machineCostRowsK = machineCostRows.map(r => ({ ...r, costK: r.cost / 1000 }));

      // The Cost tab's own figures are in UGX '000 (see Cost!F3) — divide our
      // raw-UGX computations by 1000 so every cost card on the board shares
      // one unit and isn't off by 1000x next to the manually-entered ones.
      const energyCostK = (latestKwh * energyTariffRate) / 1000;
      const labourTotalK = labour.totalCost / 1000;
      const machineCostTotalK = machineCostTotal / 1000;
      const productionOperationalCostK = labourTotalK + energyCostK + machineCostTotalK;

      const costKvExtra = {
        'Labour Cost': { raw: String(labourTotalK), num: labourTotalK || costKv['Labour Cost']?.num || 0 },
        'Machine Cost': { raw: String(machineCostTotalK), num: machineCostTotalK },
        'Production Operational Cost': { raw: String(productionOperationalCostK), num: productionOperationalCostK },
        'Total Production Cost': { raw: String(productionOperationalCostK), num: productionOperationalCostK },
      };
      for (const name of LINE_WORKSHOP_NAMES) {
        const labourK = (labour.byLine[name] || 0) / 1000;
        const machineK = (machineCostByLine[name] || 0) / 1000;
        costKvExtra[`Operational Cost — ${name}`] = { raw: String(labourK + machineK), num: labourK + machineK };
      }

      setData({
        kv: {
          ...targetsKv,
          ...calcKv,
          ...costKv,
          ...costKvExtra,
        },
        workshops,
        lineCompletion,
        busUnits,
        machineCostRows: machineCostRowsK,
        daily,
        bottlenecks,
        kaizen,
        ecr,
        waste,
        fpyTrend,
        downtimeTrend,
        linePlannedVsActual: lineMonthly.byLine,    // per-line monthly Plan vs Actual, the 4 reported lines
        overallMonthly: lineMonthly.overallMonthly, // whole-program monthly Plan vs Actual (= Trim & Final Assembly)
      });
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [load]);

  return { data, loading, error, lastUpdated, refresh: load };
}
