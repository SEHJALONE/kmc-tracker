import { useState, useEffect, useCallback } from 'react';
import { lookupStation } from '../data/stations';

// ✅ Original working URL — do not add gid, this fetches Sheet1 by default
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQYG6cmN-DMkeKAIBJmEMUsocg_yLAhgC_dr7aRfu4ICkc8aLOC4mrYdXyOXULcBA/pub?output=csv';
const REFRESH_INTERVAL = 60000;

function parseCSV(text) {
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
    // ✅ preserve casing: "12m EVS" not "12M EVS"
    const model     = cells[modelIdx]?.trim() ?? '';
    const stCode    = cells[stationIdx]?.trim().toUpperCase().replace(/\s+/g, '-');
    const timestamp = timestampIdx >= 0 ? cells[timestampIdx]?.trim() : '';

    if (!vin || !stCode) continue;
    rows.push({ vin, model, stationCode: stCode, timestamp, rawTimestamp: timestamp });
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

  // Log unknown codes to console so you can add them to stations.js
  const unknown = [...new Set(
    enriched.filter(e => !e.station && e.stationCode).map(e => e.stationCode)
  )];
  if (unknown.length > 0) {
    console.warn('KMC Tracker: Station codes not in stations.js (buses hidden):', unknown);
  }

  return enriched.filter(e => e.station);
}

export function useSheetData() {
  const [buses, setBuses]             = useState([]);
  const [allRows, setAllRows]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(SHEET_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseCSV(text);
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

  return { buses, allRows, loading, error, lastUpdated, refresh: fetchData };
}
