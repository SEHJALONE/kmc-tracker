// General users' "unexpected delay / time lost" on a Travel Card.
// Stored as { types: [reason, ...], minutes: { reason: n } }. Reasons are the
// 6Ms or anything the user typed under "Other". Cards filed before Nov 2026
// carry { ranges: { reason: "15-30" } } instead of exact minutes.

function rangeMidpoint(range) {
  const nums = String(range || '').match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return 0;
  return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
}

// Minutes lost to one reason: the exact figure, else an old range's midpoint.
export function delayMinutes(ud, type) {
  const m = Number(ud?.minutes?.[type]);
  if (Number.isFinite(m) && m > 0) return m;
  return rangeMidpoint(ud?.ranges?.[type]);
}

// "45 min", "15–30 min" (old cards) or "flagged" when no time was given.
export function delayLabel(ud, type) {
  const m = Number(ud?.minutes?.[type]);
  if (Number.isFinite(m) && m > 0) return `${m} min`;
  const r = ud?.ranges?.[type];
  if (r) return r === '120+' ? '120+ min' : `${String(r).replace('-', '–')} min`;
  return 'flagged';
}

// The payload for a card: null when nothing was selected.
export function buildDelay(types, minutes) {
  if (!types.length) return null;
  const out = {};
  types.forEach(t => { const n = Number(minutes[t]); if (Number.isFinite(n) && n > 0) out[t] = n; });
  return { types: [...types], minutes: out };
}

// Back into form state; an old card's range becomes its midpoint so it can be corrected.
export function delayFormState(ud) {
  const types = Array.isArray(ud?.types) ? ud.types : [];
  const minutes = {};
  types.forEach(t => { const m = delayMinutes(ud, t); if (m > 0) minutes[t] = String(m); });
  return { types, minutes };
}
