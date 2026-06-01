import { useMemo, useRef, useState } from 'react';
import { LINES, STATIONS } from '../data/stations';
import ExportPanel from './ExportPanel';

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

function PerfCard({ title, name, detail, accent }) {
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
          </>
        : <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>
      }
    </div>
  );
}

// ── Presentation slide — single page, auto-fits screen ──
function PresentationSlide({ metrics, buses, lineDistribution, modelEntries, lineColors, modelColor, onClose, slideRef }) {
  const now = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const maxLine  = Math.max(...lineDistribution.map(l => l.count), 1);
  const maxModel = Math.max(...modelEntries.map(e => e[1]), 1);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: '#07090f',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Barlow Condensed', sans-serif",
    }}>
      {/* Red top bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #dc2626, #7c3aed)', flexShrink: 0 }} />

      {/* Slide content — fills remaining space */}
      <div
        ref={slideRef}
        style={{
          flex: 1,
          padding: '16px 24px 12px',
          display: 'flex', flexDirection: 'column', gap: 12,
          overflow: 'hidden', // never scroll — fits to screen
          background: '#07090f',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <img src="/kmc logo 2.png" alt="KMC" style={{ height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1 }}>
              Bus Production Tracker
            </div>
            <div style={{ fontSize: 10, color: '#475569', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em', marginTop: 3 }}>
              Dashboard Report · {now}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
                color: '#fca5a5', borderRadius: 4, padding: '5px 14px',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0 }}>
          {[
            { label: 'Total on Floor', value: metrics.total,             sub: 'active buses',      accent: '#64748b' },
            { label: 'KDC Units',      value: metrics.kdcCount,          sub: 'on floor',           accent: '#dc2626' },
            { label: 'EVS Units',      value: metrics.evsCount,          sub: 'on floor',           accent: '#38bdf8' },
            { label: 'Prod. Rate',     value: `${metrics.prodRate}/day`,  sub: '7-day rolling avg',  accent: '#10b981' },
          ].map(k => (
            <div key={k.label} style={{
              background: 'rgba(13,21,38,0.9)',
              border: `1px solid ${k.accent}44`,
              borderTop: `2px solid ${k.accent}`,
              borderRadius: 6, padding: '10px 14px',
            }}>
              <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.accent, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", marginTop: 3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Middle: charts + performance */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, minHeight: 0 }}>

          {/* Buses by model */}
          <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px 16px', overflow: 'hidden' }}>
            <SectionTitle>Buses by Model</SectionTitle>
            {modelEntries.slice(0, 8).map(([model, count]) => (
              <BarRow key={model} label={model} value={count} max={maxModel} color={modelColor(model)} sub={`${count}`} />
            ))}
          </div>

          {/* Buses by line */}
          <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px 16px', overflow: 'hidden' }}>
            <SectionTitle>Buses by Line</SectionTitle>
            {lineDistribution.slice(0, 8).map(line => (
              <BarRow key={line.id} label={line.label} value={line.count} max={maxLine} color={lineColors[line.id] || '#64748b'} sub={`${line.count}`} />
            ))}
          </div>

          {/* Performance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PerfCard title="↑ Best Station" accent="green"
              name={metrics.bestStation?.name}
              detail={metrics.bestStation ? `${metrics.bestStation.code} · avg ${metrics.bestStation.hours.toFixed(1)}h dwell` : null} />
            <PerfCard title="↓ Slowest Station" accent="red"
              name={metrics.worstStation?.name}
              detail={metrics.worstStation ? `${metrics.worstStation.code} · avg ${metrics.worstStation.hours.toFixed(1)}h dwell` : null} />
            <PerfCard title="↑ Best Line" accent="green"
              name={metrics.bestLine?.label}
              detail={metrics.bestLine ? `avg ${metrics.bestLine.hours.toFixed(1)}h per station` : null} />
            <PerfCard title="↓ Slowest Line" accent="red"
              name={metrics.worstLine?.label}
              detail={metrics.worstLine ? `avg ${metrics.worstLine.hours.toFixed(1)}h per station` : null} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8,
          fontSize: 9, color: '#1e2d40', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em',
        }}>
          <span>KIIRA MOTORS CORPORATION — CONFIDENTIAL</span>
          <span>{buses.length} BUSES · {now}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard export ────────────────────────────────
export default function Dashboard({ buses, allRows }) {
  const dashboardRef   = useRef(null);
  const slideRef       = useRef(null);
  const [presenting, setPresenting] = useState(false);

  const metrics = useMemo(() => {
    const total      = buses.length;
    const kdcCount   = buses.filter(b => isKDC(b.model)).length;
    const evsCount   = buses.filter(b => isEVS(b.model)).length;
    const otherCount = total - kdcCount - evsCount;

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
    for (const code of Object.keys(dwellByStation)) avgDwell[code] = dwellByStation[code] / countByStation[code];

    const dwellEntries = Object.entries(avgDwell).filter(([code]) => STATIONS[code]).sort((a, b) => a[1] - b[1]);
    const bestStation  = dwellEntries[0] ? { code: dwellEntries[0][0], hours: dwellEntries[0][1], name: STATIONS[dwellEntries[0][0]]?.name } : null;
    const worstStation = dwellEntries[dwellEntries.length - 1] ? { code: dwellEntries[dwellEntries.length-1][0], hours: dwellEntries[dwellEntries.length-1][1], name: STATIONS[dwellEntries[dwellEntries.length-1][0]]?.name } : null;

    const lineDwell = {}, lineCount2 = {};
    for (const [code, hours] of Object.entries(avgDwell)) {
      const st = STATIONS[code];
      if (!st) continue;
      lineDwell[st.line]  = (lineDwell[st.line]  || 0) + hours;
      lineCount2[st.line] = (lineCount2[st.line] || 0) + 1;
    }
    const lineAvg = {};
    for (const lid of Object.keys(lineDwell)) lineAvg[lid] = lineDwell[lid] / lineCount2[lid];
    const lineEntries = Object.entries(lineAvg).sort((a, b) => a[1] - b[1]);
    const getLabel    = id => LINES.find(l => l.id === id)?.label || id;
    const bestLine    = lineEntries[0] ? { id: lineEntries[0][0], hours: lineEntries[0][1], label: getLabel(lineEntries[0][0]) } : null;
    const worstLine   = lineEntries[lineEntries.length-1] ? { id: lineEntries[lineEntries.length-1][0], hours: lineEntries[lineEntries.length-1][1], label: getLabel(lineEntries[lineEntries.length-1][0]) } : null;

    const busesByLine = {}, byModel = {};
    for (const bus of buses) {
      const lid = bus.station?.line;
      if (lid) busesByLine[lid] = (busesByLine[lid] || 0) + 1;
      byModel[bus.model] = (byModel[bus.model] || 0) + 1;
    }

    return { total, kdcCount, evsCount, otherCount, prodRate, bestStation, worstStation, bestLine, worstLine, busesByLine, avgDwell, byModel };
  }, [buses, allRows]);

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

  return (
    <>
      {/* ── Fullscreen presentation overlay ── */}
      {presenting && (
        <PresentationSlide
          metrics={metrics}
          buses={buses}
          lineDistribution={lineDistribution}
          modelEntries={modelEntries}
          lineColors={lineColors}
          modelColor={modelColor}
          onClose={() => setPresenting(false)}
          slideRef={slideRef}
        />
      )}

      <div ref={dashboardRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Present button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setPresenting(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.35)',
              color: '#93c5fd', borderRadius: 5, padding: '7px 18px',
              fontSize: 14, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
              fontFamily: "'Barlow Condensed', sans-serif",
              transition: 'all 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
            Present
          </button>
        </div>

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
            <div style={{ fontSize: 9, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>↑ Best station</div>
            {metrics.bestStation ? (<>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{metrics.bestStation.name}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>{metrics.bestStation.code} · avg {metrics.bestStation.hours.toFixed(1)}h dwell</div>
            </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
          </div>
          <div style={card('rgba(220,38,38,0.07)', 'rgba(220,38,38,0.2)')}>
            <div style={{ fontSize: 9, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>↓ Slowest station</div>
            {metrics.worstStation ? (<>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>{metrics.worstStation.name}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>{metrics.worstStation.code} · avg {metrics.worstStation.hours.toFixed(1)}h dwell</div>
            </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
          </div>
          <div style={card('rgba(16,185,129,0.07)', 'rgba(16,185,129,0.2)')}>
            <div style={{ fontSize: 9, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>↑ Best line</div>
            {metrics.bestLine ? (<>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{metrics.bestLine.label}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>avg {metrics.bestLine.hours.toFixed(1)}h per station</div>
            </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
          </div>
          <div style={card('rgba(220,38,38,0.07)', 'rgba(220,38,38,0.2)')}>
            <div style={{ fontSize: 9, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>↓ Slowest line</div>
            {metrics.worstLine ? (<>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{metrics.worstLine.label}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>avg {metrics.worstLine.hours.toFixed(1)}h per station</div>
            </>) : <div style={{ fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data yet</div>}
          </div>
        </div>

        {allRows.length === 0 && (
          <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '11px 14px', fontSize: 11, color: '#fbbf24', fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em' }}>
            ⚠ Performance metrics require historical data. They will populate as your travel tool logs more moves.
          </div>
        )}

        {/* Export panel — passes slideRef for PNG/PDF of the presentation slide */}
        <ExportPanel
          buses={buses}
          allRows={allRows}
          metrics={metrics}
          dashboardRef={dashboardRef}
          slideRef={slideRef}
          onPresent={() => setPresenting(true)}
        />
      </div>
    </>
  );
}
