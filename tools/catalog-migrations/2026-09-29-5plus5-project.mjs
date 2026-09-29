// Adds the "5+5 Project" (5 x 13m Kayoola Electric Coach + 5 x 12m Kayoola Diesel
// Coach) and its 10 registered VINs to the live Catalog.
//
//   node tools/catalog-migrations/2026-09-29-5plus5-project.mjs           (dry run)
//   node tools/catalog-migrations/2026-09-29-5plus5-project.mjs --apply
//
// Saving needs an admin sign-in: set KMC_ADMIN_USER / KMC_ADMIN_PASS (an account
// with the systemadmin or useradmin role). Until the old shared token is switched
// off, KMC_LEGACY_TOKEN also works. The previous catalog is saved to
// catalog-backups/ first, and the server snapshots it again on save.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APPLY = process.argv.includes('--apply');
const SHEET_ID = '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es';
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Catalog`;
const cfg = fs.readFileSync(path.join(root, 'src/data/catalogConfig.js'), 'utf8');
const WRITE_URL = /CATALOG_WRITE_URL\s*=\s*\n?\s*'([^']+)'/.exec(cfg)[1];

const PROJECT = '5+5 Project';
const FLEET = [
  // Model strings match the Travel Card "Bus model" dropdown.
  { vin: 'BUKBHY6A1TJ000013', model: '13m KEC' },  // 13m Kayoola Electric Coach-01
  { vin: 'BUKBHY6A3TJ000014', model: '13m KEC' },  // -02
  { vin: 'BUKBHY6A5TJ000015', model: '13m KEC' },  // -03
  { vin: 'BUKBHY6A7TJ000016', model: '13m KEC' },  // -04
  { vin: 'BUKBHY6A9TJ000017', model: '13m KEC' },  // -05
  { vin: 'BUKBHY5M8TJ000036', model: '12m KDC' },  // 12m Kayoola Diesel Coach-01
  { vin: 'BUKBHY5MXTJ000037', model: '12m KDC' },  // -02
  { vin: 'BUKBHY5M1TJ000038', model: '12m KDC' },  // -03
  { vin: 'BUKBHY5M3TJ000039', model: '12m KDC' },  // -04
  { vin: 'BUKBHY5MXTJ000040', model: '12m KDC' },  // -05
];

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

// A VIN may only belong to one project.
const taken = Object.entries(live.projectVins || {}).flatMap(([p, list]) => p === PROJECT ? [] : list.map(v => [v.vin.toUpperCase(), p]));
const clash = FLEET.filter(v => taken.some(([vin]) => vin === v.vin.toUpperCase()));
if (clash.length) { console.error('VINs already in another project:', clash.map(v => v.vin).join(', ')); process.exit(1); }

const next = { ...live };
next.projects = [...(live.projects || [])];
const at = next.projects.findIndex(p => p.name === PROJECT);
const entry = { id: at >= 0 ? next.projects[at].id : 'p' + Date.now().toString(36), name: PROJECT, model: 'BOTH', active: true, startDate: '', endDate: '' };
if (at >= 0) next.projects[at] = { ...next.projects[at], ...entry }; else next.projects.push(entry);
next.projectVins = { ...(live.projectVins || {}), [PROJECT]: FLEET };

console.log(at >= 0 ? 'Updating existing project' : 'Adding project', JSON.stringify(entry));
console.log('Projects now:', next.projects.map(p => p.name).join(' | '));
console.log('Fleet:', FLEET.length, 'VINs (', FLEET.filter(v => v.model === '13m KEC').length, 'KEC +', FLEET.filter(v => v.model === '12m KDC').length, 'KDC )');

const backup = path.join(root, 'catalog-backups', `catalog_${new Date().toISOString().replace(/[:.]/g, '-')}_before_5plus5.json`);
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
