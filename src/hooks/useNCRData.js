import { useState, useEffect, useCallback, useMemo } from 'react';

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
export const NCR_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=ncrs`;

export const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbwd3fW_ygzXVAtU3vgJg_l9hxab52l-nRt5S-X4I8nuqm5f0anh9JvLv8TjjsQtoWFf/exec';

const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes

// NCR domain options — drives role-based register separation
export const NCR_DOMAINS = ['Parts & Materials', 'Process', 'Quality', 'Production'];

// NCR type options (IMS §3 scope)
export const NCR_TYPES = ['Quality', 'Safety', 'Environmental', 'OHS'];

// Severity per IMS §8.4 audit classifications
export const NCR_SEVERITIES = ['Critical', 'Major', 'Minor'];

// Disposition options per IMS §8.5
export const NCR_DISPOSITIONS = [
  'Rework',
  'Repair',
  'Replacement',
  'Return to Supplier',
  'Scrap',
  'Use-As-Is',
];

export const NCR_STATUSES = ['Open', 'In Progress', 'Closed', 'Concession Approved'];

export const RCA_METHODS = ['5-Why', '8D', 'Fishbone', 'DMAIC'];

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

function parseNCRCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const raw = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (...names) => raw.findIndex(h => names.some(n => h.includes(n)));

  const idxId       = col('ncr_id', 'ncr id');
  const idxTs       = col('timestamp', 'time', 'date');
  const idxVin      = col('vin');
  const idxStation  = col('station_code', 'station code');
  const idxType     = col('ncr_type', 'ncr type');
  const idxDesc     = col('description');
  const idxSeverity = col('severity');
  const idxDisp     = col('disposition');
  const idxRoot     = col('root_cause', 'root cause');
  const idxRca      = col('rca_method', 'rca method');
  const idxCA       = col('corrective_action', 'corrective action');
  const idxPA       = col('preventive_action', 'preventive action');
  const idxAssigned = col('assigned_to', 'assigned to');
  const idxDue      = col('due_date', 'due date');
  const idxStatus   = col('status');
  const idxClosed   = col('closed_date', 'closed date');
  const idxRaisedBy = col('raised_by', 'raised by');
  const idxDomain   = col('domain');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCells(lines[i]);
    const id = idxId >= 0 ? c[idxId]?.trim() : null;
    if (!id) continue;
    rows.push({
      id,
      timestamp:        idxTs       >= 0 ? c[idxTs]?.trim()       || null : null,
      vin:              idxVin      >= 0 ? c[idxVin]?.trim()      || null : null,
      stationCode:      idxStation  >= 0 ? c[idxStation]?.trim()  || null : null,
      ncrType:          idxType     >= 0 ? c[idxType]?.trim()     || null : null,
      description:      idxDesc     >= 0 ? c[idxDesc]?.trim()     || null : null,
      severity:         idxSeverity >= 0 ? c[idxSeverity]?.trim() || null : null,
      disposition:      idxDisp     >= 0 ? c[idxDisp]?.trim()     || null : null,
      rootCause:        idxRoot     >= 0 ? c[idxRoot]?.trim()     || null : null,
      rcaMethod:        idxRca      >= 0 ? c[idxRca]?.trim()      || null : null,
      correctiveAction: idxCA       >= 0 ? c[idxCA]?.trim()       || null : null,
      preventiveAction: idxPA       >= 0 ? c[idxPA]?.trim()       || null : null,
      assignedTo:       idxAssigned >= 0 ? c[idxAssigned]?.trim() || null : null,
      dueDate:          idxDue      >= 0 ? c[idxDue]?.trim()      || null : null,
      status:           idxStatus   >= 0 ? c[idxStatus]?.trim()   || 'Open' : 'Open',
      closedDate:       idxClosed   >= 0 ? c[idxClosed]?.trim()   || null : null,
      raisedBy:         idxRaisedBy >= 0 ? c[idxRaisedBy]?.trim() || null : null,
      domain:           idxDomain   >= 0 ? c[idxDomain]?.trim()   || null : null,
    });
  }
  return rows;
}

export function useNCRData() {
  const [ncrs,        setNcrs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(NCR_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNcrs(parseNCRCSV(await res.text()));
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      console.warn('KMC useNCRData: fetch failed.', e.message);
      setError('Could not load NCR data.');
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
    const open     = ncrs.filter(r => r.status === 'Open' || r.status === 'In Progress');
    const closed   = ncrs.filter(r => r.status === 'Closed' || r.status === 'Concession Approved');
    const critical = ncrs.filter(r => r.severity === 'Critical');
    const today    = new Date().toISOString().slice(0, 10);
    const overdue  = open.filter(r => r.dueDate && r.dueDate < today);
    return { open, closed, critical, overdue, total: ncrs.length };
  }, [ncrs]);

  const postNCR = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'saveNCR', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  const updateNCR = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'updateNCR', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  return { ncrs, summary, loading, error, lastFetched, refresh: fetchData, postNCR, updateNCR };
}
