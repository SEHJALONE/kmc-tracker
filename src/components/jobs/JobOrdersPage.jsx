import { useMemo, useRef, useState } from 'react';
import { BUS_MODELS } from '../../utils/tcCatalog';
import { groupBySpec, parseCutListCsv, cutListToRows, CUT_LIST_TEMPLATE_ROWS, downloadCsv, makeItem } from '../../data/jobOrders';
import { machineShopMachines } from '../../utils/machines';
import { useJobData, JOB_ERRORS } from '../../hooks/useJobData';
import CutListEditor from './CutListEditor';
import JobOrderSetup from './JobOrderSetup';

// Machine Shop job orders, for its supervisors (and admins):
//   Job orders            set up, edit, close and reopen job orders
//   Cut lists             one per bus model: upload a CSV (template provided),
//                         edit every field, download it back
//   Materials & machines  which machines cut each material type; add types

const TABS = ['Job orders', 'Cut lists', 'Materials & machines'];
const inp = { padding: '8px 10px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' };

function JobsTab({ catalog, jobData }) {
  const [editing, setEditing] = useState(null);   // 'new' | job
  const [showClosed, setShowClosed] = useState(false);
  const list = jobData.jobOrders.filter(j => showClosed || j.status === 'open')
    .sort((a, b) => (a.status === b.status ? new Date(b.createdAt) - new Date(a.createdAt) : a.status === 'open' ? -1 : 1));

  if (editing) return (
    <JobOrderSetup catalog={catalog} jobData={jobData} job={editing === 'new' ? null : editing}
      onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
  );
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {jobData.canManage && <button className="kmc-btn primary" onClick={() => setEditing('new')}>+ New job order</button>}
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Show closed
        </label>
        <span style={{ flex: 1 }} />
        <button className="kmc-btn ghost" onClick={jobData.refresh}>↻ Refresh</button>
      </div>
      {!list.length && <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{jobData.loading ? 'Loading…' : 'No job orders yet.'}</div>}
      {list.map(j => {
        const cut = j.items.filter(it => it.cut);
        return (
          <div key={j.id} className="kmc-panel" style={{ padding: '12px 16px', opacity: j.status === 'open' ? 1 : 0.6 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: 'monospace', color: 'var(--accent-text)' }}>{j.id}</strong>
              <span style={{ fontSize: 13 }}>{j.project} · {j.busModel}</span>
              <span className="kmc-chip"><span>{j.status}</span><b style={{ background: j.status === 'open' ? 'var(--g-lime)' : 'var(--g-blue)' }}>{cut.length}</b></span>
              <span style={{ flex: 1 }} />
              {jobData.canManage && <button className="kmc-btn" onClick={() => setEditing(j)}>Edit</button>}
              {jobData.canManage && (
                <button className="kmc-btn ghost" onClick={() => jobData.saveJobOrder({ ...j, status: j.status === 'open' ? 'closed' : 'open' }).catch(e => alert(JOB_ERRORS[e.message] || e.message))}>
                  {j.status === 'open' ? 'Close' : 'Reopen'}
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {cut.length} parts to cut in {groupBySpec(cut).length} specifications · {j.vins.length} VIN{j.vins.length === 1 ? '' : 's'}: <span style={{ fontFamily: 'monospace' }}>{j.vins.join(' · ')}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Set up by {j.createdByName || j.createdBy} · {new Date(j.createdAt).toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}

function CutListsTab({ jobData }) {
  const [model, setModel] = useState(BUS_MODELS.find(m => jobData.cutLists[m]) || BUS_MODELS[0]);
  const [draft, setDraft] = useState(null);       // items being edited, null = saved list
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const saved = jobData.cutLists[model];
  const items = draft ?? (saved?.items || []);

  function pickModel(m) {
    if (draft && !window.confirm('Discard your unsaved changes to this cut list?')) return;
    setModel(m); setDraft(null); setMsg('');
  }
  function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { items: parsed, errors } = parseCutListCsv(String(reader.result || ''));
      if (file.current) file.current.value = '';
      if (!parsed.length) { setMsg(`⚠ ${errors.join(' ') || 'No parts found.'}`); return; }
      const replace = !items.length || window.confirm(`Replace the ${items.length} parts now in the ${model} cut list with the ${parsed.length} in ${f.name}?\n\nCancel adds them to the end instead.`);
      setDraft(replace ? parsed : [...items, ...parsed]);
      setMsg(`${parsed.length} parts read from ${f.name}${errors.length ? ` — ${errors.join(' ')}` : ''}. Check them, then Save.`);
    };
    reader.readAsText(f);
  }
  async function save() {
    setBusy(true); setMsg('');
    try { await jobData.saveCutList(model, draft ?? items); setDraft(null); setMsg('✓ Saved.'); }
    catch (e) { setMsg(`⚠ ${JOB_ERRORS[e.message] || e.message}`); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select aria-label="Bus model" style={inp} value={model} onChange={e => pickModel(e.target.value)}>
          {BUS_MODELS.map(m => <option key={m} value={m}>{m}{jobData.cutLists[m] ? ` (${jobData.cutLists[m].items.length})` : ''}</option>)}
        </select>
        <button className="kmc-btn" onClick={() => downloadCsv('cut-list-template.csv', CUT_LIST_TEMPLATE_ROWS)}>⬇ Template</button>
        {items.length > 0 && <button className="kmc-btn" onClick={() => downloadCsv(`cut-list-${model}.csv`, cutListToRows(items))}>⬇ This cut list</button>}
        {jobData.canManage && <label className="kmc-btn" style={{ cursor: 'pointer' }}>⬆ Upload CSV<input ref={file} type="file" accept=".csv,text/csv" onChange={upload} style={{ display: 'none' }} /></label>}
        <span style={{ flex: 1 }} />
        {saved?.builtIn && !draft && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Built-in list — save to keep your own.</span>}
        {saved?.updatedAt && !draft && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saved by {saved.updatedBy} · {new Date(saved.updatedAt).toLocaleString()}</span>}
      </div>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('⚠') ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{msg}</div>}
      <CutListEditor items={items} onChange={next => setDraft(next.map(makeItem))} materials={jobData.materials} readOnly={!jobData.canManage} />
      {jobData.canManage && (
        <div style={{ display: 'flex', gap: 10, position: 'sticky', bottom: 10 }}>
          <button className="kmc-btn primary" disabled={busy || (!draft && !saved?.builtIn)} onClick={save}>
            {busy ? 'Saving…' : draft || saved?.builtIn ? `Save ${model} cut list` : 'No changes'}
          </button>
          {draft && <button className="kmc-btn" onClick={() => { setDraft(null); setMsg(''); }}>Discard changes</button>}
        </div>
      )}
    </div>
  );
}

function MaterialsTab({ catalog, jobData }) {
  const machines = useMemo(() => machineShopMachines(catalog), [catalog]);
  const [draft, setDraft] = useState(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const list = draft ?? jobData.materials;
  const edit = next => { setDraft(next); setMsg(''); };
  const toggle = (i, code) => edit(list.map((m, k) => (k !== i ? m : { ...m, machines: m.machines.includes(code) ? m.machines.filter(c => c !== code) : [...m.machines, code] })));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (list.some(m => m.name.toLowerCase() === n.toLowerCase())) { alert(`${n} is already a material type.`); return; }
    edit([...list, { name: n, machines: [] }]); setName('');
  };
  async function save() {
    try { await jobData.saveMaterials(list); setDraft(null); setMsg('✓ Saved.'); }
    catch (e) { setMsg(`⚠ ${JOB_ERRORS[e.message] || e.message}`); }
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Each specification on a cut list has a material type, and only the machines ticked for that material can be chosen to cut it.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 700 }}>
          <thead><tr>
            <th style={{ textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', padding: 6 }}>Material type</th>
            {machines.map(m => <th key={m.code} title={`${m.code} · ${m.label}`} style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 4px', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', height: 170 }}>{m.code} · {m.label.split('—').pop().trim().slice(0, 26)}</th>)}
            <th />
          </tr></thead>
          <tbody>
            {list.map((m, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: 4 }}>
                  <input aria-label="Material type" style={{ ...inp, width: 170 }} value={m.name} disabled={!jobData.canManage}
                    onChange={e => edit(list.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                </td>
                {machines.map(mc => (
                  <td key={mc.code} style={{ textAlign: 'center' }}>
                    <input type="checkbox" aria-label={`${m.name} on ${mc.code}`} disabled={!jobData.canManage} checked={m.machines.includes(mc.code)} onChange={() => toggle(i, mc.code)} />
                  </td>
                ))}
                <td>{jobData.canManage && <button className="kmc-btn ghost" onClick={() => { if (window.confirm(`Remove ${m.name}?`)) edit(list.filter((_, k) => k !== i)); }}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {jobData.canManage && (
        <>
          <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="New material type, e.g. Round bar" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
            <button className="kmc-btn" onClick={add}>+ Add</button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="kmc-btn primary" disabled={!draft} onClick={save}>Save materials</button>
            {draft && <button className="kmc-btn" onClick={() => setDraft(null)}>Discard changes</button>}
            {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// The laser cutter photo sits on black, so the page backdrop is black too and the
// photo is fitted whole (contain), never stretched past its 765×1024 size. A scrim
// in the theme's base colour keeps headings and panels readable over it.
function PageBackdrop({ theme }) {
  const scrim = theme === 'dark' ? 'rgba(7, 9, 15, 0.45)' : 'rgba(241, 245, 249, 0.82)';
  return (
    <div aria-hidden="true" style={{
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      backgroundColor: '#000',
      backgroundImage: `linear-gradient(${scrim}, ${scrim}), url('/Job order bg.webp')`,
      backgroundSize: 'cover, contain', backgroundPosition: 'center, center', backgroundRepeat: 'no-repeat',
    }} />
  );
}

export default function JobOrdersPage({ catalog, onBack, theme }) {
  const jobData = useJobData();
  const [tab, setTab] = useState(TABS[0]);
  return (
    <>
    <PageBackdrop theme={theme} />
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '20px 16px 60px', color: 'var(--text-primary)' }}>
      <button className="kmc-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Home</button>
      <div className="kmc-label" style={{ color: 'var(--accent-text)' }}>Machine Shop</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 34, letterSpacing: '.04em', margin: '2px 0 14px', color: 'var(--text-heading)' }}>Job orders</h1>
      {!jobData.canManage && !jobData.loading && (
        <div className="kmc-panel" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          View only: changes need a Machine Shop supervisor account (an assigned B01–B03 station or the Machine Shop line) or an admin.
        </div>
      )}
      {jobData.error && <div style={{ fontSize: 13, color: 'var(--accent-text)', marginBottom: 12 }}>⚠ {jobData.error}</div>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => <button key={t} className={`kmc-btn${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Job orders' && <JobsTab catalog={catalog} jobData={jobData} />}
      {tab === 'Cut lists' && <CutListsTab jobData={jobData} />}
      {tab === 'Materials & machines' && <MaterialsTab catalog={catalog} jobData={jobData} />}
    </div>
    </>
  );
}
