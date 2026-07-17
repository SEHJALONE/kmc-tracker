import { useState, useEffect, useCallback, useRef } from 'react';
import { CATALOG_WRITE_URL, CATALOG_ADMIN_TOKEN } from '../data/catalogConfig';

// Access requests (sign-up applications), shared across every device via the
// Apps Script-backed private sheet (see APPS_SCRIPT_CATALOG.md) instead of
// per-browser localStorage — this is what lets a request submitted on one PC
// show up in Access Requests on another.

const LS_CACHE_KEY = 'kmc_access_requests_cache';
const REFRESH_INTERVAL = 60000;

function loadCache() { try { return JSON.parse(localStorage.getItem(LS_CACHE_KEY) || '[]'); } catch { return []; } }
function saveCache(list) { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(list)); }

export function useAccessRequests() {
  const [requests, setRequests] = useState(loadCache);
  const [loading, setLoading]   = useState(true);
  const mounted = useRef(true);

  const fetchRequests = useCallback(async () => {
    try {
      const body = new URLSearchParams({ action: 'listAccessRequests', token: CATALOG_ADMIN_TOKEN });
      const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
      const json = await res.json();
      if (json.status !== 'ok') throw new Error(json.message || 'unknown-error');
      if (mounted.current) setRequests(json.requests || []);
      saveCache(json.requests || []);
    } catch (e) {
      console.warn('Access requests: could not load shared list, using local cache.', e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchRequests();
    const id = setInterval(fetchRequests, REFRESH_INTERVAL);
    return () => { mounted.current = false; clearInterval(id); };
  }, [fetchRequests]);

  // Applicant-side: no admin token — anyone can submit a request (same trust
  // level as submitting a travel card). Only an admin session can list them
  // back or approve/deny/delete. Fire-and-forget (no-cors) like saveCatalog.
  const submitRequest = useCallback(async (req) => {
    try {
      const body = new URLSearchParams({ action: 'submitAccessRequest', payload: JSON.stringify(req) });
      await fetch(CATALOG_WRITE_URL, { method: 'POST', mode: 'no-cors', body });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const updateRequest = useCallback(async (patch) => {
    setRequests(prev => { const next = prev.map(r => r.id === patch.id ? { ...r, ...patch } : r); saveCache(next); return next; });
    try {
      const body = new URLSearchParams({ action: 'updateAccessRequest', token: CATALOG_ADMIN_TOKEN, payload: JSON.stringify(patch) });
      const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
      const json = await res.json();
      return json.status === 'ok' ? { ok: true } : { ok: false, error: json.message };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const deleteRequest = useCallback(async (id) => {
    setRequests(prev => { const next = prev.filter(r => r.id !== id); saveCache(next); return next; });
    try {
      const body = new URLSearchParams({ action: 'deleteAccessRequest', token: CATALOG_ADMIN_TOKEN, id });
      const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
      const json = await res.json();
      return json.status === 'ok' ? { ok: true } : { ok: false, error: json.message };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  return { requests, loading, submitRequest, updateRequest, deleteRequest, refreshRequests: fetchRequests };
}
