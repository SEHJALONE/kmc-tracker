import { useState, useEffect, useCallback, useMemo } from 'react';

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
export const INCIDENT_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=incidents`;

export const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbwd3fW_ygzXVAtU3vgJg_l9hxab52l-nRt5S-X4I8nuqm5f0anh9JvLv8TjjsQtoWFf/exec';

const REFRESH_INTERVAL = 2 * 60 * 1000;

// ── IMS PR003 classification constants ────────────────────────────────────────

export const INCIDENT_TYPES = [
  'Accident',
  'Near Miss',
  'Unsafe Condition',
  'Unsafe Act',
  'Equipment Malfunction',
  'Environmental Incident',
];

// Class A / B / C per IMS §7.4
export const INCIDENT_CLASSES = ['Class A — Critical', 'Class B — Major', 'Class C — Minor'];

export const INCIDENT_STATUSES = [
  'Reported',
  'Under Investigation',
  'CAPA Pending',
  'Closed',
  'Escalated',
];

export const RCA_METHODS = ['5-Why', '8D', 'Fishbone', 'DMAIC'];

// Auto-suggest class from selected type (per IMS §7.5)
export function suggestClass(incidentType) {
  if (!incidentType) return '';
  if (incidentType === 'Accident') return 'Class A — Critical';
  if (incidentType === 'Near Miss' || incidentType === 'Unsafe Condition' || incidentType === 'Unsafe Act') return 'Class C — Minor';
  if (incidentType === 'Equipment Malfunction') return 'Class B — Major';
  if (incidentType === 'Environmental Incident') return 'Class B — Major';
  return 'Class C — Minor';
}

// Escalation target by class (per IMS §7.5)
export const CLASS_ESCALATION = {
  'Class A — Critical': 'CEO / Board of Directors',
  'Class B — Major':    'Director, DQHSE',
  'Class C — Minor':    'Workplace Safety Manager',
};

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

function parseIncidentCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const raw = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (...names) => raw.findIndex(h => names.some(n => h.includes(n)));

  const idxId         = col('incident_id', 'incident id');
  const idxTs         = col('timestamp');
  const idxBy         = col('reported_by', 'reported by');
  const idxLine       = col('location_line', 'location line');
  const idxStation    = col('location_station', 'location station');
  const idxType       = col('incident_type', 'incident type');
  const idxClass      = col('classification');
  const idxDesc       = col('description');
  const idxImmediate  = col('immediate_action', 'immediate action');
  const idxInjured    = col('injured_persons', 'injured persons');
  const idxProperty   = col('property_damage', 'property damage');
  const idxEquipment  = col('equipment_affected', 'equipment affected');
  const idxWitness    = col('witness_names', 'witness names');
  const idxStatus     = col('status');
  const idxInvDue     = col('investigation_due', 'investigation due');
  const idxInvSub     = col('investigation_submitted', 'investigation submitted');
  const idxRoot       = col('root_cause', 'root cause');
  const idxRca        = col('rca_method', 'rca method');
  const idxCA         = col('corrective_action', 'corrective action');
  const idxPA         = col('preventive_action', 'preventive action');
  const idxInvestigator = col('assigned_investigator', 'assigned investigator');
  const idxClosed     = col('closed_date', 'closed date');
  const idxEscalated  = col('escalated_to', 'escalated to');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCells(lines[i]);
    const id = idxId >= 0 ? c[idxId]?.trim() : null;
    if (!id) continue;
    rows.push({
      id,
      timestamp:               idxTs          >= 0 ? c[idxTs]?.trim()          || null : null,
      reportedBy:              idxBy          >= 0 ? c[idxBy]?.trim()          || null : null,
      locationLine:            idxLine        >= 0 ? c[idxLine]?.trim()        || null : null,
      locationStation:         idxStation     >= 0 ? c[idxStation]?.trim()     || null : null,
      incidentType:            idxType        >= 0 ? c[idxType]?.trim()        || null : null,
      classification:          idxClass       >= 0 ? c[idxClass]?.trim()       || null : null,
      description:             idxDesc        >= 0 ? c[idxDesc]?.trim()        || null : null,
      immediateAction:         idxImmediate   >= 0 ? c[idxImmediate]?.trim()   || null : null,
      injuredPersons:          idxInjured     >= 0 ? c[idxInjured]?.trim()     || null : null,
      propertyDamage:          idxProperty    >= 0 ? c[idxProperty]?.trim()    || null : null,
      equipmentAffected:       idxEquipment   >= 0 ? c[idxEquipment]?.trim()   || null : null,
      witnessNames:            idxWitness     >= 0 ? c[idxWitness]?.trim()     || null : null,
      status:                  idxStatus      >= 0 ? c[idxStatus]?.trim()      || 'Reported' : 'Reported',
      investigationDue:        idxInvDue      >= 0 ? c[idxInvDue]?.trim()      || null : null,
      investigationSubmitted:  idxInvSub      >= 0 ? c[idxInvSub]?.trim()      || null : null,
      rootCause:               idxRoot        >= 0 ? c[idxRoot]?.trim()        || null : null,
      rcaMethod:               idxRca         >= 0 ? c[idxRca]?.trim()         || null : null,
      correctiveAction:        idxCA          >= 0 ? c[idxCA]?.trim()          || null : null,
      preventiveAction:        idxPA          >= 0 ? c[idxPA]?.trim()          || null : null,
      assignedInvestigator:    idxInvestigator>= 0 ? c[idxInvestigator]?.trim()|| null : null,
      closedDate:              idxClosed      >= 0 ? c[idxClosed]?.trim()      || null : null,
      escalatedTo:             idxEscalated   >= 0 ? c[idxEscalated]?.trim()   || null : null,
    });
  }
  return rows;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useIncidentData() {
  const [incidents,   setIncidents]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(INCIDENT_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIncidents(parseIncidentCSV(await res.text()));
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      console.warn('KMC useIncidentData: fetch failed.', e.message);
      setError('Could not load incident data.');
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
    const today = new Date().toISOString().slice(0, 10);
    const open  = incidents.filter(r => r.status !== 'Closed');
    const byClass = {
      A: incidents.filter(r => r.classification?.includes('Class A')),
      B: incidents.filter(r => r.classification?.includes('Class B')),
      C: incidents.filter(r => r.classification?.includes('Class C')),
    };
    const overdueInvestigation = open.filter(
      r => r.investigationDue && r.investigationDue < today && !r.investigationSubmitted
    );
    return { open, byClass, overdueInvestigation, total: incidents.length };
  }, [incidents]);

  const postIncident = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'saveIncident', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  const updateIncident = useCallback(async (data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'updateIncident', ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  return { incidents, summary, loading, error, lastFetched, refresh: fetchData, postIncident, updateIncident };
}
