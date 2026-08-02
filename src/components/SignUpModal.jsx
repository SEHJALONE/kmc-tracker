import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAccessRequests } from '../hooks/useAccessRequests';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';

const DEPARTMENTS = ['Production', 'Product Development'];

const PRODUCTION_LINES = [
  'Machine Shop',
  'Frame Parts Making',
  'Electrophoresis',
  'Frame & Body Welding',
  'Chassis Line 01',
  'Chassis Line 02',
  'Paint Shop',
  'Trim Line & Final Assembly',
  'Quality Inspection & Testing',
];

const PRODUCT_DEV_LINES = [
  'Vehicle Integration Division',
  'Design and Engineering Division',
  'EE and HV Division',
  'Battery and Energy Storage System',
  'Information Systems Division',
  'Charger Systems Network',
];

export default function SignUpModal({ onClose, theme = 'dark' }) {
  const isDark = theme === 'dark';

  const { submitRequest } = useAccessRequests();

  const [step, setStep]   = useState(1);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    fullName: '', email: '', username: '',
    department: '', productionLines: [], position: '',
    password: '', confirmPassword: '', reason: '',
    preferredStations: [],
  });
  const [showPass, setShowPass] = useState(false);

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'department') { next.productionLines = []; next.preferredStations = []; }
      return next;
    });
  }

  function toggleLine(line) {
    setForm(f => ({
      ...f,
      productionLines: f.productionLines.includes(line)
        ? f.productionLines.filter(l => l !== line)
        : [...f.productionLines, line],
      // Dropping a line clears any station picks that belonged only to it
      preferredStations: f.productionLines.includes(line)
        ? f.preferredStations.filter(code => stationsByLineLabel[line] ? !stationsByLineLabel[line].some(s => s.code === code) : true)
        : f.preferredStations,
    }));
  }

  function toggleStationPref(code) {
    setForm(f => ({
      ...f,
      preferredStations: f.preferredStations.includes(code)
        ? f.preferredStations.filter(c => c !== code)
        : [...f.preferredStations, code],
    }));
  }

  // Only "Production" department lines have a real station catalog
  // (Product Development lines/divisions aren't in SEED_STATIONS).
  const stationsByLineLabel = useMemo(() => {
    const map = {};
    SEED_LINES.forEach(l => { map[l.label] = []; });
    Object.entries(SEED_STATIONS).forEach(([code, st]) => {
      const line = SEED_LINES.find(l => l.id === st.line);
      if (line) map[line.label].push({ code, name: st.name, order: st.order });
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.order - b.order));
    return map;
  }, []);

  const lineOptions = form.department === 'Production'
    ? PRODUCTION_LINES
    : form.department === 'Product Development'
      ? PRODUCT_DEV_LINES
      : [];

  async function handleSubmit() {
    setError('');
    if (!form.fullName.trim())    return setError('Full name is required.');
    if (!form.email.trim() || !form.email.includes('@')) return setError('A valid email is required.');
    if (!form.username.trim())    return setError('Please choose a username.');
    if (!form.department)         return setError('Select your department.');
    if (!form.productionLines.length) return setError('Select at least one production line.');
    if (!form.position.trim())    return setError('Enter your job title / position.');
    if (!form.password || form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirmPassword)      return setError('Passwords do not match.');

    setBusy(true);
    const request = {
      id:             Date.now().toString(),
      fullName:       form.fullName.trim(),
      email:          form.email.trim().toLowerCase(),
      username:       form.username.trim().toLowerCase(),
      department:      form.department,
      productionLines: form.productionLines,
      productionLine:  form.productionLines[0] || '',
      preferredStations: form.preferredStations,
      position:       form.position.trim(),
      password:       form.password,
      reason:         form.reason.trim(),
      status:         'pending',
      submittedAt:    new Date().toISOString(),
    };

    await submitRequest(request);

    try {
      // Always same-origin — this Vercel serverless function is deployed
      // alongside the app itself, so there's no env-dependent URL to get
      // wrong (unlike a build-time VITE_* var, which bakes in whatever was
      // last committed to .env and can silently drift from what's intended).
      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch { /* email failure is non-fatal */ }

    setBusy(false);
    setStep(2);
  }

  const bg     = isDark ? 'rgba(7,9,15,0.97)'     : 'rgba(255,255,255,0.99)';
  const text   = isDark ? '#e2e8f0'                : '#1e293b';
  const muted  = isDark ? '#94a3b8'                : '#475569';
  const dim    = isDark ? '#64748b'                : '#94a3b8';
  const border = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const inpBg  = isDark ? '#0d1526'                : '#ffffff';
  const inpBor = isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.14)';
  const R      = '#dc2626';
  const fm     = "'Inter', system-ui, sans-serif";

  const inp = {
    width: '100%', fontSize: 13, padding: '10px 12px',
    border: `1px solid ${inpBor}`, borderRadius: 6,
    background: inpBg, color: text, outline: 'none',
    boxSizing: 'border-box', fontFamily: fm,
    colorScheme: isDark ? 'dark' : 'light',
    transition: 'border-color 0.15s',
  };
  const lbl = {
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

            {/* Full Name + Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Full Name <span style={{ color: R }}>*</span></label>
                <input style={inp} placeholder="John Doe" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Email Address <span style={{ color: R }}>*</span></label>
                <input style={inp} type="email" placeholder="you@kmc.go.ug" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
            </div>

            {/* Username + Position */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Preferred Username <span style={{ color: R }}>*</span></label>
                <input style={inp} placeholder="john.doe" value={form.username} onChange={e => set('username', e.target.value.replace(/\s/g, '').toLowerCase())} />
              </div>
              <div>
                <label style={lbl}>Job Title / Position <span style={{ color: R }}>*</span></label>
                <input style={inp} placeholder="Production Engineer" value={form.position} onChange={e => set('position', e.target.value)} />
              </div>
            </div>

            {/* Department */}
            <div>
              <label style={lbl}>Department <span style={{ color: R }}>*</span></label>
              <select style={inp} value={form.department} onChange={e => set('department', e.target.value)}>
                <option value="">Select department…</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Production Line(s) — shows once department is picked, multi-select */}
            {form.department && (
              <div>
                <label style={lbl}>Production Line(s) <span style={{ color: R }}>*</span> <span style={{ color: dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(select one or more)</span></label>
                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, background: inpBg, maxHeight: 200, overflowY: 'auto' }}>
                  {lineOptions.map(l => (
                    <label key={l} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: `1px solid ${border}`,
                      background: form.productionLines.includes(l) ? (isDark ? 'rgba(220,38,38,0.08)' : 'rgba(220,38,38,0.05)') : 'transparent',
                    }}>
                      <input type="checkbox" checked={form.productionLines.includes(l)} onChange={() => toggleLine(l)}
                        style={{ accentColor: R, width: 13, height: 13 }} />
                      <span style={{ fontSize: 12, color: form.productionLines.includes(l) ? text : muted }}>{l}</span>
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: dim, marginTop: 5, fontFamily: fm }}>
                  {form.productionLines.length} line(s) selected
                </div>
              </div>
            )}

            {/* Preferred station(s) — optional, only for lines with a real
                station catalog (Production dept). Preselected on the admin's
                approval screen so they can accept as-is or adjust. */}
            {form.department === 'Production' && form.productionLines.length > 0 && (
              <div>
                <label style={lbl}>Preferred Station(s) <span style={{ color: dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — helps the admin pre-fill your assignment)</span></label>
                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, background: inpBg, maxHeight: 220, overflowY: 'auto' }}>
                  {form.productionLines.map(line => (
                    <div key={line}>
                      <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: dim, letterSpacing: '0.08em', textTransform: 'uppercase', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>{line}</div>
                      {(stationsByLineLabel[line] || []).map(s => (
                        <label key={s.code} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 12px 7px 20px', cursor: 'pointer',
                          borderBottom: `1px solid ${border}`,
                          background: form.preferredStations.includes(s.code) ? (isDark ? 'rgba(220,38,38,0.08)' : 'rgba(220,38,38,0.05)') : 'transparent',
                        }}>
                          <input type="checkbox" checked={form.preferredStations.includes(s.code)} onChange={() => toggleStationPref(s.code)}
                            style={{ accentColor: R, width: 13, height: 13 }} />
                          <span style={{ fontSize: 11, color: form.preferredStations.includes(s.code) ? text : muted }}>{s.code}: {s.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: dim, marginTop: 5, fontFamily: fm }}>
                  {form.preferredStations.length} station(s) selected — leave blank if you're not sure, the admin will assign these.
                </div>
              </div>
            )}

            {/* Password + Confirm */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Password <span style={{ color: R }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inp, paddingRight: 60 }}
                    type={showPass ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 10, fontFamily: fm, letterSpacing: '0.06em' }}>
                    {showPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Confirm Password <span style={{ color: R }}>*</span></label>
                <input
                  style={{ ...inp, borderColor: form.confirmPassword && form.confirmPassword !== form.password ? '#dc2626' : inpBor }}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label style={lbl}>Reason for Access <span style={{ color: dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
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
              The system administrator will review your request and assign your role and access level.
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
