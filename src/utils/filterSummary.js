import { LINES, STATIONS } from '../data/stations';

const STATUS_LABELS = {
  ALL:      'All Status',
  APPROVED: 'Approved',
  PENDING:  'Pending',
  OHS:      'OHS Issue',
  OVERRUN:  'Downtime',
  REWORK:   'Rework',
};

const DATE_PRESET_LABELS = {
  all:       'All Time',
  today:     'Today',
  yesterday: 'Yesterday',
  '7d':      'Last 7 Days',
  '30d':     'Last 30 Days',
  custom:    'Custom Range',
};

/**
 * Turn the dashboard filter state into a list of { key, label, value } chips,
 * skipping anything left at its default (no-filter) value. This is the single
 * source of truth for "what filters produced this data" — used both for the
 * email modal banner and the email body summary so the report is self-describing.
 */
export function summarizeFilters(filters = {}) {
  const out = [];

  if (filters.model && filters.model !== 'ALL') {
    out.push({ key: 'model', label: 'Model', value: filters.model });
  }
  if (filters.project) {
    out.push({ key: 'project', label: 'Project', value: filters.project });
  }
  if (filters.line && filters.line !== 'ALL') {
    out.push({ key: 'line', label: 'Line', value: LINES.find(l => l.id === filters.line)?.label || filters.line });
  }
  if (filters.station) {
    out.push({ key: 'station', label: 'Station', value: STATIONS[filters.station]?.name || filters.station });
  }
  if (filters.status && filters.status !== 'ALL') {
    out.push({ key: 'status', label: 'Status', value: STATUS_LABELS[filters.status] || filters.status });
  }
  if (filters.datePreset && filters.datePreset !== 'all') {
    let value = DATE_PRESET_LABELS[filters.datePreset] || filters.datePreset;
    if (filters.datePreset === 'custom' && (filters.startDate || filters.endDate)) {
      value = `${filters.startDate || '…'} → ${filters.endDate || '…'}`;
    }
    out.push({ key: 'date', label: 'Date', value });
  }

  return out;
}

/** One-line, plain-text version for the email body / mailto fallback. */
export function summarizeFiltersText(filters = {}) {
  const chips = summarizeFilters(filters);
  if (chips.length === 0) return 'No filters applied (full dataset)';
  return chips.map(c => `${c.label}: ${c.value}`).join(' · ');
}
