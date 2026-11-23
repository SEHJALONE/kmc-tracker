import { useEffect, useMemo, useState } from 'react';
import { jobProgress, JOB_STATES, partLabel, groupBySpec, jobLine, jobHeading, stateLabel, isActivityJob, workLabels, MACHINE_SHOP_LINE, firstLoad } from '../../data/jobOrders';
import { machineShopMachines } from '../../utils/machines';

// Job tracker: every open job order (and those finished in the last days) with
// what is happening on it now. A job order is "machining now" while any of its
// machine runs is open; the bar counts parts ticked off on any run.

const ORDER = { running: 0, started: 1, waiting: 2, machined: 3, closed: 4 };

function since(iso, now) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} days`;
}
const when = iso => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');

// filter: which job orders (default: the Machine Shop's, bus and other projects).
const machineShopOnly = j => jobLine(j) === MACHINE_SHOP_LINE;
export default function JobTracker({ catalog, jobData, filter = machineShopOnly }) {
  const [now, setNow] = useState(Date.now());
  const [showDone, setShowDone] = useState(false);
  const machines = useMemo(() => machineShopMachines(catalog), [catalog]);
  const nameOf = code => machines.find(m => m.code === code)?.label || '';

  // Fresh data every minute while the tracker is open.
  const { refresh } = jobData;
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); refresh(); }, 60000);
    const c = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [refresh]);

  const rows = jobData.jobOrders.filter(filter).map(j => ({ job: j, p: jobProgress(j, jobData.runs) }))
    .filter(({ job, p }) => showDone || p.state === 'running' || job.status === 'open')
    .sort((a, b) => (ORDER[a.p.state] - ORDER[b.p.state]) || String(b.p.lastAt || b.job.createdAt).localeCompare(String(a.p.lastAt || a.job.createdAt)));
  const count = s => rows.filter(r => r.p.state === s).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {['running', 'started', 'waiting', 'machined'].map(s => (
          <span key={s} className="kmc-chip"><span>{JOB_STATES[s][0]}</span><b style={{ background: JOB_STATES[s][1] }}>{count(s)}</b></span>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show closed
        </label>
        <button className="kmc-btn ghost" onClick={refresh}>↻ Refresh</button>
      </div>
      {firstLoad(jobData) && !rows.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{jobData.error ? 'Could not load the job orders.' : 'Loading…'}</div>}
      {!firstLoad(jobData) && !rows.length && <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>No open job orders.</div>}

      {rows.map(({ job, p }) => {
        const [, color] = JOB_STATES[p.state];
        const label = stateLabel(job, p.state);
        const isActs = isActivityJob(job);
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        const left = isActs ? workLabels(job).filter(l => !p.doneAt[l]).map(l => ({ spec: l, items: [l] })) : groupBySpec(job.items.filter(it => it.cut && !p.doneAt[partLabel(it)]));
        return (
          <div key={job.id} className="kmc-panel" style={{ padding: '14px 16px', borderLeft: `4px solid ${color}` }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--accent-text)' }}>{job.id}</strong>
              <span style={{ fontSize: 13 }}>{jobHeading(job)}</span>
              {job.vins.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{job.vins.length} VIN{job.vins.length === 1 ? '' : 's'}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color }}>{label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <div className="kmc-track" style={{ flex: 1, height: 10 }}>
                <div className="kmc-fill" style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 120, textAlign: 'right' }}>{p.done} / {p.total} {isActs ? 'done' : 'parts cut'}</span>
            </div>

            {p.open.length > 0 && (
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                {p.open.map(r => {
                  const acts = r.activities || [];
                  const d = acts.filter(a => a.doneAt).length;
                  return (
                    <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5 }}>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>●</span>
                      <strong>{r.stationCode}</strong>
                      <span style={{ color: 'var(--text-secondary)' }}>{nameOf(r.stationCode)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{r.ownerName || r.owner} · running {since(r.startedAt, now)} · {d}/{acts.length} ticked</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
              {p.runs.length
                ? <>{isActs ? 'Stations' : 'Machines'} used: {[...new Set(p.runs.map(r => r.stationCode))].join(', ')} · last activity {when(p.lastAt)}</>
                : <>Set up by {job.createdByName || job.createdBy} · {when(job.createdAt)} · waiting {since(job.createdAt, now)}</>}
              {p.state !== 'machined' && left.length > 0 && p.runs.length > 0 && (
                <div>{isActs ? `Still to do: ${left.map(g => g.spec).join(', ')}` : `Still to cut: ${left.map(g => `${g.spec} (${g.items.length})`).join(', ')}`}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
