import { useState, useEffect, useCallback, useMemo } from 'react';
import { lookupStation } from '../data/stations';
import { fetchSubmissions } from './useSubmissionsData';

// NI Travel Tool Data → "Travel Card Data" tab.
// The gviz endpoint reads by spreadsheet ID + tab name directly, so no
// "Publish to web" step is needed — the sheet just has to be shared as
// "Anyone with the link can view".
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es/gviz/tq?tqx=out:csv&sheet=Travel%20Card%20Data';
const REFRESH_INTERVAL = 60000;

export function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const col = (names) => {
    const n = names.map(x => x.toLowerCase());
    return headers.findIndex(h => n.some(name => h.toLowerCase().includes(name)));
  };

  const vinIdx       = col(['vin']);
  const modelIdx     = col(['bus model', 'model']);
  const stationIdx   = col(['station code', 'station_code', 'stationcode', 'station']);
  const timestampIdx = col(['timestamp', 'time', 'date']);

  // Phase 3: new columns written by the Apps Script.
  // If a column doesn't exist yet, its index is -1 and the field will
  // be null on every row — no breakage on sheets that predate Phase 2.
  const designedIdx      = col(['designed time', 'designed_time', 'designedtime', 'cycle time', 'cycle_time']);
  const approvalIdx      = col(['approval status', 'approval_status', 'approvalstatus']);
  const ohsIdx           = col(['ohs issue', 'ohs_issue', 'ohsissue', 'ohs']);
  const overrunIdx       = col(['overrun min', 'overrun_min', 'overrunmin', 'overrun']);
  // Phase 4: downtime + rework columns — null when absent
  const downtimeMinIdx   = col(['downtime min', 'downtime_min', 'downtimemin', 'downtime minutes', 'downtime_minutes']);
  const downtimeReasonIdx= col(['downtime reason', 'downtime_reason', 'downtimere']);
  const reworkFlagIdx    = col(['rework flag', 'rework_flag', 'reworkflag', 'rework']);
  const reworkHrsIdx     = col(['rework hours', 'rework_hours', 'reworkhours', 'rework hrs', 'rework_hrs']);
  const projectIdx       = col(['bus project', 'project', 'proj', 'contract', 'order']);

  if (vinIdx === -1 || modelIdx === -1 || stationIdx === -1) {
    console.warn('KMC Tracker: Could not find required columns. Headers:', headers);
    return [];
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
      current += char;
    }
    cells.push(current.trim());

    const vin       = cells[vinIdx]?.trim();
    const model     = cells[modelIdx]?.trim() ?? '';
    const stCode    = cells[stationIdx]?.trim().toUpperCase().replace(/\s+/g, '-');
    const timestamp = timestampIdx >= 0 ? cells[timestampIdx]?.trim() : '';

    if (!vin || !stCode) continue;

    // Phase 3 fields — null when column is absent or value is empty
    const designedTime   = designedIdx >= 0 ? (parseFloat(cells[designedIdx])  || null) : null;
    const approvalStatus = approvalIdx >= 0 ? (cells[approvalIdx]?.trim()  || null) : null;
    const ohsIssue       = ohsIdx      >= 0 ? (cells[ohsIdx]?.trim()       || null) : null;
    const overrunMin     = overrunIdx  >= 0 ? (parseFloat(cells[overrunIdx]) || null) : null;
    // Phase 4 fields
    const downtimeMin    = downtimeMinIdx    >= 0 ? (parseFloat(cells[downtimeMinIdx])    || null) : null;
    const downtimeReason = downtimeReasonIdx >= 0 ? (cells[downtimeReasonIdx]?.trim()    || null) : null;
    const reworkRaw      = reworkFlagIdx     >= 0 ? (cells[reworkFlagIdx]?.trim()        || null) : null;
    const reworkFlag     = reworkRaw !== null ? /^(yes|true|1|y)$/i.test(reworkRaw) : null;
    const reworkHrs      = reworkHrsIdx      >= 0 ? (parseFloat(cells[reworkHrsIdx])     || null) : null;
    const project        = projectIdx        >= 0 ? (cells[projectIdx]?.trim()           || null) : null;

    rows.push({
      vin, model, stationCode: stCode,
      timestamp, rawTimestamp: timestamp,
      designedTime, approvalStatus, ohsIssue, overrunMin,
      downtimeMin, downtimeReason, reworkFlag, reworkHrs, project,
    });
  }
  return rows;
}

// The tracker used to read ONLY the "Travel Card Data" tab, which holds five
// columns (time, VIN, model, station, designed time). Project, approval status,
// OHS, downtime and rework don't exist there, so the Project and Status filters
// could never match anything. The full "submissions" data has them all, and is
// kept current when a supervisor reviews or a user edits a card, so rows are
// built from it. Older Travel Card Data rows with no matching submission (from
// before submissions were kept) are still shown, just without those fields.
export const normVin = (v) => String(v || '').trim().replace(/^VIN\s+/i, '');
const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');

export function submissionToRow(s) {
  const ts = s.clockOut || s.timestamp || '';
  const designed = Number(s.designedTime) || 0;
  const over = designed > 0 ? Math.max(0, (Number(s.actualTime) || 0) - designed) : 0;
  const statuses = Object.values(s.activityStatuses || {});
  return {
    vin: normVin(s.vin), model: s.busModel || '', stationCode: normCode(s.stationCode),
    timestamp: ts, rawTimestamp: ts,
    designedTime: designed || null,
    approvalStatus: s.approvalStatus || null,
    ohsIssue: s.ohsIssue || null,
    overrunMin: over || null,
    downtimeMin: null, downtimeReason: null,
    reworkFlag: statuses.includes('rework'),
    reworkHrs: null,
    project: s.project || null,
  };
}

// Submission rows plus legacy Travel Card Data rows for buses/stations that have
// no submission at all.
export function mergeRows(submissions, legacyRows) {
  const rows = submissions.map(submissionToRow).filter(r => r.vin && r.stationCode);
  const seen = new Set(rows.map(r => `${r.vin}|${r.stationCode}`));
  for (const r of legacyRows) {
    const row = { ...r, vin: normVin(r.vin) };
    if (!seen.has(`${row.vin}|${row.stationCode}`)) rows.push(row);
  }
  return rows;
}

function getLatestPositions(rows) {
  const map = {};
  for (const row of rows) {
    const ts = new Date(row.rawTimestamp || 0).getTime() || 0;
    if (!map[row.vin] || ts >= map[row.vin].ts) {
      map[row.vin] = { ...row, ts };
    }
  }
  const enriched = Object.values(map).map(entry => {
    const station = lookupStation(entry.stationCode);
    return { ...entry, station };
  });

  const unknown = [...new Set(
    enriched.filter(e => !e.station && e.stationCode).map(e => e.stationCode)
  )];
  if (unknown.length > 0) {
    console.warn('KMC Tracker: Station codes not in stations.js (buses hidden):', unknown);
  }

  return enriched.filter(e => e.station);
}

// ── Pure filter function (exported for use in App.jsx or anywhere) ──────────
// Returns the subset of rows whose rawTimestamp falls within [startDate, endDate].
// Either bound can be null to mean "open-ended".
// startDate / endDate are 'YYYY-MM-DD' strings or null.
export function filterByDateRange(rows, startDate, endDate) {
  if (!startDate && !endDate) return rows;
  const start = startDate ? new Date(startDate + 'T00:00:00').getTime() : null;
  const end   = endDate   ? new Date(endDate   + 'T23:59:59.999').getTime() : null;
  return rows.filter(row => {
    if (!row.rawTimestamp) return false;
    const t = new Date(row.rawTimestamp).getTime();
    if (isNaN(t)) return false;
    if (start !== null && t < start) return false;
    if (end   !== null && t > end)   return false;
    return true;
  });
}

export function useSheetData() {
  const [buses, setBuses]             = useState([]);
  const [allRows, setAllRows]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Date range filter state — null means no bound applied
  const [startDate, setStartDate] = useState(null);
  const [endDate,   setEndDate]   = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [subs, legacy] = await Promise.allSettled([
        fetchSubmissions(),
        fetch(SHEET_URL + '&t=' + Date.now()).then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        }),
      ]);
      if (subs.status === 'rejected' && legacy.status === 'rejected') throw legacy.reason;
      const rows = mergeRows(
        subs.status === 'fulfilled' ? subs.value : [],
        legacy.status === 'fulfilled' ? parseCSV(legacy.value) : [],
      );
      setAllRows(rows);
      setBuses(getLatestPositions(rows));
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError('Could not load data from Google Sheets. Check that the sheet is published.');
      console.error('Sheet fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Derived: allRows filtered to the active date window.
  // Re-computes only when allRows, startDate, or endDate changes.
  const filteredRows = useMemo(
    () => filterByDateRange(allRows, startDate, endDate),
    [allRows, startDate, endDate]
  );

  // Single convenience setter — normalises empty strings to null
  const setDateRange = useCallback((start, end) => {
    setStartDate(start || null);
    setEndDate(end   || null);
  }, []);

  return {
    // ── existing returns (unchanged) ──
    buses,
    allRows,
    loading,
    error,
    lastUpdated,
    refresh: fetchData,
    // ── new additions ──
    filteredRows,                    // allRows scoped to current date range
    setDateRange,                    // (start, end) => void  ('YYYY-MM-DD' | null)
    dateRange: { startDate, endDate }, // current bounds, for display/persistence
  };
}
