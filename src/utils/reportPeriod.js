// ── Reporting periods ─────────────────────────────────────────────────────
// One shape for every period the board and the Production Report work in —
// a month, a quarter, a year, or any hand-picked range:
//
//   { kind, start, end, label, upper, short }
//
// `start`/`end` are inclusive 'YYYY-MM-DD' strings built from local date
// parts (never toISOString(): in Kampala, UTC+3, that reads a day early).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d2 = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();   // m is 0-based
const iso = (y, m, d) => `${y}-${d2(m + 1)}-${d2(d)}`;
const parts = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};

// KMC reports on the financial year, July – June: Q1 = Jul–Sep, Q2 = Oct–Dec,
// Q3 = Jan–Mar, Q4 = Apr–Jun. A financial year is named by the calendar year
// it starts in: FY 2026/27 = 1 Jul 2026 – 30 Jun 2027.
export const FY_START_MONTH = 6;   // July, 0-based
export const quarterOf = monthIndex => Math.floor(((monthIndex - FY_START_MONTH + 12) % 12) / 3) + 1;
export const fyOf = (y, m) => (m >= FY_START_MONTH ? y : y - 1);
export const fyOfISO = s => { const p = parts(s); return p ? fyOf(p.y, p.m) : new Date().getFullYear(); };
export const fyLabel = fy => `FY ${fy}/${String(fy + 1).slice(-2)}`;
// The twelve months of a financial year in order, July first.
export const fyMonths = fy => Array.from({ length: 12 }, (_, i) => {
  const m = (FY_START_MONTH + i) % 12;
  return { y: m >= FY_START_MONTH ? fy : fy + 1, m };
});

export function monthPeriod(y, m) {
  return {
    kind: 'month', start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)),
    label: `${MONTHS[m]} ${y}`, upper: `${MONTHS[m]} ${y}`.toUpperCase(), short: `${SHORT[m]} ${y}`,
  };
}

// Quarter `q` (1–4) of financial year `fy`.
export function quarterPeriod(fy, q) {
  const first = fyMonths(fy)[(q - 1) * 3], last = fyMonths(fy)[(q - 1) * 3 + 2];
  const span = `${MONTHS[first.m]} – ${MONTHS[last.m]} ${last.y}`;
  return {
    kind: 'quarter', start: iso(first.y, first.m, 1), end: iso(last.y, last.m, lastDay(last.y, last.m)),
    label: `Q${q} ${fyLabel(fy)} (${span})`,
    upper: `Q${q} ${fyLabel(fy)} (${span})`.toUpperCase(),
    short: `Q${q} ${fyLabel(fy)}`,
  };
}

// The whole financial year: 1 Jul `fy` – 30 Jun `fy + 1`.
export function yearPeriod(fy) {
  return {
    kind: 'year', start: iso(fy, FY_START_MONTH, 1), end: iso(fy + 1, FY_START_MONTH - 1, 30),
    label: `${fyLabel(fy)} (July ${fy} – June ${fy + 1})`,
    upper: `ANNUAL REPORT ${fyLabel(fy)}`,
    short: fyLabel(fy),
  };
}

export function fmtDay(s) {
  const p = parts(s);
  return p ? `${d2(p.d)} ${SHORT[p.m]} ${p.y}` : '';
}

export function customPeriod(start, end) {
  return {
    kind: 'range', start, end,
    label: `${fmtDay(start)} – ${fmtDay(end)}`,
    upper: `${fmtDay(start)} – ${fmtDay(end)}`.toUpperCase(),
    short: `${fmtDay(start)} – ${fmtDay(end)}`,
  };
}

// Recognise a plain {start,end} as the month / quarter / year it exactly
// covers, so a range typed by hand still gets its proper name on the board.
export function describeRange({ start, end }) {
  const a = parts(start), b = parts(end);
  if (!a || !b) return customPeriod(start, end);
  if (a.d === 1 && b.d === lastDay(b.y, b.m)) {
    const fy = fyOf(a.y, a.m);
    if (a.y === b.y && a.m === b.m) return monthPeriod(a.y, a.m);
    for (let q = 1; q <= 4; q++) {
      const p = quarterPeriod(fy, q);
      if (p.start === start && p.end === end) return p;
    }
    const y = yearPeriod(fy);
    if (y.start === start && y.end === end) return y;
  }
  return customPeriod(start, end);
}

// 'Jul 26'-style labels of every calendar month the range touches — the same
// labels the hook's monthly trend series carry, for highlighting the period
// on whole-programme charts.
export function monthLabelsIn({ start, end }) {
  const a = parts(start), b = parts(end);
  if (!a || !b) return new Set();
  const out = new Set();
  for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m === 11 ? (y++, m = 0) : m++) {
    out.add(`${SHORT[m]} ${String(y).slice(-2)}`);
  }
  return out;
}

export function todayISO(d = new Date()) {
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

export const MONTH_SHORT = SHORT;
