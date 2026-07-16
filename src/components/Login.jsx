import { useState } from 'react';
import SignUpModal from './SignUpModal';

// Credential sets → role + NCR domain + optional landing module.
// domain controls which NCR register tab the user lands on by default (admin sees all).
// landing sends the user straight into a module on login, skipping the HomeScreen menu.
const CREDENTIALS = [
  { username: 'systemadmin', password: 'admin1234!', role: 'systemadmin', domain: null, landing: null },
  { username: 'kmcadmin',    password: 'KMC1234!',   role: 'useradmin', domain: null, landing: null },
  { username: 'kmc',         password: 'kmc1234!',   role: 'user',       domain: null, landing: null },
  { username: 'kmc.super',  password: 'Super1234!', role: 'supervisor', domain: null, landing: null },
  { username: 'kmc.parts',   password: 'Parts1234!', role: 'user',  domain: 'Parts & Materials', landing: null },
  { username: 'kmc.process', password: 'Proc1234!',  role: 'user',  domain: 'Process', landing: null },
  { username: 'kmc.quality', password: 'Qual1234!',  role: 'user',  domain: 'Quality', landing: null },
  { username: 'kmc.prod',    password: 'Prod1234!',  role: 'user',  domain: 'Production', landing: null },
  { username: 'dpn.kmc', password: 'dpn1234!', role: 'user', domain: null, landing: 'scoreboard' },
];

function loadDynamicUsers() {
  try { return JSON.parse(localStorage.getItem('kmc_dynamic_users') || '[]'); } catch { return []; }
}

export default function Login({ onLogin, theme = 'dark', toggleTheme, appName = 'Bus Production Tracker', appSubtitle = 'Sign in to continue' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';

  const handleSubmit = () => {
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const dynamic = loadDynamicUsers();
      const dynMatch = dynamic.find(
        c => c.username === username.trim().toLowerCase() && c.password === password
      );
      const staticMatch = CREDENTIALS.find(
        c => c.username.toLowerCase() === username.trim().toLowerCase() && c.password === password
      );
      const match = staticMatch || (dynMatch ? { ...dynMatch, domain: null, landing: null } : null);
      if (match) {
        // Store role-specific access assignments for dynamic users
        if (dynMatch) {
          if (dynMatch.fullName)
            localStorage.setItem('kmc_user_fullname', dynMatch.fullName);
          else localStorage.removeItem('kmc_user_fullname');

          if (dynMatch.assignedStation)
            localStorage.setItem('kmc_assigned_station', dynMatch.assignedStation);
          else localStorage.removeItem('kmc_assigned_station');

          if (dynMatch.assignedStations?.length)
            localStorage.setItem('kmc_assigned_stations', JSON.stringify(dynMatch.assignedStations));
          else localStorage.removeItem('kmc_assigned_stations');

          const lines = dynMatch.assignedLines?.length
            ? dynMatch.assignedLines
            : dynMatch.assignedLine ? [dynMatch.assignedLine] : [];
          if (lines.length)
            localStorage.setItem('kmc_assigned_lines', JSON.stringify(lines));
          else localStorage.removeItem('kmc_assigned_lines');
        } else {
          // Static credential — clear any leftover assignments
          localStorage.removeItem('kmc_user_fullname');
          localStorage.removeItem('kmc_assigned_station');
          localStorage.removeItem('kmc_assigned_stations');
          localStorage.removeItem('kmc_assigned_lines');
        }

        if (remember) {
          localStorage.setItem('kmc_auth', 'true');
          localStorage.setItem('kmc_role', match.role);
          if (match.domain) localStorage.setItem('kmc_ncr_domain', match.domain);
          else localStorage.removeItem('kmc_ncr_domain');
          if (match.landing) localStorage.setItem('kmc_landing', match.landing);
          else localStorage.removeItem('kmc_landing');
        }
        onLogin(match.role, match.domain, match.landing);
      } else {
        setError('Incorrect username or password.');
        setLoading(false);
      }
    }, 600);
  };

  const handleKey = e => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (<>
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      backgroundImage: theme === 'dark' ? "url('/Bus background.png')" : "url('/Bus background 2.png')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
      transition: 'background 0.25s ease',
    }}>

      <style>{`
        .login-bg-glow {
          position: absolute;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%, -60%);
          pointer-events: none;
        }
        .login-top-line {
          position: fixed; top: 0; left: 10%; right: 10%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(220,38,38,0.55), transparent);
        }
        .login-input {
          width: 100%;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 6px;
          padding: 13px 16px;
          color: var(--input-color);
          font-size: 16px;
          font-family: 'Inter', system-ui, sans-serif;
          letter-spacing: 0.04em;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .login-input::placeholder { color: var(--input-placeholder); }
        .login-input:focus {
          border-color: var(--input-focus-border);
          background: var(--input-focus-bg);
        }
        .login-btn {
          width: 100%;
          background: var(--accent);
          border: none;
          border-radius: 6px;
          padding: 14px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-family: 'Inter', system-ui, sans-serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          margin-top: 8px;
        }
        .login-btn:hover:not(:disabled) { background: var(--accent-hover); }
        .login-btn:active:not(:disabled) { transform: scale(0.98); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .show-pass-btn {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          font-size: 11px; font-family: 'Inter', system-ui, sans-serif;
          letter-spacing: 0.06em; padding: 2px 4px;
          transition: color 0.15s;
        }
        .show-pass-btn:hover { color: var(--text-secondary); }
        .remember-check { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }
        .theme-toggle-login {
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
        .theme-toggle-login:hover {
          border-color: var(--accent-border);
          color: var(--accent);
        }
      `}</style>

      <div className="login-bg-glow" />
      <div className="login-top-line" />

      {/* Theme toggle */}
      {toggleTheme && (
        <button className="theme-toggle-login" onClick={toggleTheme}>
          {theme === 'dark'
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          }
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      )}

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: theme === 'dark' ? 'rgba(7,9,15,0.65)' : 'rgba(255,255,255,0.72)',
        border: '1px solid var(--border-subtle)',
        borderTop: '3px solid var(--accent)',
        borderRadius: 14,
        padding: 'clamp(24px, 5vw, 40px) clamp(20px, 5vw, 36px) clamp(24px, 5vw, 36px)',
        margin: '0 16px',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
        position: 'relative',
        zIndex: 1,
        transition: 'background 0.25s ease',
      }}>

        {/* Logo + brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={logo} alt="KMC" style={{ height: 52, width: 'auto', objectFit: 'contain', marginBottom: 14 }} />
          <div style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 'clamp(16px, 4vw, 22px)', fontWeight: 800,
            letterSpacing: '0.12em',
            color: 'var(--text-heading)',
            textTransform: 'uppercase',
            lineHeight: 1.1,
          }}>
            {appName}
          </div>
          <div style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 10,
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            marginTop: 6,
            textTransform: 'uppercase',
          }}>
            {appSubtitle}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'var(--accent-alpha)',
            border: '1px solid var(--accent-border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '0 5px 5px 0',
            padding: '9px 12px',
            marginBottom: 18,
            fontSize: 13,
            color: 'var(--accent-text)',
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: '0.03em',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Username */}
        <div style={{ marginBottom: 14 }}>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700,
            color: 'var(--text-secondary)', letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontFamily: "'Inter', system-ui, sans-serif",
            marginBottom: 7,
          }}>
            Username
          </label>
          <input
            className="login-input"
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="username"
            autoFocus
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700,
            color: 'var(--text-secondary)', letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontFamily: "'Inter', system-ui, sans-serif",
            marginBottom: 7,
          }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              className="login-input"
              type={showPass ? 'text' : 'password'}
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="current-password"
              style={{ paddingRight: 72 }}
            />
            <button
              className="show-pass-btn"
              onClick={() => setShowPass(s => !s)}
              tabIndex={-1}
              type="button"
            >
              {showPass ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        {/* Remember me */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 24 }}>
          <input
            className="remember-check"
            type="checkbox"
            id="remember"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
          />
          <label htmlFor="remember" style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: '0.06em',
          }}>
            Keep me signed in
          </label>
        </div>

        {/* Submit */}
        <button className="login-btn" onClick={handleSubmit} disabled={loading}>
          {loading
            ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span className="spinner" /> Signing in...
              </span>
            : 'Sign In'
          }
        </button>

        {/* Sign Up */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>
        <button
          onClick={() => setShowSignUp(true)}
          style={{
            width: '100%', marginTop: 2,
            background: 'transparent',
            border: '1px solid var(--border-medium)',
            borderRadius: 6, padding: '12px',
            color: 'var(--text-secondary)', fontSize: 14,
            fontWeight: 600, letterSpacing: '0.06em',
            fontFamily: "'Inter', system-ui, sans-serif",
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent-text)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          Request Access
        </button>

        {/* Footer */}
        <div style={{
          marginTop: 28, textAlign: 'center',
          fontSize: 10, color: 'var(--text-dim)',
          fontFamily: "'Inter', system-ui, sans-serif",
          letterSpacing: '0.06em',
        }}>
          KIIRA MOTORS CORPORATION © {new Date().getFullYear()}
        </div>
      </div>
    </div>

    {showSignUp && <SignUpModal theme={theme} onClose={() => setShowSignUp(false)} />}
  </>
  );
}
