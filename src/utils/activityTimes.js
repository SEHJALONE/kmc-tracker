// Optional minutes each activity took on a Travel Card: { activity: minutes }.
// Only positive whole/decimal numbers are kept; blanks mean "not recorded".

export function cleanActivityTimes(times, activities = null) {
  const out = {};
  Object.entries(times || {}).forEach(([a, v]) => {
    if (activities && !activities.includes(a)) return;
    const n = Number(v);
    if (String(v).trim() !== '' && Number.isFinite(n) && n > 0) out[a] = Math.round(n * 10) / 10;
  });
  return out;
}

// A closed Start/End task: each ticked activity's minutes are the time since the
// task started or the previous tick, whichever came later. Prefill only — the
// operator can change them.
export function activityTimesFromTask(startedAt, activities) {
  const start = new Date(startedAt).getTime();
  const done = (activities || [])
    .filter(a => a.doneAt && !isNaN(new Date(a.doneAt).getTime()))
    .map(a => ({ name: a.name, t: new Date(a.doneAt).getTime() }))
    .sort((a, b) => a.t - b.t);
  const out = {};
  let prev = isNaN(start) ? null : start;
  done.forEach(({ name, t }) => {
    if (prev !== null && t > prev) out[name] = Math.max(1, Math.round((t - prev) / 60000));
    prev = t;
  });
  return out;
}

export function totalActivityMinutes(times) {
  return Object.values(cleanActivityTimes(times)).reduce((s, n) => s + n, 0);
}
