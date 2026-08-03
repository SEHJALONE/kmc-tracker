import { useState, useEffect, useCallback } from 'react';

// Daily Activities Log — a supervisor's own, independently-entered record of
// "bus X was at station Y on day Z, roughly at time T", read live from the
// `bus_sightings` tab. Deliberately separate from useSheetData/useNCRData
// (which read Travel Card's own submissions) so it can serve as an honest
// cross-check on Travel Card entries rather than just echoing them back.

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const SIGHTINGS_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=bus_sightings`;
const PROJECTS_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=projects`;

export const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbyHsyDOXkIURCTNrsxl4MbUVhqZxNco0qz1Bl95UePnesSQgnbJlfyIuiy7FkuAOH_q/exec';

const REFRESH_INTERVAL = 60 * 1000;

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
  return { headers, rows: lines.slice(1).map(parseCells) };
}

function col(headers, row, name) {
  const idx = headers.indexOf(name);
  return idx >= 0 ? (row[idx]?.trim() || '') : '';
}

export function useBusSightings() {
  const [sightings, setSightings] = useState([]);
  const [projectVins, setProjectVins] = useState({}); // { project: [vin, ...] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(SIGHTINGS_URL + '&t=' + Date.now()),
        fetch(PROJECTS_URL + '&t=' + Date.now()),
      ]);
      const [sText, pText] = await Promise.all([sRes.text(), pRes.text()]);

      const { headers: sh, rows: srows } = parseCSV(sText);
      const parsed = srows.map(r => {
        const id = col(sh, r, 'record_id');
        if (!id) return null;
        return {
          id,
          date: col(sh, r, 'date'),
          project: col(sh, r, 'project'),
          vin: col(sh, r, 'vin'),
          busModel: col(sh, r, 'bus_model'),
          line: col(sh, r, 'line'),
          station: col(sh, r, 'station'),
          stationCode: col(sh, r, 'station_code'),
          time: col(sh, r, 'time'),
          loggedBy: col(sh, r, 'logged_by'),
          createdAt: col(sh, r, 'created_at'),
        };
      }).filter(Boolean);
      setSightings(parsed);

      const { headers: ph, rows: prows } = parseCSV(pText);
      const byProject = {};
      prows.forEach(r => {
        const project = col(ph, r, 'project');
        const vin = col(ph, r, 'vin');
        if (!project || !vin) return;
        (byProject[project] ||= new Set()).add(vin);
      });
      const asArrays = {};
      Object.entries(byProject).forEach(([p, set]) => { asArrays[p] = [...set].sort(); });
      setProjectVins(asArrays);

      setError(null);
    } catch (e) {
      console.warn('KMC useBusSightings: fetch failed.', e.message);
      setError('Could not load the daily activities log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const addSighting = useCallback(async (sighting) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'saveBusSighting', ...sighting }) });
    try {
      await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
      setTimeout(fetchData, 2500);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [fetchData]);

  const deleteSighting = useCallback(async (id) => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'deleteBusSighting', id }) });
    try {
      await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', body });
      setSightings(prev => prev.filter(s => s.id !== id));
      setTimeout(fetchData, 2500);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [fetchData]);

  return { sightings, projectVins, loading, error, refresh: fetchData, addSighting, deleteSighting };
}
