// Chassis Line 01 and 02 stations, from "CHASSIS LINE STATIONS" (Line balancing
// and time studies, Nov 2026). The KEC chassis is the same as the EVS one.
//
// One definition feeds the built-in Travel Card data (travelCardSeed.js), the
// Bus Tracker station list and names (stations.js), the default operators
// (manpowerAllocation.js), a Catalog Admin button and the live-catalog
// migration tools/catalog-migrations/2026-11-17-chassis-process.mjs.
//
// The document lists each quality gate at the start and the end of its line.
// The app keeps one station per code, so CQ-01 is the last station of Chassis
// Line 01 and CQ-02 the last of Chassis Line 02, each holding both checks.
// Stations no model uses any more are archived (kept, hidden) so cards already
// filed under them still resolve.

const LINE = { 1: 'Chassis Line 01', 2: 'Chassis Line 02' };
const TRACKER_LINE = { 1: 'CHASSIS1', 2: 'CHASSIS2' };

// [line, code, title, activities, consumables]
const EVS = [
  [1, 'C01-01', 'VIN Engraving', ['VIN engraving'], ['VIN Engraving Tool Tip']],
  [1, 'C01-02', 'Installation of Air Tanks, Valves and Pneumatic Pipes',
    ['Installation of air tanks', 'Installation of valves', 'Installation of pneumatic pipes'],
    ['Air Tanks', 'Air Tank Valves', 'Air Pipes (m)', 'Fittings & Clamp Set']],
  [1, 'C01-03', 'Installation of the Steering System', ['Installation of the steering system'],
    ['Steering Components', 'Mounting Bolts M12', 'Thread Lock (ml)']],
  // EE sub-stations at C01-03 (Nov 2026): HV battery cooling. EVS and KEC only.
  [1, 'C01-03-01 EE', 'HV Battery Cooling System Sub-Assembly',
    ['Dressing of the cooling hose with insulation sheath'], []],
  [1, 'C01-03 EE', 'Installation of HV Battery Cooling System',
    ['Installation of the insulated cooling pipes in the battery compartments',
      'Securing of the cooling pipes onto the attachment points using clamps and bolts'], []],
  [1, 'C01-04', 'Installation of LV Underbody Wiring Harness', ['Installation of LV underbody wiring harness'],
    ['LV Underbody Wiring Harness', 'Cable Ties (pack)', 'Split Loom 20mm (m)']],
  [1, 'CQ-01', 'Chassis Frame Buffer, Pre-Chassis Assembly and Quality Gate',
    ['Chassis frame buffer and pre-chassis assembly quality gate', 'Quality gate'], []],
  [2, 'C02-01', 'Installation of HV Wiring Harness', ['Installation of HV wiring harness'],
    ['HV Harness Set', 'Cable Ties (pack)']],
  [2, 'C02-02-01', 'Motor Sub-Assemblies', ['Motor sub-assemblies'], []],
  [2, 'C02-02', 'Installation of Battery, Motor and Cooling System',
    ['Installation of batteries', 'Installation of motor', 'Installation of cooling system'],
    ['Motor Mounting Hardware', 'HV Batteries', 'Radiator', 'Thread Lock (ml)']],
  [2, 'C02-03-01', 'Axles Sub-Assemblies', ['Axles sub-assemblies'], []],
  [2, 'C02-03', 'Installation of Suspension System', ['Installation of suspension system'],
    ['Front & Rear Axles', 'Suspensions', 'Air Bellow Shock Absorbers', 'Thread Lock (ml)']],
  [2, 'C02-04', 'Steering and Pneumatic System Installation',
    ['Steering system installation', 'Pneumatic system installation'],
    ['Air Compressor', 'Air Dryer', 'Air Pipes (m)', 'Fittings & Clamp Set']],
  [2, 'C02-05', 'Tire Installation and Bus Lowering', ['Tire installation', 'Bus lowering'],
    ['Customer Tyres', 'Valve Cores', 'Torque Wrench', 'Tyre Pressure Gauge']],
  [2, 'CQ-02', 'Quality Gate', ['Quality gate inspection (QIT)', 'Quality gate inspection (QIR)'], []],
];

const KDC = [
  [1, 'C01-01', 'VIN Engraving', ['VIN engraving'], ['VIN Engraving Tool Tip']],
  [1, 'C01-02-01', 'Sub-Assemblies for Air Tanks', ['Sub-assemblies for air tanks'], []],
  [1, 'C01-02', 'Installation of Air Tanks, Valves, Nylon Pipes, Gear Selector Cable, Fuel Lines, Hydraulic Pipes and Clutch Pipes',
    ['Installation of air tanks and valves', 'Installation of nylon pipes', 'Installation of gear selector cable',
      'Installation of fuel lines', 'Installation of hydraulic pipes', 'Installation of clutch pipes'],
    ['Air Tanks', 'Nylon Pipe 8mm (m)', 'Nylon Pipe 10mm (m)', 'Gear Selector Cable', 'Fuel Line (m)', 'Hydraulic Pipe (m)', 'Fittings & Clamp Set']],
  [1, 'C01-03-01', 'Cooling System Sub-Assemblies (Radiator-Fan Assemblies)', ['Radiator-fan assemblies'],
    ['Radiator Unit', 'Fan Blade Set', 'Mounting Hardware']],
  [1, 'C01-03', 'Installation of the Steering System, Spare Tire Brackets and Cooling System',
    ['Installation of the steering system', 'Installation of spare tire brackets', 'Installation of cooling system'],
    ['Steering Components', 'Spare Tyre Bracket', 'Radiator', 'Mounting Bolts M12']],
  [1, 'C01-04', 'Installation of LV Underbody Wiring Harness', ['Installation of LV underbody wiring harness'],
    ['LV Underbody Wiring Harness', 'Cable Ties (pack)']],
  [1, 'CQ-01', 'Chassis Frame Buffer, Pre-Chassis Assembly and Quality Gate',
    ['Chassis frame buffer and pre-chassis assembly quality gate', 'Systems quality inspection and defect rectification'], []],
  [2, 'C02-01', 'Installation of Fire Extinguishers, Routing and Termination of ABS Cables, Termination of the Alternator and Starter',
    ['Installation of fire extinguishers', 'Routing and termination of ABS cables', 'Termination of the alternator and starter'],
    ['Fire Extinguisher', 'Starter Motor', 'Cable Ties (pack)']],
  [2, 'C02-02-01', 'Engine-Gearbox Sub-Assemblies', ['Engine-gearbox sub-assemblies'], []],
  [2, 'C02-02', 'Installation of Engine-Gear Box Assembly', ['Installation of engine-gear box assembly'],
    ['Diesel Engine', 'Gear Box', 'Gasket Set', 'Mounting Bolts M16']],
  [2, 'C02-03', 'Installation of Engine Cooling System, Fuel System and AC Pump',
    ['Installation of engine cooling system', 'Installation of fuel system', 'Installation of AC pump'],
    ['Coolant Pipe (m)', 'Fuel Line (m)', 'Fuel Connectors', 'A/C Components']],
  [2, 'C02-04-01', 'Axles Sub-Assemblies', ['Axles sub-assemblies'], []],
  [2, 'C02-04', 'Integration of Front and Rear Axles', ['Integration of front and rear axles'],
    ['Front & Rear Axles', 'Suspensions', 'Shock Absorbers', 'Thread Lock (ml)']],
  [2, 'C02-05', 'Completion of Steering and Pneumatic System',
    ['Completion of steering system', 'Completion of pneumatic system'], []],
  [2, 'C02-06', 'Installation of Exhaust System, Clutch System and Air Intake System',
    ['Installation of exhaust system', 'Installation of clutch system', 'Installation of air intake system'],
    ['Air Cleaner Kit', 'Air Intake', 'Emissions System', 'Silencer', 'Exhaust Clamps']],
  [2, 'C02-07', 'Tire Installation and Bus Lowering', ['Tire installation', 'Bus lowering'], ['Customer Tyres', 'Valve Cores']],
  [2, 'CQ-02', 'Painted Body Buffer Transfer, Inspection and Quality Gate',
    ['Painted body buffer transfer and inspection', 'Quality gate'], []],
];

const STEPS = { EVS, KDC };
// Travel Card writes "C01-03 EE"; the tracker station list uses "C01-03-EE".
const trackerCode = code => code.replace(/ EE$/, '-EE');
// The KEC chassis is the EVS chassis.
const SOURCE = { EVS: 'EVS', KDC: 'KDC', KEC: 'EVS' };

export const CHASSIS_TC_LINES = {};
export const CHASSIS_ACTS = {};
export const CHASSIS_RES = {};
for (const [fam, src] of Object.entries(SOURCE)) {
  for (const n of [1, 2]) {
    const line = `${LINE[n]} — ${fam}`;
    const steps = STEPS[src].filter(s => s[0] === n);
    CHASSIS_TC_LINES[line] = steps.map(([, code, title]) => `${code}: ${title}`);
    CHASSIS_RES[line] = Object.fromEntries(steps.filter(s => s[4].length).map(([, code, , , res]) => [code, [...res]]));
    for (const [, code, , acts] of steps) CHASSIS_ACTS[`${fam}:${code}`] = [...acts];
  }
}

// Bus Tracker station list for the two chassis lines. Sub-assemblies come
// right before the station they feed; the quality gate closes each line.
export const CHASSIS_STATIONS = (() => {
  const out = {};
  for (const [fam, steps] of Object.entries(STEPS)) {
    for (const [n, tcCode, title] of steps) {
      const code = trackerCode(tcCode);
      const st = out[code] || { name: title, line: TRACKER_LINE[n], models: [] };
      st.models.push(fam);
      if (fam === 'EVS') st.models.push('KEC');
      out[code] = st;
    }
  }
  // Order follows the KDC list (it has every code but C02-03-01), with
  // C02-03-01 placed before C02-03.
  const order = { 1: [], 2: [] };
  for (const [n, code] of KDC) order[n].push(code);
  order[2].splice(order[2].indexOf('C02-03'), 0, 'C02-03-01');
  // EVS / KEC HV battery cooling EE stations come right after steering (C01-03).
  order[1].splice(order[1].indexOf('C01-03') + 1, 0, 'C01-03-01-EE', 'C01-03-EE');
  for (const n of [1, 2]) order[n].forEach((code, i) => { out[code].order = i + 1; });
  for (const st of Object.values(out)) st.models = ['KDC', 'EVS', 'KEC'].filter(m => st.models.includes(m));
  return out;
})();

// No model uses these any more. Archived, never deleted.
export const RETIRED_CHASSIS_CODES = {
  'C01-01-01': { name: 'Radiator-Fan Assembly (old code, use C01-03-01)', line: 'CHASSIS1', order: 90, models: ['KDC'] },
  'C01-04-01': { name: 'Wiring Harness Sub-Assembly', line: 'CHASSIS1', order: 91, models: ['KDC', 'EVS', 'KEC'] },
  'C02-01A': { name: 'Installation of HV Harnesses', line: 'CHASSIS2', order: 90, models: ['KEC'] },
  'C02-01B': { name: 'Air Compressor, Radiator and Air Dryer', line: 'CHASSIS2', order: 91, models: ['KEC'] },
  'C02-05-01': { name: 'Clutch Sub-Assembly', line: 'CHASSIS2', order: 92, models: ['KDC'] },
  'C02-06-01': { name: 'Tires Sub-Assembly', line: 'CHASSIS2', order: 93, models: ['EVS', 'KEC'] },
  'C02-07-01': { name: 'Tires Sub-Assembly', line: 'CHASSIS2', order: 94, models: ['KDC'] },
};

// Bus Tracker names per family, for codes where EVS and KDC differ.
export const CHASSIS_STATION_NAMES = (() => {
  const out = {};
  for (const [fam, steps] of Object.entries(STEPS)) {
    for (const [, tcCode, title] of steps) {
      const code = trackerCode(tcCode);
      out[code] = { ...(out[code] || {}), [fam.toLowerCase()]: title };
    }
  }
  return out;
})();

// Default operators from the document. Spellings follow the app's existing
// operator list, except Peter Ocom (the document's spelling).
const IVAN = 'Ivan Ssekide', NASSER = 'Nasser Kato', STEVEN = 'Steven Kato', DENISE = 'Denise Nfudu',
  PETER = 'Peter Ocom', MATHIAS = 'Mathias Kasumba', VICTOR = 'Victor Bwanatai', ISAAC = 'Isaac Wandwasi';
const STEERING_TEAM = [MATHIAS, IVAN, VICTOR];
const BY_DOCUMENT = {
  'C01-01': [IVAN, NASSER],
  'C01-02': [STEVEN, DENISE, PETER],
  'C01-03': STEERING_TEAM,
  'EVS:C02-02-01': [ISAAC, NASSER],
  'EVS:C02-02': [ISAAC, NASSER],
  'EVS:C02-03-01': STEERING_TEAM,
  'EVS:C02-03': STEERING_TEAM,
  'EVS:C02-04': [PETER, DENISE],
  'EVS:C02-05': [MATHIAS, IVAN],
  'KDC:C01-02-01': [DENISE],
  'KDC:C01-03-01': [ISAAC, NASSER],
  'KDC:C02-02-01': [ISAAC, NASSER],
  'KDC:C02-02': [ISAAC, NASSER],
  'KDC:C02-03': [STEVEN, NASSER],
  'KDC:C02-04-01': STEERING_TEAM,
  'KDC:C02-04': [MATHIAS, IVAN],
  'KDC:C02-05': [VICTOR, DENISE],
  'KDC:C02-06': [PETER, DENISE],
  'KDC:C02-07': [MATHIAS, IVAN],
};
// "FAM:CODE" keys (manpowerAllocation.js); the KEC gets the EVS chassis crew.
export const CHASSIS_MANPOWER = Object.fromEntries(Object.entries(BY_DOCUMENT).flatMap(([k, v]) =>
  k.startsWith('EVS:') ? [[k, [...v]], [k.replace('EVS:', 'KEC:'), [...v]]] : [[k, [...v]]]));

const isChassisAct = k => /^(EVS|KDC|KEC):(C0[12]-|CQ-0[12])/.test(k);

// True when the catalog's chassis lists or activities differ from the document.
export function chassisProcessOutdated({ tcLines = {}, acts = {} }) {
  if (Object.entries(CHASSIS_TC_LINES).some(([l, v]) => JSON.stringify(tcLines[l]) !== JSON.stringify(v))) return true;
  const have = Object.keys(acts).filter(isChassisAct);
  if (have.length !== Object.keys(CHASSIS_ACTS).length) return true;
  return Object.entries(CHASSIS_ACTS).some(([k, v]) => JSON.stringify(acts[k]) !== JSON.stringify(v));
}

// Returns the catalog parts with the document's chassis process in, for EVS,
// KDC and KEC: Travel Card lists, activities and consumables, and the tracker
// stations (retired codes archived). Everything else stays as it is.
export function applyChassisProcess({ tcLines = {}, acts = {}, res = {}, stations = {} }) {
  const nextActs = Object.fromEntries(Object.entries(acts).filter(([k]) => !isChassisAct(k)));
  Object.assign(nextActs, JSON.parse(JSON.stringify(CHASSIS_ACTS)));
  const nextStations = { ...stations };
  for (const [code, st] of Object.entries(CHASSIS_STATIONS)) {
    const next = { ...(stations[code] || {}), ...st, models: [...st.models] };
    delete next.active;
    nextStations[code] = next;
  }
  for (const [code, st] of Object.entries(RETIRED_CHASSIS_CODES)) {
    nextStations[code] = { ...(stations[code] || {}), ...st, active: false };
  }
  return {
    tcLines: { ...tcLines, ...JSON.parse(JSON.stringify(CHASSIS_TC_LINES)) },
    acts: nextActs,
    res: { ...res, ...JSON.parse(JSON.stringify(CHASSIS_RES)) },
    stations: nextStations,
  };
}
