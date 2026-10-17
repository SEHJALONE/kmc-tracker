import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';

// Runs the REAL Apps Script (tools/mail-relay/Code-with-email.gs, the file that
// gets pasted into the editor) against an in-memory spreadsheet and fake
// Google services, so the access-request and Travel Card guards are tested
// as executed code rather than read.

// GS_UNDER_TEST points the same tests at another copy of the script (used once to
// confirm they fail against the old live version).
const SOURCE = readFileSync(process.env.GS_UNDER_TEST || resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');

function load() { return loadScripts([SOURCE]); }

const applicant = (over = {}) => ({
  id: '1', fullName: 'Amina Okello', email: 'Amina@Example.com', username: 'Amina.O',
  department: 'Production', productionLines: ['Paint Shop'], position: 'Technician',
  password: 'S3cure-pass', reason: 'Paint line', status: 'pending', preferredStations: [], ceeInterest: false,
  ...over,
});
const submit = (env, req) => env.call({ action: 'submitAccessRequest', payload: JSON.stringify(req) });
const ADMIN = { token: 'kmcisgood' };   // the legacy shared token still works until disableLegacyToken()

describe('submitAccessRequest', () => {
  let env;
  beforeEach(() => { env = load(); });

  it('stores a valid request as pending with the password hashed, never plain', async () => {
    const r = await submit(env, applicant());
    expect(r.status).toBe('ok');
    const [head, row] = env.rows('AccessRequests');
    expect(head[0]).toBe('id');
    expect(row[3]).toBe('amina.o');                       // username, lower-cased
    expect(row[2]).toBe('amina@example.com');
    expect(row[7]).toMatch(/^[0-9a-f-]{36}\$[0-9a-f]{64}$/);
    expect(row[7]).not.toContain('S3cure-pass');
    expect(row[9]).toBe('pending');
  });

  it('says why it refuses', async () => {
    expect((await submit(env, applicant({ password: 'short' }))).message).toBe('missing-fields');
    expect((await submit(env, applicant({ email: 'nope' }))).message).toBe('missing-fields');
    expect((await submit(env, applicant({ fullName: ' ' }))).message).toBe('missing-fields');
    expect((await env.call({ action: 'submitAccessRequest', payload: '{bad' })).message).toBe('bad-json');
    expect(env.rows('AccessRequests').length).toBeLessThanOrEqual(1);  // header only
  });

  it('rejects a second pending request, and a username that already has an account', async () => {
    expect((await submit(env, applicant())).status).toBe('ok');
    expect((await submit(env, applicant({ id: '2' }))).message).toBe('request-already-pending');

    const users = env.sheets.priv.getSheetByName('AccessRequests') && env.sheets.priv;
    const created = await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ username: 'taken.user', password: 'x1234567', role: 'user' }) });
    expect(created.status).toBe('ok');
    expect(users).toBeTruthy();
    expect((await submit(env, applicant({ username: 'Taken.User' }))).message).toBe('username-taken');
  });

  it('caps how fast the public form can be filled', async () => {
    for (let i = 0; i < 30; i++) await submit(env, applicant({ username: `user${i}` }));
    expect((await submit(env, applicant({ username: 'one.more' }))).message).toBe('rate-limited');
  });
});

describe('approving a request', () => {
  it('creates an account the applicant can sign in to, from the stored hash', async () => {
    const env = load();
    await submit(env, applicant());
    const listed = await env.call({ action: 'listAccessRequests', ...ADMIN });
    expect(listed.status).toBe('ok');
    const req = listed.requests[0];
    expect(req.password).toMatch(/^[0-9a-f-]{36}\$[0-9a-f]{64}$/);   // the admin screen never receives the password

    const made = await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ username: req.username, password: req.password, role: 'user', fullName: req.fullName }) });
    expect(made.status).toBe('ok');
    const stored = env.rows('DynamicUsers').at(-1)[1];
    expect(stored).toBe(req.password);                 // not hashed a second time

    const ok = await env.call({ action: 'login', username: 'amina.o', password: 'S3cure-pass' });
    expect(ok.status).toBe('ok');
    expect(ok.session).toContain('.');
    const bad = await env.call({ action: 'login', username: 'amina.o', password: 'wrong-pass' });
    expect(bad.status).toBe('error');
  });

  it('still hashes a plain password from an older request row', async () => {
    const env = load();
    const made = await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ username: 'old.row', password: 'plain-old-pw', role: 'user' }) });
    expect(made.status).toBe('ok');
    const stored = env.rows('DynamicUsers').at(-1)[1];
    expect(stored).toMatch(/^[0-9a-f-]{36}\$[0-9a-f]{64}$/);
    expect((await env.call({ action: 'login', username: 'old.row', password: 'plain-old-pw' })).status).toBe('ok');
  });
});

describe('admin actions', () => {
  it('refuse a missing or invalid admin credential', async () => {
    const env = load();
    for (const action of ['listAccessRequests', 'updateAccessRequest', 'deleteAccessRequest', 'createDynamicUser', 'listDynamicUsers']) {
      const r = await env.call({ action, session: 'forged.value', payload: '{}' });
      expect(r).toMatchObject({ status: 'error', message: 'unauthorized' });
    }
  });
});

describe('Travel Card writer guard', () => {
  it('refuses unknown actions and empty bodies instead of writing a blank row', async () => {
    const env = load();
    const before = env.rows('submissions').length;
    for (const payload of ['{}', '{"action":"somethingElse"}', '{"action":"notifyAdminNew","email":"a@b.c"}', '{"vin":"","stationCode":""}']) {
      const r = await env.call({ payload });
      expect(r.status).toBe('error');
      expect(['unknown-action', 'empty-submission']).toContain(r.message);
    }
    expect(env.rows('submissions').length).toBe(before);
    expect(env.sheets.tracker.getSheetByName('submissions')).toBeNull();
  });

  it('still files a real Travel Card', async () => {
    const env = load();
    const card = {
      timestamp: '2026-10-14T08:00:00.000Z', busModel: '12m KDC', project: '45 Bus Project', vin: 'VIN123',
      line: 'Paint Shop', station: 'Primer', stationCode: 'P01-01', clockIn: '2026-10-14 08:00', clockOut: '2026-10-14 09:00',
      actualTime: 60, designedTime: 55, activityStatuses: {}, resourcesUsed: {}, operators: ['A. Op'],
    };
    const r = await env.call({ payload: JSON.stringify(card) });
    expect(r.status).toBe('ok');
    const sub = env.rows('submissions');
    expect(sub.length).toBe(2);                         // header + the card
    expect(sub[1]).toContain('VIN123');
  });
});
