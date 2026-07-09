import { useState, useEffect, useCallback } from 'react';
import Login from './components/Login.jsx';
import NCRBoard from './components/NCRBoard.jsx';
import NCRModal from './components/NCRModal.jsx';

// ── Theme helpers ──────────────────────────────────────────────────────────────
function getInitialTheme() {
  const saved = localStorage.getItem('kmc_ncr_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const DOMAIN_COLORS = {
  'Parts & Materials': '#f59e0b',
  'Process':           '#3b82f6',
  'Quality':           '#10b981',
  'Production':        '#dc2626',
};

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
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

export default function NCRApp() {
  const [authed,    setAuthed]    = useState(() => localStorage.getItem('kmc_ncr_auth') === 'true');
  const [role,      setRole]      = useState(() => localStorage.getItem('kmc_ncr_role') || 'user');
  const [ncrDomain, setNcrDomain] = useState(() => localStorage.getItem('kmc_ncr_domain') || null);
  const [theme,     setTheme]     = useState(getInitialTheme);

  const [modalOpen,    setModalOpen]    = useState(false);
  const [selectedNcr,  setSelectedNcr]  = useState(null);

  // Sync theme token to DOM
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kmc_ncr_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  function handleLogin(r, d) {
    setRole(r || 'user');
    setNcrDomain(d || null);
    setAuthed(true);
    localStorage.setItem('kmc_ncr_auth', 'true');
    localStorage.setItem('kmc_ncr_role', r || 'user');
    if (d) localStorage.setItem('kmc_ncr_domain', d);
    else localStorage.removeItem('kmc_ncr_domain');
  }

  function handleLogout() {
    localStorage.removeItem('kmc_ncr_auth');
    localStorage.removeItem('kmc_ncr_role');
    localStorage.removeItem('kmc_ncr_domain');
    setAuthed(false);
    setRole('user');
    setNcrDomain(null);
  }

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!authed) {
    return <Login onLogin={handleLogin} theme={theme} toggleTheme={toggleTheme} appName="NCR Register" appSubtitle="Non-Conformance Management" />;
  }

  const domainColor = ncrDomain ? (DOMAIN_COLORS[ncrDomain] || '#dc2626') : '#dc2626';
  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';

  // ── Main app ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Top bar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--header-border)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(14px, 3vw, 28px)',
        height: 54,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="KMC" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-heading)', textTransform: 'uppercase', lineHeight: 1.1 }}>
              NCR Register
            </div>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 1 }}>
              KMC.DQHSE.02/26-PR009 · Control of Non-Conformities
            </div>
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Domain badge */}
          {ncrDomain ? (
            <span style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 12,
              background: `${domainColor}22`, color: domainColor,
              border: `1px solid ${domainColor}55`,
              fontWeight: 700, letterSpacing: '0.06em',
            }}>
              {ncrDomain}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
              {role === 'admin' ? 'ADMIN · ALL DOMAINS' : 'ALL DOMAINS'}
            </span>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', fontSize: 10,
              fontFamily: "'Inter', system-ui, sans-serif",
              letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'all .15s',
            }}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', fontSize: 10,
              fontFamily: "'Inter', system-ui, sans-serif",
              letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'all .15s',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ padding: 'clamp(20px, 4vw, 36px) clamp(14px, 4vw, 32px)', maxWidth: 1400, margin: '0 auto' }}>

        {/* Page heading */}
        <div style={{ marginBottom: 28, paddingBottom: 18, borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
            Non-Conformance Register
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
            Log, track, and close non-conformances across all production domains · Kiira Motors Corporation
          </p>
        </div>

        {/* NCR board */}
        <NCRBoard
          role={role}
          ncrDomain={ncrDomain}
          onLogNCR={() => { setSelectedNcr(null); setModalOpen(true); }}
          onOpenNCR={(ncr) => { setSelectedNcr(ncr); setModalOpen(true); }}
        />
      </main>

      {/* ── NCR Modal ── */}
      {modalOpen && (
        <NCRModal
          mode={selectedNcr ? 'view' : 'new'}
          ncr={selectedNcr}
          role={role}
          defaultDomain={ncrDomain}
          onClose={() => { setModalOpen(false); setSelectedNcr(null); }}
          onSaved={() => { setModalOpen(false); setSelectedNcr(null); }}
        />
      )}
    </div>
  );
}
