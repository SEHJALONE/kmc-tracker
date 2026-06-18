export default function HomeScreen({ onSelectTravelCard, onSelectTracker, theme, toggleTheme }) {
  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';

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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
      gap: 48,
      padding: '40px 24px',
    }}>
      <style>{`
        .home-card-btn {
          position: relative;
          overflow: hidden;
          border: none;
          border-radius: 28px;
          cursor: pointer;
          width: 100%;
          max-width: 420px;
          height: 260px;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          flex-shrink: 0;
          /* layered shadows for depth */
          box-shadow:
            0 2px 4px rgba(0,0,0,0.08),
            0 6px 16px rgba(0,0,0,0.18),
            0 20px 48px rgba(0,0,0,0.30),
            0 1px 0 rgba(255,255,255,0.12) inset;
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease;
        }
        .home-card-btn:hover {
          transform: translateY(-6px) scale(1.015);
          box-shadow:
            0 4px 8px rgba(0,0,0,0.10),
            0 12px 28px rgba(0,0,0,0.22),
            0 32px 72px rgba(0,0,0,0.38),
            0 1px 0 rgba(255,255,255,0.18) inset;
        }
        .home-card-btn:active {
          transform: scale(0.975);
          box-shadow:
            0 1px 3px rgba(0,0,0,0.12),
            0 4px 12px rgba(0,0,0,0.18),
            0 8px 24px rgba(0,0,0,0.22);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        /* subtle bright rim on top edge */
        .home-card-btn::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.45) 50%, transparent 95%);
          border-radius: 28px 28px 0 0;
          pointer-events: none;
          z-index: 3;
        }
        .home-card-overlay {
          position: absolute;
          inset: 0;
          /* fade starts at 50% and becomes fully opaque at the bottom */
          background: linear-gradient(
            180deg,
            transparent          0%,
            transparent          45%,
            rgba(0,0,0,0.45)     65%,
            rgba(0,0,0,0.75)     100%
          );
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding: 28px 24px;
          gap: 5px;
        }
        .home-card-title {
          color: #fff;
          font-size: clamp(20px, 4vw, 26px);
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-shadow: 0 1px 8px rgba(0,0,0,0.5);
          line-height: 1.1;
        }
        .home-card-sub {
          color: rgba(255,255,255,0.80);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          text-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        /* hover border glow */
        .home-card-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          border: 1.5px solid rgba(255,255,255,0);
          border-radius: 28px;
          transition: border-color 0.25s;
          z-index: 2;
          pointer-events: none;
        }
        .home-card-btn:hover::before {
          border-color: rgba(255,255,255,0.30);
        }
        .theme-toggle-home {
          position: fixed; top: 16px; right: 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 11px;
          font-family: 'Inter', system-ui, sans-serif;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          display: flex; align-items: center; gap: 6px;
          transition: all 0.15s;
          z-index: 10;
        }
        .theme-toggle-home:hover {
          border-color: var(--accent-border);
          color: var(--accent);
        }
        @media (min-width: 900px) {
          .home-cards-row {
            flex-direction: row !important;
          }
          .home-card-btn {
            width: 380px;
          }
        }
      `}</style>

      {toggleTheme && (
        <button className="theme-toggle-home" onClick={toggleTheme}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      )}

      {/* Brand */}
      <div style={{ textAlign: 'center' }}>
        <img src={logo} alt="KMC" style={{ height: 56, width: 'auto', objectFit: 'contain', marginBottom: 14 }} />
        <div style={{
          fontSize: 'clamp(18px, 4vw, 26px)',
          fontWeight: 800,
          letterSpacing: '0.1em',
          color: 'var(--text-heading)',
          textTransform: 'uppercase',
          lineHeight: 1.2,
        }}>
          Bus Production Tracker
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          marginTop: 6,
          textTransform: 'uppercase',
        }}>
          Select a module to continue
        </div>
      </div>

      {/* Two large buttons */}
      <div className="home-cards-row" style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>

        <button
          className="home-card-btn"
          style={{ backgroundImage: "url('/Bus background.png')" }}
          onClick={onSelectTravelCard}
        >
          <div className="home-card-overlay">
            <div className="home-card-title">Travel Card</div>
            <div className="home-card-sub">Submit bus travel entries</div>
          </div>
        </button>

        <button
          className="home-card-btn"
          style={{ backgroundImage: "url('/Bus background 2.png')" }}
          onClick={onSelectTracker}
        >
          <div className="home-card-overlay">
            <div className="home-card-title">Bus Tracker</div>
            <div className="home-card-sub">Line tracker · Reports · Dashboard</div>
          </div>
        </button>

      </div>

      <div style={{
        fontSize: 10,
        color: 'var(--text-dim)',
        letterSpacing: '0.06em',
        textAlign: 'center',
      }}>
        KIIRA MOTORS CORPORATION © {new Date().getFullYear()}
      </div>
    </div>
  );
}
