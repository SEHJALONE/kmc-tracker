import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';

// The real Code + Mail files: password reset, the VIN register (Type
// Approvals), Machine Shop job orders and the supervisors' shop-floor list.
const CODE = readFileSync(resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');
const MAIL = readFileSync(resolve(__dirname, '../../tools/mail-relay/Mail.gs'), 'utf8');
const ADMIN = { token: 'kmcisgood' };
const load = (opts) => loadScripts([CODE, MAIL], opts);

async function addUser(env, u) {
  const r = await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ password: 'Passw0rd-123', ...u }) });
  expect(r.status).toBe('ok');
}
async function signIn(env, username) {
  const r = await env.call({ action: 'login', username, password: 'Passw0rd-123' });
  expect(r.status).toBe('ok');
  return r.session;
}
const codesIn = m => [...m.html.matchAll(/>(\d{6})<\/p>/g)].map(x => x[1]);

describe('password reset codes', () => {
  it('sends one code per account when an email is on several accounts, and each resets only its own account', async () => {
    const env = load();
    await addUser(env, { username: 'boss', role: 'systemadmin', email: 'shared@kmc.example' });
    await addUser(env, { username: 'ua', role: 'useradmin', email: 'shared@kmc.example' });
    const r = await env.call({ action: 'requestPasswordReset', identifier: 'shared@kmc.example' });
    expect(r).toMatchObject({ status: 'ok', delivery: 'email', sent: true, accounts: 2 });
    expect(env.mail).toHaveLength(1);
    const [c1, c2] = codesIn(env.mail[0]);
    expect(c1).toMatch(/^\d{6}$/);
    expect(env.mail[0].html).toContain('boss');
    expect(env.mail[0].html).toContain('ua');
    // The second code belongs to "ua".
    expect((await env.call({ action: 'resetPassword', identifier: 'shared@kmc.example', code: c2, password: 'Brand-new-9' })).username).toBe('ua');
    expect((await env.call({ action: 'login', username: 'ua', password: 'Brand-new-9' })).status).toBe('ok');
    expect((await env.call({ action: 'login', username: 'boss', password: 'Passw0rd-123' })).status).toBe('ok');
    expect(c1).not.toBe(c2);
  });

  it('says so when a code was sent recently instead of silently sending nothing', async () => {
    const env = load();
    await addUser(env, { username: 'op', role: 'user', email: 'op@kmc.example' });
    for (let i = 0; i < 3; i++) await env.call({ action: 'requestPasswordReset', identifier: 'op' });
    expect(await env.call({ action: 'requestPasswordReset', identifier: 'op' })).toMatchObject({ delivery: 'email', note: 'recent', sent: false });
    expect(env.mail).toHaveLength(3);
  });

  it('offers the admin help request when the email cannot be sent', async () => {
    const env = load({ quota: 0 });
    await addUser(env, { username: 'op', role: 'user', email: 'op@kmc.example' });
    expect(await env.call({ action: 'requestPasswordReset', identifier: 'op' })).toMatchObject({ delivery: 'admin', reason: 'mail-failed' });
  });
});

describe('VIN register (Type Approvals)', () => {
  const A = 'ZZZBUS00000000064', B = 'ZZZBUS00000000065', C = 'ZZZBUS00000000114', OLD = 'ZZZBUS00000000059';
  let env, ta, plain;
  beforeEach(async () => {
    env = load();
    const catalog = { projects: [{ id: 'p1', name: '100 Bus Project', active: true }, { id: 'p2', name: '45 Bus Project', active: true }], projectVins: { '45 Bus Project': [{ vin: OLD, model: '12m EVS' }], '100 Bus Project': [{ vin: A, model: '' }] }, tcLines: { keep: ['me'] } };
    expect((await env.call({ action: 'saveCatalog', ...ADMIN, payload: JSON.stringify(catalog) })).status).toBe('ok');
    await addUser(env, { username: 'ta', role: 'user', roles: ['typeapproval'] });
    await addUser(env, { username: 'plain', role: 'user' });
    ta = await signIn(env, 'ta');
    plain = await signIn(env, 'plain');
  });
  const upload = (session, project, rows) => env.call({ action: 'uploadProjectVins', session, payload: JSON.stringify({ project, rows }) });

  it('adds new VINs, keeps existing ones, and refuses VINs of other projects or invalid ones', async () => {
    const r = await upload(ta, '100 Bus Project', [
      { vin: A, project: '100 Bus Project', model: '10.5m EVS' },   // existing → model filled in
      { vin: B, project: '100 Bus Project' },                       // new
      { vin: C.toLowerCase(), project: '' },                        // new (case-insensitive)
      { vin: B, project: '100 Bus Project' },                       // repeated
      { vin: OLD, project: '100 Bus Project' },                     // on another project
      { vin: 'ZZZBUSO0000000099', project: '100 Bus Project' },     // contains O → invalid
      { vin: 'ZZZBUS00000000074', project: '45 Bus Project' },      // different project column
    ]);
    expect(r.status).toBe('ok');
    expect(r.result).toMatchObject({ added: [B, C], updated: [A], existing: [], repeated: [B], invalid: ['ZZZBUSO0000000099'], wrongProject: ['ZZZBUS00000000074'] });
    expect(r.result.otherProject[0]).toContain('45 Bus Project');
    const cat = env.sandbox.readCatalogJson_();
    expect(cat.projectVins['100 Bus Project']).toEqual([{ vin: A, model: '10.5m EVS' }, { vin: B, model: '' }, { vin: C, model: '' }]);
    expect(cat.projectVins['45 Bus Project']).toHaveLength(1);
    expect(cat.tcLines).toEqual({ keep: ['me'] });   // the rest of the catalog is untouched
    expect(r.total).toBe(3);
  });

  it('a second upload of the same file changes nothing', async () => {
    await upload(ta, '100 Bus Project', [{ vin: B }]);
    const r = await upload(ta, '100 Bus Project', [{ vin: B }, { vin: A }]);
    expect(r.result).toMatchObject({ added: [], existing: [B, A] });
  });

  it('needs the Type Approvals role (or an admin) and a known project', async () => {
    expect((await upload(plain, '100 Bus Project', [{ vin: B }])).message).toBe('not-type-approvals');
    expect((await upload(ta, 'No Such Project', [{ vin: B }])).message).toBe('unknown-project');
  });
});

describe('Machine Shop job orders', () => {
  let env, sup, op, other;
  const items = [
    { balloon: '16', code: 'ABC-0016', name: 'Column', qty: 2, spec: '□40x40x3.0', length: '34', material: 'Hollow section', cut: true },
    { balloon: '23', code: 'ABC-0023', name: 'Longitudinal beam', qty: 2, spec: '□40x40x2.0', length: '153', mitre: '9°/40', material: 'Hollow section', cut: false },
  ];
  beforeEach(async () => {
    env = load();
    await addUser(env, { username: 'sup.ms', role: 'supervisor', assignedStations: ['B01-02'] });
    await addUser(env, { username: 'sup.paint', role: 'supervisor', assignedStations: ['P01-01'] });
    await addUser(env, { username: 'op', role: 'user', fullName: 'Op One' });
    sup = await signIn(env, 'sup.ms');
    other = await signIn(env, 'sup.paint');
    op = await signIn(env, 'op');
  });
  const call = (action, session, payload) => env.call({ action, session, payload: JSON.stringify(payload) });
  const job = { project: '100 Bus Project', busModel: '10.5m EVS', vins: ['ZZZBUS00000000064', 'zzzbus00000000065'], items };

  it('only Machine Shop supervisors (and admins) set up job orders and cut lists', async () => {
    expect((await call('saveJobOrder', op, job)).message).toBe('not-machine-shop-supervisor');
    expect((await call('saveJobOrder', other, job)).message).toBe('not-machine-shop-supervisor');
    expect((await call('saveCutList', op, { busModel: '10.5m EVS', items })).message).toBe('not-machine-shop-supervisor');
    expect((await call('saveJobOrder', sup, { ...job, vins: [] })).message).toBe('missing-vins');
    const r = await call('saveJobOrder', sup, job);
    expect(r.id).toMatch(/^JO-\d{6}-[0-9A-F]{4}$/);
  });

  it('saves, lists, edits and closes a job order', async () => {
    const { id } = await call('saveJobOrder', sup, job);
    let data = await call('listJobData', op, {});
    expect(data.canManage).toBe(false);
    expect(data.jobOrders).toHaveLength(1);
    const j = data.jobOrders[0];
    expect(j).toMatchObject({ id, status: 'open', vins: ['ZZZBUS00000000064', 'ZZZBUS00000000065'], createdBy: 'sup.ms' });
    expect(j.items[1]).toMatchObject({ cut: false, mitre: '9°/40', spec: '□40x40x2.0' });
    expect((await call('saveJobOrder', sup, { ...job, id, status: 'closed' })).id).toBe(id);
    data = await call('listJobData', sup, {});
    expect(data.canManage).toBe(true);
    expect(data.jobOrders[0].status).toBe('closed');
  });

  it('remembers the machine chosen per specification, on the job order and for the model', async () => {
    const { id } = await call('saveJobOrder', sup, job);
    const r = await call('assignJobMachines', op, { id, specMachines: { '□40x40x3.0': 'B01-03' } });
    expect(r.specMachines).toEqual({ '□40x40x3.0': 'B01-03' });
    const data = await call('listJobData', op, {});
    expect(data.jobOrders[0].specMachines).toEqual({ '□40x40x3.0': 'B01-03' });
    expect(data.settings.specMachines).toEqual({ '10.5m EVS|□40x40x3.0': 'B01-03' });
  });

  it('stores cut lists per model and the materials list', async () => {
    expect((await call('saveCutList', sup, { busModel: '7m EVS', items })).items).toBe(2);
    expect((await call('saveJoMaterials', sup, { materials: [{ name: 'Hollow section', machines: ['B01-02'] }, { name: 'hollow SECTION', machines: [] }, { name: 'Round bar', machines: ['B02-05'] }] })).materials)
      .toEqual([{ name: 'Hollow section', machines: ['B01-02'] }, { name: 'Round bar', machines: ['B02-05'] }]);
    const data = await call('listJobData', op, {});
    expect(data.cutLists['7m EVS'].items.map(it => it.balloon)).toEqual(['16', '23']);
    expect(data.settings.materials).toHaveLength(2);
  });

  it('machine runs keep their job order and VINs, and supervisors see everyone\'s open tasks', async () => {
    const task = { id: 'task-run-1', status: 'open', startedAt: new Date().toISOString(), project: '100 Bus Project', busModel: '10.5m EVS',
      vin: 'ZZZBUS00000000064', vins: ['ZZZBUS00000000064', 'ZZZBUS00000000065'], line: 'Machine Shop', station: 'B01-02: Band Saw', stationCode: 'B01-02',
      jobOrderId: 'JO-261113-ABCD', activities: [{ name: '#16 · Column', doneAt: '', added: true }] };
    expect((await call('saveTravelTask', op, task)).status).toBe('ok');
    expect((await call('listShopTasks', op, {})).message).toBe('not-a-supervisor');
    const r = await call('listShopTasks', sup, {});
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0]).toMatchObject({ owner: 'op', ownerName: 'Op One', jobOrderId: 'JO-261113-ABCD', vins: ['ZZZBUS00000000064', 'ZZZBUS00000000065'] });
  });
});
