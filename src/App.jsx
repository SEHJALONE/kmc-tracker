import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSheetData, filterByDateRange } from './hooks/useSheetData';
import { useStationTimes } from './hooks/useStationTimes';
import { useCatalog } from './hooks/useCatalog';
import { isActive } from './data/catalogConfig';
import { useBreakpoint } from './hooks/useBreakpoint';
import { lookupStation } from './data/stations';
import LineTracker from './components/LineTracker';
import Dashboard from './components/Dashboard';
import BusReport from './components/BusReport';
import Login from './components/Login';
import TravelCard from './components/TravelCard';
import HomeScreen from './components/HomeScreen';
import FilterBar from './components/FilterBar';
import CatalogAdmin from './components/CatalogAdmin';
import InfoModal from './components/InfoModal';
import NCRBoard from './components/NCRBoard';
import NCRModal from './components/NCRModal';
import HandoverLog from './components/HandoverLog';
import HandoverModal from './components/HandoverModal';
import { useHandoverData } from './hooks/useHandoverData';

// ── Theme helpers ──────────────────────────────────────────────────────────────
function getInitialTheme() {
  const saved = localStorage.getItem('kmc_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ── Sun / Moon icons ───────────────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1"  x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    </svg>
  );
}

// ── Date resolution helper ─────────────────────────────────────────────────────
function resolveDateBounds(datePreset, startDate, endDate) {
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().slice(0, 10);
  if (datePreset === 'today') return { startDate: todayStr, endDate: todayStr };
  if (datePreset === 'yesterday') {
    const d = new Date(todayDate); d.setDate(d.getDate() - 1);
    const s = d.toISOString().slice(0, 10);
    return { startDate: s, endDate: s };
  }
  if (datePreset === '7d') {
    const d = new Date(todayDate); d.setDate(d.getDate() - 6);
    return { startDate: d.toISOString().slice(0, 10), endDate: todayStr };
  }
  if (datePreset === '30d') {
    const d = new Date(todayDate); d.setDate(d.getDate() - 29);
    return { startDate: d.toISOString().slice(0, 10), endDate: todayStr };
  }
  if (datePreset === 'custom') return { startDate, endDate };
  return { startDate: null, endDate: null };
}

const DEFAULT_FILTERS = {
  model: 'ALL',
  project: '',
  line: 'ALL',
  station: '',
  status: 'ALL',
  datePreset: 'all',
  startDate: null,
  endDate: null,
};

const TABS = [
  { id: 'tracker',   label: 'Line Tracker' },
  { id: 'report',    label: 'Bus Report' },
  { id: 'dashboard', label: 'Dashboard' },
];

export default function App() {
  const [authed,     setAuthed]     = useState(() => localStorage.getItem('kmc_auth') === 'true');
  const [role,       setRole]       = useState(() => localStorage.getItem('kmc_role') || 'user');
  const [ncrDomain,  setNcrDomain]  = useState(() => localStorage.getItem('kmc_ncr_domain') || null);
  const [mode,   setMode]   = useState('home'); // 'home' | 'travelcard' | 'tracker'
  const [view,   setView]   = useState('tracker');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [theme,  setTheme]  = useState(getInitialTheme);
  const [menuOpen, setMenuOpen] = useState(false);

  const { isMobile, isTablet } = useBreakpoint();

  const [tcPrefill, setTcPrefill] = useState(null);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // Sync theme to DOM + localStorage
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kmc_theme', theme);
  }, [theme]);

  const {
    buses,
    allRows,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useSheetData();

  const { stationTimes, loading: timesLoading } = useStationTimes();

  // Shared catalog — drives travel-card dropdowns AND the bus tracker so admin
  // edits to lines/stations/projects reflect everywhere.
  const { catalog, saveCatalog, saving: catalogSaving, listCatalogBackups, restoreCatalogBackup } = useCatalog();
  const [adminOpen, setAdminOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Resolve date bounds from active preset
  const dateBounds = useMemo(
    () => resolveDateBounds(filters.datePreset, filters.startDate, filters.endDate),
    [filters.datePreset, filters.startDate, filters.endDate]
  );

  // Distinct project names for the filter dropdown: union of catalog projects
  // (active) and any projects present in historical data (so legacy projects
  // stay filterable even after they're archived/removed from the catalog).
  const allProjects = useMemo(() => {
    const set = new Set(allRows.map(r => r.project).filter(Boolean));
    (catalog.projects || []).filter(isActive).forEach(p => p.name && set.add(p.name));
    return [...set].sort();
  }, [allRows, catalog.projects]);

  // Resolve the selected project to its catalog entry (for legacy-station
  // visibility in the tracker). Falls back to a bare name when only data-derived.
  const selectedProject = useMemo(() => {
    if (!filters.project) return null;
    return (catalog.projects || []).find(p => p.name === filters.project)
      || { name: filters.project };
  }, [filters.project, catalog.projects]);

  // All rows filtered by date + model + project (used for Dashboard metrics)
  const filteredRows = useMemo(() => {
    let rows = filterByDateRange(allRows, dateBounds.startDate, dateBounds.endDate);
    if (filters.model !== 'ALL') {
      rows = rows.filter(r => r.model?.toUpperCase().includes(filters.model));
    }
    if (filters.project) {
      rows = rows.filter(r => r.project === filters.project);
    }
    return rows;
  }, [allRows, dateBounds, filters.model, filters.project]);

  // Latest bus positions after all filters applied
  const filteredBuses = useMemo(() => {
    const map = {};
    for (const row of filteredRows) {
      const ts = new Date(row.rawTimestamp || 0).getTime() || 0;
      if (!map[row.vin] || ts >= map[row.vin].ts) {
        map[row.vin] = { ...row, ts };
      }
    }
    let result = Object.values(map)
      .map(entry => {
        const station = lookupStation(entry.stationCode);
        return station ? { ...entry, station } : null;
      })
      .filter(Boolean);

    if (filters.line !== 'ALL') {
      result = result.filter(b => b.station?.line === filters.line);
    }
    if (filters.station) {
      result = result.filter(b => b.stationCode === filters.station);
    }
    if (filters.status !== 'ALL') {
      result = result.filter(b => {
        if (filters.status === 'APPROVED') return b.approvalStatus?.toLowerCase().includes('approved');
        if (filters.status === 'PENDING')  return !b.approvalStatus || b.approvalStatus?.toLowerCase().includes('pending');
        if (filters.status === 'OHS')      return !!b.ohsIssue;
        if (filters.status === 'OVERRUN')  return (b.overrunMin || 0) > 0;
        if (filters.status === 'REWORK')   return b.reworkFlag === true;
        return true;
      });
    }
    return result;
  }, [filteredRows, filters.line, filters.station, filters.status]);

  const handleLogout = () => {
    localStorage.removeItem('kmc_auth');
    localStorage.removeItem('kmc_role');
    localStorage.removeItem('kmc_ncr_domain');
    setRole('user');
    setNcrDomain(null);
    setAuthed(false);
  };

  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';

  if (!authed) return <Login onLogin={(r, d) => { setRole(r || 'user'); setNcrDomain(d || null); setAuthed(true); setMode('home'); }} theme={theme} toggleTheme={toggleTheme} />;

  if (mode === 'home') return (
    <HomeScreen
      theme={theme}
      toggleTheme={toggleTheme}
      onLogout={handleLogout}
      onSelectTravelCard={() => setMode('travelcard')}
      onSelectTracker={() => setMode('tracker')}
      onSelectNCR={() => setMode('ncr')}
      onSelectHandover={() => setMode('handover')}
    />
  );

  if (mode === 'travelcard') return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        .tc-header {
          border-bottom: 1px solid var(--header-border);
          padding: 0 clamp(14px, 4vw, 32px);
          display: flex;
          align-items: center;
          height: 64;
          position: sticky;
          top: 0;
          background: var(--header-bg);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          z-index: 100;
          gap: clamp(8px, 2vw, 16px);
        }
        .tc-btn {
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .tc-btn.accent { border-color: var(--accent-border); }
        .tc-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--text-heading);
          text-transform: uppercase;
          white-space: nowrap;
        }
        @media (max-width: 560px) {
          .tc-title { display: none; }
          .tc-logo { height: 30px !important; }
          .tc-btn { padding: 6px 9px; }
          .tc-btn .tc-label { display: none; }
        }
      `}</style>
      <header className="tc-header" style={{ height: 64 }}>
        <button className="tc-btn" onClick={() => setMode('home')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          <span className="tc-label">Home</span>
        </button>
        <img className="tc-logo" src={theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png'} alt="KMC" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        <div className="tc-title">Travel Card</div>
        <div style={{ flex: 1 }} />
        {role === 'admin' && (
          <button className="tc-btn accent" onClick={() => setAdminOpen(true)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2l2.4 4.8L20 8l-4 3.9.9 5.6L12 15l-4.9 2.5L8 11.9 4 8l5.6-1.2z"/>
            </svg>
            <span className="tc-label">Edit Catalog</span>
          </button>
        )}
        <button className="tc-btn" onClick={() => setInfoOpen(true)} title="About this module">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9.5" />
            <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="currentColor" strokeWidth="1.6" />
            <line x1="12" y1="11" x2="12" y2="17" strokeWidth="2.8" />
          </svg>
          <span className="tc-label">Info</span>
        </button>
        <button className="tc-btn" onClick={toggleTheme}>
          {theme === 'dark' ? '☀' : '☾'}<span className="tc-label">{theme === 'dark' ? ' Light' : ' Dark'}</span>
        </button>
        <button className="tc-btn accent" onClick={handleLogout}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          <span className="tc-label">Sign Out</span>
        </button>
      </header>
      <main style={{ padding: 'clamp(18px, 4vw, 28px) clamp(14px, 4vw, 32px)', maxWidth: 1440, margin: '0 auto' }}>
        <TravelCard
          prefillVin={tcPrefill?.vin ?? ''}
          prefillModel={tcPrefill?.model ?? ''}
          prefillStation={tcPrefill?.stationCode ?? ''}
          onReset={() => setTcPrefill(null)}
          onSubmitSuccess={refresh}
          theme={theme}
          role={role}
          catalog={catalog}
        />
      </main>
      {adminOpen && role === 'admin' && (
        <CatalogAdmin
          catalog={catalog}
          saveCatalog={saveCatalog}
          saving={catalogSaving}
          listCatalogBackups={listCatalogBackups}
          restoreCatalogBackup={restoreCatalogBackup}
          onClose={() => setAdminOpen(false)}
        />
      )}
      {infoOpen && <InfoModal mode="travelcard" onClose={() => setInfoOpen(false)} />}
    </div>
  );

  if (mode === 'ncr') return (
    <NCRStandalone
      role={role}
      theme={theme}
      toggleTheme={toggleTheme}
      onHome={() => setMode('home')}
    />
  );

  if (mode === 'handover') return (
    <HandoverStandalone
      role={role}
      theme={theme}
      toggleTheme={toggleTheme}
      onHome={() => setMode('home')}
    />
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      fontFamily: "'Inter', system-ui, sans-serif",
      transition: 'background 0.25s ease, color 0.25s ease',
    }}>
      <style>{`
        .nav-btn {
          position: relative;
          background: transparent;
          border: none;
          color: var(--nav-color);
          padding: 6px 20px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          cursor: pointer;
          font-family: 'Inter', system-ui, sans-serif;
          transition: color 0.2s;
          height: 100%;
        }
        .nav-btn::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 20px;
          right: 20px;
          height: 2px;
          background: var(--accent);
          transform: scaleX(0);
          transition: transform 0.2s;
        }
        .nav-btn.active { color: var(--nav-active); }
        .nav-btn.active::after { transform: scaleX(1); }
        .nav-btn:hover { color: var(--nav-hover); }

        .icon-btn {
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'Inter', system-ui, sans-serif;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
        }
        .icon-btn:hover {
          border-color: var(--accent-border);
          color: var(--accent);
        }

        .loading-spinner {
          width: 14px; height: 14px;
          border: 2px solid var(--accent-alpha);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .pulse-dot {
          width: 6px; height: 6px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }

        @keyframes loadbar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }

        /* Mobile hamburger lines */
        .hamburger { display: flex; flex-direction: column; gap: 4px; cursor: pointer; padding: 4px; }
        .hamburger span { display: block; width: 20px; height: 2px; background: var(--text-secondary); border-radius: 2px; transition: all 0.25s; }
        .hamburger.open span:nth-child(1) { transform: rotate(45deg) translate(4px, 4px); }
        .hamburger.open span:nth-child(2) { opacity: 0; }
        .hamburger.open span:nth-child(3) { transform: rotate(-45deg) translate(4px, -4px); }

        /* Mobile drawer nav button */
        .drawer-nav-btn {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 24px;
          font-size: 16px; font-weight: 600;
          letter-spacing: 0.05em; text-transform: uppercase;
          color: var(--nav-color);
          background: transparent; border: none;
          width: 100%; text-align: left;
          cursor: pointer;
          font-family: 'Inter', system-ui, sans-serif;
          border-bottom: 1px solid var(--border);
          transition: color 0.15s, background 0.15s;
        }
        .drawer-nav-btn.active { color: var(--nav-active); background: var(--bg-surface-2); }
        .drawer-nav-btn:hover  { color: var(--nav-hover); }

        /* Condensed right controls on tablet */
        @media (max-width: 1023px) {
          .icon-btn .btn-label { display: none; }
          .icon-btn { padding: 5px 8px !important; }
        }
      `}</style>

      {/* ── Mobile Nav Drawer ── */}
      <div className={`mobile-nav-drawer ${menuOpen ? 'open' : ''}`}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logo} alt="KMC" style={{ height: 34, width: 'auto', objectFit: 'contain' }} />
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-heading)', textTransform: 'uppercase', lineHeight: 1.25 }}>
              Bus Production<br />Tracker
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 8, fontSize: 20, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <button
            onClick={() => { setMode('home'); setMenuOpen(false); }}
            className="drawer-nav-btn"
          >
            ← Home
          </button>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setView(tab.id); setMenuOpen(false); }}
              className={`drawer-nav-btn ${view === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => { setInfoOpen(true); setMenuOpen(false); }}
            className="drawer-nav-btn"
          >
            ⓘ Info
          </button>
        </nav>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)' }}>
          {/* Sync status */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="loading-spinner" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif" }}>Syncing…</span>
            </div>
          ) : lastUpdated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="pulse-dot" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif" }}>
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="icon-btn" onClick={() => { refresh(); setMenuOpen(false); }} style={{ flex: 1, justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              Refresh
            </button>
            <button className="icon-btn" onClick={toggleTheme} style={{ flex: 1, justifyContent: 'center' }}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="icon-btn" onClick={() => { handleLogout(); setMenuOpen(false); }} style={{ flex: 1, justifyContent: 'center', borderColor: 'var(--accent-border)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
              Out
            </button>
          </div>
        </div>
      </div>

      {/* ── Header ── */}
      <header className="app-header" style={{
        borderBottom: '1px solid var(--header-border)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'stretch',
        height: 68,
        position: 'sticky',
        top: 0,
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        zIndex: 100,
        transition: 'background 0.25s ease, border-color 0.25s ease',
      }}>
        {/* Logo + brand */}
        <div className="app-header-brand" style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginRight: 40,
          borderRight: '1px solid var(--header-border)',
          paddingRight: 32,
        }}>
          <img src={logo} alt="KMC" style={{ height: isMobile ? 32 : 40, width: 'auto', objectFit: 'contain' }} />
          {!isMobile && (
            <div style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 13, fontWeight: 700,
              letterSpacing: '0.06em',
              color: 'var(--text-heading)',
              textTransform: 'uppercase',
              lineHeight: 1.25,
            }}>
              Bus Production<br />Tracker
            </div>
          )}
        </div>

        {/* Desktop/Tablet Nav */}
        <nav className="app-header-nav" style={{ display: 'flex', alignItems: 'stretch' }}>
          <button
            onClick={() => setMode('home')}
            className="nav-btn"
            style={isTablet ? { padding: '6px 12px', fontSize: 11 } : {}}
          >
            ← Home
          </button>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`nav-btn ${view === tab.id ? 'active' : ''}`}
              style={isTablet ? { padding: '6px 12px', fontSize: 11 } : {}}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Mobile row: hamburger on the right */}
        <div className="app-mobile-row" style={{
          display: 'none', alignItems: 'center', gap: 8, marginLeft: 'auto',
        }}>
          {/* Sync dot on mobile */}
          {loading ? (
            <div className="loading-spinner" />
          ) : lastUpdated ? (
            <div className="pulse-dot" />
          ) : null}
          <button
            onClick={toggleTheme}
            className="icon-btn"
            style={{ padding: '6px 8px' }}
            title="Toggle theme"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className={`hamburger ${menuOpen ? 'open' : ''}`}
            aria-label="Open menu"
            style={{ background: 'none', border: 'none', padding: 8 }}
          >
            <span /><span /><span />
          </button>
        </div>

        {/* Desktop right controls */}
        <div className="app-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Station estimates badge */}
          {!isMobile && !isTablet && (timesLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border-medium)' }} />
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em' }}>
                ESTIMATES…
              </span>
            </div>
          ) : Object.keys(stationTimes).length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success-color)' }} />
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em' }}>
                {Object.keys(stationTimes).length} ESTIMATES
              </span>
            </div>
          ) : null)}

          {/* Sync status */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="loading-spinner" />
              {!isTablet && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em' }}>SYNCING</span>}
            </div>
          ) : lastUpdated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="pulse-dot" />
              {!isTablet && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em' }}>
                {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>}
            </div>
          ) : null}

          {role === 'admin' && (
            <button className="icon-btn" onClick={() => setAdminOpen(true)} style={{ borderColor: 'var(--accent-border)' }} title="Edit catalog">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2l2.4 4.8L20 8l-4 3.9.9 5.6L12 15l-4.9 2.5L8 11.9 4 8l5.6-1.2z"/>
              </svg>
              <span className="btn-label">Catalog</span>
            </button>
          )}

          <button className="icon-btn" onClick={refresh} title="Refresh data">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            <span className="btn-label">Refresh</span>
          </button>

          <button className="icon-btn" onClick={() => setInfoOpen(true)} title="About this module">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9.5" />
              <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="currentColor" strokeWidth="1.6" />
              <line x1="12" y1="11" x2="12" y2="17" strokeWidth="2.8" />
            </svg>
            <span className="btn-label">Info</span>
          </button>

          <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            <span className="btn-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button className="icon-btn" onClick={handleLogout} style={{ borderColor: 'var(--accent-border)' }} title="Sign out">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            <span className="btn-label">Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main" style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto' }}>

        {error && (
          <div style={{
            background: 'var(--accent-alpha)',
            border: '1px solid var(--accent-border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '0 4px 4px 0',
            padding: '11px 16px',
            marginBottom: 22,
            fontSize: 12,
            color: 'var(--accent-text)',
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: '0.04em',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Filter bar — all views */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          busCount={filteredBuses.length}
          totalBusCount={buses.length}
          projects={allProjects}
          selectedProject={selectedProject}
          theme={theme}
        />

        {/* Tracker legend — desktop/tablet only */}
        {view === 'tracker' && !isMobile && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 18, marginTop: -10 }}>
            {[
              { dot: 'var(--border-medium)', label: 'Station' },
              { dot: 'var(--success-color)', label: 'QA Gate' },
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, color: 'var(--text-dim)',
                fontFamily: "'Inter', system-ui, sans-serif",
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.dot }} />
                {item.label}
              </div>
            ))}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 10, color: 'var(--text-dim)',
              fontFamily: "'Inter', system-ui, sans-serif",
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              <img src="/Bus.png" alt="bus"
                style={{ height: 16, width: 'auto', objectFit: 'contain', opacity: 0.5 }} />
              Bus Position
            </div>
          </div>
        )}

        {/* ── Content ── */}
        {loading && buses.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 320, flexDirection: 'column', gap: 20,
          }}>
            <img src={logo} alt="KMC" style={{ height: 48, opacity: 0.2 }} />
            <div style={{
              fontSize: 11, color: 'var(--text-dim)',
              fontFamily: "'Inter', system-ui, sans-serif",
              letterSpacing: '0.16em', textTransform: 'uppercase',
            }}>
              Loading production data
            </div>
            <div style={{ width: 180, height: 2, background: 'var(--border-subtle)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: 'var(--accent)',
                animation: 'loadbar 1.5s ease-in-out infinite', width: '40%',
              }} />
            </div>
          </div>

        ) : view === 'tracker' ? (
          <LineTracker
            buses={filteredBuses}
            filter={filters.model}
            projectFilter={selectedProject}
            onOpenTravelCard={({ vin, model, stationCode }) => {
              setTcPrefill({ vin, model, stationCode });
              setMode('travelcard');
            }}
          />

        ) : view === 'report' ? (
          <BusReport
            buses={filteredBuses}
            allRows={filteredRows}
            filter={filters.model}
            stationTimes={stationTimes}
            theme={theme}
            onOpenTravelCard={({ vin, model, stationCode }) => {
              setTcPrefill({ vin, model, stationCode });
              setMode('travelcard');
            }}
          />

        ) : (
          <Dashboard
            buses={filteredBuses}
            allRows={filteredRows}
            filters={filters}
            stationTimes={stationTimes}
            theme={theme}
            onOpenNCR={() => setMode('ncr')}
            onOpenHandover={() => setMode('handover')}
          />
        )}
      </main>
      {adminOpen && role === 'admin' && (
        <CatalogAdmin
          catalog={catalog}
          saveCatalog={saveCatalog}
          saving={catalogSaving}
          listCatalogBackups={listCatalogBackups}
          restoreCatalogBackup={restoreCatalogBackup}
          onClose={() => setAdminOpen(false)}
        />
      )}
      {infoOpen && <InfoModal mode="tracker" onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

// ── Handover Standalone page ──────────────────────────────────────────────────
function HandoverStandalone({ role, theme, toggleTheme, onHome }) {
  const { handovers, loading } = useHandoverData();
  const [modalOpen,       setModalOpen]       = useState(false);
  const [selectedHandover, setSelectedHandover] = useState(null);

  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        .hov-header {
          border-bottom: 1px solid var(--header-border);
          padding: 0 clamp(14px, 4vw, 32px);
          display: flex; align-items: center; height: 64px;
          position: sticky; top: 0;
          background: var(--header-bg);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          z-index: 100; gap: clamp(8px, 2vw, 16px);
        }
        .hov-btn {
          background: transparent; border: 1px solid var(--border-subtle);
          color: var(--text-muted); border-radius: 6px;
          padding: 6px 12px; font-size: 11px; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex; align-items: center; gap: 6px;
          white-space: nowrap; flex-shrink: 0; transition: all 0.15s;
        }
        .hov-btn:hover { border-color: var(--accent-border); color: var(--accent); }
        .hov-btn.accent { border-color: var(--accent-border); background: var(--accent); color: #fff; }
        .hov-btn.accent:hover { opacity: 0.88; }
        .hov-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: var(--text-heading); text-transform: uppercase; white-space: nowrap; }
        @media (max-width: 560px) {
          .hov-title { display: none; }
          .hov-btn { padding: 6px 9px; }
          .hov-btn .hov-label { display: none; }
        }
      `}</style>

      <header className="hov-header">
        <button className="hov-btn" onClick={onHome}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          <span className="hov-label">Home</span>
        </button>
        <img src={logo} alt="KMC" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        <div className="hov-title">Shift Handover Log</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>KMC Production · Shift Handover</span>
        <button className="hov-btn accent" onClick={() => { setSelectedHandover(null); setModalOpen(true); }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span className="hov-label">Log Handover</span>
        </button>
        <button className="hov-btn" onClick={toggleTheme}>
          <span className="hov-label">{theme === 'dark' ? '☀ Light' : '☾ Dark'}</span>
        </button>
      </header>

      <main style={{ padding: 'clamp(18px, 4vw, 28px) clamp(14px, 4vw, 32px)', maxWidth: 1440, margin: '0 auto' }}>
        <HandoverLog
          handovers={handovers}
          loading={loading}
          onOpen={(h) => { setSelectedHandover(h); setModalOpen(true); }}
        />
      </main>

      {modalOpen && (
        <HandoverModal
          mode={selectedHandover ? 'view' : 'new'}
          handover={selectedHandover}
          role={role}
          onClose={() => { setModalOpen(false); setSelectedHandover(null); }}
          onSaved={() => { setModalOpen(false); setSelectedHandover(null); }}
        />
      )}
    </div>
  );
}

// ── NCR Standalone page — mirrors the Travel Card standalone layout ────────────
function NCRStandalone({ role, theme, toggleTheme, onHome }) {
  const [ncrModalOpen, setNcrModalOpen] = useState(false);
  const [selectedNcr,  setSelectedNcr]  = useState(null);
  const ncrDomain = (() => { try { return localStorage.getItem('kmc_ncr_domain') || null; } catch { return null; } })();

  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        .ncr-header {
          border-bottom: 1px solid var(--header-border);
          padding: 0 clamp(14px, 4vw, 32px);
          display: flex;
          align-items: center;
          height: 64px;
          position: sticky;
          top: 0;
          background: var(--header-bg);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          z-index: 100;
          gap: clamp(8px, 2vw, 16px);
        }
        .ncr-btn {
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .ncr-btn:hover { border-color: var(--accent-border); color: var(--accent); }
        .ncr-btn.accent { border-color: var(--accent-border); background: var(--accent); color: #fff; }
        .ncr-btn.accent:hover { opacity: 0.88; }
        .ncr-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--text-heading);
          text-transform: uppercase;
          white-space: nowrap;
        }
        @media (max-width: 560px) {
          .ncr-title { display: none; }
          .ncr-logo  { height: 30px !important; }
          .ncr-btn   { padding: 6px 9px; }
          .ncr-btn .ncr-label { display: none; }
        }
      `}</style>

      <header className="ncr-header">
        <button className="ncr-btn" onClick={onHome}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          <span className="ncr-label">Home</span>
        </button>

        <img className="ncr-logo" src={logo} alt="KMC" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        <div className="ncr-title">NCR Register</div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
            KMC.DQHSE.02/26-PR009
          </span>
        </div>

        <button className="ncr-btn accent" onClick={() => { setSelectedNcr(null); setNcrModalOpen(true); }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span className="ncr-label">Log NCR</span>
        </button>

        <button className="ncr-btn" onClick={toggleTheme}>
          <span className="ncr-label">{theme === 'dark' ? '☀ Light' : '☾ Dark'}</span>
        </button>
      </header>

      <main style={{ padding: 'clamp(18px, 4vw, 28px) clamp(14px, 4vw, 32px)', maxWidth: 1440, margin: '0 auto' }}>
        <NCRBoard
          role={role}
          ncrDomain={ncrDomain}
          onLogNCR={() => { setSelectedNcr(null); setNcrModalOpen(true); }}
          onOpenNCR={(ncr) => { setSelectedNcr(ncr); setNcrModalOpen(true); }}
        />
      </main>

      {ncrModalOpen && (
        <NCRModal
          mode={selectedNcr ? 'view' : 'new'}
          ncr={selectedNcr}
          role={role}
          defaultDomain={ncrDomain}
          onClose={() => { setNcrModalOpen(false); setSelectedNcr(null); }}
          onSaved={() => { setNcrModalOpen(false); setSelectedNcr(null); }}
        />
      )}
    </div>
  );
}
