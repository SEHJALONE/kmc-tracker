import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Single source of truth URL ───────────────────────────────────────────────
// This URL is shared by:
//   • useStationTimes()  — React hook used by the Bus Tracker
//   • fetchStationTimes() — plain async function used by the Travel Card
// Changing this one constant updates both consumers simultaneously.
export const STATION_TIMES_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQaiOeH78PS8rtCQOTd38jCTioVCQRan3Bg4MJcPbNB87odrcmsL_qA3cEPdAzfTZsP11Dqr1aNA7OY/pub?gid=343120708&single=true&output=csv';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ─── CSV parser (shared by hook and standalone fetcher) ───────────────────────
/**
 * Parses the Station Times published CSV.
 *
 * Expected columns (flexible header matching — order doesn't matter):
 *   Shop | Station Code | Station Name | Estimated Time (min)
 *
 * Also handles:
 *   • Quoted cells and commas inside quotes
 *   • Merged codes like "B02-07/B03-05" — both codes get the same time
 *   • Rows with no code or time are silently skipped
 *
 * Returns: { [stationCode: string]: estimatedMinutes: number }
 */
export function parseStationTimes(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const codeIdx = headers.findIndex(
    h => h.includes('station code') || h.includes('stationcode') || h === 'code'
  );
  const timeIdx = headers.findIndex(
    h => h.includes('estimated') || h.includes('time') || h.includes('min')
  );
  // Optional: station name column — stored for richer travel card dropdowns
  const nameIdx = headers.findIndex(
    h => h.includes('station name') || h.includes('stationname') || h === 'name'
  );

  if (codeIdx === -1 || timeIdx === -1) {
    console.warn('KMC Station Times: Could not find required columns. Headers:', headers);
    return {};
  }

  function parseCells(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  }

  // result shape: { [code]: { minutes: number, name?: string } }
  // We also keep a flat minutes-only map for backwards compat.
  const result = {};

  for (let i = 1; i < lines.length; i++) {
    const cells   = parseCells(lines[i]);
    const rawCode = cells[codeIdx]?.trim().toUpperCase().replace(/\s+/g, '-');
    const rawTime = cells[timeIdx]?.trim();
    const rawName = nameIdx >= 0 ? cells[nameIdx]?.trim() : undefined;

    if (!rawCode || !rawTime) continue;

    const codes   = rawCode.split('/').map(c => c.trim()).filter(Boolean);
    const minutes = parseFloat(rawTime);
    if (isNaN(minutes) || minutes <= 0) continue;

    for (const code of codes) {
      result[code] = { minutes, name: rawName || undefined };
    }
  }

  return result;
}

// ─── Standalone async fetcher (for Travel Card and non-hook contexts) ─────────
/**
 * Fetches and parses the Station Times sheet once.
 * Safe to call from plain JS, a React useEffect, or an Apps Script web app.
 *
 * Returns: {
 *   times:          { [stationCode]: { minutes, name? } },
 *   getMinutes:     (stationCode) => number | null,
 *   getName:        (stationCode) => string | null,
 * }
 *
 * Throws on network or parse failure so callers can handle gracefully.
 *
 * Usage in Travel Card:
 *   const { getMinutes } = await fetchStationTimes();
 *   const designed = getMinutes('B04-01'); // → e.g. 240
 */
export async function fetchStationTimes() {
  const res = await fetch(STATION_TIMES_URL + '&t=' + Date.now());
  if (!res.ok) throw new Error(`Station Times fetch failed: HTTP ${res.status}`);
  const text  = await res.text();
  const times = parseStationTimes(text);

  return {
    times,
    /** Returns estimated minutes for a station code, or null if not found. */
    getMinutes: (code) => {
      if (!code) return null;
      const norm = code.trim().toUpperCase().replace(/\s+/g, '-');
      return times[norm]?.minutes ?? null;
    },
    /** Returns the station name from the Sheet, or null if not present. */
    getName: (code) => {
      if (!code) return null;
      const norm = code.trim().toUpperCase().replace(/\s+/g, '-');
      return times[norm]?.name ?? null;
    },
  };
}

// ─── React hook (Bus Tracker) ─────────────────────────────────────────────────
/**
 * Hook — returns {
 *   stationTimes:    { [stationCode]: number }   ← backwards-compatible flat map
 *   stationTimesRaw: { [stationCode]: { minutes, name? } }  ← full data
 *   getDesignedTime: (stationCode) => number | null
 *   loading:         boolean
 *   error:           string | null
 *   lastFetched:     Date | null
 * }
 *
 * Backwards compatible: existing consumers of `stationTimes[code]` continue
 * to work unchanged because the flat map is still returned alongside the new API.
 */
export function useStationTimes() {
  const [stationTimesRaw, setStationTimesRaw] = useState({});
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [lastFetched, setLastFetched]         = useState(null);

  const fetchTimes = useCallback(async () => {
    try {
      const res = await fetch(STATION_TIMES_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text   = await res.text();
      const parsed = parseStationTimes(text);
      setStationTimesRaw(parsed);
      setLastFetched(new Date());
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

  // Backwards-compatible flat map: { [code]: minutes }
  // Existing code doing stationTimes[code] or stationTimes[bus.stationCode]
  // continues to work without any changes.
  const stationTimes = Object.fromEntries(
    Object.entries(stationTimesRaw).map(([code, v]) => [code, v.minutes])
  );

  /**
   * Looks up the designed time for a station code.
   * Normalises the code (uppercase, spaces→hyphens) before lookup.
   * Returns minutes as a number, or null if the station has no entry.
   *
   * Usage: const mins = getDesignedTime('B04-01')  → 240
   */
  const getDesignedTime = useCallback(
    (code) => {
      if (!code) return null;
      const norm = code.trim().toUpperCase().replace(/\s+/g, '-');
      return stationTimesRaw[norm]?.minutes ?? null;
    },
    [stationTimesRaw]
  );

  return {
    stationTimes,       // { [code]: minutes }  — unchanged API
    stationTimesRaw,    // { [code]: { minutes, name? } } — new, richer
    getDesignedTime,    // (code) => number | null — new
    loading,
    error,
    lastFetched,        // Date | null — new
  };
}
