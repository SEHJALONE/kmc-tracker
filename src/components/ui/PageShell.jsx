import ThemeSwitch from './ThemeSwitch';

// The frame every module page sits in: themed background (bus photo under a
// legibility overlay), sticky header with Back, logo, title and the light/dark
// selector, and a centred content column.
export default function PageShell({ title, subtitle, onBack, backLabel = 'Home', theme, onToggleTheme, actions = null, children, wide = false }) {
  return (
    <div className="kmc-page">
      <header className="kmc-head">
        {onBack && (
          <button className="kmc-btn ghost" onClick={onBack} aria-label={backLabel}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            <span className="hide-sm">{backLabel}</span>
          </button>
        )}
        <img src={theme === 'light' ? '/kmc logo.png' : '/kmc logo 2.png'} alt="KMC" style={{ height: 32, width: 'auto' }} className="hide-sm" />
        <div style={{ minWidth: 0 }}>
          <div className="kmc-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {subtitle && <div className="sub hide-sm">{subtitle}</div>}
        </div>
        <div style={{ flex: 1 }} />
        {actions}
        {onToggleTheme && <ThemeSwitch theme={theme} onToggle={onToggleTheme} />}
      </header>
      <main className="kmc-main" style={wide ? { maxWidth: 1440 } : undefined}>{children}</main>
    </div>
  );
}
