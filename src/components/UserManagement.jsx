import { useState, useMemo } from 'react';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';

const DYN_KEY = 'kmc_dynamic_users';

function loadDynamic()     { try { return JSON.parse(localStorage.getItem(DYN_KEY) || '[]'); } catch { return []; } }
function saveDynamic(list) { localStorage.setItem(DYN_KEY, JSON.stringify(list)); }

const ROLE_OPTIONS = [
  { value: 'user',       label: 'General User',  color: '#10b981' },
  { value: 'supervisor', label: 'Supervisor',     color: '#f59e0b' },
  { value: 'manager',    label: 'Manager',        color: '#6366f1' },
  { value: 'director',   label: 'Director',       color: '#0ea5e9' },
  { value: 'useradmin',  label: 'User Admin',     color: '#a855f7' },
];

function buildStationsByLine() {
  const map = {};
  SEED_LINES.forEach(l => { map[l.id] = []; });
  Object.entries(SEED_STATIONS).forEach(([code, st]) => {
    if (map[st.line]) map[st.line].push({ code, ...st });
  });
  Object.values(map).forEach(arr => arr.sort((a, b) => a.order - b.order));
  return map;
}

export default function UserManagement({ onBack, theme = 'dark' }) {
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

  const [users, setUsers]       = useState(() => loadDynamic());
  const [selected, setSelected] = useState(null);
  const [toast, setToast]       = useState(null);
  const [busy, setBusy]         = useState(false);
  const [search, setSearch]     = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  // Edit form mirrors the user's current values
  const [edit, setEdit] = useState(null);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function openEdit(user) {
    setSelected(user);
    setLineFilter('');
    setEdit({
      role:             user.role || 'user',
      password:         '',
      assignedStation:  user.assignedStation || '',
      assignedLine:     user.assignedLine || '',
      assignedStations: Object.fromEntries((user.assignedStations || []).map(c => [c, true])),
      stationLine:      user.assignedStation
        ? (SEED_STATIONS[user.assignedStation]?.line || '')
        : '',
    });
  }

  function setE(k, v) { setEdit(e => ({ ...e, [k]: v })); }

  function toggleStation(code) {
    setEdit(e => ({ ...e, assignedStations: { ...e.assignedStations, [code]: !e.assignedStations[code] } }));
  }

  function handleSave() {
    if (!edit) return;
    if (edit.role === 'supervisor') {
      const picked = Object.keys(edit.assignedStations).filter(k => edit.assignedStations[k]);
      if (!picked.length) return alert('Assign at least one station.');
    }
    if (edit.role === 'manager' && !edit.assignedLine) return alert('Select a line for this manager.');
    if (edit.role === 'user' && !edit.assignedStation) return alert('Assign a station to this user.');
    setBusy(true);

    const assignedCodes = edit.role === 'supervisor'
      ? Object.keys(edit.assignedStations).filter(k => edit.assignedStations[k])
      : [];

    const updated = users.map(u => {
      if (u.username !== selected.username) return u;
      const next = {
        ...u,
        role:             edit.role,
        assignedStation:  edit.role === 'user'       ? edit.assignedStation : null,
        assignedLine:     edit.role === 'manager'    ? edit.assignedLine    : null,
        assignedStations: edit.role === 'supervisor' ? assignedCodes        : [],
      };
      if (edit.password.length >= 8) next.password = edit.password;
      return next;
    });

    saveDynamic(updated);
    setUsers(updated);
    setSelected(null);
    setEdit(null);
    setBusy(false);
    showToast('User updated ✓');
  }

  function handleDelete(username) {
    const updated = users.filter(u => u.username !== username);
    saveDynamic(updated);
    setUsers(updated);
    setSelected(null);
    setEdit(null);
    setConfirmDel(null);
    showToast('User removed.', false);
  }

  const inp = {
    width: '100%', fontSize: 13, padding: '9px 11px',
    border: `1px solid ${inpBor}`, borderRadius: 5,
    background: inpBg, color: text, outline: 'none',
    boxSizing: 'border-box', fontFamily: fm,
    colorScheme: isDark ? 'dark' : 'light',
  };
  const lbl = { display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.username?.includes(q) || u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const userLineStations = edit?.stationLine ? (stationsByLine[edit.stationLine] || []) : [];
  const supervisorLines = SEED_LINES.filter(l => !lineFilter || l.id === lineFilter);

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>

      {/* Banner */}
      <div style={{
        width: '100%', maxWidth: 900, height: 140, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('${isDark ? '/img 2.png' : '/img 1.png'}')`,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.85) 0%, rgba(7,9,15,0.4) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>User Management</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Update roles, stations, and access rights for existing users</div>
          </div>
          <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {users.length} user{users.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* No users */}
      {users.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: muted }}>No dynamic users yet</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Approve access requests to create users.</div>
        </div>
      )}

      {/* User list */}
      {!selected && users.length > 0 && (
        <>
          <div style={{ maxWidth: 900, marginBottom: 14 }}>
            <input style={{ ...inp, maxWidth: 360 }} placeholder="Search by name, username, or email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 900 }}>
            {filtered.map(user => {
              const rc = ROLE_OPTIONS.find(r => r.value === user.role)?.color || AM;
              const rl = ROLE_OPTIONS.find(r => r.value === user.role)?.label || user.role;
              return (
                <div key={user.username} style={{
                  border: `1px solid ${border}`, borderRadius: 8, padding: '13px 18px',
                  background: card, display: 'flex', alignItems: 'center', gap: 14,
                  cursor: 'pointer',
                }} onClick={() => openEdit(user)}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${rc}20`, border: `2px solid ${rc}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: rc, flexShrink: 0 }}>
                    {user.fullName?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{user.fullName || user.username}</span>
                      <span style={{ fontSize: 10, background: `${rc}15`, color: rc, border: `1px solid ${rc}40`, borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>{rl}</span>
                    </div>
                    <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                      @{user.username} · {user.position || '—'} · {user.department || '—'}
                    </div>
                    <div style={{ fontSize: 10, color: dim, marginTop: 2, fontFamily: "'Courier New', monospace" }}>
                      {user.email}
                      {user.assignedStation && <span style={{ color: GR }}> · Station: {user.assignedStation}</span>}
                      {user.assignedLine && <span style={{ color: '#6366f1' }}> · Line: {SEED_LINES.find(l => l.id === user.assignedLine)?.label || user.assignedLine}</span>}
                      {user.assignedStations?.length > 0 && <span style={{ color: AM }}> · {user.assignedStations.length} station(s)</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: muted, flexShrink: 0 }}>Edit →</div>
                </div>
              );
            })}
            {filtered.length === 0 && search && (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: dim, fontSize: 13 }}>No users match "{search}"</div>
            )}
          </div>
        </>
      )}

      {/* Edit panel */}
      {selected && edit && (
        <div style={{ maxWidth: 640 }}>
          <button onClick={() => { setSelected(null); setEdit(null); }} style={{ background: 'transparent', border: `1px solid ${border}`, color: muted, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', marginBottom: 18 }}>← Back to List</button>

          {/* User summary */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '16px 20px', background: card, marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)`, fontFamily: fm }}>User</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${ROLE_OPTIONS.find(r => r.value === selected.role)?.color || AM}20`, border: `2px solid ${ROLE_OPTIONS.find(r => r.value === selected.role)?.color || AM}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: ROLE_OPTIONS.find(r => r.value === selected.role)?.color || AM, flexShrink: 0 }}>
                {selected.fullName?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{selected.fullName}</div>
                <div style={{ fontSize: 12, color: muted }}>@{selected.username} · {selected.email}</div>
                <div style={{ fontSize: 11, color: dim, marginTop: 2 }}>{selected.position} · {selected.department}{selected.productionLine ? ` / ${selected.productionLine}` : ''}</div>
              </div>
            </div>
          </div>

          {/* Edit form */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '18px 20px', background: card, marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: GR, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(16,185,129,0.2)`, fontFamily: fm }}>Edit Rights & Responsibilities</div>

            {/* Role selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Role</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ROLE_OPTIONS.map(r => {
                  const sel = edit.role === r.value;
                  return (
                    <button key={r.value} onClick={() => setEdit(e => ({ ...e, role: r.value, assignedStation: '', assignedLine: '', assignedStations: {}, stationLine: '' }))} style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
                      background: sel ? `${r.color}12` : (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc'),
                      border: `1px solid ${sel ? r.color + '50' : border}`,
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sel ? r.color : dim, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: sel ? r.color : text, fontFamily: fm }}>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Director info */}
            {edit.role === 'director' && (
              <div style={{ padding: '10px 14px', background: isDark ? 'rgba(14,165,233,0.07)' : '#f0f9ff', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 6, fontSize: 12, color: '#0ea5e9', marginBottom: 14 }}>
                Director has review access across all lines.
              </div>
            )}

            {/* Manager: line */}
            {edit.role === 'manager' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Line to Manage</label>
                <select style={inp} value={edit.assignedLine} onChange={e => setE('assignedLine', e.target.value)}>
                  <option value="">Select line…</option>
                  {SEED_LINES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
            )}

            {/* Supervisor: line filter + stations */}
            {edit.role === 'supervisor' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Assigned Stations</label>
                <select style={{ ...inp, marginBottom: 8 }} value={lineFilter} onChange={e => setLineFilter(e.target.value)}>
                  <option value="">Show all lines</option>
                  {SEED_LINES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, maxHeight: 240, overflowY: 'auto', background: inpBg }}>
                  {supervisorLines.map(line => {
                    const stns = stationsByLine[line.id] || [];
                    if (!stns.length) return null;
                    const anyChecked = stns.some(s => edit.assignedStations[s.code]);
                    return (
                      <div key={line.id}>
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: anyChecked ? AM : dim, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: `1px solid ${border}`, background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', fontFamily: fm }}>
                          {line.label} ({stns.length})
                        </div>
                        {stns.map(s => (
                          <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', borderBottom: `1px solid ${border}`, background: edit.assignedStations[s.code] ? (isDark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.05)') : 'transparent' }}>
                            <input type="checkbox" checked={!!edit.assignedStations[s.code]} onChange={() => toggleStation(s.code)} style={{ accentColor: AM, width: 13, height: 13 }} />
                            <span style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: AM, flexShrink: 0, minWidth: 52 }}>{s.code}</span>
                            <span style={{ fontSize: 11, color: edit.assignedStations[s.code] ? text : muted }}>{s.name}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: dim, marginTop: 5, fontFamily: fm }}>
                  {Object.values(edit.assignedStations).filter(Boolean).length} station(s) selected
                </div>
              </div>
            )}

            {/* User: line → station */}
            {edit.role === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Line</label>
                  <select style={inp} value={edit.stationLine} onChange={e => setEdit(e2 => ({ ...e2, stationLine: e.target.value, assignedStation: '' }))}>
                    <option value="">Select line…</option>
                    {SEED_LINES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                {edit.stationLine && (
                  <div>
                    <label style={lbl}>Assigned Station <span style={{ color: GR }}>(prefilled & locked on login)</span></label>
                    <select style={inp} value={edit.assignedStation} onChange={e => setE('assignedStation', e.target.value)}>
                      <option value="">Select station…</option>
                      {userLineStations.map(s => (
                        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Optional password reset */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Reset Password <span style={{ color: dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(leave blank to keep current)</span></label>
              <input style={inp} type="text" value={edit.password} onChange={e => setE('password', e.target.value)} placeholder="Min. 8 characters" />
              {edit.password && edit.password.length < 8 && (
                <div style={{ fontSize: 10, color: R, marginTop: 4, fontFamily: fm }}>Must be at least 8 characters</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDel(selected.username)} style={{ flex: 1, padding: '10px 0', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 5, color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Remove User
              </button>
              <button onClick={handleSave} disabled={busy} style={{ flex: 2, padding: '10px 0', background: GR, border: `1px solid ${GR}`, borderRadius: 5, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: fm, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Saving…' : '✓ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
          <div style={{ background: card, border: `1px solid ${border}`, borderTop: `3px solid ${R}`, borderRadius: 12, padding: '28px 32px', maxWidth: 380, width: '90%', fontFamily: fm }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: text, marginBottom: 8 }}>Remove user?</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 24, lineHeight: 1.5 }}>
              This will permanently delete <strong style={{ color: text }}>@{confirmDel}</strong> from the system. They will not be able to log in.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: '10px 0', background: 'none', border: `1px solid ${border}`, borderRadius: 6, color: muted, cursor: 'pointer', fontSize: 13, fontFamily: fm }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDel)} style={{ flex: 1, padding: '10px 0', background: R, border: `1px solid ${R}`, borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: fm }}>Remove</button>
            </div>
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
