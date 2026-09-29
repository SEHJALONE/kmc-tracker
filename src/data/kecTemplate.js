// The 13m KEC (electric coach) does not have build instructions of its own for
// most of the plant. Per the production owner:
//   • chassis (interior) work follows the EVS work instructions, and
//   • body work — welding, paint and trim — follows the KDC work instructions.
// Everything else (machine shop, frame parts, electrophoresis, QA) is shared.
//
// These pure functions derive the KEC's Travel Card lists, activities,
// consumables and station model tags from the EVS / KDC ones. They are used for
// the built-in seed and by tools/catalog-migrations to align the live catalog.
// Nothing here ever deletes a station: KEC-only stations are archived so cards
// already filed under them stay resolvable.

export const KEC_TC_SOURCE = {
  'Chassis Line 01': 'EVS',
  'Chassis Line 02': 'EVS',
  'Frame & Body Welding': 'KDC',
  'Trim Line & Final Assembly': 'KDC',
};

// Station-database lines (stations.js ids) and the family the KEC mirrors there.
export const KEC_STATION_SOURCE = {
  CHASSIS1: 'EVS', CHASSIS2: 'EVS',
  FRAME: 'KDC', TRIM: 'KDC', PAINT: 'KDC',
};

const codeOf = s => String(s).split(':')[0].trim();

// { tcLines, acts, res, stationModels } -> new objects with the KEC rows rebuilt.
export function applyKecTemplate({ tcLines = {}, acts = {}, res = {}, stationModels = {} }) {
  const nl = { ...tcLines }, na = { ...acts }, nr = { ...res }, nm = { ...stationModels };
  for (const [base, src] of Object.entries(KEC_TC_SOURCE)) {
    const kecKey = `${base} — KEC`, srcKey = `${base} — ${src}`;
    if (!nl[srcKey]) continue;
    // Drop KEC activity rows for stations that only the old KEC list had.
    for (const s of nl[kecKey] || []) delete na[`KEC:${codeOf(s)}`];
    nl[kecKey] = [...nl[srcKey]];
    if (nr[srcKey]) nr[kecKey] = JSON.parse(JSON.stringify(nr[srcKey])); else delete nr[kecKey];
    for (const s of nl[srcKey]) {
      const code = codeOf(s);
      delete na[`KEC:${code}`];
      if (na[`${src}:${code}`]) na[`KEC:${code}`] = [...na[`${src}:${code}`]];
    }
  }
  // Paint is one shared line; the KDC-only top-coat drying stage applies to KEC.
  nm['P07-03'] = [...new Set([...(nm['P07-03'] || ['KDC']), 'KEC'])];
  return { tcLines: nl, acts: na, res: nr, stationModels: nm };
}

// Station database ({ code: { line, models, active, … } }) -> KEC model tags that
// mirror the source family. KEC-only stations are archived, not removed.
export function alignKecStations(stations) {
  const out = {};
  for (const [code, st] of Object.entries(stations)) {
    const src = KEC_STATION_SOURCE[st.line];
    if (!src || !Array.isArray(st.models)) { out[code] = st; continue; }
    const has = st.models.includes(src);
    const models = has
      ? [...new Set([...st.models, 'KEC'])]
      : st.models.filter(m => m !== 'KEC');
    const kecOnly = st.models.includes('KEC') && models.length === 0;
    out[code] = kecOnly
      ? { ...st, models: ['KEC'], active: false }
      : { ...st, models };
  }
  return out;
}

// Per-model station wording: KEC shows the wording of the family it mirrors.
export function kecNameFamily(line) {
  const src = KEC_STATION_SOURCE[line];
  return src ? src.toLowerCase() : null;
}
