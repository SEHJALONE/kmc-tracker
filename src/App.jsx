import { useState } from 'react';
import { useSheetData } from './hooks/useSheetData';
import LineTracker from './components/LineTracker';
import Dashboard from './components/Dashboard';
import BusReport from './components/BusReport';
import Login from './components/Login';

const FILTERS = [
  { id: 'ALL', label: 'All buses' },
  { id: 'KDC', label: 'KDC' },
  { id: 'EVS', label: 'EVS' },
];

const TABS = [
  { id: 'tracker',   label: 'Line Tracker' },
  { id: 'report',    label: 'Bus Report' },
  { id: 'dashboard', label: 'Dashboard' },
];

export default function App() {
  const [authed, setAuthed]     = useState(() => localStorage.getItem('kmc_auth') === 'true');
  const [view, setView]         = useState('tracker');
  const [filter, setFilter]     = useState('ALL');
  const { buses, allRows, loading, error, lastUpdated, refresh } = useSheetData();

  const filteredBuses = filter === 'ALL'
    ? buses
    : buses.filter(b => b.model?.toUpperCase().includes(filter));

  const countFor = id => id === 'ALL'
    ? buses.length
    : buses.filter(b => b.model?.toUpperCase().includes(id)).length;

  const handleLogout = () => {
    localStorage.removeItem('kmc_auth');
    setAuthed(false);
  };

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div style={{
      minHeight: '100vh', background: '#07090f',
      color: '#e2e8f0', fontFamily: "'Barlow Condensed', sans-serif",
    }}>
      <style>{`
        .nav-btn {
          position: relative; background: transparent; border: none;
          color: #4a5568; padding: 6px 20px;
          font-size: 16px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          cursor: pointer; font-family: 'Barlow Condensed', sans-serif;
          transition: color 0.2s;
        }
        .nav-btn::after {
          content: ''; position: absolute; bottom: -1px; left: 20px; right: 20px;
          height: 2px; background: #dc2626;
          transform: scaleX(0); transition: transform 0.2s;
        }
        .nav-btn.active { color: #f8fafc; }
        .nav-btn.active::after { transform: scaleX(1); }
        .nav-btn:hover { color: #cbd5e1; }

        .filter-btn {
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          color: #64748b; border-radius: 3px; padding: 5px 18px;
          font-size: 14px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif; transition: all 0.15s;
        }
        .filter-btn:hover { border-color: rgba(255,255,255,0.2); color: #94a3b8; }
        .filter-btn.active-all  { background: rgba(248,250,252,0.07); border-color: rgba(248,250,252,0.2); color: #f8fafc; }
        .filter-btn.active-kdc  { background: rgba(220,38,38,0.12);  border-color: #dc2626; color: #fca5a5; }
        .filter-btn.active-evs  { background: rgba(56,189,248,0.1);  border-color: #38bdf8; color: #7dd3fc; }

        .icon-btn {
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          color: #475569; border-radius: 3px; font-size: 13px; cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif; letter-spacing: 0.1em;
          text-transform: uppercase; transition: all 0.15s;
          display: flex; align-items: center; gap: 6px; padding: 5px 12px;
        }
        .icon-btn:hover { border-color: rgba(220,38,38,0.5); color: #dc2626; }

        .loading-spinner {
          width: 15px; height: 15px;
          border: 2px solid rgba(220,38,38,0.2);
          border-top-color: #dc2626; border-radius: 50%;
          animation: spin 0.8s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .pulse-dot {
          width: 6px; height: 6px; background: #dc2626; border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }

        .scanlines::before {
          content: ''; position: fixed; inset: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px,
            rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px);
          pointer-events: none; z-index: 100;
        }

        @keyframes loadbar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }

        ::-webkit-scrollbar { height: 5px; width: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e2d40; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #2d3f52; }
      `}</style>

      <div className="scanlines" />
      <div style={{
        position: 'fixed', top: 0, left: '15%', right: '15%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(220,38,38,0.6), transparent)', zIndex: 60,
      }} />

      {/* Header */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 32px',
        display: 'flex', alignItems: 'stretch', height: 64,
        position: 'sticky', top: 0,
        background: 'rgba(7,9,15,0.97)', backdropFilter: 'blur(12px)', zIndex: 50,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginRight: 40, borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: 32,
        }}>
          <img src="/kmc logo 2.png" alt="KMC" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 800,
            letterSpacing: '0.14em', color: '#ffffff', textTransform: 'uppercase', lineHeight: 1.2,
          }}>
            Bus Production<br />Tracker
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'stretch' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)}
              className={`nav-btn ${view === tab.id ? 'active' : ''}`}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="loading-spinner" />
              <span style={{ fontSize: 12, color: '#475569', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em' }}>SYNCING</span>
            </div>
          ) : lastUpdated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="pulse-dot" />
              <span style={{ fontSize: 11, color: '#64748b', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em' }}>
                {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ) : null}

          <button className="icon-btn" onClick={refresh}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Refresh
          </button>

          <button className="icon-btn" onClick={handleLogout} style={{ borderColor: 'rgba(220,38,38,0.2)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto' }}>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)',
            borderLeft: '3px solid #dc2626', borderRadius: '0 4px 4px 0',
            padding: '11px 16px', marginBottom: 22,
            fontSize: 13, color: '#fca5a5',
            fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em',
          }}>⚠ {error}</div>
        )}

        {/* Filter bar */}
        {(view === 'tracker' || view === 'report') && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 26, flexWrap: 'wrap',
            borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 18,
          }}>
            <span style={{
              fontSize: 12, color: '#334155', fontFamily: "'Space Mono', monospace",
              letterSpacing: '0.14em', marginRight: 8, textTransform: 'uppercase',
            }}>Filter</span>

            {FILTERS.map(f => {
              const count = countFor(f.id);
              const isActive = filter === f.id;
              const cls = isActive
                ? f.id === 'KDC' ? 'active-kdc' : f.id === 'EVS' ? 'active-evs' : 'active-all'
                : '';
              return (
                <button key={f.id} onClick={() => setFilter(f.id)} className={`filter-btn ${cls}`}>
                  {f.label}
                  <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>{count}</span>
                </button>
              );
            })}

            {/* ✅ Legend — Bus.png instead of emoji */}
            {view === 'tracker' && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#334155' }} />
                  Station
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669' }} />
                  QA Gate
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {/* Bus.png in legend */}
                  <img src="/Bus.png" alt="bus" style={{ height: 16, width: 'auto', objectFit: 'contain', opacity: 0.6 }} />
                  Bus Position
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {loading && buses.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 320, flexDirection: 'column', gap: 20,
          }}>
            <img src="/kmc logo 2.png" alt="KMC" style={{ height: 48, opacity: 0.25 }} />
            <div style={{ fontSize: 13, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Loading production data
            </div>
            <div style={{ width: 180, height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#dc2626', animation: 'loadbar 1.5s ease-in-out infinite', width: '40%' }} />
            </div>
          </div>
        ) : view === 'tracker' ? (
          <LineTracker buses={filteredBuses} filter={filter} />
        ) : view === 'report' ? (
          <BusReport buses={buses} allRows={allRows} filter={filter} />
        ) : (
          <Dashboard buses={buses} allRows={allRows} />
        )}
      </main>
    </div>
  );
}
