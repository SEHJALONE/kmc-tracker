// Catalog migration — 2026-09-28: 13m KEC build process + per-model review.
//
// The live Catalog (NI Travel Tool Data → "Catalog" tab) holds a full saved copy
// of the travel-card lines/activities/consumables and the tracker station list,
// and it OVERRIDES the seed in code. So seed changes in TravelCard.jsx and
// src/data/stations.js only reach users once they're copied into the catalog.
//
//   node tools/catalog-migrations/2026-09-28-build-process-models.mjs            (dry run)
//   node tools/catalog-migrations/2026-09-28-build-process-models.mjs --apply    (save)
//
// What it writes:
//  - tcLines / acts / res / lineModels / stationModels ← the new TravelCard.jsx
//    seed. Checked on 2026-09-28: the live values were identical to the old
//    seed, so no admin edits are lost. The script refuses to run if that stops
//    being true for any key it replaces (re-check before forcing).
//  - lines: adds "KEC" to every line's models.
//  - stations: sets `models` from the new seed on existing codes (names and
//    other admin fields are kept) and adds new codes (B10-*, C01-03-01, KEC…).
// saveCatalog snapshots the previous catalog into Catalog_Backups first, so
// this is undoable from Catalog Admin → Backups.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APPLY = process.argv.includes('--apply');
const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Catalog`;
const cfg = fs.readFileSync(path.join(root, 'src/data/catalogConfig.js'), 'utf8');
const WRITE_URL = /CATALOG_WRITE_URL\s*=\s*\n?\s*'([^']+)'/.exec(cfg)[1];
const TOKEN = /CATALOG_ADMIN_TOKEN\s*=\s*'([^']+)'/.exec(cfg)[1];

// ── Seed values straight from the source files ──────────────────────────────
const tc = fs.readFileSync(path.join(root, 'src/components/TravelCard.jsx'), 'utf8');
function grab(src, name) {
  const start = src.indexOf(`export const ${name} = {`);
  if (start < 0) throw new Error(`${name} not found`);
  const i = src.indexOf('{', start);
  for (let j = i, depth = 0; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return (0, eval)('(' + src.slice(i, j + 1) + ')');
  }
}
const seed = {
  tcLines: grab(tc, 'TC_LINES'), acts: grab(tc, 'ACTS'), res: grab(tc, 'RES'),
  lineModels: grab(tc, 'LINE_MODELS'), stationModels: grab(tc, 'STATION_MODELS'),
};
const { SEED_STATIONS } = await import(new URL('file:///' + path.join(root, 'src/data/stations.js').replace(/\\/g, '/')));

// ── Live catalog (reassembled from its chunked rows) ────────────────────────
function parseCSV(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const idx = k => (k === 'catalog' ? 0 : Number(k.split('.')[1]));
const rows = parseCSV(await (await fetch(READ_URL + '&t=' + Date.now())).text())
  .filter(r => r[0] && r[0].startsWith('catalog')).sort((a, b) => idx(a[0]) - idx(b[0]));
const live = JSON.parse(rows.map(r => r[1]).join(''));

// ── Guard: the keys we replace wholesale must still equal the OLD seed ───────
// (i.e. nobody edited them in Catalog Admin since the check). The old seed is
// read from e78bb50, the last commit before this migration's seed changes.
const { execSync } = await import('node:child_process');
const oldTc = execSync('git show e78bb50:src/components/TravelCard.jsx', { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
const oldSeed = { tcLines: grab(oldTc, 'TC_LINES'), acts: grab(oldTc, 'ACTS'), res: grab(oldTc, 'RES'), lineModels: grab(oldTc, 'LINE_MODELS'), stationModels: grab(oldTc, 'STATION_MODELS') };
const drift = Object.keys(seed).filter(k => JSON.stringify(live[k] || {}) !== JSON.stringify(oldSeed[k]));
if (drift.length) {
  console.error('Live catalog has admin edits in:', drift.join(', '), '— merge by hand, not overwriting.');
  process.exit(1);
}

// ── Build the new catalog ───────────────────────────────────────────────────
const next = { ...live, ...seed };
next.lines = (live.lines || []).map(l => ({ ...l, models: [...new Set([...(l.models || []), 'KEC'])] }));
next.stations = { ...(live.stations || {}) };
const added = [], remodelled = [];
for (const [code, s] of Object.entries(SEED_STATIONS)) {
  const cur = next.stations[code];
  if (!cur) { next.stations[code] = { ...s }; added.push(code); continue; }
  const upd = { ...cur, models: s.models };
  if (s.active === false) upd.active = false;
  if (JSON.stringify(upd) !== JSON.stringify(cur)) { next.stations[code] = upd; remodelled.push(code); }
}

// ── Report ──────────────────────────────────────────────────────────────────
const keysDiff = (a = {}, b = {}) => ({
  added: Object.keys(b).filter(k => !(k in a)),
  removed: Object.keys(a).filter(k => !(k in b)),
  changed: Object.keys(b).filter(k => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k])),
});
for (const k of Object.keys(seed)) {
  const d = keysDiff(live[k], next[k]);
  console.log(`${k.padEnd(14)} +${d.added.length} -${d.removed.length} ~${d.changed.length}`);
  if (d.removed.length) console.log('   removed:', d.removed.join(', '));
}
console.log(`lines          KEC added to ${next.lines.length} lines`);
console.log(`stations       +${added.length} (${added.join(', ')})  models changed on ${remodelled.length}`);

const out = path.join(root, 'catalog-backups', `catalog_${new Date().toISOString().replace(/[:.]/g, '-')}_before_build-process-migration.json`);
fs.writeFileSync(out, JSON.stringify(live));
console.log('Saved a local copy of the current live catalog to', path.relative(root, out));

if (!APPLY) { console.log('\nDry run only. Re-run with --apply to save.'); process.exit(0); }

const body = new URLSearchParams({ action: 'saveCatalog', token: TOKEN, payload: JSON.stringify(next) });
const res = await fetch(WRITE_URL, { method: 'POST', body, redirect: 'follow' });
const text = await res.text();
console.log('saveCatalog →', res.status, text.slice(0, 200));
