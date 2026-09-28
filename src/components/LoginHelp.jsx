import { useEffect } from 'react';

// Served from /public, so after every deploy it is fetchable by anyone at
// https://kmc-tracker.vercel.app/docs/KMC-Production-Tracker-User-Guide.pdf
// (share that link directly too). To update the guide, replace the file in
// public/docs/ with the same name and redeploy.
export const USER_GUIDE_URL = '/docs/KMC-Production-Tracker-User-Guide.pdf';

const STEPS = [
  { t: 'Get an account', d: 'On this page click Request Access, fill in your details with a preferred username and password, and submit. Sign in once an admin approves you.' },
  { t: 'Sign in', d: 'Enter your username and password and click Sign In. Tick "Keep me signed in" only on your own device.' },
  { t: 'Open the Travel Card', d: 'Pick the Project, Bus Model, Bus VIN, Production Line and Station from the drop-downs. Note the designated time shown for the station.' },
  { t: 'Add the team', d: 'Type each staff member\'s name and click Add, enter the HSE resources used, then Continue to Activities.' },
  { t: 'Report the work', d: 'Set your clock-in time, then mark every activity Complete, Incomplete, Issue noted or Rework needed.' },
  { t: 'Consumables', d: 'Enter the quantity of each consumable used. Use Add for anything not listed — it stays on that station for everyone\'s next fill-in until someone removes it with ×. Leave the quantity empty if it wasn\'t used this time.' },
  { t: 'Downtime (if over time)', d: 'If the work ran past the designated time, choose the root causes, the minutes each one cost, and complete the root-cause analysis and corrective actions.' },
  { t: 'Submit & download', d: 'After sign-off the card is submitted. Download the Station Report or Full Bus Report from the final page.' },
];

export default function LoginHelp({ theme = 'dark', onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dark = theme === 'dark';
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="login-help-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
          background: dark ? 'rgba(10,14,24,0.96)' : 'rgba(255,255,255,0.97)',
          border: '1px solid var(--border-subtle)', borderTop: '3px solid var(--accent)',
          borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          padding: 'clamp(20px, 4vw, 30px)', fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <div>
            <div id="login-help-title" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-heading)', textTransform: 'uppercase' }}>
              How to use the tracker
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Quick guidelines. The full illustrated guide is below.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6,
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 9px',
          }}>×</button>
        </div>

        <ol style={{ listStyle: 'none', padding: 0, margin: '18px 0 20px', display: 'grid', gap: 12 }}>
          {STEPS.map((s, i) => (
            <li key={s.t} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, alignItems: 'start' }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff',
                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-heading)' }}>{s.t}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{s.d}</div>
              </div>
            </li>
          ))}
        </ol>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href={USER_GUIDE_URL} download="KMC Production Tracker - User Guide.pdf"
            style={{
              flex: '1 1 200px', textAlign: 'center', textDecoration: 'none',
              background: 'var(--accent)', color: '#fff', borderRadius: 6, padding: '12px 14px',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            ⬇ Download user guide (PDF)
          </a>
          <a
            href={USER_GUIDE_URL} target="_blank" rel="noopener noreferrer"
            style={{
              flex: '1 1 140px', textAlign: 'center', textDecoration: 'none',
              border: '1px solid var(--border-medium)', color: 'var(--text-secondary)', borderRadius: 6,
              padding: '12px 14px', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em',
            }}
          >
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  );
}
