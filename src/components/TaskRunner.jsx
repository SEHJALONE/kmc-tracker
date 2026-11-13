import { useEffect, useMemo, useState } from 'react';
import { sameStationCode } from '../data/stations';
import { resolveTcCatalog, BUS_MODELS, modelKindOf, codeOf } from '../utils/tcCatalog';
import { stationLabelForModel } from '../data/travelCardSeed';
import { fetchStationTimes } from '../hooks/useStationTimes';
import { workingMinutes, addWorkingMinutes } from '../utils/workTime';
import { isMachineShopLine } from '../data/jobOrders';
import { MachineShopJobsLive } from './jobs/MachineShopJobs';

// Start/End Travel Card: pick the bus and station, press Start, tick activities
// off as they are done, press Close. Closing opens the normal card with the
// start/end times and ticked activities already filled in (see TravelCardHub).

const R = '#dc2626', GR = '#10b981', AM = '#f59e0b';
const fm = "'Inter', system-ui, sans-serif";
const card = {
  background: 'var(--panel-bg)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: '18px 20px',
  boxShadow: 'var(--panel-shadow)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
};
const hd = { fontFamily: 'var(--font-label)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12 };
const lbl = { display: 'block', fontFamily: 'var(--font-label)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 };
const inp = {
  width: '100%', fontSize: 14, padding: '10px 12px', border: '1px solid var(--input-border)', borderRadius: 10,
  background: 'var(--input-bg)', color: 'var(--input-color, var(--text-primary))', outline: 'none', boxSizing: 'border-box', fontFamily: fm,
};
const btn = {
  background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: 6,
  padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fm, whiteSpace: 'nowrap',
};

const LS_GET = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
}
export const fmtTime = iso => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = iso => (iso ? new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

// Expected end = start + designed WORKING minutes (breaks, nights and Sundays
// skipped, same rules as the card's actual time). No designed time: 8 hours.
export function expectedEndFor(startedAt, designedMin) {
  const start = new Date(startedAt);
  const end = designedMin > 0 ? addWorkingMinutes(start, designedMin) : null;
  return (end || new Date(start.getTime() + 8 * 3600000)).toISOString();
}

// ── Setup: choose the job, then Start ─────────────────────────────────────────
// Order: project, bus model, line, station, then VIN. Machine Shop work runs
// from job orders instead (MachineShopJobs).
export function TaskSetup({ catalog, lockedCodes = [], openTasks = [], onStart, onCancel }) {
  const tc = useMemo(() => resolveTcCatalog(catalog), [catalog]);
  const localProjects = LS_GET('kmc_projects', {});
  const projectNames = [...new Set([
    ...Object.keys(localProjects),
    ...(catalog.projects || []).filter(p => p && p.name && p.active !== false).map(p => p.name),
  ])].sort();

  const [project, setProject] = useState('');
  const [busModel, setBusModel] = useState('');
  const [vin, setVin] = useState('');
  const [line, setLine] = useState('');
  const [station, setStation] = useState('');
  const [designed, setDesigned] = useState('');
  const [times, setTimes] = useState(null);

  useEffect(() => { fetchStationTimes().then(setTimes).catch(() => setTimes(null)); }, []);

  const kind = modelKindOf(busModel);
  const vinOptions = [...new Set([
    // VINs uploaded without a bus model show for every model.
    ...((catalog.projectVins || {})[project] || []).filter(v => v && v.vin && (!busModel || !v.model || v.model === busModel)).map(v => v.vin),
    ...((localProjects[project] && localProjects[project].vins) || []),
  ])];

  // Station-assigned users only see their own stations (and the line follows).
  const lockedOptions = useMemo(() => {
    if (!lockedCodes.length || !busModel) return [];
    const out = [];
    for (const code of lockedCodes) {
      let found = null;
      for (const ln of tc.visibleLines(busModel)) {
        const s = tc.stationsFor(ln, busModel).find(x => sameStationCode(codeOf(x), code));
        if (s) { found = { line: ln, station: s }; break; }
      }
      if (found) out.push(found);
    }
    return out;
  }, [lockedCodes.join('|'), busModel, tc]);

  const stationOptions = lockedCodes.length ? lockedOptions.map(o => o.station) : (line ? tc.stationsFor(line, busModel) : []);
  // Assigned stations that this bus model does not use (e.g. U-hoop stations on an EVS).
  const notOnModel = lockedCodes.length && busModel
    ? lockedCodes.filter(c => !lockedOptions.some(o => sameStationCode(codeOf(o.station), c)))
    : [];
  const code = codeOf(station);
  const acts = tc.actsFor(code, busModel);
  // Machine Shop: job orders instead of station + VIN. Station-assigned users
  // with Machine Shop stations open it with a button (they have no line pick).
  const [jobMode, setJobMode] = useState(false);
  const lockedMachineShop = lockedOptions.some(o => isMachineShopLine(o.line));
  const machineShop = !!project && !!busModel && (lockedCodes.length ? jobMode : isMachineShopLine(line));

  function pickStation(s) {
    setStation(s);
    if (lockedCodes.length) setLine(lockedOptions.find(o => o.station === s)?.line || '');
    const c = codeOf(s);
    const mins = times ? (times.getMinutes(`${kind}:${c}`) ?? times.getMinutes(c)) : null;
    setDesigned(mins ? String(mins) : '');
  }

  function start() {
    if (!project) return alert('Select a bus project.');
    if (!busModel) return alert('Select a bus model.');
    if (!station) return alert('Select a station.');
    if (!vin.trim()) return alert('Select or type the bus VIN.');
    const startedAt = new Date().toISOString();
    const designedMin = Number(designed) || 0;
    onStart({
      project, busModel, vin: vin.trim(), line, station, stationCode: code, designedMin,
      startedAt, expectedEnd: expectedEndFor(startedAt, designedMin),
      activities: acts.map(name => ({ name, doneAt: '' })),
    });
  }

  return (
    <div style={{ ...card, maxWidth: machineShop ? 1100 : 720, margin: '0 auto' }}>
      <div style={hd}>New task — what are you starting?</div>
      <div className="tr-grid">
        <div>
          <label style={lbl}>Bus project</label>
          <select style={inp} value={project} onChange={e => { setProject(e.target.value); setVin(''); }}>
            <option value="">Select project…</option>
            {projectNames.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Bus model</label>
          <select style={inp} value={busModel} onChange={e => { setBusModel(e.target.value); setLine(''); setStation(''); setVin(''); setJobMode(false); }}>
            <option value="">Select model…</option>
            {BUS_MODELS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        {!lockedCodes.length && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Production line</label>
            <select style={inp} value={line} disabled={!busModel} onChange={e => { setLine(e.target.value); setStation(''); }}>
              <option value="">{busModel ? 'Select line…' : 'Pick a model first'}</option>
              {tc.visibleLines(busModel).map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        )}
        {lockedMachineShop && project && (
          <div style={{ gridColumn: '1 / -1' }}>
            <button className={`kmc-btn${jobMode ? ' primary' : ''}`} onClick={() => setJobMode(m => !m)}>
              {jobMode ? '← Back to station pick' : 'Machine Shop job orders →'}
            </button>
          </div>
        )}
        {!machineShop && (
          <>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>{lockedCodes.length ? 'Station (assigned to you)' : 'Station'}</label>
              <select style={inp} value={station} disabled={!busModel || (!lockedCodes.length && !line)} onChange={e => pickStation(e.target.value)}>
                <option value="">Select station…</option>
                {stationOptions.map(s => <option key={s} value={s}>{stationLabelForModel(s, kind)}</option>)}
              </select>
              {notOnModel.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Not used on a {busModel}: {notOnModel.join(', ')}. Pick another model to see {notOnModel.length === 1 ? 'it' : 'them'}.
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Bus VIN</label>
              <input style={{ ...inp, fontFamily: 'monospace' }} list="tr-vins" value={vin} disabled={!station} onChange={e => setVin(e.target.value.toUpperCase())} placeholder={station ? 'Select or type…' : 'Pick the station first'} />
              <datalist id="tr-vins">{vinOptions.map(v => <option key={v} value={v} />)}</datalist>
            </div>
            <div>
              <label style={lbl}>Designed time (min)</label>
              <input style={inp} type="number" min="0" value={designed} onChange={e => setDesigned(e.target.value)} placeholder={station ? 'Not set — enter' : '—'} />
            </div>
          </>
        )}
      </div>
      {machineShop && (
        <div style={{ marginTop: 16 }}>
          <MachineShopJobsLive catalog={catalog} project={project} busModel={busModel} openTasks={openTasks}
            lockedCodes={lockedCodes} onStart={fields => onStart({ ...fields, expectedEnd: expectedEndFor(fields.startedAt, fields.designedMin) })} />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}><button className="kmc-btn ghost" onClick={onCancel}>Cancel</button></div>
        </div>
      )}
      {station && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          {acts.length} activit{acts.length === 1 ? 'y' : 'ies'} to tick off at {code}.
          {Number(designed) > 0 && <> Expected to finish around <strong>{fmtDay(expectedEndFor(new Date().toISOString(), Number(designed)))}</strong> if you start now.</>}
        </div>
      )}
      {!machineShop && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 22 }}>
        <button className={`kmc-orb${station ? ' live' : ''}`} style={{ '--orb': '178px' }} onClick={start} aria-label="Start the task">
          <span className="face" style={{ background: 'linear-gradient(150deg, #8ff5b0, #20c464 45%, #0f8a52)' }}>
            <svg className="orb-icon" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" /></svg>
            <span className="orb-text">START</span>
          </span>
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{station && vin ? 'The clock starts the moment you press it.' : 'Choose the line, station and VIN first.'}</span>
        <button className="kmc-btn ghost" onClick={onCancel}>Cancel</button>
      </div>}
    </div>
  );
}

// ── The clock ─────────────────────────────────────────────────────────────────
// Concentric rings (benchmark: the target graphic). Outer ring = working time
// against the designed time, with a glowing head; it turns amber near the end
// and red once over. Inner ring = activities ticked. A ripple leaves the dial
// every second and a comet orbits once a minute.
function TaskClock({ task, now }) {
  const started = new Date(task.startedAt).getTime();
  const elapsed = now - started;
  const work = workingMinutes(new Date(started), new Date(now)).net;
  const designed = task.designedMin || 0;
  const frac = designed ? work / designed : (elapsed % 3600000) / 3600000;
  const over = designed > 0 && work > designed;
  const tone = over ? ['#ff8a7a', '#dc2626'] : designed && frac > 0.85 ? ['#ffd42a', '#ff8400'] : ['#d6f53b', '#20c464'];
  const acts = task.activities || [];
  const doneFrac = acts.length ? acts.filter(a => a.doneAt).length / acts.length : 0;
  const R1 = 92, R2 = 70, C1 = 2 * Math.PI * R1, C2 = 2 * Math.PI * R2;
  const f1 = Math.min(1, frac);
  const ang = f1 * 2 * Math.PI - Math.PI / 2;
  const headX = 110 + R1 * Math.cos(ang), headY = 110 + R1 * Math.sin(ang);
  const sec = Math.floor(now / 1000) % 60;
  const [hh, mm, ss] = fmtClock(elapsed).split(':');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox="0 0 220 220" width="250" height="250" role="img" aria-label={`Elapsed ${fmtClock(elapsed)}, ${work} minutes worked`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="tc-g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={tone[0]} /><stop offset="1" stopColor={tone[1]} /></linearGradient>
          <linearGradient id="tc-g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb4c9" /><stop offset="1" stopColor="#e14fd6" /></linearGradient>
          <radialGradient id="tc-face" cx="50%" cy="38%" r="65%"><stop offset="0" stopColor="var(--panel-solid)" /><stop offset="1" stopColor="var(--socket-bg)" /></radialGradient>
          <filter id="tc-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {/* one ripple per second, restarted by the key */}
        <circle key={sec} className="tr-ripple" cx="110" cy="110" r="100" fill="none" stroke={tone[1]} strokeWidth="2" />
        {/* sockets */}
        <circle cx="110" cy="110" r={R1} fill="none" stroke="var(--socket-bg)" strokeWidth="18" />
        <circle cx="110" cy="110" r={R2} fill="none" stroke="var(--socket-bg)" strokeWidth="11" />
        <circle cx="110" cy="110" r="60" fill="url(#tc-face)" />
        {/* outer: time */}
        <circle cx="110" cy="110" r={R1} fill="none" stroke="url(#tc-g1)" strokeWidth="13" strokeLinecap="round" filter="url(#tc-glow)"
          strokeDasharray={`${f1 * C1} ${C1}`} transform="rotate(-90 110 110)" style={{ transition: 'stroke-dasharray 1s linear' }} />
        {over && <circle cx="110" cy="110" r={R1} fill="none" stroke="#dc2626" strokeWidth="13" strokeLinecap="round" opacity="0.4"
          strokeDasharray={`${Math.min(1, frac - 1) * C1} ${C1}`} transform="rotate(-90 110 110)" />}
        {f1 > 0.01 && <circle className="tr-head" cx={headX} cy={headY} r="7.5" fill="#fff" stroke={tone[1]} strokeWidth="3" filter="url(#tc-glow)" />}
        {/* inner: activities */}
        <circle cx="110" cy="110" r={R2} fill="none" stroke="url(#tc-g2)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${doneFrac * C2} ${C2}`} transform="rotate(-90 110 110)" style={{ transition: 'stroke-dasharray .6s ease' }} />
        {/* minute ticks */}
        {[...Array(60)].map((_, i) => (
          <line key={i} x1="110" y1="45" x2="110" y2={i % 5 ? 47.5 : 50} stroke={i === sec ? tone[1] : 'var(--text-dim)'}
            strokeWidth={i === sec ? 2.4 : i % 5 ? 0.8 : 1.6} strokeLinecap="round" transform={`rotate(${i * 6} 110 110)`} />
        ))}
        {/* comet: one lap per minute */}
        <g className="tr-comet"><circle cx="110" cy="6" r="3.2" fill={tone[0]} filter="url(#tc-glow)" /></g>
        <text x="110" y="114" textAnchor="middle" fontFamily="var(--font-display)" fontSize="40" fill="var(--text-heading)" letterSpacing="1">
          {hh}<tspan opacity={sec % 2 ? 0.35 : 1}>:</tspan>{mm}<tspan fontSize="24" fill={tone[1]} dx="2">{ss}</tspan>
        </text>
        <text x="110" y="134" textAnchor="middle" fontFamily="var(--font-label)" fontWeight="700" fontSize="8.5" fill="var(--text-muted)" letterSpacing="1.2">
          {designed ? `${work} / ${designed} MIN WORKED` : `${work} MIN WORKED`}
        </text>
        {over && <text x="110" y="148" textAnchor="middle" fontFamily="var(--font-label)" fontWeight="800" fontSize="9" fill="#dc2626">+{work - designed} MIN OVER</text>}
      </svg>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
        {task.status === 'closed'
          ? <span className="kmc-label">■ Closed</span>
          : <span className="tr-pulse kmc-label" style={{ color: tone[1] }}>● Running</span>}
        <span className="kmc-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: 'linear-gradient(135deg,#ffb4c9,#e14fd6)' }} />Activities</span>
      </div>
    </div>
  );
}

// ── Running task ──────────────────────────────────────────────────────────────
// readOnly: a supervisor watching someone else's task (no ticking, no buttons).
export function TaskRunning({ task, onUpdate, onClose, onDiscard, onBack, readOnly = false }) {
  const live = useNow(1000);
  // A closed task's clock stops where it was closed.
  const now = task.status === 'closed' && task.closedAt ? new Date(task.closedAt).getTime() : live;
  const [confirming, setConfirming] = useState(null);   // activity name awaiting confirm
  const [newAct, setNewAct] = useState('');
  const acts = task.activities || [];
  const done = acts.filter(a => a.doneAt).length;
  const overdue = task.expectedEnd && now > new Date(task.expectedEnd).getTime();

  // Time taken for a ticked activity: since the previous one was ticked (or the start).
  function takenMin(a) {
    const t = new Date(a.doneAt).getTime();
    const prev = acts.filter(x => x.doneAt && new Date(x.doneAt).getTime() < t).map(x => new Date(x.doneAt).getTime());
    const from = prev.length ? Math.max(...prev) : new Date(task.startedAt).getTime();
    return Math.max(0, Math.round((t - from) / 60000));
  }
  const setActs = next => onUpdate({ activities: next });
  const tick = name => { setActs(acts.map(a => (a.name === name ? { ...a, doneAt: new Date().toISOString() } : a))); setConfirming(null); };
  const untick = name => { if (confirm(`Mark "${name}" as not done?`)) setActs(acts.map(a => (a.name === name ? { ...a, doneAt: '' } : a))); };
  const add = () => {
    const n = newAct.trim();
    if (!n || acts.some(a => a.name === n)) { setNewAct(''); return; }
    setActs([...acts, { name: n, doneAt: '', added: true }]); setNewAct('');
  };

  return (
    <div className="tr-run">
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent-text)', fontSize: 15 }}>{task.stationCode}</span>
          <span style={{ fontSize: 13, color: 'var(--text-heading)', fontWeight: 600 }}>{stationLabelForModel(task.station, modelKindOf(task.busModel)).replace(/^[^:]+:\s*/, '')}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          {task.busModel} · <span style={{ fontFamily: 'monospace' }}>{task.vins?.length > 1 ? task.vins.join(' · ') : task.vin}</span> · {task.project}
          {task.jobOrderId && <> · job order <strong style={{ fontFamily: 'monospace' }}>{task.jobOrderId}</strong></>}
          {task.ownerName && readOnly && <> · run by <strong>{task.ownerName}</strong></>}
        </div>
        <TaskClock task={task} now={now} />
        <div className="tr-facts">
          <div><span>Started</span><strong>{fmtDay(task.startedAt)}</strong></div>
          <div><span>Expected end</span><strong style={{ color: overdue ? R : undefined }}>{fmtDay(task.expectedEnd)}</strong></div>
          <div><span>Designed</span><strong>{task.designedMin ? `${task.designedMin} min` : '—'}</strong></div>
          <div><span>Activities</span><strong>{done} / {acts.length}</strong></div>
        </div>
        {overdue && <div style={{ fontSize: 12, color: R, margin: '10px 0 0', textAlign: 'center' }}>Past the expected end — reminders are emailed every 6 hours until you close it.</div>}
        {task.synced === false && <div style={{ fontSize: 11, color: AM, margin: '8px 0 0', textAlign: 'center' }}>Saved on this device; not yet on the server (reminders start once it syncs).</div>}
        {readOnly
          ? <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}><button className="kmc-btn" onClick={onBack}>← Back</button></div>
          : <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="kmc-btn primary" style={{ fontSize: 14, padding: '13px 28px' }} onClick={onClose}>■ Close &amp; fill card</button>
          <button className="kmc-btn" onClick={onBack}>← Back (keeps running)</button>
          <button className="kmc-btn ghost" onClick={() => { if (confirm('Discard this task? Nothing is filed and the timer is thrown away.')) onDiscard(); }}>Discard</button>
        </div>}
      </div>

      <div style={card}>
        <div style={{ ...hd, display: 'flex', justifyContent: 'space-between' }}><span>Activities</span><span>{done}/{acts.length} done</span></div>
        <div className="kmc-track" style={{ height: 10, marginBottom: 14 }}>
          <div className="kmc-fill" style={{ width: `${acts.length ? (done / acts.length) * 100 : 0}%`, height: '100%', background: 'var(--g-pink)', transition: 'width .4s' }} />
        </div>
        {acts.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No predefined activities for this station — add what you do below.</div>}
        {acts.map(a => (
          <div key={a.name} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0' }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" disabled={readOnly} checked={!!a.doneAt || confirming === a.name} style={{ accentColor: GR, width: 17, height: 17, marginTop: 1, flexShrink: 0 }}
                onChange={e => (a.doneAt ? untick(a.name) : setConfirming(e.target.checked ? a.name : null))} />
              <span style={{ fontSize: 13, lineHeight: 1.4, color: a.doneAt ? 'var(--text-dim)' : 'var(--text-primary)', textDecoration: a.doneAt ? 'line-through' : 'none' }}>
                {a.name}{a.added && <em style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>(added)</em>}
              </span>
            </label>
            {a.doneAt && <div style={{ fontSize: 11, color: GR, margin: '3px 0 0 27px' }}>✓ Done {fmtTime(a.doneAt)} · took {takenMin(a)} min</div>}
            {confirming === a.name && !a.doneAt && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 0 27px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Confirm complete at {fmtTime(new Date(now).toISOString())}?</span>
                <button style={{ ...btn, padding: '4px 10px', borderColor: GR, color: GR }} onClick={() => tick(a.name)}>Confirm</button>
                <button style={{ ...btn, padding: '4px 10px' }} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
        {!readOnly && <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <input style={inp} value={newAct} onChange={e => setNewAct(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Other activity (not in list)…" />
          <button style={btn} onClick={add}>+ Add</button>
        </div>}
      </div>
    </div>
  );
}

export const TASK_RUNNER_CSS = `
  .tr-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .tr-run { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .tr-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
  .tr-facts > div { background: var(--socket-bg); box-shadow: var(--socket-shadow); border-radius: 12px; padding: 9px 12px; }
  .tr-facts span { display: block; font-family: var(--font-label); font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted); }
  .tr-facts strong { font-size: 13px; color: var(--text-heading); }
  @keyframes tr-pulse { 50% { opacity: .35; } }
  .tr-pulse { animation: tr-pulse 1.6s ease-in-out infinite; }
  @keyframes tr-ripple { from { r: 92px; opacity: .55; stroke-width: 3; } to { r: 110px; opacity: 0; stroke-width: .5; } }
  .tr-ripple { animation: tr-ripple 1s ease-out forwards; }
  @keyframes tr-orbit { to { transform: rotate(360deg); } }
  .tr-comet { transform-origin: 110px 110px; animation: tr-orbit 60s linear infinite; }
  @keyframes tr-head { 50% { r: 9.5px; } }
  .tr-head { animation: tr-head 1s ease-in-out infinite; }
  @media (max-width: 760px) { .tr-run { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 520px) { .tr-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (prefers-reduced-motion: reduce) { .tr-pulse, .tr-ripple, .tr-comet, .tr-head { animation: none; } .tr-ripple { opacity: 0; } }
`;
