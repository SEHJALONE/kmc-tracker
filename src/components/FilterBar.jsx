import { useMemo } from 'react';
import { LINES, STATIONS, MAJOR_STATIONS } from '../data/stations';
import { isActive, stationMatchesProject } from '../data/catalogConfig';

const DATE_PRESETS = [
  { id: 'all',       label: 'All Time' },
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d',        label: '7 Days' },
  { id: '30d',       label: '30 Days' },
  { id: 'custom',    label: 'Custom' },
];

const STATUS_OPTIONS = [
  { id: 'ALL',      label: 'All Status' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PENDING',  label: 'Pending' },
  { id: 'OHS',      label: 'OHS Issue' },
  { id: 'OVERRUN',  label: 'Downtime' },
  { id: 'REWORK',   label: 'Rework' },
];

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function XIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

const selectStyle = {
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "'Inter', system-ui, sans-serif",
  padding: '5px 28px 5px 10px',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  letterSpacing: '0.03em',
  transition: 'border-color 0.15s, background 0.15s',
  minWidth: 120,
};

const selectActiveStyle = {
  ...selectStyle,
  background: 'var(--accent-alpha)',
  border: '1px solid var(--accent-border)',
  color: 'var(--accent-text)',
};

function SelectWrapper({ children, active }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {children}
      <div style={{
        position: 'absolute', right: 8, pointerEvents: 'none',
        color: active ? 'var(--accent-text)' : 'var(--text-dim)',
        display: 'flex', alignItems: 'center',
      }}>
        <ChevronIcon />
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width: 1, height: 20,
      background: 'var(--border)',
      flexShrink: 0,
      margin: '0 4px',
    }} />
  );
}

export default function FilterBar({ filters, onChange, busCount, totalBusCount, projects = [], selectedProject = null, theme }) {
  const lineStations = useMemo(() => {
    if (filters.line === 'ALL') return [];
    // Critical-path stations only — subassembly feeders aren't offered as filters.
    // Archived stations are hidden unless the active project filter includes them.
    return Object.entries(MAJOR_STATIONS)
      .filter(([, s]) => s.line === filters.line)
      .filter(([, s]) => isActive(s) || (selectedProject && stationMatchesProject(s, selectedProject)))
      .sort((a, b) => a[1].order - b[1].order)
      .map(([code, s]) => ({ code, name: s.name, archived: !isActive(s) }));
  }, [filters.line, selectedProject]);

  const set = (key, value) => {
    const update = { ...filters, [key]: value };
    if (key === 'line') update.station = '';
    if (key === 'datePreset' && value !== 'custom') {
      update.startDate = null;
      update.endDate = null;
    }
    onChange(update);
  };

  const clearAll = () => onChange({
    model: 'ALL', project: '', line: 'ALL', station: '',
    status: 'ALL', datePreset: 'all', startDate: null, endDate: null,
  });

  const activeFilters = [
    filters.model !== 'ALL' && { key: 'model', label: filters.model, clear: () => set('model', 'ALL') },
    filters.project && { key: 'project', label: filters.project, clear: () => set('project', '') },
    filters.line !== 'ALL' && { key: 'line', label: LINES.find(l => l.id === filters.line)?.label, clear: () => set('line', 'ALL') },
    filters.station && { key: 'station', label: STATIONS[filters.station]?.name?.slice(0, 30) + (STATIONS[filters.station]?.name?.length > 30 ? '…' : ''), clear: () => set('station', '') },
    filters.status !== 'ALL' && { key: 'status', label: STATUS_OPTIONS.find(s => s.id === filters.status)?.label, clear: () => set('status', 'ALL') },
    filters.datePreset !== 'all' && { key: 'date', label: DATE_PRESETS.find(d => d.id === filters.datePreset)?.label + (filters.datePreset === 'custom' && filters.startDate ? ` ${filters.startDate.slice(5)} → ${filters.endDate?.slice(5) || '…'}` : ''), clear: () => set('datePreset', 'all') },
  ].filter(Boolean);

  const hasFilters = activeFilters.length > 0;

  return (
    <div style={{
      marginBottom: 24,
      borderBottom: '1px solid var(--border)',
      paddingBottom: 18,
    }}>
      <style>{`
        .filter-select:hover {
          border-color: var(--border-medium) !important;
        }
        .filter-select.active:hover {
          border-color: var(--accent) !important;
        }
        .filter-date-btn {
          background: var(--bg-surface-2);
          border: 1px solid var(--border-subtle);
          border-radius: 5px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .filter-date-btn:hover {
          border-color: var(--border-medium);
          color: var(--text-primary);
        }
        .filter-date-btn.active {
          background: var(--accent-alpha);
          border-color: var(--accent-border);
          color: var(--accent-text);
        }
        .filter-model-btn {
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 5px 14px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--filter-color, var(--text-secondary));
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .filter-model-btn:hover {
          border-color: var(--border-medium);
        }
        .filter-model-btn.active-all {
          background: var(--bg-surface-2);
          border-color: var(--border-medium);
          color: var(--text-heading);
        }
        .filter-model-btn.active-kdc {
          background: var(--kdc-alpha);
          border-color: var(--kdc-border);
          color: var(--kdc-text);
        }
        .filter-model-btn.active-evs {
          background: var(--evs-alpha);
          border-color: var(--evs-border);
          color: var(--evs-text);
        }
        .active-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--bg-surface-2);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          padding: 3px 8px 3px 10px;
          font-size: 10px;
          font-weight: 600;
          color: var(--text-secondary);
          font-family: 'Inter', system-ui, sans-serif;
          letter-spacing: 0.04em;
          transition: all 0.15s;
        }
        .active-chip button {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--text-dim);
          display: flex;
          align-items: center;
          line-height: 1;
          transition: color 0.15s;
        }
        .active-chip button:hover { color: var(--text-primary); }
        .date-input-sm {
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 5px;
          color: var(--text-secondary);
          font-size: 11px;
          font-family: 'Inter', system-ui, sans-serif;
          padding: 4px 8px;
          outline: none;
          cursor: pointer;
          colorScheme: ${theme === 'light' ? 'light' : 'dark'};
        }
      `}</style>

      {/* ── Row 1: Main filter controls ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>

        {/* Label */}
        <span style={{
          fontSize: 10, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif",
          letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 4, flexShrink: 0,
        }}>
          Filter
        </span>

        {/* Model pills */}
        {[
          { id: 'ALL', label: 'All' },
          { id: 'KDC', label: 'KDC' },
          { id: 'EVS', label: 'EVS' },
        ].map(m => {
          const isActive = filters.model === m.id;
          const cls = isActive
            ? m.id === 'KDC' ? 'active-kdc'
            : m.id === 'EVS' ? 'active-evs'
            : 'active-all'
            : '';
          return (
            <button
              key={m.id}
              className={`filter-model-btn ${cls}`}
              onClick={() => set('model', m.id)}
            >
              {m.label}
            </button>
          );
        })}

        {/* Bus Project dropdown */}
        <SelectWrapper active={!!filters.project}>
          <select
            className={`filter-select ${filters.project ? 'active' : ''}`}
            style={filters.project ? selectActiveStyle : selectStyle}
            value={filters.project}
            onChange={e => set('project', e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </SelectWrapper>

        <Divider />

        {/* Date presets */}
        <CalendarIcon />
        {DATE_PRESETS.map(p => (
          <button
            key={p.id}
            className={`filter-date-btn ${filters.datePreset === p.id ? 'active' : ''}`}
            onClick={() => set('datePreset', p.id)}
          >
            {p.label}
          </button>
        ))}

        <Divider />

        {/* Line dropdown */}
        <SelectWrapper active={filters.line !== 'ALL'}>
          <select
            className={`filter-select ${filters.line !== 'ALL' ? 'active' : ''}`}
            style={filters.line !== 'ALL' ? selectActiveStyle : selectStyle}
            value={filters.line}
            onChange={e => set('line', e.target.value)}
          >
            <option value="ALL">All Lines</option>
            {LINES.map(l => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </SelectWrapper>

        {/* Station dropdown (contextual) */}
        <SelectWrapper active={!!filters.station}>
          <select
            className={`filter-select ${filters.station ? 'active' : ''}`}
            style={{
              ...(filters.station ? selectActiveStyle : selectStyle),
              opacity: filters.line === 'ALL' ? 0.45 : 1,
              cursor: filters.line === 'ALL' ? 'not-allowed' : 'pointer',
            }}
            value={filters.station}
            onChange={e => set('station', e.target.value)}
            disabled={filters.line === 'ALL'}
          >
            <option value="">All Stations</option>
            {lineStations.map(s => (
              <option key={s.code} value={s.code}>{s.archived ? '⌫ ' : ''}{s.name}</option>
            ))}
          </select>
        </SelectWrapper>

        {/* Status dropdown */}
        <SelectWrapper active={filters.status !== 'ALL'}>
          <select
            className={`filter-select ${filters.status !== 'ALL' ? 'active' : ''}`}
            style={filters.status !== 'ALL' ? selectActiveStyle : selectStyle}
            value={filters.status}
            onChange={e => set('status', e.target.value)}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </SelectWrapper>

        {/* Right: bus count + clear */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Bus count indicator */}
          <div style={{
            fontSize: 10, color: 'var(--text-dim)',
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: '0.06em',
          }}>
            <span style={{ color: 'var(--text-heading)', fontWeight: 700 }}>{busCount}</span>
            {totalBusCount !== busCount && (
              <span style={{ color: 'var(--text-dim)' }}> / {totalBusCount}</span>
            )}
            {' '}bus{busCount !== 1 ? 'es' : ''}
          </div>

          {hasFilters && (
            <button
              onClick={clearAll}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                color: 'var(--text-dim)',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'Inter', system-ui, sans-serif",
                padding: '4px 10px',
                cursor: 'pointer',
                letterSpacing: '0.06em',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
            >
              <XIcon />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: Custom date inputs (only when preset = custom) ── */}
      {filters.datePreset === 'custom' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            From
          </span>
          <input
            type="date"
            className="date-input-sm"
            value={filters.startDate || ''}
            onChange={e => set('startDate', e.target.value || null)}
          />
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            To
          </span>
          <input
            type="date"
            className="date-input-sm"
            value={filters.endDate || ''}
            min={filters.startDate || undefined}
            onChange={e => set('endDate', e.target.value || null)}
          />
          {filters.startDate && filters.endDate && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif" }}>
              {Math.round((new Date(filters.endDate) - new Date(filters.startDate)) / 86400000) + 1} days
            </span>
          )}
        </div>
      )}

      {/* ── Row 3: Active filter chips ── */}
      {hasFilters && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          marginTop: 10,
        }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', marginRight: 2 }}>
            Active:
          </span>
          {activeFilters.map(f => (
            <span key={f.key} className="active-chip">
              {f.label}
              <button onClick={f.clear} title={`Remove ${f.label} filter`}>
                <XIcon size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
