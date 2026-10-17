import { useState, useEffect, useCallback, useRef } from 'react';
import { CATALOG_WRITE_URL } from '../data/catalogConfig';
import { sessionParam } from '../data/session';
import { scriptIsCurrent, OUTDATED_SCRIPT } from '../data/mailer';

// Start/End Travel Card tasks: a station job someone pressed Start on and has
// not closed yet. Several can be open at once.
//
// The server copy ("travel_tasks" tab, saveTravelTask_/listTravelTasks_ in the
// Apps Script) is what follows the person to another device and what the
// reminder emails read. This device also keeps its own copy, so a task starts
// instantly, keeps running offline, and is pushed again on the next sync if the
// server could not be reached (`synced: false`).
//
// Task: { id, status:'open'|'closed'|'discarded', startedAt, expectedEnd, closedAt,
//         project, busModel, vin, line, station, stationCode, designedMin,
//         activities:[{ name, doneAt, added }], recordId, updatedAt, synced }

const keyFor = user => `kmc_travel_tasks_${String(user || 'anon').toLowerCase()}`;
const load = user => { try { const v = JSON.parse(localStorage.getItem(keyFor(user)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const save = (user, tasks) => { try { localStorage.setItem(keyFor(user), JSON.stringify(tasks)); } catch { /* full or blocked */ } };

export const newTaskId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function post(action, payload) {
  // Never send a task to the old script: it would file it as a Travel Card.
  if (!(await scriptIsCurrent())) return { ok: false, error: OUTDATED_SCRIPT };
  const body = new URLSearchParams({ action, ...sessionParam(), ...(payload ? { payload: JSON.stringify(payload) } : {}) });
  try {
    const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
    const json = await res.json();
    return json && json.status === 'ok' ? { ok: true, json } : { ok: false, error: (json && json.message) || 'bad-response' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// Newer edit wins; a local task the server has never seen is kept (to retry).
export function mergeTasks(local, remote) {
  const byId = new Map(remote.map(t => [t.id, { ...t, synced: true }]));
  for (const t of local) {
    const r = byId.get(t.id);
    if (!r) byId.set(t.id, t);
    else if (!t.synced && new Date(t.updatedAt || 0) > new Date(r.updatedAt || 0)) byId.set(t.id, t);
  }
  return [...byId.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

export function useTravelTasks(username) {
  const [tasks, setTasks] = useState(() => load(username));
  const [syncError, setSyncError] = useState(null);   // null = not checked yet;
  const latest = useRef(tasks);
  latest.current = tasks;

  const commit = useCallback((next) => { latest.current = next; save(username, next); setTasks(next); }, [username]);

  const push = useCallback(async (task) => {
    let r = await post('saveTravelTask', task);
    if (r.ok && r.json.id !== task.id) r = { ok: false, error: 'unexpected-reply' };
    const now = latest.current.map(t => (t.id === task.id ? { ...t, synced: r.ok } : t));
    commit(now);
    setSyncError(r.ok ? '' : r.error);
    return r;
  }, [commit]);

  const refresh = useCallback(async () => {
    const r = await post('listTravelTasks');
    if (!r.ok) { setSyncError(r.error); return; }
    setSyncError('');
    const merged = mergeTasks(latest.current, r.json.tasks || []);
    commit(merged);
    // Anything the server is missing or behind on goes up again.
    for (const t of merged.filter(t => t.synced === false)) await push(t);
  }, [commit, push]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = useCallback((task) => {
    const stamped = { ...task, updatedAt: new Date().toISOString(), synced: false };
    const others = latest.current.filter(t => t.id !== task.id);
    commit([stamped, ...others].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)));
    push(stamped);
    return stamped;
  }, [commit, push]);

  const update = useCallback((id, patch) => {
    const cur = latest.current.find(t => t.id === id);
    if (!cur) return null;
    return upsert({ ...cur, ...patch });
  }, [upsert]);

  return {
    tasks,
    openTasks: tasks.filter(t => t.status === 'open'),
    syncError,
    refresh,
    start: (fields) => upsert({ id: newTaskId(), status: 'open', activities: [], ...fields }),
    update,
    close: (id, extra = {}) => update(id, { status: 'closed', closedAt: new Date().toISOString(), ...extra }),
    discard: (id) => update(id, { status: 'discarded', closedAt: new Date().toISOString() }),
  };
}
