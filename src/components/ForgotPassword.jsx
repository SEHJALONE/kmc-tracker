import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CATALOG_WRITE_URL } from '../data/catalogConfig';

// Forgot password.
//   ask  → username or email. If the account has an email, a 6-digit code is
//          emailed (→ code). If not, or no account matches (→ help).
//   code → code + new password (→ done).
//   help → a request to the system admin: emailed to the production mailbox
//          with a link that opens the account in User Management (→ sent).
// Server side: requestPasswordReset_ / resetPassword_ / submitPasswordHelp_ in
// tools/mail-relay/Code-with-email.gs. Uses the Login screen's input styles.
async function post(params) {
  const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body: new URLSearchParams(params) });
  return res.json();
}

const MESSAGES = {
  'invalid-code': 'That code is wrong or has expired. Check the email, or ask for a new code.',
  'weak-password': 'Use at least 8 characters for the new password.',
  'missing-fields': 'Fill in your name, username or email, and how to reach you.',
  'too-many-requests': 'Too many requests. Please wait an hour, or call the production office.',
};
const OFFLINE = 'Could not reach the server. Check your connection and try again.';

export default function ForgotPassword({ initialIdentifier = '', onClose, onDone }) {
  const [step, setStep] = useState('ask');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [help, setHelp] = useState({ fullName: '', contact: '', message: '' });
  const [noEmail, setNoEmail] = useState(false);   // help reached because no code could be emailed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = next => { setError(''); setStep(next); };

  async function sendCode() {
    setError('');
    if (!identifier.trim()) { setError('Enter your username or email.'); return; }
    setBusy(true);
    try {
      const r = await post({ action: 'requestPasswordReset', identifier: identifier.trim().toLowerCase() });
      if (r?.status !== 'ok') setError('Password reset is not available right now. Ask the system admin for help below.');
      else if (r.delivery === 'admin') { setNoEmail(true); go('help'); }
      else go('code');
    } catch { setError(OFFLINE); }
    setBusy(false);
  }

  async function reset() {
    setError('');
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6-digit code from the email.'); return; }
    if (password.length < 8) { setError(MESSAGES['weak-password']); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const r = await post({ action: 'resetPassword', identifier: identifier.trim().toLowerCase(), code: code.trim(), password });
      if (r?.status === 'ok') go('done');
      else setError(MESSAGES[r?.message] || 'The password could not be changed.');
    } catch { setError(OFFLINE); }
    setBusy(false);
  }

  async function sendHelp() {
    setError('');
    if (!help.fullName.trim() || !identifier.trim() || !help.contact.trim()) { setError(MESSAGES['missing-fields']); return; }
    setBusy(true);
    try {
      const r = await post({ action: 'submitPasswordHelp', payload: JSON.stringify({ ...help, identifier: identifier.trim() }) });
      if (r?.status === 'ok') go('sent');
      else setError(MESSAGES[r?.message] || 'The request could not be sent. Please call the production office.');
    } catch { setError(OFFLINE); }
    setBusy(false);
  }

  const label = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 7 };
  const note = { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' };
  const linkBtn = { marginTop: 12, width: '100%', background: 'none', border: 'none', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' };
  const onKey = fn => e => { if (e.key === 'Enter') fn(); };
  const askAdmin = <button type="button" style={linkBtn} onClick={() => { setNoEmail(false); go('help'); }}>Can't reset it yourself? Ask the system admin for help</button>;

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label={step === 'help' || step === 'sent' ? 'Ask the system admin' : 'Reset password'} onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderTop: '2px solid var(--accent)', borderRadius: 12, width: 440, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '24px 26px', fontFamily: "'Inter', system-ui, sans-serif", color: 'var(--text-primary)', boxShadow: 'var(--shadow-login)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {step === 'help' || step === 'sent' ? 'Ask the system admin' : 'Reset password'}
          </span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {error && <div style={{ background: 'var(--accent-alpha)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '9px 12px', fontSize: 13, color: 'var(--accent-text)', marginBottom: 14 }}>⚠ {error}</div>}

        {step === 'ask' && (<>
          <p style={note}>Enter your username or email. If your account has an email address, we'll send a 6-digit code to it.</p>
          <label style={label}>Username or email</label>
          <input className="login-input" value={identifier} onChange={e => setIdentifier(e.target.value)} onKeyDown={onKey(sendCode)} autoComplete="username" autoFocus />
          <button className="login-btn" style={{ marginTop: 18 }} onClick={sendCode} disabled={busy}>{busy ? 'Checking…' : 'Email me a code'}</button>
          {askAdmin}
        </>)}

        {step === 'code' && (<>
          <p style={note}>We've emailed a code to the address on <strong>{identifier.trim()}</strong>. It expires in 15 minutes.</p>
          <label style={label}>Code</label>
          <input className="login-input" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" autoFocus />
          <label style={{ ...label, marginTop: 14 }}>New password</label>
          <input className="login-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
          <label style={{ ...label, marginTop: 14 }}>Confirm new password</label>
          <input className="login-input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={onKey(reset)} autoComplete="new-password" />
          <button className="login-btn" style={{ marginTop: 18 }} onClick={reset} disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
          <button type="button" onClick={() => { setCode(''); go('ask'); }} style={{ ...linkBtn, color: 'var(--text-muted)' }}>Didn't get a code? Send another</button>
          {askAdmin}
        </>)}

        {step === 'help' && (<>
          <p style={note}>
            {noEmail
              ? <>There is no email address on file for <strong>{identifier.trim()}</strong>, so we can't send you a code. </>
              : null}
            Send this request to the system admin. They will check who you are, set a new password and contact you.
          </p>
          <label style={label}>Your full name</label>
          <input className="login-input" value={help.fullName} onChange={e => setHelp(h => ({ ...h, fullName: e.target.value }))} autoComplete="name" autoFocus />
          <label style={{ ...label, marginTop: 14 }}>Username or email</label>
          <input className="login-input" value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" />
          <label style={{ ...label, marginTop: 14 }}>Phone or email to reach you</label>
          <input className="login-input" value={help.contact} onChange={e => setHelp(h => ({ ...h, contact: e.target.value }))} placeholder="e.g. 07XX XXX XXX" autoComplete="tel" />
          <label style={{ ...label, marginTop: 14 }}>Message (optional)</label>
          <textarea className="login-input" rows={3} value={help.message} onChange={e => setHelp(h => ({ ...h, message: e.target.value }))} placeholder="Your department, station, or anything that helps" style={{ resize: 'vertical' }} />
          <button className="login-btn" style={{ marginTop: 18 }} onClick={sendHelp} disabled={busy}>{busy ? 'Sending…' : 'Send to system admin'}</button>
          <button type="button" onClick={() => go('ask')} style={{ ...linkBtn, color: 'var(--text-muted)' }}>← Back</button>
        </>)}

        {step === 'sent' && (<>
          <p style={note}>Your request has been sent to the system admin. They will contact you on <strong>{help.contact.trim()}</strong> once your password has been reset.</p>
          <button className="login-btn" onClick={onClose}>Close</button>
        </>)}

        {step === 'done' && (<>
          <p style={note}>Your password has been changed. Sign in with your username or email and the new password.</p>
          <button className="login-btn" onClick={() => onDone?.(identifier.trim())}>Back to sign in</button>
        </>)}
      </div>
    </div>,
    document.body
  );
}
