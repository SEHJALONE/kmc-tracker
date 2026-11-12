// Paint Shop process, from "KVP 12 KDC Paint Shop Production Travel Tool Form"
// (Nov 2026). It applies to every model (EVS, KDC, KEC): there are no
// model-specific paint stations any more.
//
// One definition feeds the built-in Travel Card data (travelCardSeed.js), the
// tracker station list (stations.js) and the live-catalog migration
// (tools/catalog-migrations/2026-11-12-paint-shop-process.mjs).
//
// The form reuses some codes for different work (P01-03, P03-02, P04-0x,
// P07-02, P07-03, P08-04); cards filed under them before the change keep their
// code and now show the new name. P02-05 and P03-03 are no longer used: they
// are archived (kept, hidden) so older cards still resolve.

// [code, name, activities, consumables]
const STEPS = [
  // PQ — Incoming quality inspection
  ['PQ-01', 'Inspection', ['Incoming quality inspection', 'Defect marking', 'Sign-off'], []],
  // P01 — Bus body masking and foaming
  ['P01-01', 'Bus Body Panel Masking', ['Bus body panel masking', 'Glass & trim protection'], ['Masking Tape 25mm (roll)', 'Masking Tape 50mm (roll)', 'Masking Paper (m)']],
  ['P01-02', 'Foam Application', ['Foam application'], ['PU Foam Canister']],
  ['P01-03', 'Foam Trimming and Cleaning', ['Foam trimming', 'Cleaning'], ['Utility Knife']],
  // P02 — Epoxy primer
  ['P02-01', 'Surface Grinding and Sanding', ['Surface grinding and sanding', 'Surface uniformity check'], ['Grinding Disc 115mm', 'DA Sander Pad 150mm', 'Sandpaper 80 grit', 'Sandpaper 120 grit']],
  ['P02-02', 'Surface Cleaning', ['Surface cleaning'], []],
  ['P02-03', 'Epoxy Primer Painting', ['Epoxy primer painting', 'Coverage inspection'], ['Epoxy Primer (L)', 'Hardener (L)', 'Thinner (L)', 'Spray Gun Tip 1.4mm']],
  ['P02-04', 'Epoxy Primer Drying', ['Epoxy primer drying'], []],
  // P03 — Body filling
  ['P03-01', 'Panel Beating, Filler and Fibre Application', ['Panel beating', 'Filler and fibre application'], ['Body Filler (kg)', 'Glass Fibre Mat (m²)', 'Polyester Resin (L)', 'Body Hammer Set']],
  ['P03-02', 'Manual Surface Cleaning', ['Manual surface cleaning'], []],
  // P04 — High build primer
  ['P04-01', 'High Build Primer Painting', ['High build primer painting', 'Coverage inspection'], ['High Build Primer (L)', 'Hardener (L)', 'Thinner (L)', 'Spray Gun Tip 1.6mm']],
  ['P04-02', 'High Build Primer Drying', ['High build primer drying'], []],
  // P05 — Defect rectification and putty
  ['P05-01', 'Defects Rectification', ['Defects rectification'], []],
  ['P05-02', 'Putty Application and Drying', ['Putty application and drying'], ['Spot Putty (kg)', 'Spreading Knife']],
  ['P05-03', 'Putty Polishing', ['Putty polishing'], []],
  ['P05-04', 'Manual Surface Cleaning', ['Manual surface cleaning'], []],
  // P06 — Intermediate coat
  ['P06-01', 'Intermediate Coat Painting', ['Intermediate coat painting', 'Coverage inspection'], ['Intermediate Coat Paint (L)', 'Hardener (L)', 'Thinner (L)', 'Spray Gun Tip 1.4mm']],
  ['P06-02', 'Intermediate Coat Drying', ['Intermediate coat drying'], []],
  ['P06-03', 'Intermediate Coat Polishing', ['Intermediate coat polishing'], []],
  // P07 — Top coat, branding and clear coat
  ['P07-01', 'Top Coat Painting', ['Top coat painting', 'Wet film thickness check'], ['Top Coat Paint (L)', 'Hardener (L)', 'Thinner (L)', 'Spray Gun Tip 1.3mm']],
  ['P07-02', 'Branding', ['Branding'], []],
  ['P07-03', 'Clear Coat Painting', ['Clear coat painting'], ['Clear Coat (L)', 'Hardener (L)', 'Thinner (L)']],
  ['P07-04', 'Clear Coat Drying', ['Clear coat drying'], []],
  // P08 — Colour strip and pattern (compartments and underbody)
  ['P08-01', 'Colour Strip and Pattern Masking 1', ['Colour strip and pattern masking'], ['Masking Tape 25mm (roll)', 'Masking Paper (m)']],
  ['P08-02', 'Colour Strip and Pattern Painting (Compartments)', ['Colour strip and pattern painting (compartments)'], ['Colour Strip Paint (L)', 'Thinner (L)', 'Spray Gun Tip 1.2mm']],
  ['P08-03', 'Colour Strip and Pattern Drying', ['Colour strip and pattern drying'], []],
  ['P08-04', 'Colour Strip and Pattern Masking 2', ['Colour strip and pattern masking'], ['Masking Tape 25mm (roll)', 'Masking Paper (m)']],
  ['P08-05', 'Colour Strip and Pattern Painting (Anticorrosion Underbody Black)', ['Anticorrosion underbody black painting', 'Underbody coverage check'], ['Underbody Anti-Corrosion Paint, Black (L)', 'Applicator Brush', 'Respirator Cartridge']],
  ['P08-06', 'Unmasking', ['Unmasking'], []],
  // PQ — Finishing and final inspection (the form's quality gate checklist)
  ['PQ-02', 'Finishing and Inspection', ['Finishing and inspection', 'Dry film thickness (DFT) check', 'Surface defects check', 'Masking line crispness check', 'Underbody coverage check', 'Supervisor sign-off'], ['Inspection Light', 'Touch-up Paint (ml)', 'Polish Compound (g)', 'Buffer Pad']],
];

export const PAINT_LINE = 'Paint Shop';
export const PAINT_LINE_ID = 'PAINT';
export const ALL_MODELS = ['KDC', 'EVS', 'KEC'];

// Codes the old process used that the form no longer has.
export const RETIRED_PAINT_CODES = {
  'P02-05': 'Epoxy Primer Polishing (retired Nov 2026)',
  'P03-03': 'Filler Polish Manual Surface-Cleaning (retired Nov 2026)',
};

export const PAINT_TC_LINE = STEPS.map(([code, name]) => `${code}: ${name}`);
export const PAINT_ACTS = Object.fromEntries(STEPS.map(([code, , acts]) => [code, [...acts]]));
export const PAINT_RES = Object.fromEntries(STEPS.filter(s => s[3].length).map(([code, , , res]) => [code, [...res]]));
export const PAINT_STATIONS = Object.fromEntries([
  ...STEPS.map(([code, name], i) => [code, { name, line: PAINT_LINE_ID, order: i + 1, models: [...ALL_MODELS] }]),
  ...Object.entries(RETIRED_PAINT_CODES).map(([code, name], i) => [code, { name, line: PAINT_LINE_ID, order: STEPS.length + 1 + i, models: [...ALL_MODELS], active: false }]),
]);

const isPaintCode = k => /^(?:(?:EVS|KDC|KEC):)?P(?:\d\d|Q)-\d\d$/.test(k);

// Puts this process into a catalog's Travel Card and station data (the live
// catalog or the seed). Pure: returns new objects. Paint keys of any model,
// including old model-specific ones like "KDC:P07-02", are replaced.
export function applyPaintProcess({ tcLines = {}, acts = {}, res = {}, stationModels = {}, stations = {} }) {
  const nextActs = Object.fromEntries(Object.entries(acts).filter(([k]) => !isPaintCode(k)));
  Object.assign(nextActs, PAINT_ACTS);
  const nextModels = Object.fromEntries(Object.entries(stationModels).filter(([k]) => !isPaintCode(k)));
  const nextStations = { ...stations };
  for (const [code, st] of Object.entries(PAINT_STATIONS)) nextStations[code] = { ...(stations[code] || {}), ...st };
  for (const code of Object.keys(RETIRED_PAINT_CODES)) nextStations[code] = { ...nextStations[code], active: false };
  for (const st of Object.keys(PAINT_STATIONS)) if (!(st in RETIRED_PAINT_CODES)) delete nextStations[st].active;
  return {
    tcLines: { ...tcLines, [PAINT_LINE]: [...PAINT_TC_LINE] },
    acts: nextActs,
    res: { ...res, [PAINT_LINE]: JSON.parse(JSON.stringify(PAINT_RES)) },
    stationModels: nextModels,
    stations: nextStations,
  };
}
