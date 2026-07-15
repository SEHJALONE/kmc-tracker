import { useState } from 'react';
import { createPortal } from 'react-dom';

const DEPARTMENTS = [
  'Machine Shop', 'Frame & Body Welding', 'Chassis Line',
  'Electrophoresis', 'Paint Shop', 'Trim Line & Final Assembly',
  'Quality Inspection & Testing', 'Administration', 'ICT', 'Other',
];

const ACCESS_LEVELS = [
  { value: 'user',       label: 'General User',  desc: 'View tracker, submit travel cards' },
  { value: 'supervisor', label: 'Supervisor',     desc: 'Review and approve travel cards' },
  { value: 'admin',      label: 'Admin',          desc: 'Full system access, manage users' },
];

const LS_KEY = 'kmc_access_requests';

function loadRequests() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveRequest(req) {
  const list = loadRequests();
  list.push(req);
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export default function SignUpModal({ onClose, theme = 'dark' }) {
  const isDark = theme === 'dark';

  const [step, setStep]     = useState(1); // 1 = form, 2 = success
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const [form, setForm] = useState({
    fullName: '', email: '', username: '',
    department: '', position: '',
    accessLevel: 'user', reason: '',
  });

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit() {
    setError('');
    if (!form.fullName.trim())    return setError('Full name is required.');
    if (!form.email.trim() || !form.email.includes('@')) return setError('A valid email is required.');
    if (!form.username.trim())    return setError('Please choose a username.');
    if (!form.department)         return setError('Select your department.');
    if (!form.position.trim())    return setError('Enter your job position.');

    setBusy(true);
    const request = {
      id:          Date.now().toString(),
      ...form,
      fullName:    form.fullName.trim(),
      email:       form.email.trim().toLowerCase(),
      username:    form.username.trim().toLowerCase(),
      position:    form.position.trim(),
      reason:      form.reason.trim(),
      status:      'pending',
      submittedAt: new Date().toISOString(),
    };

    // Save to localStorage so sysadmin sees it on next login
    saveRequest(request);

    // Fire-and-forget email notification to admin
    try {
      const endpoint = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMAIL_ENDPOINT)
        ? import.meta.env.VITE_EMAIL_ENDPOINT.replace('/send-report', '/notify-admin')
        : '/api/notify-admin';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch { /* email failure is non-fatal */ }

    setBusy(false);
    setStep(2);
  }

  const bg      = isDark ? 'rgba(7,9,15,0.97)'     : 'rgba(255,255,255,0.99)';
  const card    = isDark ? 'rgba(13,21,38,0.90)'    : '#f8fafc';
  const text    = isDark ? '#e2e8f0'                : '#1e293b';
  const muted   = isDark ? '#94a3b8'                : '#475569';
  const dim     = isDark ? '#64748b'                : '#94a3b8';
  const border  = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const inpBg   = isDark ? '#0d1526'                : '#ffffff';
  const inpBor  = isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.14)';
  const R       = '#dc2626';
  const fm      = "'Inter', system-ui, sans-serif";

  const inp = {
    width: '100%', fontSize: 13, padding: '10px 12px',
    border: `1px solid ${inpBor}`, borderRadius: 6,
    background: inpBg, color: text, outline: 'none',
    boxSizing: 'border-box', fontFamily: fm,
    colorScheme: isDark ? 'dark' : 'light',
    transition: 'border-color 0.15s',
  };
  const label = {
    display: 'block', fontSize: 10, fontWeight: 700,
    color: muted, letterSpacing: '0.12em',
    textTransform: 'uppercase', fontFamily: fm, marginBottom: 6,
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: bg,
        border: `1px solid ${border}`,
        borderTop: `3px solid ${R}`,
        borderRadius: 14,
        width: '100%', maxWidth: 500,
        maxHeight: '92vh', overflowY: 'auto',
        padding: '28px 30px 26px',
        margin: '0 16px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        fontFamily: fm,
        color: text,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: text }}>
              Request Access
            </div>
            <div style={{ fontSize: 11, color: dim, marginTop: 4, letterSpacing: '0.04em' }}>
              Your request will be reviewed by the system administrator.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}>✕</button>
        </div>

        {step === 2 ? (
          /* ── Success state ── */
          <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 24 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>Request Submitted</div>
            <div style={{ fontSize: 13, color: muted, lineHeight: 1.6, maxWidth: 340, margin: '0 auto 24px' }}>
              Your access request has been sent to the system administrator. You will be contacted at <strong style={{ color: text }}>{form.email}</strong> once your account is set up.
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
              color: '#10b981', borderRadius: 6, padding: '10px 32px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fm,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Close
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {error && (
              <div style={{
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
                borderLeft: '3px solid #dc2626', borderRadius: '0 5px 5px 0',
                padding: '9px 12px', fontSize: 12, color: '#f87171', fontFamily: fm,
              }}>
                ⚠ {error}
              </div>
            )}

            {/* Row: Full Name + Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Full Name <span style={{ color: R }}>*</span></label>
                <input style={inp} placeholder="John Doe" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
              </div>
              <div>
                <label style={label}>Email Address <span style={{ color: R }}>*</span></label>
                <input style={inp} type="email" placeholder="you@kmc.go.ug" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
            </div>

            {/* Row: Username + Position */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Preferred Username <span style={{ color: R }}>*</span></label>
                <input style={inp} placeholder="john.doe" value={form.username} onChange={e => set('username', e.target.value.replace(/\s/g, '').toLowerCase())} />
              </div>
              <div>
                <label style={label}>Job Title / Position <span style={{ color: R }}>*</span></label>
                <input style={inp} placeholder="Production Engineer" value={form.position} onChange={e => set('position', e.target.value)} />
              </div>
            </div>

            {/* Department */}
            <div>
              <label style={label}>Department <span style={{ color: R }}>*</span></label>
              <select style={{ ...inp }} value={form.department} onChange={e => set('department', e.target.value)}>
                <option value="">Select department…</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Access Level */}
            <div>
              <label style={label}>Requested Access Level</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCESS_LEVELS.map(al => (
                  <button key={al.value} onClick={() => set('accessLevel', al.value)} style={{
                    flex: 1, padding: '10px 8px', borderRadius: 7, cursor: 'pointer',
                    background: form.accessLevel === al.value
                      ? (al.value === 'admin' ? 'rgba(220,38,38,0.10)' : al.value === 'supervisor' ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.10)')
                      : (isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9'),
                    border: `1px solid ${form.accessLevel === al.value
                      ? (al.value === 'admin' ? 'rgba(220,38,38,0.4)' : al.value === 'supervisor' ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)')
                      : border}`,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, fontFamily: fm, letterSpacing: '0.04em',
                      color: form.accessLevel === al.value
                        ? (al.value === 'admin' ? '#f87171' : al.value === 'supervisor' ? '#fbbf24' : '#34d399')
                        : muted,
                      marginBottom: 3,
                    }}>{al.label}</div>
                    <div style={{ fontSize: 9, color: dim, fontFamily: fm, lineHeight: 1.4 }}>{al.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label style={label}>Reason for Access <span style={{ color: dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <textarea
                style={{ ...inp, resize: 'vertical', minHeight: 72, lineHeight: 1.5 }}
                placeholder="Briefly describe why you need access to this system…"
                value={form.reason}
                onChange={e => set('reason', e.target.value)}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={onClose} style={{
                flex: 1, padding: '11px 0', background: 'none',
                border: `1px solid ${border}`, borderRadius: 6,
                color: muted, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                fontFamily: fm, letterSpacing: '0.06em',
              }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={busy} style={{
                flex: 2, padding: '11px 0',
                background: busy ? 'rgba(220,38,38,0.06)' : R,
                border: `1px solid ${busy ? 'rgba(220,38,38,0.2)' : R}`,
                borderRadius: 6, color: busy ? '#f87171' : '#fff',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: fm,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}>
                {busy ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>

            <div style={{ fontSize: 10, color: dim, textAlign: 'center', letterSpacing: '0.04em', lineHeight: 1.5 }}>
              The system administrator will review your request and contact you with your login credentials.
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
