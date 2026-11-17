// KDC Trim Line main (non-EE) stations, from "Trim Travel Card"
// (KMC.DPD.04/26-FM004, Rev #01, issued 17.04.2026).
//
// Only the main T01-xx stations change. The EE stations (eeTrimProcess.js) and
// the sub-assembly stations (T01-xx-01) are left as they are. Card activities
// that are EE work (washer tank, relay box, display screens, radar sensors,
// steering column, first start, …) belong to the EE stations and are not
// copied here: see LEFT_TO_EE.
//
// Station names come from each station's non-EE work, because several card
// headings describe the EE work at that station instead.
//
// The built-in KEC trim follows KDC (kecTemplate.js). The live catalog's KEC
// trim still follows the 13m KEC drawing, so the live update leaves it alone.

export const TRIM_LINE = 'Trim Line & Final Assembly — KDC';

// [code, name, activities]
const STEPS = [
  ['T01-01', 'Installation of Floor Boards, A/C and Heat Shields', [
    'Transfer to Trim Buffer',
    'Quality Gate',
    'Floorboard Preparation',
    'Installation of Floor Boards',
    'A/C and Heat Shields Installation',
  ]],
  ['T01-02', 'Carpet Installation', [
    'Carpets Preparation',
    'Carpet Installation',
  ]],
  ['T01-03', 'A/C and Accessories, Carpet Welding, Side Boards and Escape Hatch', [
    'Installation of A/C & accessories',
    'Carpet Welding',
    'Side Board and Escape Hatch Installation',
  ]],
  ['T01-04', 'Dashboard Preparation, Cargo Racks, Door Pneumatic Pipes, Roof Boards, Moulds and Panels', [
    'Dashboard Preparation and Cargo Rack Sub-Assembly',
    'Installation of Door Pneumatic Pipes',
    'Roof Boards, Cargo racks, Front and Rear Mold, Left/right Panel Installation',
    'Side Glass Surface Preparation',
  ]],
  ['T01-05', 'Installation of Side Glass', [
    'Side Glass Installation',
  ]],
  ['T01-06', 'Aluminium Floor Profiles, Rear Side Panels and Windshields', [
    'Installation of Aluminium Floor Profiles',
    'Rear Side Panels, Front and Rear Windshields Installation',
  ]],
  ['T01-07', 'Step Poles, Column Covers, Curtain Rails, A/C Grille, E-Valves, Glass Sealant, Mirror Brackets and Water Rails', [
    'Installation of Step Poles, Pillar and Waist Beam Column Covers, Curtain Rails, A/C Air Grille and Curtains, E-Valves',
    'Glass Sealant Application',
    'Side Mirror Bracket and Water-Rails Installation',
  ]],
  ['T01-08', 'Passenger Steps, Driver Seat, Guard Rail, Barrier, E-Hammers, Fridge, Covers, Rear Seats and Fire Extinguisher', [
    'Installation of passenger Steps, Driver Seat',
    'Installation of Driver Guard Rail, Barrier, E-hammers, Fridge, Inspection Cover, Steering Column Cover',
    'Rear Seats (9), Fire Extinguisher, Trash-Can Compartment Door Locks',
  ]],
  ['T01-09', 'Passenger Doors, Seat Brackets, Sunvisor Rods, Mirrors, Dampers, Wipers, Compartment Door Sealant and Aluminium Strips', [
    'Passenger Doors Sub-Assembly',
    'Passenger Door and Locks Installation',
    'Seat Brackets Installation',
    'Sunvisor Rods, Side Mirrors, Dampers and Wipers Installation',
    'Compartment door Sealant Application',
    'Aluminium Side Panel Strips Installation',
  ]],
  ['T01-10', 'Passenger Seats, Filling Oils, Diesel and Coolant, Mechanical Checks', [
    'Seats Preparation and Electrical System Sub-Assembly',
    'Passenger Seats Installation',
    'Filling Oils, Diesel, Coolant',
    'Mechanical Checks',
  ]],
  ['T01-11', 'Rubber for Aluminium, Door Fine Tuning, Quality Inspection and Rectification', [
    'Rubber for Aluminium',
    'Debugging, Fine Tuning Passenger Doors',
    'Quality Inspection and Rectification',
  ]],
];

// Card rows that are EE work, so they stay with the EE stations.
export const LEFT_TO_EE = {
  'T01-03': ['Drilling of holes for riveting of cable tie holders'],
  'T01-04': ['Installation of Washer Tank', 'Termination and Installation of the Relay Box'],
  'T01-07': ['Installation and termination of Driver/Step Decorative Lights', 'Drilling, Taping, Installation and termination of Display Screens.'],
  'T01-10': ['Installation and termination of Radar sensors', 'Termination and routing of position lights',
    'Installation of Steering column Assembly (Combination Switch Unit, Horn Fiber Ring Unit, Start Key Unit)'],
  'T01-11': ['First start, Static tests and debugging'],
};

export const TRIM_LABELS = Object.fromEntries(STEPS.map(([code, name]) => [code, `${code}: ${name}`]));
export const TRIM_ACTS = Object.fromEntries(STEPS.map(([code, , acts]) => [`KDC:${code}`, [...acts]]));
// Bus Tracker names (KEC trim names follow KDC there).
export const TRIM_STATION_NAMES = Object.fromEntries(STEPS.map(([code, name]) => [code, { kdc: name }]));

const codeOf = l => String(l).split(':')[0].trim();
const relabel = list => list.map(l => TRIM_LABELS[codeOf(l)] || l);

export function trimProcessOutdated({ tcLines = {}, acts = {} }) {
  const list = tcLines[TRIM_LINE] || [];
  if (JSON.stringify(relabel(list)) !== JSON.stringify(list)) return true;
  return Object.entries(TRIM_ACTS).some(([k, v]) => JSON.stringify(acts[k]) !== JSON.stringify(v));
}

// KDC main trim station labels and activities. EE and sub-assembly stations,
// consumables and every other line stay as they are.
export function applyTrimProcess({ tcLines = {}, acts = {} }) {
  const nextLines = { ...tcLines };
  if (nextLines[TRIM_LINE]) nextLines[TRIM_LINE] = relabel(nextLines[TRIM_LINE]);
  return { tcLines: nextLines, acts: { ...acts, ...JSON.parse(JSON.stringify(TRIM_ACTS)) } };
}
