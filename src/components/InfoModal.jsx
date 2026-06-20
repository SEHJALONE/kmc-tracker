// Feature guide shown from the info (ⓘ) button in each module's header.
// `mode` selects which app's feature list to display.

const CONTENT = {
  travelcard: {
    title: 'Travel Card',
    blurb: 'Log a bus moving into a station and capture the production details for that step.',
    features: [
      ['Bus & station entry', 'Pick the bus (VIN / model) and the station it has arrived at. Opening the card from the tracker pre-fills these for you.'],
      ['Shared catalog dropdowns', 'Lines, stations and projects come from the central catalog, so everyone selects from the same up-to-date list.'],
      ['Production time', 'Records time used at the station. Break periods are excluded automatically, and overruns prompt you for a cause.'],
      ['OHS & rework flags', 'Mark occupational health/safety issues or rework so they surface in reports and the dashboard.'],
      ['Submit to Sheets', 'Entries are written straight to the Google Sheet and the tracker refreshes to show the new position.'],
      ['Admin · Edit Catalog', 'Admins can edit lines, stations and projects from here; changes apply across both modules.'],
    ],
  },
  tracker: {
    title: 'Bus Tracker',
    blurb: 'Monitor where every bus is across the production lines and review performance.',
    features: [
      ['Line Tracker', 'Live map of each line showing every bus at its current station, with QA gates highlighted.'],
      ['Bus Report', 'Per-bus breakdown of stations visited, time used and station estimates for spotting bottlenecks.'],
      ['Dashboard', 'Aggregate metrics — throughput, overruns, OHS and rework — across your filtered selection.'],
      ['Filter bar', 'Narrow by model, project, line, station, status and date range; all views update together.'],
      ['Open Travel Card', 'Jump from any bus straight into a pre-filled travel card to log its next step.'],
      ['Refresh & sync', 'Pull the latest data from Sheets on demand; the header shows when it last updated.'],
    ],
  },
};

export default function InfoModal({ mode, onClose }) {
  const data = CONTENT[mode] || CONTENT.tracker;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(16px, 6vh, 64px) 16px', overflowY: 'auto',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          width: '100%', maxWidth: 540,
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '18px 22px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 15, fontWeight: 800, letterSpacing: '0.04em',
              color: 'var(--text-heading)', textTransform: 'uppercase',
            }}>
              {data.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {data.blurb}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '8px 22px 20px' }}>
          {data.features.map(([name, desc]) => (
            <div key={name} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '13px 0',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent)', marginTop: 6, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>
                  {name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                  {desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
