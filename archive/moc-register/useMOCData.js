import { useState, useEffect, useCallback, useMemo } from 'react';

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
export const MOC_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=moc`;

export const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbwd3fW_ygzXVAtU3vgJg_l9hxab52l-nRt5S-X4I8nuqm5f0anh9JvLv8TjjsQtoWFf/exec';

const REFRESH_INTERVAL = 2 * 60 * 1000;

// ── IMS FM001 constants ───────────────────────────────────────────────────────

export const CHANGE_TYPES = [
  'Operations',
  'Personnel',
  'Process-Procedural',
  'Technology',
  'Facility',
  'Other',
];

export const CHANGE_STATUSES_FORM = ['Permanent', 'Temporary'];

export const CHANGE_TIERS = ['Minor', 'Major'];

// Workflow statuses — Minor skips Pending Exec
export const MOC_STATUSES = [
  'Pending Supervisor',
  'Pending HoD',
  'Pending Exec',
  'Approved',
  'Rejected',
  'Closed',
];

// Next approval stage for the workflow button
export function nextStage(moc) {
  const tier = moc.tier;
  switch (moc.status) {
    case 'Pending Supervisor': return 'Pending HoD';
    case 'Pending HoD':        return tier === 'Major' ? 'Pending Exec' : 'Approved';
    case 'Pending Exec':       return 'Approved';
    default:                   return null;
  }
}

export function stageLabel(status) {
  switch (status) {
    case 'Pending Supervisor': return 'Approve as Supervisor';
    case 'Pending HoD':        return 'Approve as HoD';
    case 'Pending Exec':       return 'Approve as Exec';
    default:                   return null;
  }
}

// ── CSV parser ────────────────────────────────────────────────────────────────
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

function parseMOCCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const raw = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (...names) => raw.findIndex(h => names.some(n => h.includes(n)));

  const idxId         = col('moc_id', 'moc id');
  const idxTs         = col('timestamp');
  const idxBy         = col('requested_by', 'requested by');
  const idxDept       = col('department');
  const idxTitle      = col('change_title', 'change title');
  const idxType       = col('change_type', 'change type');
  const idxChgStatus  = col('change_status', 'change status');
  const idxExpiry     = col('expiry_date', 'expiry date');
  const idxTier       = col('tier');
  const idxDesc       = col('description');
  const idxJust       = col('justification');
  const idxHazards    = col('potential_hazards', 'potential hazards');
  const idxSafe       = col('safeguards_compromised', 'safeguards');
  const idxActions    = col('associated_actions', 'associated actions');
  const idxSupName    = col('supervisor_name', 'supervisor name');
  const idxSupDate    = col('supervisor_date', 'supervisor date');
  const idxHodName    = col('hod_name', 'hod name');
  const idxHodDate    = col('hod_date', 'hod date');
  const idxExecName   = col('exec_name', 'exec name');
  const idxExecDate   = col('exec_date', 'exec date');
  const idxTraining   = col('training_required', 'training required');
  const idxProcUpdate = col('procedures_update', 'procedures update');
  const idxDrawUpdate = col('drawings_update', 'drawings update');
  const idxPSSR       = col('pssr_completed', 'pssr completed');
  const idxPSSRDate   = col('pssr_date', 'pssr date');
  const idxClosure    = col('closure_comments', 'closure comments');
  const idxClosureDate= col('closure_date', 'closure date');
  const idxStatus     = col('status');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCells(lines[i]);
    const id = idxId >= 0 ? c[idxId]?.trim() : null;
    if (!id) continue;
    rows.push({
      id,
      timestamp:           idxTs        >= 0 ? c[idxTs]?.trim()        || null : null,
      requestedBy:         idxBy        >= 0 ? c[idxBy]?.trim()        || null : null,
      department:          idxDept      >= 0 ? c[idxDept]?.trim()      || null : null,
      changeTitle:         idxTitle     >= 0 ? c[idxTitle]?.trim()     || null : null,
      changeType:          idxType      >= 0 ? c[idxType]?.trim()      || null : null,
      changeStatus:        idxChgStatus >= 0 ? c[idxChgStatus]?.trim() || null : null,
      expiryDate:          idxExpiry    >= 0 ? c[idxExpiry]?.trim()    || null : null,
      tier:                idxTier      >= 0 ? c[idxTier]?.trim()      || null : null,
      description:         idxDesc      >= 0 ? c[idxDesc]?.trim()      || null : null,
      justification:       idxJust      >= 0 ? c[idxJust]?.trim()      || null : null,
      potentialHazards:    idxHazards   >= 0 ? c[idxHazards]?.trim()   || null : null,
      safeguardsCompromised: idxSafe    >= 0 ? c[idxSafe]?.trim()      || null : null,
      associatedActions:   idxActions   >= 0 ? c[idxActions]?.trim()   || null : null,
      supervisorName:      idxSupName   >= 0 ? c[idxSupName]?.trim()   || null : null,
      supervisorDate:      idxSupDate   >= 0 ? c[idxSupDate]?.trim()   || null : null,
      hodName:             idxHodName   >= 0 ? c[idxHodName]?.trim()   || null : null,
      hodDate:             idxHodDate   >= 0 ? c[idxHodDate]?.trim()   || null : null,
      execName:            idxExecName  >= 0 ? c[idxExecName]?.trim()  || null : null,
      execDate:            idxExecDate  >= 0 ? c[idxExecDate]?.trim()  || null : null,
      trainingRequired:    idxTraining  >= 0 ? c[idxTraining]?.trim()  || null : null,
      proceduresUpdate:    idxProcUpdate>= 0 ? c[idxProcUpdate]?.trim()|| null : null,
      drawingsUpdate:      idxDrawUpdate>= 0 ? c[idxDrawUpdate]?.trim()|| null : null,
      pssrCompleted:       idxPSSR      >= 0 ? c[idxPSSR]?.trim()      || null : null,
      pssrDate:            idxPSSRDate  >= 0 ? c[idxPSSRDate]?.trim()  || null : null,
      closureComments:     idxClosure   >= 0 ? c[idxClosure]?.trim()   || null : null,
      closureDate:         idxClosureDate>=0 ? c[idxClosureDate]?.trim()|| null : null,
      status:              idxStatus    >= 0 ? c[idxStatus]?.trim()    || 'Pending Supervisor' : 'Pending Supervisor',
    });
  }
  return rows;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useMOCData() {
  const [mocs,        setMocs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(MOC_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMocs(parseMOCCSV(await res.text()));
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      console.warn('KMC useMOCData: fetch failed.', e.message);
      setError('Could not load MOC data.');
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
    const pending  = mocs.filter(r => r.status?.startsWith('Pending'));
    const approved = mocs.filter(r => r.status === 'Approved');
    const closed   = mocs.filter(r => r.status === 'Closed');
    const rejected = mocs.filter(r => r.status === 'Rejected');
    const major    = mocs.filter(r => r.tier === 'Major');
    // Temporary changes past expiry date
    const today    = new Date().toISOString().slice(0, 10);
    const expired  = mocs.filter(r => r.changeStatus === 'Temporary' && r.expiryDate && r.expiryDate < today && r.status !== 'Closed');
    return { pending, approved, closed, rejected, major, expired, total: mocs.length };
  }, [mocs]);

  const postMOC = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'saveMOC', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  const updateMOC = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'updateMOC', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  return { mocs, summary, loading, error, lastFetched, refresh: fetchData, postMOC, updateMOC };
}
