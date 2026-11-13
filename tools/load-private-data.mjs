// Puts company data that is kept off GitHub (this repository is public) into
// the live tracker sheets, through the deployed Apps Script:
//
//   private-data/cut-list-<bus model>.csv   → that model's Machine Shop cut list
//                                              (e.g. cut-list-10.5m-EVS.csv → "10.5m EVS")
//   private-data/*vins*.csv                 → VINs (VIN, BUS PROJECT[, BUS MODEL])
//
//   node tools/load-private-data.mjs            (dry run: shows what it would load)
//   node tools/load-private-data.mjs --apply    (loads it)
//
// --apply needs an admin sign-in: set KMC_ADMIN_USER / KMC_ADMIN_PASS
// (systemadmin or useradmin). Cut lists replace the saved list for that model;
// VINs are merged (existing ones kept, only new ones added), as on the VIN
// Register page. private-data/ is listed in .gitignore and is never pushed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCutListCsv, groupBySpec } from '../src/data/jobOrders.js';
import { parseVinCsv } from '../src/utils/vinUpload.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'private-data');
const APPLY = process.argv.includes('--apply');
const cfg = fs.readFileSync(path.join(root, 'src/data/catalogConfig.js'), 'utf8');
const URL_ = /CATALOG_WRITE_URL\s*=\s*\n?\s*'([^']+)'/.exec(cfg)[1];

if (!fs.existsSync(dir)) { console.log('No private-data folder — nothing to load.'); process.exit(0); }
const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'));

const cutLists = files.filter(f => /^cut-list-.+\.csv$/i.test(f)).map(f => {
  const model = f.replace(/^cut-list-/i, '').replace(/\.csv$/i, '').replace(/-/g, ' ');
  const { items, errors } = parseCutListCsv(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { f, model, items, errors };
});
const vinFiles = files.filter(f => /vins/i.test(f)).map(f => ({ f, ...parseVinCsv(fs.readFileSync(path.join(dir, f), 'utf8')) }));

for (const c of cutLists) console.log(`Cut list  ${c.f} → "${c.model}": ${c.items.length} parts in ${groupBySpec(c.items).length} specifications${c.errors.length ? `  ⚠ ${c.errors.join(' ')}` : ''}`);
for (const v of vinFiles) {
  const byProject = {};
  for (const r of v.rows) (byProject[r.project || '(no project)'] ||= []).push(r);
  console.log(`VINs      ${v.f}: ${Object.entries(byProject).map(([p, rs]) => `${rs.length} for ${p}`).join(', ')}${v.errors.length ? `  ⚠ ${v.errors.join(' ')}` : ''}`);
}
if (!APPLY) { console.log('\nDry run only. Re-run with --apply (and KMC_ADMIN_USER / KMC_ADMIN_PASS set).'); process.exit(0); }

const post = async params => {
  const res = await fetch(URL_, { method: 'POST', redirect: 'follow', body: new URLSearchParams(params) });
  try { return await res.json(); } catch { return { status: 'error', message: `HTTP ${res.status}` }; }
};
const { KMC_ADMIN_USER: u, KMC_ADMIN_PASS: p } = process.env;
if (!u || !p) throw new Error('Set KMC_ADMIN_USER and KMC_ADMIN_PASS (a systemadmin or useradmin account).');
const login = await post({ action: 'login', username: u, password: p });
if (login.status !== 'ok' || !login.session) throw new Error('Admin sign-in failed: ' + (login.message || 'unknown'));
const session = login.session;

let failed = 0;
for (const c of cutLists) {
  if (!c.items.length) continue;
  const r = await post({ action: 'saveCutList', session, payload: JSON.stringify({ busModel: c.model, items: c.items }) });
  console.log(`saveCutList "${c.model}" →`, r.status === 'ok' ? `saved ${r.items} parts` : `FAILED: ${r.message}`);
  if (r.status !== 'ok') failed++;
}
for (const v of vinFiles) {
  const byProject = {};
  for (const r of v.rows) if (r.project) (byProject[r.project] ||= []).push(r);
  for (const [project, rows] of Object.entries(byProject)) {
    const r = await post({ action: 'uploadProjectVins', session, payload: JSON.stringify({ project, rows }) });
    if (r.status !== 'ok') { console.log(`uploadProjectVins "${project}" → FAILED: ${r.message}`); failed++; continue; }
    const x = r.result;
    console.log(`uploadProjectVins "${project}" → added ${x.added.length}, model updated ${x.updated.length}, already there ${x.existing.length}` +
      (x.otherProject.length ? `, on another project ${x.otherProject.length}` : '') + (x.invalid.length ? `, invalid ${x.invalid.length}` : '') + ` — now ${r.total} VINs`);
  }
}
if (failed) { console.log(`\n${failed} step(s) failed. If the message is unknown-action or similar, deploy the updated Apps Script first.`); process.exitCode = 1; }
else console.log('\nDone.');
