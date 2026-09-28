import { useState, useEffect, useCallback } from 'react';
import { CATALOG_WRITE_URL } from '../data/catalogConfig';

// Custom consumables someone added at a station ("Other consumable / material")
// are shared by everyone filling that station, on any device, until someone
// deliberately deletes them. They live in the "station_consumables" tab of the
// NI Travel Tool Data sheet (station_code | name | added_by | added_at), written
// by the Apps Script (see APPS_SCRIPT_CATALOG.md) and read back via gviz CSV.
const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=station_consumables`;

const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');
const key = (code, name) => normCode(code) + '|' + String(name).trim().toLowerCase();

function parseRow(line) {
  const cells = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

// CSV → { "T01-03": ["Rivets 4mm", …] }. gviz serves the FIRST tab when the
// named one doesn't exist yet, so anything without our header is ignored.
export function parseStationConsumables(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return {};
  const headers = parseRow(lines[0]).map(h => h.toLowerCase());
  const ci = headers.indexOf('station_code');
  const ni = headers.indexOf('name');
  if (ci === -1 || ni === -1) return {};
  const out = {};
  for (const line of lines.slice(1)) {
    const cells = parseRow(line);
    const code = normCode(cells[ci]);
    const name = (cells[ni] || '').trim();
    if (!code || !name) continue;
    const list = out[code] || (out[code] = []);
    if (!list.some(n => n.toLowerCase() === name.toLowerCase())) list.push(name);
  }
  return out;
}

// Plain form fields, deliberately NOT a JSON "payload": an older deployed
// Apps Script treats any unknown payload POST as a travel-card submission,
// whereas a POST with no payload just errors harmlessly there.
function post(params) {
  return fetch(CATALOG_WRITE_URL, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(params) })
    .then(() => true, () => false);
}

export function useStationConsumables() {
  const [byCode, setByCode] = useState({});
  // Names deleted during this session — hides them until the (cached) gviz
  // feed catches up with the delete.
  const [tombstones, setTombstones] = useState(() => new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(READ_URL + '&t=' + Date.now());
      if (res.ok) setByCode(parseStationConsumables(await res.text()));
    } catch { /* offline — local memory still works */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const namesFor = useCallback(
    (code) => (byCode[normCode(code)] || []).filter(n => !tombstones.has(key(code, n))),
    [byCode, tombstones],
  );

  const add = useCallback((code, name, by = '') => {
    const c = normCode(code), n = String(name).trim();
    if (!c || !n) return Promise.resolve(false);
    setTombstones(prev => { const s = new Set(prev); s.delete(key(c, n)); return s; });
    setByCode(prev => {
      const list = prev[c] || [];
      return list.some(x => x.toLowerCase() === n.toLowerCase()) ? prev : { ...prev, [c]: [...list, n] };
    });
    return post({ action: 'addStationConsumable', code: c, name: n, by });
  }, []);

  const remove = useCallback((code, name) => {
    const c = normCode(code), n = String(name).trim();
    setTombstones(prev => new Set(prev).add(key(c, n)));
    setByCode(prev => ({ ...prev, [c]: (prev[c] || []).filter(x => x.toLowerCase() !== n.toLowerCase()) }));
    return post({ action: 'deleteStationConsumable', code: c, name: n });
  }, []);

  return { byCode, namesFor, add, remove, refresh };
}
