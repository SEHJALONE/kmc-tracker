// Other projects: how each one is built, and where it is now.
//
// A project's process is set up in Other Projects, Projects by an admin: its
// ID and name, the lines that work on it (Machine Shop, Paint Shop, Parts
// Making) in the order the work flows, the stations on each line in order, and
// a small picture for its card. It is stored in the shared catalog JSON under
// `projectProcesses` (saveCatalog_ stores the whole JSON, so no script change):
//
//   projectProcesses: {
//     "PRJ-001": { id, name, client, description,
//                  lines: [ { line: "Machine Shop", stations: [ { code, name } ] } ],
//                  image: "data:image/webp;base64,...", updatedBy, updatedAt } }
//
// The project ID is also kept in the job-order register (saveOtherProjects_),
// which is what the server checks when a job order is filed under it.
//
// Progress comes from the job-order runs: every Start/End run on a job order of
// the project, at a station of the process, moves the project there, the way a
// bus moves along the Bus Tracker.

import { JO_LINES, jobLine, jobProgress } from './jobOrders.js';

export const PROJECT_ID_RE = /^[A-Z0-9][A-Z0-9._/-]*$/;   // same rule as saveOtherProjects_
// The catalog is read by every page load, so a picture is kept small: about
// 45 KB as a data URL (one catalog row holds 45,000 characters).
export const PROJECT_IMAGE_MAX = 45000;
export const PROJECT_IMAGE_BOX = { width: 360, height: 220 };

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const sameCode = (a, b) => clip(a, 40).toUpperCase() === clip(b, 40).toUpperCase();

export function makeProjectStation(x = {}) {
  return { code: clip(x.code, 40).toUpperCase(), name: clip(x.name, 120) };
}

// One project's process, tidied. Lines not on the job-order lines are dropped,
// and so are repeats of a line.
export function cleanProjectProcess(input) {
  const x = input && typeof input === 'object' ? input : {};
  const seen = new Set();
  const lines = (Array.isArray(x.lines) ? x.lines : []).map(l => ({
    line: JO_LINES.find(j => j.toLowerCase() === clip(l?.line, 40).toLowerCase()) || '',
    stations: (Array.isArray(l?.stations) ? l.stations : []).map(makeProjectStation).filter(s => s.code || s.name),
  })).filter(l => l.line && !seen.has(l.line) && seen.add(l.line));
  const image = typeof x.image === 'string' && /^data:image\/(png|webp|jpeg);base64,/.test(x.image) ? x.image : '';
  return {
    id: clip(x.id, 40).toUpperCase(), name: clip(x.name, 120), client: clip(x.client, 120), description: clip(x.description, 500),
    lines, image, updatedBy: clip(x.updatedBy, 80), updatedAt: clip(x.updatedAt, 40),
  };
}

// The catalog's projectProcesses, tidied, keyed by project ID. Anything that is
// not a project is left out, so an old catalog without the key reads as {}.
export function normalizeProjectProcesses(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const v of Object.values(raw)) {
    const p = cleanProjectProcess(v);
    if (p.id && PROJECT_ID_RE.test(p.id)) out[p.id] = p;
  }
  return out;
}

// Why a process cannot be saved yet ([] when it can).
// existing: the saved processes; isNew: a new project (its ID must be free).
export function projectProcessErrors(proc, existing = {}, isNew = false) {
  const p = cleanProjectProcess(proc);
  const errors = [];
  if (!p.id) errors.push('Give the project an ID.');
  else if (!PROJECT_ID_RE.test(p.id)) errors.push('The project ID may use letters, digits and - _ . / only.');
  else if (isNew && existing[p.id]) errors.push(`${p.id} is already set up. Edit it instead.`);
  if (!p.name) errors.push('Give the project a name.');
  if (!p.lines.length) errors.push('Add at least one line.');
  for (const l of p.lines) {
    if (!l.stations.length) errors.push(`${l.line}: add at least one station.`);
    const codes = l.stations.map(s => s.code);
    if (codes.some(c => !c)) errors.push(`${l.line}: every station needs a code.`);
    const dup = codes.filter((c, i) => c && codes.indexOf(c) !== i);
    if (dup.length) errors.push(`${l.line}: ${[...new Set(dup)].join(', ')} is listed twice.`);
  }
  if (proc?.image && !p.image) errors.push('The picture must be a PNG.');
  if (p.image.length > PROJECT_IMAGE_MAX) errors.push('The picture is too big. Use a smaller PNG.');
  return errors;
}

// The catalog to save: the live catalog as it is on the server, with only this
// project's process put in (or taken out, when proc is null). Everything else,
// bus data included, is kept exactly as it is live.
// `local`: the processes this browser already has. The live read can lag a
// save by some seconds, so a process saved here a moment ago may be missing
// from it, or older: the newer copy is kept (see mergeProjectProcesses).
export function withProjectProcess(liveCatalog, id, proc, local = null) {
  const live = liveCatalog && typeof liveCatalog === 'object' ? liveCatalog : {};
  const list = mergeProjectProcesses(live.projectProcesses, local);
  const key = clip(id, 40).toUpperCase();
  if (proc) list[key] = { ...cleanProjectProcess(proc), id: key };
  else delete list[key];
  return { ...live, projectProcesses: list };
}

// The live processes, with any this browser holds a newer copy of (by
// updatedAt) or that the live read does not have yet. Processes are never
// deleted, so nothing is lost by keeping the local ones.
export function mergeProjectProcesses(live, local) {
  const out = normalizeProjectProcesses(live);
  for (const [id, p] of Object.entries(normalizeProjectProcesses(local))) {
    if (!out[id] || String(p.updatedAt) > String(out[id].updatedAt)) out[id] = p;
  }
  return out;
}

// The register row (saveOtherProjects_) for a process.
export const registerRow = p => ({ id: p.id, name: p.name, client: p.client || '', description: p.description || '', lines: p.lines.map(l => l.line) });

// Fit a picture inside the card box, keeping its shape and never enlarging it.
export function fitWithin(width, height, box = PROJECT_IMAGE_BOX) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const k = Math.min(1, box.width / w, box.height / h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

// ── Tracker ──────────────────────────────────────────────────────────────────
// Where a project is on its process, from the runs on its job orders.
//   station state  running   a run is open there now
//                  done      a run there has closed, or the project has moved
//                            on to a later station, or the line's job orders
//                            are all done
//                  waiting   nothing yet
//   project state  running | between (last run closed, next not started) |
//                  waiting (nothing run yet) | done (every station done)
//   at             the furthest station with an open run, else the furthest
//                  station worked at: { line, code, index } or null
// Runs at stations that are not in the process are listed under `elsewhere`.
export function projectTrack(proc, jobOrders = [], runs = []) {
  const p = cleanProjectProcess(proc);
  const jobs = (jobOrders || []).filter(j => String(j.projectId || '').toUpperCase() === p.id && j.status !== 'deleted');
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const mine = (runs || []).filter(r => jobById.has(r.jobOrderId) && r.status !== 'discarded');

  const flat = [];   // every station of the process, in order
  const lines = p.lines.map(l => {
    const lineJobs = jobs.filter(j => jobLine(j) === l.line);
    const finished = lineJobs.length > 0 && lineJobs.every(j => j.status === 'closed' || jobProgress(j, runs).state === 'machined');
    const stations = l.stations.map(s => {
      const here = mine.filter(r => jobLine(jobById.get(r.jobOrderId)) === l.line && sameCode(r.stationCode, s.code));
      const times = here.flatMap(r => [r.startedAt, r.closedAt, r.updatedAt]).filter(Boolean).sort();
      const st = { ...s, line: l.line, runs: here, open: here.filter(r => r.status === 'open'), lastAt: times[times.length - 1] || '', finished };
      flat.push(st);
      return st;
    });
    return { line: l.line, jobs: lineJobs, stations };
  });

  const furthest = pred => { for (let i = flat.length - 1; i >= 0; i--) if (pred(flat[i])) return i; return -1; };
  const runningAt = furthest(s => s.open.length > 0);
  const workedAt = furthest(s => s.runs.length > 0);
  const reached = Math.max(runningAt, workedAt);
  flat.forEach((s, i) => {
    s.state = s.open.length ? 'running' : (s.runs.length || s.finished || i < reached) ? 'done' : 'waiting';
  });
  for (const l of lines) l.state = l.stations.every(s => s.state === 'done') ? 'done' : l.stations.some(s => s.state !== 'waiting') ? 'running' : 'waiting';

  const done = flat.filter(s => s.state === 'done').length;
  const atIdx = runningAt > -1 ? runningAt : workedAt;
  const at = atIdx > -1 ? { line: flat[atIdx].line, code: flat[atIdx].code, name: flat[atIdx].name, index: atIdx } : null;
  let state = 'waiting';
  if (flat.length && done === flat.length) state = 'done';
  else if (runningAt > -1) state = 'running';
  else if (workedAt > -1 || done > 0) state = 'between';
  const known = new Set(flat.map(s => `${s.line}|${s.code}`));
  const elsewhere = mine.filter(r => !known.has(`${jobLine(jobById.get(r.jobOrderId))}|${clip(r.stationCode, 40).toUpperCase()}`));
  const times = mine.flatMap(r => [r.startedAt, r.closedAt]).filter(Boolean).sort();
  return {
    id: p.id, lines, stations: flat, at, state, done, total: flat.length,
    pct: flat.length ? Math.round((done / flat.length) * 100) : 0,
    jobs, runs: mine, open: mine.filter(r => r.status === 'open'), elsewhere, lastAt: times[times.length - 1] || '',
  };
}

export const PROJECT_STATES = {
  running: ['Working now', '#10b981'], between: ['Waiting for the next station', '#f59e0b'],
  waiting: ['Not started', '#64748b'], done: ['Done', '#2563eb'],
};

// The stations a run on a job order of this project may be filed against: the
// project's own stations on the job order's line ([] when none are set up).
export function processStationsFor(processes, projectId, line) {
  const p = (processes || {})[String(projectId || '').toUpperCase()];
  const l = p?.lines?.find(x => x.line === line);
  return l ? l.stations.filter(s => s.code) : [];
}
