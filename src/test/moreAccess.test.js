import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';

// Settings → "Request more access": someone with an account asks for extra
// stations or modules; administrators see it and close it. Runs the real script.
const CODE = readFileSync(resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');
const MAIL = readFileSync(resolve(__dirname, '../../tools/mail-relay/Mail.gs'), 'utf8');
const ADMIN = { token: 'kmcisgood' };
const PW = 'Passw0rd-123';

describe('requests for more access', () => {
  let env, op, other, boss;
  const ask = (payload, session = op) => env.call({ action: 'requestMoreAccess', session, payload: JSON.stringify(payload) });
  const list = session => env.call({ action: 'listAccessChangeRequests', session });

  beforeEach(async () => {
    env = loadScripts([CODE, MAIL]);
    for (const u of [
      { username: 'op.one', role: 'user', email: 'op@kmc.example', fullName: 'Op One', assignedStations: ['P01-01'] },
      { username: 'op.two', role: 'user', email: 'two@kmc.example', fullName: 'Op Two' },
      { username: 'boss', role: 'systemadmin', email: 'boss@kmc.example', fullName: 'Boss' },
    ]) expect((await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ password: PW, ...u }) })).status).toBe('ok');
    const signIn = async username => (await env.call({ action: 'login', username, password: PW })).session;
    op = await signIn('op.one'); other = await signIn('op.two'); boss = await signIn('boss');
  });

  it('needs a session and something to ask for', async () => {
    expect((await ask({ stations: ['P01-02'] }, 'forged.x')).message).toBe('unauthorized');
    expect((await ask({ stations: [], extras: [], reason: 'hi' })).message).toBe('nothing-requested');
  });

  it('stores the request under the signed-in account and emails the administrators', async () => {
    const r = await ask({ username: 'op.two', stations: ['P01-02', 'P01-02', ' P01-03 '], extras: ['Bus Tracker'], reason: 'Covering the next booth this month' });
    expect(r).toMatchObject({ status: 'ok', adminNotified: true });
    const mine = (await list(op)).requests;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ username: 'op.one', fullName: 'Op One', stations: ['P01-02', 'P01-03'], extras: ['Bus Tracker'], status: 'pending' });
    const m = env.mail[env.mail.length - 1];
    expect(m.subject).toContain('More access requested');
    expect([...m.to, ...m.bcc]).toContain('boss@kmc.example');
    // Asking changes nothing on the account itself.
    expect((await env.call({ action: 'getMyProfile', session: op })).user.assignedStations).toEqual(['P01-01']);
  });

  it('shows people only their own requests, and administrators all of them', async () => {
    await ask({ stations: ['P01-02'] });
    await ask({ extras: ['Cost Estimation'] }, other);
    expect((await list(op)).requests.map(r => r.username)).toEqual(['op.one']);
    const all = await list(boss);
    expect(all.admin).toBe(true);
    expect(all.requests.map(r => r.username).sort()).toEqual(['op.one', 'op.two']);
  });

  it('lets only an administrator close a request', async () => {
    const { id } = await ask({ stations: ['P01-02'] });
    expect((await env.call({ action: 'resolveAccessChangeRequest', session: op, id, status: 'done' })).message).toBe('unauthorized');
    expect((await env.call({ action: 'resolveAccessChangeRequest', session: boss, id, status: 'maybe' })).message).toBe('bad-status');
    expect((await env.call({ action: 'resolveAccessChangeRequest', session: boss, id, status: 'done', note: 'Added P01-02' })).status).toBe('ok');
    expect((await list(op)).requests[0]).toMatchObject({ status: 'done', processedBy: 'boss', adminNote: 'Added P01-02' });
  });

  it('holds a person to three open requests', async () => {
    for (let i = 0; i < 3; i++) expect((await ask({ reason: `Need station group ${i}` })).status).toBe('ok');
    expect((await ask({ reason: 'One more please' })).message).toBe('too-many-pending');
  });
});
