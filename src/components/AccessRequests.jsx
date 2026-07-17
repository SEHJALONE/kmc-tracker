import { useState, useMemo } from 'react';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';
import { useAccessRequests } from '../hooks/useAccessRequests';
import { useDynamicUsers } from '../hooks/useDynamicUsers';

const ROLE_OPTIONS = [
  { value: 'user',       label: 'General User',  desc: 'Assigned to one station — travel card prefilled & locked' },
  { value: 'supervisor', label: 'Supervisor',     desc: 'Reviews travel cards for assigned stations' },
  { value: 'manager',    label: 'Manager',        desc: 'Reviews all travel cards on a specific line' },
  { value: 'director',   label: 'Director',       desc: 'Reviews travel cards across all lines' },
  { value: 'useradmin',  label: 'User Admin',     desc: 'Manages users, no system settings' },
];

const ROLE_COLOR = {
  user: '#10b981', supervisor: '#f59e0b', manager: '#6366f1',
  director: '#0ea5e9', useradmin: '#a855f7',
};

// Build a map: lineId → array of station codes, sorted by order
function buildStationsByLine() {
  const map = {};
  SEED_LINES.forEach(l => { map[l.id] = []; });
  Object.entries(SEED_STATIONS).forEach(([code, st]) => {
    if (map[st.line]) map[st.line].push({ code, ...st });
  });
  Object.values(map).forEach(arr => arr.sort((a, b) => a.order - b.order));
  return map;
}

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

  const stationsByLine = useMemo(buildStationsByLine, []);

  const { requests, loading: requestsLoading, updateRequest: persistRequestUpdate, deleteRequest: persistRequestDelete } = useAccessRequests();
  const { createUser } = useDynamicUsers();
  const [selected, setSelected]     = useState(null);
  const [tab, setTab]               = useState('pending');
  const [toast, setToast]           = useState(null);
  const [busy, setBusy]             = useState(false);

  // Grant form state
  const [form, setForm] = useState({
    username: '', role: 'user',
    assignedStation: '',     // user: one station code
    assignedLines: {},       // manager: { [lineId]: true }
    assignedStations: {},    // supervisor: { [code]: true }
    stationLine: '',         // user/supervisor: line filter for station picker
    supervisorLineFilter: '', // supervisor: which line to show in picker
  });

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function openRequest(req) {
    setSelected(req);
    setForm({
      username: req.username || '', role: 'user',
      assignedStation: '', assignedLines: {}, assignedStations: {},
      stationLine: '', supervisorLineFilter: '',
    });
  }

  function toggleStation(code) {
    setForm(f => ({
      ...f,
      assignedStations: { ...f.assignedStations, [code]: !f.assignedStations[code] },
    }));
  }

  async function handleApprove() {
    if (!form.username.trim()) return alert('Username is required.');
    if (!selected.password) return alert('This request has no password set. Ask the applicant to resubmit.');
    if (form.role === 'supervisor') {
      const picked = Object.keys(form.assignedStations).filter(k => form.assignedStations[k]);
      if (!picked.length) return alert('Assign at least one station to this supervisor.');
    }
    if (form.role === 'manager') {
      const pickedLines = Object.keys(form.assignedLines).filter(k => form.assignedLines[k]);
      if (!pickedLines.length) return alert('Select at least one line for this manager.');
    }
    if (form.role === 'user') {
      const pickedU = Object.keys(form.assignedStations).filter(k => form.assignedStations[k]);
      if (!pickedU.length) return alert('Assign at least one station to this user.');
    }
    setBusy(true);

    const assignedStationCodes = (form.role === 'supervisor' || form.role === 'user')
      ? Object.keys(form.assignedStations).filter(k => form.assignedStations[k])
      : [];

    const newUser = {
      username:         form.username.trim().toLowerCase(),
      password:         selected.password,
      role:             form.role,
      domain:           null,
      landing:          null,
      fullName:         selected.fullName,
      email:            selected.email,
      department:       selected.department,
      productionLine:   selected.productionLine,
      productionLines:  selected.productionLines?.length ? selected.productionLines : (selected.productionLine ? [selected.productionLine] : []),
      position:         selected.position,
      createdAt:        new Date().toISOString(),
      // role-specific access
      assignedStation:  form.role === 'user'       ? (assignedStationCodes[0] || '') : null,
      assignedLine:     null,
      assignedLines:    form.role === 'manager'    ? Object.keys(form.assignedLines).filter(k => form.assignedLines[k]) : [],
      assignedStations: (form.role === 'supervisor' || form.role === 'user') ? assignedStationCodes : [],
    };

    const result = await createUser(newUser);
    if (!result.ok) {
      setBusy(false);
      return alert(`Could not create the account: ${result.error || 'unknown error'}`);
    }

    await persistRequestUpdate({
      id: selected.id, status: 'approved',
      assignedUsername: newUser.username, assignedRole: form.role,
      processedAt: new Date().toISOString(),
    });

    let emailed = false;
    try {
      const emailRes = await fetch('/api/notify-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: selected.fullName, email: selected.email,
          username: newUser.username, role: form.role,
        }),
      });
      emailed = (await emailRes.json())?.emailed === true;
    } catch { /* email failure is non-fatal — account is already created */ }

    setSelected(null);
    setBusy(false);
    // Resend's free tier can only email your own address until a domain is
    // verified — so applicant notifications commonly fail. Tell the admin so
    // they know to share credentials manually rather than assume it sent.
    showToast(
      emailed
        ? `Access granted to ${selected.fullName} ✓ — confirmation emailed`
        : `Access granted to ${selected.fullName} ✓ — email not sent, share credentials manually`,
      true
    );
  }

  async function handleDeny() {
    if (!confirm(`Deny access for ${selected.fullName}?`)) return;
    await persistRequestUpdate({ id: selected.id, status: 'denied', processedAt: new Date().toISOString() });
    setSelected(null);
    showToast('Request denied.', false);
  }

  function deleteRequest(id) {
    persistRequestDelete(id);
  }

  const inp = {
    width: '100%', fontSize: 13, padding: '9px 11px',
    border: `1px solid ${inpBor}`, borderRadius: 5,
    background: inpBg, color: text, outline: 'none',
    boxSizing: 'border-box', fontFamily: fm,
    colorScheme: isDark ? 'dark' : 'light',
  };
  const lbl = { display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 };

  const pending   = requests.filter(r => r.status === 'pending');
  const processed = requests.filter(r => r.status !== 'pending');
  const displayed = tab === 'pending' ? pending : processed;

  // For user role: stations in the selected line
  const userLineStations = form.stationLine ? (stationsByLine[form.stationLine] || []) : [];

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>

      {/* Banner */}
      <div style={{
        width: '100%', maxWidth: 900, height: 140, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('${isDark ? '/img 2.png' : '/img 1.png'}')`,
        backgroundSize: 'cover', backgroundPosition: 'center 30%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.82) 0%, rgba(7,9,15,0.35) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>Access Requests</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Review and grant system access — assign roles, lines, and stations</div>
          </div>
          <div style={{ marginLeft: 'auto', background: pending.length > 0 ? `${AM}33` : 'rgba(255,255,255,0.1)', color: pending.length > 0 ? AM : 'rgba(255,255,255,0.6)', border: `1px solid ${pending.length > 0 ? AM + '55' : 'rgba(255,255,255,0.15)'}`, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {pending.length} pending
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, maxWidth: 900, borderBottom: `1px solid ${border}`, paddingBottom: 0 }}>
        {[['pending', `Pending (${pending.length})`], ['processed', `Processed (${processed.length})`]].map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); }} style={{
            padding: '8px 18px', background: 'none', border: 'none',
            borderBottom: tab === t ? `2px solid ${R}` : '2px solid transparent',
            color: tab === t ? text : dim, cursor: 'pointer',
            fontSize: 12, fontWeight: tab === t ? 700 : 400,
            fontFamily: fm, letterSpacing: '0.04em', transition: 'all 0.15s', marginBottom: -1,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
          {displayed.map(req => {
            const statusColor = req.status === 'approved' ? GR : req.status === 'denied' ? R : AM;
            const rc = ROLE_COLOR[req.assignedRole] || AM;
            return (
              <div key={req.id} style={{
                border: `1px solid ${border}`, borderRadius: 8, padding: '14px 18px',
                background: card, display: 'flex', alignItems: 'center', gap: 14,
                cursor: req.status === 'pending' ? 'pointer' : 'default',
              }} onClick={() => req.status === 'pending' && openRequest(req)}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${AM}20`, border: `2px solid ${AM}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: AM, flexShrink: 0 }}>
                  {req.fullName?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{req.fullName}</span>
                    <span style={{ fontSize: 10, background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40`, borderRadius: 20, padding: '2px 8px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {req.status}
                    </span>
                    {req.assignedRole && (
                      <span style={{ fontSize: 10, background: `${rc}15`, color: rc, border: `1px solid ${rc}40`, borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                        {ROLE_OPTIONS.find(r => r.value === req.assignedRole)?.label || req.assignedRole}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>{req.position} · {req.department}{req.productionLines?.length ? ` · ${req.productionLines.join(', ')}` : req.productionLine ? ` · ${req.productionLine}` : ''}</div>
                  <div style={{ fontSize: 10, color: dim, fontFamily: "'Courier New', monospace", marginTop: 2 }}>
                    {req.email} · {new Date(req.submittedAt).toLocaleString()}
                    {req.assignedUsername && <span style={{ color: GR }}> · @{req.assignedUsername}</span>}
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
        <div style={{ maxWidth: 640 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: `1px solid ${border}`, color: muted, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', marginBottom: 18 }}>← Back to List</button>

          {/* Applicant card */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '18px 20px', background: card, marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fm, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` }}>Applicant Details</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${AM}20`, border: `2px solid ${AM}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: AM, flexShrink: 0 }}>
                {selected.fullName?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{selected.fullName}</div>
                <div style={{ fontSize: 12, color: muted }}>{selected.position} · {selected.department}{selected.productionLines?.length ? ` / ${selected.productionLines.join(', ')}` : selected.productionLine ? ` / ${selected.productionLine}` : ''}</div>
              </div>
            </div>
            {[
              ['Email',              selected.email],
              ['Requested Username', `@${selected.username}`],
              ['Submitted',         new Date(selected.submittedAt).toLocaleString()],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${border}`, fontSize: 12 }}>
                <span style={{ color: dim, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: fm }}>{l}</span>
                <span style={{ fontWeight: 600, color: text }}>{v}</span>
              </div>
            ))}
            {selected.reason && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9', borderRadius: 6, borderLeft: '2px solid rgba(99,102,241,0.4)' }}>
                <div style={{ fontSize: 10, color: dim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: fm, marginBottom: 4 }}>Reason</div>
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{selected.reason}</div>
              </div>
            )}
          </div>

          {/* Grant access form */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '18px 20px', background: card, marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: GR, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fm, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(16,185,129,0.2)` }}>Grant Access</div>

            {/* Username */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Assign Username</label>
              <input style={inp} value={form.username} onChange={e => setF('username', e.target.value.replace(/\s/g, '').toLowerCase())} placeholder="username" />
              <div style={{ fontSize: 10, color: dim, marginTop: 4, fontFamily: fm }}>Password was set by the applicant during sign-up.</div>
            </div>

            {/* Role selector — cards */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Assign Role</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ROLE_OPTIONS.map(r => {
                  const rc = ROLE_COLOR[r.value];
                  const sel = form.role === r.value;
                  return (
                    <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value, assignedStation: '', assignedLines: {}, assignedStations: {}, stationLine: '' }))} style={{
                      display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                      padding: '10px 14px', borderRadius: 6, cursor: 'pointer',
                      background: sel ? `${rc}12` : (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc'),
                      border: `1px solid ${sel ? rc + '50' : border}`,
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sel ? rc : dim, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: sel ? rc : text, fontFamily: fm }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: dim, fontFamily: fm, marginTop: 1 }}>{r.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Role-specific assignment ── */}

            {/* DIRECTOR: no assignment needed */}
            {form.role === 'director' && (
              <div style={{ padding: '10px 14px', background: isDark ? 'rgba(14,165,233,0.07)' : '#f0f9ff', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 6, fontSize: 12, color: '#0ea5e9', marginBottom: 14 }}>
                Director has read access to travel cards across all lines.
              </div>
            )}

            {/* MANAGER: pick one or more lines */}
            {form.role === 'manager' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Lines to Manage <span style={{ color: '#6366f1' }}>(select one or more)</span></label>
                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, background: inpBg }}>
                  {SEED_LINES.map(l => (
                    <label key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', cursor: 'pointer',
                      borderBottom: `1px solid ${border}`,
                      background: form.assignedLines[l.id] ? (isDark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.05)') : 'transparent',
                    }}>
                      <input type="checkbox" checked={!!form.assignedLines[l.id]}
                        onChange={() => setForm(f => ({ ...f, assignedLines: { ...f.assignedLines, [l.id]: !f.assignedLines[l.id] } }))}
                        style={{ accentColor: '#6366f1', width: 13, height: 13 }} />
                      <span style={{ fontSize: 12, color: form.assignedLines[l.id] ? text : muted }}>{l.label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: dim, marginTop: 5 }}>
                  {Object.values(form.assignedLines).filter(Boolean).length} line(s) selected
                </div>
              </div>
            )}

            {/* SUPERVISOR: pick stations (multi-select, locked to one line) */}
            {form.role === 'supervisor' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Assigned Stations <span style={{ color: AM }}>(select one or more — one line only)</span></label>

                {/* Line — required; changing it clears any previously picked stations */}
                <select style={{ ...inp, marginBottom: 8 }} value={form.supervisorLineFilter} onChange={e => setForm(f => ({ ...f, supervisorLineFilter: e.target.value, assignedStations: {} }))}>
                  <option value="">Select line…</option>
                  {SEED_LINES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>

                {!form.supervisorLineFilter && (
                  <div style={{ fontSize: 11, color: dim, fontFamily: fm, padding: '6px 2px' }}>Select a line to see its stations.</div>
                )}

                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, maxHeight: 240, overflowY: 'auto', background: inpBg }}>
                  {SEED_LINES.filter(l => form.supervisorLineFilter && l.id === form.supervisorLineFilter).map(line => {
                    const stns = stationsByLine[line.id] || [];
                    if (!stns.length) return null;
                    const anyChecked = stns.some(s => form.assignedStations[s.code]);
                    return (
                      <div key={line.id}>
                        {/* Line header */}
                        <div style={{
                          padding: '7px 12px', fontSize: 10, fontWeight: 700,
                          color: anyChecked ? AM : dim,
                          textTransform: 'uppercase', letterSpacing: '0.1em',
                          borderBottom: `1px solid ${border}`,
                          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                          fontFamily: fm,
                        }}>
                          {line.label} ({stns.length})
                        </div>
                        {stns.map(s => (
                          <label key={s.code} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '7px 14px', cursor: 'pointer',
                            borderBottom: `1px solid ${border}`,
                            background: form.assignedStations[s.code]
                              ? (isDark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.05)')
                              : 'transparent',
                          }}>
                            <input
                              type="checkbox"
                              checked={!!form.assignedStations[s.code]}
                              onChange={() => toggleStation(s.code)}
                              style={{ accentColor: AM, width: 13, height: 13 }}
                            />
                            <span style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: AM, flexShrink: 0, minWidth: 52 }}>{s.code}</span>
                            <span style={{ fontSize: 11, color: form.assignedStations[s.code] ? text : muted }}>{s.name}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: dim, marginTop: 6, fontFamily: fm }}>
                  {Object.values(form.assignedStations).filter(Boolean).length} station(s) selected
                </div>
              </div>
            )}

            {/* USER: pick line → then one or more stations (locked to that line on login) */}
            {form.role === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Line</label>
                  <select style={inp} value={form.stationLine} onChange={e => setForm(f => ({ ...f, stationLine: e.target.value, assignedStations: {} }))}>
                    <option value="">Select line…</option>
                    {SEED_LINES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                {form.stationLine && (
                  <div>
                    <label style={lbl}>Assigned Station(s) <span style={{ color: GR }}>(select one or more — prefilled & locked on login)</span></label>
                    <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, maxHeight: 240, overflowY: 'auto', background: inpBg }}>
                      {userLineStations.map(s => (
                        <label key={s.code} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 14px', cursor: 'pointer',
                          borderBottom: `1px solid ${border}`,
                          background: form.assignedStations[s.code]
                            ? (isDark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.05)')
                            : 'transparent',
                        }}>
                          <input
                            type="checkbox"
                            checked={!!form.assignedStations[s.code]}
                            onChange={() => toggleStation(s.code)}
                            style={{ accentColor: GR, width: 13, height: 13 }}
                          />
                          <span style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: GR, flexShrink: 0, minWidth: 52 }}>{s.code}</span>
                          <span style={{ fontSize: 11, color: form.assignedStations[s.code] ? text : muted }}>{s.name}</span>
                        </label>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: dim, marginTop: 6, fontFamily: fm }}>
                      {Object.values(form.assignedStations).filter(Boolean).length} station(s) selected
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Deny / Approve */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDeny} style={{ flex: 1, padding: '10px 0', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 5, color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Deny
              </button>
              <button onClick={handleApprove} disabled={busy} style={{ flex: 2, padding: '10px 0', background: GR, border: `1px solid ${GR}`, borderRadius: 5, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: fm, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Granting…' : '✓ Grant Access'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 10, color: dim, lineHeight: 1.6, textAlign: 'center' }}>
            Credentials are created immediately. Share username and password with the user directly.
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
