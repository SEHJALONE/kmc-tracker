import { useMemo, useState } from 'react';
import { BUS_MODELS } from '../../utils/tcCatalog';
import { makeItem } from '../../data/jobOrders';
import { cleanVin } from '../../utils/vinUpload';
import { JOB_ERRORS } from '../../hooks/useJobData';
import CutListEditor from './CutListEditor';

// A supervisor sets up (or edits) a Machine Shop job order: project, bus model,
// the VINs it covers (several buses of one model share one cut list), and the
// parts to cut, starting from that model's cut list. Every field of the cut
// list can be changed for this order; untick parts that are not to be cut.

const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' };

export default function JobOrderSetup({ catalog, jobData, job = null, project: fixedProject = '', busModel: fixedModel = '', onSaved, onCancel }) {
  const projects = useMemo(() => (catalog.projects || []).filter(p => p && p.name && p.active !== false).map(p => p.name), [catalog.projects]);
  const [project, setProject] = useState(job?.project || fixedProject);
  const [busModel, setBusModel] = useState(job?.busModel || fixedModel);
  const [vins, setVins] = useState(job?.vins || []);
  const [typed, setTyped] = useState('');
  const [items, setItems] = useState(() => (job ? job.items.map(makeItem) : (jobData.cutLists[job?.busModel || fixedModel]?.items || []).map(it => makeItem({ ...it, id: undefined, cut: true }))));
  const [loadedFor, setLoadedFor] = useState(job ? job.busModel : fixedModel);
  const [notes, setNotes] = useState(job?.notes || '');
  const [status, setStatus] = useState(job?.status || 'open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const projectVins = ((catalog.projectVins || {})[project] || []).filter(v => !busModel || !v.model || v.model === busModel).map(v => cleanVin(v.vin));
  const options = [...new Set([...projectVins, ...vins])];
  const cutList = jobData.cutLists[busModel];

  function chooseModel(m) {
    setBusModel(m);
    setVins([]);
    // A new order starts from the model's cut list.
    if (!job && m !== loadedFor) {
      setItems((jobData.cutLists[m]?.items || []).map(it => makeItem({ ...it, id: undefined, cut: true })));
      setLoadedFor(m);
    }
  }
  const reload = () => {
    if (items.length && !window.confirm(`Replace the parts below with the saved ${busModel} cut list? Your edits here are lost.`)) return;
    setItems((cutList?.items || []).map(it => makeItem({ ...it, id: undefined, cut: true })));
  };
  const toggleVin = v => setVins(vs => (vs.includes(v) ? vs.filter(x => x !== v) : [...vs, v]));
  const addTyped = () => { const v = cleanVin(typed); if (v && !vins.includes(v)) setVins([...vins, v]); setTyped(''); };

  async function save() {
    setError('');
    if (!project || !busModel) return setError(JOB_ERRORS['missing-project-or-model']);
    if (!vins.length) return setError(JOB_ERRORS['missing-vins']);
    if (!items.some(it => it.cut)) return setError('Tick at least one part to cut.');
    setBusy(true);
    try {
      const r = await jobData.saveJobOrder({ id: job?.id, project, busModel, vins, items, notes, status, specMachines: job?.specMachines });
      onSaved?.(r.id);
    } catch (e) { setError(JOB_ERRORS[e.message] || e.message); }
    setBusy(false);
  }

  const cutParts = items.filter(it => it.cut);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="kmc-panel" style={{ padding: '16px 18px', display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>{job ? `Edit job order ${job.id}` : 'New job order — Machine Shop'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={label} htmlFor="jo-project">Bus project</label>
            <select id="jo-project" style={inp} value={project} disabled={!!fixedProject && !job} onChange={e => { setProject(e.target.value); setVins([]); }}>
              <option value="">Select project…</option>
              {projects.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="jo-model">Bus model</label>
            <select id="jo-model" style={inp} value={busModel} disabled={!!fixedModel && !job} onChange={e => chooseModel(e.target.value)}>
              <option value="">Select model…</option>
              {BUS_MODELS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          {job && (
            <div>
              <label style={label} htmlFor="jo-status">Status</label>
              <select id="jo-status" style={inp} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="open">Open — operators can start it</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label style={label}>VINs on this job order ({vins.length})</label>
          {!project || !busModel
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Choose the project and bus model first.</div>
            : (
              <>
                {options.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>No {busModel} VINs on {project} yet — type them below, or add them in Type Approvals.</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {options.map(v => (
                    <button key={v} type="button" onClick={() => toggleVin(v)} className="kmc-btn"
                      style={{ fontFamily: 'monospace', fontSize: 12, padding: '5px 9px', ...(vins.includes(v) ? { borderColor: '#10b981', color: '#10b981', background: 'rgba(16,185,129,.1)' } : {}) }}>
                      {vins.includes(v) ? '✓ ' : ''}{v}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, maxWidth: 420 }}>
                  <input style={{ ...inp, fontFamily: 'monospace' }} placeholder="Type a VIN…" value={typed} onChange={e => setTyped(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && addTyped()} />
                  <button className="kmc-btn" onClick={addTyped}>+ Add</button>
                  {options.length > 1 && <button className="kmc-btn ghost" onClick={() => setVins(vins.length === options.length ? [] : options)}>{vins.length === options.length ? 'None' : 'All'}</button>}
                </div>
              </>
            )}
        </div>

        <div>
          <label style={label} htmlFor="jo-notes">Notes (optional)</label>
          <input id="jo-notes" style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. priority, batch, drawing revision" />
        </div>
      </div>

      {busModel && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="kmc-label">Cut list — {busModel} · {cutParts.length} of {items.length} parts to cut</div>
            <span style={{ flex: 1 }} />
            {cutList && <button className="kmc-btn ghost" onClick={reload}>Reload saved {busModel} cut list</button>}
          </div>
          {!cutList && items.length === 0 && (
            <div className="kmc-panel" style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              There is no saved cut list for {busModel} yet. Add specifications and parts below, or upload one in Job Orders → Cut lists.
            </div>
          )}
          <CutListEditor items={items} onChange={setItems} materials={jobData.materials} showCut />
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>⚠ {error}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="kmc-btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : job ? 'Save job order' : 'Submit job order'}</button>
        {onCancel && <button className="kmc-btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
