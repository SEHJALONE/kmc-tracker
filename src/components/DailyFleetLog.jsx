import { useState, useMemo } from 'react';
import { useSheetData } from '../hooks/useSheetData';
import { lookupStation } from '../data/stations';

// Daily Fleet Log — for supervisors: "where is each bus, at what station,
// on a given day". One row per bus, showing its latest known station on the
// selected date (defaults to today). Distinct from Bus Tracker (which shows
// current live positions only, no date picker / historical day view).
export default function DailyFleetLog({ onBack, theme = 'dark' }) {
  const isDark = theme === 'dark';
  const bg     = isDark ? 'rgba(7,9,15,0.92)'     : 'rgba(255,255,255,0.97)';
  const card   = isDark ? 'rgba(13,21,38,0.90)'    : '#fff';
  const text   = isDark ? '#e2e8f0'                : '#1e293b';
  const muted  = isDark ? '#94a3b8'                : '#475569';
  const dim    = isDark ? '#64748b'                : '#94a3b8';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
  const inpBg  = isDark ? '#0d1526'                : '#f8fafc';
  const inpBor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  const R      = '#dc2626';
  const GR     = '#10b981';
  const AM     = '#f59e0b';
  const fm     = "'Inter', system-ui, sans-serif";
  const mono   = "'Courier New', monospace";

  const { allRows, loading, error, lastUpdated, refresh } = useSheetData();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');

  const dayRows = useMemo(() => {
    return allRows.filter(r => (r.rawTimestamp || '').slice(0, 10) === date);
  }, [allRows, date]);

  // Latest station per VIN on the selected date.
  const fleet = useMemo(() => {
    const map = {};
    for (const r of dayRows) {
      const ts = new Date(r.rawTimestamp || 0).getTime() || 0;
      if (!map[r.vin] || ts >= map[r.vin].ts) map[r.vin] = { ...r, ts };
    }
    const list = Object.values(map).map(r => ({ ...r, station: lookupStation(r.stationCode) }));
    list.sort((a, b) => b.ts - a.ts);
    return list;
  }, [dayRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fleet;
    return fleet.filter(r =>
      r.vin?.toLowerCase().includes(q) ||
      r.model?.toLowerCase().includes(q) ||
      r.stationCode?.toLowerCase().includes(q) ||
      r.station?.name?.toLowerCase().includes(q)
    );
  }, [fleet, search]);

  const inp = {
    fontSize: 13, padding: '9px 11px', border: `1px solid ${inpBor}`, borderRadius: 5,
    background: inpBg, color: text, outline: 'none', boxSizing: 'border-box', fontFamily: fm,
    colorScheme: isDark ? 'dark' : 'light',
  };

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>
      {/* Banner */}
      <div style={{
        width: '100%', maxWidth: 1100, height: 140, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('${isDark ? '/Bus background 2.png' : '/Bus background 4.png'}')`,
        backgroundSize: 'cover', backgroundPosition: 'center 30%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.82) 0%, rgba(7,9,15,0.35) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>Daily Fleet Log</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Where every bus was, station by station, on a given day</div>
          </div>
          <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {filtered.length} bus{filtered.length === 1 ? '' : 'es'} logged
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18, maxWidth: 1100 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Date</label>
          <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Search VIN / Model / Station</label>
          <input style={{ ...inp, width: '100%' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. BUKBHZ… or W01-02" />
        </div>
        <button onClick={refresh} style={{ alignSelf: 'flex-end', background: 'transparent', border: `1px solid ${inpBor}`, color: muted, borderRadius: 5, padding: '9px 16px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ⟳ Refresh
        </button>
        {lastUpdated && (
          <span style={{ fontSize: 10, color: dim, fontFamily: mono }}>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
        )}
      </div>

      {error && (
        <div style={{ maxWidth: 1100, padding: '10px 14px', background: 'rgba(220,38,38,0.08)', border: `1px solid ${R}55`, borderRadius: 6, color: '#f87171', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim, maxWidth: 1100 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚌</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: muted }}>No bus activity logged for {date}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Pick a different date, or check back once travel cards are submitted today.</div>
        </div>
      ) : (
        <div style={{ maxWidth: 1100, border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', background: card }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.3fr 2fr 0.9fr', gap: 0, background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${border}`, padding: '10px 16px', fontSize: 10, fontWeight: 700, color: dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>VIN</span><span>Model</span><span>Station Code</span><span>Station</span><span>Last Seen</span>
          </div>
          {filtered.map((r, i) => (
            <div key={r.vin} style={{
              display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.3fr 2fr 0.9fr', gap: 0,
              padding: '11px 16px', fontSize: 12, alignItems: 'center',
              borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${border}`,
              background: i % 2 ? (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.012)') : 'transparent',
            }}>
              <span style={{ fontFamily: mono, color: text }}>{r.vin}</span>
              <span style={{ color: muted }}>{r.model}</span>
              <span style={{ fontFamily: mono, color: AM, fontWeight: 700 }}>{r.stationCode}</span>
              <span style={{ color: text }}>{r.station?.name || '—'}</span>
              <span style={{ color: dim, fontSize: 11 }}>{r.ts ? new Date(r.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
