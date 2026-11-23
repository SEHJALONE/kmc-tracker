// Per-model editing of a Travel Card station's data in Catalog Admin.
//
// How the catalog keys per-model data (unchanged, so old catalogs read the same):
//   activities   acts["KEC:T01-02"] is KEC's own list; without it KEC reads the
//                shared acts["T01-02"], like every other model without its own.
//   consumables  res[line]["T01-02"]. Model lines ("Trim Line & Final Assembly
//                — KEC") are already per model. On a line every model uses
//                (Machine Shop, Paint Shop) a model can now have its own
//                res[line]["KEC:T01-02"] the same way activities do.
//   sharing      sharedStations["T01-02"] = ["EVS", "KEC"]: these models are
//                deliberately kept the same, so an edit for one goes to all.
//
// A model "reads" a record (a slot) when the card would show that record for
// it. Editing for one model writes its slot. Other models reading the same slot
// get their own copy first, unless they are ticked, so they keep what they had.
import { resolveTcCatalog, codeOf } from './tcCatalog';

export const KINDS = ['EVS', 'KDC', 'KEC'];
export const FIELDS = ['acts', 'res'];

const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
const tcOf = d => resolveTcCatalog({}, {
  tcLines: d.tcLines || {}, acts: d.acts || {}, res: d.res || {},
  lineModels: d.lineModels || {}, stationModels: d.stationModels || {},
});

// The line a model fills this station on: the line being edited when that
// model sees the station there, else the model's own line for it.
function lineFor(tc, code, kind, line) {
  if (line && tc.lineVisible(line, kind) && tc.stationsFor(line, kind).some(s => codeOf(s) === code)) return line;
  return tc.lineForStation(code, kind, line);
}

// Models that have this station on some Travel Card line.
export function kindsWithStation(draft, code, line = '') {
  const tc = tcOf(draft);
  return KINDS.filter(k => lineFor(tc, code, k, line));
}

// Where a model's list for this station lives: { field, line?, key }.
export function slotOf(draft, field, code, kind, line = '', tc = tcOf(draft)) {
  if (field === 'acts') {
    const own = `${kind}:${code}`;
    return { field, key: draft.acts && draft.acts[own] ? own : code };
  }
  const ln = lineFor(tc, code, kind, line);
  if (!ln) return null;
  const own = `${kind}:${code}`;
  const r = (draft.res || {})[ln] || {};
  return { field, line: ln, key: r[own] ? own : code };
}

const slotId = s => s && `${s.field}|${s.line || ''}|${s.key}`;
export const readSlot = (draft, s) => {
  if (!s) return [];
  const v = s.field === 'acts' ? (draft.acts || {})[s.key] : ((draft.res || {})[s.line] || {})[s.key];
  return Array.isArray(v) ? v : [];
};
function writeSlot(draft, s, list) {
  if (s.field === 'acts') { draft.acts[s.key] = [...list]; return; }
  draft.res ||= {};
  draft.res[s.line] = { ...(draft.res[s.line] || {}), [s.key]: [...list] };
}
const ownSlot = (s, kind, code) => ({ ...s, key: `${kind}:${code}` });

// Models that read the same record as `kind` (itself included).
export function readersOf(draft, field, code, kind, line = '', tc = tcOf(draft)) {
  const mine = slotId(slotOf(draft, field, code, kind, line, tc));
  return KINDS.filter(k => lineFor(tc, code, k, line) && slotId(slotOf(draft, field, code, k, line, tc)) === mine);
}

export const sharedGroup = (draft, code) => {
  const g = (draft.sharedStations || {})[code];
  return Array.isArray(g) ? KINDS.filter(k => g.includes(k)) : [];
};

// The models an edit for `kind` reaches: itself, the ticked ones, and, if it is
// in a shared group, the rest of that group.
export function editTargets(draft, code, kind, also = []) {
  const g = sharedGroup(draft, code);
  return KINDS.filter(k => k === kind || also.includes(k) || (g.includes(kind) && g.includes(k)));
}

// The same change on another model's list. Exactly the old list -> exactly the
// new one. Otherwise the one add, delete or rename is repeated by item text;
// a reorder is not (that list was ordered differently to start with).
export function applyListChange(prev = [], next = [], other = []) {
  if (same(other, prev)) return [...next];
  if (next.length === prev.length + 1) {
    const added = next.find((x, i) => x !== prev[i]);
    return added === undefined || other.includes(added) ? [...other] : [...other, added];
  }
  if (next.length === prev.length - 1) {
    const i = prev.findIndex((x, j) => x !== next[j]);
    const gone = prev[i];
    const at = other.indexOf(gone);
    return at < 0 ? [...other] : other.filter((_, j) => j !== at);
  }
  if (next.length === prev.length) {
    const diff = prev.map((x, i) => (x !== next[i] ? i : -1)).filter(i => i >= 0);
    if (diff.length === 1) {
      const at = other.indexOf(prev[diff[0]]);
      if (at >= 0 && !other.includes(next[diff[0]])) return other.map((x, j) => (j === at ? next[diff[0]] : x));
    }
  }
  return [...other];
}

// Give every model that reads `slot` but is not in `keep` its own copy.
function freezeOthers(draft, field, code, line, slot, keep, tc) {
  const value = readSlot(draft, slot);
  for (const k of KINDS) {
    if (keep.includes(k) || !lineFor(tc, code, k, line)) continue;
    const s = slotOf(draft, field, code, k, line, tc);
    if (slotId(s) === slotId(slot)) writeSlot(draft, ownSlot(s, k, code), value);
  }
}

// One edit of a station's activities or consumables for `kind`. Mutates and
// returns `draft`. Models outside the targets keep exactly what they showed.
export function applyModelEdit(draft, { field, code, kind, line = '', next, also = [] }) {
  draft.acts ||= {}; draft.res ||= {};
  const tc = tcOf(draft);
  const targets = editTargets(draft, code, kind, also).filter(k => k === kind || lineFor(tc, code, k, line));
  const slots = Object.fromEntries(targets.map(k => [k, slotOf(draft, field, code, k, line, tc)]));
  const mine = slots[kind];
  if (!mine) return draft;
  const prev = [...readSlot(draft, mine)];
  const before = Object.fromEntries(targets.map(k => [k, [...readSlot(draft, slots[k])]]));
  // Untouched models that read a record about to change keep a copy of it.
  const seen = new Set();
  for (const k of targets) {
    if (seen.has(slotId(slots[k]))) continue;
    seen.add(slotId(slots[k]));
    freezeOthers(draft, field, code, line, slots[k], targets, tc);
  }
  const written = new Set([slotId(mine)]);
  writeSlot(draft, mine, next);
  for (const k of targets) {
    if (written.has(slotId(slots[k]))) continue;
    written.add(slotId(slots[k]));
    writeSlot(draft, slots[k], applyListChange(prev, next, before[k]));
  }
  return draft;
}

// Station name on the card for this model's line. Names live in each line's
// station list, so a line every model uses has one name for all of them.
export function renameForModels(draft, { code, kind, line, name, also = [] }) {
  const tc = tcOf(draft);
  const lines = new Set([line]);
  for (const k of editTargets(draft, code, kind, also)) {
    if (k === kind) continue;
    const ln = lineFor(tc, code, k, line);
    if (ln) lines.add(ln);
  }
  for (const ln of lines) {
    draft.tcLines[ln] = (draft.tcLines[ln] || []).map(s => (codeOf(s) === code ? `${code}: ${name}` : s));
  }
  return draft;
}

// Split: every model that has the station keeps its own copy of what it shows
// now, and the station leaves any shared group. Nothing is deleted.
export function splitStation(draft, code, line = '') {
  draft.acts ||= {}; draft.res ||= {};
  const tc = tcOf(draft);
  const have = KINDS.filter(k => lineFor(tc, code, k, line));
  for (const field of FIELDS) {
    // Decide from the data as it is now, before any copy is written.
    const slots = have.map(k => [k, slotOf(draft, field, code, k, line, tc)]).filter(([, s]) => s && s.key === code);
    for (const [k, s] of slots) {
      if (slots.filter(([, o]) => slotId(o) === slotId(s)).length > 1) writeSlot(draft, ownSlot(s, k, code), readSlot(draft, s));
    }
  }
  if (draft.sharedStations) delete draft.sharedStations[code];
  return draft;
}

// Share: these models show `from`'s activities and consumables from now on, and
// later edits to one go to all of them. Models left out keep what they show.
export function shareStation(draft, code, kinds, from, line = '') {
  draft.acts ||= {}; draft.res ||= {};
  const group = KINDS.filter(k => kinds.includes(k) || k === from);
  if (group.length < 2) return splitStation(draft, code, line);
  const tc = tcOf(draft);
  const members = group.filter(k => lineFor(tc, code, k, line));
  // Activities: one record, the shared acts[code].
  const acts = [...readSlot(draft, slotOf(draft, 'acts', code, from, line, tc))];
  freezeOthers(draft, 'acts', code, line, { field: 'acts', key: code }, members, tc);
  draft.acts[code] = acts;
  for (const k of members) delete draft.acts[`${k}:${code}`];
  // Consumables: each member's own line gets the same list.
  const resList = [...readSlot(draft, slotOf(draft, 'res', code, from, line, tc))];
  const slots = members.map(k => slotOf(draft, 'res', code, k, line, tc)).filter(Boolean);
  for (const s of slots) freezeOthers(draft, 'res', code, line, s, members, tc);
  for (const s of slots) writeSlot(draft, s, resList);
  draft.sharedStations = { ...(draft.sharedStations || {}), [code]: members };
  return draft;
}

// How each model that has the station gets its data, for the editor to show.
//   { kind, shared: bool (explicit group), with: [models reading the same
//     activities record], ownActs, ownRes }
export function sharingOf(draft, code, line = '') {
  const tc = tcOf(draft);
  const g = sharedGroup(draft, code);
  return KINDS.filter(k => lineFor(tc, code, k, line)).map(k => ({
    kind: k,
    line: lineFor(tc, code, k, line),
    shared: g.includes(k),
    with: readersOf(draft, 'acts', code, k, line, tc).filter(o => o !== k),
    resWith: readersOf(draft, 'res', code, k, line, tc).filter(o => o !== k),
  }));
}
