// The signed session the Apps Script issues at login. It replaces the shared
// admin token that used to be bundled into the site: the server decides from the
// session which account (and role) is asking, so nothing in this file is a secret.
//
// Token shape: base64url(JSON{u,r,e}) + "." + signature. We only read the
// payload here (username, role, expiry) to decide when to ask for a fresh
// sign-in — the signature is checked by the server on every request.
const KEY = 'kmc_session';

function decode(token) {
  try {
    const b64 = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const p = JSON.parse(json);
    return p && p.u && Number(p.e) ? p : null;
  } catch { return null; }
}

// "Keep me signed in" → localStorage (survives closing the browser);
// otherwise sessionStorage (gone when the tab closes).
export function setSession(token, remember) {
  clearSession();
  try { (remember ? localStorage : sessionStorage).setItem(KEY, token); } catch { /* storage blocked */ }
}

export function clearSession() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// The current token, or null if there is none or it has expired.
export function getSession() {
  let token = null;
  try { token = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch { return null; }
  if (!token) return null;
  const p = decode(token);
  if (!p || p.e < Date.now()) { clearSession(); return null; }
  return token;
}

// Form field to spread into an Apps Script request body.
export function sessionParam() {
  return { session: getSession() || '' };
}
