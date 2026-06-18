import { useMemo, useRef, useState } from 'react';
import { LINES, STATIONS } from '../data/stations';
import ExportPanel from './ExportPanel';
import Presentation from './Presentation';

const isKDC = (m = '') => m.toUpperCase().includes('KDC');
const isEVS = (m = '') => m.toUpperCase().includes('EVS');

// ── Tiny helpers ─────────────────────────────────────────
function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${accent ? accent + '44' : 'var(--border-subtle)'}`,
      borderTop: `2px solid ${accent || 'var(--border-medium)'}`,
      borderRadius: 8, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center',
      boxShadow: 'var(--shadow-card)',
      transition: 'background 0.25s ease',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent || 'var(--text-heading)', lineHeight: 1.05, letterSpacing: '-0.5px' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif" }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif" }}>{sub || value}</span>
      </div>
      <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.14em',
      fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 12,
      paddingBottom: 8, borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  );
}

function PerfCard({ title, name, detail, accent, subDetail }) {
  return (
    <div style={{
      background: `rgba(${accent === 'green' ? '16,185,129' : '220,38,38'},0.07)`,
      border: `1px solid rgba(${accent === 'green' ? '16,185,129' : '220,38,38'},0.2)`,
      borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 9, color: accent === 'green' ? '#10b981' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 8 }}>
        {title}
      </div>
      {name
        ? <>
            <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{name}</div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>{detail}</div>
            {subDetail && <div style={{ fontSize: 9, color: '#334155', marginTop: 2, fontFamily: "'Inter', system-ui, sans-serif" }}>{subDetail}</div>}
          </>
        : <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Inter', system-ui, sans-serif" }}>Not enough data yet</div>
      }
    </div>
  );
}



// ── Production Trend SVG chart ───────────────────────────
function ProductionTrendChart({ data }) {
  const W = 600, H = 160;
  const pad = { top: 24, right: 16, bottom: 36, left: 28 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const n = data.length;
  if (n < 2) return null;

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const xOf = (i) => pad.left + (i / (n - 1)) * cw;
  const yOf = (v) => pad.top + ch - (v / maxCount) * ch;

  const pts = data.map((d, i) => `${xOf(i)},${yOf(d.count)}`).join(' ');
  const areaPts = `${xOf(0)},${yOf(0)} ${pts} ${xOf(n - 1)},${yOf(0)}`;

  const yTicks = [];
  const step = maxCount <= 5 ? 1 : Math.ceil(maxCount / 5);
  for (let v = 0; v <= maxCount; v += step) yTicks.push(v);
  if (yTicks[yTicks.length - 1] !== maxCount) yTicks.push(maxCount);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yTicks.map(v => (
        <g key={v}>
          <line x1={pad.left} y1={yOf(v)} x2={W - pad.right} y2={yOf(v)} stroke="rgba(148,163,184,0.1)" strokeWidth={1} />
          <text x={pad.left - 5} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill="var(--text-dim)" fontFamily="'Inter',system-ui">{v}</text>
        </g>
      ))}
      <polygon points={areaPts} fill="rgba(59,130,246,0.08)" />
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d.key}>
          <circle cx={xOf(i)} cy={yOf(d.count)} r={d.count > 0 ? 4 : 2.5}
            fill={d.count > 0 ? '#3b82f6' : 'rgba(148,163,184,0.2)'}
            stroke="var(--bg-surface)" strokeWidth={1.5} />
          {d.count > 0 && (
            <text x={xOf(i)} y={yOf(d.count) - 9} textAnchor="middle" fontSize={9}
              fill="#3b82f6" fontWeight={700} fontFamily="'Inter',system-ui">{d.count}</text>
          )}
          {i % 2 === 0 && (
            <text x={xOf(i)} y={H - 4} textAnchor="middle" fontSize={8}
              fill="var(--text-dim)" fontFamily="'Inter',system-ui">{d.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Main Dashboard export ────────────────────────────────
export default function Dashboard({ buses: busesProp, allRows: allRowsProp, stationTimes = {}, theme = 'dark' }) {
  // Guard against undefined during initial render before sheet data loads
  const buses   = Array.isArray(busesProp)   ? busesProp   : [];
  const allRows = Array.isArray(allRowsProp) ? allRowsProp : [];

  const dashboardRef = useRef(null);
  const slideRef     = useRef(null);
  const [presenting, setPresenting] = useState(false);

  const metrics = useMemo(() => {
    const total      = buses.length;
    const kdcCount   = buses.filter(b => isKDC(b.model)).length;
    const evsCount   = buses.filter(b => isEVS(b.model)).length;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const completedVins = new Set(
      allRows.filter(r => r.stationCode?.startsWith('Q') &&
        new Date(r.rawTimestamp || 0).getTime() > sevenDaysAgo).map(r => r.vin)
    );
    const prodRate = (completedVins.size / 7).toFixed(1);

    const dwellByStation = {}, countByStation = {}, vinRows = {};
    for (const row of allRows) {
      if (!vinRows[row.vin]) vinRows[row.vin] = [];
      vinRows[row.vin].push(row);
    }
    for (const rows of Object.values(vinRows)) {
      const sorted = [...rows].sort((a, b) => new Date(a.rawTimestamp || 0) - new Date(b.rawTimestamp || 0));
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

    const stationPerf = Object.entries(avgDwell)
      .filter(([code]) => STATIONS[code])
      .map(([code, hours]) => {
        const estimated = stationTimes[code];
        const estimatedHours = estimated ? estimated / 60 : null;
        const variancePct = estimatedHours
          ? Math.round(((hours - estimatedHours) / estimatedHours) * 100)
          : null;
        const efficiency = estimatedHours
          ? Math.round((estimatedHours / hours) * 100)
          : null;
        return {
          code, hours,
          name: STATIONS[code]?.name,
          line: STATIONS[code]?.line,
          estimatedHours, variancePct, efficiency,
          sortKey: variancePct !== null ? variancePct : hours,
        };
      });

    const sorted = [...stationPerf].sort((a, b) => a.sortKey - b.sortKey);
    const bestStation  = sorted[0]  || null;
    const worstStation = sorted[sorted.length - 1] || null;

    const lineDwell = {}, lineCount2 = {}, lineVarianceSum = {}, lineVarianceCount = {};
    for (const { code, hours, variancePct } of stationPerf) {
      const st = STATIONS[code];
      if (!st) continue;
      lineDwell[st.line]  = (lineDwell[st.line]  || 0) + hours;
      lineCount2[st.line] = (lineCount2[st.line] || 0) + 1;
      if (variancePct !== null) {
        lineVarianceSum[st.line]   = (lineVarianceSum[st.line]   || 0) + variancePct;
        lineVarianceCount[st.line] = (lineVarianceCount[st.line] || 0) + 1;
      }
    }

    const linePerf = Object.keys(lineDwell).map(lid => {
      const hours       = lineDwell[lid] / lineCount2[lid];
      const variancePct = lineVarianceCount[lid]
        ? Math.round(lineVarianceSum[lid] / lineVarianceCount[lid])
        : null;
      return {
        id: lid, hours, variancePct,
        label: LINES.find(l => l.id === lid)?.label || lid,
        sortKey: variancePct !== null ? variancePct : hours,
      };
    }).sort((a, b) => a.sortKey - b.sortKey);

    const bestLine  = linePerf[0]                   || null;
    const worstLine = linePerf[linePerf.length - 1] || null;

    const busesByLine = {}, byModel = {};
    for (const bus of buses) {
      const lid = bus.station?.line;
      if (lid) busesByLine[lid] = (busesByLine[lid] || 0) + 1;
      byModel[bus.model] = (byModel[bus.model] || 0) + 1;
    }

    // ── Phase 3: Overrun Pareto ──────────────────────────────
    // Aggregate overrunMin from rows that have it (written by Phase 2 Apps Script).
    // Produces two ranked lists: by station and by production line.
    const overrunByStation = {}, overrunCountByStation = {};
    for (const row of allRows) {
      if (!row.overrunMin || row.overrunMin <= 0) continue;
      const code = row.stationCode;
      overrunByStation[code]      = (overrunByStation[code]      || 0) + row.overrunMin;
      overrunCountByStation[code] = (overrunCountByStation[code] || 0) + 1;
    }
    const overrunPareto = Object.entries(overrunByStation)
      .filter(([code]) => STATIONS[code])
      .map(([code, totalMin]) => ({
        code,
        name:       STATIONS[code]?.name || code,
        line:       STATIONS[code]?.line,
        lineName:   LINES.find(l => l.id === STATIONS[code]?.line)?.label || STATIONS[code]?.line || '—',
        totalMin,
        count:      overrunCountByStation[code],
        avgMin:     Math.round(totalMin / overrunCountByStation[code]),
      }))
      .sort((a, b) => b.totalMin - a.totalMin)
      .slice(0, 8); // top 8 stations

    // ── Phase 4: Downtime Pareto ────────────────────────────
    const downtimeByReason = {}, downtimeByStation = {}, downtimeStationCount = {};
    let totalDowntimeMin = 0;
    for (const row of allRows) {
      if (!row.downtimeMin || row.downtimeMin <= 0) continue;
      totalDowntimeMin += row.downtimeMin;
      const reason = row.downtimeReason || 'Unspecified';
      downtimeByReason[reason] = (downtimeByReason[reason] || 0) + row.downtimeMin;
      if (row.stationCode && STATIONS[row.stationCode]) {
        downtimeByStation[row.stationCode]      = (downtimeByStation[row.stationCode]      || 0) + row.downtimeMin;
        downtimeStationCount[row.stationCode]   = (downtimeStationCount[row.stationCode]   || 0) + 1;
      }
    }
    const downtimePareto = Object.entries(downtimeByReason)
      .map(([reason, mins]) => ({ reason, mins, pct: totalDowntimeMin > 0 ? Math.round((mins / totalDowntimeMin) * 100) : 0 }))
      .sort((a, b) => b.mins - a.mins);
    let cumPct = 0;
    for (const d of downtimePareto) { cumPct += d.pct; d.cumPct = Math.min(cumPct, 100); }

    // ── Phase 4: Rework + First Pass Yield ──────────────────
    const reworkByStation = {};
    const reworkVins = new Set(), completedVinsAll = new Set();
    for (const row of allRows) {
      if (row.stationCode?.startsWith('Q')) completedVinsAll.add(row.vin);
      if (row.reworkFlag === true) {
        reworkVins.add(row.vin);
        if (row.stationCode && STATIONS[row.stationCode]) {
          reworkByStation[row.stationCode] = (reworkByStation[row.stationCode] || 0) + (row.reworkHrs || 0);
        }
      }
    }
    const hasReworkData = allRows.some(r => r.reworkFlag !== null);
    const hasDowntimeData = totalDowntimeMin > 0;
    const firstPassYield = hasReworkData && completedVinsAll.size > 0
      ? Math.round(((completedVinsAll.size - reworkVins.size) / completedVinsAll.size) * 100)
      : null;
    const reworkByStationList = Object.entries(reworkByStation)
      .map(([code, hrs]) => ({ code, name: STATIONS[code]?.name || code, line: STATIONS[code]?.line, hrs }))
      .sort((a, b) => b.hrs - a.hrs);

    const stationEfficiency = [...stationPerf]
      .sort((a, b) => {
        if (a.efficiency !== null && b.efficiency !== null) return a.efficiency - b.efficiency;
        if (a.efficiency !== null) return -1;
        if (b.efficiency !== null) return 1;
        return b.hours - a.hours;
      });

    return {
      total, kdcCount, evsCount, prodRate,
      bestStation, worstStation, bestLine, worstLine,
      busesByLine, avgDwell, byModel,
      overrunPareto, stationEfficiency,
      downtimePareto, totalDowntimeMin, hasDowntimeData,
      firstPassYield, hasReworkData, reworkByStationList,
    };
  }, [buses, allRows, stationTimes]);

  // Weekly production trend — always uses unfiltered allRows so trend is stable
  const weeklyProduction = useMemo(() => {
    function isoWeekKey(ts) {
      const d = new Date(ts);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() + 4 - day);
      const yearStart = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    // First QA-station timestamp per VIN
    const qaByVin = {};
    for (const row of (Array.isArray(allRows) ? allRows : [])) {
      if (!row.stationCode?.toUpperCase().startsWith('Q') || !row.rawTimestamp) continue;
      const ts = new Date(row.rawTimestamp).getTime();
      if (isNaN(ts)) continue;
      if (!qaByVin[row.vin] || ts < qaByVin[row.vin]) qaByVin[row.vin] = ts;
    }
    const weekCounts = {};
    for (const ts of Object.values(qaByVin)) {
      const k = isoWeekKey(ts);
      weekCounts[k] = (weekCounts[k] || 0) + 1;
    }
    const seen = new Set();
    const result = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.now() - i * 7 * 86400000);
      const key = isoWeekKey(d.getTime());
      if (seen.has(key)) continue;
      seen.add(key);
      const day = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - day + 1);
      result.push({
        key,
        label: monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        count: weekCounts[key] || 0,
      });
    }
    return result;
  }, [allRows]);

  const lineDistribution = LINES.map(l => ({ ...l, count: metrics.busesByLine[l.id] || 0 })).filter(l => l.count > 0).sort((a, b) => b.count - a.count);
  const maxLineCount     = Math.max(...lineDistribution.map(l => l.count), 1);
  const modelEntries     = Object.entries(metrics.byModel).sort((a, b) => b[1] - a[1]);
  const maxModelCount    = Math.max(...modelEntries.map(e => e[1]), 1);

  const lineColors = {
    MACHINE: '#64748b', BODY: '#8b5cf6', BODY_KDC: '#7c3aed',
    FRAME: '#f97316', ELECTRO: '#06b6d4', PAINT: '#ec4899',
    CHASSIS1: '#10b981', CHASSIS2: '#059669', TRIM: '#3b82f6', QA: '#ef4444',
  };
  const modelColor = (model = '') => isKDC(model) ? '#dc2626' : isEVS(model) ? '#38bdf8' : '#64748b';
  const card = (accentRgb, borderVar) => ({
    background: 'var(--bg-surface)',
    border: `1px solid ${borderVar}`,
    borderLeft: `3px solid ${accentRgb}`,
    borderRadius: 8,
    padding: '14px 18px',
    boxShadow: 'var(--shadow-card)',
    transition: 'background 0.25s ease',
  });

  const hasEstimates = Object.keys(stationTimes).length > 0;

  return (
    <>
      {/* Presentation modal */}
      {presenting && (
        <Presentation
          buses={buses}
          allRows={allRows}
          metrics={metrics}
          stationTimes={stationTimes}
          onClose={() => setPresenting(false)}
        />
      )}

      <div ref={dashboardRef} style={{
        position: 'relative',
        backgroundImage: theme === 'dark' ? "url('/Bus background.png')" : "url('/Bus background 2.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 72, paddingTop: 16 }}>

          {/* ── Export panel (fixed at bottom, no flow space) ── */}
          <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'visible' }}>
            <ExportPanel
              buses={buses} allRows={allRows} metrics={metrics}
              dashboardRef={dashboardRef} slideRef={slideRef}
              onPresent={() => setPresenting(true)}
              stationTimes={stationTimes}
              theme={theme}
            />
          </div>

          {/* Top metrics */}
          <div className="dashboard-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <MetricCard label="Total on floor"  value={metrics.total}             sub="all active buses"    accent="#475569" />
            <MetricCard label="KDC units"       value={metrics.kdcCount}          sub="on production floor" accent="#dc2626" />
            <MetricCard label="EVS units"       value={metrics.evsCount}          sub="on production floor" accent="#38bdf8" />
            <MetricCard label="Prod. rate"      value={`${metrics.prodRate}/day`} sub="7-day rolling avg"   accent="#10b981" />
            {metrics.firstPassYield !== null && (
              <MetricCard
                label="First Pass Yield"
                value={`${metrics.firstPassYield}%`}
                sub="no-rework buses"
                accent={metrics.firstPassYield >= 90 ? '#10b981' : metrics.firstPassYield >= 75 ? '#f59e0b' : '#dc2626'}
              />
            )}
          </div>

          {/* Model + Line distribution */}
          <div className="dashboard-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '18px 20px', boxShadow: 'var(--shadow-card)', transition: 'background 0.25s ease' }}>
              <SectionTitle>Buses by model</SectionTitle>
              {modelEntries.length === 0
                ? <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>No buses on floor</div>
                : modelEntries.map(([model, count]) => (
                  <BarRow key={model} label={model} value={count} max={maxModelCount} color={modelColor(model)} sub={`${count} bus${count !== 1 ? 'es' : ''}`} />
                ))}
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '18px 20px', boxShadow: 'var(--shadow-card)', transition: 'background 0.25s ease' }}>
              <SectionTitle>Buses by line</SectionTitle>
              {lineDistribution.length === 0
                ? <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>No buses on tracked lines</div>
                : lineDistribution.map(line => (
                  <BarRow key={line.id} label={line.label} value={line.count} max={maxLineCount} color={lineColors[line.id] || '#64748b'} sub={`${line.count} bus${line.count !== 1 ? 'es' : ''}`} />
                ))}
            </div>
          </div>

          {/* Performance highlights */}
          <div className="dashboard-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={card('var(--success-color)', 'var(--success-border)')}>
              <div style={{ fontSize: 9, color: 'var(--success-color)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 8 }}>
                ↑ Best station {hasEstimates ? '(by variance vs estimate)' : '(by avg dwell)'}
              </div>
              {metrics.bestStation ? (<>
                <div style={{ fontSize: 13, color: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.4 }}>{metrics.bestStation.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>
                  {metrics.bestStation.code} · avg {metrics.bestStation.hours.toFixed(1)}h actual
                </div>
                {metrics.bestStation.estimatedHours != null && (
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--success-color)', fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1 }}>
                      {metrics.bestStation.efficiency}%
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>
                      efficient · est. {metrics.bestStation.estimatedHours.toFixed(1)}h
                    </span>
                  </div>
                )}
              </>) : <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>Not enough data yet</div>}
            </div>

            <div style={card('var(--accent)', 'var(--accent-border)')}>
              <div style={{ fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 8 }}>
                ↓ Slowest station {hasEstimates ? '(by variance vs estimate)' : '(by avg dwell)'}
              </div>
              {metrics.worstStation ? (<>
                <div style={{ fontSize: 13, color: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.4 }}>{metrics.worstStation.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>
                  {metrics.worstStation.code} · avg {metrics.worstStation.hours.toFixed(1)}h actual
                </div>
                {metrics.worstStation.estimatedHours != null && (
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1 }}>
                      {metrics.worstStation.efficiency}%
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>
                      efficient · est. {metrics.worstStation.estimatedHours.toFixed(1)}h
                    </span>
                  </div>
                )}
              </>) : <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>Not enough data yet</div>}
            </div>

            <div style={card('var(--success-color)', 'var(--success-border)')}>
              <div style={{ fontSize: 9, color: 'var(--success-color)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 8 }}>
                ↑ Best line {hasEstimates ? '(avg variance vs estimate)' : '(avg dwell)'}
              </div>
              {metrics.bestLine ? (<>
                <div style={{ fontSize: 13, color: 'var(--text-heading)', fontWeight: 600 }}>{metrics.bestLine.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>
                  avg {metrics.bestLine.hours.toFixed(1)}h per station
                </div>
                {metrics.bestLine.variancePct != null && (() => {
                  const eff = Math.round(100 / (1 + metrics.bestLine.variancePct / 100));
                  return (
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--success-color)', fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1 }}>{eff}%</span>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>avg efficiency</span>
                    </div>
                  );
                })()}
              </>) : <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>Not enough data yet</div>}
            </div>

            <div style={card('var(--accent)', 'var(--accent-border)')}>
              <div style={{ fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 8 }}>
                ↓ Slowest line {hasEstimates ? '(avg variance vs estimate)' : '(avg dwell)'}
              </div>
              {metrics.worstLine ? (<>
                <div style={{ fontSize: 13, color: 'var(--text-heading)', fontWeight: 600 }}>{metrics.worstLine.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>
                  avg {metrics.worstLine.hours.toFixed(1)}h per station
                </div>
                {metrics.worstLine.variancePct != null && (() => {
                  const eff = Math.round(100 / (1 + metrics.worstLine.variancePct / 100));
                  return (
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1 }}>{eff}%</span>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>avg efficiency</span>
                    </div>
                  );
                })()}
              </>) : <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>Not enough data yet</div>}
            </div>
          </div>

          {/* ── Phase 3: Overrun Pareto chart ── */}
          {metrics.overrunPareto.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '18px 20px', boxShadow: 'var(--shadow-card)', transition: 'background 0.25s ease' }}>
              <div style={{
                fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em',
                fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 14,
                paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>Overrun by Station — top {metrics.overrunPareto.length} (total overrun minutes)</span>
                <span style={{ color: 'var(--text-dim)' }}>from travel card data</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const maxMin = metrics.overrunPareto[0]?.totalMin || 1;
                  return metrics.overrunPareto.map((item, idx) => {
                    const pct = Math.min((item.totalMin / maxMin) * 100, 100);
                    const lineColor = lineColors[item.line] || '#64748b';
                    const hours = Math.floor(item.totalMin / 60);
                    const mins  = Math.round(item.totalMin % 60);
                    const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                    return (
                      <div key={item.code} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,2fr) minmax(0,3fr) 64px 52px', gap: 10, alignItems: 'center' }}>
                        {/* Rank */}
                        <div style={{ fontSize: 9, color: idx === 0 ? 'var(--accent)' : 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, textAlign: 'right' }}>
                          #{idx + 1}
                        </div>
                        {/* Station name */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                          <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", marginTop: 1 }}>
                            {item.code} · <span style={{ color: lineColor }}>{item.lineName}</span>
                          </div>
                        </div>
                        {/* Bar */}
                        <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${pct}%`,
                            background: idx === 0
                              ? 'linear-gradient(90deg, #dc2626, #f87171)'
                              : `linear-gradient(90deg, ${lineColor}99, ${lineColor})`,
                            borderRadius: 3, transition: 'width 0.5s ease',
                          }} />
                        </div>
                        {/* Total overrun */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: idx === 0 ? 'var(--accent-text)' : 'var(--text-secondary)', fontFamily: "'Inter', system-ui, sans-serif", textAlign: 'right' }}>
                          {label}
                        </div>
                        {/* Occurrences */}
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", textAlign: 'right' }}>
                          {item.count}× avg {item.avgMin}m
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div style={{ marginTop: 12, fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em' }}>
                ● Bar length = total overrun minutes · count = number of travel cards with an overrun at that station
              </div>
            </div>
          )}

          {/* ── Downtime Pareto ── */}
          {metrics.hasDowntimeData && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '18px 20px', boxShadow: 'var(--shadow-card)', transition: 'background 0.25s ease' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Downtime by Reason — Pareto</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {Math.floor(metrics.totalDowntimeMin / 60)}h {Math.round(metrics.totalDowntimeMin % 60)}m total
                </span>
              </div>
              {(() => {
                const maxMins = metrics.downtimePareto[0]?.mins || 1;
                const W = 600, H = 24;
                const chartH = metrics.downtimePareto.length * 44 + 32;
                return (
                  <div style={{ position: 'relative' }}>
                    {metrics.downtimePareto.map((d, i) => {
                      const barPct = (d.mins / maxMins) * 100;
                      const hrs = Math.floor(d.mins / 60);
                      const mins = Math.round(d.mins % 60);
                      const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                      const barColor = i === 0 ? '#dc2626' : i === 1 ? '#f97316' : i === 2 ? '#f59e0b' : '#64748b';
                      return (
                        <div key={d.reason} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) 52px 40px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.reason}</div>
                          <div style={{ height: 8, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 4, transition: 'width 0.5s ease' }} />
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: barColor, textAlign: 'right', fontFamily: "'Inter', system-ui, sans-serif" }}>{label}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', fontFamily: "'Inter', system-ui, sans-serif" }}>{d.pct}%</div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 6, padding: '8px 0', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {metrics.downtimePareto.map(d => (
                        <span key={d.reason} style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>
                          {d.reason} {d.pct}% (cum. {d.cumPct}%)
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Rework by Station ── */}
          {metrics.hasReworkData && metrics.reworkByStationList.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '18px 20px', boxShadow: 'var(--shadow-card)', transition: 'background 0.25s ease' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Rework Hours by Station</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {metrics.reworkByStationList.reduce((s, r) => s + r.hrs, 0).toFixed(1)}h total rework
                </span>
              </div>
              {(() => {
                const maxHrs = metrics.reworkByStationList[0]?.hrs || 1;
                return metrics.reworkByStationList.map((r, i) => {
                  const pct = (r.hrs / maxHrs) * 100;
                  const lc = lineColors[r.line] || '#64748b';
                  return (
                    <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,2fr) minmax(0,3fr) 52px', gap: 10, alignItems: 'center', marginBottom: 9 }}>
                      <div style={{ fontSize: 9, color: i === 0 ? '#f97316' : 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, textAlign: 'right' }}>#{i + 1}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", marginTop: 1 }}>
                          {r.code} · <span style={{ color: lc }}>{LINES.find(l => l.id === r.line)?.label || r.line}</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? '#f97316' : `${lc}99`, borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#f97316' : 'var(--text-secondary)', textAlign: 'right', fontFamily: "'Inter', system-ui, sans-serif" }}>
                        {r.hrs.toFixed(1)}h
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* ── Station Efficiency Chart ── */}
          {metrics.stationEfficiency.filter(s => s.efficiency !== null).length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '18px 20px', boxShadow: 'var(--shadow-card)', transition: 'background 0.25s ease' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Station Efficiency — Planned ÷ Actual Time</span>
                <span style={{ display: 'flex', gap: 14 }}>
                  <span style={{ color: '#10b981' }}>● ≥95% on plan</span>
                  <span style={{ color: '#f59e0b' }}>● 80–94%</span>
                  <span style={{ color: '#dc2626' }}>● &lt;80% bottleneck</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {metrics.stationEfficiency.map(s => {
                  const eff = s.efficiency;
                  const color = eff === null ? '#64748b'
                    : eff >= 95 ? '#10b981'
                    : eff >= 80 ? '#f59e0b'
                    : '#dc2626';
                  const barW = eff !== null ? Math.min(eff, 130) : 0;
                  const lc = lineColors[s.line] || '#64748b';
                  return (
                    <div key={s.code} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) 52px', gap: 10, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", marginTop: 1 }}>
                          {s.code} · <span style={{ color: lc }}>{LINES.find(l => l.id === s.line)?.label || s.line}</span>
                          {s.estimatedHours != null && ` · ${s.hours.toFixed(1)}h / ${s.estimatedHours.toFixed(1)}h est.`}
                        </div>
                      </div>
                      <div style={{ position: 'relative', height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(barW / 130) * 100}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                        {/* 100% marker */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(100 / 130) * 100}%`, width: 1.5, background: 'rgba(255,255,255,0.3)' }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color, textAlign: 'right', fontFamily: "'Inter', system-ui, sans-serif" }}>
                        {eff !== null ? `${eff}%` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif" }}>
                ▏ white marker = 100% target · bars extending past marker = running faster than planned
              </div>
            </div>
          )}

          {/* ── Weekly Production Trend ── */}
          {weeklyProduction.some(w => w.count > 0) && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '18px 20px', boxShadow: 'var(--shadow-card)', transition: 'background 0.25s ease' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Inter', system-ui, sans-serif", marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Weekly Production Trend — buses reaching QA (last 12 weeks)</span>
                <span style={{ color: '#3b82f6' }}>
                  avg {(weeklyProduction.filter(w => w.count > 0).reduce((s, w) => s + w.count, 0) / Math.max(weeklyProduction.filter(w => w.count > 0).length, 1)).toFixed(1)}/wk
                </span>
              </div>
              <ProductionTrendChart data={weeklyProduction} />
            </div>
          )}

          {allRows.length === 0 && allRows.length > 0 && (
            <div style={{ background: 'var(--warning-alpha)', border: '1px solid var(--warning-border)', borderRadius: 6, padding: '11px 14px', fontSize: 11, color: 'var(--warning-color)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em' }}>
              ⚠ No records found for the selected date. Try "All Time" or a different date.
            </div>
          )}

          {allRows.length === 0 && allRows.length === 0 && (
            <div style={{ background: 'var(--warning-alpha)', border: '1px solid var(--warning-border)', borderRadius: 6, padding: '11px 14px', fontSize: 11, color: 'var(--warning-color)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em' }}>
              ⚠ Performance metrics require historical data. They will populate as your travel tool logs more moves.
            </div>
          )}

          {!hasEstimates && allRows.length > 0 && (
            <div style={{ background: 'var(--info-alpha)', border: '1px solid var(--info-border)', borderRadius: 6, padding: '11px 14px', fontSize: 11, color: 'var(--info-color)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em' }}>
              ℹ Station estimated times are loading — performance rankings will switch to variance-based once they arrive.
            </div>
          )}

        </div>
      </div>
    </>
  );
}
