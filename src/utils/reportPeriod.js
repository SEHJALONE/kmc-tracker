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

export const quarterOf = monthIndex => Math.floor(monthIndex / 3) + 1;

export function monthPeriod(y, m) {
  return {
    kind: 'month', start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)),
    label: `${MONTHS[m]} ${y}`, upper: `${MONTHS[m]} ${y}`.toUpperCase(), short: `${SHORT[m]} ${y}`,
  };
}

export function quarterPeriod(y, q) {
  const m0 = (q - 1) * 3, m2 = m0 + 2;
  return {
    kind: 'quarter', start: iso(y, m0, 1), end: iso(y, m2, lastDay(y, m2)),
    label: `Q${q} ${y} (${MONTHS[m0]} – ${MONTHS[m2]})`,
    upper: `Q${q} ${y} (${MONTHS[m0]} – ${MONTHS[m2]})`.toUpperCase(),
    short: `Q${q} ${y}`,
  };
}

export function yearPeriod(y) {
  return {
    kind: 'year', start: iso(y, 0, 1), end: iso(y, 11, 31),
    label: `Year ${y}`, upper: `ANNUAL REPORT ${y}`, short: String(y),
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
  if (a.d === 1 && a.y === b.y && b.d === lastDay(b.y, b.m)) {
    if (a.m === b.m) return monthPeriod(a.y, a.m);
    if (a.m % 3 === 0 && b.m === a.m + 2) return quarterPeriod(a.y, quarterOf(a.m));
    if (a.m === 0 && b.m === 11) return yearPeriod(a.y);
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
