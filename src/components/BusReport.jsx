import { useMemo } from 'react';
import { STATIONS, LINES } from '../data/stations';

const isKDC = (m = '') => m.toUpperCase().includes('KDC');
const isEVS = (m = '') => m.toUpperCase().includes('EVS');

function getColors(model = '') {
  if (isKDC(model)) return { border: 'var(--kdc-color)', badge: 'var(--kdc-alpha)', text: 'var(--kdc-text)', borderRaw: '#dc2626' };
  if (isEVS(model)) return { border: 'var(--evs-color)', badge: 'var(--evs-alpha)', text: 'var(--evs-text)', borderRaw: '#38bdf8' };
  return              { border: 'var(--text-muted)',  badge: 'var(--bg-surface-2)', text: 'var(--text-secondary)', borderRaw: '#64748b' };
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

function getVariance(actualMs, estimatedMinutes) {
  if (!actualMs || actualMs <= 0 || !estimatedMinutes) return null;
  const actualMinutes = actualMs / 60000;
  const diffMinutes   = actualMinutes - estimatedMinutes;
  const pct           = (diffMinutes / estimatedMinutes) * 100;
  return { diffMinutes, pct, actualMinutes, estimatedMinutes };
}

function computeStatus(currentStationMs, estimatedMinutes) {
  if (!currentStationMs) return 'On Track';
  if (estimatedMinutes) {
    const ratio = currentStationMs / (estimatedMinutes * 60000);
    if (ratio > 2.0) return 'Delayed';
    if (ratio > 1.2) return 'Slow';
    return 'On Track';
  }
  if (currentStationMs > 48 * 3600000) return 'Delayed';
  if (currentStationMs > 24 * 3600000) return 'Slow';
  return 'On Track';
}

function StatusBadge({ status }) {
  const map = {
    'On Track': { bg: 'var(--success-alpha)', color: 'var(--success-color)', border: 'var(--success-border)' },
    'Slow':     { bg: 'var(--warning-alpha)', color: 'var(--warning-color)', border: 'var(--warning-border)' },
    'Delayed':  { bg: 'var(--accent-alpha)',  color: 'var(--accent)',        border: 'var(--accent-border)'  },
  };
  const s = map[status] || map['On Track'];
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 20, padding: '3px 9px',
      fontSize: 10, fontWeight: 600,
      fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.03em',
    }}>
      {status}
    </span>
  );
}

function ApprovalBadge({ status }) {
  if (!status) return null;
  const s = status.toUpperCase();
  let bg, color, border, label;
  if (s.includes('APPROV')) {
    bg = 'var(--success-alpha)'; color = 'var(--success-color)';
    border = 'var(--success-border)'; label = '✓ Approved';
  } else if (s.includes('REJECT')) {
    bg = 'var(--accent-alpha)'; color = 'var(--accent)';
    border = 'var(--accent-border)'; label = '✗ Rejected';
  } else {
    bg = 'var(--warning-alpha)'; color = 'var(--warning-color)';
    border = 'var(--warning-border)'; label = '⏳ Pending';
  }
  return (
    <span style={{
      background: bg, color, border: `1px solid ${border}`,
      borderRadius: 20, padding: '3px 9px',
      fontSize: 10, fontWeight: 600,
      fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  );
}

function OHSFlag({ ohsIssue }) {
  if (!ohsIssue) return null;
  return (
    <span
      title={`OHS issue: ${ohsIssue}`}
      style={{
        background: 'var(--accent-alpha)', color: 'var(--accent-text)',
        border: '1px solid var(--accent-border)',
        borderRadius: 20, padding: '3px 9px',
        fontSize: 10, fontWeight: 600,
        fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.03em',
        cursor: 'help',
      }}
    >
      ⚠ OHS
    </span>
  );
}

function ProgressBar({ pct, colorRaw }) {
  const visual = Math.min(pct, 100);
  return (
    <div style={{ height: 5, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden', width: '100%' }}>
      <div style={{
        height: '100%', width: `${visual}%`,
        background: colorRaw, borderRadius: 3, transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

function VariancePill({ variance }) {
  if (!variance) return (
    <span style={{
      fontSize: 10, color: 'var(--text-dim)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      no estimate
    </span>
  );

  const { diffMinutes, pct } = variance;
  const over = diffMinutes > 0;

  let color, bg, border;
  if (!over || pct <= 20) {
    color = 'var(--success-color)'; bg = 'var(--success-alpha)'; border = 'var(--success-border)';
  } else if (pct <= 100) {
    color = 'var(--warning-color)'; bg = 'var(--warning-alpha)'; border = 'var(--warning-border)';
  } else {
    color = 'var(--accent)'; bg = 'var(--accent-alpha)'; border = 'var(--accent-border)';
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
        fontSize: 10, fontWeight: 600,
        fontFamily: "'Inter', system-ui, sans-serif",
        cursor: 'help',
      }}
    >
      {label} {over ? '▲' : '▼'}
    </span>
  );
}

function DwellBar({ actualMs, estimatedMinutes, colorRaw }) {
  if (!estimatedMinutes) {
    const pct = Math.min((actualMs / (72 * 3600000)) * 100, 100);
    return (
      <div style={{ height: 5, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colorRaw, borderRadius: 3 }} />
      </div>
    );
  }

  const estimatedMs = estimatedMinutes * 60000;
  const scale = estimatedMs * 3;
  const actualPct   = Math.min((actualMs   / scale) * 100, 100);
  const estimatePct = Math.min((estimatedMs / scale) * 100, 100);
  const over = actualMs > estimatedMs;

  return (
    <div style={{ position: 'relative', height: 5, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${actualPct}%`,
        background: over ? `linear-gradient(90deg, ${colorRaw}99, #dc2626)` : colorRaw,
        borderRadius: 3, transition: 'width 0.5s ease',
      }} />
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${estimatePct}%`, width: 2,
        background: 'rgba(255,255,255,0.5)', borderRadius: 1,
      }} />
    </div>
  );
}

// ── Summary metric card ──────────────────────────────────────────────────────
function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderTop: `2px solid ${color}`,
      borderRadius: 8, padding: '14px 16px',
      boxShadow: 'var(--shadow-card)',
      transition: 'background 0.25s ease',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {value}
      </div>
    </div>
  );
}

export default function BusReport({ buses, allRows, filter, stationTimes = {}, theme = 'dark', onOpenTravelCard }) {
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

        const estimatedMinutes = stationTimes[bus.stationCode] || null;
        const status   = computeStatus(currentStationMs, estimatedMinutes);
        const variance = getVariance(currentStationMs, estimatedMinutes);

        const latestRow      = history[history.length - 1] ?? null;
        const approvalStatus = latestRow?.approvalStatus ?? null;
        const ohsIssue       = latestRow?.ohsIssue       ?? null;

        return {
          vin: bus.vin,
          model: bus.model,
          stationCode: bus.stationCode,
          stationName: bus.station?.name || bus.stationCode || '—',
          lineName: LINES.find(l => l.id === lineId)?.label || lineId || '—',
          totalMs, currentStationMs,
          stationsVisited, lineStations, progressPct,
          status, variance, estimatedMinutes,
          firstEntry: firstTs,
          colors: getColors(bus.model),
          approvalStatus, ohsIssue,
        };
      })
      .sort((a, b) => (b.totalMs || 0) - (a.totalMs || 0));
  }, [buses, allRows, filter, stationTimes]);

  if (report.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32 }}>🚌</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em', fontWeight: 500 }}>
          NO BUSES ON FLOOR
        </div>
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

  const withEst  = report.filter(b => b.variance);
  const avgVarPct = withEst.length > 0
    ? Math.round(withEst.reduce((s, b) => s + b.variance.pct, 0) / withEst.length)
    : null;

  const pendingCount  = report.filter(b => b.approvalStatus && b.approvalStatus.toUpperCase().includes('PEND')).length;
  const rejectedCount = report.filter(b => b.approvalStatus && b.approvalStatus.toUpperCase().includes('REJECT')).length;
  const ohsCount      = report.filter(b => b.ohsIssue).length;

  const font = "'Inter', system-ui, sans-serif";

  return (
    <div style={{
      position: 'relative', margin: 'clamp(-16px, -2.2vw, -28px) clamp(-16px, -2.2vw, -32px)', padding: 'clamp(16px, 2.2vw, 28px) clamp(16px, 2.2vw, 32px)',
      backgroundImage: theme === 'dark' ? "url('/Bus background.png')" : "url('/Bus background 2.png')",
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
    }}>
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Summary cards ── */}
      <div className="report-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <SummaryCard label="Total on floor"    value={report.length}              color="var(--text-muted)" />
        <SummaryCard label="On Track"          value={onTrack}                    color="var(--success-color)" />
        <SummaryCard label="Slow (>120% est.)" value={slow}                       color="var(--warning-color)" />
        <SummaryCard label="Delayed (>2× est.)"value={delayed}                    color="var(--accent)" />
        <SummaryCard label="Avg progress"      value={`${avgProg}%`}              color="#3b82f6" />
        {avgVarPct !== null && (
          <SummaryCard
            label="Avg time variance"
            value={`${avgVarPct > 0 ? '+' : ''}${avgVarPct}%`}
            color={avgVarPct > 50 ? 'var(--accent)' : avgVarPct > 20 ? 'var(--warning-color)' : 'var(--success-color)'}
          />
        )}
        {pendingCount  > 0 && <SummaryCard label="Pending approval" value={pendingCount}  color="var(--warning-color)" />}
        {rejectedCount > 0 && <SummaryCard label="Rejected"         value={rejectedCount} color="var(--accent)" />}
        {ohsCount      > 0 && <SummaryCard label="OHS issues"       value={ohsCount}      color="var(--accent-text)" />}
      </div>

      {/* ── Bus rows ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {report.map(bus => (
          <div key={bus.vin} className="report-row-grid" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${bus.colors.borderRaw}`,
            borderRadius: '0 8px 8px 0',
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'minmax(180px,1.6fr) minmax(0,1.1fr) minmax(0,0.9fr) minmax(0,0.75fr) minmax(0,0.7fr) minmax(0,0.75fr) minmax(80px,auto)',
            gap: 8,
            alignItems: 'center',
            boxShadow: 'var(--shadow-card)',
            transition: 'background 0.2s ease',
          }}>

            {/* VIN + model */}
            <div style={{ minWidth: 0 }}>
              <div style={{ marginBottom: 5 }}>
                <span style={{
                  background: bus.colors.badge,
                  color: bus.colors.text,
                  border: `1px solid ${bus.colors.borderRaw}44`,
                  borderRadius: 4, padding: '2px 7px',
                  fontSize: 9, fontWeight: 700,
                  fontFamily: font, letterSpacing: '0.05em',
                  display: 'inline-block', textTransform: 'uppercase',
                }}>
                  {bus.model}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-heading)', fontFamily: font, fontWeight: 600, letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bus.vin}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: font, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bus.lineName}
              </div>
            </div>

            {/* Current station */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: font, letterSpacing: '0.05em', marginBottom: 3, textTransform: 'uppercase', fontWeight: 500 }}>Station</div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bus.stationName}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: font }}>{bus.stationCode}</div>
            </div>

            {/* Time at station */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: font, letterSpacing: '0.05em', marginBottom: 3, textTransform: 'uppercase', fontWeight: 500 }}>At Station</div>
              <div style={{
                fontSize: 14, fontWeight: 700, fontFamily: font,
                color: bus.status === 'Delayed' ? 'var(--accent)' : bus.status === 'Slow' ? 'var(--warning-color)' : 'var(--text-heading)',
                marginBottom: 5,
              }}>
                {fmt(bus.currentStationMs)}
              </div>
              <DwellBar actualMs={bus.currentStationMs} estimatedMinutes={bus.estimatedMinutes} colorRaw={bus.colors.borderRaw} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                {bus.estimatedMinutes ? (
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: font }}>est. {bus.estimatedMinutes}m</span>
                ) : (
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: font }}>no est.</span>
                )}
                <VariancePill variance={bus.variance} />
              </div>
            </div>

            {/* Total on floor */}
            <div className="report-col-total" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: font, letterSpacing: '0.05em', marginBottom: 3, textTransform: 'uppercase', fontWeight: 500 }}>Total</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: font }}>{fmt(bus.totalMs)}</div>
            </div>

            {/* First entry */}
            <div className="report-col-firstentry" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: font, letterSpacing: '0.05em', marginBottom: 3, textTransform: 'uppercase', fontWeight: 500 }}>First Entry</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>{fmtShortDate(bus.firstEntry)}</div>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: font, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500 }}>Prog.</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: font }}>
                  {Math.min(bus.stationsVisited, bus.lineStations)}/{bus.lineStations}
                </span>
              </div>
              <ProgressBar pct={bus.progressPct} colorRaw={bus.colors.borderRaw} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: font }}>{bus.progressPct}%</div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <StatusBadge status={bus.status} />
              <ApprovalBadge status={bus.approvalStatus} />
              <OHSFlag ohsIssue={bus.ohsIssue} />
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        fontSize: 10, color: 'var(--text-dim)', fontFamily: font,
        letterSpacing: '0.03em', display: 'flex', gap: 20, flexWrap: 'wrap',
        borderTop: '1px solid var(--border)', paddingTop: 12,
      }}>
        <span>● On Track = within 120% of estimated time</span>
        <span>● Slow = 120–200% of estimated time</span>
        <span>● Delayed = &gt;200% of estimated time</span>
        <span style={{ marginLeft: 'auto' }}>▏ white marker on bar = estimated time target</span>
      </div>
    </div>
    </div>
  );
}
