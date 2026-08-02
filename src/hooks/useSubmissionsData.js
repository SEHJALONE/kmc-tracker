import { useState, useEffect, useCallback } from 'react';

// Reads Travel Card submissions live from NI Travel Tool Data — the sheet-of-
// record every write already targets (see APPS_SCRIPT_CATALOG.md) — instead
// of the old kmc_pending_reviews localStorage cache, so an approval decision
// made on one device is visible everywhere, and a general user's own
// submissions (for the edit-before-approval flow) can be found reliably by
// `submittedBy` instead of only existing in the browser that created them.

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const TAB_URL = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

export const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbyHsyDOXkIURCTNrsxl4MbUVhqZxNco0qz1Bl95UePnesSQgnbJlfyIuiy7FkuAOH_q/exec';

const REFRESH_INTERVAL = 60 * 1000; // 1 minute — reviewers/applicants want this fairly fresh

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

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCells(lines[i]));
  }
  return { headers, rows };
}

function col(headers, row, ...names) {
  const idx = headers.findIndex(h => names.some(n => h === n || h.includes(n)));
  return idx >= 0 ? (row[idx]?.trim() || '') : '';
}

async function fetchTab(tab) {
  const res = await fetch(TAB_URL(tab) + '&t=' + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${tab}`);
  return parseCSV(await res.text());
}

export function useSubmissionsData() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [subCsv, actCsv, resCsv, opCsv] = await Promise.all([
        fetchTab('submissions'), fetchTab('activities'), fetchTab('resources'), fetchTab('operators'),
      ]);

      const activitiesById = {};
      actCsv.rows.forEach(r => {
        const id = col(actCsv.headers, r, 'record_id');
        if (!id) return;
        const activity = col(actCsv.headers, r, 'activity');
        const status = col(actCsv.headers, r, 'status') || 'not_set';
        const isAdded = col(actCsv.headers, r, 'is_added') === 'YES';
        (activitiesById[id] ||= { statuses: {}, added: [] });
        activitiesById[id].statuses[activity] = status;
        if (isAdded) activitiesById[id].added.push(activity);
      });

      const resourcesById = {};
      resCsv.rows.forEach(r => {
        const id = col(resCsv.headers, r, 'record_id');
        if (!id) return;
        const name = col(resCsv.headers, r, 'resource_name');
        const qty = col(resCsv.headers, r, 'quantity');
        const isOther = col(resCsv.headers, r, 'is_other') === 'YES';
        (resourcesById[id] ||= { used: {}, other: [] });
        if (isOther) resourcesById[id].other.push({ name, qty });
        else resourcesById[id].used[name] = qty;
      });

      const operatorsById = {};
      opCsv.rows.forEach(r => {
        const id = col(opCsv.headers, r, 'record_id');
        if (!id) return;
        const name = col(opCsv.headers, r, 'operator_name');
        (operatorsById[id] ||= []).push(name);
      });

      const parsed = subCsv.rows.map(r => {
        const id = col(subCsv.headers, r, 'record_id');
        if (!id) return null;
        let unexpectedDelay = null;
        const rawDelay = col(subCsv.headers, r, 'unexpected_delay');
        if (rawDelay) { try { unexpectedDelay = JSON.parse(rawDelay); } catch { /* ignore */ } }
        return {
          id,
          recordId: id,
          timestamp: col(subCsv.headers, r, 'timestamp'),
          busModel: col(subCsv.headers, r, 'bus_model'),
          project: col(subCsv.headers, r, 'project'),
          vin: col(subCsv.headers, r, 'vin'),
          line: col(subCsv.headers, r, 'production_line'),
          station: col(subCsv.headers, r, 'station'),
          stationCode: col(subCsv.headers, r, 'station_code'),
          hseResources: col(subCsv.headers, r, 'hse_resources'),
          clockIn: col(subCsv.headers, r, 'clock_in'),
          clockOut: col(subCsv.headers, r, 'clock_out'),
          actualTime: Number(col(subCsv.headers, r, 'actual_time_min')) || 0,
          grossTime: Number(col(subCsv.headers, r, 'gross_time_min')) || 0,
          breakMinutes: Number(col(subCsv.headers, r, 'break_min')) || 0,
          designedTime: Number(col(subCsv.headers, r, 'designed_time_min')) || 0,
          hasOverrun: col(subCsv.headers, r, 'has_overrun') === 'YES',
          ohsIssue: col(subCsv.headers, r, 'ohs_issue') || null,
          wasteGenerated: col(subCsv.headers, r, 'waste_generated'),
          reviewer: col(subCsv.headers, r, 'reviewer') || null,
          approvalStatus: col(subCsv.headers, r, 'approval_status') || 'pending_review',
          reviewDate: col(subCsv.headers, r, 'review_date') || null,
          reviewComments: col(subCsv.headers, r, 'review_comments') || null,
          generalComments: col(subCsv.headers, r, 'general_comments') || null,
          unexpectedDelay,
          submittedBy: col(subCsv.headers, r, 'submitted_by') || null,
          activityStatuses: activitiesById[id]?.statuses || {},
          addedActivities: activitiesById[id]?.added || [],
          resourcesUsed: resourcesById[id]?.used || {},
          otherResources: resourcesById[id]?.other || [],
          operators: operatorsById[id] || [],
        };
      }).filter(Boolean);

      setSubmissions(parsed);
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      console.warn('KMC useSubmissionsData: fetch failed.', e.message);
      setError('Could not load submissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  // Supervisor review decision — approve/deny/etc. Only patches review fields.
  const reviewSubmission = useCallback(async ({ recordId, reviewer, approvalStatus, reviewDate, reviewComments }) => {
    const body = new URLSearchParams({ payload: JSON.stringify({
      action: 'updateSubmission', recordId, reviewOnly: true,
      reviewer, approvalStatus, reviewDate, reviewComments,
    }) });
    try {
      await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
      setTimeout(fetchData, 3000);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [fetchData]);

  // General user editing their own still-pending card — full field set,
  // server rejects if a supervisor has already reviewed it in the meantime.
  const editSubmission = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({
      action: 'updateSubmission', requireStillPending: true, _fullEdit: true, ...data,
    }) });
    try {
      const res = await fetch(SHEETS_URL, { method: 'POST', body });
      let json = null;
      try { json = await res.json(); } catch { /* no-cors-style opaque response elsewhere; here we want the real one */ }
      setTimeout(fetchData, 3000);
      if (json && json.status !== 'ok') return { ok: false, error: json.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [fetchData]);

  return { submissions, loading, error, lastFetched, refresh: fetchData, reviewSubmission, editSubmission };
}
