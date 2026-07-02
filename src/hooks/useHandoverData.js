import { useState, useEffect, useCallback, useMemo } from 'react';

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
export const HANDOVER_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=handovers`;

export const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbwd3fW_ygzXVAtU3vgJg_l9hxab52l-nRt5S-X4I8nuqm5f0anh9JvLv8TjjsQtoWFf/exec';

const REFRESH_INTERVAL = 2 * 60 * 1000;

export const SHIFTS = ['Morning', 'Afternoon', 'Night'];

export const LINES = [
  'Machine Shop', 'Body Shop', 'Frame', 'Electro', 'Paint',
  'Chassis 1', 'Chassis 2', 'Trim', 'QA',
];

export const HANDOVER_STATUSES = ['Open', 'Acknowledged'];

export const HOUSEKEEPING_STATUSES = ['OK', 'Issues Found'];

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCells(line) {
  const cells = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseHandoverCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const raw = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (...names) => raw.findIndex(h => names.some(n => h.includes(n)));

  const idxId          = col('handover_id', 'handover id');
  const idxTs          = col('timestamp');
  const idxDate        = col('shift_date', 'shift date');
  const idxShift       = col('shift');
  const idxLine        = col('line', 'department');
  const idxOutgoing    = col('outgoing_supervisor', 'outgoing supervisor');
  const idxIncoming    = col('incoming_supervisor', 'incoming supervisor');
  const idxCompleted   = col('work_completed', 'work completed');
  const idxOutstanding = col('outstanding_work', 'outstanding work');
  const idxBusesInProg = col('buses_in_progress', 'buses in progress');
  const idxSafetyIssues= col('safety_issues', 'safety issues');
  const idxQualityIssues=col('quality_issues', 'quality issues');
  const idxEquipStatus = col('equipment_status', 'equipment status');
  const idxHousekeeping= col('housekeeping');
  const idxActionsNext = col('actions_next_shift', 'actions next shift');
  const idxNotes       = col('notes');
  const idxAckBy       = col('acknowledged_by', 'acknowledged by');
  const idxAckDate     = col('acknowledged_date', 'acknowledged date');
  const idxStatus      = col('status');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCells(lines[i]);
    const id = idxId >= 0 ? c[idxId]?.trim() : null;
    if (!id) continue;
    rows.push({
      id,
      timestamp:        idxTs          >= 0 ? c[idxTs]?.trim()          || null : null,
      shiftDate:        idxDate        >= 0 ? c[idxDate]?.trim()        || null : null,
      shift:            idxShift       >= 0 ? c[idxShift]?.trim()       || null : null,
      line:             idxLine        >= 0 ? c[idxLine]?.trim()        || null : null,
      outgoingSupervisor: idxOutgoing  >= 0 ? c[idxOutgoing]?.trim()    || null : null,
      incomingSupervisor: idxIncoming  >= 0 ? c[idxIncoming]?.trim()    || null : null,
      workCompleted:    idxCompleted   >= 0 ? c[idxCompleted]?.trim()   || null : null,
      outstandingWork:  idxOutstanding >= 0 ? c[idxOutstanding]?.trim() || null : null,
      busesInProgress:  idxBusesInProg >= 0 ? c[idxBusesInProg]?.trim()|| null : null,
      safetyIssues:     idxSafetyIssues>=0  ? c[idxSafetyIssues]?.trim()||null : null,
      qualityIssues:    idxQualityIssues>=0 ? c[idxQualityIssues]?.trim()||null: null,
      equipmentStatus:  idxEquipStatus >= 0 ? c[idxEquipStatus]?.trim() || null : null,
      housekeeping:     idxHousekeeping>= 0 ? c[idxHousekeeping]?.trim()|| null : null,
      actionsNextShift: idxActionsNext >= 0 ? c[idxActionsNext]?.trim() || null : null,
      notes:            idxNotes       >= 0 ? c[idxNotes]?.trim()       || null : null,
      acknowledgedBy:   idxAckBy       >= 0 ? c[idxAckBy]?.trim()      || null : null,
      acknowledgedDate: idxAckDate     >= 0 ? c[idxAckDate]?.trim()    || null : null,
      status:           idxStatus      >= 0 ? c[idxStatus]?.trim()     || 'Open' : 'Open',
    });
  }
  return rows;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useHandoverData() {
  const [handovers,   setHandovers]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(HANDOVER_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHandovers(parseHandoverCSV(await res.text()));
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      console.warn('KMC useHandoverData: fetch failed.', e.message);
      setError('Could not load handover data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const summary = useMemo(() => {
    const open         = handovers.filter(r => r.status === 'Open');
    const acknowledged = handovers.filter(r => r.status === 'Acknowledged');
    const withSafety   = handovers.filter(r => r.safetyIssues && r.safetyIssues.trim());
    const withQuality  = handovers.filter(r => r.qualityIssues && r.qualityIssues.trim());

    // Today's handovers
    const today    = new Date().toISOString().slice(0, 10);
    const todayLog = handovers.filter(r => r.shiftDate === today || r.timestamp?.slice(0, 10) === today);

    return { open, acknowledged, withSafety, withQuality, todayLog, total: handovers.length };
  }, [handovers]);

  const postHandover = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'saveHandover', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  const acknowledgeHandover = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'updateHandover', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  return { handovers, summary, loading, error, lastFetched, refresh: fetchData, postHandover, acknowledgeHandover };
}
