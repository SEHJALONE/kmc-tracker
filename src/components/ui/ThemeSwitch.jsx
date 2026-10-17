// Light / dark selector. Two segments so the current choice is always visible
// (a single toggle button only tells you what you would switch TO).
export default function ThemeSwitch({ theme, onToggle }) {
  const set = want => { if (theme !== want && onToggle) onToggle(); };
  return (
    <div className="kmc-theme-switch" role="group" aria-label="Colour theme">
      <button type="button" className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} title="Light" onClick={() => set('light')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(a => <line key={a} x1="12" y1="2.5" x2="12" y2="4.8" transform={`rotate(${a} 12 12)`} />)}
        </svg>
      </button>
      <button type="button" className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} title="Dark" onClick={() => set('dark')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" /></svg>
      </button>
    </div>
  );
}
