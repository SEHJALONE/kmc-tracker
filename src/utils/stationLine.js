// Which production line a station code belongs to, from the code itself.
// The prefix is the plant's own numbering, so it is the one rule that cannot
// drift: C01-xx is always Chassis Line 01, T01-xx always Trim Line, and so on.
// Lines may carry a model suffix ("Chassis Line 01 — EVS"); the family is the
// part before it. Codes with no known prefix (e.g. "Washing Bay") are not checked.
//
// Keep LINE_FAMILY_RULES in step with lineFamilyOf_ in
// tools/mail-relay/Code-with-email.gs, which applies the same rule server side.

export const LINE_FAMILY_RULES = [
  [/^(C01-|CQ-01\b)/i, 'Chassis Line 01'],
  [/^(C02-|CQ-02\b)/i, 'Chassis Line 02'],
  [/^(T01|TQ)-/i, 'Trim Line & Final Assembly'],
  [/^(W01|WQ)-/i, 'Frame & Body Welding'],
  [/^(P\d{2}|PQ)-/i, 'Paint Shop'],
  [/^B0[1-3]-/i, 'Machine Shop'],
  [/^(B0[4-9]|B10)-/i, 'Frame Parts Making'],
  [/^E\d{2}-/i, 'Electrophoresis'],
  [/^Q\d{2}-/i, 'Quality Inspection & Testing'],
];

const codeOf = (station) => String(station || '').split(':')[0].trim();

// "Chassis Line 01" for "C01-02" or "C01-02: Installation of …"; null if unknown.
export function lineFamilyOf(stationOrCode) {
  const code = codeOf(stationOrCode);
  for (const [re, family] of LINE_FAMILY_RULES) if (re.test(code)) return family;
  return null;
}

// "Chassis Line 01 — EVS" -> "Chassis Line 01".
export function lineBaseOf(line) {
  return String(line || '').split(/\s+[—–-]\s+(?=(EVS|KDC|KEC)\s*$)/)[0].trim();
}

// True when the line is right for the station (or the station has no known prefix).
export function lineMatchesStation(line, stationOrCode) {
  const family = lineFamilyOf(stationOrCode);
  return !family || lineBaseOf(line) === family;
}

// Lines that exist once per model family ("Chassis Line 01 — KEC").
const PER_MODEL = new Set(['Frame & Body Welding', 'Chassis Line 01', 'Chassis Line 02', 'Trim Line & Final Assembly']);

// The right line name for a card: the line itself when it fits the station,
// otherwise the station's own family (with the model suffix where the plant
// runs one line per model). Used to repair cards saved under the wrong line.
export function correctLineFor(line, stationOrCode, busModel = '') {
  if (lineMatchesStation(line, stationOrCode)) return line;
  const family = lineFamilyOf(stationOrCode);
  if (!PER_MODEL.has(family)) return family;
  const m = String(busModel);
  const kind = m.includes('KDC') ? 'KDC' : m.includes('KEC') ? 'KEC' : 'EVS';
  return `${family} — ${kind}`;
}
