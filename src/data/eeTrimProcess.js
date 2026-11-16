// EE (electrical) stations of the Trim Line, from the 2026 travel card tools:
//   "KDC EE Trim Line Production Travel Card Tool 2026"
//   "EVS EE Trim Line Production Travel Card Tool 2026"
// (Line balancing and time studies, Nov 2026). KEC keeps its own EE list.
//
// One definition feeds the built-in Travel Card data (travelCardSeed.js), the
// Catalog Admin button that puts it into the live catalog, and the migration
// tools/catalog-migrations/2026-11-16-ee-trim-process.mjs.
//
// Changes from the earlier lists: EVS now has T01-01 EE (Rear LV Components)
// and T01-09 EE (driver cabin, signages, electrical cabinet, HV insulation
// tests and battery MSDs). Some work moved between stations, for example the
// EVS speakers and passenger USB ports are now at T01-06 EE.

export const EE_LINES = {
  EVS: 'Trim Line & Final Assembly — EVS',
  KDC: 'Trim Line & Final Assembly — KDC',
};

// [code, title, activities]
const EVS = [
  ['T01-01 EE', 'Installation of Rear LV Components', [
    'Routing of Rear Wall Low Voltage Harnesses',
    'Installation and termination of Rear Wall Compartment components (Switch Box, VCU, Fan, CAN Slaves, ABS and ECAS modules)',
    'Installation and termination of Low Voltage Batteries and MRCB',
    'Installation and termination of Charging Port sensor',
  ]],
  ['T01-02 EE', 'Installation and Termination of HV Components, Drilling and Taping for the Front Electrical Cabinet', [
    'Installation of HV components (HV Cabinet, Charging Ports)',
    'Termination of HV Components (PDU, MCU and HV Cabinet)',
    'Drilling and Taping for the Front Electrical Cabinet',
  ]],
  ['T01-03 EE', 'Installation of Cooling Pipes, Antenna, Height Marker Lights, Ceiling, Front Wall and Dashboard Harnesses, and A/C Terminations', [
    'Drilling of holes, riveting of cable tie holders and installation of cable ties',
    'Sub-assembly of the Roof harnesses (Ceiling harness, Antenna, Camera cables, AC cables)',
    'Installation and clamping of the Roof top Harnesses',
    'Installation of the Front Wall Harness',
    'Routing and termination of the dashboard, Side Mirror and underbody harnesses',
    'Installation of the radio antenna and termination of the AC Unit',
    'Installation of height marker lights (front and rear lights)',
  ]],
  ['T01-04 EE', 'Installation and Termination of Front Wall Components', [
    'Installation of Wiper Washer Tank, Wiper Motor, Defroster Unit and OBD Bracket',
    'Installation of the Low-Speed Alarm ECU and Electric Horns',
    'Installation of defroster pipes onto the Dashboard',
  ]],
  ['T01-06 EE', 'Installation and Termination of Exterior Lights, Speakers and Passenger USB Ports', [
    'Installation of side position lights and turn signals',
    'Installation of front Wall and Rear Wall lights (Combination lights, grill lights, fog lights, license plate lights)',
    'Installation and Termination of Passenger USB ports',
    'Installation and termination of speakers',
  ]],
  ['T01-07 EE', 'Installation and Termination of Dashboard Components, Display Screens and Interior Lights', [
    'Installation and termination of Dashboard Accessories (Driver USB port, Goose-neck Microphone, Rocker Switches, AC Panel, Shifter Panel, Side Mirror Joystick Switch, Instrument Cluster, Reverse Display, Audio-Video Unit, Destination Signage Panel, TPMS Display Screen, Wi-Fi Router)',
    'Drilling, Taping, Installation and termination of Display Screens',
  ]],
  ['T01-08 EE', 'Installation of Cameras, Passenger Stop Buttons and Interior Lights', [
    'Installation and termination of Interior and Exterior Cameras (Driver cabin, Middle Door, Rear In-cabin, Reverse and Side Cameras)',
    'Installation and Termination of Passenger Stop Buttons',
    'Installation and termination of Interior Lights (Roof spotlights/Driver Work lights, Aisle lights and step lights)',
  ]],
  ['T01-09 EE', 'Installation of Ceiling Driver Cabin Components, Destination Signages, Electrical Cabinet Components, HV Insulation Resistance Tests and Battery MSDs', [
    'Installation of Manual Sunshades (Driver Window and Front Right)',
    'Installation of Driver Mirror and Stop Signage',
    'Installation of Destination Signages (Front, Side and Rear signages)',
    'Installation and termination of the 230 V AC Outlet and Front Electrical Cabinet Components (Inverter, CAN Master, CAN Slave Modules, and DVR)',
    'HV Insulation Resistance Tests and Installation of Battery MSDs',
  ]],
  ['T01-10 EE', 'Installation of Steering Column Assembly, Radar Sensors, BMS Unit and Underbody Routing', [
    'Installation of Steering column Assembly (Start Key Unit, Combination Switches Unit, and Horn Clock Spring Unit)',
    'Installation and Termination of Radar Sensors',
    'Installation and Termination of the BMS unit',
    'Underbody routing (termination of step lights, driver seat, position light and turn signal)',
  ]],
  ['T01-11 EE', 'First Start, Programming, Testing and Debugging, Camera Calibrations', [
    'First start, ECU Programming, Static tests and debugging',
    'Camera Calibrations',
    'ECAS Calibration',
  ]],
];

const KDC = [
  ['T01-01 EE', 'Installation of Rear LV Components', [
    'Installation and termination of Rear Wall Compartment components (Engine Start-stop switch, limit switch, reverse buzzer, luggage compartment light)',
    'Installation and termination of Rear Side Compartment Components (LV batteries, Switch box, Bussman module, ABS module)',
  ]],
  ['T01-03 EE', 'Installation of Cooling Pipes, Antenna, Height Marker Lights, Ceiling, Front Wall and Dashboard Harnesses, and A/C Terminations', [
    'Sub-assembly of the Roof harnesses (Ceiling harness, Antenna, Camera cables, AC cables)',
    'Drilling of holes, riveting of cable tie holders and installation of cable ties',
    'Installation and clamping of the Roof top Harnesses',
    'Routing and termination of the dashboard, Side Mirror and underbody harnesses',
    'Installation of the Front Wall Harness',
    'Installation of the radio antenna and termination of the AC Unit',
    'Installation of height marker lights (front and rear lights)',
  ]],
  ['T01-04 EE', 'Installation and Termination of Front Wall Components', [
    'Installation of Wiper Washer Tank, Wiper Motor, Electric and Air Horns',
    'Installation of the Defroster Unit and OBD Bracket',
    'Termination and Installation of the Relay Box',
    'Installation and termination of the Bussman module, Digital Video Recorder (DVR), pressure switches and sensors',
    'Installation of defroster pipes and Logo light onto the dashboard',
  ]],
  ['T01-06 EE', 'Installation of Exterior Lights and USB Harnesses', [
    'Installation of side position lights and turn signals',
    'Installation of front Wall and Rear Wall lights (Combination lights, grill lights, fog lights, license plate lights)',
    'Installation of USB Trunking and Harnesses',
  ]],
  ['T01-07 EE', 'Installation and Termination of Dashboard Components, Display Screens and Interior Lights', [
    'Installation and termination of Dashboard Accessories (Driver USB port, Goose-neck Microphone, Rocker Switches, AC Panel, Shifter Panel, Side Mirror Joystick Switch, Instrument Cluster, Reverse Display, Audio-Video Unit, Destination Signage Panel, TPMS Display Screen, Wi-Fi Router)',
    'Drilling, Taping, Installation and termination of Display Screens',
    'Installation and termination of Interior Lights (Roof spotlights/Driver Work lights, step lights and luggage compartment lights)',
  ]],
  ['T01-08 EE', 'Installation of Cameras and Speakers', [
    'Installation and termination of speakers (Reading Lights Assembly)',
    'Installation and termination of Interior Cameras',
    'Installation of Exterior Cameras (Reverse Camera)',
  ]],
  ['T01-09 EE', 'Installation and Termination of Ceiling Driver Cabin Components and Destination Signages', [
    'Installation of Manual Sunshades (Driver Window and Front Right)',
    'Installation of Driver Mirror (electronic clock) and Seat Belt Signage',
    'Installation of Destination Signages (Front, Side and Rear signages)',
    'Installation and termination of 220 V AC Outlet',
  ]],
  ['T01-10 EE', 'Installation of Steering Column Assembly, Radar Sensors and Underbody Routing', [
    'Installation of Steering column Assembly (Combination Switch Unit, Clock Spring Unit, Start Key Unit)',
    'Installation and Termination of Radar Sensors',
    'Installation of Aisle lights',
    'Underbody routing (termination of step lights, driver seat, position light, turn signal, aisle lights, fridge)',
  ]],
  ['T01-11 EE', 'First Start, Programming, Testing and Debugging, Camera Calibrations', [
    'First start, ECM and Ad-Blue Configuration, Static tests and Debugging',
    'Camera Calibrations',
  ]],
];

const STEPS = { EVS, KDC };

// { EVS: { 'T01-01 EE': 'T01-01 EE: Installation of Rear LV Components', … }, KDC: … }
export const EE_LABELS = Object.fromEntries(Object.entries(STEPS).map(([fam, steps]) =>
  [fam, Object.fromEntries(steps.map(([code, title]) => [code, `${code}: ${title}`]))]));

// Travel Card activity lists keyed the way ACTS is ("EVS:T01-01 EE").
export const EE_ACTS = Object.fromEntries(Object.entries(STEPS).flatMap(([fam, steps]) =>
  steps.map(([code, , acts]) => [`${fam}:${code}`, [...acts]])));

// Bus Tracker names per family, keyed by tracker code ("T01-01-EE").
export const EE_STATION_NAMES = (() => {
  const out = {};
  for (const [fam, steps] of Object.entries(STEPS)) {
    for (const [code, title] of steps) {
      const k = code.replace(' EE', '-EE');
      out[k] = { ...(out[k] || {}), [fam.toLowerCase()]: title };
    }
  }
  return out;
})();

const codeOf = label => String(label).split(':')[0].trim();

// Puts each family's EE stations into its Trim Line list: an existing EE entry
// gets the new label in place, a missing one goes right after its main station
// ("T01-09 EE" after "T01-09: …").
function placeLabels(list, labels) {
  const out = [...list];
  for (const [code, label] of Object.entries(labels)) {
    const at = out.findIndex(l => codeOf(l) === code);
    if (at >= 0) { out[at] = label; continue; }
    const base = code.replace(' EE', '');
    const after = out.findIndex(l => codeOf(l) === base);
    out.splice(after >= 0 ? after + 1 : out.length, 0, label);
  }
  return out;
}

// True when the catalog's EVS/KDC EE stations or activities differ from the
// 2026 travel card tools.
export function eeProcessOutdated({ tcLines = {}, acts = {} }) {
  for (const [fam, line] of Object.entries(EE_LINES)) {
    const list = tcLines[line] || [];
    if (JSON.stringify(placeLabels(list, EE_LABELS[fam])) !== JSON.stringify(list)) return true;
  }
  return Object.entries(EE_ACTS).some(([k, v]) => JSON.stringify(acts[k]) !== JSON.stringify(v));
}

// Returns the catalog parts with the 2026 EE process in: EVS and KDC Trim Line
// EE labels and activities, and the tracker stations' model lists (EVS now uses
// T01-01-EE and T01-09-EE). Consumables, KEC and everything else stay as they are.
export function applyEeProcess({ tcLines = {}, acts = {}, stations = {} }) {
  const nextLines = { ...tcLines };
  for (const [fam, line] of Object.entries(EE_LINES)) {
    if (nextLines[line]) nextLines[line] = placeLabels(nextLines[line], EE_LABELS[fam]);
  }
  const nextStations = { ...stations };
  for (const [fam, steps] of Object.entries(STEPS)) {
    for (const [code] of steps) {
      const k = code.replace(' EE', '-EE');
      const st = nextStations[k];
      if (st && Array.isArray(st.models) && !st.models.includes(fam)) {
        nextStations[k] = { ...st, models: [...st.models, fam] };
      }
    }
  }
  return { tcLines: nextLines, acts: { ...acts, ...EE_ACTS }, stations: nextStations };
}
