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

const TABS = ['Projects', 'Vehicles', 'Lines', 'Stations', 'Activities', 'Resources', 'Work Instructions', 'Backups'];

const BUS_MODEL_OPTS = ['10.5m KDC', '12m KDC', '7m EVS', '8.5m EVS', '10.5m EVS', '12m EVS', '13m KEC'];

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

  // Fleet VINs per project
  const projectVins = {};
  for (const [name, list] of Object.entries(catalog.projectVins || {})) {
    projectVins[name] = Array.isArray(list) ? list.map(v => ({ ...v })) : [];
  }

  return {
    projects: (catalog.projects || []).map(p => ({ ...p })),
    lines,
    stations,
    tcLines,
    acts,
    res,
    lineModels: { ...LINE_MODELS, ...(catalog.lineModels || {}) },
    stationModels: { ...STATION_MODELS, ...(catalog.stationModels || {}) },
    dwi: catalog.dwi && typeof catalog.dwi === 'object' ? catalog.dwi : {},
    projectVins,
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

export default function CatalogAdmin({ catalog, saveCatalog, saving, listCatalogBackups, restoreCatalogBackup, onClose }) {
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
      dwi: draft.dwi,
      projectVins: draft.projectVins,
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
          {tab === 'Vehicles'   && <VehiclesTab draft={draft} touch={touch} />}
          {tab === 'Lines'      && <LinesTab draft={draft} touch={touch} />}
          {tab === 'Stations'   && <StationsTab draft={draft} touch={touch} lineOptions={lineOptions} />}
          {tab === 'Activities'         && <ActivitiesTab draft={draft} touch={touch} />}
          {tab === 'Resources'          && <ResourcesTab draft={draft} touch={touch} lineOptions={lineOptions} />}
          {tab === 'Work Instructions'  && <DWITab draft={draft} touch={touch} />}
          {tab === 'Backups'    && <BackupsTab listCatalogBackups={listCatalogBackups} restoreCatalogBackup={restoreCatalogBackup} />}
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

// ── Backups (server-side catalog snapshots) ─────────────────────────────────
// Every save (see APPS_SCRIPT_CATALOG.md's saveCatalog_) snapshots whatever
// was in the Catalog tab before overwriting it, so a bad save is always one
// restore away. This tab lists those snapshots and restores from a chosen one
// directly against the live sheet (bypassing the local draft entirely).
function BackupsTab({ listCatalogBackups, restoreCatalogBackup }) {
  const [backups, setBackups] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true); setStatus('');
    const r = await listCatalogBackups();
    setLoading(false);
    if (r.ok) setBackups(r.backups);
    else setStatus('⚠️ ' + (r.error || 'Could not load backups.'));
  };

  const restore = async (id) => {
    if (!confirm(`Restore the catalog to the snapshot from ${id}?\n\nThe current live catalog will be backed up first, so this can be undone.`)) return;
    setStatus('Restoring…');
    const r = await restoreCatalogBackup(id);
    if (r.ok) { setStatus(`✅ Restored ${id} (${r.rows} rows). Reopen Catalog Admin to see it reflected.`); load(); }
    else setStatus('⚠️ ' + (r.error || 'Restore failed.'));
  };

  return (
    <div>
      <div style={sectionHd}>Catalog backups — snapshotted automatically before every save</div>
      <button style={btn} onClick={load} disabled={loading}>{loading ? 'Loading…' : (backups === null ? 'Load backups' : 'Refresh')}</button>
      {status && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{status}</div>}
      {backups !== null && (
        backups.length === 0
          ? <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10 }}>No backups yet — one is created the next time anyone saves the catalog.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
              <thead><tr><th style={th}>Snapshot (UTC)</th><th style={th}></th></tr></thead>
              <tbody>
                {backups.map(id => (
                  <tr key={id}>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{id}</td>
                    <td style={{ ...td, width: 100 }}><button style={btn} onClick={() => restore(id)}>Restore</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
      )}
    </div>
  );
}

// ── Vehicles (project fleet: VIN + bus model) ───────────────────────────────
function VehiclesTab({ draft, touch }) {
  const [proj, setProj] = useState(draft.projects[0]?.name || '');
  const [bulk, setBulk] = useState('');
  const [bulkModel, setBulkModel] = useState(BUS_MODEL_OPTS[2]);

  const list = (proj && draft.projectVins[proj]) || [];

  const setList = (updater) => touch(d => {
    const cur = Array.isArray(d.projectVins[proj]) ? d.projectVins[proj] : [];
    d.projectVins[proj] = updater(cur);
    return d;
  });

  const updRow = (i, k, v) => setList(cur => cur.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const delRow = (i) => setList(cur => cur.filter((_, j) => j !== i));
  const addRow = () => setList(cur => [...cur, { vin: '', model: BUS_MODEL_OPTS[2] }]);

  const importBulk = () => {
    const rows = bulk.split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => {
        const [vin, model] = l.split(/[\t,]/).map(s => (s || '').trim());
        return { vin, model: model || bulkModel };
      })
      .filter(r => r.vin);
    if (!rows.length || !proj) return;
    setList(cur => {
      const seen = new Set(cur.map(r => r.vin));
      return [...cur, ...rows.filter(r => !seen.has(r.vin))];
    });
    setBulk('');
  };

  return (
    <div>
      <div style={sectionHd}>Project fleet — VIN + bus model available to everyone in the Travel Card</div>
      <div style={{ ...td, marginBottom: 10, maxWidth: 320 }}>
        <select style={inp} value={proj} onChange={e => setProj(e.target.value)}>
          <option value="">Select project…</option>
          {draft.projects.map(p => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      {!proj && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pick a project above (add one in the Projects tab first if needed).</div>}

      {proj && <>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>VIN / Chassis No.</th><th style={th}>Bus model</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i}>
                <td style={td}><input style={{ ...inp, fontFamily: 'monospace' }} value={r.vin} onChange={e => updRow(i, 'vin', e.target.value.toUpperCase())} /></td>
                <td style={{ ...td, width: 140 }}>
                  <select style={inp} value={r.model} onChange={e => updRow(i, 'model', e.target.value)}>
                    {BUS_MODEL_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td style={{ ...td, width: 40 }}><button style={btn} onClick={() => delRow(i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={{ ...btn, marginTop: 10 }} onClick={addRow}>+ Add VIN</button>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={sectionHd}>Bulk import — one VIN per line, optionally "VIN, model"</div>
          <textarea style={{ ...inp, width: '100%', minHeight: 90, fontFamily: 'monospace', resize: 'vertical' }}
            value={bulk} onChange={e => setBulk(e.target.value)}
            placeholder={'BUKBHZ6A8TJ000029, 7m EVS\nBUKBHZ6A4TJ000030, 7m EVS'} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Default model (used when a line has no model):</span>
            <select style={{ ...inp, width: 140 }} value={bulkModel} onChange={e => setBulkModel(e.target.value)}>
              {BUS_MODEL_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button style={btnAccent} onClick={importBulk}>Import</button>
          </div>
        </div>
      </>}
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

// ── Digital Work Instructions editor ─────────────────────────────────────────
// dwi shape: { [stationCode]: { title, revision, reference, description,
//   warnings[], steps[], parts[], modelUrl,
//   variants: { KDC: { steps, parts, warnings, modelUrl }, EVS: { ... } }
// } }
function DWITab({ draft, touch }) {
  const dwi = draft.dwi || {};
  const codes = Object.keys(dwi);

  const [selCode,    setSelCode]    = useState(codes[0] || '');
  const [newCode,    setNewCode]    = useState('');
  const [variantTab, setVariantTab] = useState('Common'); // 'Common' | 'KDC' | 'EVS'

  const wi = dwi[selCode] || null;

  // setWI operates on the top-level station object
  function setWI(updater) {
    touch(d => {
      const next = { ...d.dwi };
      next[selCode] = updater({ ...next[selCode] });
      return { ...d, dwi: next };
    });
  }

  // setVariant operates on wi.variants[model]
  function setVariant(model, updater) {
    setWI(w => {
      const variants = { ...(w.variants || {}) };
      variants[model] = updater({ ...(variants[model] || { steps: [], parts: [], warnings: [], modelUrl: '' }) });
      return { ...w, variants };
    });
  }

  // Get the data object for the currently selected variant tab
  const isCommon = variantTab === 'Common';
  // For Common: target is wi itself; for KDC/EVS: target is wi.variants[model] (or empty)
  const variantData = isCommon ? wi : (wi?.variants?.[variantTab] || { steps: [], parts: [], warnings: [], modelUrl: '' });

  // Setter that targets the right place
  function setTarget(updater) {
    if (isCommon) setWI(updater);
    else setVariant(variantTab, updater);
  }

  function addStation() {
    const code = newCode.trim().toUpperCase();
    if (!code || dwi[code]) return;
    touch(d => ({ ...d, dwi: { ...d.dwi, [code]: { title: '', revision: 'Rev 01', reference: '', description: '', warnings: [], steps: [], parts: [], modelUrl: '', variants: {} } } }));
    setSelCode(code);
    setNewCode('');
  }

  function removeStation(code) {
    touch(d => { const next = { ...d.dwi }; delete next[code]; return { ...d, dwi: next }; });
    setSelCode(codes.find(c => c !== code) || '');
  }

  // Step helpers (operate on variantData via setTarget)
  function addStep() {
    setTarget(w => {
      const steps = Array.isArray(w.steps) ? [...w.steps] : [];
      const next  = steps.length > 0 ? Math.max(...steps.map(s => s.step || 0)) + 1 : 1;
      return { ...w, steps: [...steps, { id: uid('step'), step: next, action: '', note: '' }] };
    });
  }
  function updateStep(id, field, val) {
    setTarget(w => ({ ...w, steps: (w.steps || []).map(s => s.id === id ? { ...s, [field]: val } : s) }));
  }
  function removeStep(id) {
    setTarget(w => ({ ...w, steps: (w.steps || []).filter(s => s.id !== id) }));
  }
  function moveStep(id, dir) {
    setTarget(w => {
      const steps = [...(w.steps || [])];
      const i = steps.findIndex(s => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= steps.length) return w;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...w, steps };
    });
  }

  // Part helpers
  function addPart(consumable = false) {
    setTarget(w => {
      const parts = Array.isArray(w.parts) ? [...w.parts] : [];
      return { ...w, parts: [...parts, { id: uid('part'), partNo: '', description: '', qty: 1, unit: 'ea', consumable }] };
    });
  }
  function updatePart(id, field, val) {
    setTarget(w => ({ ...w, parts: (w.parts || []).map(p => p.id === id ? { ...p, [field]: val } : p) }));
  }
  function removePart(id) {
    setTarget(w => ({ ...w, parts: (w.parts || []).filter(p => p.id !== id) }));
  }

  function clearVariant(model) {
    setWI(w => {
      const variants = { ...(w.variants || {}) };
      delete variants[model];
      return { ...w, variants };
    });
  }

  const inputSx = { ...inp };
  const vSteps    = Array.isArray(variantData?.steps)    ? variantData.steps    : [];
  const vParts    = Array.isArray(variantData?.parts)    ? variantData.parts    : [];
  const vWarnings = Array.isArray(variantData?.warnings) ? variantData.warnings : [];
  const vModelUrl = variantData?.modelUrl || '';

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={sectionHd}>Digital Work Instructions (DWI)</div>
      <p style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, margin: '0 0 16px' }}>
        Assign work instructions to station codes. Steps, parts, and warnings can be shared (Common) or defined per bus model (KDC / EVS). Model-specific content overrides Common when a worker opens the Travel Card for that model.
      </p>

      {/* Station selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <select value={selCode} onChange={e => { setSelCode(e.target.value); setVariantTab('Common'); }} style={{ ...inputSx, maxWidth: 160, flex: '0 0 auto' }}>
          {codes.length === 0 && <option value="">— No stations —</option>}
          {codes.map(c => <option key={c}>{c}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
          <input style={{ ...inputSx, flex: 1 }} value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Station code (e.g. C01-02)" onKeyDown={e => e.key === 'Enter' && addStation()} />
          <button style={btnAccent} onClick={addStation}>+ Add Station</button>
        </div>
        {selCode && (
          <button style={{ ...btn, color: '#dc2626', borderColor: '#dc262644' }} onClick={() => { if (window.confirm(`Remove DWI for ${selCode}?`)) removeStation(selCode); }}>
            Remove {selCode}
          </button>
        )}
      </div>

      {!wi ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          {codes.length === 0 ? 'Add a station code above to start.' : 'Select a station to edit its work instructions.'}
        </div>
      ) : (
        <div>
          {/* Common header fields — always at top level */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Title', key: 'title', placeholder: 'e.g. Installation of Air Tanks and Braking System' },
              { label: 'Reference No.', key: 'reference', placeholder: 'e.g. C01-02' },
              { label: 'Revision', key: 'revision', placeholder: 'e.g. Rev 01' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                <input style={inputSx} value={wi[key] || ''} onChange={e => setWI(w => ({ ...w, [key]: e.target.value }))} placeholder={placeholder} />
              </div>
            ))}
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Description / Scope</div>
              <textarea style={{ ...inputSx, minHeight: 56, resize: 'vertical', lineHeight: 1.5 }} value={wi.description || ''} onChange={e => setWI(w => ({ ...w, description: e.target.value }))} placeholder="Brief description of what this station covers…" />
            </div>
          </div>

          {/* Variant sub-tabs: Common / KDC / EVS */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            {['Common', 'KDC', 'EVS'].map(t => {
              const hasData = t === 'Common'
                ? (wi.steps?.length || wi.parts?.length || wi.warnings?.length || wi.modelUrl)
                : (wi.variants?.[t]?.steps?.length || wi.variants?.[t]?.parts?.length || wi.variants?.[t]?.warnings?.length || wi.variants?.[t]?.modelUrl);
              return (
                <button
                  key={t}
                  onClick={() => setVariantTab(t)}
                  style={{
                    padding: '5px 14px', borderRadius: 6,
                    border: variantTab === t ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: variantTab === t ? 'var(--accent)' : 'var(--bg-surface)',
                    color: variantTab === t ? '#fff' : 'var(--text-dim)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif",
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {t}
                  {hasData && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: variantTab === t ? 'rgba(255,255,255,0.7)' : 'var(--accent)', display: 'inline-block' }} />
                  )}
                </button>
              );
            })}
            {!isCommon && wi.variants?.[variantTab] && (
              <button
                style={{ ...btn, marginLeft: 'auto', color: '#dc2626', borderColor: '#dc262644', fontSize: 10 }}
                onClick={() => { if (window.confirm(`Clear ${variantTab}-specific overrides for ${selCode}? Workers will fall back to Common content.`)) clearVariant(variantTab); }}
              >
                Clear {variantTab} overrides
              </button>
            )}
          </div>

          {!isCommon && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#818cf814', border: '1px solid #818cf833', borderRadius: 6, fontSize: 11, color: '#818cf8', lineHeight: 1.5 }}>
              <strong>{variantTab}-specific content.</strong> When a {variantTab} bus is open in the Travel Card, this overrides the Common steps, parts, warnings, and model URL for station {selCode}.
              {!wi.variants?.[variantTab] && ' No overrides set yet — Common content will be shown.'}
            </div>
          )}

          {/* 3D Model URL — in the current variant tab */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              3D Model URL{!isCommon && ` (${variantTab})`}
              <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>(STEP / OBJ / STL / GLB — public direct-download link)</span>
            </div>
            <input style={inputSx} value={vModelUrl} onChange={e => setTarget(w => ({ ...w, modelUrl: e.target.value }))} placeholder="https://drive.google.com/uc?export=download&id=…" />
            {vModelUrl && (
              <div style={{ marginTop: 6, fontSize: 10, color: '#818cf8' }}>
                ✓ Model URL set — workers will see a "View 3D" button in the Work Instructions panel.
              </div>
            )}
          </div>

          {/* Warnings */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              ⚠ Safety Warnings{!isCommon && ` — ${variantTab}`}
            </div>
            {vWarnings.map((w2, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input style={inputSx} value={w2} onChange={e => setTarget(w => ({ ...w, warnings: (w.warnings || []).map((x, j) => j === i ? e.target.value : x) }))} placeholder="e.g. Wear safety gloves when handling fittings" />
                <button style={btn} onClick={() => setTarget(w => ({ ...w, warnings: (w.warnings || []).filter((_, j) => j !== i) }))}>×</button>
              </div>
            ))}
            <button style={btn} onClick={() => setTarget(w => ({ ...w, warnings: [...(w.warnings || []), ''] }))}>+ Add Warning</button>
          </div>

          {/* Steps */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Work Steps{!isCommon && ` — ${variantTab}`}
              </div>
              <button style={btnAccent} onClick={addStep}>+ Add Step</button>
            </div>
            {vSteps.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>No steps yet{!isCommon ? ` — workers see Common steps for ${variantTab} unless you add overrides here` : ''}.</div>}
            {vSteps.map((s, i) => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 60px', gap: 6, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
                  <button style={{ ...btn, padding: '2px 5px', fontSize: 10 }} onClick={() => moveStep(s.id, -1)} disabled={i === 0}>▲</button>
                  <button style={{ ...btn, padding: '2px 5px', fontSize: 10 }} onClick={() => moveStep(s.id, 1)} disabled={i === vSteps.length - 1}>▼</button>
                </div>
                <input style={inputSx} value={s.action} onChange={e => updateStep(s.id, 'action', e.target.value)} placeholder={`Step ${s.step} — action`} />
                <input style={inputSx} value={s.note || ''} onChange={e => updateStep(s.id, 'note', e.target.value)} placeholder="Note / clarification (optional)" />
                <button style={{ ...btn, color: '#dc2626', borderColor: '#dc262644', padding: '6px 8px' }} onClick={() => removeStep(s.id)}>×</button>
              </div>
            ))}
          </div>

          {/* Parts & Consumables */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Parts & Consumables{!isCommon && ` — ${variantTab}`}
              </div>
              <button style={btnAccent} onClick={() => addPart(false)}>+ Part</button>
              <button style={btn} onClick={() => addPart(true)}>+ Consumable</button>
            </div>
            {vParts.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>No parts added{!isCommon ? ` — workers see Common parts list for ${variantTab} unless you add overrides here` : ''}.</div>}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                {vParts.length > 0 && (
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Type', 'Part No.', 'Description', 'Qty', 'Unit', ''].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {vParts.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>
                        <select style={{ ...inputSx, width: 100 }} value={p.consumable ? 'consumable' : 'part'} onChange={e => updatePart(p.id, 'consumable', e.target.value === 'consumable')}>
                          <option value="part">Part</option>
                          <option value="consumable">Consumable</option>
                        </select>
                      </td>
                      <td style={td}><input style={{ ...inputSx, width: 80 }} value={p.partNo || ''} onChange={e => updatePart(p.id, 'partNo', e.target.value)} placeholder="Part No." /></td>
                      <td style={td}><input style={inputSx} value={p.description} onChange={e => updatePart(p.id, 'description', e.target.value)} placeholder="Description" /></td>
                      <td style={td}><input style={{ ...inputSx, width: 56 }} type="number" value={p.qty} onChange={e => updatePart(p.id, 'qty', Number(e.target.value) || 1)} min="1" /></td>
                      <td style={td}><input style={{ ...inputSx, width: 64 }} value={p.unit || 'ea'} onChange={e => updatePart(p.id, 'unit', e.target.value)} placeholder="ea" /></td>
                      <td style={td}><button style={{ ...btn, color: '#dc2626', borderColor: '#dc262644' }} onClick={() => removePart(p.id)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
