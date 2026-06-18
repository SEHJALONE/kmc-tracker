import { useState, useEffect, useCallback, useMemo } from 'react';

// ─── URL ──────────────────────────────────────────────────────────────────────
// The Travel Card Google Sheet published as CSV — overruns tab.
// Replace GID with the actual sheet tab ID of the "overruns" tab.
// To find it: open the sheet → click the overruns tab → copy the gid= value
// from the URL bar, e.g.: ?gid=1234567890
//
// Then publish the tab:
//   File → Share → Publish to web → choose "overruns" tab → CSV → Publish
// and paste the resulting URL below.
export const OVERRUN_URL =
  'https://docs.google.com/spreadsheets/d/e/__TRAVEL_CARD_SHEET_ID__/pub?gid=__OVERRUNS_GID__&single=true&output=csv';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ─── CSV parser ───────────────────────────────────────────────────────────────
/**
 * Parses the overruns tab CSV.
 *
 * Columns written by writeOverrun() in the Apps Script:
 *   record_id | timestamp | station_code | vin | project |
 *   designed_min | actual_min | overrun_min |
 *   root_causes | sub_causes | corrective_action | comments
 *
 * Returns an array of plain objects, one per overrun row.
 * Unknown or missing columns are silently omitted (null on each row).
 */
function parseOverrunCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Flexible header matching — tolerates column reordering
  const raw = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const col = (...names) =>
    raw.findIndex(h => names.some(n => h.includes(n)));

  const idxId        = col('record_id', 'record id');
  const idxTs        = col('timestamp', 'time', 'date');
  const idxStation   = col('station_code', 'station code', 'stationcode');
  const idxVin       = col('vin');
  const idxProject   = col('project');
  const idxDesigned  = col('designed_min', 'designed min', 'designed');
  const idxActual    = col('actual_min',   'actual min',   'actual');
  const idxOverrun   = col('overrun_min',  'overrun min',  'overrun');
  const idxRoots     = col('root_causes',  'root causes',  'rootcauses');
  const idxSubs      = col('sub_causes',   'sub causes',   'subcauses');
  const idxAction    = col('corrective_action', 'corrective action');
  const idxComments  = col('comments');

  function parseCells(line) {
    const cells = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCells(lines[i]);

    const overrunMin = idxOverrun >= 0 ? parseFloat(c[idxOverrun]) : NaN;
    // Skip rows with no overrun value — these are header repeats or blank rows
    if (isNaN(overrunMin) || overrunMin <= 0) continue;

    rows.push({
      id:              idxId       >= 0 ? c[idxId]?.trim()      || null : null,
      timestamp:       idxTs       >= 0 ? c[idxTs]?.trim()      || null : null,
      stationCode:     idxStation  >= 0 ? c[idxStation]?.trim().toUpperCase().replace(/\s+/g, '-') || null : null,
      vin:             idxVin      >= 0 ? c[idxVin]?.trim()      || null : null,
      project:         idxProject  >= 0 ? c[idxProject]?.trim()  || null : null,
      designedMin:     idxDesigned >= 0 ? parseFloat(c[idxDesigned]) || null : null,
      actualMin:       idxActual   >= 0 ? parseFloat(c[idxActual])   || null : null,
      overrunMin,
      // root_causes is a comma-separated string like "Man, Machine"
      rootCauses:      idxRoots    >= 0 ? (c[idxRoots]?.trim()  || '').split(',').map(s => s.trim()).filter(Boolean) : [],
      // sub_causes is "Man: sub | Machine: sub" — parse into { M: sub } map
      subCauses:       idxSubs     >= 0 ? parseSubCauses(c[idxSubs]  || '') : {},
      correctiveAction: idxAction  >= 0 ? c[idxAction]?.trim()  || null : null,
      comments:        idxComments >= 0 ? c[idxComments]?.trim() || null : null,
    });
  }
  return rows;
}

/** Parses "Man: skill gap | Machine: breakdown" → { Man: "skill gap", Machine: "breakdown" } */
function parseSubCauses(raw) {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split('|')
       .map(seg => seg.split(':').map(s => s.trim()))
       .filter(([k, v]) => k && v)
  );
}

// ─── Derived aggregations ─────────────────────────────────────────────────────
/**
 * From a flat array of overrun rows, returns:
 *
 * byStation   — [{ stationCode, totalMin, count, avgMin }] sorted desc by totalMin
 * byRootCause — [{ cause, totalMin, count }] sorted desc by totalMin
 * total       — { overrunMin, count } fleet-wide
 */
export function aggregateOverruns(rows) {
  const stationMap = {}, causeMap = {};
  let totalMin = 0, totalCount = 0;

  for (const row of rows) {
    const { stationCode, overrunMin, rootCauses } = row;
    if (!overrunMin || overrunMin <= 0) continue;

    totalMin   += overrunMin;
    totalCount += 1;

    if (stationCode) {
      stationMap[stationCode] = stationMap[stationCode] || { totalMin: 0, count: 0 };
      stationMap[stationCode].totalMin += overrunMin;
      stationMap[stationCode].count    += 1;
    }

    for (const cause of rootCauses) {
      causeMap[cause] = causeMap[cause] || { totalMin: 0, count: 0 };
      causeMap[cause].totalMin += overrunMin;
      causeMap[cause].count    += 1;
    }
  }

  const byStation = Object.entries(stationMap)
    .map(([stationCode, { totalMin, count }]) => ({
      stationCode, totalMin, count,
      avgMin: Math.round(totalMin / count),
    }))
    .sort((a, b) => b.totalMin - a.totalMin);

  const byRootCause = Object.entries(causeMap)
    .map(([cause, { totalMin, count }]) => ({ cause, totalMin, count }))
    .sort((a, b) => b.totalMin - a.totalMin);

  return { byStation, byRootCause, total: { overrunMin: totalMin, count: totalCount } };
}

// ─── React hook ───────────────────────────────────────────────────────────────
/**
 * useOverrunData()
 *
 * Returns:
 *   rows        — raw parsed overrun records
 *   aggregated  — { byStation, byRootCause, total }
 *   loading     — true during first fetch
 *   error       — string | null
 *   lastFetched — Date | null
 *   refresh     — () => void  manual re-fetch
 *
 * Usage:
 *   const { aggregated, loading } = useOverrunData();
 *   aggregated.byStation[0]  // worst station by total overrun minutes
 *   aggregated.byRootCause   // 6M ranking
 */
export function useOverrunData() {
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    // Guard: if the URL hasn't been configured yet, fail gracefully
    if (OVERRUN_URL.includes('__TRAVEL_CARD_SHEET_ID__')) {
      setError('useOverrunData: OVERRUN_URL not configured. Set the Travel Card sheet ID and overruns tab GID.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(OVERRUN_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setRows(parseOverrunCSV(text));
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      console.warn('KMC useOverrunData: fetch failed.', e.message);
      setError('Could not load overrun data from Travel Card Sheet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Memoised aggregations — only recompute when raw rows change
  const aggregated = useMemo(() => aggregateOverruns(rows), [rows]);

  return { rows, aggregated, loading, error, lastFetched, refresh: fetchData };
}
