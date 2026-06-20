import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CATALOG_READ_URL,
  CATALOG_WRITE_URL,
  CATALOG_ADMIN_TOKEN,
  EMPTY_CATALOG,
  normalizeCatalog,
} from '../data/catalogConfig';
import { applyCatalog } from '../data/stations';

const REFRESH_INTERVAL = 120000; // 2 min — catalog changes rarely

// Parse a full CSV document into rows of cells. Handles quoted fields with
// embedded commas, newlines, and doubled-quote escapes ("" → ").
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Extract the catalog JSON document from the Catalog tab CSV.
// The tab holds rows of [key, value]. A large catalog is split across several
// rows ('catalog', 'catalog.1', 'catalog.2', …) because a single Sheets cell
// caps at 50k characters — so we gather every chunk, order them, and join.
function extractCatalog(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return null;
  const chunks = [];
  for (let i = 1; i < rows.length; i++) {
    const key = (rows[i][0] || '').trim().toLowerCase();
    if (key === 'catalog' || key.startsWith('catalog.')) {
      const idx = key === 'catalog' ? 0 : parseInt(key.split('.')[1] || '0', 10);
      chunks.push({ idx, val: rows[i][1] || '' });
    }
  }
  if (!chunks.length) return null;
  chunks.sort((a, b) => a.idx - b.idx);
  try { return JSON.parse(chunks.map(c => c.val).join('')); } catch { return null; }
}

export function useCatalog() {
  const [catalog, setCatalog] = useState(() => ({ ...EMPTY_CATALOG }));
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [saving, setSaving]   = useState(false);
  const mounted = useRef(true);

  // Push the catalog into the stations module so the bus tracker reflects edits.
  const apply = useCallback((cat) => {
    const normalized = normalizeCatalog(cat);
    applyCatalog(normalized);
    if (mounted.current) setCatalog(normalized);
    return normalized;
  }, []);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch(CATALOG_READ_URL + '&t=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = extractCatalog(await res.text());
      apply(raw); // raw may be null → normalizes to empty seed
      if (mounted.current) setError(null);
    } catch (e) {
      // Non-fatal: the app falls back to built-in seed data.
      console.warn('Catalog: could not load shared catalog, using defaults.', e.message);
      if (mounted.current) setError('catalog-unavailable');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    fetchCatalog();
    const id = setInterval(fetchCatalog, REFRESH_INTERVAL);
    return () => { mounted.current = false; clearInterval(id); };
  }, [fetchCatalog]);

  // Persist a new catalog. Optimistically applies locally, then writes through
  // the Apps Script. no-cors gives an opaque response, so we re-fetch after a
  // short delay to confirm/reconcile with the server copy.
  const saveCatalog = useCallback(async (next) => {
    const normalized = apply(next); // optimistic local update + tracker reflect
    setSaving(true);
    try {
      const body = new URLSearchParams({
        action: 'saveCatalog',
        token: CATALOG_ADMIN_TOKEN,
        payload: JSON.stringify(normalized),
      });
      await fetch(CATALOG_WRITE_URL, { method: 'POST', mode: 'no-cors', body });
      // Give Sheets a moment to commit, then reconcile.
      setTimeout(() => { if (mounted.current) fetchCatalog(); }, 1500);
      return { ok: true };
    } catch (e) {
      console.error('Catalog save failed:', e);
      return { ok: false, error: e.message };
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [apply, fetchCatalog]);

  return { catalog, loading, error, saving, saveCatalog, refreshCatalog: fetchCatalog };
}
