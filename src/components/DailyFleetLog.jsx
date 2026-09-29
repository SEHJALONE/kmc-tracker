import { useState, useMemo, useEffect } from 'react';
import { LINES, STATIONS, modelFamilyOf, stationNameForModel } from '../data/stations';
import { isActive } from '../data/catalogConfig';
import { useBusSightings } from '../hooks/useBusSightings';
import { useCatalog } from '../hooks/useCatalog';
import { fetchSubmissions } from '../hooks/useSubmissionsData';

const DEFAULT_MODELS = ['7m EVS', '8.5m EVS', '10.5m EVS', '12m EVS', '10.5m KDC', '12m KDC', '13m KEC'];

// Dropdown options for the log, built from data that already exists: the shared
// catalog (projects + registered fleet), Travel Card submissions and earlier
// sightings. Pure so it can be tested.
export function buildFleetOptions({ catalog = {}, submissions = [], sightings = [], legacyProjectVins = {} }) {
  const fleet = {};               // project -> Map(vin -> model)
  const add = (project, vin, model) => {
    const p = String(project || '').trim(), v = String(vin || '').trim().toUpperCase();
    if (!p) return;
    const m = (fleet[p] ||= new Map());
    if (v && (!m.has(v) || (!m.get(v) && model))) m.set(v, model || m.get(v) || '');
  };
  for (const pr of catalog.projects || []) if (pr && pr.name && pr.active !== false) add(pr.name, '', '');
  for (const [p, list] of Object.entries(catalog.projectVins || {})) for (const v of list || []) add(p, v?.vin, v?.model);
  for (const [p, list] of Object.entries(legacyProjectVins)) for (const v of list || []) add(p, v, '');
  for (const c of submissions) add(c.project, c.vin, c.busModel);
  for (const c of sightings) add(c.project, c.vin, c.busModel);
  const projects = Object.keys(fleet).sort((a, b) => a.localeCompare(b));
  const vinsByProject = Object.fromEntries(projects.map(p => [p, [...fleet[p]].map(([vin, model]) => ({ vin, model })).sort((a, b) => a.vin.localeCompare(b.vin))]));
  const models = [...new Set([...DEFAULT_MODELS, ...projects.flatMap(p => vinsByProject[p].map(v => v.model)).filter(Boolean)])];
  const people = [...new Set([...submissions.map(c => c.submittedBy), ...sightings.map(c => c.loggedBy)].filter(Boolean))].sort();
  return { projects, vinsByProject, models, people };
}

// Daily Fleet Log — a supervisor's own record of where each bus was
// spotted, day by day. Deliberately independent of Travel Card data (not
// derived from it) so it works as an honest proofing/cross-check tool: if a
// bus's sighting log doesn't line up with what Travel Card says, that's
// worth a look. No "time left" is tracked — just "this bus was at this
// station on this day", with an optional rough time if the supervisor has
// it handy. (Replaces the old read-only Daily Fleet Log, which just
// re-displayed Travel Card data and so couldn't serve as a real check on it.)
export default function DailyFleetLog({ onBack, theme = 'dark', currentUserName = null }) {
  const isDark = theme === 'dark';
  const bg      = isDark ? 'rgba(7,9,15,0.92)'     : 'rgba(255,255,255,0.97)';
  const card    = isDark ? 'rgba(13,21,38,0.90)'    : '#fff';
  const text    = isDark ? '#e2e8f0'                : '#1e293b';
  const muted   = isDark ? '#94a3b8'                : '#475569';
  const dim     = isDark ? '#64748b'                : '#94a3b8';
  const border  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
  const inpBg   = isDark ? '#0d1526'                : '#f8fafc';
  const inpBor  = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  const R       = '#dc2626';
  const GR      = '#10b981';
  const AM      = '#f59e0b';
  const fm      = "'Inter', system-ui, sans-serif";
  const mono    = "'Courier New', monospace";

  const { sightings, projectVins, loading, error, addSighting, deleteSighting } = useBusSightings();
  const { catalog } = useCatalog();
  const [submissions, setSubmissions] = useState([]);
  useEffect(() => {
    let live = true;
    fetchSubmissions().then(c => { if (live) setSubmissions(c); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const opts = useMemo(
    () => buildFleetOptions({ catalog, submissions, sightings, legacyProjectVins: projectVins }),
    [catalog, submissions, sightings, projectVins],
  );

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [project, setProject] = useState('');
  const [vin, setVin] = useState('');
  const [busModel, setBusModel] = useState('');
  const [lineId, setLineId] = useState('');
  const [stationCode, setStationCode] = useState('');
  const [time, setTime] = useState('');
  const [loggedBy, setLoggedBy] = useState(currentUserName || '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  // Live catalog stations (active only), narrowed to the chosen model's family.
  const lineStations = useMemo(() => {
    if (!lineId) return [];
    const fam = modelFamilyOf(busModel);
    return Object.entries(STATIONS)
      .filter(([, st]) => st.line === lineId && isActive(st) && (!fam || !st.models || st.models.includes(fam)))
      .map(([code, st]) => ({ code, ...st, label: stationNameForModel({ code, ...st }, busModel) }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [lineId, busModel]);

  const knownVins = opts.vinsByProject[project] || [];
  const lines = LINES.filter(l => isActive(l));

  const dayRows = useMemo(() => {
    return sightings
      .filter(s => s.date === date)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.vin.localeCompare(b.vin));
  }, [sightings, date]);

  // Buses seen at more than one station the same day — worth a glance, since
  // that's exactly the kind of movement Travel Card should also show.
  const multiStationVins = useMemo(() => {
    const byVin = {};
    dayRows.forEach(r => { (byVin[r.vin] ||= new Set()).add(r.stationCode); });
    return new Set(Object.entries(byVin).filter(([, set]) => set.size > 1).map(([v]) => v));
  }, [dayRows]);

  async function handleAdd() {
    if (!project.trim()) return showToast('Enter a bus project.', false);
    if (!vin.trim()) return showToast('Enter a bus VIN.', false);
    if (!lineId) return showToast('Select a production line.', false);
    if (!stationCode) return showToast('Select a station.', false);
    if (!loggedBy.trim()) return showToast('Enter your name.', false);

    const station = lineStations.find(s => s.code === stationCode);
    const line = LINES.find(l => l.id === lineId);

    setSaving(true);
    const result = await addSighting({
      date, project: project.trim(), vin: vin.trim().toUpperCase(), busModel: busModel.trim(),
      line: line?.label || lineId, station: station?.label || station?.name || '', stationCode,
      time: time || '', loggedBy: loggedBy.trim(),
    });
    setSaving(false);
    if (result.ok) {
      showToast('Logged ✓');
      setVin(''); setBusModel(''); setTime('');
    } else {
      showToast(`Could not save: ${result.error || 'unknown error'}`, false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this sighting?')) return;
    const result = await deleteSighting(id);
    if (!result.ok) showToast(`Could not delete: ${result.error || 'unknown error'}`, false);
  }

  const inp = {
    fontSize: 13, padding: '9px 11px', border: `1px solid ${inpBor}`, borderRadius: 5,
    background: inpBg, color: text, outline: 'none', boxSizing: 'border-box', fontFamily: fm,
    colorScheme: isDark ? 'dark' : 'light',
  };
  const lbl = { display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 };

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>
      {/* Banner */}
      <div style={{
        width: '100%', maxWidth: 1100, height: 140, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('${isDark ? '/Bus background 3.png' : '/Bus background.png'}')`,
        backgroundSize: 'cover', backgroundPosition: 'center 30%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.82) 0%, rgba(7,9,15,0.35) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>Daily Fleet Log</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Log where each bus was, station by station — a proofing check against Travel Card</div>
          </div>
          <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {dayRows.length} logged
          </div>
        </div>
      </div>

      {error && (
        <div style={{ maxWidth: 1100, padding: '10px 14px', background: 'rgba(220,38,38,0.08)', border: `1px solid ${R}55`, borderRadius: 6, color: '#f87171', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Log a sighting */}
      <div style={{ maxWidth: 1100, border: `1px solid ${border}`, borderRadius: 8, padding: '16px 20px', background: card, marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: GR, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fm, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(16,185,129,0.2)` }}>Log a Bus Sighting</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={lbl}>Date</label>
            <input type="date" style={{ ...inp, width: 150 }} value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <label style={lbl}>Project</label>
            <input list="dal-projects" style={{ ...inp, width: 170 }} value={project} onChange={e => { setProject(e.target.value); setVin(''); }} placeholder="e.g. 45 Bus Project" />
            <datalist id="dal-projects">
              {opts.projects.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label style={lbl}>Bus VIN</label>
            <input list="dal-vins" style={{ ...inp, width: 180 }} value={vin} onChange={e => {
              const v = e.target.value; setVin(v);
              const hit = knownVins.find(k => k.vin === v.trim().toUpperCase());
              if (hit && hit.model) { setBusModel(hit.model); setStationCode(''); }
            }} placeholder="Select or type VIN" />
            <datalist id="dal-vins">
              {knownVins.map(v => <option key={v.vin} value={v.vin} label={v.model || undefined} />)}
            </datalist>
          </div>
          <div>
            <label style={lbl}>Bus Model <span style={{ color: dim, fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <select style={{ ...inp, width: 130 }} value={busModel} onChange={e => { setBusModel(e.target.value); setStationCode(''); }}>
              <option value="">Any model</option>
              {opts.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Line</label>
            <select style={{ ...inp, width: 190 }} value={lineId} onChange={e => { setLineId(e.target.value); setStationCode(''); }}>
              <option value="">Select line…</option>
              {lines.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Station</label>
            <select style={{ ...inp, width: 220 }} value={stationCode} onChange={e => setStationCode(e.target.value)} disabled={!lineId}>
              <option value="">{lineId ? 'Select station…' : 'Pick a line first'}</option>
              {lineStations.map(s => <option key={s.code} value={s.code}>{s.code} — {s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Time <span style={{ color: dim, fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input type="time" style={{ ...inp, width: 110 }} value={time} onChange={e => setTime(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Logged By</label>
            <input list="dal-people" style={{ ...inp, width: 160 }} value={loggedBy} onChange={e => setLoggedBy(e.target.value)} placeholder="Your name" />
            <datalist id="dal-people">{opts.people.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <button onClick={handleAdd} disabled={saving} style={{
            background: GR, border: 'none', color: '#fff', borderRadius: 5, padding: '10px 20px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: fm, opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : '+ Log Sighting'}
          </button>
        </div>
      </div>

      {/* Day's log */}
      {loading && dayRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>Loading…</div>
      ) : dayRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim, maxWidth: 1100 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: muted }}>No sightings logged for {date}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Log a bus above as you spot it on the line.</div>
        </div>
      ) : (
        <div style={{ maxWidth: 1100, border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', background: card }}>
          <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.5fr 1fr 1.3fr 1.8fr 1fr 1.2fr 0.5fr', gap: 0, background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${border}`, padding: '10px 16px', fontSize: 10, fontWeight: 700, color: dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Time</span><span>VIN</span><span>Model</span><span>Station Code</span><span>Station</span><span>Line</span><span>Logged By</span><span></span>
          </div>
          {dayRows.map((r, i) => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '0.8fr 1.5fr 1fr 1.3fr 1.8fr 1fr 1.2fr 0.5fr', gap: 0,
              padding: '11px 16px', fontSize: 12, alignItems: 'center',
              borderBottom: i === dayRows.length - 1 ? 'none' : `1px solid ${border}`,
              background: i % 2 ? (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.012)') : 'transparent',
            }}>
              <span style={{ color: r.time ? text : dim, fontFamily: mono }}>{r.time || '—'}</span>
              <span style={{ fontFamily: mono, color: text, display: 'flex', alignItems: 'center', gap: 6 }}>
                {r.vin}
                {multiStationVins.has(r.vin) && <span title="Seen at more than one station today" style={{ fontSize: 9, color: AM, border: `1px solid ${AM}55`, borderRadius: 3, padding: '1px 4px' }}>MOVED</span>}
              </span>
              <span style={{ color: muted }}>{r.busModel || '—'}</span>
              <span style={{ fontFamily: mono, color: AM, fontWeight: 700 }}>{r.stationCode}</span>
              <span style={{ color: text }}>{r.station || '—'}</span>
              <span style={{ color: muted, fontSize: 11 }}>{r.line}</span>
              <span style={{ color: dim, fontSize: 11 }}>{r.loggedBy || '—'}</span>
              <span style={{ textAlign: 'right' }}>
                <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: dim, cursor: 'pointer', fontSize: 14, padding: 0 }} title="Remove">×</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? 'rgba(16,185,129,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.35)' : 'rgba(220,38,38,0.35)'}`, borderLeft: `3px solid ${toast.ok ? GR : R}`, borderRadius: '0 6px 6px 0', padding: '10px 18px', fontSize: 12, fontFamily: fm, color: toast.ok ? GR : R }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
