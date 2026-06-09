/**
 * Presentation.jsx
 * Full-screen slide deck:
 *   Slide 0 – Cover: KMC header + dashboard KPIs / charts snapshot
 *   Slides 1+ – Bus report data tables, sorted newest → oldest,
 *               BUSES_PER_SLIDE rows per page, headers repeated every slide
 *
 * Props: { buses, rows, startDate, endDate, metrics, stationTimes, onClose }
 */
import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LINES, STATIONS } from '../data/stations';

// ── constants ────────────────────────────────────────────────
const BUSES_PER_SLIDE = 8;

// ── helpers ──────────────────────────────────────────────────
const isKDC = (m = '') => m.toUpperCase().includes('KDC');
const isEVS = (m = '') => m.toUpperCase().includes('EVS');

function fmt(ms) {
  if (!ms || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? String(ts) : d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function computeStatus(ms) {
  if (!ms) return 'On Track';
  if (ms > 48 * 3600000) return 'Delayed';
  if (ms > 24 * 3600000) return 'Slow';
  return 'On Track';
}
function modelColors(model = '') {
  if (isKDC(model)) return { text: '#fca5a5', border: '#dc2626' };
  if (isEVS(model)) return { text: '#7dd3fc', border: '#38bdf8' };
  return { text: '#94a3b8', border: '#64748b' };
}

// ── Slide header (logo + title) — appears on every slide ─────
function SlideHeader({ now, slideNum, total }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 0, paddingTop: 18, paddingBottom: 12, flexShrink: 0,
      borderBottom: '1px solid rgba(220,38,38,0.25)',
      position: 'relative',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, transparent, #dc2626 30%, #dc2626 70%, transparent)',
      }} />

      <img src="/kmc logo 2.png" alt="KMC"
        style={{ height: 38, objectFit: 'contain', marginBottom: 6 }} />

      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 20, fontWeight: 900, letterSpacing: '0.22em',
        color: '#ffffff', textTransform: 'uppercase', lineHeight: 1,
      }}>
        KMC Bus Production Report
      </div>

      <div style={{
        marginTop: 4,
        display: 'flex', gap: 24, alignItems: 'center',
        fontSize: 9, color: '#475569',
        fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em',
      }}>
        <span>{now}</span>
        <span style={{ color: '#334155' }}>·</span>
        <span>KIIRA MOTORS CORPORATION — CONFIDENTIAL</span>
        <span style={{ color: '#334155' }}>·</span>
        <span style={{ color: '#64748b' }}>SLIDE {slideNum} / {total}</span>
      </div>
    </div>
  );
}

// ── KPI card for cover slide ──────────────────────────────────
function KpiCard({ label, value, accent }) {
  return (
    <div style={{
      background: 'rgba(13,21,38,0.9)',
      border: `1px solid ${accent}44`,
      borderTop: `2px solid ${accent}`,
      borderRadius: 6, padding: '12px 16px',
      textAlign: 'center', flex: 1,
    }}>
      <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: accent, lineHeight: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
    </div>
  );
}

// ── Bar row for distribution charts ──────────────────────────
function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: '#cbd5e1', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 9, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>{value}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ── Cover Slide ───────────────────────────────────────────────
function CoverSlide({ buses, rows, metrics, stationTimes, now, slideNum, total }) {
  const lineColors = {
    MACHINE: '#64748b', BODY: '#8b5cf6', BODY_KDC: '#7c3aed',
    FRAME: '#f97316', CHASSIS1: '#10b981', CHASSIS2: '#059669',
    ELECTRO: '#06b6d4', PAINT: '#ec4899', TRIM: '#3b82f6', QA: '#ef4444',
  };
  const modelColor = (m = '') => isKDC(m) ? '#dc2626' : isEVS(m) ? '#38bdf8' : '#64748b';

  const lineDistribution = LINES
    .map(l => ({ ...l, count: metrics.busesByLine?.[l.id] || 0 }))
    .filter(l => l.count > 0)
    .sort((a, b) => b.count - a.count);

  const modelEntries = Object.entries(metrics.byModel || {}).sort((a, b) => b[1] - a[1]);
  const maxLine  = Math.max(...lineDistribution.map(l => l.count), 1);
  const maxModel = Math.max(...modelEntries.map(e => e[1]), 1);

  const delayed = buses.filter(b => {
    const hist = rows.filter(r => r.vin === b.vin && r.rawTimestamp)
      .sort((a, c) => new Date(c.rawTimestamp) - new Date(a.rawTimestamp));
    const latestTs = hist[0] ? new Date(hist[0].rawTimestamp).getTime() : null;
    const ms = latestTs ? Date.now() - latestTs : null;
    return ms && ms > 48 * 3600000;
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 14, overflow: 'hidden' }}>
      <SlideHeader now={now} slideNum={slideNum} total={total} />

      {/* Slide label */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <span style={{
          fontSize: 10, color: '#475569', letterSpacing: '0.2em',
          fontFamily: "'Space Mono', monospace", textTransform: 'uppercase',
        }}>
          DASHBOARD SUMMARY · COVER SLIDE
        </span>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, padding: '0 24px' }}>
        <KpiCard label="Total on Floor"     value={metrics.total || 0}           accent="#64748b" />
        <KpiCard label="KDC Units"          value={metrics.kdcCount || 0}        accent="#dc2626" />
        <KpiCard label="EVS Units"          value={metrics.evsCount || 0}        accent="#38bdf8" />
        <KpiCard label="Delayed"            value={delayed}                      accent="#ef4444" />
        <KpiCard label="Prod Rate (7-day)"  value={`${metrics.prodRate || 0}/d`} accent="#10b981" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, flex: 1, minHeight: 0, padding: '0 24px 0' }}>
        {/* By model */}
        <div style={{
          background: 'rgba(13,21,38,0.85)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, padding: '14px 16px', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Space Mono', monospace", marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            Buses by Model
          </div>
          {modelEntries.slice(0, 7).map(([model, count]) => (
            <BarRow key={model} label={model} value={count} max={maxModel} color={modelColor(model)} />
          ))}
        </div>

        {/* By line */}
        <div style={{
          background: 'rgba(13,21,38,0.85)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, padding: '14px 16px', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Space Mono', monospace", marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            Buses by Line
          </div>
          {lineDistribution.slice(0, 7).map(line => (
            <BarRow key={line.id} label={line.label} value={line.count} max={maxLine} color={lineColors[line.id] || '#64748b'} />
          ))}
        </div>

        {/* Performance highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { title: '↑ Best Station',  item: metrics.bestStation,  accent: '#10b981' },
            { title: '↓ Slowest Station', item: metrics.worstStation, accent: '#dc2626' },
            { title: '↑ Best Line',     item: metrics.bestLine,    accent: '#10b981' },
            { title: '↓ Slowest Line',  item: metrics.worstLine,   accent: '#dc2626' },
          ].map(({ title, item, accent }) => (
            <div key={title} style={{
              flex: 1,
              background: `rgba(${accent === '#10b981' ? '16,185,129' : '220,38,38'},0.06)`,
              border: `1px solid ${accent}33`,
              borderRadius: 7, padding: '9px 12px',
            }}>
              <div style={{ fontSize: 8, color: accent, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 5 }}>{title}</div>
              {item
                ? <>
                    <div style={{ fontSize: 11, color: '#f1f5f9', fontWeight: 700, lineHeight: 1.3 }}>
                      {item.name || item.label || '—'}
                    </div>
                    <div style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace", marginTop: 3 }}>
                      {item.hours ? `avg ${item.hours.toFixed(1)}h` : ''}
                      {item.variancePct != null ? ` · ${item.variancePct > 0 ? '+' : ''}${item.variancePct}% vs est.` : ''}
                    </div>
                  </>
                : <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data</div>
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    'On Track': { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
    'Slow':     { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
    'Delayed':  { bg: 'rgba(220,38,38,0.15)',  color: '#dc2626' },
  };
  const s = map[status] || map['On Track'];
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: 20, padding: '2px 8px',
      fontSize: 9, fontWeight: 700,
      fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

// ── Table headers definition ──────────────────────────────────
const TABLE_COLS = [
  { label: 'VIN',            key: 'vin',          w: '11%' },
  { label: 'Model',          key: 'model',        w: '8%'  },
  { label: 'Line',           key: 'lineName',     w: '13%' },
  { label: 'Current Station',key: 'stationName',  w: '20%' },
  { label: 'Code',           key: 'stationCode',  w: '6%'  },
  { label: 'At Station',     key: 'atStation',    w: '8%'  },
  { label: 'Total on Floor', key: 'totalTime',    w: '8%'  },
  { label: 'First Entry',    key: 'firstEntry',   w: '11%' },
  { label: 'Progress',       key: 'progress',     w: '6%'  },
  { label: 'Status',         key: 'status',       w: '9%'  },
];

function TableHeader() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: TABLE_COLS.map(c => c.w).join(' '),
      background: 'rgba(220,38,38,0.1)',
      borderBottom: '1px solid rgba(220,38,38,0.35)',
      padding: '7px 16px',
      gap: 8,
    }}>
      {TABLE_COLS.map(col => (
        <div key={col.key} style={{
          fontSize: 8, color: '#94a3b8', textTransform: 'uppercase',
          letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
        }}>
          {col.label}
        </div>
      ))}
    </div>
  );
}

function TableRow({ bus, idx }) {
  const mc = modelColors(bus.model);
  const isEven = idx % 2 === 0;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: TABLE_COLS.map(c => c.w).join(' '),
      padding: '8px 16px',
      gap: 8,
      alignItems: 'center',
      background: isEven ? 'rgba(13,21,38,0.6)' : 'rgba(13,21,38,0.3)',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      borderLeft: `2px solid ${mc.border}44`,
    }}>
      {/* VIN */}
      <div style={{ fontSize: 10, color: '#f1f5f9', fontFamily: "'Space Mono', monospace", fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bus.vin}
      </div>
      {/* Model */}
      <div>
        <span style={{
          background: `${mc.border}22`, color: mc.text,
          border: `1px solid ${mc.border}44`,
          borderRadius: 3, padding: '1px 5px',
          fontSize: 8, fontWeight: 700,
          fontFamily: "'Space Mono', monospace",
        }}>
          {bus.model || '—'}
        </span>
      </div>
      {/* Line */}
      <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bus.lineName}
      </div>
      {/* Station name */}
      <div style={{ fontSize: 10, color: '#e2e8f0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bus.stationName}
      </div>
      {/* Code */}
      <div style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace" }}>
        {bus.stationCode}
      </div>
      {/* At station */}
      <div style={{
        fontSize: 11, fontWeight: 700,
        fontFamily: "'Space Mono', monospace",
        color: bus.status === 'Delayed' ? '#dc2626' : bus.status === 'Slow' ? '#f59e0b' : '#f1f5f9',
      }}>
        {bus.atStation}
      </div>
      {/* Total */}
      <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: "'Space Mono', monospace" }}>
        {bus.totalTime}
      </div>
      {/* First entry */}
      <div style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace" }}>
        {bus.firstEntry}
      </div>
      {/* Progress */}
      <div style={{ fontSize: 10, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>
        {bus.progress}%
      </div>
      {/* Status */}
      <div>
        <StatusBadge status={bus.status} />
      </div>
    </div>
  );
}

// ── Table Slide ───────────────────────────────────────────────
function TableSlide({ rows, slideNum, total, now, globalRowOffset, metrics }) {
  const delayed  = rows.filter(r => r.status === 'Delayed').length;
  const slow     = rows.filter(r => r.status === 'Slow').length;
  const onTrack  = rows.filter(r => r.status === 'On Track').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 0, overflow: 'hidden' }}>
      <SlideHeader now={now} slideNum={slideNum} total={total} />

      {/* Horizontal context strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 24px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(7,9,15,0.5)',
      }}>
        <span style={{ fontSize: 10, color: '#475569', letterSpacing: '0.2em', fontFamily: "'Space Mono', monospace", textTransform: 'uppercase', marginRight: 8 }}>
          BUS REPORT
        </span>
        {[
          { label: 'FLOOR',    value: metrics?.total    || '—', color: '#64748b' },
          { label: 'ON TRACK', value: onTrack,                  color: '#10b981' },
          { label: 'SLOW',     value: slow,                     color: '#f59e0b' },
          { label: 'DELAYED',  value: delayed,                  color: '#dc2626' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em' }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{value}</span>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace" }}>
          ROWS {globalRowOffset + 1}–{globalRowOffset + rows.length} · SORTED MOST RECENT FIRST
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', margin: '0 24px' }}>
        <TableHeader />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {rows.map((bus, i) => (
            <TableRow key={bus.vin + i} bus={bus} idx={i} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        padding: '6px 24px',
        display: 'flex', gap: 16, flexShrink: 0,
        borderTop: '1px solid rgba(255,255,255,0.03)',
        fontSize: 8, color: '#1e2d40', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em',
      }}>
        <span style={{ color: '#10b981' }}>● ON TRACK</span>
        <span style={{ color: '#f59e0b' }}>● SLOW (&gt;24h)</span>
        <span style={{ color: '#dc2626' }}>● DELAYED (&gt;48h)</span>
        <span style={{ color: '#dc2626', marginLeft: 4 }}>■ KDC</span>
        <span style={{ color: '#38bdf8' }}>■ EVS</span>
      </div>
    </div>
  );
}

// ── Main Presentation component ───────────────────────────────
export default function Presentation({ buses, rows, startDate, endDate, metrics, stationTimes = {}, onClose }) {
  const [slide, setSlide] = useState(0);

  const now = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // Build sorted bus rows (newest first by latest timestamp)
  const sortedBusRows = useMemo(() => {
    const byVin = {};
    for (const row of rows) {
      if (!byVin[row.vin]) byVin[row.vin] = [];
      byVin[row.vin].push(row);
    }

    return buses
      .map(bus => {
        const history = (byVin[bus.vin] || [])
          .filter(r => r.rawTimestamp)
          .sort((a, b) => new Date(a.rawTimestamp) - new Date(b.rawTimestamp));

        const firstTs  = history[0] ? new Date(history[0].rawTimestamp).getTime() : null;
        const latestTs = history[history.length - 1]
          ? new Date(history[history.length - 1].rawTimestamp).getTime() : null;
        const now2 = Date.now();
        const totalMs = firstTs  ? now2 - firstTs  : null;
        const curMs   = latestTs ? now2 - latestTs : null;

        const visited = new Set(history.map(r => r.stationCode)).size;
        const lineId  = bus.station?.line;
        const lineTot = lineId ? Object.values(STATIONS).filter(s => s.line === lineId).length : 0;
        const progress = lineTot > 0 ? Math.min(Math.round((visited / lineTot) * 100), 100) : 0;

        return {
          vin:         bus.vin,
          model:       bus.model || '—',
          lineName:    LINES.find(l => l.id === lineId)?.label || lineId || '—',
          stationName: bus.station?.name || bus.stationCode || '—',
          stationCode: bus.stationCode || '—',
          atStation:   fmt(curMs),
          totalTime:   fmt(totalMs),
          firstEntry:  fmtDate(firstTs),
          progress,
          status:      computeStatus(curMs),
          _latestTs:   latestTs || 0,
        };
      })
      // Sort newest (highest latestTs) first
      .sort((a, b) => b._latestTs - a._latestTs);
  }, [buses, rows, startDate, endDate]);

  // Chunk rows into pages
  const tablePages = [];
  for (let i = 0; i < sortedBusRows.length; i += BUSES_PER_SLIDE) {
    tablePages.push(sortedBusRows.slice(i, i + BUSES_PER_SLIDE));
  }

  const totalSlides = 1 + tablePages.length;
  const clamp = n => Math.max(0, Math.min(n, totalSlides - 1));

  const handleKey = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  setSlide(s => clamp(s + 1));
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    setSlide(s => clamp(s - 1));
    if (e.key === 'Escape')                                onClose();
  };

  return createPortal(
    <div
      tabIndex={0}
      onKeyDown={handleKey}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: '#07090f',
        backgroundImage: "url('/Bus background.png')",
        backgroundSize: 'cover', backgroundPosition: 'center',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Barlow Condensed', sans-serif",
        outline: 'none',
      }}
      autoFocus
    >
      {/* Dark overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,9,15,0.88)', zIndex: 0, pointerEvents: 'none' }} />

      {/* Slide content */}
      <div style={{
        position: 'relative', zIndex: 1,
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', minHeight: 0,
      }}>
        {slide === 0 ? (
          <CoverSlide
            buses={buses} rows={rows}
            metrics={metrics} stationTimes={stationTimes}
            now={now} slideNum={1} total={totalSlides}
          />
        ) : (
          <TableSlide
            rows={tablePages[slide - 1] || []}
            slideNum={slide + 1}
            total={totalSlides}
            now={now}
            globalRowOffset={(slide - 1) * BUSES_PER_SLIDE}
            metrics={metrics}
          />
        )}
      </div>

      {/* Navigation controls */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '10px 24px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(7,9,15,0.95)', backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', left: 24,
          background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
          color: '#fca5a5', borderRadius: 4, padding: '5px 14px',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          ✕ CLOSE
        </button>

        {/* Prev */}
        <button
          onClick={() => setSlide(s => clamp(s - 1))}
          disabled={slide === 0}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: slide === 0 ? '#1e2d40' : '#94a3b8', borderRadius: 4,
            padding: '5px 18px', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
            cursor: slide === 0 ? 'not-allowed' : 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          ← PREV
        </button>

        {/* Slide dots */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              style={{
                width: i === slide ? 20 : 6, height: 6,
                borderRadius: 3, border: 'none',
                background: i === slide ? '#dc2626' : i === 0 ? '#475569' : '#1e2d40',
                cursor: 'pointer', padding: 0,
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>

        {/* Next */}
        <button
          onClick={() => setSlide(s => clamp(s + 1))}
          disabled={slide === totalSlides - 1}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: slide === totalSlides - 1 ? '#1e2d40' : '#94a3b8', borderRadius: 4,
            padding: '5px 18px', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
            cursor: slide === totalSlides - 1 ? 'not-allowed' : 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          NEXT →
        </button>

        {/* Hint */}
        <span style={{
          position: 'absolute', right: 24,
          fontSize: 9, color: '#1e2d40',
          fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em',
        }}>
          ← → ARROW KEYS · ESC TO CLOSE
        </span>
      </div>
    </div>,
    document.body
  );
}
