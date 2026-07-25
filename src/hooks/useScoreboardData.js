import { useState, useEffect, useCallback } from 'react';

// DPN Scoreboard — reads the REAL "KMC_Department_Monthly_Scoreboard" workbook
// (separate from NI Travel Tool Data), which is a Tracker-GRID workbook (one
// row per bus × workshop Plan/Actual/Status/Delay columns), not the
// label/value Calc+Targets format this hook originally expected. Rewritten
// 2026-07-25 to derive every metric Scoreboard.jsx needs directly from that
// grid plus the sheet's SUGGESTION/Breakdown/Cost tabs. Requires the sheet to
// be shared "Anyone with the link can view".
const SHEET_ID = '1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs';
const TAB_URL = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
const REFRESH_INTERVAL = 5 * 60 * 1000;
const TOTAL_UNITS = 45;

// Quote-aware CSV → array of string arrays
function parseGrid(text) {
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

// The Tracker tab's dates have no year ("20-May") — the workbook is scoped
// to the current programme year, so we assume THIS year throughout.
function parseTrackerDate(v) {
  if (!v) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})$/.exec(v.trim());
  if (m) {
    const mi = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
    if (mi !== -1) return new Date(new Date().getFullYear(), mi, Number(m[1]));
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dateKey(d) { return d.toISOString().slice(0, 10); }
function dailyLabel(d) { return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }

// ── Tracker tab: one row per bus, 6 columns per workshop
// (Plan Start, Plan End, Actual Start, Actual End, Status, Delay), 7 workshops
// starting at column 4. Column layout verified directly against the live
// sheet on 2026-07-25 — if workshops are ever added/removed/reordered in the
// sheet, this list needs updating to match.
const WORKSHOP_COLS = [
  { name: 'Machine Shop',            base: 4 },
  { name: 'Frame & Body Parts',      base: 10 },
  { name: 'Chassis Line 01',         base: 16 },
  { name: 'Frame & Body Welding',    base: 22 },
  { name: 'Paint Shop',              base: 28 },
  { name: 'Chassis Line 02',         base: 34 },
  { name: 'Trim & Final Assembly',   base: 40 },
];

function parseTrackerGrid(grid) {
  const rows = grid.slice(1).filter(r => r[1]); // has a VIN

  const workshops = WORKSHOP_COLS.map(w => {
    let done = 0, active = 0, notStarted = 0, na = 0, delayed = false;
    rows.forEach(r => {
      const status = (r[w.base + 4] || '').trim();
      if (status === 'Done') done++;
      else if (status === 'Active') active++;
      else if (status === 'Not Started') notStarted++;
      else na++; // "N/A" or blank
      const delayNum = parseFloat((r[w.base + 5] || '').replace('+', ''));
      if (!Number.isNaN(delayNum) && delayNum > 0 && status !== 'Done') delayed = true;
    });
    const target = TOTAL_UNITS - na;
    return {
      name: w.name, done, active, notStarted, na, due: target,
      pct: target ? done / target : 0,
      status: delayed ? 'DELAYED' : 'ON TRACK',
      constraint: 'None',
    };
  });

  // "Completed" = finished the last workshop (Trim & Final Assembly).
  const trim = WORKSHOP_COLS[WORKSHOP_COLS.length - 1];
  const planByDate = new Map(), actByDate = new Map();
  rows.forEach(r => {
    const planEnd = parseTrackerDate(r[trim.base + 1]);
    const actEnd = parseTrackerDate(r[trim.base + 3]);
    if (planEnd) planByDate.set(dateKey(planEnd), (planByDate.get(dateKey(planEnd)) || 0) + 1);
    if (actEnd) actByDate.set(dateKey(actEnd), (actByDate.get(dateKey(actEnd)) || 0) + 1);
  });
  const allKeys = [...new Set([...planByDate.keys(), ...actByDate.keys()])].sort();
  let cumPlan = 0, cumAct = 0;
  const daily = allKeys.map(k => {
    const planned = planByDate.get(k) || 0;
    const hasActual = actByDate.has(k);
    cumPlan += planned;
    if (hasActual) cumAct += actByDate.get(k);
    return {
      date: dailyLabel(new Date(k)), planned, actual: hasActual ? actByDate.get(k) : null,
      cumPlan, cumAct: cumAct || null, gap: cumAct - cumPlan,
    };
  });

  const totalDone = workshops[workshops.length - 1].done;
  const activeUnits = rows.filter(r => WORKSHOP_COLS.some(w => (r[w.base + 4] || '').trim() === 'Active')).length;

  return { workshops, daily, totalDone, activeUnits, unitCount: rows.length };
}

// ── SUGGESTION tab (SN | NAME) → Kaizen register rows, shaped to match
// what Scoreboard.jsx's Kaizen MiniTable reads: [_, idea, workshop, by, status, impact]
function parseSuggestions(grid) {
  return grid
    .filter(r => r[1] && r[1].trim() && !/^name$/i.test(r[1].trim()))
    .map(r => ['', r[1].trim(), '', '', 'Proposed', '']);
}

// ── Breakdown tab: M1-M7 reason codes (minutes) + a single current snapshot
// (not a monthly trend — the sheet only tracks "the latest breakdown").
const DT_REASONS = ['M1 - Machine breakdown', 'M2 - Material shortage', 'M3 - Power/Energy',
  'M4 - Tooling/jig failure', 'M5 - Operator/skill gap', 'M6 - Quality rework stoppage', 'M7 - Other'];
function parseBreakdown(grid) {
  const kv = {};
  let totalMin = 0;
  grid.forEach(r => {
    const code = (r[0] || '').trim();
    const mIdx = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'].indexOf(code);
    if (mIdx > -1) {
      const min = toNum(r[2]) || 0;
      kv[DT_REASONS[mIdx]] = { raw: String(min / 60), num: min / 60 };
      totalMin += min;
    }
  });
  kv['Unplanned Downtime (hrs)'] = { raw: String(totalMin / 60), num: totalMin / 60 };
  kv['Total Hours Lost'] = { raw: String(totalMin / 60), num: totalMin / 60 };
  return kv;
}

// ── Cost tab: repeating period blocks of category rows (Labour/Material/
// Energy...). Future periods sit in the sheet pre-filled with budget only
// (actuals still zero) — so instead of blindly taking the last block, use
// the most recent period that actually has non-zero actuals logged.
function parseCost(grid) {
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
  let budget = 0, actual = 0;
  periodRows.forEach(r => {
    budget += toNum(r[3]) || 0;
    actual += toNum(r[4]) || 0;
  });
  const variance = actual - budget;
  const [periodStart, periodEnd] = chosenKey.split('|');
  const kv = {
    'Budget Total': { raw: String(budget), num: budget },
    'Actual Total': { raw: String(actual), num: actual },
    'Variance': { raw: String(variance), num: variance },
    'Variance %': { raw: '', num: budget ? variance / budget : null },
    'Scoreboard Period Start': { raw: periodStart, num: null },
    'Scoreboard Period End': { raw: periodEnd, num: null },
  };
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

export function useScoreboardData() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [trackerGrid, suggestionGrid, breakdownGrid, costGrid] = await Promise.all([
        fetchTab('Tracker'), fetchTab('SUGGESTION'), fetchTab('Breakdown'), fetchTab('Cost'),
      ]);
      const tracker = parseTrackerGrid(trackerGrid);
      const kaizen = parseSuggestions(suggestionGrid);
      const breakdownKv = parseBreakdown(breakdownGrid);
      const costKv = parseCost(costGrid);

      const achievement = TOTAL_UNITS ? tracker.totalDone / TOTAL_UNITS : 0;

      setData({
        kv: {
          'Program Target (vehicles)': { raw: String(TOTAL_UNITS), num: TOTAL_UNITS },
          'Completed': { raw: String(tracker.totalDone), num: tracker.totalDone },
          'In Production': { raw: String(tracker.activeUnits), num: tracker.activeUnits },
          'Achievement %': { raw: '', num: achievement },
          ...breakdownKv,
          ...costKv,
        },
        workshops: tracker.workshops,
        daily: tracker.daily,
        bottlenecks: [],   // no data source in this sheet
        kaizen,
        ecr: [],           // no data source in this sheet
        waste: [],         // no data source in this sheet
        fpyTrend: [],       // no Quality register in this sheet
        downtimeTrend: [],  // Breakdown tab is a single snapshot, not a trend
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
