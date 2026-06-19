import { useState, useMemo } from 'react';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';
import { TC_LINES, ACTS, RES, LINE_MODELS, STATION_MODELS } from './TravelCard';

// ── Admin catalog editor ────────────────────────────────────────────────────
// Edits the shared catalog: bus projects, tracker lines & stations (with
// effective-date / project tagging and archiving), and travel-card activities
// & resources. Saving writes the FULL effective state back through saveCatalog
// so the merge over the built-in seed is deterministic, and the bus tracker +
// travel card both reflect the change.

const MODEL_OPTS = [
  { v: 'BOTH', label: 'KDC + EVS' },
  { v: 'KDC',  label: 'KDC only' },
  { v: 'EVS',  label: 'EVS only' },
];
const modelsToOpt = (m) => {
  const a = Array.isArray(m) ? m : ['KDC', 'EVS'];
  if (a.length >= 2) return 'BOTH';
  return a[0] || 'BOTH';
};
const optToModels = (v) => (v === 'BOTH' ? ['KDC', 'EVS'] : [v]);

const TABS = ['Projects', 'Lines', 'Stations', 'Activities', 'Resources'];

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Build the effective current state by merging catalog over the seeds.
function buildInitial(catalog) {
  // Tracker lines
  const lines = (Array.isArray(catalog.lines) && catalog.lines.length ? catalog.lines : SEED_LINES)
    .map(l => ({ ...l }));

  // Tracker stations (seed ← catalog overrides)
  const stations = {};
  for (const [code, s] of Object.entries(SEED_STATIONS)) stations[code] = { ...s };
  for (const [code, s] of Object.entries(catalog.stations || {})) stations[code] = { ...(stations[code] || {}), ...s };

  // Travel-card maps
  const tcLines = { ...TC_LINES, ...(catalog.tcLines || {}) };
  const acts = { ...ACTS, ...(catalog.acts || {}) };
  const res = { ...RES };
  for (const [ln, obj] of Object.entries(catalog.res || {})) res[ln] = { ...(res[ln] || {}), ...obj };

  return {
    projects: (catalog.projects || []).map(p => ({ ...p })),
    lines,
    stations,
    tcLines,
    acts,
    res,
    lineModels: { ...LINE_MODELS, ...(catalog.lineModels || {}) },
    stationModels: { ...STATION_MODELS, ...(catalog.stationModels || {}) },
  };
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
  zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '24px 12px', overflowY: 'auto',
};
const panel = {
  width: '100%', maxWidth: 920, background: 'var(--bg-surface)', color: 'var(--text-primary)',
  border: '1px solid var(--border-medium)', borderRadius: 12, fontFamily: "'Inter', system-ui, sans-serif",
  boxShadow: '0 40px 90px rgba(0,0,0,0.6)',
};
const inp = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 5,
  color: 'var(--text-primary)', fontSize: 12, padding: '6px 8px', outline: 'none',
  fontFamily: "'Inter', system-ui, sans-serif", width: '100%', boxSizing: 'border-box',
};
const btn = {
  background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6,
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, padding: '6px 12px',
  cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em',
};
const btnAccent = { ...btn, border: '1px solid var(--accent-border)', color: 'var(--accent-text)', background: 'var(--accent-alpha)' };
const th = { fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', padding: '6px 6px', fontWeight: 700 };
const td = { padding: '4px 6px', verticalAlign: 'top' };
const sectionHd = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '4px 0 10px', fontWeight: 700 };

export default function CatalogAdmin({ catalog, saveCatalog, saving, onClose }) {
  const [tab, setTab] = useState('Projects');
  const [draft, setDraft] = useState(() => buildInitial(catalog));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');

  const touch = (updater) => { setDraft(prev => { const next = updater(structuredCloneSafe(prev)); return next; }); setDirty(true); };

  const lineOptions = useMemo(
    () => draft.lines.map(l => ({ id: l.id, label: l.label })),
    [draft.lines]
  );

  async function handleSave() {
    setStatus('Saving…');
    const payload = {
      projects: draft.projects,
      lines: draft.lines,
      stations: draft.stations,
      tcLines: draft.tcLines,
      acts: draft.acts,
      res: draft.res,
      lineModels: draft.lineModels,
      stationModels: draft.stationModels,
    };
    const r = await saveCatalog(payload);
    if (r?.ok) { setStatus('✅ Saved — visible to everyone.'); setDirty(false); }
    else setStatus('⚠️ Could not reach the server. Try again.');
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 14 }}>Catalog Admin</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Edits apply to all users</div>
          <div style={{ flex: 1 }} />
          {status && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{status}</span>}
          <button style={btnAccent} disabled={saving || !dirty} onClick={handleSave}>{saving ? 'Saving…' : 'Save all'}</button>
          <button style={btn} onClick={onClose}>Close</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 18px 0', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...btn, ...(tab === t ? btnAccent : {}) }}>{t}</button>
          ))}
        </div>

        <div style={{ padding: 18, maxHeight: '70vh', overflowY: 'auto' }}>
          {tab === 'Projects'   && <ProjectsTab draft={draft} touch={touch} />}
          {tab === 'Lines'      && <LinesTab draft={draft} touch={touch} />}
          {tab === 'Stations'   && <StationsTab draft={draft} touch={touch} lineOptions={lineOptions} />}
          {tab === 'Activities' && <ActivitiesTab draft={draft} touch={touch} />}
          {tab === 'Resources'  && <ResourcesTab draft={draft} touch={touch} lineOptions={lineOptions} />}
        </div>
      </div>
    </div>
  );
}

// structuredClone may be unavailable in very old runtimes; fall back to JSON.
function structuredCloneSafe(o) {
  try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); }
}

// ── Projects ────────────────────────────────────────────────────────────────
function ProjectsTab({ draft, touch }) {
  const add = () => touch(d => { d.projects.push({ id: uid('p'), name: '', model: 'BOTH', active: true, startDate: '', endDate: '' }); return d; });
  const upd = (i, k, v) => touch(d => { d.projects[i][k] = v; return d; });
  return (
    <div>
      <div style={sectionHd}>Bus projects — archive (uncheck Active) keeps history filterable</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={th}>Name</th><th style={th}>Model</th><th style={th}>Start</th><th style={th}>End</th><th style={th}>Active</th>
        </tr></thead>
        <tbody>
          {draft.projects.map((p, i) => (
            <tr key={p.id || i}>
              <td style={td}><input style={inp} value={p.name} onChange={e => upd(i, 'name', e.target.value)} placeholder="Project name" /></td>
              <td style={{ ...td, width: 110 }}>
                <select style={inp} value={p.model || 'BOTH'} onChange={e => upd(i, 'model', e.target.value)}>
                  {MODEL_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </td>
              <td style={{ ...td, width: 130 }}><input style={inp} type="date" value={p.startDate || ''} onChange={e => upd(i, 'startDate', e.target.value)} /></td>
              <td style={{ ...td, width: 130 }}><input style={inp} type="date" value={p.endDate || ''} onChange={e => upd(i, 'endDate', e.target.value)} /></td>
              <td style={{ ...td, width: 50, textAlign: 'center' }}><input type="checkbox" checked={p.active !== false} onChange={e => upd(i, 'active', e.target.checked)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ ...btn, marginTop: 10 }} onClick={add}>+ Add project</button>
    </div>
  );
}

// ── Tracker lines ───────────────────────────────────────────────────────────
function LinesTab({ draft, touch }) {
  const add = () => touch(d => { d.lines.push({ id: uid('L').toUpperCase(), label: '', models: ['KDC', 'EVS'], active: true }); return d; });
  const upd = (i, k, v) => touch(d => { d.lines[i][k] = v; return d; });
  return (
    <div>
      <div style={sectionHd}>Production lines (bus tracker) — id is permanent, used to group stations</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={th}>ID</th><th style={th}>Label</th><th style={th}>Models</th><th style={th}>Active</th>
        </tr></thead>
        <tbody>
          {draft.lines.map((l, i) => (
            <tr key={l.id || i}>
              <td style={{ ...td, width: 140 }}><input style={{ ...inp, fontFamily: 'monospace' }} value={l.id} onChange={e => upd(i, 'id', e.target.value.toUpperCase())} /></td>
              <td style={td}><input style={inp} value={l.label} onChange={e => upd(i, 'label', e.target.value)} placeholder="Display name" /></td>
              <td style={{ ...td, width: 120 }}>
                <select style={inp} value={modelsToOpt(l.models)} onChange={e => upd(i, 'models', optToModels(e.target.value))}>
                  {MODEL_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </td>
              <td style={{ ...td, width: 50, textAlign: 'center' }}><input type="checkbox" checked={l.active !== false} onChange={e => upd(i, 'active', e.target.checked)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ ...btn, marginTop: 10 }} onClick={add}>+ Add line</button>
    </div>
  );
}

// ── Tracker stations ────────────────────────────────────────────────────────
function StationsTab({ draft, touch, lineOptions }) {
  const [lineFilter, setLineFilter] = useState('ALL');
  const [newCode, setNewCode] = useState('');

  const codes = Object.keys(draft.stations)
    .filter(c => lineFilter === 'ALL' || draft.stations[c].line === lineFilter)
    .sort((a, b) => (draft.stations[a].order || 0) - (draft.stations[b].order || 0));

  const upd = (code, k, v) => touch(d => { d.stations[code][k] = v; return d; });
  const toggleProj = (code, pid) => touch(d => {
    const cur = Array.isArray(d.stations[code].projects) ? d.stations[code].projects : [];
    d.stations[code].projects = cur.includes(pid) ? cur.filter(x => x !== pid) : [...cur, pid];
    return d;
  });
  const addStation = () => {
    const code = newCode.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) return;
    touch(d => {
      if (!d.stations[code]) {
        d.stations[code] = {
          name: '', line: lineFilter !== 'ALL' ? lineFilter : (lineOptions[0]?.id || ''),
          order: Object.keys(d.stations).length + 1, models: ['KDC', 'EVS'],
          active: true, effectiveFrom: '', effectiveTo: '', projects: [],
        };
      }
      return d;
    });
    setNewCode('');
  };

  return (
    <div>
      <div style={sectionHd}>Stations (bus tracker) — archive keeps legacy data; tag projects / set effective dates for historical lines</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Line:</span>
        <select style={{ ...inp, width: 200 }} value={lineFilter} onChange={e => setLineFilter(e.target.value)}>
          <option value="ALL">All lines</option>
          {lineOptions.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <input style={{ ...inp, width: 150, fontFamily: 'monospace' }} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="New code e.g. P09-01" />
        <button style={btn} onClick={addStation}>+ Add station</button>
      </div>

      {codes.map(code => {
        const s = draft.stations[code];
        const archived = s.active === false;
        return (
          <div key={code} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12, marginBottom: 10, opacity: archived ? 0.7 : 1 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--accent-text)' }}>{code}</span>
              {archived && <span style={{ fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 6px' }}>ARCHIVED</span>}
              <div style={{ flex: 1 }} />
              <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 5, alignItems: 'center' }}>
                <input type="checkbox" checked={!archived} onChange={e => upd(code, 'active', e.target.checked)} /> Active
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 9, color: 'var(--text-dim)' }}>Name
                <input style={inp} value={s.name || ''} onChange={e => upd(code, 'name', e.target.value)} />
              </label>
              <label style={{ fontSize: 9, color: 'var(--text-dim)' }}>Line
                <select style={inp} value={s.line || ''} onChange={e => upd(code, 'line', e.target.value)}>
                  {lineOptions.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 120px 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 9, color: 'var(--text-dim)' }}>Order
                <input style={inp} type="number" value={s.order ?? ''} onChange={e => upd(code, 'order', Number(e.target.value) || 0)} />
              </label>
              <label style={{ fontSize: 9, color: 'var(--text-dim)' }}>Models
                <select style={inp} value={modelsToOpt(s.models)} onChange={e => upd(code, 'models', optToModels(e.target.value))}>
                  {MODEL_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 9, color: 'var(--text-dim)' }}>Effective from
                <input style={inp} type="date" value={s.effectiveFrom || ''} onChange={e => upd(code, 'effectiveFrom', e.target.value)} />
              </label>
              <label style={{ fontSize: 9, color: 'var(--text-dim)' }}>Effective to
                <input style={inp} type="date" value={s.effectiveTo || ''} onChange={e => upd(code, 'effectiveTo', e.target.value)} />
              </label>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>Belongs to projects (for legacy retrieval)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {draft.projects.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>No projects defined yet.</span>}
              {draft.projects.map(p => {
                const on = (s.projects || []).includes(p.id) || (s.projects || []).includes(p.name);
                return (
                  <button key={p.id} onClick={() => toggleProj(code, p.id)}
                    style={{ ...btn, ...(on ? btnAccent : {}), fontSize: 10, padding: '3px 9px' }}>
                    {p.name || '(unnamed)'}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Travel-card activities ──────────────────────────────────────────────────
function ActivitiesTab({ draft, touch }) {
  const codes = Object.keys(draft.acts).sort();
  const [code, setCode] = useState(codes[0] || '');
  const [newCode, setNewCode] = useState('');
  const list = draft.acts[code] || [];

  const setList = (next) => touch(d => { d.acts[code] = next; return d; });
  const addCode = () => {
    const c = newCode.trim().toUpperCase().replace(/\s+/g, '-');
    if (!c) return;
    touch(d => { if (!d.acts[c]) d.acts[c] = []; return d; });
    setCode(c); setNewCode('');
  };

  return (
    <div>
      <div style={sectionHd}>Activities per station (travel card). Editing replaces the list for that code.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select style={{ ...inp, width: 200 }} value={code} onChange={e => setCode(e.target.value)}>
          {codes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <input style={{ ...inp, width: 150, fontFamily: 'monospace' }} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="New code" />
        <button style={btn} onClick={addCode}>+ Add code</button>
      </div>
      {code && <ListEditor items={list} onChange={setList} placeholder="Activity description" />}
    </div>
  );
}

// ── Travel-card resources ───────────────────────────────────────────────────
function ResourcesTab({ draft, touch, lineOptions }) {
  const lineLabels = Object.keys(draft.res);
  const [line, setLine] = useState(lineLabels[0] || '');
  const codes = line ? Object.keys(draft.res[line] || {}) : [];
  const [code, setCode] = useState(codes[0] || '');
  const [newLine, setNewLine] = useState('');
  const [newCode, setNewCode] = useState('');
  const list = (draft.res[line] && draft.res[line][code]) || [];

  const setList = (next) => touch(d => { if (!d.res[line]) d.res[line] = {}; d.res[line][code] = next; return d; });
  const addLine = () => { const l = newLine.trim(); if (!l) return; touch(d => { if (!d.res[l]) d.res[l] = {}; return d; }); setLine(l); setNewLine(''); };
  const addCode = () => { const c = newCode.trim().toUpperCase().replace(/\s+/g, '-'); if (!c || !line) return; touch(d => { if (!d.res[line]) d.res[line] = {}; if (!d.res[line][c]) d.res[line][c] = []; return d; }); setCode(c); setNewCode(''); };

  return (
    <div>
      <div style={sectionHd}>Consumables / materials per station (travel card). Grouped by travel-card line label.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...inp, width: 220 }} value={line} onChange={e => { setLine(e.target.value); setCode(''); }}>
          <option value="">Select line…</option>
          {lineLabels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input style={{ ...inp, width: 170 }} value={newLine} onChange={e => setNewLine(e.target.value)} placeholder="New line label" />
        <button style={btn} onClick={addLine}>+ Line</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...inp, width: 220 }} value={code} onChange={e => setCode(e.target.value)}>
          <option value="">Select code…</option>
          {codes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input style={{ ...inp, width: 170, fontFamily: 'monospace' }} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="New code" />
        <button style={btn} onClick={addCode}>+ Code</button>
      </div>
      {line && code && <ListEditor items={list} onChange={setList} placeholder="Resource / material name" />}
    </div>
  );
}

// Generic ordered-list editor (strings).
function ListEditor({ items, onChange, placeholder }) {
  const [val, setVal] = useState('');
  const add = () => { if (!val.trim()) return; onChange([...items, val.trim()]); setVal(''); };
  const del = (i) => onChange(items.filter((_, x) => x !== i));
  const edit = (i, v) => onChange(items.map((it, x) => x === i ? v : it));
  return (
    <div>
      {items.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>No items yet.</div>}
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input style={inp} value={it} onChange={e => edit(i, e.target.value)} />
          <button style={btn} onClick={() => del(i)}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input style={inp} value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button style={btn} onClick={add}>+ Add</button>
      </div>
    </div>
  );
}
