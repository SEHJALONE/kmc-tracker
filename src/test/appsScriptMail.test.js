import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';

// The Code + Mail files together, as they run in the Apps Script project:
// who gets which email, and the open-task store behind Start/End.
const CODE = readFileSync(resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');
const MAIL = readFileSync(resolve(__dirname, '../../tools/mail-relay/Mail.gs'), 'utf8');
const ADMIN = { token: 'kmcisgood' };

function load() { return loadScripts([CODE, MAIL]); }

async function addUser(env, u) {
  const r = await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ password: 'Passw0rd-123', ...u }) });
  expect(r.status).toBe('ok');
}
async function signIn(env, username) {
  const r = await env.call({ action: 'login', username, password: 'Passw0rd-123' });
  expect(r.status).toBe('ok');
  return r.session;
}

const applicant = (over = {}) => ({
  fullName: 'Amina Okello', email: 'amina@example.com', username: 'amina.o', department: 'Production',
  productionLines: ['Paint Shop'], position: 'Technician', password: 'S3cure-pass', ...over,
});

describe('access request emails', () => {
  let env;
  beforeEach(() => { env = load(); });

  it('emails the administrators (fixed list + systemadmin accounts) when a request is stored', async () => {
    await addUser(env, { username: 'boss', role: 'systemadmin', email: 'boss@kmc.example' });
    const r = await env.call({ action: 'submitAccessRequest', payload: JSON.stringify(applicant()) });
    expect(r.status).toBe('ok');
    expect(r.adminNotified).toBe(true);
    expect(env.mail).toHaveLength(1);
    const m = env.mail[0];
    expect([...m.to, ...m.bcc]).toEqual(expect.arrayContaining(['kmcproductiondept@gmail.com', 'xcellencysehj@gmail.com', 'boss@kmc.example']));
    expect(m.subject).toContain('Amina Okello');
    expect(m.html).toContain('amina.o');
    expect(m.html).not.toContain('S3cure-pass');
  });

  it('no longer accepts the old public notifyAdminNew action', async () => {
    const r = await env.call({ action: 'notifyAdminNew', payload: JSON.stringify(applicant()) });
    expect(r.status).toBe('error');
    expect(env.mail).toHaveLength(0);
  });

  it('emails the applicant once, when an administrator approves the request', async () => {
    await env.call({ action: 'submitAccessRequest', payload: JSON.stringify(applicant()) });
    env.mail.length = 0;
    const id = env.rows('AccessRequests')[1][0];
    const ok = await env.call({ action: 'updateAccessRequest', ...ADMIN, payload: JSON.stringify({ id, status: 'approved', assignedUsername: 'amina.o', assignedRole: 'supervisor' }) });
    expect(ok).toMatchObject({ status: 'ok', emailed: true, email: 'amina@example.com' });
    expect(env.mail).toHaveLength(1);
    expect(env.mail[0].to).toEqual(['amina@example.com']);
    expect(env.mail[0].html).toContain('Supervisor');

    // Saving it again (already approved) does not send a second email.
    await env.call({ action: 'updateAccessRequest', ...ADMIN, payload: JSON.stringify({ id, status: 'approved' }) });
    expect(env.mail).toHaveLength(1);
  });

  it('sends nothing when a request is denied', async () => {
    await env.call({ action: 'submitAccessRequest', payload: JSON.stringify(applicant()) });
    env.mail.length = 0;
    const id = env.rows('AccessRequests')[1][0];
    await env.call({ action: 'updateAccessRequest', ...ADMIN, payload: JSON.stringify({ id, status: 'denied' }) });
    expect(env.mail).toHaveLength(0);
  });
});

describe('travel card emails', () => {
  let env, session;
  const card = (over = {}) => ({
    project: 'Kayoola 45', busModel: '12m KDC', vin: 'KMC-001', line: 'Paint Shop', lineId: 'PAINT',
    station: 'P01-01: Pre-treatment', stationCode: 'P01-01', operators: ['Op One'],
    actualTime: 95, designedTime: 90, approvalStatus: 'pending_review',
    activities: { total: 4, complete: 3, issues: 1 },
    attachments: [{ filename: 'Station_Report.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' }],
    ...over,
  });
  beforeEach(async () => {
    env = load();
    await addUser(env, { username: 'op.one', role: 'user', email: 'op@kmc.example', fullName: 'Op One' });
    await addUser(env, { username: 'sup.paint', role: 'supervisor', email: 'sup.paint@kmc.example', assignedStations: ['P01-01'] });
    await addUser(env, { username: 'sup.trim', role: 'supervisor', email: 'sup.trim@kmc.example', assignedStations: ['T01-01'] });
    await addUser(env, { username: 'mgr.paint', role: 'manager', email: 'mgr.paint@kmc.example', assignedLines: ['PAINT'] });
    await addUser(env, { username: 'mgr.qa', role: 'manager', email: 'mgr.qa@kmc.example', assignedLines: ['QA'] });
    session = await signIn(env, 'op.one');
  });

  it('confirms to the submitter with the reports attached, and asks only the matching approvers', async () => {
    const r = await env.call({ action: 'notifyCardSubmitted', session, payload: JSON.stringify(card()) });
    expect(r).toMatchObject({ status: 'ok', confirmedTo: 'op@kmc.example', approvers: 2 });
    const [confirm, approval] = env.mail;
    expect(confirm.to).toEqual(['op@kmc.example']);
    expect(confirm.attachments.map(a => a.getName())).toEqual(['Station_Report.pdf']);
    const approvers = [...approval.to, ...approval.bcc];
    expect(approvers.sort()).toEqual(['mgr.paint@kmc.example', 'sup.paint@kmc.example']);
    expect(approval.subject).toContain('Approval needed');
    expect(approval.attachments).toHaveLength(1);
  });

  it('does not ask for approval when the card was already approved at sign-off', async () => {
    const r = await env.call({ action: 'notifyCardSubmitted', session, payload: JSON.stringify(card({ approvalStatus: 'approved' })) });
    expect(r.approvers).toBe(0);
    expect(env.mail).toHaveLength(1);
  });

  it('falls back to the administrators when nobody is assigned to review the station', async () => {
    const r = await env.call({ action: 'notifyCardSubmitted', session, payload: JSON.stringify(card({ stationCode: 'Q09-09', lineId: 'NONE' })) });
    expect(r.approvers).toBe(2);
    expect([...env.mail[1].to, ...env.mail[1].bcc]).toContain('xcellencysehj@gmail.com');
  });

  it('needs a signed-in user, and ignores any recipient the request names', async () => {
    expect((await env.call({ action: 'notifyCardSubmitted', session: 'forged.x', payload: JSON.stringify(card()) })).message).toBe('unauthorized');
    await env.call({ action: 'notifyCardSubmitted', session, payload: JSON.stringify(card({ to: 'attacker@evil.example', email: 'attacker@evil.example' })) });
    expect(env.mail.flatMap(m => [...m.to, ...m.bcc])).not.toContain('attacker@evil.example');
  });
});

describe('open Start/End tasks', () => {
  let env, session;
  const HOUR = 3600000;
  const t0 = Date.parse('2026-10-16T06:00:00Z');
  const task = (over = {}) => ({
    id: 'task-abc123', project: 'Kayoola 45', busModel: '12m KDC', vin: 'KMC-001', line: 'Paint Shop',
    station: 'P01-01: Pre-treatment', stationCode: 'P01-01', designedMin: 90,
    startedAt: new Date(t0).toISOString(), expectedEnd: new Date(t0 + 90 * 60000).toISOString(),
    activities: [{ name: 'Degrease', doneAt: '' }, { name: 'Rinse', doneAt: '' }],
    ...over,
  });
  beforeEach(async () => {
    env = load();
    await addUser(env, { username: 'op.one', role: 'user', email: 'op@kmc.example', fullName: 'Op One' });
    await addUser(env, { username: 'op.two', role: 'user', email: 'two@kmc.example' });
    session = await signIn(env, 'op.one');
  });

  it('stores tasks per owner, lets several be open at once, and lists only your own', async () => {
    expect((await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify(task()) })).created).toBe(true);
    await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify(task({ id: 'task-def456', stationCode: 'P01-02' })) });
    const other = await signIn(env, 'op.two');
    await env.call({ action: 'saveTravelTask', session: other, payload: JSON.stringify(task({ id: 'task-zzz999' })) });

    const mine = await env.call({ action: 'listTravelTasks', session });
    expect(mine.tasks.map(t => t.id).sort()).toEqual(['task-abc123', 'task-def456']);
    expect(mine.tasks[0]).toMatchObject({ owner: 'op.one', ownerName: 'Op One', status: 'open', designedMin: 90 });
    expect(mine.tasks[0].activities).toHaveLength(2);
  });

  it('records ticked activities and closing; nobody else can change your task', async () => {
    await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify(task()) });
    const doneAt = new Date(t0 + 20 * 60000).toISOString();
    await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify({ id: 'task-abc123', activities: [{ name: 'Degrease', doneAt }, { name: 'Rinse', doneAt: '' }] }) });
    const other = await signIn(env, 'op.two');
    expect((await env.call({ action: 'saveTravelTask', session: other, payload: JSON.stringify({ id: 'task-abc123', status: 'discarded' }) })).message).toBe('not-your-task');

    await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify({ id: 'task-abc123', status: 'closed', closedAt: new Date(t0 + 2 * HOUR).toISOString() }) });
    const [t] = (await env.call({ action: 'listTravelTasks', session })).tasks;
    expect(t.status).toBe('closed');
    expect(t.activities[0].doneAt).toBe(doneAt);
  });

  it('reminds at the end of the station time, then every 6 hours, and stops once closed', async () => {
    await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify(task()) });
    const run = ms => env.sandbox.runTravelTaskReminders(ms);

    expect(run(t0 + 89 * 60000)).toBe(0);              // before the expected end
    expect(run(t0 + 91 * 60000)).toBe(1);              // first reminder
    expect(env.mail[0].to).toEqual(['op@kmc.example']);
    expect(env.mail[0].subject).toContain('P01-01');
    expect(run(t0 + 91 * 60000 + 5 * HOUR)).toBe(0);   // under 6 h since the last one
    expect(run(t0 + 91 * 60000 + 6 * HOUR)).toBe(1);   // second reminder
    await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify({ id: 'task-abc123', status: 'closed' }) });
    expect(run(t0 + 30 * HOUR)).toBe(0);
    expect(env.mail).toHaveLength(2);
  });

  it('refuses unsigned or malformed saves', async () => {
    expect((await env.call({ action: 'saveTravelTask', session: '', payload: JSON.stringify(task()) })).message).toBe('unauthorized');
    expect((await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify(task({ id: 'x' })) })).message).toBe('missing-id');
    expect((await env.call({ action: 'saveTravelTask', session, payload: JSON.stringify(task({ status: 'weird' })) })).message).toBe('bad-status');
    expect(env.rows('travel_tasks').length).toBeLessThanOrEqual(1);
  });
});
