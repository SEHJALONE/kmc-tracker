import { useState, useEffect, useCallback, useMemo } from 'react';

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const TAB_URL = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

export const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbyHsyDOXkIURCTNrsxl4MbUVhqZxNco0qz1Bl95UePnesSQgnbJlfyIuiy7FkuAOH_q/exec';

const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes

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

function parseRows(text, colNames) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const raw = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (...names) => raw.findIndex(h => names.some(n => h.includes(n)));
  const idx = {};
  for (const [key, names] of Object.entries(colNames)) idx[key] = col(...names);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCells(lines[i]);
    const row = {};
    for (const key of Object.keys(colNames)) {
      row[key] = idx[key] >= 0 ? (c[idx[key]]?.trim() || null) : null;
    }
    if (row.id) rows.push(row);
  }
  return rows;
}

function parseMachines(text) {
  return parseRows(text, {
    id: ['record_id'], stationCode: ['station_code'], activity: ['activity'],
    machineName: ['machine_name'], active: ['active'], createdAt: ['created_at'], createdBy: ['created_by'],
  }).map(r => ({ ...r, active: String(r.active).toUpperCase() !== 'FALSE' }));
}

function parseRateHistory(text, rateKey = ['rate_ugx_per_hour']) {
  return parseRows(text, {
    id: ['record_id'], machineId: ['machine_id'], rate: rateKey,
    validFrom: ['valid_from'], validTo: ['valid_to'], createdAt: ['created_at'], createdBy: ['created_by'],
  }).map(r => ({ ...r, rate: r.rate != null ? parseFloat(r.rate) : null }));
}

// Resolves whichever rate row applies "as of" a given date (defaults to
// today) — the most recent entry whose valid_from is on/before that date and
// whose valid_to is either blank (open-ended) or on/after it. This is the
// whole point of time-bounded rate history: changing a rate never rewrites
// past costing, because past dates keep resolving to the rate that was
// actually in force then.
export function resolveRateAsOf(rateRows, asOf = new Date().toISOString().slice(0, 10), machineId = null) {
  const pool = machineId == null ? rateRows : rateRows.filter(r => r.machineId === machineId);
  const applicable = pool.filter(r =>
    r.rate != null && r.validFrom && r.validFrom <= asOf && (!r.validTo || r.validTo >= asOf)
  );
  if (!applicable.length) return null;
  applicable.sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  return applicable[applicable.length - 1].rate;
}

export function useMachineCostData() {
  const [machines,     setMachines]     = useState([]);
  const [machineRates, setMachineRates] = useState([]);
  const [staffRates,   setStaffRates]   = useState([]);
  const [energyRates,  setEnergyRates]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [lastFetched,  setLastFetched]  = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [mRes, mrRes, srRes, erRes] = await Promise.all([
        fetch(TAB_URL('machines') + '&t=' + Date.now()),
        fetch(TAB_URL('machine_rates') + '&t=' + Date.now()),
        fetch(TAB_URL('staff_rates') + '&t=' + Date.now()),
        fetch(TAB_URL('energy_rates') + '&t=' + Date.now()),
      ]);
      const [mText, mrText, srText, erText] = await Promise.all([
        mRes.text(), mrRes.text(), srRes.text(), erRes.text(),
      ]);
      setMachines(mRes.ok ? parseMachines(mText) : []);
      setMachineRates(mrRes.ok ? parseRateHistory(mrText) : []);
      setStaffRates(srRes.ok ? parseRateHistory(srText) : []);
      setEnergyRates(erRes.ok ? parseRateHistory(erText, ['rate_ugx_per_kwh']) : []);
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      console.warn('KMC useMachineCostData: fetch failed.', e.message);
      setError('Could not load machine cost data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const activeMachines = useMemo(() => machines.filter(m => m.active), [machines]);

  const post = useCallback(async (action, data) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action, ...data }) });
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
    setTimeout(fetchData, 3000);
  }, [fetchData]);

  const postMachine      = useCallback((data) => post('saveMachine', data), [post]);
  const updateMachine    = useCallback((data) => post('updateMachine', data), [post]);
  const archiveMachine   = useCallback((id) => post('updateMachine', { id, active: false }), [post]);
  const postMachineRate  = useCallback((data) => post('saveMachineRate', data), [post]);
  const postStaffRate    = useCallback((data) => post('saveStaffRate', data), [post]);
  const postEnergyRate   = useCallback((data) => post('saveEnergyRate', data), [post]);

  return {
    machines, activeMachines, machineRates, staffRates, energyRates,
    loading, error, lastFetched, refresh: fetchData,
    postMachine, updateMachine, archiveMachine, postMachineRate, postStaffRate, postEnergyRate,
  };
}
