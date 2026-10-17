// Tells you which version of the Apps Script is live, before and after pasting
// the new one:   node scripts/check-apps-script.mjs
//
// Every probe here is chosen so that NEITHER version writes anything: no
// payload that could be filed as a Travel Card, no request that could be stored
// as an access request, no email. It only reads how the server answers.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = readFileSync(join(root, 'src', 'data', 'catalogConfig.js'), 'utf8');
const URL_ = process.argv[2] || cfg.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/)?.[0];
if (!URL_) { console.error('Could not find the Apps Script address.'); process.exit(2); }

async function ask(fields) {
  try {
    const res = await fetch(URL_, { method: 'POST', body: new URLSearchParams(fields) });
    const text = await res.text();
    try { return { json: JSON.parse(text) }; } catch { return { error: `not JSON (${res.status})`, text: text.slice(0, 120) }; }
  } catch (e) {
    return { error: e.message };
  }
}

const out = (ok, text) => console.log(`${ok === null ? '    ' : ok ? 'OK  ' : 'FAIL'}  ${text}`);
let problems = 0;
const check = (ok, text) => { out(ok, text); if (!ok) problems++; };

console.log(`Apps Script: ${URL_.slice(0, 60)}…\n`);

// 1. Is it answering at all?
const hello = await (async () => { try { const r = await fetch(URL_); return await r.json(); } catch { return null; } })();
check(!!hello && hello.status === 'ok', 'The web app answers');

// 2. Which version? The new script routes email actions and checks the session
//    first ("unauthorized"). The old one does not know them and tries to read a
//    payload that is not there (an error mentioning JSON), which writes nothing.
const probe = await ask({ action: 'notifyApproved', session: 'probe' });
const msg = String(probe.json?.message || probe.error || '');
let version = 'unknown';
if (probe.json?.status === 'error' && msg === 'unauthorized') version = 'new';
else if (probe.json?.status === 'error' && /json|undefined|unexpected/i.test(msg)) version = 'old';
out(null, `Version check answered: ${msg || '(no answer)'}`);
check(version === 'new', version === 'new'
  ? 'This is the NEW script (email actions are routed and sessions are checked)'
  : version === 'old'
    ? 'This is still the OLD script: paste Code-with-email.gs and Mail.gs, then redeploy (UPDATE-LIVE-SCRIPT.md)'
    : 'Could not tell which version this is');

// 3. Admin actions must refuse a request that carries no valid admin credential.
const list = await ask({ action: 'listAccessRequests', session: 'probe' });
check(list.json?.status === 'error' && list.json?.message === 'unauthorized',
  'Listing access requests without an admin credential is refused');

// 4. Sign-in answers a wrong password with an error and no session.
const login = await ask({ action: 'login', username: 'check.nobody', password: 'not-a-password' });
check(login.json?.status === 'error' && !login.json?.session, 'A wrong password is refused and no session is issued');

console.log(problems
  ? `\n${problems} check(s) need attention.`
  : '\nAll checks passed. Now sign in as an administrator and open Access Requests.');
process.exitCode = problems ? 1 : 0;
