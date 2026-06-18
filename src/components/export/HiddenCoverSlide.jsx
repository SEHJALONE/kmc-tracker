import { LINES } from '../../data/stations';
import { isKDC, isEVS } from '../../export/exportHelpers';

const lineColors = {
  MACHINE: '#64748b', BODY: '#8b5cf6', BODY_KDC: '#7c3aed',
  FRAME: '#f97316', CHASSIS1: '#10b981', CHASSIS2: '#059669',
  ELECTRO: '#06b6d4', PAINT: '#ec4899', TRIM: '#3b82f6', QA: '#ef4444',
};
const modelColor = (m = '') => isKDC(m) ? '#dc2626' : isEVS(m) ? '#38bdf8' : '#64748b';

export default function HiddenCoverSlide({ coverRef, buses, rows, metrics }) {
  const lineDistribution = LINES
    .map(l => ({ ...l, count: metrics.busesByLine?.[l.id] || 0 }))
    .filter(l => l.count > 0)
    .sort((a, b) => b.count - a.count);

  const modelEntries = Object.entries(metrics.byModel || {}).sort((a, b) => b[1] - a[1]);
  const maxLine  = Math.max(...lineDistribution.map(l => l.count), 1);
  const maxModel = Math.max(...modelEntries.map(e => e[1]), 1);

  const byVin = {};
  for (const row of rows) {
    if (!byVin[row.vin]) byVin[row.vin] = [];
    byVin[row.vin].push(row);
  }
  const delayed = buses.filter(b => {
    const hist = (byVin[b.vin] || []).filter(r => r.rawTimestamp)
      .sort((a, c) => new Date(c.rawTimestamp) - new Date(a.rawTimestamp));
    const latestTs = hist[0] ? new Date(hist[0].rawTimestamp).getTime() : null;
    const ms = latestTs ? Date.now() - latestTs : null;
    return ms && ms > 48 * 3600000;
  }).length;

  const now = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const kpis = [
    { label: 'Total on Floor',    value: metrics.total    || 0, color: '#475569' },
    { label: 'KDC Units',         value: metrics.kdcCount || 0, color: '#dc2626' },
    { label: 'EVS Units',         value: metrics.evsCount || 0, color: '#38bdf8' },
    { label: 'Delayed',           value: delayed,               color: '#ef4444' },
    { label: 'Prod Rate (7-day)', value: `${metrics.prodRate || 0}/d`, color: '#10b981' },
  ];

  const perfItems = [
    { title: '↑ Best Station',    item: metrics.bestStation,  accent: '#10b981' },
    { title: '↓ Slowest Station', item: metrics.worstStation, accent: '#dc2626' },
    { title: '↑ Best Line',       item: metrics.bestLine,     accent: '#10b981' },
    { title: '↓ Slowest Line',    item: metrics.worstLine,    accent: '#dc2626' },
  ];

  return (
    <div
      ref={coverRef}
      style={{
        position: 'fixed',
        top: -9999,
        left: -9999,
        width: 1400,
        background: '#07090f',
        fontFamily: "'Barlow Condensed', sans-serif",
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        borderBottom: '2px solid rgba(220,38,38,0.4)',
        padding: '18px 32px 14px',
        background: 'rgba(10,16,28,0.95)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, transparent, #dc2626 30%, #dc2626 70%, transparent)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/kmc logo 2.png" alt="KMC" style={{ height: 44, objectFit: 'contain' }} />
            <div>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 22, fontWeight: 900, letterSpacing: '0.2em',
                color: '#ffffff', textTransform: 'uppercase', lineHeight: 1,
              }}>KMC Bus Production Report</div>
              <div style={{ fontSize: 11, color: '#475569', fontFamily: "'Space Mono', monospace", marginTop: 4, letterSpacing: '0.1em' }}>
                {now} · KIIRA MOTORS CORPORATION — CONFIDENTIAL
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em' }}>
            DASHBOARD SUMMARY · COVER SLIDE
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 32px 28px' }}>
        {/* KPI row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {kpis.map(({ label, value, color }) => (
            <div key={label} style={{
              flex: 1,
              background: 'rgba(13,21,38,0.9)',
              border: `1px solid ${color}44`,
              borderTop: `2px solid ${color}`,
              borderRadius: 6, padding: '14px 16px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* 3-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {/* Buses by Model */}
          <div style={{ background: 'rgba(13,21,38,0.85)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' }}>
            <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Space Mono', monospace", marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Buses by Model
            </div>
            {modelEntries.slice(0, 8).map(([model, count]) => (
              <div key={model} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: "'Barlow Condensed', sans-serif" }}>{model}</span>
                  <span style={{ fontSize: 10, color: modelColor(model), fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{count}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(count / maxModel) * 100}%`, background: modelColor(model), borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Buses by Line */}
          <div style={{ background: 'rgba(13,21,38,0.85)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' }}>
            <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Space Mono', monospace", marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Buses by Line
            </div>
            {lineDistribution.slice(0, 8).map(line => (
              <div key={line.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: "'Barlow Condensed', sans-serif" }}>{line.label}</span>
                  <span style={{ fontSize: 10, color: lineColors[line.id] || '#64748b', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{line.count}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(line.count / maxLine) * 100}%`, background: lineColors[line.id] || '#64748b', borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Performance highlights */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {perfItems.map(({ title, item, accent }) => (
              <div key={title} style={{
                flex: 1,
                background: `rgba(${accent === '#10b981' ? '16,185,129' : '220,38,38'},0.06)`,
                border: `1px solid ${accent}33`,
                borderRadius: 7, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 9, color: accent, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>{title}</div>
                {item
                  ? <>
                      <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 700, lineHeight: 1.3 }}>
                        {item.name || item.label || '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#475569', fontFamily: "'Space Mono', monospace", marginTop: 3 }}>
                        {item.hours ? `avg ${item.hours.toFixed(1)}h` : ''}
                        {item.variancePct != null ? ` · ${item.variancePct > 0 ? '+' : ''}${item.variancePct}% vs est.` : ''}
                      </div>
                    </>
                  : <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data</div>
                }
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(7,9,15,0.95)',
        padding: '8px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 9, color: '#1e2d40', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em' }}>
          KIIRA MOTORS CORPORATION
        </span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {[['#10b981','ON TRACK'], ['#f59e0b','SLOW (>24h)'], ['#dc2626','DELAYED (>48h)'], ['#dc2626','KDC'], ['#38bdf8','EVS']].map(([c, l]) => (
            <span key={l} style={{ fontSize: 9, color: c, fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em' }}>● {l}</span>
          ))}
        </div>
        <span style={{ fontSize: 9, color: '#1e2d40', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em' }}>
          {now}
        </span>
      </div>
    </div>
  );
}
