// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { parseRecipients, mailProvider, sendMail, explainGmailError, explainResendError, _setTransportForTests, escapeHtml } from '../../api/_lib/mailer.js';
import { verifyTrackerSession } from '../../api/_lib/auth.js';
import sendReport from '../../api/send-report.js';
import notifyApproved from '../../api/notify-approved.js';
import notifyAdmin from '../../api/notify-admin.js';

const SECRET = 'test-secret-uuid-uuid-uuid';

// Signs exactly like the tracker's Apps Script: web-safe base64 WITH "=" padding.
function appsScriptToken(payload, secret = SECRET) {
  const websafe = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const body = websafe(Buffer.from(JSON.stringify(payload), 'utf8'));
  return body + '.' + websafe(crypto.createHmac('sha256', secret).update(body).digest());
}

function fakeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

const ENV_KEYS = ['MAIL_PROVIDER', 'EMAIL_USER', 'EMAIL_PASS', 'RESEND_API_KEY', 'EMAIL_FROM', 'MAIL_FROM_NAME', 'TRACKER_SESSION_SECRET', 'ADMIN_NOTIFICATION_EMAIL', 'SCHEDULED_EMAIL_TO'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  ENV_KEYS.forEach(k => delete process.env[k]);
});
afterEach(() => {
  ENV_KEYS.forEach(k => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  _setTransportForTests(null);
});

function fakeGmail(result) {
  const sent = [];
  _setTransportForTests({ sendMail: vi.fn(async m => { sent.push(m); if (result instanceof Error) throw result; return result || { messageId: '<id@x>', accepted: [].concat(m.to), rejected: [] }; }) });
  return sent;
}

describe('recipients', () => {
  it('splits on commas, semicolons and spaces, drops duplicates, flags bad addresses', () => {
    expect(parseRecipients('a@kmc.co.ug, B@x.com; a@KMC.co.ug  c@y.org')).toEqual({ valid: ['a@kmc.co.ug', 'B@x.com', 'c@y.org'], invalid: [] });
    expect(parseRecipients('ops@kmc, @x.com, ok@x.com').invalid).toEqual(['ops@kmc', '@x.com']);
    expect(parseRecipients(['a@x.com', 'a@x.com']).valid).toEqual(['a@x.com']);
  });
});

describe('provider choice', () => {
  it('prefers Gmail when its credentials are set, Resend otherwise, and honours MAIL_PROVIDER', () => {
    expect(mailProvider({})).toBeNull();
    expect(mailProvider({ RESEND_API_KEY: 'k' })).toBe('resend');
    expect(mailProvider({ RESEND_API_KEY: 'k', EMAIL_USER: 'u@gmail.com', EMAIL_PASS: 'p' })).toBe('gmail');
    expect(mailProvider({ MAIL_PROVIDER: 'resend', EMAIL_USER: 'u', EMAIL_PASS: 'p' })).toBe('resend');
  });
});

describe('sendMail via Gmail', () => {
  beforeEach(() => { process.env.EMAIL_USER = 'kmc.tracker@gmail.com'; process.env.EMAIL_PASS = 'abcd efgh ijkl mnop'; });

  it('sends to several people from the Gmail account with base64 attachments', async () => {
    process.env.EMAIL_FROM = 'KMC Tracker <onboarding@resend.dev>';
    const sent = fakeGmail();
    const r = await sendMail({ to: 'a@kmc.co.ug, b@other.com', subject: 'S', html: '<p>x</p>', attachments: [{ filename: 'r.pdf', content: 'JVBERi0=' }] });
    expect(r).toMatchObject({ provider: 'gmail', accepted: ['a@kmc.co.ug', 'b@other.com'] });
    expect(sent[0].from).toEqual({ name: 'KMC Tracker', address: 'kmc.tracker@gmail.com' });
    expect(sent[0].to).toEqual(['a@kmc.co.ug', 'b@other.com']);
    expect(sent[0].attachments[0]).toMatchObject({ filename: 'r.pdf', encoding: 'base64' });
  });

  it('reports recipients Gmail refused, and fails if it refused all of them', async () => {
    fakeGmail({ messageId: 'x', accepted: ['a@x.com'], rejected: ['b@y.com'] });
    expect((await sendMail({ to: 'a@x.com,b@y.com', subject: 's', html: 'h' })).rejected).toEqual(['b@y.com']);
    fakeGmail({ messageId: 'x', accepted: [], rejected: ['b@y.com'] });
    await expect(sendMail({ to: 'b@y.com', subject: 's', html: 'h' })).rejects.toThrow(/refused every recipient/);
  });

  it('refuses bad input before contacting Gmail', async () => {
    const sent = fakeGmail();
    await expect(sendMail({ to: 'nobody', subject: 's', html: 'h' })).rejects.toThrow(/Not a valid email/);
    await expect(sendMail({ to: '', subject: 's', html: 'h' })).rejects.toThrow(/at least one/);
    await expect(sendMail({ to: Array.from({ length: 51 }, (_, i) => `u${i}@x.com`), subject: 's', html: 'h' })).rejects.toThrow(/Too many/);
    expect(sent).toHaveLength(0);
  });

  it('turns Gmail errors into plain explanations', () => {
    expect(explainGmailError({ code: 'EAUTH', responseCode: 535 })).toMatch(/App Password/);
    expect(explainGmailError({ responseCode: 550, response: '550 5.4.5 Daily user sending limit exceeded' })).toMatch(/daily sending limit/);
    expect(explainGmailError({ code: 'ETIMEDOUT' })).toMatch(/Could not reach Gmail/);
  });
});

it('explains the Resend sandbox restriction that blocked other recipients', () => {
  expect(explainResendError({ message: 'You can only send testing emails to your own email address (x@gmail.com).' })).toMatch(/verified at resend\.com\/domains/);
});

describe('tracker sessions', () => {
  it('accepts a token signed the Apps Script way and rejects tampered or expired ones', () => {
    const good = appsScriptToken({ u: 'kmc.super', r: 'supervisor', e: Date.now() + 60000 });
    expect(verifyTrackerSession(good, SECRET)).toEqual({ username: 'kmc.super', role: 'supervisor' });
    expect(verifyTrackerSession(good, 'other-secret')).toBeNull();
    const [body, sig] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'systemadmin', r: 'systemadmin', e: Date.now() + 60000 })).toString('base64url');
    expect(verifyTrackerSession(forged + '.' + sig, SECRET)).toBeNull();
    expect(verifyTrackerSession(body + '.' + sig.slice(0, -3) + 'AAA', SECRET)).toBeNull();
    expect(verifyTrackerSession(appsScriptToken({ u: 'x', r: 'user', e: Date.now() - 1 }), SECRET)).toBeNull();
    expect(verifyTrackerSession('', SECRET)).toBeNull();
  });
});

describe('email endpoints only send for the right people', () => {
  beforeEach(() => { process.env.EMAIL_USER = 'kmc.tracker@gmail.com'; process.env.EMAIL_PASS = 'pw'; });

  it('send-report is switched off until the session secret is configured', async () => {
    const sent = fakeGmail();
    const res = fakeRes();
    await sendReport({ method: 'POST', body: { to: 'a@x.com' } }, res);
    expect(res.statusCode).toBe(503);
    expect(sent).toHaveLength(0);
  });

  it('send-report refuses anonymous callers and sends for signed-in users, escaping their input', async () => {
    process.env.TRACKER_SESSION_SECRET = SECRET;
    const sent = fakeGmail();
    let res = fakeRes();
    await sendReport({ method: 'POST', body: { to: 'victim@x.com', subject: 'spam' } }, res);
    expect(res.statusCode).toBe(401);
    expect(sent).toHaveLength(0);

    res = fakeRes();
    const session = appsScriptToken({ u: 'kmc.super', r: 'supervisor', e: Date.now() + 60000 });
    await sendReport({ method: 'POST', body: { session, to: 'a@kmc.co.ug, b@x.com', filterSummary: '<script>x</script>', busCount: 7,
      attachments: [{ filename: 'r.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0=' }, { filename: 'evil.exe', dataUrl: 'data:application/x-msdownload;base64,TVo=' }] } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, sent: true, accepted: ['a@kmc.co.ug', 'b@x.com'] });
    expect(sent[0].html).toContain('&lt;script&gt;');
    expect(sent[0].html).not.toContain('<script>');
    expect(sent[0].attachments.map(a => a.filename)).toEqual(['r.pdf']);
  });

  it('notify-approved needs an admin session', async () => {
    process.env.TRACKER_SESSION_SECRET = SECRET;
    const sent = fakeGmail();
    const body = { fullName: 'New Person', email: 'new@x.com', username: 'new.person', role: 'user' };
    let res = fakeRes();
    await notifyApproved({ method: 'POST', body: { ...body, session: appsScriptToken({ u: 'kmc', r: 'user', e: Date.now() + 60000 }) } }, res);
    expect(res.statusCode).toBe(403);
    res = fakeRes();
    await notifyApproved({ method: 'POST', body: { ...body, session: appsScriptToken({ u: 'systemadmin', r: 'systemadmin', e: Date.now() + 60000 }) } }, res);
    expect(res.body).toMatchObject({ ok: true, emailed: true });
    expect(sent[0].to).toEqual(['new@x.com']);
  });

  it('notify-admin works without a session but only ever emails the admin list', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin1@x.com, admin2@x.com';
    const sent = fakeGmail();
    const res = fakeRes();
    await notifyAdmin({ method: 'POST', body: { fullName: '<b>Eve</b>', email: 'eve@x.com', to: 'victim@x.com' } }, res);
    expect(res.body.emailed).toBe(true);
    expect(sent[0].to).toEqual(['admin1@x.com', 'admin2@x.com']);
    expect(sent[0].html).toContain(escapeHtml('<b>Eve</b>'));
  });
});
