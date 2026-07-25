import { useState, useEffect, useCallback } from 'react';
import { STATIONS } from '../data/stations';

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
// Cross-sheet read: Travel Card headcount (operators/submissions tabs) feeds
// Labour Cost — a person only "costs" once they've actually clocked a station
// on the Travel Card, on the real production sheet, not this one.
const TRAVEL_SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const TRAVEL_TAB_URL = (tab) =>
  `https://docs.google.com/spreadsheets/d/${TRAVEL_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
const REFRESH_INTERVAL = 5 * 60 * 1000;
const TOTAL_UNITS = 45;

// The 4 core assembly lines the scoreboard reports per-line figures for —
// must match Scoreboard.jsx's LINE_WORKSHOPS `dataName` values exactly.
const LINE_WORKSHOP_NAMES = ['Frame & Body Welding', 'Chassis Line 02', 'Paint Shop', 'Trim & Final Assembly'];
// data/stations.js LINES id -> the Tracker workshop name it corresponds to,
// for attributing Travel Card labour hours to one of the 4 reported lines.
const LINE_ID_TO_WORKSHOP = {
  FRAME: 'Frame & Body Welding', CHASSIS2: 'Chassis Line 02',
  PAINT: 'Paint Shop', TRIM: 'Trim & Final Assembly',
};

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
function monthLabel(d) { return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`; }

// "Apr-26" / "Apr 26" (Month-YY, as typed in Monthly Downtime Log) → Date.
// Distinct from parseTrackerDate, whose "20-May" format is day-first.
function parseMonthYear(v) {
  const m = /^([A-Za-z]{3})[\s-](\d{2,4})$/.exec(String(v).trim());
  if (!m) return null;
  const mi = MONTHS.findIndex(x => x.toLowerCase() === m[1].toLowerCase());
  if (mi === -1) return null;
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return new Date(year, mi, 1);
}

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

// Same as fetchTab, but for tabs that might not exist yet on the live sheet
// (the three new data-entry tabs) — returns an empty grid instead of
// throwing, so a not-yet-uploaded tab degrades to "no data" rather than
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

// ── Monthly Downtime Log tab: Month | Downtime Hours | Notes ───────────────
function parseMonthlyDowntimeLog(grid) {
  const rows = grid.slice(1).filter(r => r[0] && toNum(r[1]) != null);
  return rows
    .map(r => {
      const d = parseMonthYear(r[0]);
      return d ? { label: monthLabel(d), value: toNum(r[1]), sortDate: d } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.sortDate - b.sortDate)
    .map(({ label, value }) => ({ label, value }));
}

// ── Cost Inputs tab: Setting | Value | Unit | Notes ─────────────────────────
function parseCostInputs(grid) {
  const rows = grid.slice(1);
  const find = (label) => {
    const r = rows.find(r => (r[0] || '').trim().toLowerCase() === label);
    return r ? toNum(r[1]) : null;
  };
  return {
    staffHourlyRate: find('staff hourly rate') || 0,
    machineHourlyRate: find('machine hourly rate') || 0,
    energyTariffRate: find('energy tariff rate') || 0,
  };
}

// ── Weekly Meter Readings tab: Week Ending | Meter Reading (kWh) | Notes ───
// Cumulative meter readings (TX1+TX2+TX3 transformer feeds, MWh→kWh) —
// consumption is the delta between the earliest and latest logged reading,
// not a per-row figure. Cadence is weekly by convention, but the calc itself
// doesn't care how far apart the readings are.
function parseMeterReadings(grid) {
  const rows = grid.slice(1)
    .map(r => ({ date: parseTrackerDate(r[0]), kwh: toNum(r[1]) }))
    .filter(r => r.date && r.kwh != null)
    .sort((a, b) => a.date - b.date);
  if (rows.length < 2) return { totalKwh: 0, readingsCount: rows.length };
  const totalKwh = Math.max(0, rows[rows.length - 1].kwh - rows[0].kwh);
  return { totalKwh, readingsCount: rows.length };
}

// ── Labour cost: cross-sheet read of the Travel Card's operators + submissions
// tabs. Each "operators" row is one staff member on duty for one submission;
// the matching "submissions" row gives how long that stint actually took
// (actual_time_min) and which station — mapped to one of the 4 reported
// lines via data/stations.js. Cost = headcount-instances × hours × hourly rate.
function parseLabourCost(operatorsGrid, submissionsGrid, hourlyRate) {
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

// ── Per-line monthly Plan vs Actual + combined monthly output, for the 4
// reported lines — same Tracker grid as parseTrackerGrid, but bucketed by
// calendar month per-line instead of collapsed to one "completed" total.
function parseLineMonthly(grid) {
  const rows = grid.slice(1).filter(r => r[1]);
  const relevantCols = WORKSHOP_COLS.filter(w => LINE_WORKSHOP_NAMES.includes(w.name));

  const labelByKey = new Map();
  const perLine = {};
  relevantCols.forEach(w => { perLine[w.name] = new Map(); });

  const bump = (name, date, kind) => {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
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

  const sortedKeys = [...labelByKey.keys()].sort((a, b) => {
    const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
    return ay - by || am - bm;
  });

  const byLine = {};
  relevantCols.forEach(w => {
    byLine[w.name] = sortedKeys.map(k => {
      const e = perLine[w.name].get(k);
      return { label: labelByKey.get(k), planned: e?.planned || 0, actual: e?.hasActual ? e.actual : null };
    });
  });

  const combinedOutput = sortedKeys.map(k => {
    const row = { label: labelByKey.get(k) };
    relevantCols.forEach(w => { row[w.name] = perLine[w.name].get(k)?.hasActual ? perLine[w.name].get(k).actual : 0; });
    return row;
  });

  return { byLine, combinedOutput, overallMonthly: byLine['Trim & Final Assembly'] || [] };
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
        trackerGrid, suggestionGrid, breakdownGrid, costGrid,
        downtimeLogGrid, costInputsGrid, meterGrid,
        operatorsGrid, submissionsGrid,
      ] = await Promise.all([
        fetchTab('Tracker'), fetchTab('SUGGESTION'), fetchTab('Breakdown'), fetchTab('Cost'),
        // Soft-fetched: new tabs that may not exist yet on the live sheet
        // until it's re-uploaded, and the Travel Card's own sheet.
        fetchTabSoft(TAB_URL, 'Monthly Downtime Log'),
        fetchTabSoft(TAB_URL, 'Cost Inputs'),
        fetchTabSoft(TAB_URL, 'Weekly Meter Readings'),
        fetchTabSoft(TRAVEL_TAB_URL, 'operators'),
        fetchTabSoft(TRAVEL_TAB_URL, 'submissions'),
      ]);
      const tracker = parseTrackerGrid(trackerGrid);
      const kaizen = parseSuggestions(suggestionGrid);
      const breakdownKv = parseBreakdown(breakdownGrid);
      const costKv = parseCost(costGrid);
      const downtimeTrend = parseMonthlyDowntimeLog(downtimeLogGrid);
      const costInputs = parseCostInputs(costInputsGrid);
      const meter = parseMeterReadings(meterGrid);
      const labour = parseLabourCost(operatorsGrid, submissionsGrid, costInputs.staffHourlyRate);
      const lineMonthly = parseLineMonthly(trackerGrid);

      // The Cost tab's own figures are in UGX '000 (see Cost!F3) — divide our
      // raw-UGX computations by 1000 so every cost card on the board shares
      // one unit and isn't off by 1000x next to the manually-entered ones.
      const energyCostK = (meter.totalKwh * costInputs.energyTariffRate) / 1000;
      const labourTotalK = labour.totalCost / 1000;
      const productionOperationalCostK = labourTotalK + energyCostK;

      const costKvExtra = {
        'Labour Cost': { raw: String(labourTotalK), num: labourTotalK || costKv['Labour Cost']?.num || 0 },
        'Production Operational Cost': { raw: String(productionOperationalCostK), num: productionOperationalCostK },
        'Total Production Cost': { raw: String(productionOperationalCostK), num: productionOperationalCostK },
      };
      for (const name of LINE_WORKSHOP_NAMES) {
        const k = (labour.byLine[name] || 0) / 1000;
        costKvExtra[`Operational Cost — ${name}`] = { raw: String(k), num: k };
      }

      const achievement = TOTAL_UNITS ? tracker.totalDone / TOTAL_UNITS : 0;

      setData({
        kv: {
          'Program Target (vehicles)': { raw: String(TOTAL_UNITS), num: TOTAL_UNITS },
          'Completed': { raw: String(tracker.totalDone), num: tracker.totalDone },
          'In Production': { raw: String(tracker.activeUnits), num: tracker.activeUnits },
          'Achievement %': { raw: '', num: achievement },
          ...breakdownKv,
          ...costKv,
          ...costKvExtra,
        },
        workshops: tracker.workshops,
        daily: tracker.daily,
        bottlenecks: [],   // no data source in this sheet
        kaizen,
        ecr: [],           // no data source in this sheet
        waste: [],         // no data source in this sheet
        fpyTrend: [],       // no Quality register in this sheet
        downtimeTrend,      // Monthly Downtime Log tab — manual monthly entries
        linePlannedVsActual: lineMonthly.byLine,       // per-line monthly Plan vs Actual, the 4 reported lines
        lineMonthlyOutput: lineMonthly.combinedOutput, // monthly actual output, all 4 lines compared
        overallMonthly: lineMonthly.overallMonthly,    // whole-program monthly Plan vs Actual (= Trim & Final Assembly)
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
