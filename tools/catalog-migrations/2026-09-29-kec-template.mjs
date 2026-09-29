// Aligns the 13m KEC in the live Catalog: chassis lines follow the EVS work
// instructions, welding / paint / trim follow the KDC ones (src/data/kecTemplate.js).
// KEC-only stations are archived (active:false), never deleted, so cards already
// filed under them still resolve.
//
//   node tools/catalog-migrations/2026-09-29-kec-template.mjs           (dry run)
//   node tools/catalog-migrations/2026-09-29-kec-template.mjs --apply
//
// Saving needs an admin sign-in: set KMC_ADMIN_USER / KMC_ADMIN_PASS (an account
// with the systemadmin or useradmin role). Until the old shared token is switched
// off, KMC_LEGACY_TOKEN also works. The previous catalog is saved to
// catalog-backups/ first, and the server snapshots it again on save.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyKecTemplate, alignKecStations } from '../../src/data/kecTemplate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APPLY = process.argv.includes('--apply');
const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Catalog`;
const cfg = fs.readFileSync(path.join(root, 'src/data/catalogConfig.js'), 'utf8');
const WRITE_URL = /CATALOG_WRITE_URL\s*=\s*\n?\s*'([^']+)'/.exec(cfg)[1];

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

const t = applyKecTemplate({ tcLines: live.tcLines, acts: live.acts, res: live.res, stationModels: live.stationModels });
const next = { ...live, tcLines: t.tcLines, acts: t.acts, res: t.res, stationModels: t.stationModels, stations: alignKecStations(live.stations || {}) };

const diff = (a, b, label) => {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));
  console.log(`${label}: ${keys.length} changed`); keys.forEach(k => console.log('   ', k));
};
diff(live.tcLines, next.tcLines, 'tcLines'); diff(live.acts, next.acts, 'acts'); diff(live.res, next.res, 'res');
diff(live.stations, next.stations, 'stations'); diff(live.stationModels, next.stationModels, 'stationModels');

const backup = path.join(root, 'catalog-backups', `catalog_${new Date().toISOString().replace(/[:.]/g, '-')}_before_kec-template.json`);
fs.writeFileSync(backup, JSON.stringify(live));
console.log('Backup:', path.relative(root, backup));
if (!APPLY) { console.log('\nDry run only. Re-run with --apply.'); process.exit(0); }

const auth = {};
const { KMC_ADMIN_USER: u, KMC_ADMIN_PASS: p, KMC_LEGACY_TOKEN: legacy } = process.env;
if (u && p) {
  const j = await (await fetch(WRITE_URL, { method: 'POST', redirect: 'follow', body: new URLSearchParams({ action: 'login', username: u, password: p }) })).json();
  if (j.status !== 'ok' || !j.session) throw new Error('Admin login failed: ' + (j.message || 'unknown'));
  auth.session = j.session;
} else if (legacy) auth.token = legacy;
else throw new Error('Set KMC_ADMIN_USER + KMC_ADMIN_PASS (or KMC_LEGACY_TOKEN) to save.');

const res = await fetch(WRITE_URL, { method: 'POST', redirect: 'follow', body: new URLSearchParams({ action: 'saveCatalog', ...auth, payload: JSON.stringify(next) }) });
console.log('saveCatalog →', res.status, (await res.text()).slice(0, 160));
