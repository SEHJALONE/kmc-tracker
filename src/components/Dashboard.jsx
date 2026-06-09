import { useMemo, useRef, useState } from 'react';
import { LINES, STATIONS, lookupStation } from '../data/stations';
import ExportPanel from './ExportPanel';
import Presentation from './Presentation';

const isKDC = (m = '') => m.toUpperCase().includes('KDC');
const isEVS = (m = '') => m.toUpperCase().includes('EVS');

// ── Tiny helpers ─────────────────────────────────────────
function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'rgba(13,21,38,0.8)',
      border: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
      borderRadius: 8, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || '#f1f5f9', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#475569', fontFamily: "'Space Mono', monospace" }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#cbd5e1', fontFamily: "'Barlow Condensed', sans-serif" }}>{label}</span>
        <span style={{ fontSize: 10, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>{sub || value}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em',
      fontFamily: "'Space Mono', monospace", marginBottom: 10,
      paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)',
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
      <div style={{ fontSize: 9, color: accent === 'green' ? '#10b981' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
        {title}
      </div>
      {name
        ? <>
            <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{name}</div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>{detail}</div>
            {subDetail && <div style={{ fontSize: 9, color: '#334155', marginTop: 2, fontFamily: "'Space Mono', monospace" }}>{subDetail}</div>}
          </>
        : <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>
      }
    </div>
  );
}

// ── Date helpers ─────────────────────────────────────────
function toLocalDateStr(date) {
  // Returns 'YYYY-MM-DD' in local time
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayBounds(dateStr) {
  // Returns [startMs, endMs] for a 'YYYY-MM-DD' string in local time
  const start = new Date(dateStr + 'T00:00:00');
  const end   = new Date(dateStr + 'T23:59:59.999');
  return [start.getTime(), end.getTime()];
}

function rangeBounds(fromStr, toStr) {
  // Returns [startMs, endMs] spanning fromStr 00:00 → toStr 23:59:59
  const start = new Date(fromStr + 'T00:00:00');
  const end   = new Date(toStr   + 'T23:59:59.999');
  return [start.getTime(), end.getTime()];
}

// ── DateFilterBar component ──────────────────────────────
function DateFilterBar({
  mode, setMode,
  rangeFrom, setRangeFrom,
  rangeTo,   setRangeTo,
  filteredCount, totalCount,
}) {
  const today     = toLocalDateStr(new Date());
  const yesterday = toLocalDateStr(new Date(Date.now() - 86400000));

  const btnBase = {
    display: 'flex', alignItems: 'center', gap: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 5, padding: '5px 13px',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.10em',
    textTransform: 'uppercase', fontFamily: "'Barlow Condensed', sans-serif",
    cursor: 'pointer', transition: 'all 0.15s', background: 'none',
  };
  const active = {
    background: 'rgba(220,38,38,0.15)',
    borderColor: 'rgba(220,38,38,0.55)',
    color: '#fca5a5',
  };
  const inactive = {
    background: 'rgba(255,255,255,0.03)',
    color: '#475569',
  };
  const isActive = (m) => mode === m;

  const dateInputStyle = (on) => ({
    background: on ? 'rgba(220,38,38,0.08)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? 'rgba(220,38,38,0.45)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 5,
    color: on ? '#fca5a5' : '#475569',
    fontSize: 11,
    fontFamily: "'Space Mono', monospace",
    padding: '5px 8px',
    outline: 'none',
    cursor: 'pointer',
    colorScheme: 'dark',
    width: 120,
  });

  // Human-readable summary of active range
  function rangeSummary() {
    if (mode === 'all')       return null;
    if (mode === 'today')     return `Today · ${today.slice(5).replace('-','/')}`;
    if (mode === 'yesterday') return `Yesterday · ${yesterday.slice(5).replace('-','/')}`;
    if (mode === 'last7')     return 'Last 7 days';
    if (mode === 'last30')    return 'Last 30 days';
    if (mode === 'range') {
      if (rangeFrom && rangeTo) return `${rangeFrom.slice(5).replace('-','/')} → ${rangeTo.slice(5).replace('-','/')}`;
      if (rangeFrom)            return `From ${rangeFrom.slice(5).replace('-','/')}`;
    }
    return null;
  }

  const summary = rangeSummary();

  return (
    <div style={{
      background: 'rgba(13,21,38,0.75)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: '9px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Row 1: icon + preset buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Icon + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 4 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8"  y1="2" x2="8"  y2="6"/>
            <line x1="3"  y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Date Filter
          </span>
        </div>

        {/* Preset buttons */}
        {[
          { id: 'all',       label: 'All Time' },
          { id: 'today',     label: 'Today',     hint: today.slice(5).replace('-','/') },
          { id: 'yesterday', label: 'Yesterday', hint: yesterday.slice(5).replace('-','/') },
          { id: 'last7',     label: 'Last 7 days' },
          { id: 'last30',    label: 'Last 30 days' },
          { id: 'range',     label: 'Custom Range' },
        ].map(({ id, label, hint }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{ ...btnBase, ...(isActive(id) ? active : inactive) }}
          >
            {label}
            {hint && (
              <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 400, letterSpacing: '0.04em' }}>
                {hint}
              </span>
            )}
          </button>
        ))}

        {/* Record count badge */}
        {mode !== 'all' && (
          <div style={{
            marginLeft: 'auto',
            fontSize: 9, fontFamily: "'Space Mono', monospace",
            color: filteredCount === 0 ? '#dc2626' : '#475569',
            letterSpacing: '0.08em',
          }}>
            {filteredCount} / {totalCount} record{totalCount !== 1 ? 's' : ''}
            {filteredCount === 0 && ' — no data'}
          </div>
        )}
      </div>

      {/* Row 2: date range inputs (only when mode === 'range') */}
      {mode === 'range' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            From
          </span>
          <input
            type="date"
            value={rangeFrom}
            max={rangeTo || today}
            onChange={e => setRangeFrom(e.target.value)}
            style={dateInputStyle(!!rangeFrom)}
          />
          <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            To
          </span>
          <input
            type="date"
            value={rangeTo}
            min={rangeFrom || undefined}
            max={today}
            onChange={e => setRangeTo(e.target.value)}
            style={dateInputStyle(!!rangeTo)}
          />
          {rangeFrom && rangeTo && (
            <span style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace" }}>
              {Math.round((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1} day{Math.round((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1 !== 1 ? 's' : ''}
            </span>
          )}
          {/* Quick-clear */}
          {(rangeFrom || rangeTo) && (
            <button
              onClick={() => { setRangeFrom(''); setRangeTo(''); }}
              style={{ ...btnBase, ...inactive, padding: '4px 10px', fontSize: 10 }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Active filter summary strip */}
      {summary && mode !== 'range' && (
        <div style={{
          fontSize: 9, color: '#dc2626', fontFamily: "'Space Mono', monospace",
          letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: '#334155' }}>●</span>
          Filtering: {summary}
          <button
            onClick={() => setMode('all')}
            style={{ marginLeft: 4, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 10, fontFamily: "'Space Mono', monospace", padding: 0 }}
          >
            ✕ clear
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard export ────────────────────────────────
export default function Dashboard({ buses, allRows, stationTimes = {} }) {
  const dashboardRef = useRef(null);
  const slideRef     = useRef(null);
  const [presenting, setPresenting] = useState(false);

  // ── Date filter state ──────────────────────────────────
  // mode: 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'range'
  const [dateMode,  setDateMode]  = useState('all');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo,   setRangeTo]   = useState('');

  // Resolve active [startMs, endMs] bounds (null = no filter)
  const activeBounds = useMemo(() => {
    const now   = Date.now();
    const today = toLocalDateStr(new Date());
    if (dateMode === 'today')
      return dayBounds(today);
    if (dateMode === 'yesterday')
      return dayBounds(toLocalDateStr(new Date(now - 86400000)));
    if (dateMode === 'last7')
      return rangeBounds(toLocalDateStr(new Date(now - 6 * 86400000)), today);
    if (dateMode === 'last30')
      return rangeBounds(toLocalDateStr(new Date(now - 29 * 86400000)), today);
    if (dateMode === 'range' && rangeFrom && rangeTo)
      return rangeBounds(rangeFrom, rangeTo);
    if (dateMode === 'range' && rangeFrom)
      return [new Date(rangeFrom + 'T00:00:00').getTime(), now];
    return null; // 'all' or incomplete range
  }, [dateMode, rangeFrom, rangeTo]);

  // Filter allRows to the active time window
  const filteredAllRows = useMemo(() => {
    if (!activeBounds) return allRows;
    const [start, end] = activeBounds;
    return allRows.filter(r => {
      if (!r.rawTimestamp) return false;
      const t = new Date(r.rawTimestamp).getTime();
      return t >= start && t <= end;
    });
  }, [allRows, activeBounds]);

  // Re-derive latest bus positions from filteredAllRows so the station shown
  // is the last known position *within the selected day*, not the global latest.
  const filteredBuses = useMemo(() => {
    if (!activeBounds) return buses; // 'All Time' — use pre-computed prop as-is

    // Replicate getLatestPositions logic on the day-scoped rows
    const map = {};
    for (const row of filteredAllRows) {
      const ts = new Date(row.rawTimestamp || 0).getTime() || 0;
      if (!map[row.vin] || ts >= map[row.vin].ts) {
        map[row.vin] = { ...row, ts };
      }
    }
    return Object.values(map)
      .map(entry => ({ ...entry, station: lookupStation(entry.stationCode) }))
      .filter(e => e.station); // drop unknown station codes, matching original behaviour
  }, [buses, filteredAllRows, activeBounds]);

  const metrics = useMemo(() => {
    // Use filtered data for date-scoped metrics
    const buses   = filteredBuses;
    const allRows = filteredAllRows;
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
        return {
          code, hours,
          name: STATIONS[code]?.name,
          estimatedHours, variancePct,
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

    return {
      total, kdcCount, evsCount, prodRate,
      bestStation, worstStation, bestLine, worstLine,
      busesByLine, avgDwell, byModel,
    };
  }, [filteredBuses, filteredAllRows, stationTimes]);

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
  const card = (bg, border) => ({ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '14px 18px' });

  const hasEstimates = Object.keys(stationTimes).length > 0;

  return (
    <>
      {/* Presentation modal */}
      {presenting && (
        <Presentation
          buses={filteredBuses}
          allRows={filteredAllRows}
          metrics={metrics}
          stationTimes={stationTimes}
          onClose={() => setPresenting(false)}
        />
      )}

      <div ref={dashboardRef} style={{
        position: 'relative',
        backgroundImage: "url('/Bus background.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(7,9,15,0.82)',
          zIndex: 0, pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 72, paddingTop: 16 }}>

          {/* ── Export panel (fixed at bottom, no flow space) ── */}
          <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'visible' }}>
            <ExportPanel
              buses={filteredBuses} allRows={filteredAllRows} metrics={metrics}
              dashboardRef={dashboardRef} slideRef={slideRef}
              onPresent={() => setPresenting(true)}
              stationTimes={stationTimes}
            />
          </div>

          {/* ── Date filter bar ── */}
          <DateFilterBar
            mode={dateMode}
            setMode={setDateMode}
            rangeFrom={rangeFrom}
            setRangeFrom={setRangeFrom}
            rangeTo={rangeTo}
            setRangeTo={setRangeTo}
            filteredCount={filteredAllRows.length}
            totalCount={allRows.length}
          />

          {/* Top metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <MetricCard label="Total on floor"  value={metrics.total}             sub="all active buses"    accent="#475569" />
            <MetricCard label="KDC units"       value={metrics.kdcCount}          sub="on production floor" accent="#dc2626" />
            <MetricCard label="EVS units"       value={metrics.evsCount}          sub="on production floor" accent="#38bdf8" />
            <MetricCard label="Prod. rate"      value={`${metrics.prodRate}/day`} sub="7-day rolling avg"   accent="#10b981" />
          </div>

          {/* Model + Line distribution */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '18px 20px' }}>
              <SectionTitle>Buses by model</SectionTitle>
              {modelEntries.length === 0
                ? <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>No buses on floor</div>
                : modelEntries.map(([model, count]) => (
                  <BarRow key={model} label={model} value={count} max={maxModelCount} color={modelColor(model)} sub={`${count} bus${count !== 1 ? 'es' : ''}`} />
                ))}
            </div>
            <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '18px 20px' }}>
              <SectionTitle>Buses by line</SectionTitle>
              {lineDistribution.length === 0
                ? <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>No buses on tracked lines</div>
                : lineDistribution.map(line => (
                  <BarRow key={line.id} label={line.label} value={line.count} max={maxLineCount} color={lineColors[line.id] || '#64748b'} sub={`${line.count} bus${line.count !== 1 ? 'es' : ''}`} />
                ))}
            </div>
          </div>

          {/* Performance highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={card('rgba(16,185,129,0.07)', 'rgba(16,185,129,0.2)')}>
              <div style={{ fontSize: 9, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
                ↑ Best station {hasEstimates ? '(by variance vs estimate)' : '(by avg dwell)'}
              </div>
              {metrics.bestStation ? (<>
                <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{metrics.bestStation.name}</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
                  {metrics.bestStation.code} · avg {metrics.bestStation.hours.toFixed(1)}h actual
                </div>
                {metrics.bestStation.estimatedHours != null && (
                  <div style={{ fontSize: 10, color: '#10b981', marginTop: 2, fontFamily: "'Space Mono', monospace" }}>
                    est. {metrics.bestStation.estimatedHours.toFixed(1)}h ·&nbsp;
                    {metrics.bestStation.variancePct > 0 ? '+' : ''}{metrics.bestStation.variancePct}% variance
                  </div>
                )}
              </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
            </div>

            <div style={card('rgba(220,38,38,0.07)', 'rgba(220,38,38,0.2)')}>
              <div style={{ fontSize: 9, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
                ↓ Slowest station {hasEstimates ? '(by variance vs estimate)' : '(by avg dwell)'}
              </div>
              {metrics.worstStation ? (<>
                <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{metrics.worstStation.name}</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
                  {metrics.worstStation.code} · avg {metrics.worstStation.hours.toFixed(1)}h actual
                </div>
                {metrics.worstStation.estimatedHours != null && (
                  <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2, fontFamily: "'Space Mono', monospace" }}>
                    est. {metrics.worstStation.estimatedHours.toFixed(1)}h ·&nbsp;
                    {metrics.worstStation.variancePct > 0 ? '+' : ''}{metrics.worstStation.variancePct}% variance
                  </div>
                )}
              </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
            </div>

            <div style={card('rgba(16,185,129,0.07)', 'rgba(16,185,129,0.2)')}>
              <div style={{ fontSize: 9, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
                ↑ Best line {hasEstimates ? '(avg variance vs estimate)' : '(avg dwell)'}
              </div>
              {metrics.bestLine ? (<>
                <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{metrics.bestLine.label}</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
                  avg {metrics.bestLine.hours.toFixed(1)}h per station
                </div>
                {metrics.bestLine.variancePct != null && (
                  <div style={{ fontSize: 10, color: '#10b981', marginTop: 2, fontFamily: "'Space Mono', monospace" }}>
                    {metrics.bestLine.variancePct > 0 ? '+' : ''}{metrics.bestLine.variancePct}% avg vs estimates
                  </div>
                )}
              </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
            </div>

            <div style={card('rgba(220,38,38,0.07)', 'rgba(220,38,38,0.2)')}>
              <div style={{ fontSize: 9, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
                ↓ Slowest line {hasEstimates ? '(avg variance vs estimate)' : '(avg dwell)'}
              </div>
              {metrics.worstLine ? (<>
                <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{metrics.worstLine.label}</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
                  avg {metrics.worstLine.hours.toFixed(1)}h per station
                </div>
                {metrics.worstLine.variancePct != null && (
                  <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2, fontFamily: "'Space Mono', monospace" }}>
                    {metrics.worstLine.variancePct > 0 ? '+' : ''}{metrics.worstLine.variancePct}% avg vs estimates
                  </div>
                )}
              </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
            </div>
          </div>

          {filteredAllRows.length === 0 && allRows.length > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '11px 14px', fontSize: 11, color: '#fbbf24', fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em' }}>
              ⚠ No records found for the selected date. Try "All Time" or a different date.
            </div>
          )}

          {filteredAllRows.length === 0 && allRows.length === 0 && (
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '11px 14px', fontSize: 11, color: '#fbbf24', fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em' }}>
              ⚠ Performance metrics require historical data. They will populate as your travel tool logs more moves.
            </div>
          )}

          {!hasEstimates && filteredAllRows.length > 0 && (
            <div style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 6, padding: '11px 14px', fontSize: 11, color: '#7dd3fc', fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em' }}>
              ℹ Station estimated times are loading — performance rankings will switch to variance-based once they arrive.
            </div>
          )}

        </div>
      </div>
    </>
  );
}
