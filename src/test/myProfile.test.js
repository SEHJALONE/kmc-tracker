import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';

// Settings page → "My account": a signed-in person edits only their own name,
// phone, email, photo and password. Runs the real Apps Script.
const CODE = readFileSync(resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');
const MAIL = readFileSync(resolve(__dirname, '../../tools/mail-relay/Mail.gs'), 'utf8');
const ADMIN = { token: 'kmcisgood' };
const PW = 'Passw0rd-123';
const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(400);

describe('my account', () => {
  let env, session;
  const save = (patch, s = session) => env.call({ action: 'updateMyProfile', session: s, payload: JSON.stringify(patch) });
  const signIn = async (username, password = PW) => env.call({ action: 'login', username, password });

  beforeEach(async () => {
    env = loadScripts([CODE, MAIL]);
    for (const u of [
      { username: 'op.one', role: 'user', email: 'op@kmc.example', fullName: 'Op One', assignedStations: ['P01-01'] },
      { username: 'op.two', role: 'supervisor', email: 'two@kmc.example', fullName: 'Op Two' },
    ]) expect((await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ password: PW, ...u }) })).status).toBe('ok');
    session = (await signIn('op.one')).session;
  });

  it('needs a valid session', async () => {
    expect((await env.call({ action: 'getMyProfile', session: 'forged.x' })).message).toBe('unauthorized');
    expect((await save({ fullName: 'Hacker' }, '')).message).toBe('unauthorized');
  });

  it('returns my own record, without the password', async () => {
    const r = await env.call({ action: 'getMyProfile', session });
    expect(r.user).toMatchObject({ username: 'op.one', fullName: 'Op One', email: 'op@kmc.example', phone: '', photo: '' });
    expect(JSON.stringify(r)).not.toContain(PW);
    expect(r.user.password).toBeUndefined();
  });

  it('saves name, phone and photo without asking for the password', async () => {
    const r = await save({ fullName: '  Opio   Onesmus ', phone: '+256 700 123456', photo: PHOTO });
    expect(r.status).toBe('ok');
    expect(r.user).toMatchObject({ fullName: 'Opio Onesmus', phone: '+256 700 123456', photo: PHOTO });
    expect((await env.call({ action: 'getMyProfile', session })).user.fullName).toBe('Opio Onesmus');
    // The photo comes back at sign-in, but is never in the administrators' user list.
    expect((await signIn('op.one')).user.photo).toBe(PHOTO);
    const list = await env.call({ action: 'listDynamicUsers', ...ADMIN });
    expect(JSON.stringify(list)).not.toContain('data:image');
  });

  it('changes only my own row and never my role or stations', async () => {
    const r = await save({ username: 'op.two', role: 'systemadmin', roles: ['cee'], assignedStations: [], canAccessTracker: true, fullName: 'Renamed' });
    expect(r.status).toBe('ok');
    expect(r.user).toMatchObject({ username: 'op.one', role: 'user', roles: [], assignedStations: ['P01-01'], fullName: 'Renamed' });
    const users = (await env.call({ action: 'listDynamicUsers', ...ADMIN })).users;
    expect(users.find(u => u.username === 'op.two')).toMatchObject({ fullName: 'Op Two', role: 'supervisor' });
  });

  it('asks for the current password before changing the email', async () => {
    expect((await save({ email: 'new@kmc.example' })).message).toBe('wrong-password');
    expect((await save({ email: 'new@kmc.example', currentPassword: 'nope' })).message).toBe('wrong-password');
    expect((await env.call({ action: 'getMyProfile', session })).user.email).toBe('op@kmc.example');
    expect((await save({ email: 'New@KMC.example', currentPassword: PW })).user.email).toBe('new@kmc.example');
    expect((await signIn('new@kmc.example')).status).toBe('ok');
  });

  it('refuses a mistyped email and suggests the fix', async () => {
    const r = await save({ email: 'op@gmial.com', currentPassword: PW });
    expect(r).toMatchObject({ status: 'error', message: 'bad-email', suggestion: 'op@gmail.com' });
  });

  it('changes the password only with the current one, and stores it hashed', async () => {
    expect((await save({ newPassword: 'short', currentPassword: PW })).message).toBe('weak-password');
    expect((await save({ newPassword: 'Brand-new-pass1', currentPassword: 'wrong' })).message).toBe('wrong-password');
    const r = await save({ newPassword: 'Brand-new-pass1', currentPassword: PW });
    expect(r).toMatchObject({ status: 'ok', passwordChanged: true });
    expect(JSON.stringify(env.rows('DynamicUsers'))).not.toContain('Brand-new-pass1');
    expect((await signIn('op.one', PW)).status).toBe('error');
    expect((await signIn('op.one', 'Brand-new-pass1')).status).toBe('ok');
    // The session issued before the change keeps working (same account, same role).
    expect((await env.call({ action: 'getMyProfile', session })).status).toBe('ok');
  });

  it('locks password guessing after five wrong tries', async () => {
    for (let i = 0; i < 5; i++) expect((await save({ newPassword: 'Brand-new-pass1', currentPassword: 'guess' + i })).message).toBe('wrong-password');
    expect((await save({ newPassword: 'Brand-new-pass1', currentPassword: PW })).message).toBe('too-many-attempts');
  });

  it('refuses bad names, phones and photos, and writes nothing when one field is bad', async () => {
    expect((await save({ fullName: 'X' })).message).toBe('bad-name');
    expect((await save({ phone: 'call me' })).message).toBe('bad-phone');
    expect((await save({ photo: 'https://example.com/a.jpg' })).message).toBe('bad-photo');
    expect((await save({ photo: 'data:image/jpeg;base64,' + 'A'.repeat(50000) })).message).toBe('bad-photo');
    expect((await save({ fullName: 'Good Name', phone: 'bad' })).message).toBe('bad-phone');
    expect((await env.call({ action: 'getMyProfile', session })).user.fullName).toBe('Op One');
  });

  // "My cards" finds a person's Travel Cards by the full name they were filed under.
  it('carries my filed cards along when I correct my name', async () => {
    const cards = env.sheets.tracker.insertSheet('submissions');
    [['record_id', 'submitted_by'], ['r1', 'Op One'], ['r2', 'Op Two'], ['r3', 'Op One']].forEach(r => cards.appendRow(r));
    const r = await save({ fullName: 'Opio Onesmus' });
    expect(r).toMatchObject({ status: 'ok', cardsRenamed: 2, nameShared: false });
    expect(env.rows('submissions').map(x => x[1])).toEqual(['submitted_by', 'Opio Onesmus', 'Op Two', 'Opio Onesmus']);
  });

  it('leaves cards alone when another account has the same name', async () => {
    await env.call({ action: 'createDynamicUser', ...ADMIN, payload: JSON.stringify({ username: 'op.twin', password: PW, role: 'user', fullName: 'Op One' }) });
    const cards = env.sheets.tracker.insertSheet('submissions');
    [['record_id', 'submitted_by'], ['r1', 'Op One']].forEach(r => cards.appendRow(r));
    expect(await save({ fullName: 'Opio Onesmus' })).toMatchObject({ status: 'ok', cardsRenamed: 0, nameShared: true });
    expect(env.rows('submissions')[1][1]).toBe('Op One');
  });

  it('removes the photo when it is cleared', async () => {
    await save({ photo: PHOTO });
    expect((await save({ photo: '' })).user.photo).toBe('');
  });
});
