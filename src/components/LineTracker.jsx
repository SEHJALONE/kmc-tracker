import { useState } from 'react';
import { LINES, STATIONS } from '../data/stations';

// ════════════════════════════════════════════════════════
//  CALLOUT APPEARANCE — edit these values to restyle
// ════════════════════════════════════════════════════════
const CALLOUT = {
  cardWidth:        110,    // px — width of each bus card above the dot
  imageHeight:       64,    // px — height of the bus PNG inside the card
  badgeFontSize:     10,    // px — model name badge text
  vinFontSize:       10,    // px — bus VIN text below image
  vinColor:       '#cbd5e1',
  tooltipNameSize:   13,    // px — station name text in hover tooltip
  tooltipWidth:     220,    // px — width of the station tooltip box
};

// ════════════════════════════════════════════════════════
//  BUS IMAGES — key must exactly match Column E in sheet
//  Files must be placed in your /public folder
// ════════════════════════════════════════════════════════
const BUS_IMAGES = {
  '7m EVS':    '/7m EVS.png',
  '8.5m EVS':  '/8.5m EVS.png',
  '10.5m EVS': '/10.5m EVS.png',
  '12m EVS':   '/12m EVS.png',
  '10.5m KDC': '/10.5m KDC.png',
  '12m KDC':   '/12m KDC.png',
};

// ════════════════════════════════════════════════════════
//  COLOURS per model family
// ════════════════════════════════════════════════════════
function getColors(model = '') {
  if (model.toUpperCase().includes('KDC')) return {
    bg: 'rgba(245,158,11,0.10)',
    border: '#f59e0b',
    badgeBg: 'rgba(245,158,11,0.18)',
    badgeText: '#fbbf24',
    glow: 'rgba(245,158,11,0.25)',
  };
  // Default → EVS (blue)
  return {
    bg: 'rgba(59,130,246,0.10)',
    border: '#3b82f6',
    badgeBg: 'rgba(59,130,246,0.18)',
    badgeText: '#93c5fd',
    glow: 'rgba(59,130,246,0.25)',
  };
}

// ════════════════════════════════════════════════════════
//  BusCallout — card shown above the station dot
// ════════════════════════════════════════════════════════
function BusCallout({ bus }) {
  const [hover, setHover] = useState(false);
  const [imgError, setImgError] = useState(false);
  const c = getColors(bus.model);
  const imgSrc = BUS_IMAGES[bus.model];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: CALLOUT.cardWidth,
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        borderRadius: 7,
        padding: '7px 6px 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        transform: hover ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hover ? `0 8px 24px ${c.glow}` : 'none',
        transition: 'transform 0.15s, box-shadow 0.15s',
        flexShrink: 0,
      }}
    >
      {/* Model badge — full name, no truncation */}
      <div style={{
        background: c.badgeBg,
        color: c.badgeText,
        borderRadius: 3,
        padding: '2px 6px',
        fontSize: CALLOUT.badgeFontSize,
        fontWeight: 700,
        letterSpacing: '0.08em',
        fontFamily: "'Space Mono', monospace",
        width: '100%',
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}>
        {bus.model || '—'}
      </div>

      {/* Bus image */}
      {imgSrc && !imgError ? (
        <img
          src={imgSrc}
          alt={bus.model}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: CALLOUT.imageHeight,
            objectFit: 'contain',
          }}
        />
      ) : (
        <div style={{
          height: CALLOUT.imageHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 30,
        }}>🚌</div>
      )}

      {/* VIN */}
      <div style={{
        fontSize: CALLOUT.vinFontSize,
        color: CALLOUT.vinColor,
        fontFamily: "'Space Mono', monospace",
        width: '100%',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {bus.vin}
      </div>

      {/* Hover detail popup */}
      {hover && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0d1526',
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          padding: '10px 14px',
          zIndex: 300,
          pointerEvents: 'none',
          boxShadow: `0 8px 28px rgba(0,0,0,0.7)`,
          minWidth: 160,
          textAlign: 'center',
          fontFamily: "'Space Mono', monospace",
        }}>
          <div style={{ color: c.badgeText, fontWeight: 700, fontSize: 12, marginBottom: 5 }}>
            {bus.model}
          </div>
          <div style={{ color: '#f1f5f9', fontSize: 11, marginBottom: bus.timestamp ? 4 : 0 }}>
            {bus.vin}
          </div>
          {bus.timestamp && (
            <div style={{ color: '#475569', fontSize: 10 }}>{bus.timestamp}</div>
          )}
          {/* Arrow */}
          <div style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `5px solid ${c.border}`,
          }} />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  StationDot — dot + callouts + station name tooltip
// ════════════════════════════════════════════════════════
function StationDot({ station, code, buses, filter }) {
  const [tooltip, setTooltip] = useState(false);

  // ✅ filter uses .includes() so "12m KDC" matches filter "KDC"
  const busesHere = buses.filter(b => {
    if (b.stationCode !== code) return false;
    if (filter === 'ALL') return true;
    return b.model.toUpperCase().includes(filter);
  });

  const isQuality = station.name.toLowerCase().includes('quality') ||
                    station.name.toLowerCase().includes('gate');

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Bus cards above dot */}
      {busesHere.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 6,
          marginBottom: 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 280,
        }}>
          {busesHere.map(bus => (
            <BusCallout key={bus.vin} bus={bus} />
          ))}
        </div>
      )}

      {/* Station dot */}
      <div
        onMouseEnter={() => setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
        style={{
          width: isQuality ? 14 : 10,
          height: isQuality ? 14 : 10,
          borderRadius: '50%',
          background: isQuality ? '#10b981' : busesHere.length > 0 ? '#f59e0b' : '#475569',
          border: `2px solid ${isQuality ? '#059669' : busesHere.length > 0 ? '#d97706' : '#334155'}`,
          cursor: 'pointer',
          transition: 'transform 0.2s',
          transform: tooltip ? 'scale(1.4)' : 'scale(1)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 2,
        }}
      />

      {/* Station tooltip — full name, no truncation */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          // If buses are above, show tooltip below the dot instead
          ...(busesHere.length > 0
            ? { top: 'calc(100% + 8px)' }
            : { bottom: 'calc(100% + 8px)' }
          ),
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0d1526',
          color: '#f1f5f9',
          padding: '9px 13px',
          borderRadius: 7,
          zIndex: 200,
          pointerEvents: 'none',
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
          width: CALLOUT.tooltipWidth,
          textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Station code */}
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700,
            color: '#475569',
            fontSize: 10,
            letterSpacing: '0.12em',
            marginBottom: 5,
          }}>
            {code}
          </div>
          {/* Full station name — wraps, never truncated */}
          <div style={{
            fontSize: CALLOUT.tooltipNameSize,
            fontWeight: 600,
            color: '#f1f5f9',
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}>
            {station.name}
          </div>
          {busesHere.length > 0 && (
            <div style={{
              marginTop: 6,
              color: '#f59e0b',
              fontSize: 10,
              fontFamily: "'Space Mono', monospace",
              letterSpacing: '0.06em',
            }}>
              {busesHere.length} bus{busesHere.length > 1 ? 'es' : ''} here
            </div>
          )}
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            ...(busesHere.length > 0
              ? { bottom: '100%', borderBottom: '5px solid #0d1526', borderTop: 'none' }
              : { top: '100%', borderTop: '5px solid #0d1526', borderBottom: 'none' }
            ),
            left: '50%',
            transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
          }} />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  LineTracker — main export
// ════════════════════════════════════════════════════════
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
    MACHINE:  '#64748b',
    BODY:     '#8b5cf6',
    BODY_KDC: '#7c3aed',
    FRAME:    '#f97316',
    ELECTRO:  '#06b6d4',
    PAINT:    '#ec4899',
    CHASSIS1: '#10b981',
    CHASSIS2: '#059669',
    TRIM:     '#3b82f6',
    QA:       '#ef4444',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {linesToShow.map(line => {
        const stations = stationsByLine[line.id] || [];
        if (stations.length === 0) return null;

        const busesOnLine = buses.filter(b => {
          if (b.station?.line !== line.id) return false;
          if (filter === 'ALL') return true;
          return b.model.toUpperCase().includes(filter);
        });

        const lineColor = lineColors[line.id] || '#64748b';

        return (
          <div key={line.id} style={{
            background: 'rgba(13,21,38,0.7)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderLeft: `3px solid ${lineColor}`,
            borderRadius: '0 10px 10px 0',
            padding: '18px 24px 16px',
          }}>
            {/* Line header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                color: lineColor,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}>
                {line.label}
              </span>
              {busesOnLine.length > 0 && (
                <span style={{
                  background: `${lineColor}1a`,
                  border: `1px solid ${lineColor}44`,
                  color: lineColor,
                  borderRadius: 20,
                  padding: '2px 10px',
                  fontSize: 10,
                  fontFamily: "'Space Mono', monospace",
                }}>
                  {busesOnLine.length} active
                </span>
              )}
            </div>

            {/* Scrollable rail */}
            <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 0,
                minWidth: 'max-content',
                // top padding = card height (badge + image + vin + gaps) + margin below card
                paddingTop: CALLOUT.imageHeight + 70,
              }}>
                {stations.map((station, idx) => (
                  <div key={station.code} style={{ display: 'flex', alignItems: 'center' }}>
                    <StationDot
                      station={station}
                      code={station.code}
                      buses={buses}
                      filter={filter}
                    />
                    {idx < stations.length - 1 && (
                      <div style={{
                        width: 28,
                        height: 1.5,
                        background: `linear-gradient(90deg, ${lineColor}55, ${lineColor}22)`,
                        flexShrink: 0,
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              marginTop: 10,
              fontSize: 10,
              color: '#2d3f52',
              fontFamily: "'Space Mono', monospace",
              letterSpacing: '0.1em',
            }}>
              {stations.length} STATIONS
            </div>
          </div>
        );
      })}
    </div>
  );
}
