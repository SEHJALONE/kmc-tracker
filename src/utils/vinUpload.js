// VIN register upload (Type Approvals). The CSV has two columns, VIN and
// BUS PROJECT; an optional BUS MODEL column fills in each bus's model. The
// server (uploadProjectVins_ in the Apps Script) does the real merge; this
// mirrors it so the person sees what will happen before saving.
import { parseCsv } from './csv.js';

export const VIN_TEMPLATE_ROWS = [['VIN', 'BUS PROJECT'], ['', '']];

// 17 characters, letters and digits, never I, O or Q (ISO 3779).
export const isValidVin = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(String(v || ''));
export const cleanVin = v => String(v || '').trim().toUpperCase().replace(/\s+/g, '');

const key = h => String(h || '').toUpperCase().replace(/[^A-Z]/g, '');

// → { rows: [{ vin, project, model }], errors }
export function parseVinCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { rows: [], errors: ['The file is empty.'] };
  const head = rows[0].map(key);
  const vinCol = head.indexOf('VIN');
  const projCol = head.findIndex(h => h === 'BUSPROJECT' || h === 'PROJECT');
  const modelCol = head.findIndex(h => h === 'BUSMODEL' || h === 'MODEL');
  if (vinCol < 0) return { rows: [], errors: ['No VIN column. Download the template and keep its headings.'] };
  const out = rows.slice(1)
    .map(r => ({ vin: cleanVin(r[vinCol]), project: projCol > -1 ? String(r[projCol] || '').trim() : '', model: modelCol > -1 ? String(r[modelCol] || '').trim() : '' }))
    .filter(r => r.vin);
  return { rows: out, errors: out.length ? [] : ['No VINs found under the headings.'] };
}

// What saving would do, against the catalog's projectVins.
export function classifyVins(rows, project, projectVins) {
  const mine = new Map(((projectVins || {})[project] || []).map(v => [cleanVin(v.vin), v.model || '']));
  const elsewhere = new Map();
  for (const [p, list] of Object.entries(projectVins || {})) {
    if (p === project) continue;
    for (const v of list || []) elsewhere.set(cleanVin(v.vin), p);
  }
  const out = { added: [], existing: [], updated: [], otherProject: [], wrongProject: [], invalid: [], repeated: [] };
  const seen = new Set();
  for (const r of rows) {
    const vin = cleanVin(r.vin);
    if (!vin) continue;
    if (r.project && r.project.toLowerCase() !== String(project).toLowerCase()) { out.wrongProject.push(`${vin} (${r.project})`); continue; }
    if (!isValidVin(vin)) { out.invalid.push(vin); continue; }
    if (seen.has(vin)) { out.repeated.push(vin); continue; }
    seen.add(vin);
    if (elsewhere.has(vin)) { out.otherProject.push(`${vin} (${elsewhere.get(vin)})`); continue; }
    if (mine.has(vin)) {
      if (r.model && mine.get(vin) !== r.model) out.updated.push(vin); else out.existing.push(vin);
      continue;
    }
    out.added.push(vin);
  }
  return out;
}
