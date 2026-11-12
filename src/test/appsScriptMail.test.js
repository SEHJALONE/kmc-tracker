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

  it('emails only the matching approvers, with no reports attached and nothing to the submitter', async () => {
    const r = await env.call({ action: 'notifyCardSubmitted', session, payload: JSON.stringify(card()) });
    expect(r).toMatchObject({ status: 'ok', approvers: 2 });
    expect(env.mail).toHaveLength(1);
    const [approval] = env.mail;
    const approvers = [...approval.to, ...approval.bcc];
    expect(approvers.sort()).toEqual(['mgr.paint@kmc.example', 'sup.paint@kmc.example']);
    expect(approval.subject).toContain('Approval needed');
    expect(approval.attachments || []).toHaveLength(0);
  });

  it('does not ask for approval when the card was already approved at sign-off', async () => {
    const r = await env.call({ action: 'notifyCardSubmitted', session, payload: JSON.stringify(card({ approvalStatus: 'approved' })) });
    expect(r.approvers).toBe(0);
    expect(env.mail).toHaveLength(0);
  });

  it('falls back to the administrators when nobody is assigned to review the station', async () => {
    const r = await env.call({ action: 'notifyCardSubmitted', session, payload: JSON.stringify(card({ stationCode: 'Q09-09', lineId: 'NONE' })) });
    expect(r.approvers).toBe(2);
    expect([...env.mail[0].to, ...env.mail[0].bcc]).toContain('xcellencysehj@gmail.com');
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

describe('scheduled daily report', () => {
  let env;
  beforeEach(() => {
    env = load();
    env.sandbox.UrlFetchApp = { fetch: (url) => ({
      getResponseCode: () => 200,
      getHeaders: () => ({ 'X-Bus-Count': '12', 'Content-Disposition': `attachment; filename="${url.split('part=')[1]}.pdf"` }),
      getBlob: () => ({ setName(n) { this.name = n; return this; }, getName() { return this.name; } }),
    }) };
    env.sandbox.setScheduledReportRecipients('a@kmc.example, b@kmc.example');
  });

  it('does not send from a trigger that was never switched on (old triggers switch themselves off)', () => {
    env.sandbox.runScheduledReport();
    expect(env.mail).toHaveLength(0);
  });

  it('sends one email per recipient, each with its own stop link, while switched on', () => {
    env.sandbox.installDailyReportTrigger();
    env.sandbox.runScheduledReport();
    expect(env.mail.map(m => m.to[0])).toEqual(['a@kmc.example', 'b@kmc.example']);
    expect(env.mail[0].html).toContain('Stop receiving this report');
    expect(env.mail[0].html).toContain('email=a%40kmc.example');
  });

  it('the stop link takes only that recipient off, and a forged link does nothing', () => {
    env.sandbox.installDailyReportTrigger();
    env.sandbox.runScheduledReport();
    const link = /href="([^"]+)"/.exec(env.mail[0].html)[1].replace(/&amp;/g, '&');
    const q = Object.fromEntries(new URL(link).searchParams);
    expect(env.get({ ...q, email: 'b@kmc.example' })).toContain('not valid');
    expect(env.get(q)).toContain('will no longer receive');
    expect(env.props.get('scheduled_report_to')).toBe('b@kmc.example');
  });

  it('switches the report off when the last recipient stops it, and deactivateScheduledReports stops it for everyone', () => {
    env.sandbox.installDailyReportTrigger();
    env.sandbox.deactivateScheduledReports();
    env.sandbox.runScheduledReport();
    expect(env.mail).toHaveLength(0);
    expect(env.props.get('scheduled_report_to')).toBe('a@kmc.example,b@kmc.example');
  });
});

describe('daily/weekly schedules from the site', () => {
  let env, session, other;
  const T = (iso) => Date.parse(iso); // Kampala = UTC+3
  const sched = (over = {}) => ({ kind: 'dashboard', to: 'x@kmc.example, y@kmc.example', subject: 'Line report', schedule: 'daily', scheduledTime: '08:00', ...over });
  beforeEach(async () => {
    env = load();
    env.sandbox.UrlFetchApp = { fetch: (url) => ({
      getResponseCode: () => 200,
      getHeaders: () => ({ 'X-Bus-Count': '9', 'Content-Disposition': `attachment; filename="${url.split('part=')[1].split('&')[0]}.pdf"` }),
      getBlob: () => ({ setName(n) { this.name = n; return this; }, getName() { return this.name; } }),
    }) };
    await addUser(env, { username: 'mgr.one', role: 'manager', email: 'm1@kmc.example' });
    await addUser(env, { username: 'mgr.two', role: 'manager', email: 'm2@kmc.example' });
    session = await signIn(env, 'mgr.one');
    other = await signIn(env, 'mgr.two');
  });
  const save = (s, over) => env.call({ action: 'saveReportSchedule', session: s, payload: JSON.stringify(sched(over)) });

  it('saves a schedule and sends it once a day, at or after its time, with a stop link', async () => {
    expect((await save(session)).status).toBe('ok');
    expect(env.sandbox.runReportSchedules(T('2026-11-12T04:45:00Z'))).toBe(0);   // 07:45 Kampala
    expect(env.sandbox.runReportSchedules(T('2026-11-12T05:00:00Z'))).toBe(2);   // 08:00
    expect(env.sandbox.runReportSchedules(T('2026-11-12T08:00:00Z'))).toBe(0);   // already sent today
    expect(env.sandbox.runReportSchedules(T('2026-11-13T05:10:00Z'))).toBe(2);   // next day
    expect(env.mail[0].to).toEqual(['x@kmc.example']);
    expect(env.mail[0].html).toContain('Stop receiving this report');
    expect(env.mail[0].attachments).toHaveLength(3);
  });

  it('sends a weekly schedule only on its day', async () => {
    await save(session, { schedule: 'weekly', weekday: 'FRI' });
    expect(env.sandbox.runReportSchedules(T('2026-11-12T06:00:00Z'))).toBe(0);   // Thursday
    expect(env.sandbox.runReportSchedules(T('2026-11-13T06:00:00Z'))).toBe(2);   // Friday
  });

  it('rejects bad input', async () => {
    expect((await save(session, { schedule: 'hourly' })).message).toMatch(/Daily or Weekly/);
    expect((await save(session, { scheduledTime: '25:00' })).message).toMatch(/send time/);
    expect((await save(session, { schedule: 'weekly', weekday: 'XYZ' })).message).toMatch(/day of the week/);
    expect((await save('forged.x')).message).toBe('unauthorized');
  });

  it('lists and cancels only your own schedules', async () => {
    await save(session); await save(other);
    const mine = await env.call({ action: 'listReportSchedules', session, payload: '{}' });
    expect(mine.schedules).toHaveLength(1);
    const theirs = (await env.call({ action: 'listReportSchedules', session: other, payload: '{}' })).schedules[0];
    expect((await env.call({ action: 'cancelReportSchedule', session, payload: JSON.stringify({ id: theirs.id }) })).status).toBe('error');
    expect((await env.call({ action: 'cancelReportSchedule', session, payload: JSON.stringify({ id: 'all' }) })).removed).toBe(1);
    expect(env.sandbox.runReportSchedules(T('2026-11-12T05:00:00Z'))).toBe(2); // only mgr.two's left
  });

  it('the stop link takes one recipient off one schedule; the last one removes the schedule', async () => {
    await save(session);
    env.sandbox.runReportSchedules(T('2026-11-12T05:00:00Z'));
    const q = (i) => Object.fromEntries(new URL(/href="(https:\/\/script[^"]+)"/.exec(env.mail[i].html)[1].replace(/&amp;/g, '&')).searchParams);
    expect(env.get({ ...q(0), sid: 'other' })).toContain('not valid');
    expect(env.get(q(0))).toContain('will no longer receive');
    expect(env.sandbox.runReportSchedules(T('2026-11-13T05:00:00Z'))).toBe(1);
    expect(env.get(q(1))).toContain('will no longer receive');
    expect(env.sandbox.runReportSchedules(T('2026-11-14T05:00:00Z'))).toBe(0);
  });

  it('deactivateAllReportSchedules switches every schedule off', async () => {
    await save(session); await save(other);
    env.sandbox.deactivateAllReportSchedules();
    expect(env.sandbox.runReportSchedules(T('2026-11-12T05:00:00Z'))).toBe(0);
  });
});

describe('sign-in by email, forgot password, renaming accounts', () => {
  let env;
  beforeEach(async () => {
    env = load();
    await addUser(env, { username: 'op.one', role: 'user', email: 'Op@KMC.example', fullName: 'Op One' });
    await addUser(env, { username: 'boss', role: 'systemadmin', email: 'boss@kmc.example' });
    await addUser(env, { username: 'ua', role: 'useradmin', email: 'ua@kmc.example' });
  });
  const login = (username, password = 'Passw0rd-123') => env.call({ action: 'login', username, password });
  const codeIn = m => /(\d{6})<\/p>/.exec(m.html)[1];

  it('signs in with the username or the email on the account', async () => {
    expect((await login('op.one')).user.username).toBe('op.one');
    expect((await login('op@kmc.example')).user.username).toBe('op.one');
    expect((await login('op@kmc.example', 'wrong')).status).toBe('error');
  });

  it('emails a reset code and sets the new password with it', async () => {
    expect((await env.call({ action: 'requestPasswordReset', identifier: 'op@kmc.example' })).status).toBe('ok');
    expect(env.mail).toHaveLength(1);
    expect(env.mail[0].to).toEqual(['Op@KMC.example']);
    const code = codeIn(env.mail[0]);
    expect((await env.call({ action: 'resetPassword', identifier: 'op.one', code: '000000' === code ? '111111' : '000000', password: 'NewPass-456' })).message).toBe('invalid-code');
    expect((await env.call({ action: 'resetPassword', identifier: 'op.one', code, password: 'short' })).message).toBe('weak-password');
    expect((await env.call({ action: 'resetPassword', identifier: 'op.one', code, password: 'NewPass-456' })).status).toBe('ok');
    expect((await login('op.one', 'NewPass-456')).status).toBe('ok');
    expect((await env.call({ action: 'resetPassword', identifier: 'op.one', code, password: 'Again-789x' })).message).toBe('invalid-code'); // single use
  });

  it('points to the system admin when there is no account or no email on it', async () => {
    await addUser(env, { username: 'no.mail', role: 'user' });
    expect(await env.call({ action: 'requestPasswordReset', identifier: 'nobody@x.example' })).toMatchObject({ status: 'ok', delivery: 'admin' });
    expect(await env.call({ action: 'requestPasswordReset', identifier: 'no.mail' })).toMatchObject({ status: 'ok', delivery: 'admin' });
    expect(await env.call({ action: 'requestPasswordReset', identifier: 'op.one' })).toMatchObject({ delivery: 'email' });
    expect(env.mail).toHaveLength(1);
  });

  it('emails a help request to the production mailbox with a link to the account', async () => {
    await addUser(env, { username: 'no.mail', role: 'user', fullName: 'No Mail' });
    const help = p => env.call({ action: 'submitPasswordHelp', payload: JSON.stringify(p) });
    expect((await help({ fullName: 'No Mail', identifier: '' , contact: '0700' })).message).toBe('missing-fields');
    expect((await help({ fullName: 'No Mail', identifier: 'no.mail', contact: '0700 000000', message: 'Locked out' })).status).toBe('ok');
    const m = env.mail[0];
    expect(m.to).toEqual(['kmcproductiondept@gmail.com']);
    expect(m.subject).toContain('Password help request');
    expect(m.html).toContain('/?manage=no.mail');
    expect(m.html).toContain('0700 000000');
    await help({ fullName: 'x', identifier: 'no.mail', contact: '1' });
    await help({ fullName: 'x', identifier: 'no.mail', contact: '1' });
    expect((await help({ fullName: 'x', identifier: 'no.mail', contact: '1' })).message).toBe('too-many-requests');
  });

  it('lets only a system admin rename an account, and checks the new name', async () => {
    const boss = await signIn(env, 'boss');
    const ua = await signIn(env, 'ua');
    const upd = (session, p) => env.call({ action: 'updateDynamicUser', session, payload: JSON.stringify({ username: 'op.one', ...p }) });
    expect((await upd(ua, { newUsername: 'op.two' })).message).toBe('only-systemadmin-can-rename');
    expect((await upd(ua, { fullName: 'Op Renamed', email: 'new@kmc.example' })).status).toBe('ok');
    expect((await upd(boss, { email: 'not-an-email' })).message).toBe('invalid-email');
    expect((await upd(boss, { newUsername: 'has space' })).message).toBe('invalid-username');
    expect((await upd(boss, { newUsername: 'boss' })).message).toBe('username-taken');
    expect((await upd(boss, { newUsername: 'op.two' })).username).toBe('op.two');
    expect((await login('op.two')).user).toMatchObject({ username: 'op.two', fullName: 'Op Renamed', email: 'new@kmc.example' });
    expect((await login('op.one')).status).toBe('error');
  });
});

describe('backup export', () => {
  it('hands the script-only data to the backup job with the right key, and nothing to anyone else', async () => {
    const env = load();
    env.sandbox.setScheduledReportRecipients('a@kmc.example');
    expect((await env.call({ action: 'exportBackup', key: '' })).message).toBe('unauthorized');
    env.sandbox.setBackupKey();
    const key = env.props.get('backup_key');
    expect((await env.call({ action: 'exportBackup', key: key.slice(0, -1) + 'x' })).message).toBe('unauthorized');
    const r = await env.call({ action: 'exportBackup', key });
    expect(r.status).toBe('ok');
    expect(r.properties.scheduled_report_to).toBe('a@kmc.example');
    expect(JSON.stringify(r)).not.toContain('session_secret');
  });
});

describe('editing a user department', () => {
  it('saves the department and its lines on the account', async () => {
    const env = load();
    await addUser(env, { username: 'op.one', role: 'user', department: 'Production', productionLines: ['Paint Shop'] });
    await addUser(env, { username: 'boss', role: 'systemadmin' });
    const session = await signIn(env, 'boss');
    const r = await env.call({ action: 'updateDynamicUser', session, payload: JSON.stringify({ username: 'op.one', department: 'Quality, Health, Safety and Environment', productionLines: ['Quality'], productionLine: 'Quality' }) });
    expect(r.status).toBe('ok');
    const u = (await env.call({ action: 'login', username: 'op.one', password: 'Passw0rd-123' })).user;
    expect(u).toMatchObject({ department: 'Quality, Health, Safety and Environment', productionLines: ['Quality'] });
  });
});
