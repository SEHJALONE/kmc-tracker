export default function HomeScreen({ onSelectTravelCard, onSelectTracker, onSelectHandover, onSelectScoreboard, onSelectPendingReviews, onSelectAccessRequests, onSelectUserManagement, onSelectDailyFleetLog, onSelectCostEstimation, onSelectMySubmissions, onLogout, theme, toggleTheme, role, canAccessTracker = true, hasCeeAccess = false }) {
  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';
  const isSystemAdmin = role === 'systemadmin';
  const isSupervisor  = role === 'supervisor';
  const isGeneralUser = role === 'user';

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
    <div className="home-screen" style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      gap: 'clamp(28px, 6vw, 48px)',
      padding: 'clamp(28px, 6vw, 48px) clamp(16px, 5vw, 24px)',
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
          height: clamp(170px, 38vw, 260px);
          /* fallback gradient shown while the image loads (slow networks) */
          background-color: #1a1c24;
          background-image: linear-gradient(135deg, #d6177a 0%, #6b1fb0 100%);
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
        .home-top-controls {
          position: fixed; top: 16px; right: 16px;
          display: flex; align-items: center; gap: 8px;
          z-index: 10;
        }
        .home-top-btn {
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
        }
        .home-top-btn:hover {
          border-color: var(--accent-border);
          color: var(--accent);
        }
        .home-top-btn.signout { border-color: var(--accent-border); }
        .home-cards-row {
          display: flex;
          flex-direction: column;
          gap: 24px;
          align-items: center;
          width: 100%;
          max-width: 420px;
        }
        @media (min-width: 900px) {
          .home-cards-row {
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 1240px;
          }
          .home-card-btn {
            width: 360px;
            max-width: 360px;
          }
        }
        .home-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          width: 100%;
        }
        .home-section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .home-section-heading::before,
        .home-section-heading::after {
          content: '';
          height: 1px;
          width: 40px;
          background: var(--border-subtle);
        }
        .home-card-badge {
          position: absolute;
          top: 14px; right: 14px;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.25);
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 4px 9px;
          border-radius: 20px;
          z-index: 3;
        }
      `}</style>

      <div className="home-top-controls">
        {toggleTheme && (
          <button className="home-top-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        )}
        {onLogout && (
          <button className="home-top-btn signout" onClick={onLogout}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign Out
          </button>
        )}
      </div>

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

      {/* Developed — visible to everyone */}
      <div className="home-section">
        <div className="home-cards-row">

          <button
            className="home-card-btn"
            style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background.png' : '/Bus background 3.png'}'), linear-gradient(135deg, #d6177a 0%, #6b1fb0 100%)` }}
            onClick={onSelectTravelCard}
          >
            <div className="home-card-overlay">
              <div className="home-card-title">Travel Card</div>
              <div className="home-card-sub">Submit bus travel entries</div>
            </div>
          </button>

          {canAccessTracker && (
            <button
              className="home-card-btn"
              style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 2.png' : '/Bus background 4.png'}'), linear-gradient(135deg, #6b1fb0 0%, #d6177a 100%)` }}
              onClick={onSelectTracker}
            >
              <div className="home-card-overlay">
                <div className="home-card-title">Bus Tracker</div>
                <div className="home-card-sub">Line tracker · Reports · Dashboard</div>
              </div>
            </button>
          )}

          {isGeneralUser && onSelectMySubmissions && (
            <button
              className="home-card-btn"
              style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 4.png' : '/Bus background 2.png'}'), linear-gradient(135deg, #0e7490 0%, #101623 100%)` }}
              onClick={onSelectMySubmissions}
            >
              <div className="home-card-overlay">
                <div className="home-card-title">My Submissions</div>
                <div className="home-card-sub">View status · Edit before it's reviewed</div>
              </div>
            </button>
          )}

        </div>
      </div>

      {/* Supervisor pending reviews */}
      {(isSupervisor || isSystemAdmin) && onSelectPendingReviews && (
        <div className="home-section">
          <div className="home-section-heading">Supervisor</div>
          <div className="home-cards-row">
            <button
              className="home-card-btn"
              style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 3.png' : '/Bus background.png'}'), linear-gradient(135deg, #92400e 0%, #101623 100%)` }}
              onClick={onSelectPendingReviews}
            >
              <div className="home-card-overlay">
                <div className="home-card-title">Pending Reviews</div>
                <div className="home-card-sub">Review submitted travel cards</div>
              </div>
            </button>
            {onSelectDailyFleetLog && (
              <button
                className="home-card-btn"
                style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 3.png' : '/Bus background.png'}'), linear-gradient(135deg, #10b981 0%, #101623 100%)` }}
                onClick={onSelectDailyFleetLog}
              >
                <div className="home-card-overlay">
                  <div className="home-card-title">Daily Fleet Log</div>
                  <div className="home-card-sub">Log bus sightings yourself — a proofing check on Travel Card</div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cost Estimations Engineer — machine registry, rates, cost report */}
      {hasCeeAccess && onSelectCostEstimation && (
        <div className="home-section">
          <div className="home-section-heading">Cost Estimations Engineer</div>
          <div className="home-cards-row">
            <button
              className="home-card-btn"
              style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 4.png' : '/Bus background 2.png'}'), linear-gradient(135deg, #0f766e 0%, #101623 100%)` }}
              onClick={onSelectCostEstimation}
            >
              <div className="home-card-overlay">
                <div className="home-card-title">Cost Estimation</div>
                <div className="home-card-sub">Machines · Rates · Cost report</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* System admin — access requests + user management */}
      {isSystemAdmin && (
        <div className="home-section">
          <div className="home-section-heading">Administration</div>
          <div className="home-cards-row">
            {onSelectAccessRequests && (
              <button
                className="home-card-btn"
                style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 4.png' : '/Bus background 2.png'}'), linear-gradient(135deg, #1e3a5f 0%, #101623 100%)` }}
                onClick={onSelectAccessRequests}
              >
                <div className="home-card-overlay">
                  <div className="home-card-title">Access Requests</div>
                  <div className="home-card-sub">Grant system access to users</div>
                </div>
              </button>
            )}
            {onSelectUserManagement && (
              <button
                className="home-card-btn"
                style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background.png' : '/Bus background 3.png'}'), linear-gradient(135deg, #7c3aed 0%, #101623 100%)` }}
                onClick={onSelectUserManagement}
              >
                <div className="home-card-overlay">
                  <div className="home-card-title">User Management</div>
                  <div className="home-card-sub">Edit roles, stations &amp; access rights</div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* In Development — system admin only, expands to useradmin as each ships */}
      {isSystemAdmin && (
        <div className="home-section">
          <div className="home-section-heading">In Development · System Admin</div>
          <div className="home-cards-row">

            <button
              className="home-card-btn"
              style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 2.png' : '/Bus background 4.png'}'), linear-gradient(135deg, #7a1417 0%, #101623 100%)` }}
              onClick={onSelectScoreboard}
            >
              <span className="home-card-badge">In Dev</span>
              <div className="home-card-overlay">
                <div className="home-card-title">DPN Scoreboard</div>
                <div className="home-card-sub">IMS objectives · Live production KPIs</div>
              </div>
            </button>

            <button
              className="home-card-btn"
              style={{ backgroundImage: `url('${theme === 'dark' ? '/Bus background 3.png' : '/Bus background.png'}'), linear-gradient(135deg, #b8860b 0%, #101623 100%)` }}
              onClick={onSelectHandover}
            >
              <span className="home-card-badge">In Dev</span>
              <div className="home-card-overlay">
                <div className="home-card-title">Shift Handover</div>
                <div className="home-card-sub">Log · Acknowledge · Safety &amp; quality flags</div>
              </div>
            </button>

          </div>
        </div>
      )}

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
