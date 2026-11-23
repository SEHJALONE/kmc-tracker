import { useMemo, useState } from 'react';
import { JO_LINES, LINE_TINT, mayWorkOtherLines, otherLineChoices, linesToShow, jobLine, jobHeading, jobProgress, stateLabel, JOB_STATES, workLabels, isActivityJob, groupBySpec } from '../../data/jobOrders';
import { lineStations } from '../../utils/machines';
import { normalizeProjectProcesses, processStationsFor } from '../../data/projectProcess';
import { sameStationCode } from '../../data/stations';
import { useJobData } from '../../hooks/useJobData';
import { firstLoad } from '../../data/jobOrders';
import { expectedEndFor } from '../TaskRunner';
import MachineShopJobs from './MachineShopJobs';
import JobComments, { unseenComments } from './JobComments';

// "My job orders" (Travel Card home): the open job orders on the lines this
// person works on, bus and other projects alike, with the supervisors'
// comments on top. Machine Shop people see Machine Shop orders, the welding /
// frame parts people Parts Making, the Paint Shop its own. People without an
// assigned line see every line. Start opens a timed run on the order.

const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };

export function myJobLines(jobData) {
  const mine = [...new Set([...(jobData.scope || []), ...(jobData.manageLines || [])])];
  return mine.length ? JO_LINES.filter(l => mine.includes(l)) : JO_LINES;
}

const LineTag = ({ line }) => (
  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff', background: LINE_TINT[line] || '#64748b', borderRadius: 999, padding: '3px 9px' }}>{line}</span>
);

// Start a timed run on a Paint Shop / Parts Making order: choose the station,
// the activities still to do become the run's checklist.
export function ActivityJobStart({ catalog, job, jobData, lockedCodes = [], onStart, onBack }) {
  // An other project with its process set up runs on its own stations for this line.
  const all = useMemo(() => {
    const own = processStationsFor(normalizeProjectProcesses(catalog?.projectProcesses), job.projectId, jobLine(job));
    if (own.length) return own.map(s => ({ code: s.code, label: s.name || s.code, station: s.name ? `${s.code}: ${s.name}` : s.code, line: jobLine(job) }));
    return lineStations(catalog, jobLine(job));
  }, [catalog, job]);
  const mineOnly = all.filter(s => lockedCodes.some(c => sameStationCode(c, s.code)));
  const fallback = { code: jobLine(job) === 'Paint Shop' ? 'PAINT' : 'PARTS', label: jobLine(job), station: jobLine(job), line: jobLine(job) };
  const stations = mineOnly.length ? mineOnly : all.length ? all : [fallback];
  const [code, setCode] = useState(stations.length === 1 ? stations[0].code : '');
  const [designed, setDesigned] = useState('');
  const p = jobProgress(job, jobData.runs);
  const labels = workLabels(job);
  const left = labels.filter(l => !p.doneAt[l]);
  const todo = left.length ? left : labels;
  const st = stations.find(s => s.code === code);

  function start() {
    if (!st) return;
    const startedAt = new Date().toISOString();
    const designedMin = Number(designed) || 0;
    onStart({
      project: job.project, busModel: job.busModel || '', vin: job.vins?.[0] || job.projectId || '', vins: job.vins || [],
      line: st.line, station: st.station, stationCode: st.code, designedMin, startedAt, expectedEnd: expectedEndFor(startedAt, designedMin),
      jobOrderId: job.id, activities: todo.map(name => ({ name, doneAt: '', added: true })),
    });
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="kmc-panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <button className="kmc-btn ghost" onClick={onBack}>← Back</button>
          <strong style={{ color: 'var(--accent-text)', fontSize: 15 }}>{job.id}</strong>
          <LineTag line={jobLine(job)} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{jobHeading(job)}</span>
        </div>
        {job.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{job.notes}</div>}
        <JobComments job={job} />
      </div>
      <div className="kmc-panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
          <div>
            <label style={label} htmlFor="ajs-station">{mineOnly.length ? 'Station (assigned to you)' : 'Station'}</label>
            <select id="ajs-station" style={inp} value={code} onChange={e => setCode(e.target.value)}>
              <option value="">Select station…</option>
              {stations.map(s => <option key={s.code} value={s.code}>{s.code} · {s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="ajs-designed">Designed time (min)</label>
            <input id="ajs-designed" style={inp} type="number" min="0" value={designed} onChange={e => setDesigned(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '12px 0 6px' }}>
          {left.length === labels.length ? 'Activities to tick off once the clock runs:' : left.length ? `${labels.length - left.length} of ${labels.length} activities already done on earlier runs. Still to do:` : 'Every activity is ticked on an earlier run. This run lists them all again:'}
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>{todo.map(l => <li key={l}>{l}</li>)}</ol>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button className={`kmc-orb${st ? ' live' : ''}`} style={{ '--orb': '150px' }} onClick={start} disabled={!st} aria-label="Start this job order">
            <span className="face" style={{ background: 'linear-gradient(150deg, #8ff5b0, #20c464 45%, #0f8a52)' }}>
              <svg className="orb-icon" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" /></svg>
              <span className="orb-text">START</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// The signed-in person's role and supplementary roles (set at sign-in).
function storedRoles() {
  try { return { role: localStorage.getItem('kmc_role') || 'user', roles: JSON.parse(localStorage.getItem('kmc_roles') || '[]') }; }
  catch { return { role: 'user', roles: [] }; }
}

export default function MyJobOrders({ catalog, lockedCodes = [], openTasks = [], onStart, onLegacy, canPickLine = null }) {
  const jobData = useJobData();
  const [pick, setPick] = useState('');
  const own = myJobLines(jobData);
  // Defaults to their own lines; they may pick another line to work on.
  const [otherLine, setOtherLine] = useState('');
  const allowed = canPickLine ?? (({ role, roles }) => mayWorkOtherLines(role, roles))(storedRoles());
  const choices = allowed ? otherLineChoices(own) : [];
  const lines = linesToShow(own, otherLine);
  const [filter, setFilter] = useState('');
  const job = pick ? jobData.jobOrders.find(j => j.id === pick) : null;
  // On another line their own stations do not apply: any station of that line may be chosen.
  const locks = job && !own.includes(jobLine(job)) ? [] : lockedCodes;

  if (pick && (!job || !isActivityJob(job))) return (
    <MachineShopJobs catalog={catalog} jobData={jobData} project={job?.project || ''} busModel={job?.busModel || ''} openTasks={openTasks}
      lockedCodes={locks} initialJobId={pick} onBack={() => setPick('')}
      onStart={f => onStart({ ...f, expectedEnd: expectedEndFor(f.startedAt, f.designedMin) })} />
  );
  if (job) return <ActivityJobStart catalog={catalog} job={job} jobData={jobData} lockedCodes={locks} onStart={onStart} onBack={() => setPick('')} />;

  const list = jobData.jobOrders
    .filter(j => j.status === 'open' && lines.includes(jobLine(j)) && (!filter || jobLine(j) === filter))
    .sort((a, b) => (unseenComments(b) > 0) - (unseenComments(a) > 0) || String(a.dueDate || '9').localeCompare(String(b.dueDate || '9')) || String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="kmc-panel" style={{ padding: '14px 16px' }}>
        <div className="kmc-label" style={{ color: 'var(--accent-text)' }}>Job orders</div>
        <h3 style={{ margin: '2px 0 4px', fontSize: 20, color: 'var(--text-heading)' }}>Pending job orders for you</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Open job orders on {lines.join(', ')}: bus job orders and other projects. Press Start on one to run its clock; read your supervisor's comments first.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          {otherLine && <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Working on {otherLine}, not your own line</span>}
          {lines.length > 1 && ['', ...lines].map(l => (
            <button key={l || 'all'} className={`kmc-btn${filter === l ? ' primary' : ''}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setFilter(l)}>{l || 'All lines'}</button>
          ))}
          <span style={{ flex: 1 }} />
          {choices.length > 0 && (
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
              Work on another line
              <select aria-label="Work on another line" value={otherLine} onChange={e => { setOtherLine(e.target.value); setFilter(''); }}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12 }}>
                <option value="">My line{own.length === 1 ? '' : 's'} ({own.join(', ')})</option>
                {choices.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
          {onLegacy && <button className="kmc-btn" onClick={() => onLegacy(filter || lines[0])}>Fill an old job (legacy)</button>}
          <button className="kmc-btn ghost" onClick={jobData.refresh}>↻ Refresh</button>
        </div>
      </div>
      {jobData.error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>{jobData.error}</div>}
      {firstLoad(jobData) && !list.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading job orders…</div>}
      {!firstLoad(jobData) && !list.length && (
        <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>No open job orders for {filter || lines.join(', ')}.</div>
      )}
      {list.map(j => {
        const p = jobProgress(j, jobData.runs);
        const [, color] = JOB_STATES[p.state] || ['', '#64748b'];
        const fresh = unseenComments(j);
        const mineRunning = openTasks.filter(t => t.jobOrderId === j.id).length;
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        const overdue = j.dueDate && j.dueDate < new Date().toISOString().slice(0, 10);
        return (
          <div key={j.id} className="kmc-panel" style={{ padding: '12px 16px', borderLeft: `4px solid ${LINE_TINT[jobLine(j)] || color}` }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--accent-text)' }}>{j.id}</strong>
              <LineTag line={jobLine(j)} />
              <span style={{ fontSize: 13 }}>{jobHeading(j)}</span>
              {j.kind !== 'other' && <span className="kmc-label">Bus</span>}
              {fresh > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#dc2626', borderRadius: 999, padding: '2px 8px' }}>{fresh} NEW COMMENT{fresh === 1 ? '' : 'S'}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{stateLabel(j, p.state)}</span>
              <button className="kmc-btn primary" onClick={() => setPick(j.id)}>Start</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {isActivityJob(j)
                ? `${p.total} activit${p.total === 1 ? 'y' : 'ies'}`
                : `${p.total} part${p.total === 1 ? '' : 's'} to cut in ${groupBySpec(j.items.filter(it => it.cut)).length} specifications${j.vins.length ? ` · ${j.vins.length} VIN${j.vins.length === 1 ? '' : 's'}` : ''}`}
              {j.dueDate && <span style={{ color: overdue ? '#dc2626' : undefined }}> · due {j.dueDate}</span>}
              {mineRunning > 0 && <> · <strong style={{ color: '#10b981' }}>you have {mineRunning} running</strong></>}
              {' '}· set up by {j.createdByName || j.createdBy}
            </div>
            {p.total > 0 && p.runs.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div className="kmc-track" style={{ flex: 1, height: 8 }}><div className="kmc-fill" style={{ width: `${pct}%`, height: '100%', background: color }} /></div>
                <span style={{ fontSize: 11, minWidth: 70, textAlign: 'right' }}>{p.done} / {p.total} done</span>
              </div>
            )}
            {j.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{j.notes}</div>}
            <JobComments job={j} limit={2} markSeen={false} />
          </div>
        );
      })}
    </div>
  );
}

