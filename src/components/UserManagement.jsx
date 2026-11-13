import { useState, useMemo, useEffect, useRef } from 'react';
import ThemeSwitch from './ui/ThemeSwitch';
import { StatTile } from './ui/Charts';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';
import { useDynamicUsers } from '../hooks/useDynamicUsers';
import { useDepartments } from '../data/departments';

// Manager removed from selection for now — kept out of the picker, but any
// existing manager-role user still displays fine (falls back to the color/
// label lookups' defaults) and their review logic stays intact in code.
const ROLE_OPTIONS = [
  { value: 'user',       label: 'General User',  color: '#10b981' },
  { value: 'supervisor', label: 'Supervisor',     color: '#f59e0b' },
  { value: 'director',   label: 'Director',       color: '#0ea5e9' },
  { value: 'useradmin',  label: 'User Admin',     color: '#a855f7' },
  { value: 'cee',        label: 'Cost Estimations Engineer', color: '#0f766e' },
];

// Supplementary roles a user can hold ON TOP OF their primary Role above —
// e.g. a Supervisor who's also a Cost Estimations Engineer. Additive only;
// every other role check in the app still looks at the primary `role` field.
const SUPPLEMENTARY_ROLE_OPTIONS = [
  { value: 'cee', label: 'Cost Estimations Engineer', color: '#0f766e' },
  { value: 'typeapproval', label: 'Type Approvals (VIN register)', color: '#4338ca' },
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

// Chassis Line 01 and 02 are two physical lines but one continuous flow —
// grouped as a single pick for General User so one person can be assigned
// stations spanning both without it being treated as "crossing lines".
const CHASSIS_GROUP_ID = 'CHASSIS_ALL';
const USER_LINE_OPTIONS = (() => {
  const out = [];
  let inserted = false;
  SEED_LINES.forEach(l => {
    if (l.id === 'CHASSIS1' || l.id === 'CHASSIS2') {
      if (!inserted) { out.push({ id: CHASSIS_GROUP_ID, label: 'Chassis Line (01 & 02)' }); inserted = true; }
      return;
    }
    out.push(l);
  });
  return out;
})();
function userLineStationsFor(stationsByLine, lineId) {
  if (lineId === CHASSIS_GROUP_ID) {
    return [...(stationsByLine.CHASSIS1 || []), ...(stationsByLine.CHASSIS2 || [])];
  }
  return stationsByLine[lineId] || [];
}

const SAVE_ERRORS = {
  'username-taken': 'That username is already in use.',
  'invalid-username': 'Usernames use 3–40 letters, numbers, dots, dashes or underscores (no spaces).',
  'invalid-email': 'That email address is not valid.',
  'only-systemadmin-can-rename': 'Only a system admin can change a username.',
};

// `role` is the signed-in admin's role: only a system admin may rename accounts.
export default function UserManagement({ onBack, onToggleTheme = null, theme = 'dark', role = '', initialUsername = null }) {
  const canRename = role === 'systemadmin';
  const departments = useDepartments();
  const isDark = theme === 'dark';
  const bg     = 'transparent';
  const card   = 'var(--bg-card)';
  const text   = 'var(--text-primary)';
  const muted  = 'var(--text-secondary)';
  const dim    = 'var(--text-muted)';
  const border = 'var(--border-subtle)';
  const inpBg  = 'var(--input-bg)';
  const inpBor = 'var(--input-border)';
  const R      = '#dc2626';
  const GR     = '#10b981';
  const AM     = '#f59e0b';
  const fm     = "'Inter', system-ui, sans-serif";

  const stationsByLine = useMemo(buildStationsByLine, []);

  const { dynamicUsers: users, loadError, refreshDynamicUsers, updateUser: persistUpdateUser, deleteUser: persistDeleteUser } = useDynamicUsers();
  const [selected, setSelected] = useState(null);
  const [toast, setToast]       = useState(null);
  const [busy, setBusy]         = useState(false);
  const [search, setSearch]     = useState('');
  const [supervisorLines, setSupervisorLines] = useState({}); // { [lineId]: true } — which lines to show stations for
  const [confirmDel, setConfirmDel] = useState(null);

  // Edit form mirrors the user's current values
  const [edit, setEdit] = useState(null);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function openEdit(user) {
    setSelected(user);
    // Cover every line the user's current stations belong to, not just the first.
    const stationLines = [...new Set((user.assignedStations || []).map(c => SEED_STATIONS[c]?.line).filter(Boolean))];
    setSupervisorLines(Object.fromEntries(stationLines.map(id => [id, true])));
    const existingLines = user.assignedLines?.length
      ? user.assignedLines
      : user.assignedLine ? [user.assignedLine] : [];
    // Legacy dynamic users may only have the singular `assignedStation` —
    // seed the multi-select from it when `assignedStations` isn't set yet.
    const existingStations = user.assignedStations?.length
      ? user.assignedStations
      : user.assignedStation ? [user.assignedStation] : [];
    setEdit({
      fullName:         user.fullName || '',
      email:            user.email || '',
      username:         user.username || '',
      department:       user.department || '',
      units:            user.productionLines?.length ? [...user.productionLines] : user.productionLine ? [user.productionLine] : [],
      role:             user.role || 'user',
      password:         '',
      assignedStation:  user.assignedStation || '',
      assignedLines:    Object.fromEntries(existingLines.map(c => [c, true])),
      assignedStations: Object.fromEntries(existingStations.map(c => [c, true])),
      stationLine:      user.assignedStation
        ? (() => {
            const raw = SEED_STATIONS[user.assignedStation]?.line || '';
            return (raw === 'CHASSIS1' || raw === 'CHASSIS2') ? CHASSIS_GROUP_ID : raw;
          })()
        : '',
      // Missing/undefined = access on (every user created before this
      // toggle existed keeps working exactly as before).
      canAccessTracker: user.canAccessTracker !== false,
      roles: Object.fromEntries((user.roles || []).map(r => [r, true])),
    });
  }

  // Opened from a password-help email (?manage=<username>): go straight to that account.
  const openedInitial = useRef(false);
  useEffect(() => {
    if (openedInitial.current || !initialUsername || !users.length) return;
    const u = users.find(x => String(x.username).toLowerCase() === String(initialUsername).toLowerCase());
    openedInitial.current = true;
    if (u) openEdit(u); else setSearch(initialUsername);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUsername, users]);

  function setE(k, v) { setEdit(e => ({ ...e, [k]: v })); }

  function toggleStation(code) {
    setEdit(e => ({ ...e, assignedStations: { ...e.assignedStations, [code]: !e.assignedStations[code] } }));
  }

  async function handleSave() {
    if (!edit) return;
    if (edit.role === 'supervisor') {
      const picked = Object.keys(edit.assignedStations).filter(k => edit.assignedStations[k]);
      if (!picked.length) return alert('Assign at least one station.');
    }
    if (edit.role === 'manager') {
      const pickedLines = Object.keys(edit.assignedLines).filter(k => edit.assignedLines[k]);
      if (!pickedLines.length) return alert('Select at least one line for this manager.');
    }
    if (edit.role === 'user') {
      const pickedU = Object.keys(edit.assignedStations).filter(k => edit.assignedStations[k]);
      if (!pickedU.length) return alert('Assign at least one station to this user.');
    }
    const newUsername = edit.username.trim().toLowerCase();
    const renaming = canRename && newUsername && newUsername !== selected.username.toLowerCase();
    if (renaming && !/^[a-z0-9._-]{3,40}$/.test(newUsername)) return alert(SAVE_ERRORS['invalid-username']);
    if (edit.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(edit.email.trim())) return alert(SAVE_ERRORS['invalid-email']);
    if (renaming && selected.username === localStorage.getItem('kmc_username')
      && !window.confirm('You are renaming your own account. You will need to sign in again with the new username. Continue?')) return;
    setBusy(true);

    const assignedCodes = (edit.role === 'supervisor' || edit.role === 'user')
      ? Object.keys(edit.assignedStations).filter(k => edit.assignedStations[k])
      : [];

    // Only include `password` when the admin actually entered a new one —
    // the server never sends passwords back on reads, so omitting it here
    // leaves the stored password untouched.
    const patch = {
      role:             edit.role,
      assignedStation:  edit.role === 'user'       ? (assignedCodes[0] || '') : null,
      assignedLine:     null,
      assignedLines:    edit.role === 'manager'    ? Object.keys(edit.assignedLines).filter(k => edit.assignedLines[k]) : [],
      assignedStations: (edit.role === 'supervisor' || edit.role === 'user') ? assignedCodes : [],
      canAccessTracker: edit.canAccessTracker,
      roles: Object.keys(edit.roles || {}).filter(k => edit.roles[k]),
    };
    if (edit.password.length >= 8) patch.password = edit.password;
    if (edit.fullName.trim() && edit.fullName.trim() !== (selected.fullName || '')) patch.fullName = edit.fullName.trim();
    if (edit.email.trim() && edit.email.trim() !== (selected.email || '')) patch.email = edit.email.trim();
    if (renaming) patch.newUsername = newUsername;
    const oldUnits = selected.productionLines?.length ? selected.productionLines : selected.productionLine ? [selected.productionLine] : [];
    if (edit.department && (edit.department !== (selected.department || '') || edit.units.join('|') !== oldUnits.join('|'))) {
      patch.department = edit.department;
      patch.productionLines = edit.units;
      patch.productionLine = edit.units[0] || '';
    }

    const result = await persistUpdateUser(selected.username, patch);
    setSelected(null);
    setEdit(null);
    setBusy(false);
    if (!result.ok) return alert(`Could not save changes: ${SAVE_ERRORS[result.error] || result.error || 'unknown error'}`);
    showToast('User updated ✓');
  }

  async function handleDelete(username) {
    await persistDeleteUser(username);
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

  const userLineStations = edit?.stationLine ? userLineStationsFor(stationsByLine, edit.stationLine) : [];

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)', maxWidth: 1000, margin: '0 auto' }}>

      {/* Banner */}
      <div style={{
        width: '100%', maxWidth: '100%', height: 150, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--panel-shadow)',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('${isDark ? '/img 2.png' : '/img 1.png'}')`,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(10,13,20,0.92) 0%, rgba(10,13,20,0.72) 58%, rgba(10,13,20,0.5) 100%)' }} />
        {onToggleTheme && <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 2 }}><ThemeSwitch theme={theme} onToggle={onToggleTheme} /></div>}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} className="kmc-btn" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff', backdropFilter: 'blur(6px)' }}>← Back</button>
          <div>
            <div className="kmc-title" style={{ color: '#fff', fontSize: 34, textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>User Management</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)', letterSpacing: '0.02em', marginTop: 4 }}>Update roles, stations, and access rights for existing users</div>
          </div>
          <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {users.length} user{users.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="kmc-panel" style={{ marginBottom: 16, padding: '14px 16px', borderLeft: '4px solid var(--c-red)', fontSize: 13, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>The user list could not be loaded from the server.</div>
          <div style={{ color: 'var(--text-secondary)' }}>{loadError}</div>
          <button className="kmc-btn" style={{ marginTop: 10 }} onClick={refreshDynamicUsers}>Try again</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 22 }}>
        <StatTile label="Users" value={users.length} tone="blue" sub="accounts in the system" />
        <StatTile label="Supervisors & managers" value={users.filter(u => u.role === 'supervisor' || u.role === 'manager').length} tone="amber" sub="can approve travel cards" />
        <StatTile label="Administrators" value={users.filter(u => u.role === 'systemadmin' || u.role === 'useradmin').length} tone="red" sub="system & user admins" />
        <StatTile label="No email on file" value={users.filter(u => !u.email).length} tone="pink" sub="will not receive notifications" />
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
          <div style={{ maxWidth: '100%', marginBottom: 14 }}>
            <input style={{ ...inp, maxWidth: 360 }} placeholder="Search by name, username, or email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%' }}>
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
                      {user.canAccessTracker === false && (
                        <span style={{ fontSize: 10, background: `${R}15`, color: R, border: `1px solid ${R}40`, borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>Tracker Access Revoked</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                      @{user.username} · {user.position || '—'} · {user.department || '—'}
                    </div>
                    <div style={{ fontSize: 10, color: dim, marginTop: 2, fontFamily: "'Courier New', monospace" }}>
                      {user.email}
                      {user.role === 'user' && user.assignedStations?.length > 0 && <span style={{ color: GR }}> · Station{user.assignedStations.length > 1 ? 's' : ''}: {user.assignedStations.join(', ')}</span>}
                      {user.role === 'user' && !user.assignedStations?.length && user.assignedStation && <span style={{ color: GR }}> · Station: {user.assignedStation}</span>}
                      {user.assignedLines?.length > 0 && <span style={{ color: '#6366f1' }}> · Lines: {user.assignedLines.map(id => SEED_LINES.find(l => l.id === id)?.label || id).join(', ')}</span>}
                      {user.role === 'supervisor' && user.assignedStations?.length > 0 && <span style={{ color: AM }}> · {user.assignedStations.length} station(s)</span>}
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
                <div style={{ fontSize: 11, color: dim, marginTop: 2 }}>{selected.position} · {selected.department}{selected.productionLines?.length ? ` / ${selected.productionLines.join(', ')}` : selected.productionLine ? ` / ${selected.productionLine}` : ''}</div>
              </div>
            </div>
          </div>

          {/* Edit form */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '18px 20px', background: card, marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: GR, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(16,185,129,0.2)`, fontFamily: fm }}>Account Details</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Full name</label>
                <input style={inp} value={edit.fullName} onChange={e => setE('fullName', e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={edit.email} onChange={e => setE('email', e.target.value)} placeholder="name@kmc.co.ug" />
              </div>
              <div>
                <label style={lbl}>Username {!canRename && <span style={{ textTransform: 'none', letterSpacing: 0 }}>(system admin only)</span>}</label>
                <input style={{ ...inp, opacity: canRename ? 1 : 0.6 }} value={edit.username} onChange={e => setE('username', e.target.value)} disabled={!canRename} autoCapitalize="none" spellCheck={false} />
              </div>
            </div>
            {(() => {
              const known = departments.some(d => d.name === edit.department);
              const options = departments.find(d => d.name === edit.department)?.units || [];
              // Lines/divisions saved on the account that are no longer in the list still show, so they can be kept or removed.
              const shown = [...options, ...edit.units.filter(u => !options.includes(u))];
              return (
                <div style={{ marginBottom: 18 }}>
                  <label style={lbl}>Department</label>
                  <select style={inp} value={edit.department} onChange={e => setEdit(x => ({ ...x, department: e.target.value, units: [] }))}>
                    <option value="">Select department…</option>
                    {!known && edit.department && <option value={edit.department}>{edit.department} (no longer in the list)</option>}
                    {departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                  {shown.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <label style={lbl}>Line(s) / Division(s)</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {shown.map(u => {
                          const on = edit.units.includes(u);
                          return (
                            <button key={u} type="button"
                              onClick={() => setEdit(x => ({ ...x, units: on ? x.units.filter(v => v !== u) : [...x.units, u] }))}
                              style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontFamily: fm,
                                border: `1px solid ${on ? GR + '80' : border}`, background: on ? `${GR}18` : 'transparent', color: on ? GR : muted }}>
                              {on ? '✓ ' : ''}{u}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {canRename && edit.username.trim().toLowerCase() !== selected.username.toLowerCase() && (
              <div style={{ fontSize: 11, color: AM, marginTop: -10, marginBottom: 16, fontFamily: fm }}>
                The person signs in with the new username (or their email) from now on. Their travel cards, open tasks and report schedules move to the new name.
              </div>
            )}

            <div style={{ fontSize: 9, fontWeight: 700, color: GR, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(16,185,129,0.2)`, fontFamily: fm }}>Edit Rights & Responsibilities</div>

            {/* Role selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Role</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ROLE_OPTIONS.map(r => {
                  const sel = edit.role === r.value;
                  return (
                    <button key={r.value} onClick={() => { setEdit(e => ({ ...e, role: r.value, assignedStation: '', assignedLines: {}, assignedStations: {}, stationLine: '' })); setSupervisorLines({}); }} style={{
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

            {/* Supplementary roles — additive on top of the primary Role above,
                e.g. a Supervisor who's also a Cost Estimations Engineer. */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Additional Roles <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional — on top of the role above)</span></label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {SUPPLEMENTARY_ROLE_OPTIONS.filter(r => r.value !== edit.role).map(r => {
                  const checked = !!edit.roles?.[r.value];
                  return (
                    <label key={r.value} style={{
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      padding: '9px 12px', borderRadius: 6,
                      background: checked ? `${r.color}12` : (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc'),
                      border: `1px solid ${checked ? r.color + '50' : border}`,
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setEdit(e => ({ ...e, roles: { ...e.roles, [r.value]: !checked } }))}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 700, color: checked ? r.color : text, fontFamily: fm }}>{r.label}</span>
                    </label>
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

            {/* Manager: lines (multi-select) */}
            {edit.role === 'manager' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Lines to Manage <span style={{ color: '#6366f1' }}>(select one or more)</span></label>
                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, background: inpBg }}>
                  {SEED_LINES.map(l => (
                    <label key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', cursor: 'pointer',
                      borderBottom: `1px solid ${border}`,
                      background: edit.assignedLines?.[l.id] ? (isDark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.05)') : 'transparent',
                    }}>
                      <input type="checkbox" checked={!!edit.assignedLines?.[l.id]}
                        onChange={() => setEdit(e => ({ ...e, assignedLines: { ...e.assignedLines, [l.id]: !e.assignedLines?.[l.id] } }))}
                        style={{ accentColor: '#6366f1', width: 13, height: 13 }} />
                      <span style={{ fontSize: 12, color: edit.assignedLines?.[l.id] ? text : muted }}>{l.label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: dim, marginTop: 5 }}>
                  {Object.values(edit.assignedLines || {}).filter(Boolean).length} line(s) selected
                </div>
              </div>
            )}

            {/* Supervisor: one or more lines, then stations within each */}
            {edit.role === 'supervisor' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Lines to Supervise <span style={{ color: AM }}>(select one or more)</span></label>
                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, background: inpBg, marginBottom: 10 }}>
                  {SEED_LINES.map(l => (
                    <label key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', cursor: 'pointer',
                      borderBottom: `1px solid ${border}`,
                      background: supervisorLines[l.id] ? (isDark ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.05)') : 'transparent',
                    }}>
                      <input type="checkbox" checked={!!supervisorLines[l.id]}
                        onChange={() => {
                          const nowChecked = !supervisorLines[l.id];
                          setSupervisorLines(sl => ({ ...sl, [l.id]: nowChecked }));
                          if (!nowChecked) {
                            // Line deselected — drop any stations picked from it.
                            setEdit(ed => {
                              const next = { ...ed.assignedStations };
                              (stationsByLine[l.id] || []).forEach(s => { delete next[s.code]; });
                              return { ...ed, assignedStations: next };
                            });
                          }
                        }}
                        style={{ accentColor: AM, width: 13, height: 13 }} />
                      <span style={{ fontSize: 12, color: supervisorLines[l.id] ? text : muted }}>{l.label}</span>
                    </label>
                  ))}
                </div>

                <label style={lbl}>Assigned Stations <span style={{ color: AM }}>(select one or more)</span></label>
                {!Object.values(supervisorLines).some(Boolean) && (
                  <div style={{ fontSize: 11, color: dim, fontFamily: fm, padding: '6px 2px' }}>Select at least one line above to see its stations.</div>
                )}
                <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, maxHeight: 240, overflowY: 'auto', background: inpBg }}>
                  {SEED_LINES.filter(l => supervisorLines[l.id]).map(line => {
                    const stns = stationsByLine[line.id] || [];
                    if (!stns.length) return null;
                    const anyChecked = stns.some(s => edit.assignedStations[s.code]);
                    const allChecked = stns.every(s => edit.assignedStations[s.code]);
                    return (
                      <div key={line.id}>
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: anyChecked ? AM : dim, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: `1px solid ${border}`, background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', fontFamily: fm, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <span>{line.label} ({stns.length})</span>
                          <button
                            type="button"
                            onClick={() => setEdit(ed => {
                              const next = { ...ed.assignedStations };
                              stns.forEach(s => { next[s.code] = !allChecked; });
                              return { ...ed, assignedStations: next };
                            })}
                            style={{ background: 'none', border: `1px solid ${AM}55`, color: AM, borderRadius: 4, padding: '2px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontFamily: fm }}
                          >
                            {allChecked ? 'Clear whole line' : 'Select whole line'}
                          </button>
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

            {/* User: line → one or more stations */}
            {edit.role === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Line</label>
                  <select style={inp} value={edit.stationLine} onChange={e => setEdit(e2 => ({ ...e2, stationLine: e.target.value, assignedStations: {} }))}>
                    <option value="">Select line…</option>
                    {USER_LINE_OPTIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                {edit.stationLine && (
                  <div>
                    <label style={lbl}>Assigned Station(s) <span style={{ color: GR }}>(select one or more — prefilled & locked on login)</span></label>
                    <div style={{ border: `1px solid ${inpBor}`, borderRadius: 6, maxHeight: 240, overflowY: 'auto', background: inpBg }}>
                      {userLineStations.map(s => (
                        <label key={s.code} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 14px', cursor: 'pointer',
                          borderBottom: `1px solid ${border}`,
                          background: edit.assignedStations[s.code]
                            ? (isDark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.05)')
                            : 'transparent',
                        }}>
                          <input type="checkbox" checked={!!edit.assignedStations[s.code]} onChange={() => toggleStation(s.code)} style={{ accentColor: GR, width: 13, height: 13 }} />
                          <span style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: GR, flexShrink: 0, minWidth: 52 }}>{s.code}</span>
                          <span style={{ fontSize: 11, color: edit.assignedStations[s.code] ? text : muted }}>{s.name}</span>
                        </label>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: dim, marginTop: 5, fontFamily: fm }}>
                      {Object.values(edit.assignedStations).filter(Boolean).length} station(s) selected
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bus Tracker module access — independent of role/station assignment */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>System Access</label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${inpBor}`, background: inpBg,
              }}>
                <input
                  type="checkbox"
                  checked={edit.canAccessTracker}
                  onChange={() => setEdit(e => ({ ...e, canAccessTracker: !e.canAccessTracker }))}
                  style={{ accentColor: GR, width: 14, height: 14 }}
                />
                <span style={{ fontSize: 12, color: text }}>Bus Tracker access</span>
                <span style={{ fontSize: 10, color: dim, marginLeft: 'auto' }}>
                  {edit.canAccessTracker ? 'Can open the Bus Tracker module' : 'Bus Tracker hidden — Travel Card only'}
                </span>
              </label>
            </div>

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
