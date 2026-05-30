import { useState } from 'react';
import { useSheetData } from './hooks/useSheetData';
import LineTracker from './components/LineTracker';
import Dashboard from './components/Dashboard';

const FILTERS = [
  { id: 'ALL', label: 'All buses' },
  { id: 'KDC', label: 'KDC' },
  { id: 'EVS', label: 'EVS' },
];

export default function App() {
  const [view, setView] = useState('tracker');
  const [filter, setFilter] = useState('ALL');
  const { buses, allRows, loading, error, lastUpdated, unknownCodes, refresh } = useSheetData();

  // ✅ "12m KDC".toUpperCase().includes("KDC") → true
  const filteredBuses = filter === 'ALL'
    ? buses
    : buses.filter(b => b.model?.toUpperCase().includes(filter));

  // Count per filter button
  const countFor = (id) => id === 'ALL'
    ? buses.length
    : buses.filter(b => b.model?.toUpperCase().includes(id)).length;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07090f',
      color: '#e2e8f0',
      fontFamily: "'Syne', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { height: 4px; width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2d40; border-radius: 2px; }

        .nav-btn {
          position: relative;
          background: transparent;
          border: none;
          color: #4a5568;
          padding: 6px 18px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          font-family: 'Syne', sans-serif;
          transition: color 0.2s;
        }
        .nav-btn::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 18px;
          right: 18px;
          height: 2px;
          background: #dc2626;
          transform: scaleX(0);
          transition: transform 0.2s;
        }
        .nav-btn.active { color: #f8fafc; }
        .nav-btn.active::after { transform: scaleX(1); }
        .nav-btn:hover { color: #cbd5e1; }

        .filter-btn {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.08);
          color: #64748b;
          border-radius: 3px;
          padding: 6px 18px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          font-family: 'Space Mono', monospace;
          transition: all 0.15s;
        }
        .filter-btn:hover { border-color: rgba(255,255,255,0.2); color: #94a3b8; }
        .filter-btn.active-all {
          background: rgba(248,250,252,0.07);
          border-color: rgba(248,250,252,0.2);
          color: #f8fafc;
        }
        .filter-btn.active-kdc {
          background: rgba(220,38,38,0.12);
          border-color: #dc2626;
          color: #fca5a5;
        }
        .filter-btn.active-evs {
          background: rgba(56,189,248,0.1);
          border-color: #38bdf8;
          color: #7dd3fc;
        }

        .refresh-btn {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.08);
          color: #475569;
          border-radius: 3px;
          font-size: 11px;
          cursor: pointer;
          font-family: 'Space Mono', monospace;
          letter-spacing: 0.06em;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
        }
        .refresh-btn:hover { border-color: rgba(220,38,38,0.5); color: #dc2626; }

        .loading-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(220,38,38,0.2);
          border-top-color: #dc2626;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .pulse-dot {
          width: 6px; height: 6px;
          background: #dc2626;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }

        .scanlines::before {
          content: '';
          position: fixed;
          inset: 0;
          background: repeating-linear-gradient(
            0deg, transparent, transparent 2px,
            rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
          );
          pointer-events: none;
          z-index: 100;
        }

        @keyframes loadbar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>

      <div className="scanlines" />

      <div style={{
        position: 'fixed', top: 0, left: '15%', right: '15%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(220,38,38,0.6), transparent)',
        zIndex: 60,
      }} />

      {/* ── HEADER ── */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'stretch',
        height: 64,
        position: 'sticky',
        top: 0,
        background: 'rgba(7,9,15,0.97)',
        backdropFilter: 'blur(12px)',
        zIndex: 50,
      }}>
        {/* Brand */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginRight: 40,
          borderRight: '1px solid rgba(255,255,255,0.05)',
          paddingRight: 32,
        }}>
          <img
            src="/kmc logo 2.png"
            alt="KMC"
            style={{ height: 40, width: 'auto', objectFit: 'contain' }}
          />
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.18em',
            color: '#dc2626',
            textTransform: 'uppercase',
            lineHeight: 1.5,
          }}>
            Bus Production<br />Tracker
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'stretch' }}>
          {[
            { id: 'tracker', label: 'Line Tracker' },
            { id: 'dashboard', label: 'Dashboard' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`nav-btn ${view === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="loading-spinner" />
              <span style={{ fontSize: 10, color: '#475569', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em' }}>SYNCING</span>
            </div>
          ) : lastUpdated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="pulse-dot" />
              <span style={{ fontSize: 10, color: '#64748b', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em' }}>
                {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ) : null}

          <button className="refresh-btn" onClick={refresh} title="Refresh data">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            REFRESH
          </button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto' }}>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.07)',
            border: '1px solid rgba(220,38,38,0.2)',
            borderLeft: '3px solid #dc2626',
            borderRadius: '0 4px 4px 0',
            padding: '12px 16px',
            marginBottom: 24,
            fontSize: 12,
            color: '#fca5a5',
            fontFamily: "'Space Mono', monospace",
            letterSpacing: '0.04em',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Unknown station code warning — helps you fix your sheet */}
        {unknownCodes && unknownCodes.length > 0 && (
          <div style={{
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderLeft: '3px solid #f59e0b',
            borderRadius: '0 4px 4px 0',
            padding: '12px 16px',
            marginBottom: 24,
            fontSize: 11,
            color: '#fcd34d',
            fontFamily: "'Space Mono', monospace",
            letterSpacing: '0.04em',
          }}>
            ⚠ {unknownCodes.length} station code{unknownCodes.length > 1 ? 's' : ''} in your sheet not found in stations.js — buses there are hidden:{' '}
            <strong>{unknownCodes.join(', ')}</strong>
          </div>
        )}

        {/* Filter bar */}
        {view === 'tracker' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 28,
            flexWrap: 'wrap',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            paddingBottom: 20,
          }}>
            <span style={{
              fontSize: 10, color: '#334155',
              fontFamily: "'Space Mono', monospace",
              letterSpacing: '0.14em', marginRight: 8, textTransform: 'uppercase',
            }}>
              Filter
            </span>

            {FILTERS.map(f => {
              const count = countFor(f.id);
              const isActive = filter === f.id;
              const activeClass = isActive
                ? f.id === 'KDC' ? 'active-kdc'
                : f.id === 'EVS' ? 'active-evs'
                : 'active-all'
                : '';
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`filter-btn ${activeClass}`}
                >
                  {f.label}
                  <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 10 }}>{count}</span>
                </button>
              );
            })}

            {/* Legend */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
              {[
                { dot: '#2d3f52', label: 'Station' },
                { dot: '#059669', label: 'QA Gate' },
                { icon: '🚌', label: 'Bus Position' },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 10, color: '#334155',
                  fontFamily: "'Space Mono', monospace",
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {item.dot
                    ? <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.dot }} />
                    : <span style={{ fontSize: 12 }}>{item.icon}</span>
                  }
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {loading && buses.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 320, flexDirection: 'column', gap: 20,
          }}>
            <img src="/kmc logo 2.png" alt="KMC" style={{ height: 48, opacity: 0.3 }} />
            <div style={{
              fontSize: 11, color: '#334155',
              fontFamily: "'Space Mono', monospace",
              letterSpacing: '0.16em', textTransform: 'uppercase',
            }}>
              Loading production data
            </div>
            <div style={{ width: 180, height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#dc2626', animation: 'loadbar 1.5s ease-in-out infinite', width: '40%' }} />
            </div>
          </div>
        ) : view === 'tracker' ? (
          <LineTracker buses={filteredBuses} filter={filter} />
        ) : (
          <Dashboard buses={buses} allRows={allRows} />
        )}
      </main>
    </div>
  );
}
