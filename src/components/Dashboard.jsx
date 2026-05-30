import { useMemo } from 'react';
import { LINES, STATIONS } from '../data/stations';

// ── helper: does model belong to a family? ──────────────────
// "10.5m KDC".toUpperCase().includes("KDC") → true
const isKDC = (model = '') => model.toUpperCase().includes('KDC');
const isEVS = (model = '') => model.toUpperCase().includes('EVS');

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'rgba(13,21,38,0.8)',
      border: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
      borderRadius: 8,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{
        fontSize: 10, color: '#475569',
        textTransform: 'uppercase', letterSpacing: '0.12em',
        fontFamily: "'Space Mono', monospace",
      }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent || '#f1f5f9', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#475569', marginTop: 2, fontFamily: "'Space Mono', monospace" }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: "'Syne', sans-serif" }}>{label}</span>
        <span style={{ fontSize: 11, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>{sub || value}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: color, borderRadius: 3,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, color: '#334155',
      textTransform: 'uppercase', letterSpacing: '0.14em',
      fontFamily: "'Space Mono', monospace",
      marginBottom: 12,
      paddingBottom: 8,
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {children}
    </div>
  );
}

export default function Dashboard({ buses, allRows }) {
  const metrics = useMemo(() => {
    const total     = buses.length;
    // ✅ fixed: use .includes() not exact match
    const kdcCount  = buses.filter(b => isKDC(b.model)).length;
    const evsCount  = buses.filter(b => isEVS(b.model)).length;
    const otherCount = total - kdcCount - evsCount;

    // Production rate: unique VINs that reached a QA station in last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const completedVins = new Set(
      allRows
        .filter(r => r.stationCode?.startsWith('Q') &&
                     new Date(r.rawTimestamp || 0).getTime() > sevenDaysAgo)
        .map(r => r.vin)
    );
    const prodRate = (completedVins.size / 7).toFixed(1);

    // Dwell time per station
    const dwellByStation  = {};
    const countByStation  = {};
    const vinRows = {};
    for (const row of allRows) {
      if (!vinRows[row.vin]) vinRows[row.vin] = [];
      vinRows[row.vin].push(row);
    }
    for (const rows of Object.values(vinRows)) {
      const sorted = [...rows].sort((a, b) =>
        new Date(a.rawTimestamp || 0) - new Date(b.rawTimestamp || 0)
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const code  = sorted[i].stationCode;
        const t1    = new Date(sorted[i].rawTimestamp   || 0).getTime();
        const t2    = new Date(sorted[i+1].rawTimestamp || 0).getTime();
        const dwell = (t2 - t1) / 3600000;
        if (dwell > 0 && dwell < 72) {
          dwellByStation[code]  = (dwellByStation[code]  || 0) + dwell;
          countByStation[code]  = (countByStation[code]  || 0) + 1;
        }
      }
    }
    const avgDwell = {};
    for (const code of Object.keys(dwellByStation)) {
      avgDwell[code] = dwellByStation[code] / countByStation[code];
    }

    // Best / worst station (only known stations)
    const dwellEntries = Object.entries(avgDwell)
      .filter(([code]) => STATIONS[code])
      .sort((a, b) => a[1] - b[1]);
    const bestStation  = dwellEntries[0]
      ? { code: dwellEntries[0][0], hours: dwellEntries[0][1], name: STATIONS[dwellEntries[0][0]]?.name }
      : null;
    const worstStation = dwellEntries[dwellEntries.length - 1]
      ? { code: dwellEntries[dwellEntries.length-1][0], hours: dwellEntries[dwellEntries.length-1][1], name: STATIONS[dwellEntries[dwellEntries.length-1][0]]?.name }
      : null;

    // Best / worst line
    const lineDwell  = {};
    const lineCount2 = {};
    for (const [code, hours] of Object.entries(avgDwell)) {
      const st = STATIONS[code];
      if (!st) continue;
      lineDwell[st.line]  = (lineDwell[st.line]  || 0) + hours;
      lineCount2[st.line] = (lineCount2[st.line] || 0) + 1;
    }
    const lineAvg     = {};
    for (const lid of Object.keys(lineDwell)) {
      lineAvg[lid] = lineDwell[lid] / lineCount2[lid];
    }
    const lineEntries = Object.entries(lineAvg).sort((a, b) => a[1] - b[1]);
    const getLabel    = id => LINES.find(l => l.id === id)?.label || id;
    const bestLine    = lineEntries[0]
      ? { id: lineEntries[0][0], hours: lineEntries[0][1], label: getLabel(lineEntries[0][0]) }
      : null;
    const worstLine   = lineEntries[lineEntries.length-1]
      ? { id: lineEntries[lineEntries.length-1][0], hours: lineEntries[lineEntries.length-1][1], label: getLabel(lineEntries[lineEntries.length-1][0]) }
      : null;

    // Buses per line
    const busesByLine = {};
    for (const bus of buses) {
      const lid = bus.station?.line;
      if (lid) busesByLine[lid] = (busesByLine[lid] || 0) + 1;
    }

    // Buses per model (full breakdown)
    const byModel = {};
    for (const bus of buses) {
      byModel[bus.model] = (byModel[bus.model] || 0) + 1;
    }

    return { total, kdcCount, evsCount, otherCount, prodRate, bestStation, worstStation, bestLine, worstLine, busesByLine, avgDwell, byModel };
  }, [buses, allRows]);

  const lineDistribution = LINES
    .map(l => ({ ...l, count: metrics.busesByLine[l.id] || 0 }))
    .filter(l => l.count > 0)
    .sort((a, b) => b.count - a.count);

  const maxLineCount = Math.max(...lineDistribution.map(l => l.count), 1);

  const modelEntries = Object.entries(metrics.byModel).sort((a, b) => b[1] - a[1]);
  const maxModelCount = Math.max(...modelEntries.map(e => e[1]), 1);

  const lineColors = {
    MACHINE: '#64748b', BODY: '#8b5cf6', BODY_KDC: '#7c3aed',
    FRAME: '#f97316', ELECTRO: '#06b6d4', PAINT: '#ec4899',
    CHASSIS1: '#10b981', CHASSIS2: '#059669', TRIM: '#3b82f6', QA: '#ef4444',
  };

  const modelColor = (model = '') => {
    if (isKDC(model)) return '#dc2626';
    if (isEVS(model)) return '#38bdf8';
    return '#64748b';
  };

  const card = (bg, border) => ({
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: '16px 20px',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Top metrics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <MetricCard label="Total on floor"  value={metrics.total}     sub="all active buses"       accent="#475569" />
        <MetricCard label="KDC units"        value={metrics.kdcCount}  sub="on production floor"    accent="#dc2626" />
        <MetricCard label="EVS units"        value={metrics.evsCount}  sub="on production floor"    accent="#38bdf8" />
        <MetricCard label="Prod. rate"       value={`${metrics.prodRate}/day`} sub="7-day rolling avg" accent="#10b981" />
      </div>

      {/* ── Model breakdown + Line distribution side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Model breakdown */}
        <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '20px 22px' }}>
          <SectionTitle>Buses by model</SectionTitle>
          {modelEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: '#334155', fontFamily: "'Space Mono', monospace" }}>No buses on floor</div>
          ) : modelEntries.map(([model, count]) => (
            <BarRow
              key={model}
              label={model}
              value={count}
              max={maxModelCount}
              color={modelColor(model)}
              sub={`${count} bus${count !== 1 ? 'es' : ''}`}
            />
          ))}
        </div>

        {/* Line distribution */}
        <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '20px 22px' }}>
          <SectionTitle>Buses by line</SectionTitle>
          {lineDistribution.length === 0 ? (
            <div style={{ fontSize: 12, color: '#334155', fontFamily: "'Space Mono', monospace" }}>No buses on tracked lines</div>
          ) : lineDistribution.map((line, idx) => (
            <BarRow
              key={line.id}
              label={line.label}
              value={line.count}
              max={maxLineCount}
              color={lineColors[line.id] || '#64748b'}
              sub={`${line.count} bus${line.count !== 1 ? 'es' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* ── Performance highlights ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={card('rgba(16,185,129,0.07)', 'rgba(16,185,129,0.2)')}>
          <div style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
            ↑ Best station
          </div>
          {metrics.bestStation ? (
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{metrics.bestStation.name}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 5, fontFamily: "'Space Mono', monospace" }}>
                {metrics.bestStation.code} · avg {metrics.bestStation.hours.toFixed(1)}h dwell
              </div>
            </>
          ) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
        </div>

        <div style={card('rgba(220,38,38,0.07)', 'rgba(220,38,38,0.2)')}>
          <div style={{ fontSize: 10, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
            ↓ Slowest station
          </div>
          {metrics.worstStation ? (
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{metrics.worstStation.name}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 5, fontFamily: "'Space Mono', monospace" }}>
                {metrics.worstStation.code} · avg {metrics.worstStation.hours.toFixed(1)}h dwell
              </div>
            </>
          ) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
        </div>

        <div style={card('rgba(16,185,129,0.07)', 'rgba(16,185,129,0.2)')}>
          <div style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
            ↑ Best line
          </div>
          {metrics.bestLine ? (
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{metrics.bestLine.label}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 5, fontFamily: "'Space Mono', monospace" }}>
                avg {metrics.bestLine.hours.toFixed(1)}h per station
              </div>
            </>
          ) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
        </div>

        <div style={card('rgba(220,38,38,0.07)', 'rgba(220,38,38,0.2)')}>
          <div style={{ fontSize: 10, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
            ↓ Slowest line
          </div>
          {metrics.worstLine ? (
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{metrics.worstLine.label}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 5, fontFamily: "'Space Mono', monospace" }}>
                avg {metrics.worstLine.hours.toFixed(1)}h per station
              </div>
            </>
          ) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
        </div>
      </div>

      {/* ── No history notice ── */}
      {allRows.length === 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.07)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 6, padding: '12px 16px',
          fontSize: 11, color: '#fbbf24',
          fontFamily: "'Space Mono', monospace",
          letterSpacing: '0.04em',
        }}>
          ⚠ Performance metrics require historical data. They will populate as your travel tool logs more moves.
        </div>
      )}
    </div>
  );
}
