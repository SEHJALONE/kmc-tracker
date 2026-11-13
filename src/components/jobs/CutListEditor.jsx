import { useState } from 'react';
import { groupBySpec, makeItem } from '../../data/jobOrders';

// The cut list, grouped by material specification (as on the drawings' cut
// lists), with a table of parts under each specification. Every field can be
// edited, parts and whole specifications removed or added. With `showCut`,
// each part has a "cut" tick (job orders: which parts to cut this time).

const cell = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '5px 6px', fontSize: 12, borderRadius: 6,
  border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontFamily: 'inherit',
};
const th = { fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', padding: '6px 4px', whiteSpace: 'nowrap' };
const td = { padding: '3px 4px', verticalAlign: 'top' };

const COLS = [
  ['balloon', 'Balloon', 64], ['code', 'Supplier code', 140], ['name', 'Name', 150], ['qty', 'Qty', 56],
  ['length', 'Length (mm)', 80], ['mitre', 'Mitre angle', 96], ['remarks', 'Remarks', 200],
];

export default function CutListEditor({ items, onChange, materials, showCut = false, readOnly = false, machineFor = null }) {
  const [newSpec, setNewSpec] = useState('');
  const groups = groupBySpec(items);
  const set = (id, patch) => onChange(items.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const setGroup = (spec, patch) => onChange(items.map(it => (it.spec === spec ? { ...it, ...patch } : it)));
  const remove = id => onChange(items.filter(it => it.id !== id));
  const removeGroup = spec => { if (window.confirm(`Remove every part under ${spec || 'this specification'}?`)) onChange(items.filter(it => it.spec !== spec)); };
  const addPart = g => {
    const last = g.items[g.items.length - 1] || {};
    // Insert after the group's last part so it stays in its group.
    const at = items.indexOf(last) + 1;
    const next = [...items];
    next.splice(at || items.length, 0, makeItem({ spec: g.spec, material: g.material, groupNote: g.groupNote, qty: 1 }));
    onChange(next);
  };
  const addGroup = () => {
    const spec = newSpec.trim();
    if (!spec) return;
    if (items.some(it => it.spec === spec)) { alert(`${spec} is already in the list.`); return; }
    onChange([...items, makeItem({ spec, qty: 1 })]);
    setNewSpec('');
  };
  const materialNames = (materials || []).map(m => m.name);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {groups.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No parts yet.</div>}
      {groups.map(g => {
        const cutCount = g.items.filter(it => it.cut).length;
        return (
          <div key={g.spec || '-'} className="kmc-panel" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              {readOnly
                ? <strong style={{ fontSize: 16, fontFamily: 'monospace', color: 'var(--text-heading)' }}>{g.spec}</strong>
                : <input aria-label="Specification" style={{ ...cell, width: 150, fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }} defaultValue={g.spec}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.spec) setGroup(g.spec, { spec: v }); }} />}
              {readOnly
                ? <span className="kmc-chip"><span>{g.material || 'no material'}</span></span>
                : (
                  <select aria-label="Material type" style={{ ...cell, width: 150 }} value={g.material} onChange={e => setGroup(g.spec, { material: e.target.value })}>
                    <option value="">Material type…</option>
                    {[...new Set([...materialNames, g.material].filter(Boolean))].map(m => <option key={m}>{m}</option>)}
                  </select>
                )}
              {machineFor && <span style={{ marginLeft: 4 }}>{machineFor(g)}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {g.items.length} part{g.items.length === 1 ? '' : 's'}{showCut ? ` · ${cutCount} to cut` : ''} · {g.items.reduce((n, it) => n + (Number(it.qty) || 0), 0)} pcs
              </span>
              {showCut && !readOnly && (
                <button className="kmc-btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setGroup(g.spec, { cut: cutCount < g.items.length })}>
                  {cutCount < g.items.length ? 'Cut all' : 'Cut none'}
                </button>
              )}
              {!readOnly && <button className="kmc-btn ghost" style={{ padding: '3px 8px', fontSize: 11, color: 'var(--accent-text)' }} onClick={() => removeGroup(g.spec)}>Remove spec</button>}
            </div>
            {(g.groupNote || !readOnly) && (readOnly
              ? <div style={{ fontSize: 12, color: 'var(--warning-color)', marginBottom: 8 }}>⚠ {g.groupNote}</div>
              : <input aria-label="Specification note" style={{ ...cell, marginBottom: 8 }} placeholder="Note for this specification (optional)" defaultValue={g.groupNote}
                  onBlur={e => { if (e.target.value.trim() !== g.groupNote) setGroup(g.spec, { groupNote: e.target.value.trim() }); }} />)}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead><tr>
                  {showCut && <th style={th}>Cut</th>}
                  {COLS.map(([k, label, w]) => <th key={k} style={{ ...th, width: w }}>{label}</th>)}
                  {!readOnly && <th style={th} />}
                </tr></thead>
                <tbody>
                  {g.items.map(it => (
                    <tr key={it.id} style={{ borderTop: '1px solid var(--border-subtle)', opacity: showCut && !it.cut ? 0.45 : 1 }}>
                      {showCut && (
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input type="checkbox" aria-label={`Cut part ${it.balloon}`} checked={it.cut} disabled={readOnly}
                            onChange={e => set(it.id, { cut: e.target.checked })} style={{ width: 16, height: 16, accentColor: '#10b981' }} />
                        </td>
                      )}
                      {COLS.map(([k]) => (
                        <td key={k} style={td}>
                          {readOnly
                            ? <span style={{ fontSize: 12, fontFamily: k === 'code' || k === 'balloon' ? 'monospace' : 'inherit' }}>{it[k] === '' || it[k] == null ? '—' : String(it[k])}</span>
                            : <input aria-label={k} style={cell} type={k === 'qty' ? 'number' : 'text'} min={k === 'qty' ? 0 : undefined}
                                value={it[k]} onChange={e => set(it.id, { [k]: k === 'qty' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} />}
                        </td>
                      ))}
                      {!readOnly && (
                        <td style={td}><button className="kmc-btn ghost" aria-label="Remove part" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => remove(it.id)}>✕</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!readOnly && <button className="kmc-btn ghost" style={{ marginTop: 8, padding: '4px 10px', fontSize: 12 }} onClick={() => addPart(g)}>+ Add part to {g.spec || 'this spec'}</button>}
          </div>
        );
      })}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
          <input style={cell} placeholder="New specification, e.g. □40x40x2.0" value={newSpec} onChange={e => setNewSpec(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGroup()} />
          <button className="kmc-btn" onClick={addGroup}>+ Add specification</button>
        </div>
      )}
    </div>
  );
}
