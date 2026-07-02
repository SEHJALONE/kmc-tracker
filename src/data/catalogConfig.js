// ── Shared catalog configuration ────────────────────────────────────────────
// The catalog is the single source of truth for projects, lines, stations,
// activities and resources. It is stored in a "Catalog" tab of the same Google
// Sheet the rest of the app reads, as one JSON document, and written back
// through the existing Apps Script web app (token-protected — see
// APPS_SCRIPT_CATALOG.md).
//
// Read  : public gviz CSV (no auth — sheet shared as "anyone with link can view")
// Write : POST to the Apps Script with { action:'saveCatalog', token, payload }

const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';

// gviz CSV endpoint for the Catalog tab. The tab holds one row: key | value,
// where key === 'catalog' and value is the JSON document.
export const CATALOG_READ_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Catalog`;

// Apps Script web-app endpoint (same one the Travel Card submits to).
export const CATALOG_WRITE_URL =
  'https://script.google.com/macros/s/AKfycbwd3fW_ygzXVAtU3vgJg_l9hxab52l-nRt5S-X4I8nuqm5f0anh9JvLv8TjjsQtoWFf/exec';

// Shared admin secret. Only admin sessions send this; the Apps Script validates
// it server-side before accepting a catalog write. CHANGE THIS to a value of
// your choosing and paste the identical value into the Apps Script (see
// APPS_SCRIPT_CATALOG.md). This is the real protection against non-admin writes.
export const CATALOG_ADMIN_TOKEN = 'kmcisgood';

// An empty catalog. Every field is optional; consumers merge whatever is present
// over their own built-in seed data, so the app works fully even with no backend.
export const EMPTY_CATALOG = {
  projects: [],      // [ { id, name, model, active, startDate, endDate|null } ]
  lines: null,       // tracker lines  [ { id, label, models, active } ] | null = use seed
  stations: {},      // tracker stations  { CODE: { name,line,order,models,active,effectiveFrom,effectiveTo,projects:[] } }
  tcLines: {},       // travel-card line→stations  { "Line Label": [ "CODE: name", ... ] }
  acts: {},          // travel-card activities  { CODE: [ ... ] }
  res: {},           // travel-card resources  { "Line Label": { CODE: [ ... ] } }
  lineModels: {},    // travel-card line model gating  { "Line Label": ["EVS"] }
  stationModels: {}, // travel-card station model gating { CODE: ["KDC"] }
  dwi: {},           // digital work instructions  { CODE: { title, revision, reference, description, warnings[], steps[], parts[], modelUrl, variants: { KDC?: { steps, parts, warnings, modelUrl }, EVS?: {...} } } }
  projectVins: {},   // travel-card project fleet  { "Project name": [ { vin, model } ] } — model matches the Bus model dropdown (e.g. "7m EVS")
};

// Shallow-ish merge of a backend catalog over the empty shape. Arrays/objects
// from the backend replace the defaults wholesale (the admin editor always
// saves the full current state), except we guarantee every key exists.
export function normalizeCatalog(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CATALOG };
  return {
    projects:      Array.isArray(raw.projects) ? raw.projects : [],
    lines:         Array.isArray(raw.lines) ? raw.lines : null,
    stations:      raw.stations && typeof raw.stations === 'object' ? raw.stations : {},
    tcLines:       raw.tcLines && typeof raw.tcLines === 'object' ? raw.tcLines : {},
    acts:          raw.acts && typeof raw.acts === 'object' ? raw.acts : {},
    res:           raw.res && typeof raw.res === 'object' ? raw.res : {},
    lineModels:    raw.lineModels && typeof raw.lineModels === 'object' ? raw.lineModels : {},
    stationModels: raw.stationModels && typeof raw.stationModels === 'object' ? raw.stationModels : {},
    dwi:           raw.dwi && typeof raw.dwi === 'object' ? raw.dwi : {},
    projectVins:   raw.projectVins && typeof raw.projectVins === 'object' ? raw.projectVins : {},
  };
}

// Is a catalog station/line/project considered active? Missing flag = active.
export const isActive = (item) => !item || item.active !== false;

// Does an archived station belong to the given project filter?
// True when the station is explicitly tagged to the project, OR its effective
// window overlaps the project's [startDate, endDate] window.
export function stationMatchesProject(station, project) {
  if (!station || !project) return false;
  const tags = Array.isArray(station.projects) ? station.projects : [];
  if (tags.includes(project.id) || tags.includes(project.name)) return true;
  // Effective-date overlap (open-ended bounds allowed on both sides)
  const sFrom = station.effectiveFrom ? new Date(station.effectiveFrom).getTime() : -Infinity;
  const sTo   = station.effectiveTo   ? new Date(station.effectiveTo).getTime()   : Infinity;
  const pFrom = project.startDate ? new Date(project.startDate).getTime() : -Infinity;
  const pTo   = project.endDate   ? new Date(project.endDate).getTime()   : Infinity;
  return sFrom <= pTo && pFrom <= sTo;
}
