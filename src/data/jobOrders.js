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

export const MACHINE_SHOP_LINE = 'Machine Shop';
export const isMachineShopLine = line => String(line || '').trim().toLowerCase() === 'machine shop';
