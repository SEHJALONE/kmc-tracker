import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';

// Other (non-bus) projects, legacy job orders and runs, and the supervisors'
// delete-with-reason and comments on job orders (real Code + Mail files).
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

describe('Other projects, deleting and commenting on job orders', () => {
  let env, sup, paint, welder, op, admin;
  beforeEach(async () => {
    env = load();
    await addUser(env, { username: 'sup.ms', role: 'supervisor', assignedStations: ['B01-02'] });
    await addUser(env, { username: 'sup.paint', role: 'supervisor', assignedStations: ['P01-01'], fullName: 'Paint Boss' });
    await addUser(env, { username: 'welder', role: 'user', assignedStations: ['W01-02'] });
    await addUser(env, { username: 'op', role: 'user' });
    await addUser(env, { username: 'boss', role: 'systemadmin' });
    sup = await signIn(env, 'sup.ms');
    paint = await signIn(env, 'sup.paint');
    welder = await signIn(env, 'welder');
    op = await signIn(env, 'op');
    admin = await signIn(env, 'boss');
  });
  const call = (action, session, payload) => env.call({ action, session, payload: JSON.stringify(payload) });
  const steps = [{ name: 'Sand and prime', qty: 4, unit: 'pcs' }, { name: '' }, { name: 'Top coat' }];

  it('keeps a register of other projects, merged by project ID', async () => {
    expect((await call('saveOtherProjects', op, { projects: [{ id: 'X1', name: 'Gate' }] })).message).toBe('not-line-supervisor');
    let r = await call('saveOtherProjects', paint, { projects: [
      { id: 'prj-001', name: 'Water tank', client: 'Client A' }, { id: 'bad id', name: 'x' }, { id: 'PRJ-002', name: 'Trailer', lines: ['Machine Shop', 'Nope'] },
    ] });
    expect(r.result).toEqual({ added: ['PRJ-001', 'PRJ-002'], updated: [], invalid: ['BAD ID'] });
    r = await call('saveOtherProjects', sup, { projects: [{ id: 'PRJ-001', name: 'Water tank 10k', active: false }] });
    expect(r.result.updated).toEqual(['PRJ-001']);
    const data = await call('listJobData', op, {});
    expect(data.otherProjects).toHaveLength(2);
    expect(data.otherProjects[0]).toMatchObject({ id: 'PRJ-001', name: 'Water tank 10k', active: false, createdBy: 'sup.paint' });
    expect(data.otherProjects[1].lines).toEqual(['Machine Shop']);
  });

  it('line supervisors set up other-project job orders for their own line only', async () => {
    await call('saveOtherProjects', paint, { projects: [{ id: 'PRJ-001', name: 'Water tank' }] });
    const job = { kind: 'other', line: 'Paint Shop', projectId: 'prj-001', title: 'Paint tank', activities: steps };
    expect((await call('saveJobOrder', sup, job)).message).toBe('not-line-supervisor');
    expect((await call('saveJobOrder', paint, { ...job, projectId: 'NOPE' })).message).toBe('unknown-other-project');
    expect((await call('saveJobOrder', paint, { ...job, activities: [] })).message).toBe('missing-activities');
    expect((await call('saveJobOrder', sup, { ...job, line: 'Machine Shop', items: [] })).message).toBe('missing-items');
    const { id } = await call('saveJobOrder', paint, job);
    expect(id).toMatch(/^OP-\d{6}-[0-9A-F]{4}$/);
    const data = await call('listJobData', paint, {});
    expect(data.manageLines).toEqual(['Paint Shop']);
    expect(data.scope).toEqual(['Paint Shop']);
    expect(data.canManage).toBe(false);
    expect(data.jobOrders[0]).toMatchObject({ id, kind: 'other', line: 'Paint Shop', projectId: 'PRJ-001', project: 'Water tank', title: 'Paint tank', vins: [], comments: [] });
    expect(data.jobOrders[0].activities.map(a => a.name)).toEqual(['Sand and prime', 'Top coat']);
    expect((await call('listJobData', welder, {})).scope).toEqual(['Parts Making']);
  });

  it('a Machine Shop order for an other project remembers machines under the project ID', async () => {
    await call('saveOtherProjects', sup, { projects: [{ id: 'PRJ-003', name: 'Bracket batch' }] });
    const { id } = await call('saveJobOrder', sup, { kind: 'other', line: 'Machine Shop', projectId: 'PRJ-003', items: [{ spec: '□40x40x3.0', qty: 4 }] });
    await call('assignJobMachines', op, { id, specMachines: { '□40x40x3.0': 'B01-03' } });
    expect((await call('listJobData', op, {})).settings.specMachines).toEqual({ 'OP:PRJ-003|□40x40x3.0': 'B01-03' });
    expect((await call('saveCutList', sup, { busModel: 'OP:PRJ-003', items: [{ spec: 'x', qty: 1 }] })).items).toBe(1);
    expect(Object.keys((await call('listJobData', op, {})).cutLists)).toEqual(['OP:PRJ-003']);
  });

  it('admins, directors and supervisors over several lines see every line, but change only their own', async () => {
    await addUser(env, { username: 'dir', role: 'director' });
    await addUser(env, { username: 'sup.multi', role: 'supervisor', assignedStations: ['P01-01', 'T01-01'] });
    await addUser(env, { username: 'sup.trim', role: 'supervisor', assignedStations: ['T01-01', 'T01-02'] });
    const all = ['Machine Shop', 'Paint Shop', 'Parts Making'];
    expect((await call('listJobData', admin, {})).scope).toEqual(all);
    const d = await call('listJobData', await signIn(env, 'dir'), {});
    expect([d.scope, d.manageLines]).toEqual([all, []]);
    const multi = await signIn(env, 'sup.multi');
    const m = await call('listJobData', multi, {});
    expect([m.scope, m.manageLines]).toEqual([all, ['Paint Shop']]);
    expect((await call('commentJobOrder', multi, { id: 'nope', text: 'x' })).message).toBe('job-order-not-found');
    const { id } = await call('saveJobOrder', sup, { project: 'P', busModel: '7m EVS', vins: ['V'], items: [{ spec: 'x', qty: 1 }] });
    expect((await call('commentJobOrder', multi, { id, text: 'x' })).message).toBe('not-machine-shop-supervisor');
    expect((await call('listJobData', await signIn(env, 'sup.trim'), {})).scope).toEqual([]);   // one line (Trim)
    expect((await call('listJobData', sup, {})).scope).toEqual(['Machine Shop']);
  });

  it('anyone on the line may file a legacy job order, which is saved closed', async () => {
    await call('saveOtherProjects', admin, { projects: [{ id: 'PRJ-009', name: 'Gate' }] });
    const job = { kind: 'other', line: 'Parts Making', projectId: 'PRJ-009', activities: [{ name: 'Weld frame' }], legacy: true };
    expect((await call('saveJobOrder', op, job)).message).toBe('not-line-supervisor');
    const { id } = await call('saveJobOrder', welder, job);
    const j = (await call('listJobData', welder, {})).jobOrders.find(x => x.id === id);
    expect(j).toMatchObject({ status: 'closed', legacy: true, createdBy: 'welder' });
    // Not legacy: still supervisors only.
    expect((await call('saveJobOrder', welder, { ...job, legacy: false })).message).toBe('not-line-supervisor');
  });

  it('comments and deletes need a supervisor of that line, and a reason to delete', async () => {
    const { id } = await call('saveJobOrder', sup, { project: '100 Bus Project', busModel: '10.5m EVS', vins: ['ZZZBUS00000000064'], items: [{ spec: 'x', qty: 1 }] });
    expect((await call('commentJobOrder', paint, { id, text: 'hi' })).message).toBe('not-machine-shop-supervisor');
    expect((await call('commentJobOrder', sup, { id, text: '  ' })).message).toBe('missing-comment');
    const c = await call('commentJobOrder', sup, { id, text: 'Use the new drawing, rev C' });
    expect(c.comments).toHaveLength(1);
    expect(c.comments[0]).toMatchObject({ by: 'sup.ms', text: 'Use the new drawing, rev C' });
    expect((await call('listJobData', op, {})).jobOrders[0].comments[0].text).toBe('Use the new drawing, rev C');

    expect((await call('deleteJobOrder', op, { id, reason: 'duplicate' })).message).toBe('not-machine-shop-supervisor');
    expect((await call('deleteJobOrder', sup, { id, reason: '' })).message).toBe('missing-reason');
    expect((await call('deleteJobOrder', sup, { id, reason: 'Duplicate of an older order' })).status).toBe('ok');
    const j = (await call('listJobData', op, {})).jobOrders[0];
    expect(j).toMatchObject({ status: 'deleted', deletedBy: 'sup.ms', deleteReason: 'Duplicate of an older order' });
    expect((await call('saveJobOrder', sup, { id, status: 'open', statusOnly: true, project: 'p', busModel: 'm', vins: ['V'], items: [{ spec: 'x', qty: 1 }] })).message).toBe('job-order-deleted');
  });

  it('legacy runs are filed closed, with their source and who ran them', async () => {
    await call('saveOtherProjects', admin, { projects: [{ id: 'PRJ-001', name: 'Water tank' }] });
    const { id } = await call('saveJobOrder', welder, { kind: 'other', line: 'Parts Making', projectId: 'PRJ-001', activities: [{ name: 'Top coat' }], legacy: true });
    const task = { id: 'task-legacy-1', status: 'closed', startedAt: '2026-03-02T06:00:00.000Z', closedAt: '2026-03-02T09:30:00.000Z',
      project: 'Water tank', busModel: '', vin: 'PRJ-001', line: 'Frame Parts Making', station: 'W01-02: Welding', stationCode: 'W01-02',
      jobOrderId: id, source: 'legacy', note: 'Operators: A. Okello', activities: [{ name: 'Top coat', doneAt: '2026-03-02T09:30:00.000Z', added: true }] };
    expect((await call('saveTravelTask', welder, task)).status).toBe('ok');
    expect((await call('listShopTasks', sup, {})).tasks).toHaveLength(0);   // closed long ago: not on the shop floor
    const { runs } = await call('listJobData', welder, {});
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'closed', source: 'legacy', note: 'Operators: A. Okello', closedAt: '2026-03-02T09:30:00.000Z' });
  });
});
