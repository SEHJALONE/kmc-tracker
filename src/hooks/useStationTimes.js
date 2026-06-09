import { useState, useEffect, useCallback } from 'react';

// Station Times sheet — published CSV
const STATION_TIMES_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQaiOeH78PS8rtCQOTd38jCTioVCQRan3Bg4MJcPbNB87odrcmsL_qA3cEPdAzfTZsP11Dqr1aNA7OY/pub?gid=343120708&single=true&output=csv';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Parses the Station Times CSV.
 * Expected columns (flexible header matching):
 *   Shop | Station Code | Station Name | Estimated Time (min)
 *
 * Returns: { [stationCode]: estimatedMinutes }
 */
function parseStationTimes(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const codeIdx = headers.findIndex(h => h.includes('station code') || h.includes('stationcode') || h === 'code');
  const timeIdx = headers.findIndex(h => h.includes('estimated') || h.includes('time') || h.includes('min'));

  if (codeIdx === -1 || timeIdx === -1) {
    console.warn('KMC Station Times: Could not find required columns. Headers:', headers);
    return {};
  }

  const result = {};
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

    const rawCode = cells[codeIdx]?.trim().toUpperCase().replace(/\s+/g, '-');
    const rawTime = cells[timeIdx]?.trim();

    if (!rawCode || !rawTime) continue;

    // Handle merged codes like "B02-07/B03-05" — apply same time to both
    const codes = rawCode.split('/').map(c => c.trim()).filter(Boolean);
    const minutes = parseFloat(rawTime);
    if (!isNaN(minutes) && minutes > 0) {
      for (const code of codes) {
        result[code] = minutes;
      }
    }
  }

  return result;
}

/**
 * Hook — returns { stationTimes, loading, error }
 * stationTimes: { [stationCode]: estimatedMinutes }
 */
export function useStationTimes() {
  const [stationTimes, setStationTimes] = useState({});
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const fetchTimes = useCallback(async () => {
    try {
      const res = await fetch(STATION_TIMES_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseStationTimes(text);
      setStationTimes(parsed);
      setError(null);
    } catch (e) {
      console.warn('KMC Station Times: Could not load estimated times.', e.message);
      setError('Could not load station estimated times.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimes();
    const interval = setInterval(fetchTimes, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchTimes]);

  return { stationTimes, loading, error };
}
