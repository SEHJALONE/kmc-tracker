// Puts the 2026 EE Trim Line process (EVS and KDC EE Trim Line Production Travel
// Card Tool 2026) into the live Catalog: EVS / KDC Trim Line EE station names and
// activities, and EVS on the tracker's T01-01-EE and T01-09-EE. Consumables, KEC
// and everything else in the catalog are left as they are. Catalog Admin
// → Travel Card has a button that does the same.
//
//   node tools/catalog-migrations/2026-11-16-ee-trim-process.mjs           (dry run)
//   node tools/catalog-migrations/2026-11-16-ee-trim-process.mjs --apply
//
// Saving needs an admin sign-in: set KMC_ADMIN_USER / KMC_ADMIN_PASS (an account
// with the systemadmin or useradmin role). The previous catalog is saved to
// catalog-backups/ first, and the server snapshots it again on save (Catalog
// Admin → Backups can restore it).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEeProcess } from "../../src/data/eeTrimProcess.js";

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

const t = applyEeProcess({ tcLines: live.tcLines, acts: live.acts, stations: live.stations });
const next = { ...live, tcLines: t.tcLines, acts: t.acts, stations: t.stations };

const diff = (a, b, label) => {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));
  console.log(`${label}: ${keys.length} changed`); keys.forEach(k => console.log('   ', k));
};
diff(live.tcLines, next.tcLines, 'tcLines'); diff(live.acts, next.acts, 'acts'); diff(live.stations, next.stations, 'stations');
const untouched = Object.keys(live).filter(k => !['tcLines', 'acts', 'stations'].includes(k));
console.log('Left as they are:', untouched.join(', '));

const backup = path.join(root, 'catalog-backups', `catalog_${new Date().toISOString().replace(/[:.]/g, '-')}_before_ee-trim-process.json`);
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.writeFileSync(backup, JSON.stringify(live));
console.log('Backup:', path.relative(root, backup));
if (!APPLY) { console.log('\nDry run only. Re-run with --apply.'); process.exit(0); }

const { KMC_ADMIN_USER: u, KMC_ADMIN_PASS: p } = process.env;
if (!u || !p) throw new Error('Set KMC_ADMIN_USER and KMC_ADMIN_PASS (a systemadmin or useradmin account) to save.');
const j = await (await fetch(WRITE_URL, { method: 'POST', redirect: 'follow', body: new URLSearchParams({ action: 'login', username: u, password: p }) })).json();
if (j.status !== 'ok' || !j.session) throw new Error('Admin login failed: ' + (j.message || 'unknown'));

const res = await fetch(WRITE_URL, { method: 'POST', redirect: 'follow', body: new URLSearchParams({ action: 'saveCatalog', session: j.session, payload: JSON.stringify(next) }) });
const out = await res.text();
console.log('saveCatalog →', res.status, out.slice(0, 160));
if (!/"status"\s*:\s*"ok"/.test(out)) process.exitCode = 1;
