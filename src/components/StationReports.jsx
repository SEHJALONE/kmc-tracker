import { useMemo, useState } from 'react';
import { useSubmissionsData } from '../hooks/useSubmissionsData';
import { useJobData } from '../hooks/useJobData';
import { StatTile } from './ui/Charts';
import { fmtAmounts } from '../data/jobOrders';
import { buildStationReport, PERIODS, periodStart, LINE_IMAGE, busImage, familyTone, fmtMin } from '../data/stationReport';

// Shop Floor > Station reports. One collapsible panel per line; inside it one
// row per station with its key figures (cards filed, staff, average time per
// card, buses). Opening a station shows a scorecard per bus model and, where
// job orders ran there, what they produced (pieces, metres, steps, waste).

const CSS = `
  .sr-line { margin-bottom: 14px; overflow: hidden; }
  .sr-line-head { position: relative; display: block; width: 100%; border: 0; padding: 0; cursor: pointer; color: #fff; font: inherit; text-align: left;
    background-size: cover; background-position: center; min-height: 92px; }
  .sr-line-head .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(10,13,20,0.93) 0%, rgba(10,13,20,0.80) 55%, rgba(10,13,20,0.6) 100%); }
  .sr-line-head .in { position: relative; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 16px 20px; }
  .sr-line-name { font-size: 16px; font-weight: 800; letter-spacing: .01em; }
  .sr-line-sub { font-size: 11px; color: rgba(255,255,255,.75); margin-top: 3px; }
  .sr-kpis { display: flex; gap: 18px; margin-left: auto; flex-wrap: wrap; }
  .sr-kpi { text-align: right; min-width: 56px; }
  .sr-kpi b { display: block; font-family: var(--font-display); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .sr-kpi span { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; opacity: .72; }
  .sr-chev { font-size: 14px; transition: transform .2s; opacity: .8; }
  .sr-chev.open { transform: rotate(90deg); }
  .sr-body { padding: 8px 10px 10px; }
  .sr-st { border-bottom: 1px solid var(--border-subtle); }
  .sr-st:last-child { border-bottom: 0; }
  .sr-st-head { display: grid; grid-template-columns: minmax(170px, 1.6fr) repeat(4, minmax(64px, .6fr)) minmax(90px, 1fr) 18px; gap: 10px; align-items: center;
    width: 100%; background: transparent; border: 0; padding: 10px 8px; cursor: pointer; color: inherit; font: inherit; text-align: left; border-radius: 10px; }
  .sr-st-head:hover { background: var(--socket-bg); }
  .sr-code { font-weight: 800; color: var(--accent-text); font-size: 13px; }
  .sr-name { font-size: 11.5px; color: var(--text-muted); line-height: 1.3; }
  .sr-num b { display: block; font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--text-heading); font-variant-numeric: tabular-nums; }
  .sr-num span { font-size: 10px; color: var(--text-muted); letter-spacing: .05em; text-transform: uppercase; }
  .sr-thumbs { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
  .sr-thumb { position: relative; width: 54px; height: 32px; display: flex; align-items: center; justify-content: center; }
  .sr-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .sr-thumb i { position: absolute; right: -4px; top: -6px; font-style: normal; font-size: 9px; font-weight: 800; color: #fff; background: var(--tone); border-radius: 999px; padding: 0 5px; line-height: 14px; }
  .sr-detail { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; padding: 4px 8px 16px; }
  .sr-card { background: var(--socket-bg); border-radius: 14px; padding: 12px 14px; border-top: 3px solid var(--tone); }
  .sr-card-img { height: 110px; display: flex; align-items: center; justify-content: center; margin: -4px 0 4px; }
  .sr-card-img img { height: 110px; max-width: 100%; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,.35)); }
  .sr-card-title { font-size: 13px; font-weight: 800; color: var(--tone); letter-spacing: .03em; }
  .sr-card-sub { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
  .sr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
  .sr-list { margin-top: 10px; font-size: 11.5px; }
  .sr-list div { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-top: 1px solid var(--border-subtle); color: var(--text-secondary); }
  .sr-list div b { color: var(--text-heading); font-weight: 600; white-space: nowrap; }
  .sr-list .h { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); border-top: 0; padding-top: 6px; }
  @media (max-width: 760px) {
    .sr-st-head { grid-template-columns: 1fr 1fr 1fr 1fr 18px; }
    .sr-st-head .sr-id { grid-column: 1 / -1; }
    .sr-st-head .sr-thumbs { display: none; }
    .sr-kpis { margin-left: 0; width: 100%; justify-content: space-between; }
    .sr-kpi { text-align: left; }
  }
`;

function BusPic({ model, h = 64 }) {
  const src = busImage(model);
  const tone = familyTone(model);
  return src
    ? <img src={src} alt={model} />
    : <svg viewBox="0 0 64 28" height={h * 0.5} aria-hidden="true"><rect x="2" y="3" width="58" height="18" rx="4" fill={tone} /><rect x="8" y="7" width="40" height="7" rx="1.5" fill="#fff" opacity=".85" /><circle cx="16" cy="23" r="4" fill="#111" /><circle cx="48" cy="23" r="4" fill="#111" /></svg>;
}

const Num = ({ v, label }) => <div className="sr-num"><b>{v}</b><span>{label}</span></div>;

function ModelCard({ m }) {
  const tone = m.model === 'No model' ? '#64748b' : familyTone(m.model);
  const over = m.avgDesigned > 0 && m.avgMin > m.avgDesigned;
  const pct = m.avgDesigned > 0 ? Math.min(100, (m.avgMin / Math.max(m.avgMin, m.avgDesigned)) * 100) : 0;
  return (
    <div className="sr-card" style={{ '--tone': tone }}>
      <div className="sr-card-img"><BusPic model={m.model} /></div>
      <div className="sr-card-title">{m.model}</div>
      <div className="sr-card-sub">{m.buses} bus{m.buses === 1 ? '' : 'es'} worked on</div>
      <div className="sr-grid">
        <Num v={m.cards} label="Cards" />
        <Num v={m.staff} label="Staff" />
        <Num v={fmtMin(m.avgMin)} label="Avg time" />
        <Num v={m.avgDesigned ? fmtMin(m.avgDesigned) : '-'} label="Designed" />
      </div>
      {m.avgDesigned > 0 && m.avgMin > 0 && (
        <div className="kmc-track" style={{ height: 6, marginTop: 10 }} title={over ? 'Average time is over the designed time' : 'Average time is within the designed time'}>
          <div className="kmc-fill" style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--g-red)' : 'var(--g-lime)' }} />
        </div>
      )}
    </div>
  );
}

function JobsCard({ j }) {
  const kinds = [j.busJobs && `${j.busJobs} bus job order${j.busJobs === 1 ? '' : 's'}`, j.projects.length && `${j.projects.length} other project${j.projects.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  const waste = fmtAmounts(j.waste);
  return (
    <div className="sr-card" style={{ '--tone': '#7c3aed', gridColumn: '1 / -1', minWidth: 0 }}>
      <div className="sr-card-title">Job orders and non-bus work</div>
      <div className="sr-card-sub">{kinds || 'Job order runs'}{j.projects.length ? `: ${j.projects.slice(0, 4).join(', ')}${j.projects.length > 4 ? '…' : ''}` : ''}</div>
      <div className="sr-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))' }}>
        <Num v={j.jobs} label="Jobs" />
        <Num v={j.runs} label="Runs" />
        <Num v={j.staff.length} label="Staff" />
        <Num v={fmtMin(j.avgRun)} label="Avg run" />
        {j.pieces > 0 && <Num v={j.pieces} label="Pieces cut" />}
        {j.metres > 0 && <Num v={`${j.metres} m`} label="Length cut" />}
      </div>
      {j.specs.length > 0 && (
        <div className="sr-list">
          <div className="h"><span>Material processed</span><span>pieces · length</span></div>
          {j.specs.slice(0, 6).map(s => <div key={s.spec}><span>{s.spec}{s.material && s.material !== s.spec ? ` (${s.material})` : ''}</span><b>{s.pieces} · {s.metres} m</b></div>)}
          {j.specs.length > 6 && <div><span>{j.specs.length - 6} more specifications</span><b /></div>}
        </div>
      )}
      {j.steps.length > 0 && (
        <div className="sr-list">
          <div className="h"><span>Steps done</span><span>times · quantity</span></div>
          {j.steps.slice(0, 6).map(s => <div key={`${s.name}|${s.unit}`}><span>{s.name}</span><b>{s.times}{s.qty ? ` · ${Math.round(s.qty * 100) / 100}${s.unit ? ` ${s.unit}` : ''}` : ''}</b></div>)}
        </div>
      )}
      <div className="sr-list">
        <div><span>Waste generated</span><b style={{ color: waste === '-' ? undefined : '#f59e0b' }}>{waste === '-' ? 'None logged' : waste}</b></div>
      </div>
    </div>
  );
}

function StationRow({ s, open, onToggle }) {
  const hasCards = s.cards > 0;
  const j = s.jobs;
  return (
    <div className="sr-st">
      <button className="sr-st-head" onClick={onToggle} aria-expanded={open}>
        <div className="sr-id" style={{ minWidth: 0 }}>
          <div className="sr-code">{s.code}</div>
          <div className="sr-name">{s.name || '-'}</div>
        </div>
        <Num v={hasCards ? s.cards : j?.runs || 0} label={hasCards ? 'Cards' : 'Runs'} />
        <Num v={s.staff} label="Staff" />
        <Num v={fmtMin(hasCards ? s.avgMin : j?.avgRun)} label={hasCards ? 'Avg time' : 'Avg run'} />
        <Num v={hasCards ? s.buses : j?.jobs || 0} label={hasCards ? 'Buses' : 'Jobs'} />
        <div className="sr-thumbs">
          {s.models.filter(m => m.model !== 'No model').slice(0, 4).map(m => (
            <span key={m.model} className="sr-thumb" style={{ '--tone': familyTone(m.model) }} title={`${m.model}: ${m.cards} card${m.cards === 1 ? '' : 's'}`}>
              <BusPic model={m.model} h={22} /><i>{m.cards}</i>
            </span>
          ))}
          {j && <span className="kmc-chip" title="Job order runs at this station"><span>jobs</span><b style={{ background: '#7c3aed' }}>{j.jobs}</b></span>}
        </div>
        <span className={`sr-chev${open ? ' open' : ''}`} style={{ color: 'var(--text-muted)' }}>›</span>
      </button>
      {open && (
        <div className="sr-detail">
          {s.models.map(m => <ModelCard key={m.model} m={m} />)}
          {j && <JobsCard j={j} />}
          {s.overDesigned > 0 && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-muted)' }}>
              {s.overDesigned} of {s.cards} card{s.cards === 1 ? '' : 's'} took longer than the designed time.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StationReports({ keep }) {
  const { submissions, loading } = useSubmissionsData();
  const jobData = useJobData();
  const [period, setPeriod] = useState('30');
  const [query, setQuery] = useState('');
  const [openLines, setOpenLines] = useState(() => new Set());
  const [openStations, setOpenStations] = useState(() => new Set());

  const from = useMemo(() => periodStart(period), [period]);
  const report = useMemo(
    () => buildStationReport({ cards: submissions, jobOrders: jobData.jobOrders, runs: jobData.runs, from, keep }),
    [submissions, jobData.jobOrders, jobData.runs, from, keep],
  );

  const q = query.trim().toLowerCase();
  const lines = q
    ? report.lines.map(l => ({ ...l, stations: l.stations.filter(s => `${s.code} ${s.name} ${s.models.map(m => m.model).join(' ')}`.toLowerCase().includes(q)) })).filter(l => l.stations.length)
    : report.lines;
  // One line in view (a supervisor's own shop, or a search): open it straight away.
  const lineOpen = id => (q || lines.length === 1) ? !openLines.has(`closed:${id}`) : openLines.has(id);
  const toggleLine = id => setOpenLines(prev => {
    const n = new Set(prev);
    const k = (q || lines.length === 1) ? `closed:${id}` : id;
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  const toggleStation = k => setOpenStations(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const t = report.totals;

  return (
    <div>
      <style>{CSS}</style>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {PERIODS.map(p => <button key={p.id} className={`kmc-btn${period === p.id ? ' primary' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a station or model…" aria-label="Find a station"
          style={{ marginLeft: 'auto', flex: '1 1 180px', maxWidth: 280, fontSize: 13, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatTile label="Cards filed" value={t.cards} tone="teal" sub={`at ${t.stations} station${t.stations === 1 ? '' : 's'}`} />
        <StatTile label="Staff" value={t.staff} tone="pink" sub="operators on cards and runs" />
        <StatTile label="Average time" value={fmtMin(t.avgMin)} tone="amber" sub="per travel card" />
        <StatTile label="Buses" value={t.buses} tone="lime" sub="VINs worked on" />
        {t.runs > 0 && <StatTile label="Job order runs" value={t.runs} tone="blue" sub="cut lists and non-bus work" />}
      </div>

      {(loading || (jobData.loading && !jobData.loaded)) && !report.lines.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
      {jobData.error && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Job order figures are unavailable right now ({jobData.error}). Travel card figures are shown.</div>}
      {!loading && !lines.length && (
        <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
          {q ? `No station matches "${query}".` : 'No cards or job order runs in this period.'}
        </div>
      )}

      {lines.map(l => {
        const open = lineOpen(l.id);
        return (
          <div key={l.id} className="kmc-panel sr-line">
            <button className="sr-line-head" onClick={() => toggleLine(l.id)} aria-expanded={open}
              style={{ backgroundImage: LINE_IMAGE[l.id] ? `url('${LINE_IMAGE[l.id]}')` : 'none' }}>
              <span className="scrim" />
              <span className="in">
                <span className={`sr-chev${open ? ' open' : ''}`}>›</span>
                <span>
                  <span className="sr-line-name" style={{ display: 'block' }}>{l.label}</span>
                  <span className="sr-line-sub" style={{ display: 'block' }}>{l.stations.length} station{l.stations.length === 1 ? '' : 's'} with work in this period{open ? '' : ' · tap to open'}</span>
                </span>
                <span className="sr-kpis">
                  <span className="sr-kpi"><b>{l.cards}</b><span>Cards</span></span>
                  <span className="sr-kpi"><b>{l.staff}</b><span>Staff</span></span>
                  <span className="sr-kpi"><b>{fmtMin(l.avgMin)}</b><span>Avg time</span></span>
                  <span className="sr-kpi"><b>{l.buses}</b><span>Buses</span></span>
                  {l.runs > 0 && <span className="sr-kpi"><b>{l.runs}</b><span>Job runs</span></span>}
                </span>
              </span>
            </button>
            {open && (
              <div className="sr-body">
                {l.stations.map(s => {
                  const k = `${l.id}|${s.code}`;
                  return <StationRow key={k} s={s} open={openStations.has(k)} onToggle={() => toggleStation(k)} />;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
