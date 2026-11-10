import { useState, useEffect, useCallback, useRef } from 'react';
import { CATALOG_WRITE_URL } from '../data/catalogConfig';
import { sessionParam } from '../data/session';

// Access requests (sign-up applications), shared across every device via the
// Apps Script-backed private sheet (see APPS_SCRIPT_CATALOG.md) instead of
// per-browser localStorage — this is what lets a request submitted on one PC
// show up in Access Requests on another.
//
// Every call reports what the server actually said. Earlier versions posted
// with `no-cors` and swallowed errors, so an applicant was told "submitted"
// when nothing had been stored, and an admin saw an empty list when the server
// had refused them. Nothing here hides a failure any more.

const LS_CACHE_KEY = 'kmc_access_requests_cache';
const REFRESH_INTERVAL = 60000;

function loadCache() { try { return JSON.parse(localStorage.getItem(LS_CACHE_KEY) || '[]'); } catch { return []; } }
function saveCache(list) { try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ } }

// What the Apps Script says → words a person can act on.
export function describeRequestError(code) {
  switch (code) {
    case 'network':
      return 'Could not reach the server. Check your connection and try again.';
    case 'unauthorized':
      return 'The server did not accept your sign-in for this action. Sign out and sign in again. '
        + 'If it keeps happening, the server script is out of date and needs updating.';
    case 'username-taken':
      return 'That username is already in use. Choose another.';
    case 'request-already-pending':
      return 'A request for this username is already waiting for approval.';
    case 'rate-limited':
      return 'Too many requests were sent just now. Try again in a while.';
    case 'missing-fields':
      return 'Name, email, username and password are all required.';
    default:
      return `The server did not accept the request${code ? ` (${code})` : ''}.`;
  }
}

async function post(fields) {
  let res;
  try {
    res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body: new URLSearchParams(fields) });
  } catch {
    return { ok: false, code: 'network' };
  }
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (json && json.status === 'ok') return { ok: true, json };
  return { ok: false, code: (json && json.message) || 'bad-response' };
}

// Applicant side: public, no sign-in. Resolves { ok, id } or { ok:false, error }.
// Only a reply from the server that says "ok" counts as stored.
export async function submitAccessRequest(req) {
  const r = await post({ action: 'submitAccessRequest', payload: JSON.stringify(req) });
  return r.ok
    ? { ok: true, id: r.json.id }
    : { ok: false, code: r.code, error: describeRequestError(r.code) };
}

export function useAccessRequests() {
  const [requests, setRequests] = useState(loadCache);
  const [loading, setLoading]   = useState(true);
  // null = the last load worked; otherwise { code, message } and `requests` is a saved copy
  const [loadError, setLoadError] = useState(null);
  const mounted = useRef(true);

  const fetchRequests = useCallback(async () => {
    const r = await post({ action: 'listAccessRequests', ...sessionParam() });
    if (!mounted.current) return;
    if (r.ok) {
      const list = r.json.requests || [];
      setRequests(list);
      saveCache(list);
      setLoadError(null);
    } else {
      // Keep showing the saved copy, but say plainly that it is not live.
      setLoadError({ code: r.code, message: describeRequestError(r.code) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchRequests();
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchRequests(); }, REFRESH_INTERVAL);
    return () => { mounted.current = false; clearInterval(id); };
  }, [fetchRequests]);

  const submitRequest = useCallback(submitAccessRequest, []);

  // Optimistic: the row changes at once, and is put back to what the server
  // holds if the server refuses.
  const updateRequest = useCallback(async (patch) => {
    setRequests(prev => { const next = prev.map(r => r.id === patch.id ? { ...r, ...patch } : r); saveCache(next); return next; });
    const r = await post({ action: 'updateAccessRequest', ...sessionParam(), payload: JSON.stringify(patch) });
    // emailed / emailError: whether the server told the applicant (on approval).
    if (r.ok) return { ok: true, emailed: !!r.json.emailed, emailError: r.json.emailError || '' };
    fetchRequests();
    return { ok: false, error: describeRequestError(r.code) };
  }, [fetchRequests]);

  const deleteRequest = useCallback(async (id) => {
    setRequests(prev => { const next = prev.filter(r => r.id !== id); saveCache(next); return next; });
    const r = await post({ action: 'deleteAccessRequest', ...sessionParam(), id });
    if (r.ok) return { ok: true };
    fetchRequests();
    return { ok: false, error: describeRequestError(r.code) };
  }, [fetchRequests]);

  return { requests, loading, loadError, submitRequest, updateRequest, deleteRequest, refreshRequests: fetchRequests };
}
