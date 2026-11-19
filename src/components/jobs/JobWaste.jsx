import { useEffect, useMemo, useState } from 'react';
import { useJobData } from '../../hooks/useJobData';
import { cleanWaste, defaultWasteUnit, groupBySpec, partLabel, WASTE_UNITS } from '../../data/jobOrders';

// Waste on a running Machine Shop task: one line per material specification
// this machine cuts (from the job order), where the operator records the waste
// it left and in which unit. Sections start in mm (offcut length), sheets in
// kg; "Other unit…" lets them type any unit, remembered on this device. Saved
// on the task (task.waste) as each field is left, and carried to the card's
// "Waste generated" when the task is closed.

const UNITS_KEY = 'kmc_waste_units';
const loadUnits = () => { try { const v = JSON.parse(localStorage.getItem(UNITS_KEY) || '[]'); return Array.isArray(v) ? v.filter(u => typeof u === 'string') : []; } catch { return []; } };
const rememberUnit = u => { try { const all = [...new Set([...loadUnits(), u])].slice(-12); localStorage.setItem(UNITS_KEY, JSON.stringify(all)); } catch { /* blocked */ } };

const cell = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };

// Specifications this run cuts: the job order's parts that are this task's activities.
export function wasteRowsFor(task, job) {
  const saved = cleanWaste(task.waste);
  const bySpec = new Map(saved.map(w => [w.spec, w]));
  const names = new Set((task.activities || []).map(a => a.name));
  const done = new Set((task.activities || []).filter(a => a.doneAt).map(a => a.name));
  const groups = job ? groupBySpec((job.items || []).filter(it => it.cut && names.has(partLabel(it)))) : [];
  const rows = groups.map(g => {
    const w = bySpec.get(g.spec);
    return {
      spec: g.spec, material: g.material, amount: w ? w.amount : '', unit: (w && w.unit) || defaultWasteUnit(g.material),
      parts: g.items.length, cut: g.items.filter(it => done.has(partLabel(it))).length, fromJob: true,
    };
  });
  const known = new Set(rows.map(r => r.spec));
  return [...rows, ...saved.filter(w => !known.has(w.spec)).map(w => ({ ...w, unit: w.unit || defaultWasteUnit(w.material) }))];
}

function UnitPick({ value, disabled, onChange }) {
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');
  const options = [...new Set([...WASTE_UNITS, ...loadUnits(), value].filter(Boolean))];
  if (custom) {
    const done = () => { const u = text.trim(); setCustom(false); if (u) { rememberUnit(u); onChange(u); } };
    return <input autoFocus aria-label="Custom unit" style={{ ...cell, width: 110 }} placeholder="e.g. litres" value={text}
      onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setCustom(false); }} />;
  }
  return (
    <select aria-label="Unit" style={{ ...cell, width: 110 }} value={value} disabled={disabled}
      onChange={e => (e.target.value === '__custom' ? (setText(''), setCustom(true)) : onChange(e.target.value))}>
      {options.map(u => <option key={u} value={u}>{u}</option>)}
      <option value="__custom">Other unit…</option>
    </select>
  );
}

export default function JobWaste({ task, readOnly = false, onSave }) {
  const jobData = useJobData();
  const job = jobData.jobOrders.find(j => j.id === task.jobOrderId) || null;
  const initial = useMemo(() => wasteRowsFor(task, job), [task, job]);
  const [rows, setRows] = useState(initial);
  const [extra, setExtra] = useState('');
  // Follow the task (another device, the job data arriving) unless editing here.
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setRows(initial); }, [initial, editing]);

  const commit = next => { setRows(next); onSave?.(cleanWaste(next)); };
  const set = (i, patch, save) => { const next = rows.map((r, k) => (k === i ? { ...r, ...patch } : r)); if (save) commit(next); else setRows(next); };
  const add = () => {
    const s = extra.trim();
    if (!s || rows.some(r => r.spec === s)) { setExtra(''); return; }
    commit([...rows, { spec: s, material: '', amount: '', unit: defaultWasteUnit(s) }]); setExtra('');
  };
  const recorded = rows.filter(r => r.amount !== '').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Waste</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{recorded}/{rows.length} recorded</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        For each material cut, enter the waste it left. Sections are in length, sheets in kg; change the unit or choose "Other unit…" to type your own.
      </div>
      {jobData.loading && !rows.length && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading the job order…</div>}
      {!jobData.loading && !rows.length && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No materials found for this run. Add one below.</div>}
      {rows.map((r, i) => (
        <div key={r.spec} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{r.spec}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.material || 'material not set'}{r.fromJob ? ` · ${r.cut}/${r.parts} parts cut` : ''}</div>
          </div>
          {readOnly
            ? <strong style={{ fontSize: 13 }}>{r.amount === '' ? '-' : `${r.amount} ${r.unit}`}</strong>
            : <>
                <input aria-label={`Waste for ${r.spec}`} type="number" min="0" step="any" inputMode="decimal" style={{ ...cell, width: 100 }} placeholder="0"
                  value={r.amount} onFocus={() => setEditing(true)}
                  onChange={e => set(i, { amount: e.target.value === '' ? '' : Number(e.target.value) })}
                  onBlur={() => { setEditing(false); commit(rows); }} />
                <UnitPick value={r.unit} onChange={u => set(i, { unit: u }, true)} />
              </>}
        </div>
      ))}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input style={{ ...cell, flex: 1, minWidth: 0 }} value={extra} onChange={e => setExtra(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Another material (not listed)…" />
          <button className="kmc-btn" onClick={add}>+ Add</button>
        </div>
      )}
    </div>
  );
}
