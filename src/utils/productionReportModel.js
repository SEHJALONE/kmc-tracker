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
// Did this workshop record an actual INPUT inside the month — a start or an
// end dated within it? Deliberately not an overlap test: a unit that began in
// an earlier month and simply sat on the line, with no start and no end
// falling inside the reporting month, has no progress to report and is left
// off the annex entirely.
const workedInMonth = (ws, bounds) => {
  const within = iso => !!iso && iso >= bounds.start && iso <= bounds.end;
  return within(ws.actualStart) || within(ws.actualEnd);
};

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

  // A bus that didn't complete this month still belongs on the annex if a
  // reported workshop actually recorded something for it INSIDE the month —
  // a start, an end, or both. A unit that merely carried over, with no dated
  // input in the month, is left out: the annex is a record of what moved,
  // not of what was sitting on the line. Sorted by the earliest such input,
  // so it reads chronologically like `completed`.
  const earliestInputInMonth = x => REPORT_WORKSHOPS
    .flatMap(w => {
      const ws = x.bus.ws?.[w.key] || {};
      return [ws.actualStart, ws.actualEnd];
    })
    .filter(iso => iso && iso >= bounds.start && iso <= bounds.end)
    .sort()[0] || '';
  const inProgress = withFinish
    .filter(x => !completedSet.has(x.bus))
    .filter(x => REPORT_WORKSHOPS.some(w => {
      const ws = x.bus.ws?.[w.key];
      return ws && workedInMonth(ws, bounds);
    }))
    .sort((a, b) => (earliestInputInMonth(a) < earliestInputInMonth(b) ? -1 : 1))
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
