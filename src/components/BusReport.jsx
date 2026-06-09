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
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtShortDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return String(ts);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Returns variance info comparing actual dwell (ms) against estimated (minutes).
 * Returns null if no estimated time is available.
 */
function getVariance(actualMs, estimatedMinutes) {
  if (!actualMs || actualMs <= 0 || !estimatedMinutes) return null;
  const actualMinutes = actualMs / 60000;
  const diffMinutes   = actualMinutes - estimatedMinutes;
  const pct           = (diffMinutes / estimatedMinutes) * 100;
  return { diffMinutes, pct, actualMinutes, estimatedMinutes };
}

/**
 * Status now factors in estimated time:
 *  - If no estimated time → fall back to old 24h/48h thresholds
 *  - If estimated time available:
 *      On Track  = within 120% of estimate  (up to 20% over)
 *      Slow      = 120–200% of estimate
 *      Delayed   = >200% of estimate
 */
function computeStatus(currentStationMs, estimatedMinutes) {
  if (!currentStationMs) return 'On Track';

  if (estimatedMinutes) {
    const ratio = currentStationMs / (estimatedMinutes * 60000);
    if (ratio > 2.0) return 'Delayed';
    if (ratio > 1.2) return 'Slow';
    return 'On Track';
  }

  // Legacy fallback
  if (currentStationMs > 48 * 3600000) return 'Delayed';
  if (currentStationMs > 24 * 3600000) return 'Slow';
  return 'On Track';
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
      borderRadius: 20, padding: '2px 7px',
      fontSize: 9, fontWeight: 700,
      fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em',
    }}>
      {status}
    </span>
  );
}

function ProgressBar({ pct, color }) {
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

/**
 * Variance pill — shows how far over/under the estimated time the bus is.
 * Green = under or on time, amber = moderately over, red = significantly over.
 */
function VariancePill({ variance }) {
  if (!variance) return (
    <span style={{
      fontSize: 9, color: '#334155',
      fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em',
    }}>
      no estimate
    </span>
  );

  const { diffMinutes, pct } = variance;
  const over = diffMinutes > 0;

  // Color thresholds
  let color, bg, border;
  if (!over || pct <= 20) {
    color = '#10b981'; bg = 'rgba(16,185,129,0.12)'; border = 'rgba(16,185,129,0.3)';
  } else if (pct <= 100) {
    color = '#f59e0b'; bg = 'rgba(245,158,11,0.12)'; border = 'rgba(245,158,11,0.3)';
  } else {
    color = '#dc2626'; bg = 'rgba(220,38,38,0.12)'; border = 'rgba(220,38,38,0.3)';
  }

  const absDiff = Math.abs(diffMinutes);
  const label = absDiff >= 60
    ? `${over ? '+' : '-'}${(absDiff / 60).toFixed(1)}h`
    : `${over ? '+' : '-'}${Math.round(absDiff)}m`;

  return (
    <span title={`Estimated: ${variance.estimatedMinutes}min · Actual: ${Math.round(variance.actualMinutes)}min`}
      style={{
        background: bg, color, border: `1px solid ${border}`,
        borderRadius: 20, padding: '2px 8px',
        fontSize: 9, fontWeight: 700,
        fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em',
        cursor: 'help',
      }}
    >
      {label} {over ? '▲' : '▼'}
    </span>
  );
}

/**
 * Mini bar comparing actual vs estimated time.
 * The bar fills to actual; a marker shows where the estimate ends.
 */
function DwellBar({ actualMs, estimatedMinutes, color }) {
  if (!estimatedMinutes) {
    // Fallback to simple bar capped at 72h
    const pct = Math.min((actualMs / (72 * 3600000)) * 100, 100);
    return (
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    );
  }

  const estimatedMs = estimatedMinutes * 60000;
  // Scale: 3× estimated = full bar
  const scale = estimatedMs * 3;
  const actualPct   = Math.min((actualMs   / scale) * 100, 100);
  const estimatePct = Math.min((estimatedMs / scale) * 100, 100);
  const over = actualMs > estimatedMs;

  return (
    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
      {/* Actual fill */}
      <div style={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${actualPct}%`,
        background: over
          ? `linear-gradient(90deg, ${color}99, #dc2626)`
          : color,
        borderRadius: 3,
        transition: 'width 0.5s ease',
      }} />
      {/* Estimated marker line */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${estimatePct}%`,
        width: 2,
        background: 'rgba(255,255,255,0.45)',
        borderRadius: 1,
      }} />
    </div>
  );
}

export default function BusReport({ buses, allRows, filter, stationTimes = {} }) {
  const report = useMemo(() => {
    const byVin = {};
    for (const row of (allRows ?? [])) {
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

        const stationsVisited = new Set(history.map(r => r.stationCode)).size;
        const lineId = bus.station?.line;
        const lineStations = lineId
          ? Object.values(STATIONS).filter(s => s.line === lineId).length
          : 0;

        const rawPct      = lineStations > 0 ? (stationsVisited / lineStations) * 100 : 0;
        const progressPct = Math.min(Math.round(rawPct), 100);

        // Estimated time for current station
        const estimatedMinutes = stationTimes[bus.stationCode] || null;
        const status    = computeStatus(currentStationMs, estimatedMinutes);
        const variance  = getVariance(currentStationMs, estimatedMinutes);

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
          variance,
          estimatedMinutes,
          firstEntry: firstTs,
          colors: getColors(bus.model),
        };
      })
      .sort((a, b) => (b.totalMs || 0) - (a.totalMs || 0));
  }, [buses, allRows, filter, stationTimes]);
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
  const avgProg = Math.min(
    Math.round(report.reduce((s, b) => s + b.progressPct, 0) / report.length),
    100
  );

  // Variance summary — buses with estimates only
  const withEst  = report.filter(b => b.variance);
  const avgVarPct = withEst.length > 0
    ? Math.round(withEst.reduce((s, b) => s + b.variance.pct, 0) / withEst.length)
    : null;

  return (
    <div style={{
      position: 'relative',
      backgroundImage: "url('/Bus background.png')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(7,9,15,0.82)',
        zIndex: 0, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { label: 'Total on floor',    value: report.length,         color: '#475569' },
          { label: 'On track',          value: onTrack,               color: '#10b981' },
          { label: 'Slow (>120% est.)', value: slow,                  color: '#f59e0b' },
          { label: 'Delayed (>2× est.)',value: delayed,               color: '#dc2626' },
          { label: 'Avg progress',      value: `${avgProg}%`,         color: '#3b82f6' },
          ...(avgVarPct !== null ? [{
            label: 'Avg time variance',
            value: `${avgVarPct > 0 ? '+' : ''}${avgVarPct}%`,
            color: avgVarPct > 50 ? '#dc2626' : avgVarPct > 20 ? '#f59e0b' : '#10b981',
          }] : []),
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
            padding: '10px 14px',
            display: 'grid',
            gridTemplateColumns: 'minmax(180px,1.6fr) minmax(0,1.1fr) minmax(0,0.9fr) minmax(0,0.75fr) minmax(0,0.7fr) minmax(0,0.75fr) minmax(72px,auto)',
            gap: 8,
            alignItems: 'center',
          }}>
            {/* VIN + model */}
            <div style={{ minWidth: 0 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{
                  background: bus.colors.badge, color: bus.colors.text,
                  border: `1px solid ${bus.colors.border}55`,
                  borderRadius: 3, padding: '1px 6px',
                  fontSize: 8, fontWeight: 700,
                  fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em',
                  display: 'inline-block',
                }}>
                  {bus.model}
                </span>
              </div>
              <div style={{ fontSize: 9, color: '#f1f5f9', fontFamily: "'Space Mono', monospace", fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{bus.vin}</div>
              <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bus.lineName}</div>
            </div>

            {/* Current station */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em', marginBottom: 3, textTransform: 'uppercase' }}>Station</div>
              <div style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bus.stationName}</div>
              <div style={{ fontSize: 8, color: '#475569', fontFamily: "'Space Mono', monospace" }}>{bus.stationCode}</div>
            </div>

            {/* Time at station + dwell bar */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em', marginBottom: 3, textTransform: 'uppercase' }}>At Station</div>
              <div style={{
                fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                color: bus.status === 'Delayed' ? '#dc2626' : bus.status === 'Slow' ? '#f59e0b' : '#f1f5f9',
                marginBottom: 4,
              }}>
                {fmt(bus.currentStationMs)}
              </div>
              <DwellBar
                actualMs={bus.currentStationMs}
                estimatedMinutes={bus.estimatedMinutes}
                color={bus.colors.border}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                {bus.estimatedMinutes ? (
                  <span style={{ fontSize: 8, color: '#334155', fontFamily: "'Space Mono', monospace" }}>
                    est. {bus.estimatedMinutes}m
                  </span>
                ) : (
                  <span style={{ fontSize: 8, color: '#1e2d40', fontFamily: "'Space Mono', monospace" }}>
                    no est.
                  </span>
                )}
                <VariancePill variance={bus.variance} />
              </div>
            </div>

            {/* Total on floor */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em', marginBottom: 3, textTransform: 'uppercase' }}>Total</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', fontFamily: "'Space Mono', monospace" }}>{fmt(bus.totalMs)}</div>
            </div>

            {/* First entry */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em', marginBottom: 3, textTransform: 'uppercase' }}>First Entry</div>
              <div style={{ fontSize: 9, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>{fmtShortDate(bus.firstEntry)}</div>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 8, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase' }}>Prog.</span>
                <span style={{ fontSize: 8, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>
                  {Math.min(bus.stationsVisited, bus.lineStations)}/{bus.lineStations}
                </span>
              </div>
              <ProgressBar pct={bus.progressPct} color={bus.colors.border} />
              <div style={{ fontSize: 8, color: '#475569', fontFamily: "'Space Mono', monospace" }}>
                {bus.progressPct}%
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
        <span>● ON TRACK = within 120% of estimated time (or &lt;24h if no estimate)</span>
        <span>● SLOW = 120–200% of estimated time</span>
        <span>● DELAYED = &gt;200% of estimated time</span>
        <span style={{ marginLeft: 'auto' }}>▏ white marker on bar = estimated time target</span>
      </div>
      </div>
    </div>
  );
}
