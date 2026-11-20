import { useRef, useState } from 'react';
import {
  JO_LINES, LINE_TINT, MACHINE_SHOP_LINE, PROJECT_TEMPLATE_ROWS, PROJECT_COLUMNS, parseProjectsCsv, downloadCsv,
  cutListKey, isOtherJob, jobLine, jobHeading, jobProgress, stateLabel, JOB_STATES, isActivityJob, groupBySpec,
} from '../../data/jobOrders';
import { useJobData, JOB_ERRORS } from '../../hooks/useJobData';
import OtherJobSetup from './OtherJobSetup';
import JobTracker from './JobTracker';
import LegacyJobRuns from './LegacyJobRuns';
import JobComments, { JobOrderAdmin } from './JobComments';
import { CutListsTab, DeletedJobs } from './JobOrdersPage';
import { myJobLines } from './MyJobOrders';

// Other Projects: work that is not a bus, on the Machine Shop, Paint Shop and
// Parts Making lines.
//   Job orders   set up per project and line: a cut list (Machine Shop) or a
//                list of activities (Paint Shop, Parts Making); comment, close,
//                delete with a reason
//   Tracker      what is running on them now, and how far each one is
//   Projects     the register: project IDs and names, typed in or from a CSV
//   Cut lists    one per project, for the Machine Shop
//   Legacy       old jobs filled in after the fact

const TABS = ['Job orders', 'Tracker', 'Projects', 'Cut lists', 'Legacy'];
const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const inp = { width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
const th = { fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' };
const td = { padding: '7px 8px', fontSize: 13, borderTop: '1px solid var(--border-subtle)', verticalAlign: 'top' };

const LineTag = ({ line }) => (
  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff', background: LINE_TINT[line] || '#64748b', borderRadius: 999, padding: '3px 9px' }}>{line}</span>
);

function JobsTab({ jobData }) {
  const manage = jobData.manageLines || [];
  const [editing, setEditing] = useState(null);   // 'new' | job
  const [line, setLine] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const lines = myJobLines(jobData);
  const list = jobData.jobOrders.filter(j => isOtherJob(j) && (!line || jobLine(j) === line) && (showClosed || j.status === 'open'))
    .sort((a, b) => (a.status === b.status ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.status === 'open' ? -1 : 1));

  if (editing) return (
    <OtherJobSetup jobData={jobData} job={editing === 'new' ? null : editing} lines={manage} line={editing === 'new' ? (manage.includes(line) ? line : '') : ''}
      onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
  );
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {manage.length > 0 && <button className="kmc-btn primary" onClick={() => setEditing('new')}>+ New job order</button>}
        {['', ...lines].map(l => (
          <button key={l || 'all'} className={`kmc-btn${line === l ? ' primary' : ' ghost'}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setLine(l)}>{l || 'All lines'}</button>
        ))}
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Show closed
        </label>
        {manage.length > 0 && (
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Show deleted
          </label>
        )}
        <span style={{ flex: 1 }} />
        <button className="kmc-btn ghost" onClick={jobData.refresh}>↻ Refresh</button>
      </div>
      {!list.length && <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{jobData.loading ? 'Loading…' : 'No job orders for other projects yet.'}</div>}
      {list.map(j => {
        const p = jobProgress(j, jobData.runs);
        const [, color] = JOB_STATES[p.state];
        const mine = manage.includes(jobLine(j));
        const locked = p.runs.length > 0;
        return (
          <div key={j.id} className="kmc-panel" style={{ padding: '12px 16px', opacity: j.status === 'open' ? 1 : 0.65, borderLeft: `4px solid ${LINE_TINT[jobLine(j)]}` }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--accent-text)' }}>{j.id}</strong>
              <LineTag line={jobLine(j)} />
              <span style={{ fontSize: 13 }}>{jobHeading(j)}</span>
              <span className="kmc-label">{j.legacy ? 'legacy' : j.status}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{stateLabel(j, p.state)}{p.runs.length ? ` · ${p.done}/${p.total} done` : ''}</span>
              <span style={{ flex: 1 }} />
              {mine && (
                <button className="kmc-btn" disabled={locked} onClick={() => setEditing(j)} title={locked ? 'Work has already run on this job order, so it can no longer be edited.' : 'Edit this job order'}>
                  {locked ? 'Edit (started)' : 'Edit'}
                </button>
              )}
              {mine && (
                <button className="kmc-btn ghost" onClick={() => jobData.setJobStatus(j, j.status === 'open' ? 'closed' : 'open').catch(e => alert(JOB_ERRORS[e.message] || e.message))}>
                  {j.status === 'open' ? 'Close' : 'Reopen'}
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {isActivityJob(j) ? `${j.activities.length} activities` : `${j.items.filter(it => it.cut).length} parts to cut in ${groupBySpec(j.items.filter(it => it.cut)).length} specifications`}
              {j.dueDate ? ` · due ${j.dueDate}` : ''} · set up by {j.createdByName || j.createdBy} · {new Date(j.createdAt).toLocaleString()}
            </div>
            {j.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{j.notes}</div>}
            <JobComments job={j} markSeen={false} />
            <JobOrderAdmin job={j} jobData={jobData} />
          </div>
        );
      })}
      {showDeleted && <DeletedJobs jobs={jobData.deletedJobs.filter(j => isOtherJob(j) && (!line || jobLine(j) === line))} />}
    </div>
  );
}

const blank = { id: '', name: '', client: '', description: '', lines: [...JO_LINES] };

function ProjectsTab({ jobData }) {
  const canEdit = (jobData.manageLines || []).length > 0;
  const [draft, setDraft] = useState(blank);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const file = useRef(null);
  const list = (jobData.otherProjects || []).filter(p => showRetired || p.active !== false);

  async function send(projects, done) {
    setBusy(true); setMsg('');
    try {
      const r = await jobData.saveOtherProjects(projects);
      const { added = [], updated = [], invalid = [] } = r.result || {};
      setMsg(`${added.length} added, ${updated.length} updated${invalid.length ? `. Not saved (the ID may use letters, digits and - _ . / only): ${invalid.join(', ')}` : ''}.`);
      done?.();
    } catch (e) { setMsg(`Error: ${JOB_ERRORS[e.message] || e.message}`); }
    setBusy(false);
  }
  function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (file.current) file.current.value = '';
      const { projects, errors } = parseProjectsCsv(String(r.result || ''));
      if (!projects.length) { setMsg(`Error: ${errors.join(' ')}`); return; }
      if (!window.confirm(`Save the ${projects.length} projects in ${f.name}? Projects whose ID is already in the register are updated.${errors.length ? `\n\nSkipped: ${errors.join(' ')}` : ''}`)) return;
      send(projects);
    };
    r.readAsText(f);
  }
  const toggleLine = l => setDraft(d => ({ ...d, lines: d.lines.includes(l) ? d.lines.filter(x => x !== l) : [...d.lines, l] }));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Each project not for a bus gets an ID here. Job orders, cut lists and runs are filed under it.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="kmc-btn" onClick={() => downloadCsv('other-projects-template.csv', PROJECT_TEMPLATE_ROWS)}>Template</button>
        {list.length > 0 && <button className="kmc-btn" onClick={() => downloadCsv('other-projects.csv', [PROJECT_COLUMNS, ...list.map(p => [p.id, p.name, p.client, p.description, (p.lines || []).join('; ')])])}>Download register</button>}
        {canEdit && <label className="kmc-btn" style={{ cursor: 'pointer' }}>Upload CSV<input ref={file} type="file" accept=".csv,text/csv" onChange={upload} style={{ display: 'none' }} /></label>}
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Show retired
        </label>
      </div>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('Error:') ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{msg}</div>}
      <div className="kmc-panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead><tr><th style={th}>Project ID</th><th style={th}>Name</th><th style={th}>Client</th><th style={th}>Description</th><th style={th}>Lines</th><th style={th}>Job orders</th>{canEdit && <th style={th} />}</tr></thead>
          <tbody>
            {!list.length && <tr><td style={td} colSpan={7}>{jobData.loading ? 'Loading…' : 'No projects yet.'}</td></tr>}
            {list.map(p => (
              <tr key={p.id} style={{ opacity: p.active === false ? 0.5 : 1 }}>
                <td style={{ ...td, fontWeight: 700 }}>{p.id}</td>
                <td style={td}>{p.name}</td>
                <td style={td}>{p.client || '-'}</td>
                <td style={{ ...td, maxWidth: 280 }}>{p.description || '-'}</td>
                <td style={td}><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{(p.lines || []).map(l => <LineTag key={l} line={l} />)}</div></td>
                <td style={td}>{jobData.jobOrders.filter(j => j.projectId === p.id).length}</td>
                {canEdit && (
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="kmc-btn ghost" style={{ fontSize: 12, padding: '3px 9px' }} onClick={() => { setDraft({ ...blank, ...p }); window.scrollTo(0, document.body.scrollHeight); }}>Edit</button>
                    <button className="kmc-btn ghost" style={{ fontSize: 12, padding: '3px 9px' }} disabled={busy} onClick={() => send([{ ...p, active: p.active === false }])}>{p.active === false ? 'Restore' : 'Retire'}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="kmc-panel" style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
          <div className="kmc-label">{(jobData.otherProjects || []).some(p => p.id === draft.id.trim().toUpperCase()) ? `Edit ${draft.id}` : 'Add a project'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div><label style={label} htmlFor="op-id">Project ID</label><input id="op-id" style={inp} value={draft.id} onChange={e => setDraft({ ...draft, id: e.target.value.toUpperCase() })} placeholder="e.g. PRJ-001" /></div>
            <div><label style={label} htmlFor="op-name">Name</label><input id="op-name" style={inp} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Steel water tank" /></div>
            <div><label style={label} htmlFor="op-client">Client (optional)</label><input id="op-client" style={inp} value={draft.client} onChange={e => setDraft({ ...draft, client: e.target.value })} /></div>
          </div>
          <div><label style={label} htmlFor="op-desc">Description (optional)</label><input id="op-desc" style={inp} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
          <div>
            <div style={label}>Lines that work on it</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {JO_LINES.map(l => (
                <label key={l} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={draft.lines.includes(l)} onChange={() => toggleLine(l)} /> {l}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="kmc-btn primary" disabled={busy || !draft.id.trim() || !draft.name.trim()} onClick={() => send([{ ...draft, id: draft.id.trim(), name: draft.name.trim() }], () => setDraft(blank))}>
              {busy ? 'Saving…' : 'Save project'}
            </button>
            {(draft.id || draft.name) && <button className="kmc-btn ghost" onClick={() => setDraft(blank)}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OtherProjectsPage({ catalog, currentUserName = '', onBack }) {
  const jobData = useJobData();
  const [tab, setTab] = useState(TABS[0]);
  const manage = jobData.manageLines || [];
  const msProjects = (jobData.otherProjects || []).filter(p => p.active !== false && (!p.lines?.length || p.lines.includes(MACHINE_SHOP_LINE)));
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 60px', color: 'var(--text-primary)' }}>
      <button className="kmc-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Home</button>
      <div className="kmc-label" style={{ color: 'var(--accent-text)' }}>Machine Shop · Paint Shop · Parts Making</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.01em', margin: '2px 0 14px', color: 'var(--text-heading)' }}>Other projects</h1>
      {!manage.length && !jobData.loading && (
        <div className="kmc-panel" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          View only: setting up projects and job orders needs a supervisor of the Machine Shop, Paint Shop or Parts Making, or an admin. You can still fill in legacy jobs for your own line.
        </div>
      )}
      {manage.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>You manage: {manage.join(', ')}.</div>}
      {jobData.error && <div style={{ fontSize: 13, color: 'var(--accent-text)', marginBottom: 12 }}>{jobData.error}</div>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => <button key={t} className={`kmc-btn${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Job orders' && <JobsTab jobData={jobData} />}
      {tab === 'Tracker' && <JobTracker catalog={catalog} jobData={jobData} filter={isOtherJob} />}
      {tab === 'Projects' && <ProjectsTab jobData={jobData} />}
      {tab === 'Cut lists' && (msProjects.length
        ? <CutListsTab key={msProjects.length} jobData={jobData} choices={msProjects.map(p => ({ key: cutListKey(p.id), label: `${p.id} · ${p.name}` }))} canEdit={manage.includes(MACHINE_SHOP_LINE)} />
        : <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>Add a project for the Machine Shop under Projects first.</div>)}
      {tab === 'Legacy' && <LegacyJobRuns catalog={catalog} currentUserName={currentUserName} onExit={() => setTab(TABS[0])} />}
    </div>
  );
}
