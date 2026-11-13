import { useMemo, useState } from 'react';
import { useTravelTasks } from '../hooks/useTravelTasks';
import { OUTDATED_SCRIPT } from '../data/mailer';
import { useSubmissionsData } from '../hooks/useSubmissionsData';
import { TaskSetup, TaskRunning, TASK_RUNNER_CSS, fmtClock, fmtTime, useNow } from './TaskRunner';
import { StatTile, ColumnChart, RingGauge, Legend, Ribbon, SectionHead, grad } from './ui/Charts';

// What tapping "Travel Card" opens: the two ways to fill a card on top, then the
// person's own numbers and their open (not yet closed) Start/End tasks.
//
//   Start / End  press Start when the work begins; a clock runs and activities
//                are ticked off; Close opens the card with everything filled in.
//                Several tasks can be open at once.
//   Legacy card  the existing form, for cards filled in after the fact.

const PENDING = ['pending_review', 'pending', ''];

const css = `
  .tch { max-width: 1120px; margin: 0 auto; color: var(--text-primary); }
  .tch-hero { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .tch-choice { display: flex; align-items: center; gap: 22px; padding: 22px 24px; }
  .tch-choice h3 { font-family: var(--font-display); font-weight: 400; font-size: 30px; letter-spacing: .05em; color: var(--text-heading); margin: 2px 0 6px; line-height: 1; }
  .tch-choice p { font-size: 13px; line-height: 1.55; color: var(--text-secondary); margin: 0 0 12px; }
  .tch-steps { display: flex; gap: 6px; flex-wrap: wrap; }
  .tch-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
  .tch-graphs { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 14px; margin-top: 20px; }
  .tch-graphs > .kmc-panel { padding: 18px 20px; }
  .tch-sec { margin-top: 24px; }
  .tch-timer { font-family: var(--font-display); font-size: 30px; letter-spacing: .04em; color: var(--text-heading); font-variant-numeric: tabular-nums; line-height: 1; }
  .tch-back { margin-bottom: 16px; }
  .tch-orb-badge { position: absolute; top: 6%; right: 6%; min-width: 34px; height: 34px; padding: 0 8px; border-radius: 999px; background: var(--g-amber);
    color: #fff; font-family: var(--font-display); font-size: 20px; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,.35); border: 3px solid var(--orb-ring); z-index: 2; }
  @media (max-width: 900px) { .tch-hero { grid-template-columns: minmax(0, 1fr); } .tch-graphs { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 760px) { .tch-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 520px) { .tch-choice { flex-direction: column; text-align: center; } .tch-steps { justify-content: center; } .tch-choice .kmc-orb { --orb: 170px !important; } }
  ${TASK_RUNNER_CSS}
`;

function startOfWeek(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

export function dashboardStats(mine, openTasks, now = Date.now()) {
  const week = startOfWeek(new Date(now)).getTime();
  const month = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const thisMonth = mine.filter(s => new Date(s.timestamp).getTime() >= month);
  return {
    total: mine.length,
    thisWeek: mine.filter(s => new Date(s.timestamp).getTime() >= week).length,
    awaiting: mine.filter(s => PENDING.includes(s.approvalStatus || '')).length,
    rework: mine.filter(s => s.approvalStatus === 'rejected').length,
    approved: mine.filter(s => s.approvalStatus === 'approved').length,
    open: openTasks.length,
    overdue: openTasks.filter(t => t.expectedEnd && now > new Date(t.expectedEnd).getTime()).length,
    hoursMonth: Math.round(thisMonth.reduce((n, s) => n + (Number(s.actualTime) || 0), 0) / 6) / 10,
    overDesigned: mine.filter(s => Number(s.designedTime) > 0 && Number(s.actualTime) > Number(s.designedTime)).length,
    buses: new Set(mine.map(s => String(s.vin || '').toUpperCase()).filter(Boolean)).size,
  };
}

// Cards filed per weekday this week (Mon–Sun).
export function weekColumns(mine, now = Date.now()) {
  const start = startOfWeek(new Date(now));
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const counts = days.map(() => 0);
  for (const s of mine) {
    const d = new Date(s.timestamp);
    const i = Math.floor((d - start) / 86400000);
    if (i >= 0 && i < 7) counts[i]++;
  }
  const today = (new Date(now).getDay() + 6) % 7;
  return days.map((label, i) => ({ label, value: counts[i], tone: i === today ? 'red' : ['pink', 'lime', 'amber', 'teal', 'blue', 'pink', 'lime'][i] }));
}

const PlayIcon = () => (<svg className="orb-icon" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" /></svg>);
const CardIcon = () => (
  <svg className="orb-icon" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

function OpenTaskRibbon({ n, task, now, onOpen, onClose }) {
  const elapsed = now - new Date(task.startedAt).getTime();
  const overdue = task.expectedEnd && now > new Date(task.expectedEnd).getTime();
  const acts = task.activities || [];
  const done = acts.filter(a => a.doneAt).length;
  return (
    <Ribbon n={n} tone={overdue ? 'red' : 'amber'} onClick={onOpen}
      side={<><button className="kmc-btn" onClick={onOpen}>Open</button><button className="kmc-btn primary" onClick={onClose}>Close</button></>}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="tch-timer">{fmtClock(elapsed)}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-text)', fontSize: 14 }}>{task.stationCode}</span>
        {task.jobOrderId && <span className="kmc-chip"><span>{task.jobOrderId}</span><b style={{ background: grad('teal') }}>JO</b></span>}
        {overdue && <span className="kmc-chip"><span>past expected end</span><b style={{ background: grad('red') }}>!</b></span>}
        {task.synced === false && <span style={{ fontSize: 11, color: 'var(--warning-color)' }}>saved on this device</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.busModel} · <span style={{ fontFamily: 'monospace' }}>{(task.vins && task.vins.length > 1) ? `${task.vins.length} VINs` : task.vin}</span> · started {fmtTime(task.startedAt)}
      </div>
      <div className="kmc-track" style={{ height: 8, marginTop: 8, maxWidth: 320 }} title={`${done} of ${acts.length} activities`}>
        <div className="kmc-fill" style={{ height: '100%', width: `${acts.length ? (done / acts.length) * 100 : 0}%`, background: grad('lime', 90) }} />
      </div>
    </Ribbon>
  );
}

const STATUS = { pending_review: ['Pending', 'amber'], pending: ['Review', 'amber'], rejected: ['Rework', 'red'], approved: ['Approved', 'lime'] };

export default function TravelCardHub({ username, currentUserName, catalog, lockedCodes = [], initialView = 'home', renderLegacy, onHome = null }) {
  const tasks = useTravelTasks(username);
  const { submissions, loading } = useSubmissionsData();
  const now = useNow(1000);
  // { kind: 'home' | 'legacy' | 'new' | 'task' | 'close', id?, endedAt? }
  const [view, setView] = useState({ kind: initialView });
  const home = () => { if (onHome) onHome(); setView({ kind: 'home' }); window.scrollTo(0, 0); };
  const go = v => { setView(v); window.scrollTo(0, 0); };

  const mine = useMemo(() => (currentUserName ? submissions.filter(s => s.submittedBy === currentUserName) : [])
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [submissions, currentUserName]);
  const stats = dashboardStats(mine, tasks.openTasks, now);
  const week = useMemo(() => weekColumns(mine, now), [mine, Math.floor(now / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const outdated = tasks.syncError === OUTDATED_SCRIPT;
  const current = view.id ? tasks.tasks.find(t => t.id === view.id) : null;

  const back = <button className="kmc-btn tch-back" onClick={home}>← Travel Card home</button>;

  if (view.kind === 'legacy') return <div className="tch"><style>{css}</style>{back}{renderLegacy({ onExit: home })}</div>;

  if (view.kind === 'close' && current) {
    const prefill = { taskId: current.id, ...current, endedAt: view.endedAt };
    return (
      <div className="tch"><style>{css}</style>{back}
        <div className="kmc-panel" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px', padding: '12px 16px', lineHeight: 1.5 }}>
          Closing <strong style={{ color: 'var(--text-heading)' }}>{current.stationCode}</strong> · {current.vin}{current.jobOrderId ? ` (job order ${current.jobOrderId}${current.vins?.length > 1 ? `, ${current.vins.length} VINs — the card is filed under the first and lists them all` : ''})` : ''}. Start ({fmtTime(current.startedAt)}) and end ({fmtTime(view.endedAt)}) times and the ticked activities are filled in — check them and submit. The task stays open until the card is submitted.
        </div>
        {renderLegacy({
          taskPrefill: prefill, onExit: home,
          onCardSubmitted: (_sub, p) => { if (p?.taskId) tasks.close(p.taskId); },
        })}
      </div>
    );
  }

  if (view.kind === 'new') return (
    <div className="tch"><style>{css}</style>{back}
      <TaskSetup catalog={catalog} lockedCodes={lockedCodes} openTasks={tasks.openTasks} onCancel={home}
        onStart={fields => { const t = tasks.start({ ...fields, ownerName: currentUserName || '' }); go({ kind: 'task', id: t.id }); }} />
    </div>
  );

  if (view.kind === 'task' && current && current.status === 'open') return (
    <div className="tch"><style>{css}</style>{back}
      <TaskRunning task={current}
        onUpdate={patch => tasks.update(current.id, patch)}
        onClose={() => go({ kind: 'close', id: current.id, endedAt: new Date().toISOString() })}
        onDiscard={() => { tasks.discard(current.id); home(); }}
        onBack={home} />
    </div>
  );

  // ── Home ──
  const total = Math.max(stats.total, 1);
  return (
    <div className="tch"><style>{css}</style>
      <div className="tch-hero">
        <div className="kmc-panel tch-choice">
          <button className={`kmc-orb${stats.open ? ' live' : ''}`} style={{ '--orb': '196px' }} onClick={() => go({ kind: 'new' })} aria-label="Start a station task">
            {stats.open > 0 && <span className="tch-orb-badge" title={`${stats.open} open`}>{stats.open}</span>}
            <span className="face" style={{ background: grad('red', 150) }}><PlayIcon /><span className="orb-text">START / END</span></span>
          </button>
          <div>
            <div className="kmc-label" style={{ color: 'var(--accent-text)' }}>Live timing</div>
            <h3>Start a station task</h3>
            <p>Press Start when the work begins. A clock runs while you tick activities off, and Close fills the card with your start and end times. Run as many as you need at once.</p>
            <div className="tch-steps">
              <span className="kmc-chip"><b style={{ background: grad('red') }}>1</b><span>Start</span></span>
              <span className="kmc-chip"><b style={{ background: grad('amber') }}>2</b><span>Tick activities</span></span>
              <span className="kmc-chip"><b style={{ background: grad('lime') }}>3</b><span>Close &amp; submit</span></span>
            </div>
          </div>
        </div>
        <div className="kmc-panel tch-choice">
          <button className="kmc-orb" style={{ '--orb': '196px' }} onClick={() => go({ kind: 'legacy' })} aria-label="Fill a legacy travel card">
            <span className="face" style={{ background: grad('teal', 150) }}><CardIcon /><span className="orb-text">LEGACY</span></span>
          </button>
          <div>
            <div className="kmc-label">After the fact</div>
            <h3>Fill a past card</h3>
            <p>The original travel card form, for old or missed cards where you enter the clock-in time yourself.</p>
            <div className="tch-steps">
              <span className="kmc-chip"><span>This week</span><b style={{ background: grad('teal') }}>{stats.thisWeek}</b></span>
              <span className="kmc-chip"><span>All time</span><b style={{ background: grad('blue') }}>{loading && !mine.length ? '…' : stats.total}</b></span>
            </div>
          </div>
        </div>
      </div>

      <div className="tch-stats">
        <StatTile label="Open tasks" value={stats.open} tone={stats.overdue ? 'red' : 'amber'} valueColor={stats.overdue ? 'var(--c-red)' : undefined}
          sub={stats.overdue ? `${stats.overdue} past expected end` : 'started, not yet closed'} />
        <StatTile label="Awaiting approval" value={stats.awaiting} tone="amber" sub={`${stats.approved} approved`} />
        <StatTile label="Rework needed" value={stats.rework} tone="red" valueColor={stats.rework ? 'var(--c-red)' : undefined} sub="edit from My Submissions" />
        <StatTile label="Hours this month" value={stats.hoursMonth} tone="teal" sub="working time on your cards" />
        <StatTile label="Cards filed" value={loading && !mine.length ? '…' : stats.total} tone="blue" sub={`${stats.thisWeek} this week`} />
        <StatTile label="Over designed time" value={stats.overDesigned} tone="pink" sub={`of ${stats.total} cards`} />
        <StatTile label="Buses worked on" value={stats.buses} tone="lime" sub="different VINs" />
        <StatTile label="Reminders" value={tasks.syncError === null ? 'CHECKING' : !tasks.syncError ? 'ON' : outdated ? 'NOT SET UP' : 'OFFLINE'} tone={tasks.syncError ? 'amber' : 'lime'}
          valueColor={tasks.syncError ? 'var(--warning-color)' : undefined}
          sub={tasks.syncError === null ? 'asking the server…' : !tasks.syncError ? 'at expected end, then every 6 h' : outdated ? 'server script needs updating' : 'tasks saved on this device only'} />
      </div>

      <div className="tch-graphs">
        <div className="kmc-panel">
          <SectionHead right={<span className="kmc-chip"><span>this week</span><b style={{ background: grad('red') }}>{stats.thisWeek}</b></span>}>Cards filed by day</SectionHead>
          <ColumnChart data={week} height={130} prefix="tchw" empty="No cards filed this week yet" />
        </div>
        <div className="kmc-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ alignSelf: 'stretch' }}><SectionHead>Approval status</SectionHead></div>
          <RingGauge size={176} prefix="tcha" center={stats.total} centerSub="CARDS" rings={[
            { label: 'Approved', value: stats.approved, max: total, tone: 'lime' },
            { label: 'Awaiting', value: stats.awaiting, max: total, tone: 'amber' },
            { label: 'Rework', value: stats.rework, max: total, tone: 'red' },
          ]} />
          <Legend items={[
            { label: 'Approved', tone: 'lime', value: stats.approved },
            { label: 'Awaiting', tone: 'amber', value: stats.awaiting },
            { label: 'Rework', tone: 'red', value: stats.rework },
          ]} />
        </div>
      </div>

      <div className="tch-sec">
        <SectionHead right={<span className="kmc-label">{tasks.openTasks.length} open</span>}>Open tasks</SectionHead>
        {tasks.openTasks.length === 0 && (
          <div className="kmc-panel" style={{ padding: '16px 18px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Nothing open. Press <strong style={{ color: 'var(--text-heading)' }}>START / END</strong> when you begin work at a station.
          </div>
        )}
        {tasks.openTasks.map((t, i) => (
          <OpenTaskRibbon key={t.id} n={i + 1} task={t} now={now}
            onOpen={() => go({ kind: 'task', id: t.id })}
            onClose={() => go({ kind: 'close', id: t.id, endedAt: new Date().toISOString() })} />
        ))}
      </div>

      <div className="tch-sec">
        <SectionHead>Your recent cards</SectionHead>
        {!currentUserName && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sign in with your own account to see your cards here.</div>}
        {currentUserName && !loading && mine.length === 0 && <div className="kmc-panel" style={{ padding: '16px 18px', fontSize: 13, color: 'var(--text-secondary)' }}>No cards filed yet.</div>}
        {mine.slice(0, 6).map((s, i) => {
          const [label, tone] = STATUS[s.approvalStatus] || ['Pending', 'amber'];
          return (
            <Ribbon key={s.recordId || s.timestamp} n={i + 1} tone="teal"
              side={<span className="kmc-chip"><span>{s.actualTime} min</span><b style={{ background: grad(tone) }}>{label}</b></span>}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-text)' }}>{s.stationCode}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.vin}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                {new Date(s.timestamp).toLocaleDateString()}{Number(s.designedTime) > 0 ? ` · designed ${s.designedTime} min` : ''}
              </div>
            </Ribbon>
          );
        })}
      </div>
    </div>
  );
}
