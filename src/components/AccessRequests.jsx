import { useState } from 'react';

const LS_KEY      = 'kmc_access_requests';
const DYN_KEY     = 'kmc_dynamic_users';

function loadRequests() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveRequests(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}
function loadDynamic() {
  try { return JSON.parse(localStorage.getItem(DYN_KEY) || '[]'); } catch { return []; }
}
function saveDynamic(list) {
  localStorage.setItem(DYN_KEY, JSON.stringify(list));
}

const ACCESS_COLOR = { user: '#10b981', supervisor: '#f59e0b', admin: '#dc2626', useradmin: '#6366f1' };
const ACCESS_LABEL = { user: 'General User', supervisor: 'Supervisor', admin: 'Admin', useradmin: 'User Admin' };

const ROLE_OPTIONS = [
  { value: 'user',      label: 'General User — tracker + travel card' },
  { value: 'supervisor', label: 'Supervisor — review travel cards' },
  { value: 'useradmin', label: 'User Admin — admin without system settings' },
];

export default function AccessRequests({ onBack, theme = 'dark' }) {
  const isDark = theme === 'dark';
  const bg     = isDark ? 'rgba(7,9,15,0.92)'     : 'rgba(248,250,252,0.99)';
  const card   = isDark ? 'rgba(13,21,38,0.90)'    : '#ffffff';
  const text   = isDark ? '#e2e8f0'                : '#1e293b';
  const muted  = isDark ? '#94a3b8'                : '#475569';
  const dim    = isDark ? '#64748b'                : '#94a3b8';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
  const inpBg  = isDark ? '#0d1526'                : '#f8fafc';
  const inpBor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  const R      = '#dc2626';
  const GR     = '#10b981';
  const AM     = '#f59e0b';
  const fm     = "'Inter', system-ui, sans-serif";

  const [requests, setRequests]   = useState(() => loadRequests());
  const [selected, setSelected]   = useState(null);
  const [tab, setTab]             = useState('pending'); // 'pending' | 'processed'
  const [toast, setToast]         = useState(null);
  const [approveForm, setApproveForm] = useState({ username: '', password: '', role: 'user' });
  const [busy, setBusy]           = useState(false);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function openRequest(req) {
    setSelected(req);
    setApproveForm({ username: req.username || '', password: '', role: req.accessLevel === 'admin' ? 'useradmin' : req.accessLevel || 'user' });
  }

  function handleApprove() {
    if (!approveForm.username.trim()) return alert('Username is required.');
    if (!approveForm.password.trim() || approveForm.password.length < 6) return alert('Password must be at least 6 characters.');
    setBusy(true);

    // Add to dynamic credentials
    const dynamic = loadDynamic();
    const existing = dynamic.findIndex(u => u.username === approveForm.username.trim().toLowerCase());
    const newUser = {
      username:  approveForm.username.trim().toLowerCase(),
      password:  approveForm.password,
      role:      approveForm.role,
      domain:    null, landing: null,
      fullName:  selected.fullName,
      email:     selected.email,
      department: selected.department,
      position:  selected.position,
      createdAt: new Date().toISOString(),
    };
    if (existing >= 0) dynamic[existing] = newUser;
    else dynamic.push(newUser);
    saveDynamic(dynamic);

    // Mark request as approved
    const updated = requests.map(r => r.id === selected.id
      ? { ...r, status: 'approved', assignedUsername: approveForm.username.trim().toLowerCase(), assignedRole: approveForm.role, processedAt: new Date().toISOString() }
      : r
    );
    saveRequests(updated);
    setRequests(updated);
    setSelected(null);
    setBusy(false);
    showToast(`Access granted to ${selected.fullName} ✓`);
  }

  function handleDeny() {
    if (!confirm(`Deny access for ${selected.fullName}?`)) return;
    const updated = requests.map(r => r.id === selected.id
      ? { ...r, status: 'denied', processedAt: new Date().toISOString() }
      : r
    );
    saveRequests(updated);
    setRequests(updated);
    setSelected(null);
    showToast(`Request denied.`, false);
  }

  function deleteRequest(id) {
    const updated = requests.filter(r => r.id !== id);
    saveRequests(updated);
    setRequests(updated);
  }

  const inp = {
    width: '100%', fontSize: 13, padding: '9px 11px',
    border: `1px solid ${inpBor}`, borderRadius: 5,
    background: inpBg, color: text, outline: 'none',
    boxSizing: 'border-box', fontFamily: fm,
    colorScheme: isDark ? 'dark' : 'light',
  };

  const pending   = requests.filter(r => r.status === 'pending');
  const processed = requests.filter(r => r.status !== 'pending');
  const displayed = tab === 'pending' ? pending : processed;

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>

      {/* Banner image */}
      <div style={{
        width: '100%', maxWidth: 860, height: 140, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: "url('/Quality Inspection & Testing.png')",
        backgroundSize: 'cover', backgroundPosition: 'center 30%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.82) 0%, rgba(7,9,15,0.35) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>Access Requests</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Review and grant system access to users</div>
          </div>
          <div style={{ marginLeft: 'auto', background: pending.length > 0 ? `${AM}33` : 'rgba(255,255,255,0.1)', color: pending.length > 0 ? AM : 'rgba(255,255,255,0.6)', border: `1px solid ${pending.length > 0 ? AM + '55' : 'rgba(255,255,255,0.15)'}`, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {pending.length} pending
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, maxWidth: 860, borderBottom: `1px solid ${border}`, paddingBottom: 0 }}>
        {[['pending', `Pending (${pending.length})`], ['processed', `Processed (${processed.length})`]].map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); }} style={{
            padding: '8px 18px', background: 'none', border: 'none',
            borderBottom: tab === t ? `2px solid ${R}` : '2px solid transparent',
            color: tab === t ? text : dim, cursor: 'pointer',
            fontSize: 12, fontWeight: tab === t ? 700 : 400,
            fontFamily: fm, letterSpacing: '0.04em',
            transition: 'all 0.15s', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* Empty state */}
      {!selected && displayed.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{tab === 'pending' ? '📭' : '✓'}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: tab === 'pending' ? muted : GR }}>
            {tab === 'pending' ? 'No pending requests' : 'No processed requests yet'}
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {tab === 'pending' ? 'Users who sign up will appear here.' : 'Approved and denied requests will appear here.'}
          </div>
        </div>
      )}

      {/* Request list */}
      {!selected && displayed.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 860 }}>
          {displayed.map(req => {
            const aColor = ACCESS_COLOR[req.accessLevel] || AM;
            const statusColor = req.status === 'approved' ? GR : req.status === 'denied' ? R : AM;
            return (
              <div key={req.id} style={{
                border: `1px solid ${border}`, borderRadius: 8, padding: '14px 18px',
                background: card, display: 'flex', alignItems: 'center', gap: 14,
                cursor: req.status === 'pending' ? 'pointer' : 'default',
              }} onClick={() => req.status === 'pending' && openRequest(req)}>
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${aColor}20`, border: `2px solid ${aColor}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: aColor, flexShrink: 0 }}>
                  {req.fullName?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{req.fullName}</span>
                    <span style={{ fontSize: 10, background: `${aColor}15`, color: aColor, border: `1px solid ${aColor}40`, borderRadius: 20, padding: '2px 8px', fontWeight: 700, letterSpacing: '0.04em' }}>
                      {ACCESS_LABEL[req.accessLevel] || req.accessLevel}
                    </span>
                    <span style={{ fontSize: 10, background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40`, borderRadius: 20, padding: '2px 8px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {req.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>{req.position} · {req.department}</div>
                  <div style={{ fontSize: 10, color: dim, fontFamily: "'Courier New', monospace", marginTop: 2 }}>
                    {req.email} · {new Date(req.submittedAt).toLocaleString()}
                    {req.assignedUsername && <span style={{ color: GR }}> · Assigned as @{req.assignedUsername}</span>}
                  </div>
                </div>
                {req.status === 'pending' ? (
                  <div style={{ fontSize: 11, color: AM, fontFamily: fm, letterSpacing: '0.06em', flexShrink: 0 }}>Review →</div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); deleteRequest(req.id); }} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 4, color: dim, cursor: 'pointer', fontSize: 11, padding: '4px 10px', fontFamily: fm }}>Remove</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review panel */}
      {selected && (
        <div style={{ maxWidth: 600 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: `1px solid ${border}`, color: muted, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', marginBottom: 18 }}>← Back to List</button>

          {/* Applicant card */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '18px 20px', background: card, marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fm, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` }}>Applicant Details</div>

            {/* Avatar row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${ACCESS_COLOR[selected.accessLevel] || AM}20`, border: `2px solid ${ACCESS_COLOR[selected.accessLevel] || AM}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: ACCESS_COLOR[selected.accessLevel] || AM, flexShrink: 0 }}>
                {selected.fullName?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{selected.fullName}</div>
                <div style={{ fontSize: 12, color: muted }}>{selected.position} · {selected.department}</div>
              </div>
            </div>

            {[
              ['Email',             selected.email],
              ['Requested Username', `@${selected.username}`],
              ['Access Requested',  ACCESS_LABEL[selected.accessLevel] || selected.accessLevel],
              ['Submitted',         new Date(selected.submittedAt).toLocaleString()],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${border}`, fontSize: 12 }}>
                <span style={{ color: dim, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: fm }}>{l}</span>
                <span style={{ fontWeight: 600, color: text }}>{v}</span>
              </div>
            ))}

            {selected.reason && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9', borderRadius: 6, borderLeft: `2px solid rgba(99,102,241,0.4)` }}>
                <div style={{ fontSize: 10, color: dim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: fm, marginBottom: 4 }}>Reason</div>
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{selected.reason}</div>
              </div>
            )}
          </div>

          {/* Grant access form */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '18px 20px', background: card, marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: GR, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fm, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(16,185,129,0.2)` }}>Grant Access</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Username</label>
                <input style={inp} value={approveForm.username} onChange={e => setApproveForm(f => ({ ...f, username: e.target.value.replace(/\s/g, '').toLowerCase() }))} placeholder="username" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Initial Password</label>
                <input style={inp} type="text" value={approveForm.password} onChange={e => setApproveForm(f => ({ ...f, password: e.target.value }))} placeholder="min 6 characters" />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Assign Role</label>
              <select style={inp} value={approveForm.role} onChange={e => setApproveForm(f => ({ ...f, role: e.target.value }))}>
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDeny} style={{ flex: 1, padding: '10px 0', background: 'rgba(220,38,38,0.07)', border: `1px solid rgba(220,38,38,0.3)`, borderRadius: 5, color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Deny
              </button>
              <button onClick={handleApprove} disabled={busy} style={{ flex: 2, padding: '10px 0', background: GR, border: `1px solid ${GR}`, borderRadius: 5, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: fm, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Granting…' : '✓ Grant Access'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 10, color: dim, lineHeight: 1.6, textAlign: 'center' }}>
            Granting access creates login credentials immediately. Share the username and password with the user directly.
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? 'rgba(16,185,129,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.35)' : 'rgba(220,38,38,0.35)'}`, borderLeft: `3px solid ${toast.ok ? GR : R}`, borderRadius: '0 6px 6px 0', padding: '10px 18px', fontSize: 12, fontFamily: fm, color: toast.ok ? GR : R }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
