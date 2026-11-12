// Working-time rules for Travel Card timing.
//   • Within one day, everything from clock-in to clock-out counts, including
//     work before 07:00 or after 18:00. Only the scheduled breaks are taken off.
//   • When a card runs over more than one day, the person says when work
//     started and ended on each day (workDays). The form prefills:
//       Monday–Friday 07:00–18:00
//       Saturday      08:00–14:00 (asked whether they worked after 14:00)
//       Sunday        not worked  (asked whether they worked)
//     The first day starts at clock-in and the last day ends at clock-out.
//   • Cards filed without workDays use those prefilled hours.
// Pure and timezone-neutral: it works on the wall-clock Dates it is given.

export const WORK_SCHEDULE = {
  breaks: [
    { start: '10:00', end: '10:30', label: 'Tea break' },
    { start: '13:00', end: '14:00', label: 'Lunch' },
  ],
  weekday: { start: '07:00', end: '18:00' },
  saturday: { start: '08:00', end: '14:00' },
  sunday: null, // not worked unless the person says so
};

const pad = n => String(n).padStart(2, '0');
export const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmmOf = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = hhmm => { const [h, m] = String(hhmm || '').split(':').map(Number); return h * 60 + (m || 0); };
const isHHMM = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
const dayOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

// Break minutes inside [lo, hi) minutes-of-day.
function breakMinutes(lo, hi) {
  let b = 0;
  for (const br of WORK_SCHEDULE.breaks) b += Math.max(0, Math.min(hi, toMin(br.end)) - Math.max(lo, toMin(br.start)));
  return b;
}

// The prefilled hours for every calendar day a card spans (only meaningful when
// it spans more than one): [{ date, dow, worked, start, end, fixedStart, fixedEnd }].
// fixedStart/fixedEnd mark the clock-in / clock-out ends, which the form does
// not ask about again.
export function defaultWorkDays(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end) || end <= start) return [];
  const out = [];
  const day = new Date(start); day.setHours(0, 0, 0, 0);
  const last = dateKey(end);
  for (let guard = 0; guard < 62; guard++) {
    const key = dateKey(day), dow = day.getDay();
    const first = key === dateKey(start), isLast = key === last;
    const win = dow === 0 ? { start: '08:00', end: '14:00' } : dow === 6 ? WORK_SCHEDULE.saturday : WORK_SCHEDULE.weekday;
    let s = first ? hhmmOf(start) : win.start;
    let e = isLast ? hhmmOf(end) : win.end;
    // Clock-in after the usual end (or clock-out before the usual start):
    // the work ran on through the night, so count to midnight / from midnight.
    if (first && !isLast && toMin(s) >= toMin(e)) e = '23:59';
    if (isLast && !first && toMin(e) <= toMin(s)) s = '00:00';
    // The days someone clocked in or out on were worked; a Sunday in between is not.
    const worked = first || isLast || dow !== 0;
    out.push({ date: key, dow, worked, start: s, end: e, fixedStart: first, fixedEnd: isLast });
    if (isLast) break;
    day.setDate(day.getDate() + 1);
  }
  return out;
}

// Keeps what the person already entered for days still in the span; fills the
// rest with the defaults. The clock-in / clock-out ends always follow the clock.
export function mergeWorkDays(defaults, entered) {
  const byDate = Object.fromEntries((entered || []).map(d => [d.date, d]));
  return defaults.map(d => {
    const e = byDate[d.date];
    if (!e) return d;
    return {
      ...d,
      worked: d.fixedStart || d.fixedEnd ? true : !!e.worked,
      start: d.fixedStart ? d.start : (isHHMM(e.start) ? e.start : d.start),
      end: d.fixedEnd ? d.end : (isHHMM(e.end) ? e.end : d.end),
    };
  });
}

// → { gross, counted, breaks, net }  (minutes)
//   gross   wall-clock minutes from start to end
//   counted the minutes worked (one day: all of it; several days: the hours
//           given for each day, or the prefilled ones)
//   breaks  scheduled break minutes inside counted time
//   net     counted − breaks  (the "actual" time recorded on a card)
export function workingMinutes(start, end, workDays) {
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end) || end <= start) {
    return { gross: 0, counted: 0, breaks: 0, net: 0 };
  }
  const gross = Math.round((end - start) / 60000);
  let counted = 0, brk = 0;
  if (dateKey(start) === dateKey(end)) {
    const lo = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
    const hi = end.getHours() * 60 + end.getMinutes() + end.getSeconds() / 60;
    counted = hi - lo;
    brk = breakMinutes(lo, hi);
  } else {
    const days = mergeWorkDays(defaultWorkDays(start, end), workDays);
    for (const d of days) {
      if (!d.worked) continue;
      const lo = toMin(d.start), hi = toMin(d.end) + (d.end === '23:59' ? 1 : 0);
      if (hi <= lo) continue;
      counted += hi - lo;
      brk += breakMinutes(lo, hi);
    }
  }
  counted = Math.round(counted); brk = Math.round(brk);
  return { gross, counted, breaks: Math.min(brk, counted), net: Math.max(0, counted - brk) };
}

// Re-derives a stored card's actual minutes under the current rules from its raw
// inputs (clock-in, the recorded elapsed minutes and any per-day hours), without
// touching them. End = clock-in + recorded gross, so it is independent of the
// device timezone the card was submitted from. Null when the inputs are unusable.
export function recomputeActual(clockIn, grossMin, workDays) {
  const g = Number(grossMin);
  if (!clockIn || !(g > 0)) return null;
  const start = new Date(String(clockIn).trim().replace(' ', 'T'));
  if (isNaN(start)) return null;
  return workingMinutes(start, new Date(start.getTime() + g * 60000), workDays);
}

// Planned working minutes between two times on the usual timetable (weekday
// 07:00–18:00, Saturday 08:00–14:00, no Sunday, breaks off). Used to predict
// when a started job should end; always grows with `end`.
function plannedMinutes(start, end) {
  let net = 0;
  const day = new Date(start); day.setHours(0, 0, 0, 0);
  while (day < end) {
    const dow = day.getDay();
    const win = dow === 0 ? null : dow === 6 ? WORK_SCHEDULE.saturday : WORK_SCHEDULE.weekday;
    if (win) {
      const base = day.getTime();
      const lo = Math.max(start.getTime(), base + toMin(win.start) * 60000);
      const hi = Math.min(end.getTime(), base + toMin(win.end) * 60000);
      if (hi > lo) {
        const a = (lo - base) / 60000, b = (hi - base) / 60000;
        net += (b - a) - breakMinutes(a, b);
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return net;
}

// When `mins` of working time on the usual timetable will have passed after
// `start` — the expected end of a station job started at `start` with a
// designed time of `mins`. Searches at most 30 days ahead; null for bad input.
export function addWorkingMinutes(start, mins) {
  const m = Number(mins);
  if (!(start instanceof Date) || isNaN(start) || !(m > 0)) return null;
  const after = k => new Date(start.getTime() + k * 60000);
  let lo = 0, hi = 30 * 24 * 60;
  if (plannedMinutes(start, after(hi)) < m) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (plannedMinutes(start, after(mid)) >= m - 1e-9) hi = mid; else lo = mid;
  }
  return after(hi);
}
