import { useMemo, useState } from 'react';
import { MACHINE_SHOP_LINE, jobLine, jobHeading, workLabels, jobProgress } from '../../data/jobOrders';
import { lineStations } from '../../utils/machines';
import { newTaskId } from '../../hooks/useTravelTasks';
import { useJobData, JOB_ERRORS } from '../../hooks/useJobData';
import JobOrderSetup from './JobOrderSetup';
import OtherJobSetup from './OtherJobSetup';
import { myJobLines } from './MyJobOrders';

// Legacy job orders: work done before it was recorded here.
//   1  the line, then an existing job order, or a new legacy one (bus or other
//      project; Machine Shop from a saved cut list or a CSV uploaded here)
//   2  its runs: station or machine, who ran it, start and end, what was done
// Each run is filed as a closed Start/End task on the job order (source
// "legacy"), so the tracker and reports count it.

const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };

const blankRun = (operator = '') => ({ key: newTaskId(), code: '', operators: operator, start: '', end: '', done: {}, designed: '' });
const toIso = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };

export function RunsForm({ catalog, job, jobData, currentUserName = '', onSaved, onBack }) {
  const stations = useMemo(() => lineStations(catalog, jobLine(job)), [catalog, job]);
  const labels = workLabels(job);
  const p = jobProgress(job, jobData.runs);
  const [runs, setRuns] = useState([blankRun(currentUserName)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setRun = (key, patch) => setRuns(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const word = jobLine(job) === MACHINE_SHOP_LINE ? 'Machine' : 'Station';

  async function save() {
    setError('');
    for (const [i, r] of runs.entries()) {
      const s = toIso(r.start), e = toIso(r.end);
      if (!r.code) return setError(`Run ${i + 1}: choose the ${word.toLowerCase()}.`);
      if (!s || !e) return setError(`Run ${i + 1}: fill in when it started and ended.`);
      if (e <= s) return setError(`Run ${i + 1}: the end must be after the start.`);
      if (e > new Date().toISOString()) return setError(`Run ${i + 1}: the end is in the future. Use Start/End for work happening now.`);
    }
    setBusy(true);
    try {
      for (const r of runs) {
        const st = stations.find(x => x.code === r.code) || { code: r.code, station: r.code, line: jobLine(job) };
        const startedAt = toIso(r.start), closedAt = toIso(r.end);
        await jobData.saveLegacyRun({
          id: newTaskId(), startedAt, closedAt, expectedEnd: closedAt,
          project: job.project, busModel: job.busModel || '', vin: job.vins?.[0] || job.projectId || '', vins: job.vins || [],
          line: st.line, station: st.station, stationCode: st.code, designedMin: Number(r.designed) || 0, jobOrderId: job.id,
          activities: labels.map(name => ({ name, doneAt: r.done[name] ? closedAt : '', added: true })),
          note: r.operators.trim() ? `Operators: ${r.operators.trim()}` : '',
        });
      }
      onSaved?.(runs.length);
    } catch (e) { setError(JOB_ERRORS[e.message] || e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="kmc-panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {onBack && <button className="kmc-btn ghost" onClick={onBack}>← Back</button>}
          <strong style={{ color: 'var(--accent-text)', fontSize: 15 }}>{job.id}</strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{jobLine(job)} · {jobHeading(job)}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {p.runs.length ? `${p.runs.length} run${p.runs.length === 1 ? '' : 's'} already filed, ${p.done} of ${p.total} done.` : 'No runs filed yet.'} Add each past run below: one per {word.toLowerCase()} and sitting.
        </div>
      </div>
      {runs.map((r, i) => (
        <div key={r.key} className="kmc-panel" style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="kmc-label">Run {i + 1}</span>
            <span style={{ flex: 1 }} />
            {runs.length > 1 && <button className="kmc-btn ghost" style={{ fontSize: 12 }} onClick={() => setRuns(rs => rs.filter(x => x.key !== r.key))}>Remove run</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={label} htmlFor={`lr-st-${r.key}`}>{word}</label>
              <select id={`lr-st-${r.key}`} style={inp} value={r.code} onChange={e => setRun(r.key, { code: e.target.value })}>
                <option value="">Select…</option>
                {stations.map(s => <option key={s.code} value={s.code}>{s.code} · {s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor={`lr-op-${r.key}`}>Operator(s)</label>
              <input id={`lr-op-${r.key}`} style={inp} value={r.operators} onChange={e => setRun(r.key, { operators: e.target.value })} placeholder="Names, separated by commas" />
            </div>
            <div>
              <label style={label} htmlFor={`lr-s-${r.key}`}>Started</label>
              <input id={`lr-s-${r.key}`} type="datetime-local" style={inp} value={r.start} onChange={e => setRun(r.key, { start: e.target.value, end: r.end || '' })} />
            </div>
            <div>
              <label style={label} htmlFor={`lr-e-${r.key}`}>Ended</label>
              <input id={`lr-e-${r.key}`} type="datetime-local" style={inp} value={r.end} min={r.start || undefined} onChange={e => setRun(r.key, { end: e.target.value })} />
            </div>
            <div>
              <label style={label} htmlFor={`lr-d-${r.key}`}>Designed time (min)</label>
              <input id={`lr-d-${r.key}`} type="number" min="0" style={inp} value={r.designed} onChange={e => setRun(r.key, { designed: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={label}>Done on this run ({labels.filter(l => r.done[l]).length} of {labels.length})</span>
              <span style={{ flex: 1 }} />
              <button className="kmc-btn ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setRun(r.key, { done: labels.every(l => r.done[l]) ? {} : Object.fromEntries(labels.map(l => [l, true])) })}>
                {labels.every(l => r.done[l]) ? 'None' : 'All'}
              </button>
            </div>
            <div style={{ display: 'grid', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
              {labels.map(l => (
                <label key={l} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!r.done[l]} onChange={e => setRun(r.key, { done: { ...r.done, [l]: e.target.checked } })} style={{ accentColor: '#10b981', marginTop: 2 }} />
                  <span style={{ color: p.doneAt[l] ? 'var(--text-dim)' : 'var(--text-primary)' }}>{l}{p.doneAt[l] ? ' (already done on an earlier run)' : ''}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div><button className="kmc-btn ghost" onClick={() => setRuns(rs => [...rs, blankRun(currentUserName)])}>+ Add another run</button></div>
      {error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="kmc-btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save ${runs.length} run${runs.length === 1 ? '' : 's'}`}</button>
      </div>
    </div>
  );
}

export default function LegacyJobRuns({ catalog, defaultLine = '', currentUserName = '', onExit }) {
  const jobData = useJobData();
  const lines = myJobLines(jobData);
  const [line, setLine] = useState(lines.includes(defaultLine) ? defaultLine : '');
  const [step, setStep] = useState('choose');   // choose | new-bus | new-other | runs | saved
  const [jobId, setJobId] = useState('');
  const [saved, setSaved] = useState(0);
  const effLine = line || (lines.length === 1 ? lines[0] : '');
  const job = [...jobData.jobOrders].find(j => j.id === jobId);
  const existing = jobData.jobOrders.filter(j => jobLine(j) === effLine).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  if (step === 'new-bus') return (
    <JobOrderSetup catalog={catalog} jobData={jobData} legacy onCancel={() => setStep('choose')} onSaved={id => { setJobId(id); setStep('runs'); }} />
  );
  if (step === 'new-other') return (
    <OtherJobSetup jobData={jobData} legacy line={effLine} lines={[effLine]} onCancel={() => setStep('choose')} onSaved={id => { setJobId(id); setStep('runs'); }} />
  );
  if (step === 'runs' && job) return (
    <RunsForm catalog={catalog} job={job} jobData={jobData} currentUserName={currentUserName}
      onBack={() => setStep('choose')} onSaved={n => { setSaved(n); setStep('saved'); }} />
  );
  if (step === 'saved') return (
    <div className="kmc-panel" style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>{saved} legacy run{saved === 1 ? '' : 's'} saved on {jobId}.</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="kmc-btn primary" onClick={() => setStep('runs')}>Add more runs to {jobId}</button>
        <button className="kmc-btn" onClick={() => { setJobId(''); setStep('choose'); }}>Another job order</button>
        {onExit && <button className="kmc-btn ghost" onClick={onExit}>Done</button>}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="kmc-panel" style={{ padding: '16px 18px', display: 'grid', gap: 14 }}>
        <div>
          <div className="kmc-label" style={{ color: 'var(--accent-text)' }}>Legacy</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>Fill in old job orders</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
            For work done before it was recorded here. Choose the job order, or set up a legacy one (a cut list from a CSV or a saved list, or the activities), then fill in each run.
          </div>
        </div>
        <div style={{ maxWidth: 320 }}>
          <label style={label} htmlFor="lj-line">Line</label>
          <select id="lj-line" style={inp} value={effLine} onChange={e => { setLine(e.target.value); setJobId(''); }}>
            <option value="">Select line…</option>
            {lines.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        {effLine && (
          <>
            <div>
              <label style={label} htmlFor="lj-job">Existing job order</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select id="lj-job" style={{ ...inp, flex: 1, minWidth: 240 }} value={jobId} onChange={e => setJobId(e.target.value)}>
                  <option value="">{existing.length ? 'Select job order…' : 'No job orders on this line yet'}</option>
                  {existing.map(j => <option key={j.id} value={j.id}>{j.id} · {jobHeading(j)}{j.status !== 'open' ? ` (${j.legacy ? 'legacy' : j.status})` : ''}</option>)}
                </select>
                <button className="kmc-btn primary" disabled={!jobId} onClick={() => setStep('runs')}>Fill in runs</button>
              </div>
            </div>
            <div>
              <div style={label}>Or set up a legacy job order</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {effLine === MACHINE_SHOP_LINE && <button className="kmc-btn" onClick={() => setStep('new-bus')}>Bus job order</button>}
                <button className="kmc-btn" onClick={() => setStep('new-other')}>Other project</button>
              </div>
            </div>
          </>
        )}
      </div>
      {jobData.loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading job orders…</div>}
      {jobData.error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>{jobData.error}</div>}
      {onExit && <div><button className="kmc-btn ghost" onClick={onExit}>Cancel</button></div>}
    </div>
  );
}

