// Working-time rules for Travel Card timing.
//   • Sunday is not a working day (0 min counted).
//   • Saturday counts only 08:00–13:00.
//   • Monday–Friday count 08:00–18:00 only — nights are not worked time.
//   • Scheduled breaks are subtracted from whatever time is counted.
// Pure and timezone-neutral: it works on the wall-clock Dates it is given.

export const WORK_SCHEDULE = {
  breaks: [
    { start: '10:00', end: '10:30', label: 'Tea break' },
    { start: '13:00', end: '14:00', label: 'Lunch' },
  ],
  weekday: { start: '08:00', end: '18:00' },
  saturday: { start: '08:00', end: '13:00' },
};

const at = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day); d.setHours(h, m, 0, 0); return d.getTime();
};

// → { gross, counted, breaks, net }  (minutes)
//   gross   wall-clock minutes from start to end
//   counted gross minus Sundays and time outside the working windows
//   breaks  scheduled break minutes that fall inside counted time
//   net     counted − breaks  (the "actual" time recorded on a card)
export function workingMinutes(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end) || end <= start) {
    return { gross: 0, counted: 0, breaks: 0, net: 0 };
  }
  const gross = Math.round((end - start) / 60000);
  let counted = 0, brk = 0;
  const day = new Date(start); day.setHours(0, 0, 0, 0);
  const last = new Date(end); last.setHours(0, 0, 0, 0);
  while (day <= last) {
    const dow = day.getDay();
    if (dow !== 0) {
      const next = new Date(day); next.setDate(next.getDate() + 1);
      let lo = Math.max(start.getTime(), day.getTime());
      let hi = Math.min(end.getTime(), next.getTime());
      const win = dow === 6 ? WORK_SCHEDULE.saturday : WORK_SCHEDULE.weekday;
      lo = Math.max(lo, at(day, win.start));
      hi = Math.min(hi, at(day, win.end));
      if (hi > lo) {
        counted += (hi - lo) / 60000;
        for (const b of WORK_SCHEDULE.breaks) {
          const o = Math.min(hi, at(day, b.end)) - Math.max(lo, at(day, b.start));
          if (o > 0) brk += o / 60000;
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }
  counted = Math.round(counted); brk = Math.round(brk);
  return { gross, counted, breaks: brk, net: Math.max(0, counted - brk) };
}

// Re-derives a stored card's actual minutes under the current rules from its raw
// inputs (clock-in, and the recorded elapsed minutes), without touching them.
// End = clock-in + recorded gross, so it is independent of the device timezone
// the card was submitted from. Returns null when the raw inputs are unusable.
export function recomputeActual(clockIn, grossMin) {
  const g = Number(grossMin);
  if (!clockIn || !(g > 0)) return null;
  const start = new Date(String(clockIn).trim().replace(' ', 'T'));
  if (isNaN(start)) return null;
  return workingMinutes(start, new Date(start.getTime() + g * 60000));
}
