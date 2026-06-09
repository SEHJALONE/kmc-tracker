import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LINES, STATIONS } from '../data/stations';

const BUS_IMAGES = {
  '7m EVS':    '/7m EVS.png',
  '8.5m EVS':  '/8.5m EVS.png',
  '10.5m EVS': '/10.5m EVS.png',
  '12m EVS':   '/12m EVS.png',
  '10.5m KDC': '/10.5m KDC.png',
  '12m KDC':   '/12m KDC.png',
};

// ── Exact filenames as seen in your /public folder ───────
const LINE_BG = {
  MACHINE:  '/Machine Shop.jpg',
  BODY:     '/Frame Parts Making.jpg',
  BODY_KDC: '/Frame Parts Making.jpg',
  FRAME:    '/Frame & Body Welding.png',
  CHASSIS1: '/Chassis Line 01.jpeg',      // .jpg not .png
  CHASSIS2: '/Chassis Line 02.jpg',
  ELECTRO:  '/Electrophoresis.png',
  PAINT:    '/Paint Shop.png',
  TRIM:     '/Trim Line & Final Assembly.jpg',
  QA:       '/Quality Inspection & Testing.png',
};

function getColors(model = '') {
  if (model.toUpperCase().includes('KDC')) return {
    bg: 'rgba(220,38,38,0.10)', border: '#dc2626',
    badgeBg: 'rgba(220,38,38,0.18)', badgeText: '#fca5a5', glow: 'rgba(220,38,38,0.25)',
  };
  return {
    bg: 'rgba(56,189,248,0.10)', border: '#38bdf8',
    badgeBg: 'rgba(56,189,248,0.18)', badgeText: '#7dd3fc', glow: 'rgba(56,189,248,0.25)',
  };
}

function PortalTooltip({ anchorRef, visible, above, children }) {
  const [style, setStyle] = useState({
    position: 'fixed', top: -9999, left: -9999, zIndex: 9999, pointerEvents: 'none',
  });
  const tipRef = useRef(null);

  useEffect(() => {
    if (!visible || !anchorRef.current) return;
    const r  = anchorRef.current.getBoundingClientRect();
    const tw = tipRef.current?.offsetWidth  || 200;
    const th = tipRef.current?.offsetHeight || 100;
    const top  = above ? r.top - th - 10 : r.bottom + 10;
    const left = r.left + r.width / 2 - tw / 2;
    setStyle({
      position: 'fixed',
      top:  Math.max(8, top),
      left: Math.max(8, Math.min(left, window.innerWidth - tw - 8)),
      zIndex: 9999, pointerEvents: 'none',
    });
  }, [visible, anchorRef, above]);

  if (!visible) return null;
  return createPortal(
    <div ref={tipRef} style={style}>{children}</div>,
    document.body
  );
}

function BusCallout({ bus }) {
  const [hover, setHover]       = useState(false);
  const [imgError, setImgError] = useState(false);
  const cardRef = useRef(null);
  const c = getColors(bus.model);
  const modelImg = BUS_IMAGES[bus.model];

  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 100,
          background: c.bg,
          border: `1.5px solid ${c.border}`,
          borderRadius: 6,
          padding: '6px 5px 5px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          cursor: 'pointer',
          transform: hover ? 'translateY(-3px)' : 'translateY(0)',
          boxShadow: hover ? `0 6px 18px ${c.glow}` : 'none',
          transition: 'transform 0.15s, box-shadow 0.15s',
          flexShrink: 0,
        }}
      >
        <div style={{
          background: c.badgeBg, color: c.badgeText, borderRadius: 3,
          padding: '2px 5px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          fontFamily: "'Space Mono', monospace", width: '100%', textAlign: 'center', whiteSpace: 'nowrap',
        }}>
          {bus.model || '—'}
        </div>

        {/* Model-specific image → Bus.png fallback */}
        <img
          src={!imgError && modelImg ? modelImg : '/Bus.png'}
          alt={bus.model}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: 44, objectFit: 'contain' }}
        />

        <div style={{
          fontSize: 9, color: '#cbd5e1', fontFamily: "'Space Mono', monospace",
          width: '100%', textAlign: 'center',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {bus.vin}
        </div>
      </div>

      <PortalTooltip anchorRef={cardRef} visible={hover} above={true}>
        <div style={{
          background: '#0d1526', border: `1px solid ${c.border}`,
          borderRadius: 8, padding: '10px 14px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.85)',
          minWidth: 190, textAlign: 'center',
          fontFamily: "'Space Mono', monospace",
        }}>
          <div style={{ color: c.badgeText, fontWeight: 700, fontSize: 11, marginBottom: 4 }}>{bus.model}</div>
          <div style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{bus.vin}</div>
          {bus.station?.name && (
            <div style={{
              background: 'rgba(255,255,255,0.05)', borderRadius: 4,
              padding: '4px 8px', fontSize: 10, color: '#94a3b8',
              lineHeight: 1.4, marginBottom: 4,
            }}>
              📍 {bus.station.name}
            </div>
          )}
          {bus.timestamp && <div style={{ color: '#475569', fontSize: 10 }}>{bus.timestamp}</div>}
        </div>
      </PortalTooltip>
    </>
  );
}

function StationDot({ station, code, buses, filter }) {
  const [tooltip, setTooltip] = useState(false);
  const dotRef = useRef(null);

  const busesHere = buses.filter(b => {
    if (b.stationCode !== code) return false;
    if (filter === 'ALL') return true;
    return b.model.toUpperCase().includes(filter);
  });

  const isQuality = station.name.toLowerCase().includes('quality') ||
                    station.name.toLowerCase().includes('gate');

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {busesHere.length > 0 && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'nowrap', justifyContent: 'center' }}>
          {busesHere.map(bus => <BusCallout key={bus.vin} bus={bus} />)}
        </div>
      )}

      <div
        ref={dotRef}
        onMouseEnter={() => setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
        style={{
          width: isQuality ? 13 : 9, height: isQuality ? 13 : 9,
          borderRadius: '50%',
          background: isQuality ? '#10b981' : busesHere.length > 0 ? '#dc2626' : '#334155',
          border: `2px solid ${isQuality ? '#059669' : busesHere.length > 0 ? '#b91c1c' : '#1e2d40'}`,
          cursor: 'pointer',
          transition: 'transform 0.15s',
          transform: tooltip ? 'scale(1.5)' : 'scale(1)',
          flexShrink: 0, zIndex: 2,
        }}
      />

      <PortalTooltip anchorRef={dotRef} visible={tooltip} above={busesHere.length === 0}>
        <div style={{
          background: '#0d1526', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: '7px 11px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.75)',
          width: 190, textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', marginBottom: 4 }}>
            {code}
          </div>
          <div style={{ fontSize: 11, color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' }}>
            {station.name}
          </div>
          {busesHere.length > 0 && (
            <div style={{ marginTop: 5, fontSize: 9, color: '#dc2626', fontFamily: "'Space Mono', monospace" }}>
              {busesHere.length} bus{busesHere.length > 1 ? 'es' : ''} here
            </div>
          )}
        </div>
      </PortalTooltip>
    </div>
  );
}

function LineCard({ line, stations, buses, filter, lineColor, zigzagRight }) {
  const [collapsed, setCollapsed] = useState(false);
  const [bgLoaded, setBgLoaded]   = useState(false);
  const bgImage = LINE_BG[line.id];

  const busesOnLine = buses.filter(b => {
    if (b.station?.line !== line.id) return false;
    if (filter === 'ALL') return true;
    return b.model.toUpperCase().includes(filter);
  });

  // Preload image to confirm it actually exists before applying
  useEffect(() => {
    if (!bgImage) return;
    const img = new Image();
    img.onload  = () => setBgLoaded(true);
    img.onerror = () => setBgLoaded(false);
    img.src = bgImage;
  }, [bgImage]);

  return (
    <div style={{
      position: 'relative',
      border: '1px solid rgba(255,255,255,0.06)',
      ...(zigzagRight
        ? { borderRight: `3px solid ${lineColor}`, borderRadius: '10px 0 0 10px' }
        : { borderLeft:  `3px solid ${lineColor}`, borderRadius: '0 10px 10px 0' }),
      overflow: 'hidden',
    }}>
      {/* Background image layer — only shown if image loaded */}
      {bgLoaded && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url('${bgImage}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          zIndex: 0, pointerEvents: 'none',
        }} />
      )}
      {/* Dark base — always present */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(13,21,38,0.85)',
        zIndex: 0, pointerEvents: 'none',
      }} />

      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: 5,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }}>
            <path d="M2 4L5.5 7.5L9 4" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <span style={{
          fontFamily: "'Syne', sans-serif", fontSize: 20, color: '#ffffff',
          letterSpacing: '0.04em', textTransform: 'uppercase',
          fontWeight: 800, lineHeight: 1, flex: 1,
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}>
          {line.label}
        </span>

        {busesOnLine.length > 0 && (
          <span style={{
            background: `${lineColor}22`, border: `1px solid ${lineColor}55`,
            color: lineColor, borderRadius: 20, padding: '2px 10px',
            fontSize: 11, fontFamily: "'Space Mono', monospace", fontWeight: 700,
          }}>
            {busesOnLine.length} active
          </span>
        )}

        <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em' }}>
          {stations.length} STATIONS
        </span>
      </div>

      {/* Rail */}
      {!collapsed && (
        <div style={{ position: 'relative', zIndex: 1, padding: '0 14px 10px' }}>
          <style>{`
            .rail-${line.id}::-webkit-scrollbar { height: 5px; }
            .rail-${line.id}::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 3px; }
            .rail-${line.id}::-webkit-scrollbar-thumb { background: ${lineColor}66; border-radius: 3px; }
            .rail-${line.id}::-webkit-scrollbar-thumb:hover { background: ${lineColor}cc; }
          `}</style>
          <div className={`rail-${line.id}`} style={{
            overflowX: 'auto', overflowY: 'visible', paddingBottom: 10,
            scrollbarWidth: 'thin', scrollbarColor: `${lineColor}66 rgba(255,255,255,0.04)`,
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 0,
              minWidth: 'max-content', paddingTop: 116,
            }}>
              {stations.map((station, idx) => (
                <div key={station.code} style={{ display: 'flex', alignItems: 'center' }}>
                  <StationDot station={station} code={station.code} buses={buses} filter={filter} />
                  {idx < stations.length - 1 && (
                    <div style={{
                      width: 28, height: 1.5,
                      background: `linear-gradient(90deg, ${lineColor}55, ${lineColor}22)`,
                      flexShrink: 0,
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 9, color: '#2d3f52', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', marginTop: 6 }}>
            {stations.length} STATIONS
          </div>
        </div>
      )}
    </div>
  );
}

export default function LineTracker({ buses, filter }) {
  const linesToShow = LINES.filter(line => {
    if (filter === 'ALL') return true;
    return line.models.some(m => filter.toUpperCase().includes(m) || m === filter);
  });

  const stationsByLine = {};
  for (const [code, st] of Object.entries(STATIONS)) {
    if (filter !== 'ALL' && !st.models.some(m => filter.toUpperCase().includes(m) || m === filter)) continue;
    if (!stationsByLine[st.line]) stationsByLine[st.line] = [];
    stationsByLine[st.line].push({ code, ...st });
  }
  for (const lineId of Object.keys(stationsByLine)) {
    stationsByLine[lineId].sort((a, b) => a.order - b.order);
  }

  const lineColors = {
    MACHINE:  '#64748b', BODY: '#8b5cf6', BODY_KDC: '#7c3aed',
    FRAME:    '#f97316', CHASSIS1: '#10b981', ELECTRO: '#06b6d4',
    PAINT:    '#ec4899', CHASSIS2: '#059669', TRIM: '#3b82f6', QA: '#ef4444',
  };

  const visibleLines = linesToShow
    .map(line => ({ line, stations: stationsByLine[line.id] || [] }))
    .filter(({ stations }) => stations.length > 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' }}>
      {visibleLines.map(({ line, stations }, idx) => (
        <LineCard
          key={line.id}
          line={line}
          stations={stations}
          buses={buses}
          filter={filter}
          lineColor={lineColors[line.id] || '#64748b'}
          zigzagRight={idx % 2 === 1}
        />
      ))}
    </div>
  );
}
