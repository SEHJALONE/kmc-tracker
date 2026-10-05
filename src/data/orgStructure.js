// Department of Production — divisions and units, as drawn in
// public/Organisational structure.jpeg. Order follows the chart, left to right.
//
// `lines` = data/stations.js line ids whose Travel Cards belong to the unit.
// `workshop` = how the Production Downtime Log names the unit's workshop
// (matched case-insensitively against its Workshop column).
//
// The chart splits Chassis and Trim into several units, but the tracker has no
// station-to-unit split for them yet, so each of those units sees the whole
// line's cards and the person filling the log deletes the rows that aren't
// theirs. Once KMC supplies the split, give those units a `stations` list.

export const DIVISIONS = [
  'Body Shop',
  'Electrophoresis and Paint Shops',
  'Chassis System',
  'Trim and Assembly Shop',
  'Production Management',
];

export const ORG_UNITS = [
  { id: 'MACHINE',      division: 'Body Shop', unit: 'Machine Shop', lines: ['MACHINE'], workshop: /machine shop/i },
  { id: 'FRAME_PARTS',  division: 'Body Shop', unit: 'Frame and Body Parts Making', lines: ['BODY'], workshop: /parts making/i },
  { id: 'FRAME_WELD',   division: 'Body Shop', unit: 'Frame and Body Welding', lines: ['FRAME'], workshop: /weld/i },
  { id: 'ELECTRO',      division: 'Electrophoresis and Paint Shops', unit: 'Electrophoresis Shop', lines: ['ELECTRO'], workshop: /electro/i },
  { id: 'PAINT',        division: 'Electrophoresis and Paint Shops', unit: 'Paint Shop', lines: ['PAINT'], workshop: /paint/i },
  { id: 'CHASSIS_ELEC', division: 'Chassis System', unit: 'Chassis Electrical and Drivetrain Systems', lines: ['CHASSIS1', 'CHASSIS2'], workshop: /chassis/i },
  { id: 'CHASSIS_MECH', division: 'Chassis System', unit: 'Chassis Mechanical Systems', lines: ['CHASSIS1', 'CHASSIS2'], workshop: /chassis/i },
  { id: 'INTERIOR',     division: 'Trim and Assembly Shop', unit: 'Interior Systems', lines: ['TRIM'], workshop: /trim|final assembly/i },
  { id: 'EXTERIOR',     division: 'Trim and Assembly Shop', unit: 'Exterior Systems', lines: ['TRIM'], workshop: /trim|final assembly/i },
  { id: 'FOCL',         division: 'Trim and Assembly Shop', unit: 'Fuels, Oils, Coolants and Lubricants', lines: ['TRIM'], workshop: /trim|final assembly/i },
  { id: 'PPC',          division: 'Production Management', unit: 'Production Planning and Control', lines: [], workshop: null },
  { id: 'WAREHOUSE',    division: 'Production Management', unit: 'Warehousing and Logistics', lines: [], workshop: null },
  // Plant Maintenance answers for breakdowns everywhere, so it gets every
  // equipment-breakdown / planned-maintenance event in the Downtime Log.
  { id: 'MAINTENANCE',  division: 'Production Management', unit: 'Plant Maintenance', lines: [], workshop: /./, reasons: ['D1', 'D5'] },
];

export function orgUnit(id) {
  return ORG_UNITS.find(u => u.id === id) || null;
}

// The unit a signed-in user most likely logs for, from their assigned lines.
export function defaultUnitForLines(lineIds) {
  const ids = Array.isArray(lineIds) ? lineIds : [];
  return ORG_UNITS.find(u => u.lines.some(l => ids.includes(l))) || null;
}
