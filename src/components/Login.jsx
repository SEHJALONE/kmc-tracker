import { useState } from 'react';

// ── Single shared company credentials ───────────────────
// Change these to your actual username and password
const VALID_USERNAME = 'kmc';
const VALID_PASSWORD = 'kmc1234!';

export default function Login({ onLogin }) {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [remember, setRemember]   = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const handleSubmit = () => {
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    // Simulate a brief auth delay for polish
    setTimeout(() => {
      if (
        username.trim().toLowerCase() === VALID_USERNAME.toLowerCase() &&
        password === VALID_PASSWORD
      ) {
        if (remember) {
          localStorage.setItem('kmc_auth', 'true');
        }
        onLogin();
      } else {
        setError('Incorrect username or password.');
        setLoading(false);
      }
    }, 600);
  };

  const handleKey = e => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07090f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Barlow Condensed', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        /* Ambient background glow */
        .login-bg-glow {
          position: absolute;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%, -60%);
          pointer-events: none;
        }

        /* Top line accent */
        .login-top-line {
          position: fixed; top: 0; left: 10%; right: 10%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(220,38,38,0.6), transparent);
        }

        .login-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 6px;
          padding: 13px 16px;
          color: #f1f5f9;
          font-size: 16px;
          font-family: 'Barlow Condensed', sans-serif;
          letter-spacing: 0.04em;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .login-input::placeholder { color: #334155; }
        .login-input:focus {
          border-color: rgba(220,38,38,0.5);
          background: rgba(220,38,38,0.04);
        }

        .login-btn {
          width: 100%;
          background: #dc2626;
          border: none;
          border-radius: 6px;
          padding: 14px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-family: 'Barlow Condensed', sans-serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          margin-top: 8px;
        }
        .login-btn:hover:not(:disabled) { background: #b91c1c; }
        .login-btn:active:not(:disabled) { transform: scale(0.98); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .show-pass-btn {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: #475569; cursor: pointer;
          font-size: 11px; font-family: 'Space Mono', monospace;
          letter-spacing: 0.06em; padding: 2px 4px;
          transition: color 0.15s;
        }
        .show-pass-btn:hover { color: #94a3b8; }

        .remember-check {
          width: 15px; height: 15px;
          accent-color: #dc2626;
          cursor: pointer;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }
      `}</style>

      <div className="login-bg-glow" />
      <div className="login-top-line" />

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(13,21,38,0.85)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderTop: '2px solid #dc2626',
        borderRadius: 12,
        padding: '40px 36px 36px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Logo + brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/kmc logo 2.png"
            alt="KMC"
            style={{ height: 52, width: 'auto', objectFit: 'contain', marginBottom: 14 }}
          />
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.18em',
            color: '#ffffff',
            textTransform: 'uppercase',
            lineHeight: 1.1,
          }}>
            Bus Production Tracker
          </div>
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            color: '#334155',
            letterSpacing: '0.12em',
            marginTop: 6,
            textTransform: 'uppercase',
          }}>
            Sign in to continue
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.25)',
            borderLeft: '3px solid #dc2626',
            borderRadius: '0 5px 5px 0',
            padding: '9px 12px',
            marginBottom: 18,
            fontSize: 13,
            color: '#fca5a5',
            fontFamily: "'Space Mono', monospace",
            letterSpacing: '0.03em',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Username */}
        <div style={{ marginBottom: 14 }}>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700,
            color: '#334155', letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontFamily: "'Space Mono', monospace",
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
            color: '#334155', letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontFamily: "'Space Mono', monospace",
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, marginBottom: 24,
        }}>
          <input
            className="remember-check"
            type="checkbox"
            id="remember"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
          />
          <label htmlFor="remember" style={{
            fontSize: 13, color: '#475569', cursor: 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: '0.06em',
          }}>
            Keep me signed in
          </label>
        </div>

        {/* Submit */}
        <button
          className="login-btn"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span className="spinner" /> Signing in...
              </span>
            : 'Sign In'
          }
        </button>

        {/* Footer */}
        <div style={{
          marginTop: 28,
          textAlign: 'center',
          fontSize: 10,
          color: '#1e2d40',
          fontFamily: "'Space Mono', monospace",
          letterSpacing: '0.06em',
        }}>
          KIIRA MOTORS CORPORATION © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
