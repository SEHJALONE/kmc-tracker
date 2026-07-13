import { useState, useEffect, useCallback } from 'react';

// DPN Scoreboard workbook (dedicated spreadsheet, separate from NI Travel Tool Data).
// Reads the Calc tab (every KPI pre-computed by the sheet's own formulas), Targets,
// Daily Output and the register tabs via the gviz CSV endpoint. Requires the sheet
// to be shared "Anyone with the link can view".
const SHEET_ID = '1Z338nnUHTxelGTUtXwbVQPdFi0czu_4us39070i3axM';
const TAB_URL = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
const REFRESH_INTERVAL = 5 * 60 * 1000;

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

// "704,000" → 704000 · "35%" → 0.35 · "0.35" → 0.35 · "(704,000)" → -704000 (accounting
// negative format, used by the Cost/Variance number formats) · "" → null
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

// Google's gviz CSV export occasionally bleeds a merged title-bar cell's text
// into the header row directly below it when the rows between are otherwise
// blank (col A becomes "...Do not edit. Workshop" instead of just "Workshop").
// Match on suffix, not equality, so header-row lookups survive that.
function endsWithLabel(cell, expected) {
  return !!cell && cell.trim().endsWith(expected);
}

// Calc + Targets are label/value tabs: col A = label, col B = period value, col C = YTD.
function kvFromGrid(grid) {
  const kv = {};
  for (const r of grid) {
    const label = r[0];
    if (!label || endsWithLabel(label, 'Workshop')) continue;
    kv[label] = { raw: r[1] ?? '', num: toNum(r[1]), ytd: r[2] ?? '', ytdNum: toNum(r[2]) };
  }
  return kv;
}

function workshopsFromCalc(grid) {
  const out = [];
  const start = grid.findIndex(r => endsWithLabel(r[0], 'Workshop'));
  if (start === -1) return out;
  for (let i = start + 1; i < grid.length && out.length < 8; i++) {
    const r = grid[i];
    if (!r[0] || /OVERALL/i.test(r[0])) break;
    out.push({
      name: r[0],
      done: toNum(r[1]) ?? 0,
      active: toNum(r[2]) ?? 0,
      notStarted: toNum(r[3]) ?? 0,
      na: toNum(r[4]) ?? 0,
      due: toNum(r[5]) ?? 0,
      pct: toNum(r[6]) ?? 0,
      status: r[7] || 'ON TRACK',
      constraint: r[8] || 'None',
    });
  }
  return out;
}

function dailyFromGrid(grid) {
  // Header row: Date | Planned | Actual | Cum. Plan | Cum. Act. | Gap
  const hi = grid.findIndex(r => endsWithLabel(r[0], 'Date'));
  if (hi === -1) return [];
  return grid.slice(hi + 1)
    .filter(r => r[0] && r[0] !== '')
    .map(r => ({
      date: r[0],
      planned: toNum(r[1]) ?? 0,
      actual: toNum(r[2]),
      cumPlan: toNum(r[3]) ?? 0,
      cumAct: toNum(r[4]),
      gap: toNum(r[5]),
    }));
}

// Register tabs: header row at sheet row 3, data from row 4
function registerFromGrid(grid, headerFirstCell) {
  const hi = grid.findIndex(r => endsWithLabel(r[0], headerFirstCell));
  if (hi === -1) return [];
  return grid.slice(hi + 1).filter(r => r.some((c, i) => i > 0 && c !== '') && (r[0] !== '' || r[1] !== ''));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Accepts "01-Jul-2026", ISO "2026-07-01", or anything Date can parse.
function parseAnyDate(v) {
  if (!v) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v.trim());
  if (m) {
    const mi = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
    if (mi !== -1) return new Date(Number(m[3]), mi, Number(m[1]));
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(d) { return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; }

// Quality register: Date | Unit | Result (Pass/Rework) | Defects | Critical | Closed | Rework Hrs | Inspector | Notes
function fpyTrendFromGrid(grid) {
  const hi = grid.findIndex(r => endsWithLabel(r[0], 'Date'));
  if (hi === -1) return [];
  const buckets = new Map(); // key -> { d, pass, total }
  for (const r of grid.slice(hi + 1)) {
    const d = parseAnyDate(r[0]);
    const result = (r[2] || '').trim();
    if (!d || !result) continue;
    const key = monthKey(d);
    const b = buckets.get(key) || { d: new Date(d.getFullYear(), d.getMonth(), 1), pass: 0, total: 0 };
    b.total += 1;
    if (/^pass$/i.test(result)) b.pass += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => ({ label: monthLabel(b.d), value: b.total ? b.pass / b.total : 0 }))
    .slice(-12);
}

// Downtime register: Date | Workshop | Equipment | Reason Code | Downtime (min) | Description | Reported By
function downtimeTrendFromGrid(grid) {
  const hi = grid.findIndex(r => endsWithLabel(r[0], 'Date'));
  if (hi === -1) return [];
  const buckets = new Map(); // key -> { d, minutes }
  for (const r of grid.slice(hi + 1)) {
    const d = parseAnyDate(r[0]);
    const mins = toNum(r[4]);
    if (!d || mins == null) continue;
    const key = monthKey(d);
    const b = buckets.get(key) || { d: new Date(d.getFullYear(), d.getMonth(), 1), minutes: 0 };
    b.minutes += mins;
    buckets.set(key, b);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => ({ label: monthLabel(b.d), value: b.minutes / 60 }))
    .slice(-12);
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
      const [calc, targets, daily, bottlenecks, kaizen, ecr, waste, quality, downtime] = await Promise.all([
        fetchTab('Calc'), fetchTab('Targets'), fetchTab('Daily Output'),
        fetchTab('Bottlenecks'), fetchTab('Kaizen'), fetchTab('ECR'), fetchTab('Waste'),
        fetchTab('Quality'), fetchTab('Downtime'),
      ]);
      setData({
        kv: { ...kvFromGrid(targets), ...kvFromGrid(calc) },
        workshops: workshopsFromCalc(calc),
        daily: dailyFromGrid(daily),
        bottlenecks: registerFromGrid(bottlenecks, 'Date Raised'),
        kaizen: registerFromGrid(kaizen, 'Date'),
        ecr: registerFromGrid(ecr, 'ECR No.'),
        waste: registerFromGrid(waste, 'Date'),
        fpyTrend: fpyTrendFromGrid(quality),
        downtimeTrend: downtimeTrendFromGrid(downtime),
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
