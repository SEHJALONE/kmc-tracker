import { useMemo } from 'react';
import { STATIONS, LINES } from '../data/stations';

const isKDC = (m = '') => m.toUpperCase().includes('KDC');
const isEVS = (m = '') => m.toUpperCase().includes('EVS');

function getColors(model = '') {
  if (isKDC(model)) return { border: '#dc2626', badge: 'rgba(220,38,38,0.15)', text: '#fca5a5' };
  if (isEVS(model)) return { border: '#38bdf8', badge: 'rgba(56,189,248,0.15)', text: '#7dd3fc' };
  return              { border: '#64748b', badge: 'rgba(100,116,139,0.15)', text: '#94a3b8' };
}

function fmt(ms) {
  if (!ms || ms < 0) return '—';
  const totalHours = Math.floor(ms / 3600000);
  const d = Math.floor(totalHours / 24);
  const h = totalHours % 24;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${Math.floor(ms / 60000)}m`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return String(ts);
  // e.g. "23 Oct 2025, 15:00"
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const map = {
    'On Track': { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    'Slow':     { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    'Delayed':  { bg: 'rgba(220,38,38,0.15)',  color: '#dc2626', border: 'rgba(220,38,38,0.3)' },
  };
  const s = map[status] || map['On Track'];
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 20, padding: '2px 10px',
      fontSize: 10, fontWeight: 700,
      fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em',
    }}>
      {status}
    </span>
  );
}

function ProgressBar({ pct, color }) {
  // cap visually at 100% — never overflow the bar
  const visual = Math.min(pct, 100);
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', width: '100%' }}>
      <div style={{
        height: '100%', width: `${visual}%`,
        background: color, borderRadius: 2, transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

export default function BusReport({ buses, allRows, filter }) {
  const report = useMemo(() => {
    const byVin = {};
    for (const row of allRows) {
      if (!byVin[row.vin]) byVin[row.vin] = [];
      byVin[row.vin].push(row);
    }

    return buses
      .filter(bus => filter === 'ALL' || bus.model?.toUpperCase().includes(filter))
      .map(bus => {
        const history = (byVin[bus.vin] || [])
          .filter(r => r.rawTimestamp)
          .sort((a, b) => new Date(a.rawTimestamp) - new Date(b.rawTimestamp));

        const firstTs  = history[0]  ? new Date(history[0].rawTimestamp).getTime()  : null;
        const latestTs = history[history.length - 1]
          ? new Date(history[history.length - 1].rawTimestamp).getTime() : null;
        const now = Date.now();

        const totalMs          = firstTs  ? now - firstTs  : null;
        const currentStationMs = latestTs ? now - latestTs : null;

        // Unique stations visited — capped at line total to prevent >100%
        const stationsVisited = new Set(history.map(r => r.stationCode)).size;
        const lineId = bus.station?.line;
        const lineStations = lineId
          ? Object.values(STATIONS).filter(s => s.line === lineId).length
          : 0;

        // ✅ progress capped at 100%
        const rawPct     = lineStations > 0 ? (stationsVisited / lineStations) * 100 : 0;
        const progressPct = Math.min(Math.round(rawPct), 100);

        // Status based on time at current station
        let status = 'On Track';
        if (currentStationMs && currentStationMs > 48 * 3600000) status = 'Delayed';
        else if (currentStationMs && currentStationMs > 24 * 3600000) status = 'Slow';

        return {
          vin: bus.vin,
          model: bus.model,
          stationCode: bus.stationCode,
          stationName: bus.station?.name || bus.stationCode || '—',
          lineName: LINES.find(l => l.id === lineId)?.label || lineId || '—',
          totalMs, currentStationMs,
          stationsVisited,
          lineStations,
          progressPct,
          status,
          firstEntry: firstTs,
          colors: getColors(bus.model),
        };
      })
      .sort((a, b) => (b.totalMs || 0) - (a.totalMs || 0));
  }, [buses, allRows, filter]);

  if (report.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32 }}>🚌</div>
        <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.14em' }}>NO BUSES ON FLOOR</div>
      </div>
    );
  }

  const delayed = report.filter(b => b.status === 'Delayed').length;
  const slow    = report.filter(b => b.status === 'Slow').length;
  const onTrack = report.filter(b => b.status === 'On Track').length;
  // avgProgress capped at 100%
  const avgProg = Math.min(
    Math.round(report.reduce((s, b) => s + b.progressPct, 0) / report.length),
    100
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { label: 'Total on floor',  value: report.length, color: '#475569' },
          { label: 'On track',        value: onTrack,       color: '#10b981' },
          { label: 'Slow (>24h)',     value: slow,          color: '#f59e0b' },
          { label: 'Delayed (>48h)', value: delayed,        color: '#dc2626' },
          { label: 'Avg progress',    value: `${avgProg}%`, color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(13,21,38,0.8)',
            border: `1px solid ${s.color}33`,
            borderRadius: 8, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, color: '#475569', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bus rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {report.map(bus => (
          <div key={bus.vin} style={{
            background: 'rgba(13,21,38,0.75)',
            border: `1px solid ${bus.colors.border}33`,
            borderLeft: `3px solid ${bus.colors.border}`,
            borderRadius: '0 8px 8px 0',
            padding: '14px 18px',
            display: 'grid',
            gridTemplateColumns: '1.2fr 1.4fr 0.8fr 1fr 1.2fr auto',
            gap: 14,
            alignItems: 'center',
          }}>
            {/* VIN + model */}
            <div>
              <div style={{ marginBottom: 4 }}>
                <span style={{
                  background: bus.colors.badge, color: bus.colors.text,
                  border: `1px solid ${bus.colors.border}55`,
                  borderRadius: 3, padding: '1px 7px',
                  fontSize: 9, fontWeight: 700,
                  fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em',
                }}>
                  {bus.model}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#f1f5f9', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{bus.vin}</div>
              <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Space Mono', monospace", marginTop: 2 }}>{bus.lineName}</div>
            </div>

            {/* Current station */}
            <div>
              <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', marginBottom: 3, textTransform: 'uppercase' }}>Current Station</div>
              <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, lineHeight: 1.4 }}>{bus.stationName}</div>
              <div style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace" }}>{bus.stationCode}</div>
            </div>

            {/* Time at station */}
            <div>
              <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', marginBottom: 3, textTransform: 'uppercase' }}>At Station</div>
              <div style={{
                fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                color: bus.status === 'Delayed' ? '#dc2626' : bus.status === 'Slow' ? '#f59e0b' : '#f1f5f9',
              }}>
                {fmt(bus.currentStationMs)}
              </div>
            </div>

            {/* Total on floor */}
            <div>
              <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', marginBottom: 3, textTransform: 'uppercase' }}>Total on Floor</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', fontFamily: "'Space Mono', monospace" }}>{fmt(bus.totalMs)}</div>
              <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
                since {fmtDate(bus.firstEntry)}
              </div>
            </div>

            {/* Progress — capped at 100%, label shows actual fraction */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Progress</span>
                <span style={{ fontSize: 9, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>
                  {Math.min(bus.stationsVisited, bus.lineStations)}/{bus.lineStations}
                </span>
              </div>
              <ProgressBar pct={bus.progressPct} color={bus.colors.border} />
              <div style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace" }}>
                {bus.progressPct}% of line
              </div>
            </div>

            {/* Status */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <StatusBadge status={bus.status} />
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        fontSize: 9, color: '#1e2d40', fontFamily: "'Space Mono', monospace",
        letterSpacing: '0.06em', display: 'flex', gap: 20, flexWrap: 'wrap',
        borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: 10,
      }}>
        <span>● ON TRACK = at station &lt;24h</span>
        <span>● SLOW = 24–48h at station</span>
        <span>● DELAYED = &gt;48h at station</span>
      </div>
    </div>
  );
}
