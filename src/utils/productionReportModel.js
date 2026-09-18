// ── Monthly Production Report — data model ───────────────────────────────
// The report is a cover, the Document Version History, the three scoreboard
// pages, and Annex A. Annex A is the only table, and it lists the workshop
// start/end dates of the buses COMPLETED in the reporting month, plus the
// buses still IN PROGRESS that month (started or still running in a reported
// workshop, but not yet cleared all four) — so all this module has to decide
// is which buses fall into each bucket.
//
// Kept separate from the PDF renderer so the selection rule is testable on
// its own and the renderer stays a layout concern.

export const REPORT_WORKSHOPS = [
  { key: 'Frame & Body Welding', label: 'Frame & Body Welding', short: 'Body Shop' },
  { key: 'Paint Shop', label: 'Paint Shop', short: 'Paint Shop' },
  { key: 'Chassis Production Line 02', label: 'Chassis Line 02', short: 'Chassis Line' },
  { key: 'Trim & Final Assembly', label: 'Trim & Final Assembly', short: 'Trim & Final Assembly' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// All date maths here is on plain 'YYYY-MM-DD' strings and local Date parts.
// `new Date(iso)` parses as UTC midnight and reads back a day early in
// Kampala (UTC+3), so dates are always built from explicit parts instead.
const d2 = n => String(n).padStart(2, '0');
const toDate = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export function monthBounds(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return { start: `${ym}-01`, end: `${ym}-${d2(new Date(y, m, 0).getDate())}` };
}
export function monthName(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function longDate(iso) {
  const dt = toDate(iso);
  return dt ? `${d2(dt.getDate())} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}` : '';
}
export function shortDate(iso) {
  const dt = toDate(iso);
  return dt ? `${d2(dt.getDate())} ${SHORT_MONTHS[dt.getMonth()]}` : '–';
}

export const busLabel = b => [b.unit, b.vin].filter(Boolean).join(' – ') || `Bus ${b.no}`;

/**
 * @param {object} opts
 * @param {Array}  opts.buses  parseBusUnits output (needs `ws` per line)
 * @param {string} opts.month  'YYYY-MM' reporting month
 */
// Two ISO-date windows overlap? A blank end reads as still open (running to
// the far future) — matches useScoreboardData.js's rangesOverlap, kept local
// since this module is deliberately not coupled to the hook.
const overlapsMonth = (start, end, bounds) =>
  !!start && start <= bounds.end && (end || '9999-12-31') >= bounds.start;

export function buildReportModel({ buses = [], month }) {
  const bounds = monthBounds(month);

  // A bus counts as completed once it has cleared all four reported
  // workshops, or once the tracker's own Bus Status says so. It belongs to
  // this month's report when the last of those workshop end dates falls
  // inside the month — that is the date it actually rolled off.
  const withFinish = buses.map(b => {
    const ends = REPORT_WORKSHOPS.map(w => b.ws?.[w.key]?.actualEnd).filter(Boolean);
    const clearedAll = ends.length === REPORT_WORKSHOPS.length;
    const finishedOn = ends.length ? ends.slice().sort().pop() : b.completedOn;
    return { bus: b, clearedAll, finishedOn };
  });

  const completed = withFinish
    .filter(x => (x.clearedAll || x.bus.done)
      && x.finishedOn && x.finishedOn >= bounds.start && x.finishedOn <= bounds.end)
    .sort((a, b) => (a.finishedOn < b.finishedOn ? -1 : 1))
    .map(x => x.bus);
  const completedSet = new Set(completed);

  // A bus that didn't complete this month still belongs on the annex if it
  // had any actual work in a reported workshop overlapping the month —
  // started this month, still running from an earlier one, or both — so the
  // report shows what's on the line, not only what rolled off it. Sorted by
  // the earliest such start, so it reads chronologically like `completed`.
  const earliestActiveStart = x => REPORT_WORKSHOPS
    .map(w => x.bus.ws?.[w.key]?.actualStart)
    .filter(Boolean)
    .sort()[0] || '';
  const inProgress = withFinish
    .filter(x => !completedSet.has(x.bus))
    .filter(x => REPORT_WORKSHOPS.some(w => {
      const ws = x.bus.ws?.[w.key];
      return ws && overlapsMonth(ws.actualStart, ws.actualEnd, bounds);
    }))
    .sort((a, b) => (earliestActiveStart(a) < earliestActiveStart(b) ? -1 : 1))
    .map(x => x.bus);

  return {
    month, bounds,
    monthName: monthName(month),
    monthUpper: monthName(month).toUpperCase(),
    completed,
    completedCount: completed.length,
    inProgress,
    inProgressCount: inProgress.length,
  };
}
