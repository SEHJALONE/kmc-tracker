// One place that decides what the Travel Card shows for a bus model, line and
// station: the built-in seed (src/data/travelCardSeed.js) with the shared
// catalog's admin edits merged over it. The legacy card, the Start/End task view
// and Catalog Admin's Travel Card tab all read through here, so an edit in the
// catalog lands exactly where the card shows it.
import { TC_LINES, ACTS, RES, LINE_MODELS, STATION_MODELS } from '../data/travelCardSeed';

export const BUS_MODELS = ['10.5m KDC', '12m KDC', '7m EVS', '8.5m EVS', '10.5m EVS', '12m EVS', '13m KEC'];

// Model family: EVS city bus, KDC diesel coach, KEC electric coach.
export function modelKindOf(busModel) {
  const m = String(busModel || '');
  return m.includes('KDC') ? 'KDC' : m.includes('KEC') ? 'KEC' : 'EVS';
}

export const codeOf = (station) => String(station || '').split(':')[0].trim();

// An activity ending in a bus-model tag, e.g. "… ladder bolts (7m EVS)", only
// applies to that exact model.
export function activityModelTag(activity) {
  const tag = /\((\d+(?:\.\d+)?m [A-Z]{3})\)\s*$/.exec(activity);
  return tag ? tag[1] : null;
}

// Merge the catalog over the seed. Pass `base` to resolve against an edited
// draft instead (Catalog Admin previews its unsaved changes this way).
export function resolveTcCatalog(catalog = {}, base = null) {
  const b = base || { tcLines: TC_LINES, acts: ACTS, res: RES, lineModels: LINE_MODELS, stationModels: STATION_MODELS };
  const res = { ...b.res };
  if (!base) for (const [ln, obj] of Object.entries(catalog.res || {})) res[ln] = { ...(b.res[ln] || {}), ...obj };
  const lines = base ? b.tcLines : { ...b.tcLines, ...(catalog.tcLines || {}) };
  const acts = base ? b.acts : { ...b.acts, ...(catalog.acts || {}) };
  const lineModels = base ? b.lineModels : { ...b.lineModels, ...(catalog.lineModels || {}) };
  const stationModels = base ? b.stationModels : { ...b.stationModels, ...(catalog.stationModels || {}) };

  const lineVisible = (line, kind) => !lineModels[line] || lineModels[line].includes(kind);
  const stationVisible = (station, kind) => {
    const m = stationModels[codeOf(station)];
    return !m || m.includes(kind);
  };

  return {
    lines, acts, res, lineModels, stationModels,
    lineVisible, stationVisible,
    visibleLines: (busModel) => Object.keys(lines).filter(l => lineVisible(l, modelKindOf(busModel))),
    stationsFor: (line, busModel) => (lines[line] || []).filter(s => stationVisible(s, modelKindOf(busModel))),
    // Which key in `acts` the card reads for this station: the model-specific
    // "KDC:C01-02" list wins over the shared "C01-02" one.
    actsKey: (code, busModel) => {
      const k = modelKindOf(busModel) + ':' + code;
      return acts[k] ? k : code;
    },
    actsFor: (code, busModel) => {
      if (!code) return [];
      const list = acts[modelKindOf(busModel) + ':' + code] || acts[code] || [];
      return list.filter(a => { const t = activityModelTag(a); return !t || t === busModel; });
    },
    resFor: (line, code) => (line && code && res[line] && res[line][code]) || [],
  };
}
