import { useState } from 'react';

// Catalog Admin → Departments (system admin only). Departments and the
// lines/divisions under each, as offered on the Request Access form and in
// User Management. Removing one here does not change existing accounts: their
// saved department stays on them until an admin edits the account.
const inp = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 5,
  color: 'var(--text-primary)', fontSize: 12, padding: '6px 8px', outline: 'none',
  fontFamily: "'Inter', system-ui, sans-serif", width: '100%', boxSizing: 'border-box',
};
const btn = {
  background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6,
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, padding: '6px 10px',
  cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif", whiteSpace: 'nowrap',
};
const danger = { ...btn, color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' };
const note = { fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 };

export default function DepartmentsTab({ draft, touch }) {
  const [newDept, setNewDept] = useState('');
  const [newUnit, setNewUnit] = useState({});
  const list = draft.departments;
  const taken = (name, skip = -1) => list.some((d, i) => i !== skip && d.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addDept = () => {
    const name = newDept.trim();
    if (!name) return;
    if (taken(name)) { alert(`"${name}" is already in the list.`); return; }
    touch(d => { d.departments.push({ name, units: [] }); return d; });
    setNewDept('');
  };
  const addUnit = i => {
    const u = String(newUnit[i] || '').trim();
    if (!u) return;
    if (list[i].units.some(x => x.toLowerCase() === u.toLowerCase())) { alert(`"${u}" is already under ${list[i].name}.`); return; }
    touch(d => { d.departments[i].units.push(u); return d; });
    setNewUnit(s => ({ ...s, [i]: '' }));
  };
  const move = (i, by) => touch(d => {
    const j = i + by;
    if (j < 0 || j >= d.departments.length) return d;
    [d.departments[i], d.departments[j]] = [d.departments[j], d.departments[i]];
    return d;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={note}>
        The departments people can choose when they request access, and that admins can give an account in User Management.
        Lines/divisions are the choices shown under each one. Removing a department does not change accounts that already have it.
        Press <strong>Save all</strong> to apply.
      </div>

      {list.map((dep, i) => (
        <div key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <input
              style={{ ...inp, fontWeight: 700, fontSize: 13 }}
              value={dep.name}
              aria-label="Department name"
              onChange={e => { const v = e.target.value; touch(d => { d.departments[i].name = v; return d; }); }}
              onBlur={e => { if (!e.target.value.trim()) alert('A department needs a name — remove it instead.'); else if (taken(e.target.value, i)) alert('Two departments have the same name.'); }}
            />
            <button style={btn} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button style={btn} onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move down">↓</button>
            <button style={danger} onClick={() => { if (window.confirm(`Remove the department "${dep.name}"?`)) touch(d => { d.departments.splice(i, 1); return d; }); }}>Remove</button>
          </div>

          <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Lines / divisions ({dep.units.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {dep.units.map((u, k) => (
              <div key={k} style={{ display: 'flex', gap: 6 }}>
                <input style={inp} value={u} aria-label="Line or division name"
                  onChange={e => { const v = e.target.value; touch(d => { d.departments[i].units[k] = v; return d; }); }} />
                <button style={danger} onClick={() => touch(d => { d.departments[i].units.splice(k, 1); return d; })} title="Remove">✕</button>
              </div>
            ))}
            {!dep.units.length && <div style={note}>None — people in this department won't be asked to pick one.</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input style={inp} placeholder="Add a line or division…" value={newUnit[i] || ''}
                onChange={e => setNewUnit(s => ({ ...s, [i]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addUnit(i); }} />
              <button style={btn} onClick={() => addUnit(i)}>+ Add</button>
            </div>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6 }}>
        <input style={inp} placeholder="New department name…" value={newDept} onChange={e => setNewDept(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addDept(); }} />
        <button style={{ ...btn, color: 'var(--accent-text)', borderColor: 'var(--accent-border)' }} onClick={addDept}>+ Add department</button>
      </div>
    </div>
  );
}
