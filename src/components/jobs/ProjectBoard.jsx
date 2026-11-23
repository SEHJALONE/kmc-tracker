import { useMemo, useState } from 'react';
import { JO_LINES, LINE_TINT } from '../../data/jobOrders';
import { projectTrack, PROJECT_STATES } from '../../data/projectProcess';

// Picture cards for other projects (like the home page's), and the project
// tracker: each project moving through its lines and stations the way a bus
// moves along the Bus Tracker, from the runs on its job orders.

const when = iso => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
const STATION_TINT = { running: '#10b981', done: '#2563eb', waiting: 'var(--border)' };

// One project as a picture card. `track` (optional) adds where it is now.
export function ProjectCard({ proc, track, onClick, actions = null, width = 300, height = 188 }) {
  const tint = LINE_TINT[proc.lines?.[0]?.line] || '#334155';
  const picture = proc.image ? `url('${proc.image}'), ` : '';
  const [label] = track ? PROJECT_STATES[track.state] : [''];
  const where = track?.at ? `${track.at.code}${track.at.name ? ` ${track.at.name}` : ''}` : '';
  return (
    <div style={{ display: 'grid', gap: 6, width }}>
      <button type="button" className="kmc-home-card" onClick={onClick} aria-label={`${proc.id} ${proc.name}`}
        style={{ width, height, backgroundImage: `${picture}linear-gradient(135deg, ${tint} 0%, #101623 100%)`,
          backgroundSize: proc.image ? 'contain, cover' : 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center 30%, center' }}>
        {track && <span className="tag">{label}</span>}
        <span className="shade" style={{ padding: '14px 16px' }}>
          <span className="name" style={{ fontSize: 17 }}>{proc.id} · {proc.name}</span>
          <span className="what">
            {track ? `${track.done} of ${track.total} stations done${where ? ` · at ${where}` : ''}`
              : (proc.lines || []).map(l => `${l.line} (${l.stations.length})`).join(' then ') || 'No lines yet'}
          </span>
        </span>
      </button>
      {actions}
    </div>
  );
}

// The stations of one line as a track, with the project's marker on the
// station it is at.
function StationTrack({ line, at }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '4px 0 2px' }}>
      {line.stations.map((s, i) => {
        const here = at && at.line === line.line && at.code === s.code;
        return (
          <div key={s.code} style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
            {i > 0 && <div style={{ width: 22, height: 3, background: s.state === 'waiting' ? 'var(--border)' : STATION_TINT.done }} />}
            <div title={`${s.code} ${s.name}${s.lastAt ? ` · last run ${when(s.lastAt)}` : ''}`}
              style={{ display: 'grid', justifyItems: 'center', gap: 3, minWidth: 74, padding: '6px 8px', borderRadius: 10,
                border: `1.5px solid ${here ? '#f59e0b' : STATION_TINT[s.state]}`,
                background: s.state === 'running' ? 'rgba(16,185,129,0.14)' : s.state === 'done' ? 'rgba(37,99,235,0.12)' : 'transparent' }}>
              <strong style={{ fontSize: 12 }}>{s.code}</strong>
              <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', maxWidth: 110, textAlign: 'center', lineHeight: 1.2 }}>{s.name || '-'}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: s.state === 'waiting' ? 'var(--text-muted)' : STATION_TINT[s.state] }}>
                {s.state === 'running' ? `Working (${s.open.length})` : s.state === 'done' ? 'Done' : 'Waiting'}
              </span>
              {here && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#f59e0b' }}>HERE</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Board by line (Bus Tracker style): each line's stations as columns, with the
// projects that are at each station now.
function LineBoard({ tracks }) {
  const board = JO_LINES.map(line => {
    const cols = [];
    for (const t of tracks) for (const l of t.lines) if (l.line === line) for (const s of l.stations) {
      if (!cols.some(c => c.code === s.code)) cols.push({ code: s.code, name: s.name, items: [] });
    }
    for (const t of tracks) if (t.at?.line === line && t.state !== 'done') cols.find(c => c.code === t.at.code)?.items.push(t);
    return { line, cols };
  }).filter(b => b.cols.length);
  if (!board.length) return null;
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {board.map(b => (
        <div key={b.line} className="kmc-panel" style={{ padding: '10px 12px', borderTop: `3px solid ${LINE_TINT[b.line]}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: LINE_TINT[b.line], marginBottom: 8 }}>{b.line}</div>
          <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(120px, 1fr)', gap: 8, overflowX: 'auto' }}>
            {b.cols.map(c => (
              <div key={c.code} style={{ display: 'grid', alignContent: 'start', gap: 6, minHeight: 90, padding: 6, borderRadius: 10, background: 'var(--input-bg)' }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{c.code}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.2 }}>{c.name}</div>
                {c.items.map(t => (
                  <div key={t.id} title={`${t.id} · ${PROJECT_STATES[t.state][0]}`}
                    style={{ display: 'grid', justifyItems: 'center', gap: 2, padding: 4, borderRadius: 8, border: `1.5px solid ${PROJECT_STATES[t.state][1]}`, background: 'rgba(0,0,0,0.15)' }}>
                    {t.image ? <img src={t.image} alt="" style={{ width: '100%', height: 40, objectFit: 'contain' }} /> : null}
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{t.id}</span>
                    <span style={{ fontSize: 9, color: PROJECT_STATES[t.state][1], fontWeight: 700 }}>{t.state === 'running' ? 'WORKING' : 'WAITING NEXT'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// processes: normalized projectProcesses; register: the job-order register
// (retired projects are left out).
export default function ProjectTracker({ processes, register = [], jobData }) {
  const [showDone, setShowDone] = useState(false);
  const retired = new Set(register.filter(p => p.active === false).map(p => p.id));
  const tracks = useMemo(() => Object.values(processes || {}).filter(p => !retired.has(p.id))
    .map(p => ({ ...projectTrack(p, jobData.jobOrders, jobData.runs), proc: p, image: p.image })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [processes, jobData.jobOrders, jobData.runs, register]);
  const order = { running: 0, between: 1, waiting: 2, done: 3 };
  const shown = tracks.filter(t => showDone || t.state !== 'done').sort((a, b) => order[a.state] - order[b.state] || a.id.localeCompare(b.id));

  if (!tracks.length) return (
    <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
      No project has its lines and stations set up yet. An admin sets them up under Projects.
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {['running', 'between', 'waiting', 'done'].map(s => (
          <span key={s} className="kmc-chip"><span>{PROJECT_STATES[s][0]}</span><b style={{ background: PROJECT_STATES[s][1] }}>{tracks.filter(t => t.state === s).length}</b></span>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show done projects
        </label>
      </div>
      <LineBoard tracks={shown} />
      {shown.map(t => {
        const [label, color] = PROJECT_STATES[t.state];
        return (
          <div key={t.id} className="kmc-panel" style={{ padding: '12px 16px', borderLeft: `4px solid ${color}`, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {t.image && <img src={t.image} alt={`${t.id} picture`} style={{ width: 72, height: 44, objectFit: 'contain', borderRadius: 6, background: 'rgba(0,0,0,0.2)' }} />}
              <strong style={{ color: 'var(--accent-text)' }}>{t.id}</strong>
              <span style={{ fontSize: 13 }}>{t.proc.name}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color }}>{label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="kmc-track" style={{ flex: 1, height: 10 }}>
                <div className="kmc-fill" style={{ width: `${t.pct}%`, height: '100%', background: color, transition: 'width .4s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 130, textAlign: 'right' }}>{t.done} / {t.total} stations done</span>
            </div>
            {t.lines.map(l => (
              <div key={l.line} style={{ display: 'grid', gap: 2, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: LINE_TINT[l.line] }}>
                  {l.line} · {l.jobs.length} job order{l.jobs.length === 1 ? '' : 's'}
                </div>
                <StationTrack line={l} at={t.at} />
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t.runs.length ? `${t.runs.length} run${t.runs.length === 1 ? '' : 's'} · last activity ${when(t.lastAt)}` : 'No runs yet.'}
              {t.elsewhere.length > 0 && ` · also worked at ${[...new Set(t.elsewhere.map(r => r.stationCode))].join(', ')} (not in the process)`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
