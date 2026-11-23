import { useMemo, useState } from 'react';
import { JO_LINES, LINE_TINT } from '../../data/jobOrders';
import { cleanProjectProcess, projectProcessErrors, withProjectProcess, registerRow, makeProjectStation } from '../../data/projectProcess';
import { projectImageFromFile } from '../../utils/projectImage';
import { lineStations } from '../../utils/machines';
import { readLiveCatalog } from '../../hooks/useCatalog';
import { JOB_ERRORS } from '../../hooks/useJobData';

// Set up (or change) an other project in one place, like Catalog Admin does for
// a bus model: its ID and name, the lines that work on it in the order the work
// flows, the stations on each line in order, and a PNG for its card.
// Saving puts the ID in the job-order register (so job orders can be filed
// under it) and the process in the shared catalog.

const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const inp = { width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
const small = { fontSize: 12, padding: '3px 9px' };

const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function LineEditor({ catalog, value, index, count, onChange, onMove, onRemove }) {
  const known = useMemo(() => lineStations(catalog, value.line), [catalog, value.line]);
  const [pick, setPick] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const used = new Set(value.stations.map(s => s.code));
  const add = st => { if (st.code && !used.has(st.code)) onChange({ ...value, stations: [...value.stations, makeProjectStation(st)] }); };
  const setStation = (i, patch) => onChange({ ...value, stations: value.stations.map((s, k) => (k === i ? makeProjectStation({ ...s, ...patch }) : s)) });

  return (
    <div className="kmc-panel" style={{ padding: '12px 14px', borderLeft: `4px solid ${LINE_TINT[value.line]}`, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{index + 1}.</span>
        <strong style={{ fontSize: 14 }}>{value.line}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{value.stations.length} station{value.stations.length === 1 ? '' : 's'}</span>
        <span style={{ flex: 1 }} />
        <button className="kmc-btn ghost" style={small} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${value.line} up`}>Up</button>
        <button className="kmc-btn ghost" style={small} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${value.line} down`}>Down</button>
        <button className="kmc-btn ghost" style={small} onClick={onRemove}>Remove line</button>
      </div>
      {value.stations.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {value.stations.map((s, i) => (
            <li key={`${s.code}-${i}`} style={{ display: 'grid', gridTemplateColumns: '28px 130px 1fr auto', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
              <input style={inp} aria-label={`${value.line} station ${i + 1} code`} value={s.code} onChange={e => setStation(i, { code: e.target.value })} />
              <input style={inp} aria-label={`${value.line} station ${i + 1} name`} value={s.name} onChange={e => setStation(i, { name: e.target.value })} />
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="kmc-btn ghost" style={small} disabled={i === 0} onClick={() => onChange({ ...value, stations: move(value.stations, i, -1) })}>Up</button>
                <button className="kmc-btn ghost" style={small} disabled={i === value.stations.length - 1} onClick={() => onChange({ ...value, stations: move(value.stations, i, 1) })}>Down</button>
                <button className="kmc-btn ghost" style={small} onClick={() => onChange({ ...value, stations: value.stations.filter((_, k) => k !== i) })}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {known.length > 0 && (
          <div style={{ minWidth: 240, flex: '1 1 240px' }}>
            <label style={label} htmlFor={`pp-pick-${value.line}`}>Add a {value.line} station</label>
            <select id={`pp-pick-${value.line}`} style={inp} value={pick} onChange={e => {
              const st = known.find(k => k.code === e.target.value);
              if (st) add({ code: st.code, name: st.label });
              setPick('');
            }}>
              <option value="">Choose a station...</option>
              {known.filter(k => !used.has(k.code.toUpperCase())).map(k => <option key={k.code} value={k.code}>{k.code}: {k.label}</option>)}
            </select>
          </div>
        )}
        <div style={{ width: 120 }}>
          <label style={label} htmlFor={`pp-code-${value.line}`}>Or a new code</label>
          <input id={`pp-code-${value.line}`} style={inp} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. PS-02" />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={label} htmlFor={`pp-name-${value.line}`}>Station name</label>
          <input id={`pp-name-${value.line}`} style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Primer booth" />
        </div>
        <button className="kmc-btn" disabled={!code.trim() || used.has(code.trim().toUpperCase())} onClick={() => { add({ code, name }); setCode(''); setName(''); }}>Add station</button>
      </div>
    </div>
  );
}

export default function ProjectProcessEditor({ catalog, saveCatalog, jobData, existing, project, registerEntry, onDone }) {
  const isNew = !project;
  const [draft, setDraft] = useState(() => cleanProjectProcess(project || registerEntry || {}));
  // A register project without a process starts with its lines, empty.
  const [lines, setLines] = useState(() => (project ? cleanProjectProcess(project).lines
    : (registerEntry?.lines || []).filter(l => JO_LINES.includes(l)).map(l => ({ line: l, stations: [] }))));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const free = JO_LINES.filter(l => !lines.some(x => x.line === l));
  const proc = { ...draft, lines };
  const errors = projectProcessErrors(proc, existing, isNew && !registerEntry);
  const set = patch => setDraft(d => ({ ...d, ...patch }));

  async function pickImage(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMsg('');
    try { set({ image: await projectImageFromFile(f) }); }
    catch (err) { setMsg(`Error: ${err.message}`); }
  }

  async function save() {
    if (errors.length) { setMsg(`Error: ${errors.join(' ')}`); return; }
    setBusy(true); setMsg('Saving...');
    try {
      const clean = { ...cleanProjectProcess(proc), updatedBy: localStorage.getItem('kmc_username') || '', updatedAt: new Date().toISOString() };
      // 1. The register, which the server checks when a job order is filed.
      const r = await jobData.saveOtherProjects([registerRow(clean)]);
      if (r?.result?.invalid?.length) throw new Error(`The register refused ${r.result.invalid.join(', ')}.`);
      // 2. The catalog: the live copy with only this project changed, so bus
      //    data edited meanwhile in Catalog Admin is never overwritten.
      const live = await readLiveCatalog();
      if (!live) throw new Error('The live catalog could not be read, so nothing was changed there. Try again.');
      const res = await saveCatalog(withProjectProcess(live, clean.id, clean, catalog?.projectProcesses));
      if (!res?.ok) throw new Error(res?.error === 'unauthorized' ? 'The server refused this sign-in for the catalog (admins only). Sign in again as an admin.' : `The catalog was not saved${res?.error ? ` (${res.error})` : ''}.`);
      setMsg('Saved - visible to everyone.');
      onDone?.(clean);
    } catch (e) { setMsg(`Error: ${JOB_ERRORS[e.message] || e.message}`); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <button className="kmc-btn ghost" onClick={() => onDone?.(null)}>Back</button>
        <strong style={{ fontSize: 16 }}>{isNew ? (registerEntry ? `Set up ${registerEntry.id}` : 'New project') : `Edit ${project.id}`}</strong>
      </div>

      <div className="kmc-panel" style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <label style={label} htmlFor="pp-id">Project ID</label>
            <input id="pp-id" style={inp} value={draft.id} disabled={!isNew || !!registerEntry} onChange={e => set({ id: e.target.value.toUpperCase() })} placeholder="e.g. PRJ-001" />
          </div>
          <div><label style={label} htmlFor="pp-name">Name</label><input id="pp-name" style={inp} value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Steel water tank" /></div>
          <div><label style={label} htmlFor="pp-client">Client (optional)</label><input id="pp-client" style={inp} value={draft.client} onChange={e => set({ client: e.target.value })} /></div>
        </div>
        <div><label style={label} htmlFor="pp-desc">Description (optional)</label><input id="pp-desc" style={inp} value={draft.description} onChange={e => set({ description: e.target.value })} /></div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 180, height: 110, borderRadius: 12, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--input-bg)' }}>
            {draft.image ? <img src={draft.image} alt={`${draft.id || 'Project'} picture`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No picture</span>}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="kmc-btn" style={{ cursor: 'pointer' }}>{draft.image ? 'Change picture' : 'Upload PNG'}
              <input type="file" accept="image/png,.png" onChange={pickImage} style={{ display: 'none' }} aria-label="Project picture (PNG)" />
            </label>
            {draft.image && <button className="kmc-btn ghost" style={small} onClick={() => set({ image: '' })}>Remove picture</button>}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Shrunk to fit the card, so it stays small.</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="kmc-label">Lines, in the order the work goes through them</div>
        {lines.map((l, i) => (
          <LineEditor key={l.line} catalog={catalog} value={l} index={i} count={lines.length}
            onChange={v => setLines(ls => ls.map((x, k) => (k === i ? v : x)))}
            onMove={d => setLines(ls => move(ls, i, d))}
            onRemove={() => { if (!l.stations.length || window.confirm(`Remove ${l.line} and its ${l.stations.length} stations from this project?`)) setLines(ls => ls.filter((_, k) => k !== i)); }} />
        ))}
        {free.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {free.map(l => <button key={l} className="kmc-btn" onClick={() => setLines(ls => [...ls, { line: l, stations: [] }])}>+ {l}</button>)}
          </div>
        )}
      </div>

      {errors.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Still needed: {errors.join(' ')}</div>}
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('Error:') ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="kmc-btn primary" disabled={busy || errors.length > 0} onClick={save}>{busy ? 'Saving...' : 'Save project'}</button>
        <button className="kmc-btn ghost" onClick={() => onDone?.(null)}>Cancel</button>
      </div>
    </div>
  );
}
