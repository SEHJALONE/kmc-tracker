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
    if (c0 === 'Workshop' && (row[1] || '').trim() === 'Done') {
      let j = i + 1;
      while (j < grid.length && (grid[j][0] || '').trim()) {
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
  return { kv, workshops };
}

// ── Targets tab: label/value pairs (Scoreboard Period, Program info, shift
// hours, baselines, "Target: X" rows) — same flat-lookup shape as Calc.
export function parseTargetsKv(grid) {
  const kv = {};
  for (const row of grid) {
    const label = (row[0] || '').trim();
    if (!label || row[1] == null || String(row[1]).trim() === '') continue;
    kv[label] = { raw: String(row[1]), num: toNum(row[1]) };
  }
  return kv;
}

// ── Daily Output tab: fully formula-driven in the sheet — Date | Planned |
// Actual | Cum. Plan | Cum. Act. | Gap. Read directly rather than re-derived
// from the Tracker grid.
export function parseDailyOutput(grid) {
  const hIdx = grid.findIndex(r => (r[0] || '').trim() === 'Date' && (r[1] || '').trim() === 'Planned');
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
      date: dailyLabel(d), planned: toNum(r[1]) || 0, actual,
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
  const hIdx = grid.findIndex(r => (r[0] || '').trim() === 'Date' && /reason/i.test(r[3] || ''));
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
  const hIdx = grid.findIndex(r => (r[0] || '').trim() === 'Date' && /inspection result/i.test(r[2] || ''));
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
  const hIdx = grid.findIndex(r => (r[0] || '').trim() === 'Month Start');
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

// ── Cost Inputs tab: Setting | Value | Unit | Notes ─────────────────────────
export function parseCostInputs(grid) {
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
        costInputsGrid, operatorsGrid, submissionsGrid,
      ] = await Promise.all([
        fetchTab('Targets'), fetchTab('Tracker'), fetchTab('Daily Output'), fetchTab('Downtime'),
        fetchTab('Bottlenecks'), fetchTab('Quality'), fetchTab('Environment'), fetchTab('ECR'),
        fetchTab('Cost'), fetchTab('Waste'), fetchTab('Kaizen'), fetchTab('Calc'),
        fetchTabSoft(TAB_URL, 'Cost Inputs'),
        fetchTabSoft(TRAVEL_TAB_URL, 'operators'),
        fetchTabSoft(TRAVEL_TAB_URL, 'submissions'),
      ]);

      const targetsKv = parseTargetsKv(targetsGrid);
      const { kv: calcKv, workshops } = parseCalc(calcGrid);
      const daily = parseDailyOutput(dailyOutputGrid);
      const downtimeTrend = parseDowntimeMonthly(downtimeGrid);
      const fpyTrend = parseQualityMonthly(qualityGrid);
      const latestKwh = parseEnvironmentLatestKwh(environmentGrid);
      const bottlenecks = parseRegisterRows(bottlenecksGrid, r => (r[0] || '').trim() === 'Date Raised');
      const ecr = parseRegisterRows(ecrGrid, r => (r[0] || '').trim().toUpperCase().startsWith('ECR NO'));
      const waste = parseRegisterRows(wasteGrid, r => (r[0] || '').trim() === 'Date' && /waste type/i.test(r[1] || ''));
      const kaizen = parseRegisterRows(kaizenGrid, r => (r[0] || '').trim() === 'Date' && /kaizen idea/i.test(r[1] || ''));
      const costKv = parseCost(costGrid);
      const costInputs = parseCostInputs(costInputsGrid);
      const labour = parseLabourCost(operatorsGrid, submissionsGrid, costInputs.staffHourlyRate);
      const lineMonthly = parseLineMonthly(trackerGrid);

      // The Cost tab's own figures are in UGX '000 (see Cost!F3) — divide our
      // raw-UGX computations by 1000 so every cost card on the board shares
      // one unit and isn't off by 1000x next to the manually-entered ones.
      const energyCostK = (latestKwh * costInputs.energyTariffRate) / 1000;
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

      setData({
        kv: {
          ...targetsKv,
          ...calcKv,
          ...costKv,
          ...costKvExtra,
        },
        workshops,
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
