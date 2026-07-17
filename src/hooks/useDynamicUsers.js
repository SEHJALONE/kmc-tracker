import { useState, useEffect, useCallback, useRef } from 'react';
import { CATALOG_WRITE_URL, CATALOG_ADMIN_TOKEN } from '../data/catalogConfig';

// Dynamic (granted-access) user accounts, shared across every device via the
// Apps Script-backed private sheet (see APPS_SCRIPT_CATALOG.md) instead of
// per-browser localStorage. Passwords are never sent back on reads — only
// `login`, `createDynamicUser` (from an approved request, which already
// carries the applicant's real password) and `updateDynamicUser` (only when
// the admin explicitly sets a new one) ever touch a password server-side.

const LS_CACHE_KEY = 'kmc_dynamic_users_cache';
const REFRESH_INTERVAL = 60000; // 1 min — admin edits should show up promptly

function loadCache() { try { return JSON.parse(localStorage.getItem(LS_CACHE_KEY) || '[]'); } catch { return []; } }
function saveCache(list) { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(list)); }

export function useDynamicUsers() {
  const [users, setUsers]     = useState(loadCache);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const mounted = useRef(true);

  const fetchUsers = useCallback(async () => {
    try {
      const body = new URLSearchParams({ action: 'listDynamicUsers', token: CATALOG_ADMIN_TOKEN });
      const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
      const json = await res.json();
      if (json.status !== 'ok') throw new Error(json.message || 'unknown-error');
      if (mounted.current) setUsers(json.users || []);
      saveCache(json.users || []);
    } catch (e) {
      console.warn('Dynamic users: could not load shared list, using local cache.', e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchUsers();
    const id = setInterval(fetchUsers, REFRESH_INTERVAL);
    return () => { mounted.current = false; clearInterval(id); };
  }, [fetchUsers]);

  // Create a brand-new dynamic user — used when an access request is approved.
  // `user` includes the applicant's real password (set at sign-up).
  const createUser = useCallback(async (user) => {
    setUsers(prev => { const next = [...prev, user]; saveCache(next); return next; });
    setSaving(true);
    try {
      const body = new URLSearchParams({ action: 'createDynamicUser', token: CATALOG_ADMIN_TOKEN, payload: JSON.stringify(user) });
      const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
      const json = await res.json();
      return json.status === 'ok' ? { ok: true } : { ok: false, error: json.message };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, []);

  // Patch fields on an existing user by username. Only pass `password` in the
  // patch when the admin entered a new one (>= 8 chars) — omitting it leaves
  // the stored password untouched server-side, since it's never read back.
  const updateUser = useCallback(async (username, patch) => {
    setUsers(prev => { const next = prev.map(u => u.username === username ? { ...u, ...patch } : u); saveCache(next); return next; });
    setSaving(true);
    try {
      const body = new URLSearchParams({ action: 'updateDynamicUser', token: CATALOG_ADMIN_TOKEN, payload: JSON.stringify({ username, ...patch }) });
      const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
      const json = await res.json();
      return json.status === 'ok' ? { ok: true } : { ok: false, error: json.message };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, []);

  const deleteUser = useCallback(async (username) => {
    setUsers(prev => { const next = prev.filter(u => u.username !== username); saveCache(next); return next; });
    try {
      const body = new URLSearchParams({ action: 'deleteDynamicUser', token: CATALOG_ADMIN_TOKEN, username });
      const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
      const json = await res.json();
      return json.status === 'ok' ? { ok: true } : { ok: false, error: json.message };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  return { dynamicUsers: users, loading, saving, createUser, updateUser, deleteUser, refreshDynamicUsers: fetchUsers };
}
