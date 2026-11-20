// Machine Shop job orders: cut lists, materials and the machines that cut them.
//
//   Cut list   the parts to cut for one bus model, grouped by material
//              specification (e.g. □40x40x3.0). Uploaded/edited by a Machine
//              Shop supervisor in Job Orders → Cut lists.
//   Job order  a supervisor's order to cut (a selection of) a model's cut list
//              for one or more VINs of a project.
//   Material   type of stock (hollow section, sheet, shaft, leaf spring…) and
//              the Machine Shop machines (stations) that can cut it. A
//              specification's material decides which machines can be chosen.
//
// Server side: listJobData_ / saveJobOrder_ / assignJobMachines_ / saveCutList_
// / saveJoMaterials_ in tools/mail-relay/Code-with-email.gs. Operators run each
// machine as a Start/End task whose activities are that machine's parts.

import { parseCsv } from '../utils/csv.js';
export { parseCsv, toCsv, downloadCsv } from '../utils/csv.js';

// Machine Shop stations (codes as on the Travel Card).
export const DEFAULT_MATERIALS = [
  { name: 'Hollow section', machines: ['B01-02', 'B01-03', 'B01-04'] },   // band saw, tube laser, circular saw
  { name: 'Sheet', machines: ['B02-01', 'B02-02', 'B02-03', 'B02-04'] },   // plate laser, shearing, bending, press
  { name: 'Shaft', machines: ['B01-02', 'B02-05'] },                       // band saw, lathe
  { name: 'Leaf spring', machines: ['B01-02', 'B02-05'] },
];


let n = 0;
const uid = () => `i${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Specifications drawn as □WxHxT are hollow (square/rectangular) sections.
export function inferMaterial(spec) {
  const s = String(spec || '').trim();
  if (/^[□▢]|\d+\s*[x×]\s*\d+\s*[x×]\s*\d/i.test(s)) return 'Hollow section';
  if (/^(Ø|ø|dia)/i.test(s) || /shaft|rod|bar/i.test(s)) return 'Shaft';
  if (/sheet|plate|^t\s*=?\s*\d|^\d+(\.\d+)?\s*mm$/i.test(s)) return 'Sheet';
  if (/leaf/i.test(s)) return 'Leaf spring';
  return '';
}

export function makeItem(x = {}) {
  return {
    id: x.id || uid(),
    balloon: String(x.balloon ?? '').trim(),
    code: String(x.code ?? '').trim(),
    name: String(x.name ?? '').trim(),
    qty: Number(x.qty) || 0,
    spec: String(x.spec ?? '').trim(),
    remarks: String(x.remarks ?? '').trim(),
    length: String(x.length ?? '').trim(),
    mitre: String(x.mitre ?? '').trim(),
    material: String(x.material ?? '').trim() || inferMaterial(x.spec),
    groupNote: String(x.groupNote ?? '').trim(),
    vin: String(x.vin ?? '').trim().toUpperCase(),
    cut: x.cut !== false,
  };
}

// No cut list is built into the code (this repository is public): each model's
// cut list lives only in the tracker sheet's cut_lists tab, uploaded by a
// Machine Shop supervisor (or tools/load-private-data.mjs for the first ones).
export const DEFAULT_CUT_LISTS = {};

// Items grouped by specification, in first-seen order. Each group carries the
// group's material and note (taken from its first item).
export function groupBySpec(items) {
  const map = new Map();
  for (const it of items || []) {
    const k = it.spec || '(no specification)';
    if (!map.has(k)) map.set(k, { spec: it.spec || '', material: it.material || '', groupNote: it.groupNote || '', items: [] });
    map.get(k).items.push(it);
  }
  return [...map.values()];
}

// Machines that can cut a material (codes), from the saved list.
export function machinesForMaterial(material, materials) {
  const m = (materials || []).find(x => x.name.toLowerCase() === String(material || '').toLowerCase());
  return m ? m.machines : [];
}

// One part as a Start/End activity (unique within a machine run).
export function partLabel(it) {
  const bits = [`#${it.balloon || '?'}`, it.code, it.name, `×${it.qty}`, it.spec, it.length ? `L=${it.length}mm` : '', it.mitre ? `mitre ${it.mitre}` : ''];
  return bits.filter(Boolean).join(' · ');
}

// ── CSV ───────────────────────────────────────────────────────────────────────
// SPECIFICATION NOTE (optional) is a note for the whole specification, e.g. "confirm before cutting".
export const CUT_LIST_COLUMNS = ['VIN', 'BALLOON NUMBER', 'SUPPLIER CODE', 'NAME', 'QUANTITY', 'SPECIFICATION', 'REMARKS', 'LENGTH (mm)', 'MITRE ANGLE', 'MATERIAL TYPE', 'SPECIFICATION NOTE'];

const norm = h => String(h || '').toUpperCase().replace(/[^A-Z]/g, '');
const COLUMN_KEYS = {
  VIN: 'vin', BALLOONNUMBER: 'balloon', BALLOON: 'balloon', SN: 'balloon', SUPPLIERCODE: 'code', CODE: 'code',
  NAME: 'name', PARTNAME: 'name', QUANTITY: 'qty', QTY: 'qty', SPECIFICATION: 'spec', SPECIFICATIONS: 'spec', SPEC: 'spec',
  REMARKS: 'remarks', REMARK: 'remarks', LENGTH: 'length', LENGTHMM: 'length', MITREANGLE: 'mitre', MITREANGLES: 'mitre', MITRE: 'mitre',
  MATERIALTYPE: 'material', MATERIAL: 'material', GROUPNOTE: 'groupNote', SPECIFICATIONNOTE: 'groupNote', SPECNOTE: 'groupNote',
};

// → { items, errors } from a cut-list CSV with the template's columns (any order).
export function parseCutListCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { items: [], errors: ['The file is empty.'] };
  const keys = rows[0].map(h => COLUMN_KEYS[norm(h)] || null);
  const errors = [];
  if (!keys.includes('spec')) errors.push('No SPECIFICATION column — download the template and use its headings.');
  if (!keys.includes('qty')) errors.push('No QUANTITY column.');
  const items = [];
  rows.slice(1).forEach((r, i) => {
    const x = {};
    keys.forEach((k, j) => { if (k) x[k] = r[j] ?? ''; });
    if (!x.spec && !x.code && !x.name) return;
    if (x.length) x.length = String(x.length).replace(/\s*mm$/i, '').replace(/^L\s*=\s*/i, '');
    if (x.qty !== undefined && x.qty !== '' && !(Number(x.qty) >= 0)) errors.push(`Row ${i + 2}: quantity "${x.qty}" is not a number.`);
    items.push(makeItem(x));
  });
  if (!items.length && !errors.length) errors.push('No parts found under the headings.');
  return { items, errors };
}

export function cutListToRows(items) {
  return [CUT_LIST_COLUMNS, ...(items || []).map(it => [it.vin, it.balloon, it.code, it.name, it.qty, it.spec, it.remarks, it.length, it.mitre, it.material, it.groupNote])];
}
export const CUT_LIST_TEMPLATE_ROWS = [
  CUT_LIST_COLUMNS,
  ['', '1', 'ABC-0001', 'Beam', '2', '□40x40x3.0', 'one end is cut', '552', '45°/40', 'Hollow section', ''],
];

// ── Who may run the Job Orders module ────────────────────────────────────────
// Admins, and supervisors/managers/directors who look after the Machine Shop
// (an assigned B01–B03 station or the MACHINE line). The server checks the same.
export function isMachineShopLead(role, assignedStations, assignedLines) {
  if (role === 'systemadmin' || role === 'useradmin') return true;
  if (!['supervisor', 'manager', 'director'].includes(role)) return false;
  return (assignedStations || []).some(c => /^B0[1-3]-/i.test(String(c))) || (assignedLines || []).includes('MACHINE');
}

// ── Waste (Machine Shop runs) ─────────────────────────────────────────────────
// On a running machine the operator records the waste each specification left:
// task.waste = [{ spec, material, amount, unit }]. Sections (lengths) default
// to millimetres, sheets and plates to kilograms; any other unit can be typed.
export const WASTE_UNITS = ['mm', 'm', 'kg', 'pcs'];
export const defaultWasteUnit = material => (/sheet|plate/i.test(String(material || '')) ? 'kg' : 'mm');

export function cleanWaste(list) {
  return (Array.isArray(list) ? list : []).map(w => ({
    spec: String(w?.spec ?? '').trim(), material: String(w?.material ?? '').trim(),
    amount: w?.amount === '' || w?.amount == null || !(Number(w.amount) >= 0) ? '' : Number(w.amount),
    unit: String(w?.unit ?? '').trim(),
  })).filter(w => w.spec || w.material);
}

// "□40x40x3.0: 320 mm; 2 mm sheet: 4.5 kg" for the card's "Waste generated".
export function wasteText(list) {
  return cleanWaste(list).filter(w => w.amount !== '').map(w => `${w.spec || w.material}: ${w.amount} ${w.unit}`.trim()).join('; ');
}

// Length units added up in metres in reports; anything else stays as entered.
const TO_M = { mm: 0.001, cm: 0.01, m: 1 };
export function wasteTotals(list) {
  const out = {};
  for (const w of cleanWaste(list)) {
    if (w.amount === '' || !w.unit) continue;
    const u = w.unit.toLowerCase();
    const [unit, v] = TO_M[u] ? ['m', w.amount * TO_M[u]] : [w.unit, w.amount];
    out[unit] = (out[unit] || 0) + v;
  }
  return out;
}
export const fmtAmounts = totals => Object.entries(totals).map(([u, v]) => `${Math.round(v * 100) / 100} ${u}`).join(' + ') || '-';

// ── Job progress (tracker, editing, reports) ─────────────────────────────────
// runs: the Start/End tasks filed against job orders (listJobData_ "runs").
// A part counts as cut once its activity is ticked on any run of the job.
export const liveRuns = (job, runs) => (runs || []).filter(r => r.jobOrderId === job.id && r.status !== 'discarded');

// A job order can be edited until machining starts on it.
export const jobStarted = (job, runs) => liveRuns(job, runs).length > 0;

// The pieces of work a job order is made of, as the activity names its runs
// tick off: Machine Shop parts to cut, or a Paint Shop / Parts Making order's steps.
export function workLabels(job) {
  if (isActivityJob(job)) return (job.activities || []).filter(a => a && a.name).map(activityLabel);
  return (job.items || []).filter(it => it.cut).map(partLabel);
}

export function jobProgress(job, runs) {
  const mine = liveRuns(job, runs);
  const parts = workLabels(job);
  const labels = new Set(parts);
  const doneAt = {};
  for (const r of mine) for (const a of r.activities || []) {
    if (a.doneAt && labels.has(a.name) && (!doneAt[a.name] || a.doneAt < doneAt[a.name])) doneAt[a.name] = a.doneAt;
  }
  const done = Object.keys(doneAt).length;
  const open = mine.filter(r => r.status === 'open');
  const times = [...mine.flatMap(r => [r.startedAt, r.closedAt]), ...Object.values(doneAt)].filter(Boolean).sort();
  let state = 'waiting';
  if (open.length) state = 'running';
  else if (parts.length && done >= parts.length) state = 'machined';
  else if (mine.length) state = 'started';
  if (job.status === 'closed' && !open.length && state !== 'machined') state = 'closed';
  return { total: parts.length, done, doneAt, runs: mine, open, state, lastAt: times[times.length - 1] || '' };
}

export const JOB_STATES = {
  running: ['Machining now', '#10b981'], started: ['Started, nothing running', '#f59e0b'],
  waiting: ['Not started', '#64748b'], machined: ['Machined', '#2563eb'], closed: ['Closed', '#64748b'],
};

// ── Period report ─────────────────────────────────────────────────────────────
// Everything the Machine Shop did between `from` (inclusive) and `to`
// (exclusive), from the job orders and their runs: jobs worked and finished,
// models and buses served, material cut (pieces and metres per specification),
// waste per specification and machine time.
const inRange = (iso, from, to) => !!iso && iso >= from && iso < to;
const lengthMm = it => { const v = parseFloat(String(it.length || '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };

export function buildJobReport(jobOrders, runs, { from, to, minutes = null } = {}) {
  const runMin = minutes || (r => Math.max(0, Math.round((new Date(r.closedAt || Date.now()) - new Date(r.startedAt)) / 60000)));
  const jobs = [];
  const specs = new Map();
  const waste = new Map();
  const machines = new Map();
  const models = new Map();
  for (const job of jobOrders || []) {
    // Machine Shop only (Paint Shop / Parts Making orders have no cut list), and never deleted orders.
    if (job.status === 'deleted' || (job.line && job.line !== MACHINE_SHOP_LINE)) continue;
    const p = jobProgress(job, runs);
    const byLabel = new Map((job.items || []).filter(it => it.cut).map(it => [partLabel(it), it]));
    const cutNow = Object.entries(p.doneAt).filter(([, at]) => inRange(at, from, to)).map(([l]) => byLabel.get(l)).filter(Boolean);
    const runsNow = p.runs.filter(r => r.startedAt < to && (r.status === 'open' || (r.closedAt || r.updatedAt || '') >= from));
    const finishedAt = p.state === 'machined' ? Object.values(p.doneAt).sort().pop() : '';
    if (!cutNow.length && !runsNow.length && !inRange(job.createdAt, from, to)) continue;
    for (const it of cutNow) {
      const k = it.spec || '(no specification)';
      const s = specs.get(k) || { spec: k, material: it.material, parts: 0, pieces: 0, metres: 0 };
      s.parts += 1; s.pieces += Number(it.qty) || 0; s.metres += ((Number(it.qty) || 0) * lengthMm(it)) / 1000;
      specs.set(k, s);
    }
    let jobMin = 0;
    const jobWaste = [];
    for (const r of runsNow) {
      const m = runMin(r);
      jobMin += m;
      const mc = machines.get(r.stationCode) || { code: r.stationCode, station: r.station, runs: 0, minutes: 0, operators: new Set() };
      mc.runs += 1; mc.minutes += m; if (r.ownerName || r.owner) mc.operators.add(r.ownerName || r.owner);
      machines.set(r.stationCode, mc);
      for (const w of cleanWaste(r.waste)) {
        if (w.amount === '') continue;
        jobWaste.push(w);
        const k = `${w.spec || w.material}|${w.unit}`;
        const x = waste.get(k) || { spec: w.spec || w.material, material: w.material, unit: w.unit, amount: 0 };
        x.amount += w.amount;
        waste.set(k, x);
      }
    }
    const finished = inRange(finishedAt, from, to);
    const modelKey = job.busModel || `Other: ${job.projectId || job.project}`;
    const md = models.get(modelKey) || { model: modelKey, jobs: 0, finished: 0, vins: new Set(), pieces: 0 };
    md.jobs += 1; if (finished) md.finished += 1;
    (job.vins || []).forEach(v => md.vins.add(v));
    md.pieces += cutNow.reduce((n, it) => n + (Number(it.qty) || 0), 0);
    models.set(modelKey, md);
    jobs.push({
      id: job.id, project: job.project, busModel: job.busModel, vins: job.vins || [], createdAt: job.createdAt,
      createdBy: job.createdByName || job.createdBy, state: p.state, done: p.done, total: p.total, finished, finishedAt,
      partsCut: cutNow.length, piecesCut: cutNow.reduce((n, it) => n + (Number(it.qty) || 0), 0),
      machines: [...new Set(runsNow.map(r => r.stationCode))], minutes: jobMin, waste: wasteTotals(jobWaste),
    });
  }
  const specList = [...specs.values()].sort((a, b) => b.pieces - a.pieces);
  const wasteList = [...waste.values()].sort((a, b) => a.spec.localeCompare(b.spec));
  return {
    from, to, jobs: jobs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    models: [...models.values()].map(m => ({ ...m, vins: m.vins.size })).sort((a, b) => b.jobs - a.jobs),
    specs: specList,
    waste: wasteList,
    wasteTotal: wasteTotals(wasteList),
    machines: [...machines.values()].map(m => ({ ...m, operators: [...m.operators] })).sort((a, b) => b.minutes - a.minutes),
    totals: {
      jobs: jobs.length, finished: jobs.filter(j => j.finished).length,
      buses: new Set(jobs.flatMap(j => j.vins)).size,
      parts: specList.reduce((n, s) => n + s.parts, 0), pieces: specList.reduce((n, s) => n + s.pieces, 0),
      metres: Math.round(specList.reduce((n, s) => n + s.metres, 0) * 10) / 10,
      minutes: [...machines.values()].reduce((n, m) => n + m.minutes, 0),
    },
  };
}

export function jobReportRows(rep) {
  const rows = [['MACHINE SHOP REPORT', `${rep.from.slice(0, 10)} to ${rep.to.slice(0, 10)}`], []];
  rows.push(['JOB ORDERS'], ['Job order', 'Project', 'Bus model', 'VINs', 'Status', 'Parts cut in period', 'Pieces cut in period', 'Parts done', 'Parts on order', 'Finished in period', 'Machines', 'Machine minutes', 'Waste']);
  rep.jobs.forEach(j => rows.push([j.id, j.project, j.busModel, j.vins.join(' '), JOB_STATES[j.state]?.[0] || j.state, j.partsCut, j.piecesCut, j.done, j.total, j.finished ? 'yes' : '', j.machines.join(' '), j.minutes, fmtAmounts(j.waste)]));
  rows.push([], ['MODELS SERVED'], ['Bus model', 'Job orders', 'Finished', 'Buses (VINs)', 'Pieces cut']);
  rep.models.forEach(m => rows.push([m.model, m.jobs, m.finished, m.vins, m.pieces]));
  rows.push([], ['MATERIAL CUT'], ['Specification', 'Material', 'Parts', 'Pieces', 'Length (m)']);
  rep.specs.forEach(s => rows.push([s.spec, s.material, s.parts, s.pieces, Math.round(s.metres * 100) / 100]));
  rows.push([], ['WASTE'], ['Specification', 'Material', 'Amount', 'Unit']);
  rep.waste.forEach(w => rows.push([w.spec, w.material, Math.round(w.amount * 100) / 100, w.unit]));
  rows.push([], ['MACHINES'], ['Machine', 'Runs', 'Minutes', 'Operators']);
  rep.machines.forEach(m => rows.push([m.code, m.runs, m.minutes, m.operators.join(', ')]));
  return rows;
}

export const MACHINE_SHOP_LINE = 'Machine Shop';
export const isMachineShopLine = line => String(line || '').trim().toLowerCase() === 'machine shop';

// ── Other (non-bus) projects ─────────────────────────────────────────────────
// Work that is not a bus: a project with its own ID (register in Other
// Projects → Projects), and job orders on the three lines that take such work:
//   Machine Shop   a cut list, cut on machines (as for buses)
//   Paint Shop     a list of steps (activities) to tick off
//   Parts Making   a list of steps, done by the welding / frame parts people
// Job orders of other projects have kind "other" and IDs OP-yyMMdd-XXXX; their
// runs are Start/End tasks like any other, but close straight away instead of
// opening a bus Travel Card.
export const JO_LINES = ['Machine Shop', 'Paint Shop', 'Parts Making'];
export const LINE_TINT = { 'Machine Shop': '#b45309', 'Paint Shop': '#0e7490', 'Parts Making': '#7c3aed' };

// Travel Card (catalog) lines whose stations do each job-order line's work.
const CATALOG_LINE_RE = { 'Machine Shop': /machine shop/i, 'Paint Shop': /paint/i, 'Parts Making': /parts making|weld/i };
export const catalogLineMatches = (joLine, catalogLine) => !!CATALOG_LINE_RE[joLine]?.test(String(catalogLine || ''));

// The job-order lines a person works on, from their assigned stations and
// lines. Same rule as the server's joLineScope_.
export function lineScope(assignedStations, assignedLines) {
  const st = (assignedStations || []).map(c => String(c).toUpperCase());
  const ln = assignedLines || [];
  const out = [];
  if (st.some(c => /^B0[1-3]-/.test(c)) || ln.includes('MACHINE')) out.push('Machine Shop');
  if (st.some(c => /^(B0[4-9]|B1\d|W)/.test(c)) || ln.includes('BODY') || ln.includes('FRAME')) out.push('Parts Making');
  if (st.some(c => /^P/.test(c)) || ln.includes('PAINT')) out.push('Paint Shop');
  return out;
}

// Same rules as the server's joStationLine_ / seesAllJobLines_: admins,
// directors, and supervisors or managers who oversee more than one production
// line see job orders on every line (changing them still needs that line).
export function stationLineKey(code) {
  const c = String(code || '').toUpperCase();
  if (/^B0[1-3]-/.test(c)) return 'MACHINE';
  if (/^B/.test(c)) return 'BODY';
  if (/^W/.test(c)) return 'FRAME';
  if (/^E/.test(c)) return 'ELECTRO';
  if (/^(C01|CQ-01)/.test(c)) return 'CHASSIS1';
  if (/^(C02|CQ-02)/.test(c)) return 'CHASSIS2';
  if (/^P/.test(c)) return 'PAINT';
  if (/^T/.test(c)) return 'TRIM';
  if (/^Q/.test(c)) return 'QA';
  return c.split('-')[0];
}
export function seesAllJobLines(role, assignedStations, assignedLines) {
  if (['systemadmin', 'useradmin', 'director'].includes(role)) return true;
  if (!['supervisor', 'manager'].includes(role)) return false;
  const keys = new Set([...(assignedStations || []).filter(Boolean).map(stationLineKey), ...(assignedLines || []).filter(Boolean)]);
  return keys.size > 1;
}
// Lines whose job orders this person sees.
export const viewLines = (role, assignedStations, assignedLines) =>
  (seesAllJobLines(role, assignedStations, assignedLines) ? [...JO_LINES] : lineScope(assignedStations, assignedLines));

export const jobLine = job =>job?.line || MACHINE_SHOP_LINE;
export const isOtherJob = job => job?.kind === 'other';
export const isActivityJob = job => jobLine(job) !== MACHINE_SHOP_LINE;
export const isOtherTask = task => /^OP-/.test(String(task?.jobOrderId || ''));
export const isLiveJob = job => job && job.status !== 'deleted';
// Cut lists of other projects sit beside the bus models' under this key.
export const cutListKey = projectId => `OP:${String(projectId || '').toUpperCase()}`;
// Remembered machine per specification: per bus model, or per other project.
export const specKey = job => job.busModel || cutListKey(job.projectId);

export function jobHeading(job) {
  if (isOtherJob(job)) return [job.projectId, job.project, job.title].filter(Boolean).join(' · ');
  return `${job.project} · ${job.busModel}`;
}

export function stateLabel(job, state) {
  if (isActivityJob(job)) return { running: 'Working now', machined: 'Done' }[state] || JOB_STATES[state]?.[0] || state;
  return JOB_STATES[state]?.[0] || state;
}

// One Paint Shop / Parts Making step.
export function makeActivity(x = {}) {
  return {
    id: x.id || uid(),
    name: String(x.name ?? '').trim(),
    qty: x.qty === '' || x.qty == null ? '' : Number(x.qty) || 0,
    unit: String(x.unit ?? '').trim(),
    notes: String(x.notes ?? '').trim(),
  };
}
export function activityLabel(a) {
  const q = a.qty !== '' && a.qty != null && Number(a.qty) > 0 ? `×${a.qty}${a.unit ? ` ${a.unit}` : ''}` : '';
  return [a.name, q].filter(Boolean).join(' · ');
}

export const ACTIVITY_COLUMNS = ['ACTIVITY', 'QUANTITY', 'UNIT', 'NOTES'];
export const ACTIVITY_TEMPLATE_ROWS = [ACTIVITY_COLUMNS, ['Surface preparation', '1', 'lot', ''], ['Primer coat', '', '', 'two passes']];
export function parseActivitiesCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { activities: [], errors: ['The file is empty.'] };
  const h = rows[0].map(norm);
  const at = (r, ...names) => { const i = h.findIndex(x => names.includes(x)); return i < 0 ? '' : r[i] ?? ''; };
  if (!h.some(x => ['ACTIVITY', 'NAME', 'STEP', 'TASK'].includes(x))) return { activities: [], errors: ['No ACTIVITY column - download the template and use its headings.'] };
  const activities = rows.slice(1).map(r => makeActivity({ name: at(r, 'ACTIVITY', 'NAME', 'STEP', 'TASK'), qty: at(r, 'QUANTITY', 'QTY'), unit: at(r, 'UNIT'), notes: at(r, 'NOTES', 'NOTE', 'REMARKS') }))
    .filter(a => a.name);
  return { activities, errors: activities.length ? [] : ['No activities found under the headings.'] };
}

// Project register CSV. LINES: any of Machine Shop, Paint Shop, Parts Making,
// separated by ";" (blank = all three).
export const PROJECT_COLUMNS = ['PROJECT ID', 'PROJECT NAME', 'CLIENT', 'DESCRIPTION', 'LINES'];
export const PROJECT_TEMPLATE_ROWS = [PROJECT_COLUMNS, ['PRJ-001', 'Steel water tank', 'Client name', '10,000 litre tank, painted', 'Machine Shop; Paint Shop']];
export function parseProjectsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { projects: [], errors: ['The file is empty.'] };
  const h = rows[0].map(norm);
  const at = (r, ...names) => { const i = h.findIndex(x => names.includes(x)); return i < 0 ? '' : String(r[i] ?? '').trim(); };
  const errors = [];
  if (!h.some(x => ['PROJECTID', 'ID'].includes(x))) errors.push('No PROJECT ID column - download the template and use its headings.');
  if (!h.some(x => ['PROJECTNAME', 'NAME', 'PROJECT'].includes(x))) errors.push('No PROJECT NAME column.');
  if (errors.length) return { projects: [], errors };
  const projects = [];
  rows.slice(1).forEach((r, i) => {
    const id = at(r, 'PROJECTID', 'ID').toUpperCase();
    const name = at(r, 'PROJECTNAME', 'NAME', 'PROJECT');
    if (!id && !name) return;
    if (!id || !name) { errors.push(`Row ${i + 2}: needs both a project ID and a name.`); return; }
    const lines = at(r, 'LINES', 'LINE').split(/[;|]/).map(s => s.trim()).map(s => JO_LINES.find(l => l.toLowerCase() === s.toLowerCase())).filter(Boolean);
    projects.push({ id, name, client: at(r, 'CLIENT', 'CUSTOMER'), description: at(r, 'DESCRIPTION', 'DETAILS'), lines });
  });
  if (!projects.length && !errors.length) errors.push('No projects found under the headings.');
  return { projects, errors };
}
