import { useRef, useState } from 'react';
import { makeActivity, parseActivitiesCsv, ACTIVITY_TEMPLATE_ROWS, ACTIVITY_COLUMNS, downloadCsv } from '../../data/jobOrders';

// The steps of a Paint Shop / Parts Making job order: name, quantity, unit,
// notes. Rows can be added, removed, moved, or read from a CSV.

const cell = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '6px 8px', fontSize: 13, borderRadius: 8,
  border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontFamily: 'inherit',
};
const th = { fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', padding: '6px 4px' };

export default function ActivityEditor({ activities, onChange, readOnly = false }) {
  const [msg, setMsg] = useState('');
  const file = useRef(null);
  const set = (id, patch) => onChange(activities.map(a => (a.id === id ? { ...a, ...patch } : a)));
  const move = (i, d) => { const n = [...activities]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n); };

  function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (file.current) file.current.value = '';
      const { activities: parsed, errors } = parseActivitiesCsv(String(r.result || ''));
      if (!parsed.length) { setMsg(`Error: ${errors.join(' ')}`); return; }
      const named = activities.filter(a => a.name);
      const replace = !named.length || window.confirm(`Replace the ${named.length} activities here with the ${parsed.length} in ${f.name}?\n\nCancel adds them to the end instead.`);
      onChange(replace ? parsed : [...named, ...parsed]);
      setMsg(`${parsed.length} activities read from ${f.name}.`);
    };
    r.readAsText(f);
  }

  if (readOnly) return (
    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
      {activities.map(a => <li key={a.id}>{a.name}{Number(a.qty) > 0 ? ` · ×${a.qty}${a.unit ? ` ${a.unit}` : ''}` : ''}{a.notes ? <span style={{ color: 'var(--text-muted)' }}> - {a.notes}</span> : null}</li>)}
    </ol>
  );

  return (
    <div className="kmc-panel" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="kmc-label">Activities ({activities.filter(a => a.name).length})</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="kmc-btn ghost" style={{ fontSize: 12 }} onClick={() => downloadCsv('activities-template.csv', ACTIVITY_TEMPLATE_ROWS)}>Template</button>
        {activities.some(a => a.name) && (
          <button type="button" className="kmc-btn ghost" style={{ fontSize: 12 }}
            onClick={() => downloadCsv('activities.csv', [ACTIVITY_COLUMNS, ...activities.filter(a => a.name).map(a => [a.name, a.qty, a.unit, a.notes])])}>Download</button>
        )}
        <label className="kmc-btn" style={{ cursor: 'pointer', fontSize: 12 }}>Upload CSV<input ref={file} type="file" accept=".csv,text/csv" onChange={upload} style={{ display: 'none' }} /></label>
      </div>
      {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('Error:') ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{msg}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr>
            <th style={{ ...th, width: 28 }}>#</th><th style={th}>Activity</th><th style={{ ...th, width: 80 }}>Qty</th>
            <th style={{ ...th, width: 90 }}>Unit</th><th style={th}>Notes</th><th style={{ ...th, width: 100 }} />
          </tr></thead>
          <tbody>
            {activities.map((a, i) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', padding: 4 }}>{i + 1}</td>
                <td style={{ padding: 4 }}><input aria-label={`Activity ${i + 1}`} style={cell} value={a.name} onChange={e => set(a.id, { name: e.target.value })} placeholder="e.g. Surface preparation" /></td>
                <td style={{ padding: 4 }}><input aria-label={`Quantity ${i + 1}`} style={cell} type="number" min="0" value={a.qty} onChange={e => set(a.id, { qty: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                <td style={{ padding: 4 }}><input aria-label={`Unit ${i + 1}`} style={cell} value={a.unit} onChange={e => set(a.id, { unit: e.target.value })} placeholder="pcs, m²" /></td>
                <td style={{ padding: 4 }}><input aria-label={`Notes ${i + 1}`} style={cell} value={a.notes} onChange={e => set(a.id, { notes: e.target.value })} /></td>
                <td style={{ padding: 4, whiteSpace: 'nowrap' }}>
                  <button type="button" className="kmc-btn ghost" aria-label="Move up" style={{ padding: '3px 7px', fontSize: 12 }} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="kmc-btn ghost" aria-label="Move down" style={{ padding: '3px 7px', fontSize: 12 }} disabled={i === activities.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="kmc-btn ghost" aria-label="Remove activity" style={{ padding: '3px 7px', fontSize: 12 }} onClick={() => onChange(activities.filter(x => x.id !== a.id))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="kmc-btn ghost" style={{ marginTop: 8, fontSize: 12 }} onClick={() => onChange([...activities, makeActivity()])}>+ Add activity</button>
    </div>
  );
}
