import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendViaAppsScript } from '../data/mailer';
import { LINES, sameStationCode, stationLineOf, lookupStation } from '../data/stations';
import { TaskRunning, TASK_RUNNER_CSS, fmtClock, fmtTime, useNow } from './TaskRunner';

// Supervisors, managers, directors and admins: who is working where, right now.
// Every open Start/End task in the shops you look after, line by line, each
// shown with its bus model and the person who opened it. Tap one to watch its
// running clock and the activities (or parts) already ticked off. Tasks closed
// in the last 12 hours are listed underneath.
// Server: listShopTasks_ in the Apps Script.

const BUS_IMAGES = {
  '7m EVS': '/7m EVS.png', '8.5m EVS': '/8.5m EVS.png', '10.5m EVS': '/10.5m EVS.png', '12m EVS': '/12m EVS.png',
  '10.5m KDC': '/10.5m KDC.png', '12m KDC': '/12m KDC.png', '13m KEC': '/13m KEC.png',
};
const familyTone = m => (/KDC/i.test(m) ? '#dc2626' : /KEC/i.test(m) ? '#f59e0b' : '#0ea5e9');
const REFRESH_MS = 30000;

// The lines/stations this person watches; null = everything.
export function scopeFor(role, assignedStations, assignedLines) {
  if (role === 'supervisor' && assignedStations?.length) return { stations: assignedStations };
  if (role === 'manager' && assignedLines?.length) return { lines: assignedLines };
  return null;
}
export function inScope(task, scope) {
  if (!scope) return true;
  if (scope.stations) return scope.stations.some(c => sameStationCode(c, task.stationCode));
  return scope.lines.includes(stationLineOf(task.stationCode));
}

function BusBadge({ task, now, onOpen }) {
  const acts = task.activities || [];
  const done = acts.filter(a => a.doneAt).length;
  const tone = familyTone(task.busModel);
  const overdue = task.expectedEnd && now > new Date(task.expectedEnd).getTime();
  return (
    <button onClick={onOpen} className="sf-bus" style={{ '--tone': tone }} title={`${task.busModel} · ${task.vin} · ${task.ownerName || task.owner}`}>
      <div className="sf-bus-img">
        {BUS_IMAGES[task.busModel]
          ? <img src={BUS_IMAGES[task.busModel]} alt={task.busModel} />
          : <svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true"><rect x="2" y="3" width="58" height="18" rx="4" fill={tone} /><rect x="8" y="7" width="40" height="7" rx="1.5" fill="#fff" opacity=".85" /><circle cx="16" cy="23" r="4" fill="#111" /><circle cx="48" cy="23" r="4" fill="#111" /></svg>}
        <span className="sf-live" />
      </div>
      <div className="sf-model" style={{ color: tone }}>{task.busModel}</div>
      <div className="sf-who">{task.ownerName || task.owner}</div>
      <div className="sf-clock" style={{ color: overdue ? '#dc2626' : undefined }}>{fmtClock(now - new Date(task.startedAt).getTime())}</div>
      <div className="sf-vin">{task.vins?.length > 1 ? `${task.vins.length} VINs` : task.vin}{task.jobOrderId ? ` · ${task.jobOrderId}` : ''}</div>
      <div className="kmc-track" style={{ height: 5, marginTop: 5 }}><div className="kmc-fill" style={{ height: '100%', width: `${acts.length ? (done / acts.length) * 100 : 0}%`, background: 'var(--g-lime)' }} /></div>
      <div className="sf-acts">{done}/{acts.length} done</div>
    </button>
  );
}

export default function ShopFloor({ role, assignedStations, assignedLines, onBack }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stamp, setStamp] = useState(null);
  const [all, setAll] = useState(false);
  const [watching, setWatching] = useState(null);
  const now = useNow(1000);
  const scope = useMemo(() => scopeFor(role, assignedStations, assignedLines), [role, assignedStations, assignedLines]);

  const load = useCallback(async () => {
    try { const r = await sendViaAppsScript('listShopTasks', {}); setTasks(r.tasks || []); setError(''); setStamp(new Date()); }
    catch (e) { setError(e.message === 'not-a-supervisor' ? 'This page is for supervisors, managers, directors and admins.' : e.message); }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const shown = tasks.filter(t => all || inScope(t, scope));
  const open = shown.filter(t => t.status === 'open');
  const closed = shown.filter(t => t.status === 'closed').sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
  const watched = watching && tasks.find(t => t.id === watching);

  if (watched) return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 60px', color: 'var(--text-primary)' }}>
      <style>{TASK_RUNNER_CSS}</style>
      <TaskRunning task={watched} readOnly onBack={() => setWatching(null)} onUpdate={() => {}} onClose={() => {}} onDiscard={() => {}} />
    </div>
  );

  // Lines in tracker order, stations by their order on the line.
  const byLine = new Map();
  for (const t of open) {
    const lineId = stationLineOf(t.stationCode) || `?${t.line}`;
    if (!byLine.has(lineId)) byLine.set(lineId, new Map());
    const st = byLine.get(lineId);
    if (!st.has(t.stationCode)) st.set(t.stationCode, []);
    st.get(t.stationCode).push(t);
  }
  const lineOrder = [...LINES.map(l => l.id), ...[...byLine.keys()].filter(k => !LINES.some(l => l.id === k))];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 60px', color: 'var(--text-primary)' }}>
      <style>{`
        .sf-line { padding: 14px 16px; margin-bottom: 14px; }
        .sf-stations { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
        .sf-station { min-width: 170px; background: var(--socket-bg); border-radius: 14px; padding: 10px; }
        .sf-code { font-family: monospace; font-weight: 800; color: var(--accent-text); font-size: 13px; }
        .sf-name { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.3; }
        .sf-bus { display: block; width: 100%; text-align: left; background: var(--panel-bg); border: 1px solid var(--border-subtle); border-left: 4px solid var(--tone);
          border-radius: 12px; padding: 8px 10px; margin-top: 8px; cursor: pointer; color: inherit; font: inherit; }
        .sf-bus:hover { border-color: var(--tone); }
        .sf-bus-img { position: relative; height: 34px; display: flex; align-items: center; }
        .sf-bus-img img { height: 34px; max-width: 100%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
        .sf-live { position: absolute; top: 0; right: 0; width: 9px; height: 9px; border-radius: 50%; background: #20c464; box-shadow: 0 0 0 3px rgba(32,196,100,.25); animation: tr-pulse 1.6s infinite; }
        .sf-model { font-size: 11px; font-weight: 800; letter-spacing: .04em; margin-top: 4px; }
        .sf-who { font-size: 13px; font-weight: 600; color: var(--text-heading); }
        .sf-clock { font-family: var(--font-display); font-size: 20px; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
        .sf-vin, .sf-acts { font-size: 10px; color: var(--text-muted); font-family: monospace; }
        @keyframes tr-pulse { 50% { opacity: .35; } }
      `}</style>
      <button className="kmc-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Home</button>
      <div className="kmc-label" style={{ color: 'var(--accent-text)' }}>Supervision</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 34, letterSpacing: '.04em', margin: '2px 0 6px', color: 'var(--text-heading)' }}>Shop floor</h1>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span><strong style={{ color: 'var(--text-heading)' }}>{open.length}</strong> task{open.length === 1 ? '' : 's'} running{scope && !all ? ' in your shops' : ''}</span>
        {scope && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Show every shop</label>}
        <span style={{ flex: 1 }} />
        {stamp && <span>Updated {fmtTime(stamp.toISOString())} · every 30 s</span>}
        <button className="kmc-btn ghost" onClick={load}>↻ Refresh</button>
      </div>
      {error && <div className="kmc-panel" style={{ padding: '12px 14px', fontSize: 13, color: 'var(--accent-text)', marginBottom: 12 }}>⚠ {error}</div>}
      {loading && !tasks.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && !error && open.length === 0 && (
        <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>Nobody has a task running{scope && !all ? ' at your stations' : ''} right now.</div>
      )}

      {lineOrder.filter(id => byLine.has(id)).map(id => {
        const line = LINES.find(l => l.id === id);
        const stations = [...byLine.get(id).entries()].sort((a, b) => (lookupStation(a[0])?.order ?? 999) - (lookupStation(b[0])?.order ?? 999));
        const count = stations.reduce((n, [, ts]) => n + ts.length, 0);
        return (
          <div key={id} className="kmc-panel sf-line">
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
              <strong style={{ fontSize: 15, color: 'var(--text-heading)' }}>{line?.label || id.replace(/^\?/, '') || 'Other'}</strong>
              <span className="kmc-chip"><span>running</span><b style={{ background: 'var(--g-lime)' }}>{count}</b></span>
            </div>
            <div className="sf-stations">
              {stations.map(([code, ts]) => (
                <div key={code} className="sf-station">
                  <div className="sf-code">{code}</div>
                  <div className="sf-name">{lookupStation(code)?.name || ts[0].station.replace(/^[^:]+:\s*/, '')}</div>
                  {ts.map(t => <BusBadge key={t.id} task={t} now={now} onOpen={() => setWatching(t.id)} />)}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {closed.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="kmc-label" style={{ marginBottom: 8 }}>Closed in the last 12 hours</div>
          {closed.map(t => {
            const acts = t.activities || [];
            return (
              <button key={t.id} onClick={() => setWatching(t.id)} className="kmc-panel"
                style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', padding: '8px 14px', marginBottom: 6, cursor: 'pointer', color: 'inherit', font: 'inherit', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-text)' }}>{t.stationCode}</span>
                <span style={{ fontSize: 12 }}>{t.ownerName || t.owner}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.busModel} · {t.vin}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{acts.filter(a => a.doneAt).length}/{acts.length} done · {fmtTime(t.startedAt)}–{fmtTime(t.closedAt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
