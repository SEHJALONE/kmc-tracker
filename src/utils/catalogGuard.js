// What a Catalog Admin save would hide from (or newly show to) each model
// family, compared with what is live. Catalog Admin asks before saving anything
// that hides a line or station, because operators are filling Travel Cards
// against the live catalog while it is being edited.
//
// `before` and `after` are both in the editor's draft shape (seed with the
// catalog merged over it — see buildInitial in CatalogAdmin.jsx).
import { resolveTcCatalog, codeOf } from './tcCatalog';
import { lineMatchesStation, lineFamilyOf } from './stationLine';

const KINDS = ['EVS', 'KDC', 'KEC'];

const tcOf = d => resolveTcCatalog({}, {
  tcLines: d.tcLines || {}, acts: d.acts || {}, res: d.res || {},
  lineModels: d.lineModels || {}, stationModels: d.stationModels || {},
});

// Families a tracker line/station is drawn for. No models list = every family.
const trackerKinds = item => {
  if (!item || item.active === false) return [];
  return Array.isArray(item.models) && item.models.length ? KINDS.filter(k => item.models.includes(k)) : KINDS;
};

const minus = (a, b) => a.filter(x => !b.includes(x));

// VIN lists change outside Catalog Admin (VIN Register uploads go straight to
// the server). The editor saves the whole catalog as it was when it opened, so
// a save would wipe VINs uploaded meanwhile. Keep the live lists, except for
// projects this admin changed in the Vehicles tab.
//   opened: projectVins when the editor opened, draft: now, live: on the server
export function mergeProjectVins(opened = {}, draft = {}, live = null) {
  if (!live) return draft;
  const out = { ...live };
  for (const [project, list] of Object.entries(draft || {})) {
    const edited = JSON.stringify(list) !== JSON.stringify((opened || {})[project]);
    if (edited || !(project in out)) out[project] = list;
  }
  return out;
}

export function catalogVisibilityChanges(before, after) {
  const hidden = [];
  const shown = [];
  const a = tcOf(before), b = tcOf(after);

  // Travel Card lines, then stations on the lines that are still there.
  for (const line of Object.keys(a.lines)) {
    const was = KINDS.filter(k => a.lineVisible(line, k));
    const removed = !(line in b.lines);
    const now = removed ? [] : KINDS.filter(k => b.lineVisible(line, k));
    const lost = minus(was, now);
    if (lost.length) hidden.push(`Travel Card line "${line}" ${removed ? 'is removed' : 'is hidden'} for ${lost.join(', ')} buses`);
    const gained = minus(now, was);
    if (gained.length) shown.push(`Travel Card line "${line}" becomes visible for ${gained.join(', ')} buses`);
    if (removed) continue;

    const nowCodes = k => b.stationsFor(line, k).map(codeOf);
    const lostBy = {};
    for (const k of now.filter(x => was.includes(x))) {
      const keep = nowCodes(k);
      for (const c of a.stationsFor(line, k).map(codeOf)) if (!keep.includes(c)) (lostBy[c] ||= []).push(k);
    }
    for (const [c, kinds] of Object.entries(lostBy)) hidden.push(`Travel Card station ${c} on "${line}" is hidden for ${kinds.join(', ')} buses`);
  }

  // Bus tracker lines and stations.
  const afterLines = Object.fromEntries((after.lines || []).map(l => [l.id, l]));
  for (const l of before.lines || []) {
    const lost = minus(trackerKinds(l), trackerKinds(afterLines[l.id]));
    if (lost.length) hidden.push(`Bus Tracker line "${l.label || l.id}" is hidden for ${lost.join(', ')}`);
  }
  for (const [code, s] of Object.entries(before.stations || {})) {
    const lost = minus(trackerKinds(s), trackerKinds((after.stations || {})[code]));
    if (lost.length) hidden.push(`Bus Tracker station ${code} is hidden for ${lost.join(', ')}`);
  }

  return { hidden, shown };
}

// Travel Card stations listed under a line their code does not belong to
// (C01-02 under Trim Line). Cards filled against such an entry are saved under
// the wrong line, so Catalog Admin refuses to save until they are moved.
export function misfiledStations(draft = {}) {
  const out = [];
  for (const [line, stations] of Object.entries(draft.tcLines || {})) {
    for (const s of stations || []) {
      const code = codeOf(s);
      if (!lineMatchesStation(line, code)) out.push({ line, code, belongs: lineFamilyOf(code) });
    }
  }
  return out;
}
