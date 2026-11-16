// The Bus Tracker's station list (draft.stations, with a `models` list per
// station) and the Travel Card's line lists (draft.tcLines, some split per
// model, e.g. "Trim Line & Final Assembly — EVS") are kept separately. Ticking
// a model on a tracker station used to change nothing on the Travel Card, so a
// station could be "for all models" on the tracker and still be missing from a
// model's Start list (T01-01-EE for EVS, 16 Nov 2026).
//
// travelCardGaps(draft) lists every such case; fixGap(draft, gap) closes one in
// place (the editor calls it inside `touch`). Both work on Catalog Admin's
// draft shape: { lines, stations, tcLines, acts, res, lineModels, stationModels }.
import { resolveTcCatalog, codeOf } from './tcCatalog';
import { canonicalStationCode } from '../data/stations';

export const KINDS = ['EVS', 'KDC', 'KEC'];
const SAMPLE_MODEL = { EVS: '12m EVS', KDC: '12m KDC', KEC: '13m KEC' };

const tcOf = d => resolveTcCatalog({}, {
  tcLines: d.tcLines || {}, acts: d.acts || {}, res: d.res || {},
  lineModels: d.lineModels || {}, stationModels: d.stationModels || {},
});
const familiesOf = s => (Array.isArray(s?.models) && s.models.length ? KINDS.filter(k => s.models.includes(k)) : KINDS);

// The Travel Card line a model's operators use for a tracker line: the model's
// own split list when there is one ("… — EVS"), otherwise the shared list.
export function travelCardLineFor(draft, trackerLineId, fam) {
  const base = (draft.lines || []).find(l => l.id === trackerLineId)?.label;
  if (!base) return null;
  const names = Object.keys(draft.tcLines || {});
  return names.find(n => n === `${base} — ${fam}`) || names.find(n => n === base) || null;
}

// Gap reasons:
//   missing      the station is not on that model's Travel Card line at all
//   filtered     it is on the line, but its Travel Card ticks leave the model out
//   line-hidden  the whole Travel Card line is hidden for that model
//   no-line      no Travel Card line matches the tracker line (cannot be fixed here)
export function travelCardGaps(draft) {
  const tc = tcOf(draft);
  const offered = Object.fromEntries(KINDS.map(k => [k, new Set(
    tc.visibleLines(SAMPLE_MODEL[k]).flatMap(ln => tc.stationsFor(ln, SAMPLE_MODEL[k]).map(s => canonicalStationCode(codeOf(s)))),
  )]));
  const gaps = [];
  for (const [code, s] of Object.entries(draft.stations || {})) {
    if (s.active === false) continue;
    for (const fam of familiesOf(s)) {
      if (offered[fam].has(canonicalStationCode(code))) continue;
      const target = travelCardLineFor(draft, s.line, fam);
      let reason = 'no-line';
      if (target) {
        const onList = (draft.tcLines[target] || []).some(x => canonicalStationCode(codeOf(x)) === canonicalStationCode(code));
        reason = !tc.lineVisible(target, fam) ? 'line-hidden' : onList ? 'filtered' : 'missing';
      }
      gaps.push({ code, fam, name: s.name || '', trackerLine: s.line, target, reason });
    }
  }
  return gaps;
}

// The exact label another list already uses for this code ("T01-01 EE: …"),
// so every model files the station under the same code spelling.
function labelFor(draft, code, name) {
  for (const list of Object.values(draft.tcLines || {})) {
    const hit = (list || []).find(x => canonicalStationCode(codeOf(x)) === canonicalStationCode(code));
    if (hit) return hit;
  }
  return `${code}: ${String(name || code).replace(/\s*\((?:EVS|KDC|KEC)\)\s*\/\s*[-—]\s*\((?:EVS|KDC|KEC)\)\s*$/, '')}`;
}

const allow = (map, key, fam) => {
  if (Array.isArray(map[key]) && !map[key].includes(fam)) map[key] = KINDS.filter(k => map[key].includes(k) || k === fam);
};

// Closes one gap by changing `draft` in place. Returns false when it cannot.
export function fixGap(draft, gap) {
  const { code, fam, target, reason } = gap;
  if (!target || reason === 'no-line') return false;
  draft.lineModels ||= {}; draft.stationModels ||= {}; draft.acts ||= {}; draft.res ||= {};
  if (reason === 'line-hidden') { allow(draft.lineModels, target, fam); return true; }

  let entry = (draft.tcLines[target] || []).find(x => canonicalStationCode(codeOf(x)) === canonicalStationCode(code));
  if (!entry) {
    // Insert in production order: before the first station that comes later.
    entry = labelFor(draft, code, gap.name);
    const order = c => draft.stations?.[canonicalStationCode(c)]?.order;
    const mine = order(code) ?? Infinity;
    const list = [...(draft.tcLines[target] || [])];
    const at = list.findIndex(x => (order(codeOf(x)) ?? -Infinity) > mine);
    list.splice(at < 0 ? list.length : at, 0, entry);
    draft.tcLines[target] = list;
  }
  const tcCode = codeOf(entry);
  for (const key of Object.keys(draft.stationModels)) {
    if (canonicalStationCode(key) === canonicalStationCode(code)) allow(draft.stationModels, key, fam);
  }

  // Activities: when this model has none for the station, start it with another
  // model's list (edit it afterwards if the work differs). Consumables are not
  // copied: other models' lists can be wrong for this one, and operators can
  // add what they use on the card.
  if (!draft.acts[`${fam}:${tcCode}`] && !draft.acts[tcCode]) {
    const from = KINDS.find(k => k !== fam && draft.acts[`${k}:${tcCode}`]?.length);
    if (from) draft.acts[`${fam}:${tcCode}`] = [...draft.acts[`${from}:${tcCode}`]];
  }
  return true;
}

// After a station's tracker models change: put it on the Travel Card of every
// model it now covers. Used by Catalog Admin's Stations tab.
export function syncStationToTravelCard(draft, code) {
  let changed = 0;
  for (const g of travelCardGaps(draft).filter(x => canonicalStationCode(x.code) === canonicalStationCode(code) && x.reason !== 'line-hidden')) {
    if (fixGap(draft, g)) changed++;
  }
  return changed;
}
