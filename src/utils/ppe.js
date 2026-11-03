// PPE issued on a Travel Card. Stored like the consumables — a { name: qty }
// map — JSON-encoded into the existing `hse_resources` column, so the Apps
// Script needs no new column. Older cards hold a bare count there; parsePpe
// reads both.

export const PPE_ITEMS = [
  "Safety helmet",
  "Safety boots",
  "Overall / reflective vest",
  "Safety gloves",
  "Safety goggles",
  "Ear protection",
  "Dust mask / respirator",
];

// Every standard item set to the crew size — a sensible starting point the
// operator corrects. Extra (non-standard) items already on the card are kept.
export function prefillPpe(crew, prev = {}) {
  const n = crew > 0 ? String(crew) : "";
  const next = { ...prev };
  for (const item of PPE_ITEMS) next[item] = n;
  return next;
}

// Only items with a quantity are stored.
export function encodePpe(ppe) {
  const used = {};
  for (const [k, v] of Object.entries(ppe || {})) if (Number(v) > 0) used[k] = Number(v);
  return Object.keys(used).length ? JSON.stringify(used) : "";
}

// → { items: { name: qty }, total, legacy } — legacy is a pre-PPE bare count.
export function parsePpe(raw) {
  if (raw && typeof raw === "object") return summarise(raw);
  const s = raw == null ? "" : String(raw).trim();
  if (s.startsWith("{")) {
    try { return summarise(JSON.parse(s)); } catch { /* fall through */ }
  }
  const n = Number(s) || 0;
  return { items: {}, total: n, legacy: n > 0 };
}

function summarise(obj) {
  const items = {};
  for (const [k, v] of Object.entries(obj)) if (Number(v) > 0) items[k] = Number(v);
  return { items, total: Object.values(items).reduce((a, b) => a + b, 0), legacy: false };
}
