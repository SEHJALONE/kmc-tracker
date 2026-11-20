import { useMemo, useRef, useState } from 'react';
import { JO_LINES, MACHINE_SHOP_LINE, cutListKey, makeItem, makeActivity, parseCutListCsv } from '../../data/jobOrders';
import { JOB_ERRORS } from '../../hooks/useJobData';
import CutListEditor from './CutListEditor';
import ActivityEditor from './ActivityEditor';

// Set up (or edit) a job order for an other (non-bus) project:
//   project ID from the register, the line, a title, due date and notes, then
//   Machine Shop             the parts to cut: the project's cut list, a CSV, or typed in
//   Paint Shop, Parts Making the activities to do
// `legacy`: an old job filled in after the fact (saved closed; anyone on the line).

const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };

const freshItems = list => (list || []).map(it => makeItem({ ...it, id: undefined, cut: true }));

export default function OtherJobSetup({ jobData, job = null, line: fixedLine = '', lines = JO_LINES, legacy = false, onSaved, onCancel }) {
  const projects = useMemo(() => (jobData.otherProjects || []).filter(p => p.active !== false || p.id === job?.projectId), [jobData.otherProjects, job]);
  const [line, setLine] = useState(job?.line || fixedLine || (lines.length === 1 ? lines[0] : ''));
  const [projectId, setProjectId] = useState(job?.projectId || '');
  const [title, setTitle] = useState(job?.title || '');
  const [dueDate, setDueDate] = useState(job?.dueDate || '');
  const [notes, setNotes] = useState(job?.notes || '');
  const [items, setItems] = useState(() => (job ? job.items.map(makeItem) : []));
  const [activities, setActivities] = useState(() => (job?.activities?.length ? job.activities.map(makeActivity) : [makeActivity()]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const file = useRef(null);

  const forLine = projects.filter(p => !line || !p.lines?.length || p.lines.includes(line));
  const project = projects.find(p => p.id === projectId);
  const saved = projectId ? jobData.cutLists[cutListKey(projectId)] : null;
  const machine = line === MACHINE_SHOP_LINE;

  function pickProject(id) {
    setProjectId(id);
    // A new Machine Shop order starts from the project's saved cut list.
    const list = jobData.cutLists[cutListKey(id)];
    if (!job && machine && list && !items.length) setItems(freshItems(list.items));
  }
  function loadSaved() {
    if (items.length && !window.confirm(`Replace the parts below with the saved ${projectId} cut list?`)) return;
    setItems(freshItems(saved?.items));
  }
  function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (file.current) file.current.value = '';
      const { items: parsed, errors } = parseCutListCsv(String(r.result || ''));
      if (!parsed.length) { setMsg(`Error: ${errors.join(' ') || 'No parts found.'}`); return; }
      const replace = !items.length || window.confirm(`Replace the ${items.length} parts below with the ${parsed.length} in ${f.name}?\n\nCancel adds them to the end instead.`);
      setItems(replace ? parsed : [...items, ...parsed]);
      setMsg(`${parsed.length} parts read from ${f.name}${errors.length ? ` - ${errors.join(' ')}` : ''}.`);
    };
    r.readAsText(f);
  }

  async function save() {
    setError('');
    if (!line) return setError(JOB_ERRORS['bad-line']);
    if (!projectId) return setError('Choose the project.');
    const acts = activities.filter(a => a.name.trim());
    if (machine && !items.some(it => it.cut)) return setError('Tick at least one part to cut.');
    if (!machine && !acts.length) return setError(JOB_ERRORS['missing-activities']);
    setBusy(true);
    try {
      const r = await jobData.saveJobOrder({
        id: job?.id, kind: 'other', line, projectId, project: project?.name || '', title: title.trim(), dueDate, notes,
        items: machine ? items : [], activities: machine ? [] : acts, status: job?.status || 'open', specMachines: job?.specMachines, legacy,
      });
      onSaved?.(r.id);
    } catch (e) { setError(JOB_ERRORS[e.message] || e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="kmc-panel" style={{ padding: '16px 18px', display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>
          {job ? `Edit job order ${job.id}` : legacy ? 'Legacy job order - other project' : 'New job order - other project'}
        </div>
        {legacy && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>For a job that was done before it was recorded here. It is saved as closed; fill in its runs (times, operators, what was done) next.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={label} htmlFor="ojo-line">Line</label>
            <select id="ojo-line" style={inp} value={line} disabled={!!job || !!fixedLine} onChange={e => setLine(e.target.value)}>
              <option value="">Select line…</option>
              {lines.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="ojo-project">Project</label>
            <select id="ojo-project" style={inp} value={projectId} onChange={e => pickProject(e.target.value)}>
              <option value="">Select project…</option>
              {forLine.map(p => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
            </select>
            {!forLine.length && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No projects{line ? ` for the ${line}` : ''} yet. A supervisor adds them under Other Projects, Projects.</div>}
          </div>
          <div>
            <label style={label} htmlFor="ojo-due">Due date (optional)</label>
            <input id="ojo-due" type="date" style={inp} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <div>
            <label style={label} htmlFor="ojo-title">What is to be done</label>
            <input id="ojo-title" style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Tank shell plates, batch 1" />
          </div>
          <div>
            <label style={label} htmlFor="ojo-notes">Notes (optional)</label>
            <input id="ojo-notes" style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. priority, drawing revision, colour code" />
          </div>
        </div>
        {project?.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{project.name}{project.client ? ` for ${project.client}` : ''}: {project.description}</div>}
      </div>

      {line && projectId && machine && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="kmc-label">Cut list · {items.filter(it => it.cut).length} of {items.length} parts to cut</div>
            <span style={{ flex: 1 }} />
            {saved && <button className="kmc-btn ghost" onClick={loadSaved}>Load saved {projectId} cut list ({saved.items.length})</button>}
            <label className="kmc-btn" style={{ cursor: 'pointer' }}>Upload CSV<input ref={file} type="file" accept=".csv,text/csv" onChange={upload} style={{ display: 'none' }} /></label>
          </div>
          {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('Error:') ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{msg}</div>}
          {!saved && !items.length && (
            <div className="kmc-panel" style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              No saved cut list for {projectId}. Upload a CSV (same template as the bus cut lists), or add specifications and parts below.
            </div>
          )}
          <CutListEditor items={items} onChange={setItems} materials={jobData.materials} showCut />
        </div>
      )}
      {line && projectId && !machine && <ActivityEditor activities={activities} onChange={setActivities} />}

      {error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="kmc-btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : job ? 'Save job order' : legacy ? 'Save and fill in runs' : 'Submit job order'}</button>
        {onCancel && <button className="kmc-btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
