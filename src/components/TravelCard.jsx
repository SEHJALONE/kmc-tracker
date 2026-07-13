const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwd3fW_ygzXVAtU3vgJg_l9hxab52l-nRt5S-X4I8nuqm5f0anh9JvLv8TjjsQtoWFf/exec";

const STATION_TIMES_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQaiOeH78PS8rtCQOTd38jCTioVCQRan3Bg4MJcPbNB87odrcmsL_qA3cEPdAzfTZsP11Dqr1aNA7OY/pub?gid=343120708&single=true&output=csv";

function parseStationTimes(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return {};
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const codeIdx = headers.findIndex(h => h.includes("station code") || h.includes("stationcode") || h === "code");
  const timeIdx = headers.findIndex(h => h.includes("estimated") || h.includes("time") || h.includes("min"));
  if (codeIdx === -1 || timeIdx === -1) return {};
  const result = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = []; let cur = ""; let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    const rawCode = cells[codeIdx]?.trim().toUpperCase().replace(/\s+/g, "-");
    const rawTime = cells[timeIdx]?.trim();
    if (!rawCode || !rawTime) continue;
    const mins = parseFloat(rawTime);
    if (isNaN(mins) || mins <= 0) continue;
    for (const code of rawCode.split("/").map(c => c.trim()).filter(Boolean)) {
      result[code] = mins;
    }
  }
  return result;
}

async function fetchStationTimes() {
  const res = await fetch(STATION_TIMES_URL + "&t=" + Date.now());
  if (!res.ok) throw new Error("HTTP " + res.status);
  const times = parseStationTimes(await res.text());
  return {
    times,
    getMinutes: (code) => {
      if (!code) return null;
      const norm = code.trim().toUpperCase().replace(/\s+/g, "-");
      if (times[norm] !== undefined) return times[norm];
      const key = Object.keys(times).find(k => k.split("/").map(s => s.trim()).includes(norm));
      return key ? times[key] : null;
    },
  };
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const LS = {
  get: (k, fallback = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Convert an ISO timestamp (UTC) to a value a datetime-local input accepts
// ("YYYY-MM-DDTHH:mm" in local time). Empty/invalid → "".
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("sv-SE").slice(0, 16).replace(" ", "T");
}

// ── Production schedule ─────────────────────────────────────────────────────
// Default shift is 08:00–18:00 (the user overrides this by entering their own
// clock-in / clock-out). Non-productive breaks are excluded from "time used".
const SCHEDULE = {
  shiftStart: "08:00",
  shiftEnd:   "18:00",
  breaks: [
    { start: "10:00", end: "10:30", label: "Tea break" },
    { start: "13:00", end: "14:00", label: "Lunch" },
  ],
};

// Total minutes of scheduled breaks/lunch that fall inside [start, end].
// Iterates each calendar day spanned so overnight/multi-day spans work too.
function breakMinutesWithin(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end) || end <= start) return 0;
  let total = 0;
  const day = new Date(start); day.setHours(0, 0, 0, 0);
  const lastDay = new Date(end); lastDay.setHours(0, 0, 0, 0);
  while (day <= lastDay) {
    for (const b of SCHEDULE.breaks) {
      const [bh, bm] = b.start.split(":").map(Number);
      const [eh, em] = b.end.split(":").map(Number);
      const bs = new Date(day); bs.setHours(bh, bm, 0, 0);
      const be = new Date(day); be.setHours(eh, em, 0, 0);
      const ovStart = Math.max(start.getTime(), bs.getTime());
      const ovEnd   = Math.min(end.getTime(), be.getTime());
      if (ovEnd > ovStart) total += (ovEnd - ovStart) / 60000;
    }
    day.setDate(day.getDate() + 1);
  }
  return Math.round(total);
}

// Net productive minutes between a local clock-in string and an ISO clock-out,
// excluding scheduled breaks. Returns { gross, breaks, net }.
function productiveMinutes(clockInLocal, clockOutISO) {
  const start = new Date(clockInLocal);
  const end = new Date(new Date(clockOutISO).toLocaleString("sv-SE").replace(" ", "T"));
  if (isNaN(start) || isNaN(end)) return { gross: 0, breaks: 0, net: 0 };
  const gross = Math.round((end - start) / 60000);
  const brk = breakMinutesWithin(start, end);
  return { gross, breaks: brk, net: Math.max(0, gross - brk) };
}

// ── Station data ──────────────────────────────────────────────────────────────
export const TC_LINES = {
  // ── Shared lines (identical for EVS and KDC) ────────────────────────────────
  "Machine Shop": [
    "B01-01: Rectangular Tubes & Steel Plate Storage",
    "B01-02: Rectangular Tubes Cutting — Band Saw",
    "B01-03: Rectangular Tube Cutting — Laser Cutting Machine",
    "B01-04: Rectangular Tubes Cutting — Circular Saw",
    "B01-05: Sheet Metal Punching",
    "B01-06: 3D CNC Pipe Bending",
    "B01-07: Table Type Drilling",
    "B02-01: Plate Cutting — Laser Cutting Machine",
    "B02-02: Plate Shearing — Shearing Machine",
    "B02-03: Plate Bending — Bending Machine",
    "B02-04: Metal Sheet Processing — Hydraulic Press",
    "B02-05: Lathe, Milling and Drilling Machine",
    "B02-06: Sheet Metal Welding",
    "B02-07: Storage of Finished Parts",
    "B03-01: Uncoiling and Alignment",
    "B03-02: Side Panel Roller Press",
    "B03-03: Roof Middle Panel Roller Press",
    "B03-04: Side Roof Panel Roller Press",
    "B03-05: Storage of Finished Parts",
  ],
  "Frame Parts Making": [
    "B04-01: Roof Frame Welding",
    "B04-02: Repair Welding of Roof Panel Framework",
    "B04-03: Turn-over Welding of Roof Panel Framework",
    "B04-04: Grinding, Alignment and Cleaning of Roof Framework",
    "B04-05: Top Panel Stretcher",
    "B04-06: Escape Hatch Welding",
    "B04-07: Repair Welding, Grinding and Alignment of Roof Panel Assembly",
    "B05-01: Welding of Right Side Wall Framework",
    "B05-02: Repair Welding of Right Side Wall Framework",
    "B05-03: Turn-over and Repair Welding of the Right Side Wall Framework",
    "B05-04: Grinding and Correction of the Right Side Wall Framework",
    "B06-01: Welding of Left Side Wall Framework",
    "B06-02: Repair Welding of Left Side Wall Framework",
    "B06-03: Turn-over and Repair Welding of the Left Side Wall Framework",
    "B06-04: Grinding and Correction of Left Side Wall Framework",
    "B07-01: Welding of Rear Face Framework",
    "B07-02: Repair Welding and Correction of Rear Face Framework",
    "B07-03: Welding of Rear Panel",
    "B07-04: Repair, Grinding and Storage of Rear Face",
    "B08-01: Front Face Frame Welding",
    "B08-02: Repair Welding and Correction of Front Face Framework",
    "B08-03: Welding of Front Panel",
    "B08-04: Repair, Grinding and Storage of Front Face",
    "B09-01: Frame Parts Welding",
    "B09-02: Integration Welding of Frame Assembly",
    "B09-03: Repair Welding of Frame Assembly",
    "B09-04: Installation of Frame Accessories",
    "B09-05: Grinding and Alignment of Frame Assembly",
    "B09-06: Inspection and Storage of Frame Assembly",
  ],
  "Electrophoresis": [
    "E01-01: Pre-degreasing",
    "E01-02: Degreasing",
    "E01-03: Washing 1",
    "E01-04: Washing 2",
    "E01-05: Transfer",
    "E01-06: Pure Water Wash 1",
    "E01-07: Silane",
    "E01-08: Pure Water Wash 2",
    "E01-09: Pure Water Washing 3",
    "E01-10: Transfer",
    "E02-01: Electrophoresis",
    "E02-02: UF1",
    "E02-03: UF2",
    "E02-04: Pure Water Wash 4",
    "E02-05: Electrophoresis Drying",
  ],

  // ── Frame & Body Welding — model-specific ───────────────────────────────────
  "Frame & Body Welding — EVS": [
    "WQ-01: Quality Gate",
    "WQ-02: Quality Gate",
    "W01-01: Six Parts Merging and Alignment",
    "W01-02: Passenger Door Step & Additional Chassis Infuse Profiles",
    "W01-03: Full Welding, Grinding & Weld Bead Protection",
    "W01-04: Welding of Chassis Frame Profiles, Brackets & Inner Sealing Plates",
    "W01-05: Exterior Sealing Plate & Additional Brackets",
    "W01-06: Fibre Roof, A/C Bolts, Cargo Rack & Ladder Bolts (7m EVS)",
    "W01-07: Transfer",
    "W01-08: Side Panel Extension and Side Panel Trimming",
    "W01-09: Passenger Door Frames and Door Actuator",
    "W01-10: External Side Frame, Fibre Strips, Marker Light & Camera Hole",
    "W01-11: Compartment Doors & Fascia Bumper Alignment",
    "W01-12: Underbody Welding and Sealant Application",
    "W01-13: Rectification",
    "W01-14: Quality Gate (WQ-03)",
  ],
  "Frame & Body Welding — KDC": [
    "W01-01a: Back Seat, Heat Shield, Floor Sub-frame Plates & Rear Fascia to U-Hoop",
    "WQ-01: Quality Gate",
    "W01-01b: U-Hoop, Driver Cabin Floor, Chassis Infuses & Front Fascia to Chassis",
    "WQ-02: Quality Gate",
    "W01-02: Coach Frame Alignment, Door Step & Chassis Infuse Profiles",
    "W01-03: Full Welding, Grinding & Weld Bead Protection",
    "W01-04: Welding of Attachment Brackets & Sealing Plates",
    "W01-05: Additional Seal Plates, Attachment Brackets & Sealant",
    "W01-06: Fibre Roof & A/C Bolts",
    "W01-07: Transfer",
    "W01-08: Side Panel Extension and Side Panel Trimming",
    "W01-09: Passenger Door Frames and Door Actuator",
    "W01-10: External Side Frame, Fibre Strips & Marker Light",
    "W01-11: Compartment Doors & Fascia Bumper Alignment",
    "W01-12: Underbody Welding and Sealant Application",
    "W01-13: Rectification",
    "W01-14: Quality Gate (WQ-03)",
  ],

  // ── Chassis Line 01 — model-specific ────────────────────────────────────────
  "Chassis Line 01 — EVS": [
    "CQ-01: Chassis Frame Defects, Rectification Buffer & Pre-Chassis Assembly",
    "C01-01: VIN Engraving & LV Underbody Wiring Harnesses",
    "C01-02: Chassis Air Tanks, Air Pipes & Braking Systems",
    "C01-02-01: Sub-Assembly",
    "C01-03: Installation of Steering System",
    "C01-04: Air Tanks, Valves, Brake Pedals, ABS Valves & Pipes Sub-Assembly",
    "C01-04-01: Wiring Harness Sub-Assembly",
    "CQ-02: Quality Gate",
  ],
  "Chassis Line 01 — KDC": [
    "CQ-01: Chassis Frame Defects, Rectification Buffer & Pre-Chassis Assembly",
    "C01-01: VIN Engraving",
    "C01-02: Chassis Air Tanks, Air Pipes, Braking, Nylon, Gear Selector & Hydraulic",
    "C01-02-01: Air Tanks Sub-Assembly",
    "C01-03: Steering System, Gear Lever Cables, Clutch Radiator & Tyre Bracket",
    "C01-01-01: Radiator-Fan Assembly",
    "C01-04: Low Voltage Underbody Wiring Harness",
    "C01-04-01: Wiring Harness Sub-Assembly",
    "CQ-02: Quality Gate",
  ],

  // ── Chassis Line 02 — model-specific ────────────────────────────────────────
  "Chassis Line 02 — EVS": [
    "C02-01: HV Harnesses, TPMS Modules, Fire Extinguishers & LV Harness Routing",
    "C02-02: Installation of Motor & HV Batteries",
    "C02-03: Front & Rear Axles, Suspensions & Air Bellow Shock Absorbers",
    "C02-03-01: Axles Sub-Assembly",
    "C02-04: Air Compressor, Radiator, Air Dryer, PDU & MCU",
    "C02-05: Termination of HV Battery Accessories, ABS & Speed/Brake-wear Sensors",
    "C02-06: Wheel Arch Profile & Customer Tyres",
    "C02-06-01: Tires Sub-Assembly",
    "C02-07: Torquing & Pressure Balancing of Customer Tyres",
    "CQ-02: Quality Gate",
  ],
  "Chassis Line 02 — KDC": [
    "C02-01: TPMS, Fire Extinguisher, Rear LV, A/C, Starter Motor & Harness Routing",
    "C02-02: Diesel Engine, Gear Box & Engine Accessories Termination",
    "C02-03: Engine Cooling and Fuel System",
    "C02-04-01: Axles Sub-Assembly",
    "C02-04: Front & Rear Axles, Suspensions & Shock Absorbers",
    "C02-05: Pneumatic & Steering Completion, Driver Floorboard, Clutch & Sensors",
    "C02-06: Air Cleaner, Air Intake, Emissions System & Silencer",
    "C02-07-01: Tires Sub-Assembly",
    "C02-07: Installation of Tyres",
    "CQ-02: Quality Gate",
  ],

  // ── Paint Shop (shared; P07-02 differs, P07-03 KDC-only) ────────────────────
  "Paint Shop": [
    "P01-01: Bus Body Panel Masking",
    "P01-02: Foaming Application and Trimming",
    "P01-03: Underbody Anti-corrosion Painting",
    "P02-01: Body Panel Surface Grinding and Sanding",
    "P02-02: Ground Body Manual Surface-Cleaning",
    "P02-03: Epoxy Primer Painting",
    "P02-04: Epoxy Primer Drying",
    "P02-05: Epoxy Primer Polishing",
    "P03-01: Panel Beating; Filler and Fibre Application",
    "P03-02: Filler and Fibre Polishing",
    "P03-03: Filler Polish Manual Surface-Cleaning",
    "P04-01: NC Primer Painting",
    "P04-02: NC Primer Drying",
    "P05-01: Defects Rectification",
    "P05-02: Putty Application and Drying",
    "P05-03: Putty Polishing",
    "P05-04: Putty Polish Manual Surface-Cleaning",
    "PQ-01: Inspection",
    "P06-01: Intermediate Coat Painting",
    "P06-02: Intermediate Coat Paint-Drying",
    "P06-03: Intermediate Coat Polishing",
    "P07-01: AutoCryl TopCoat Painting",
    "P07-02: AutoCryl TopCoat Paint-Drying (EVS) / Clear Coat Painting (KDC)",
    "P07-03: TopCoat Paint-Drying (KDC only)",
    "P08-01: Color Strip and Pattern Masking",
    "P08-02: Color Strip and Pattern Painting",
    "P08-03: Color Strip and Pattern Drying",
    "P08-04: Color Strip and Pattern Unmasking",
    "PQ-02: Finishing and Inspection",
  ],

  // ── Trim Line & Final Assembly — model-specific ─────────────────────────────
  "Trim Line & Final Assembly — EVS": [
    "T01-01: Installation of Floor Boards, A/C & Heat Shield",
    "T01-01-01: Floorboard Preparation (sub-assembly)",
    "T01-02: Carpet Installation",
    "T01-02 EE: Installation and Termination of HV Components",
    "T01-02-01: Carpets Preparation (sub-assembly)",
    "T01-03: Carpet Welding, A/C & Accessories, Side Board Profiles, Escape Hatch",
    "T01-03 EE: Cooling Pipes, Antenna, Marker Lights, Harnesses & A/C Terminations",
    "T01-03-01: A/C Sub-Assembly",
    "T01-04: Roof/Side Boards, Airducts, Pneumatic Pipes, Moulds, Panels & Latch Cable",
    "T01-04 EE: Front Wall & Front Compartment Components; Routing & Termination",
    "T01-04-01: Dashboard, Roof & Air Duct Preparation (sub-assembly)",
    "T01-05: Installation of Side Glass",
    "T01-06: Dashboard, Windshields, Floor Profiles, Airduct Doors, Waist Beam & Rear Panels",
    "T01-06 EE: Exterior Lights Installation and Termination",
    "T01-07: Poles, Column Covers, Curtain Rails, E-Valves, E-Hammers, A/C Grille & Sealant",
    "T01-07 EE: Final Dashboard Components & Display Screens",
    "T01-08: Driver Seat & Cabins, Barriers, Brackets, Covers, Extinguisher & False Roof",
    "T01-08 EE: Interior Cameras and Speakers",
    "T01-09: Passenger Door & Locks, Exterior Accessories, Mirrors, Dampers & Sealant",
    "T01-09-01: Passenger Doors Sub-Assembly",
    "T01-10: Installation of Seats; Filling Oils, Coolant & Mechanical Checks",
    "T01-10 EE: BMS, USB, Steering Column & Side Cameras",
    "T01-10-01: Electrical System Sub-Assembly",
    "T01-11 EE: First Start, Testing, Debugging & Camera Calibration",
    "T01-11: ECAS, Fine Tuning of Passenger Doors",
    "T01-12: Quality Inspection and Rectification (TQ-01)",
  ],
  "Trim Line & Final Assembly — KDC": [
    "T01-01: Installation of Floor Boards, A/C & Heat Shield",
    "T01-01 EE: Rear Wall and Rear Side Compartment Components",
    "T01-01-01: Floorboard Preparation (sub-assembly)",
    "T01-02: Carpet Installation",
    "T01-02-01: Carpets Preparation (sub-assembly)",
    "T01-03: Carpet Welding, A/C & Accessories, Side Board Profiles, Escape Hatch",
    "T01-03 EE: Cooling Pipes, Antenna, Marker Lights, Harnesses & A/C Terminations",
    "T01-03-01: A/C Sub-Assembly",
    "T01-04: Roof/Side Boards, Airducts, Pneumatic Pipes, Moulds, Panels & Latch Cable",
    "T01-04 EE: Front Wall & Front Compartment Components; Routing & Termination",
    "T01-04-01: Dashboard, Roof & Air Duct Preparation (sub-assembly)",
    "T01-05: Installation of Side Glass",
    "T01-06: Dashboard, Windshields, Floor Profiles, Airduct Doors & Rear Side Panels",
    "T01-06 EE: Exterior Lights, Front Camera & Step Decorative Lights",
    "T01-07: Step Poles, Column Covers, Mirror Brackets, Rails, E-Valves, A/C Grille & Sealant",
    "T01-07 EE: Dashboard Accessories & Display Screens",
    "T01-08: Driver Seat & Cabins, Guard Rail, Barriers, Brackets, Covers & Rear Seats",
    "T01-08 EE: Speakers / Reading Lights & Interior Cameras",
    "T01-09: Passenger Door & Locks, Exterior Accessories, Mirrors, Dampers & Sealant",
    "T01-09 EE: Interior EE Components & Lighting Systems",
    "T01-09-01: Passenger Doors Sub-Assembly",
    "T01-10: Installation of Passenger Seats; Filling Oils, Coolant & Mechanical Checks",
    "T01-10 EE: Accelerator, USB, Steering Column, Exterior Camera & Underbody Termination",
    "T01-10-01: Electrical System Sub-Assembly",
    "T01-11 EE: First Start, Testing, Debugging & Camera Calibration",
    "T01-11: A/C Refilling, Rubber from Aluminium, Door Fine-Tuning & Quality Inspection",
  ],

  // ── Quality Inspection & Testing (shared; Q01-02 differs) ───────────────────
  "Quality Inspection & Testing": [
    "Q01-01: Test Registration",
    "Q01-02: Speed Test (EVS) / Vehicle Exhaust & Speed Test (KDC)",
    "Q01-03: Wheel Alignment",
    "Q01-04: Sound Level Inspection",
    "Q01-05: Head Lamp Aim Alignment",
    "Q01-06: Side Slip Test",
    "Q01-07: Axle Load and Brake Test",
    "Q01-08: Test Report Generation",
    "Q01-09: Defects Rectification",
    "Q01-10: Chassis Anti-corrosion & Underbody Plastic Primer Application",
    "Q01-11: Paint Inspection",
    "Q01-12: Paint Repair and Drying",
    "Q01-13: Rain Test / Water Intrusion",
    "Q01-14: Defects Rectification",
    "Q01-15: Road Test / Whole Vehicle Dynamic Test",
    "Q01-16: Inspection / Decision Gate & Underbody Inspection",
    "Washing Bay: Washing and Cleaning the Bus",
    "Q01-17: Defects Rectification",
  ],
};

// Lines that apply to only one model. Anything not listed = both.
export const LINE_MODELS = {
  "Frame & Body Welding — EVS": ["EVS"],
  "Frame & Body Welding — KDC": ["KDC"],
  "Chassis Line 01 — EVS": ["EVS"],
  "Chassis Line 01 — KDC": ["KDC"],
  "Chassis Line 02 — EVS": ["EVS"],
  "Chassis Line 02 — KDC": ["KDC"],
  "Trim Line & Final Assembly — EVS": ["EVS"],
  "Trim Line & Final Assembly — KDC": ["KDC"],
};

// Individual stations restricted to one model (within an otherwise-shared line).
export const STATION_MODELS = {
  "P07-03": ["KDC"], // KDC has an extra TopCoat drying stage (clear-coat process)
};

// ── Activities per station (from the Build Process Summary documents) ─────────
// Codes that differ between models are namespaced "EVS:CODE" / "KDC:CODE".
// The component looks up "<model>:<code>" first, then falls back to the bare code.
export const ACTS = {
  // ── Machine Shop (shared) ───────────────────────────────────────────────────
  "B01-01": ["Receive and store rectangular tubes & steel plates", "Stock labelling and organisation", "Material inspection"],
  "B01-02": ["Band saw setup and tensioning", "Cut rectangular tubes to length", "Deburr and inspect cut ends"],
  "B01-03": ["Laser cutting machine setup", "Laser cut rectangular tubes to profile", "Dimension inspection"],
  "B01-04": ["Circular saw setup", "Cut rectangular tubes", "Deburr and inspect"],
  "B01-05": ["Punch tooling setup", "Punch sheet metal to template", "Inspect hole pattern"],
  "B01-06": ["Load CNC bending program", "3D CNC pipe bending to specification", "Bend angle check"],
  "B01-07": ["Table drill setup", "Drill holes to specification", "Deburr and inspect"],
  "B02-01": ["Laser cutting machine setup", "Laser cut steel plate to profile", "Dimension inspection"],
  "B02-02": ["Shearing machine setup", "Shear plate to size", "Deburr and inspect"],
  "B02-03": ["Bending machine setup", "Bend plate to angle/profile", "Angle inspection"],
  "B02-04": ["Hydraulic press setup", "Form/press sheet metal", "Dimension inspection"],
  "B02-05": ["Machine setup (lathe / milling / drilling)", "Machine to drawing", "Dimension & finish inspection"],
  "B02-06": ["Fixture setup and clamping", "Sheet metal welding", "Weld inspection and grinding"],
  "B02-07": ["Sort and label finished parts", "Storage racking", "Inventory update"],
  "B03-01": ["Load and uncoil steel coil", "Strip alignment and feed setting", "Straightness check"],
  "B03-02": ["Side panel roller press setup", "Roll panel to profile", "Profile dimension check"],
  "B03-03": ["Roof middle panel roller press setup", "Roll panel to profile", "Profile dimension check"],
  "B03-04": ["Side roof panel roller press setup", "Roll panel to profile", "Profile dimension check"],
  "B03-05": ["Sort and label finished panels", "Storage racking", "Inventory update"],
  // ── Frame Parts Making (shared) ─────────────────────────────────────────────
  "B04-01": ["Jig and fixture setup", "Roof frame member tack & full welding", "Weld inspection"],
  "B04-02": ["Repair welding of roof panel framework defects", "Grind repair welds", "Inspect"],
  "B04-03": ["Turn over roof panel framework", "Repair welding of underside", "Alignment check"],
  "B04-04": ["Grind roof framework welds", "Alignment correction", "Cleaning"],
  "B04-05": ["Top panel stretcher setup", "Stretch panel to profile", "Dimension check"],
  "B04-06": ["Position escape hatch frame", "Weld escape hatch frame", "Inspect and grind"],
  "B04-07": ["Repair weld roof panel assembly", "Grinding and alignment", "Inspection and storage"],
  "B05-01": ["Jig setup", "Right side wall framework tack & full welding", "Weld inspection"],
  "B05-02": ["Repair welding of right side wall defects", "Grind welds", "Inspect"],
  "B05-03": ["Turn over right side wall framework", "Repair welding of underside", "Alignment check"],
  "B05-04": ["Grind and straighten right side wall", "Correction welding if required", "Inspect"],
  "B06-01": ["Jig setup", "Left side wall framework tack & full welding", "Weld inspection"],
  "B06-02": ["Repair welding of left side wall defects", "Grind welds", "Inspect"],
  "B06-03": ["Turn over left side wall framework", "Repair welding of underside", "Alignment check"],
  "B06-04": ["Grind and straighten left side wall", "Correction welding if required", "Inspect"],
  "B07-01": ["Rear face framework tack & full welding", "Weld inspection"],
  "B07-02": ["Repair welding & correction of rear face framework", "Inspect"],
  "B07-03": ["Position and weld rear panel", "Weld inspection"],
  "B07-04": ["Repair welding of rear face", "Grinding", "Storage of rear face assembly"],
  "B08-01": ["Front face frame tack & full welding", "Weld inspection"],
  "B08-02": ["Repair welding & correction of front face framework", "Inspect"],
  "B08-03": ["Position and weld front panel", "Weld inspection"],
  "B08-04": ["Repair welding of front face", "Grinding", "Storage of front face assembly"],
  "B09-01": ["Frame parts sub-assembly tack & full welding", "Weld inspection"],
  "B09-02": ["Integration welding of complete frame assembly", "Alignment check"],
  "B09-03": ["Repair welding of frame assembly defects", "Weld inspection"],
  "B09-04": ["Install frame accessories (brackets, inserts, plates)", "Torque and fit check"],
  "B09-05": ["Grind frame assembly welds", "Alignment measurement and correction"],
  "B09-06": ["Final inspection of frame assembly", "Defect logging", "Storage and labelling"],
  // ── Electrophoresis (shared) ────────────────────────────────────────────────
  "E01-01": ["Pre-degreasing dip", "Bath concentration & temperature check"],
  "E01-02": ["Degreasing dip", "Bath concentration & temperature check"],
  "E01-03": ["Washing 1 (rinse)", "Rinse water quality check"],
  "E01-04": ["Washing 2 (rinse)", "Rinse water quality check"],
  "E01-05": ["Transfer to next stage"],
  "E01-06": ["Pure water wash 1", "Conductivity check"],
  "E01-07": ["Silane treatment", "Bath concentration check"],
  "E01-08": ["Pure water wash 2", "Conductivity check"],
  "E01-09": ["Pure water washing 3", "Conductivity check"],
  "E01-10": ["Transfer to electrophoresis"],
  "E02-01": ["Electrophoresis (e-coat) dip", "Voltage & bath parameter monitoring"],
  "E02-02": ["UF1 ultrafiltrate rinse"],
  "E02-03": ["UF2 ultrafiltrate rinse"],
  "E02-04": ["Pure water wash 4", "Conductivity check"],
  "E02-05": ["Electrophoresis drying (oven cure)", "Film thickness check"],

  // ── Frame & Body Welding — EVS ──────────────────────────────────────────────
  "EVS:WQ-01": ["Quality gate inspection", "Defect identification and logging", "Sign-off"],
  "EVS:WQ-02": ["Quality gate inspection", "Defect identification and logging", "Sign-off"],
  "EVS:W01-01": ["Six parts merging and alignment", "Structural fit checks"],
  "EVS:W01-02": ["Installation of passenger door step", "Installation of additional chassis infuse profiles"],
  "EVS:W01-03": ["Full welding", "Grinding", "Weld bead protection"],
  "EVS:W01-04": ["Welding of chassis frame profiles", "Welding of brackets", "Welding of inner sealing plates"],
  "EVS:W01-05": ["Welding of exterior sealing plate and additional brackets", "Grinding", "Application of sealant"],
  "EVS:W01-06": ["Installation of fibre roof", "Installation of A/C bolts", "Installation of cargo rack and ladder bolts (7m EVS)"],
  "EVS:W01-07": ["Transfer to next station"],
  "EVS:W01-08": ["Side panel extension", "Side panel trimming"],
  "EVS:W01-09": ["Installation of passenger door frames", "Installation of door actuator"],
  "EVS:W01-10": ["External side frame installation", "Side fibre strips installation", "Side marker light installation", "Camera hole installation"],
  "EVS:W01-11": ["Installation of compartment doors", "Fascia bumper alignment"],
  "EVS:W01-12": ["Underbody welding", "Sealant application"],
  "EVS:W01-13": ["Rectification of logged defects"],
  "EVS:W01-14": ["Quality gate (WQ-03)", "Defect rectification", "Sign-off"],
  // ── Frame & Body Welding — KDC ──────────────────────────────────────────────
  "KDC:W01-01a": ["Integration of back seat to U-hoop web frame", "Integration of back seat brackets to U-hoop web frame", "Integration of engine heat shield to U-hoop web frame", "Integration of floor sub-frame seal plates and rear fascia to U-hoop web frame"],
  "KDC:WQ-01": ["Quality gate inspection", "Defect identification and logging", "Sign-off"],
  "KDC:W01-01b": ["Integration of U-hoop web frame to the chassis frame assembly", "Integration of driver-cabin floor frame to the chassis frame assembly", "Integration of chassis infuses to the chassis frame assembly", "Integration of front fascia to the chassis frame assembly"],
  "KDC:WQ-02": ["Quality gate inspection", "Defect identification and logging", "Sign-off"],
  "KDC:W01-02": ["Coach frame alignment", "Installation of passenger door step", "Installation of additional chassis infuse profiles"],
  "KDC:W01-03": ["Full welding", "Grinding", "Weld bead protection"],
  "KDC:W01-04": ["Welding of attachment brackets", "Welding of sealing plates"],
  "KDC:W01-05": ["Additional welding of seal plates", "Welding of attachment brackets", "Application of sealant"],
  "KDC:W01-06": ["Installation of fibre roof", "Installation of A/C bolts"],
  "KDC:W01-07": ["Transfer to next station"],
  "KDC:W01-08": ["Side panel extension", "Side panel trimming"],
  "KDC:W01-09": ["Installation of passenger door frames", "Installation of door actuator"],
  "KDC:W01-10": ["External side frame installation", "Side fibre strips installation", "Side marker light installation"],
  "KDC:W01-11": ["Installation of compartment doors", "Fascia bumper alignment"],
  "KDC:W01-12": ["Underbody welding", "Sealant application"],
  "KDC:W01-13": ["Rectification of logged defects"],
  "KDC:W01-14": ["Quality gate (WQ-03)", "Defect rectification", "Sign-off"],

  // ── Chassis Line 01 — EVS ───────────────────────────────────────────────────
  "EVS:CQ-01": ["Chassis frame defects check", "Rectification buffer", "Pre-chassis assembly"],
  "EVS:C01-01": ["VIN engraving", "Installation of LV underbody wiring harnesses"],
  "EVS:C01-02": ["Installation of chassis air tanks", "Installation of air pipes", "Installation of braking systems"],
  "EVS:C01-02-01": ["Sub-assembly build", "Quality check"],
  "EVS:C01-03": ["Installation of steering system"],
  "EVS:C01-04": ["Air tanks, valves, brake pedals, ABS valves & pipes sub-assembly"],
  "EVS:C01-04-01": ["Wiring harness sub-assembly build", "Continuity & quality check"],
  "EVS:CQ-02": ["Quality gate inspection", "Defect logging", "Sign-off"],
  // ── Chassis Line 01 — KDC ───────────────────────────────────────────────────
  "KDC:CQ-01": ["Chassis frame defects check", "Rectification buffer", "Pre-chassis assembly"],
  "KDC:C01-01": ["VIN engraving"],
  "KDC:C01-02": ["Installation of chassis air tanks, air pipes and braking systems", "Installation of nylon pipes", "Installation of gear selector cable", "Installation of hydraulic pipes"],
  "KDC:C01-02-01": ["Air tanks sub-assembly build", "Quality check"],
  "KDC:C01-03": ["Installation of steering system", "Installation of gear lever cables", "Installation of clutch radiator", "Installation of tyre bracket"],
  "KDC:C01-01-01": ["Radiator-fan assembly build", "Mounting hardware check"],
  "KDC:C01-04": ["Installation of low voltage underbody wiring harness"],
  "KDC:C01-04-01": ["Wiring harness sub-assembly build", "Continuity & quality check"],
  "KDC:CQ-02": ["Quality gate inspection", "Defect logging", "Sign-off"],

  // ── Chassis Line 02 — EVS ───────────────────────────────────────────────────
  "EVS:C02-01": ["Installation of HV harnesses", "Installation of TPMS modules", "Installation of fire extinguishers", "LV harness routing"],
  "EVS:C02-02": ["Installation of motor", "Installation of HV batteries"],
  "EVS:C02-03": ["Installation of front and rear axles", "Installation of suspensions", "Installation of air bellow shock absorbers (if necessary)"],
  "EVS:C02-03-01": ["Axles sub-assembly build", "Axle oil filling"],
  "EVS:C02-04": ["Installation of air compressor", "Installation of radiator", "Installation of air dryer", "Installation of the PDU", "Installation of the MCU"],
  "EVS:C02-05": ["Termination of HV battery accessories", "Termination of ABS", "Termination of speed and brake-wear sensors"],
  "EVS:C02-06": ["Installation of wheel arch profile", "Installation of customer tyres"],
  "EVS:C02-06-01": ["Tyre sub-assembly build", "Wheel balancing"],
  "EVS:C02-07": ["Torquing", "Pressure balancing of customer tyres"],
  // ── Chassis Line 02 — KDC ───────────────────────────────────────────────────
  "KDC:C02-01": ["Installation of TPMS modules and fire extinguisher", "Installation of rear LV", "Installation of A/C", "Installation of starter motor", "Wiring harness routing"],
  "KDC:C02-02": ["Installation of diesel engine and gear box", "Termination of engine accessories"],
  "KDC:C02-03": ["Installation of engine cooling and fuel system"],
  "KDC:C02-04-01": ["Axles sub-assembly build", "Axle oil filling"],
  "KDC:C02-04": ["Installation of front and rear axles", "Installation of suspensions", "Installation of shock absorbers"],
  "KDC:C02-05": ["Pneumatic system and steering system completion", "Installation of driver floor board", "Bleeding of clutch system", "Routing and termination of ABS", "Routing and termination of speed and brake-wear sensors"],
  "KDC:C02-06": ["Installation of air cleaner", "Installation of air intake", "Installation of emissions system and silencer"],
  "KDC:C02-07-01": ["Tyre sub-assembly build", "Wheel balancing"],
  "KDC:C02-07": ["Installation of tyres"],

  // ── Paint Shop (shared, with model-specific P07-02) ─────────────────────────
  "P01-01": ["Bus body panel masking", "Glass & trim protection"],
  "P01-02": ["Foaming application", "Foam trimming"],
  "P01-03": ["Underbody anti-corrosion painting", "Coverage inspection"],
  "P02-01": ["Body panel surface grinding and sanding", "Surface uniformity check"],
  "P02-02": ["Ground body manual surface-cleaning"],
  "P02-03": ["Epoxy primer painting", "Coverage inspection"],
  "P02-04": ["Epoxy primer drying"],
  "P02-05": ["Epoxy primer polishing"],
  "P03-01": ["Panel beating", "Filler and fibre application"],
  "P03-02": ["Filler and fibre polishing"],
  "P03-03": ["Filler polish manual surface-cleaning"],
  "P04-01": ["NC primer painting"],
  "P04-02": ["NC primer drying"],
  "P05-01": ["Defects rectification"],
  "P05-02": ["Putty application and drying"],
  "P05-03": ["Putty polishing"],
  "P05-04": ["Putty polish manual surface-cleaning"],
  "PQ-01": ["Paint inspection", "Defect marking", "Sign-off"],
  "P06-01": ["Intermediate coat painting", "Coverage inspection"],
  "P06-02": ["Intermediate coat paint-drying"],
  "P06-03": ["Intermediate coat polishing"],
  "P07-01": ["AutoCryl topcoat painting", "Wet film thickness check"],
  "EVS:P07-02": ["AutoCryl topcoat paint-drying"],
  "KDC:P07-02": ["Clear coat painting"],
  "P07-03": ["TopCoat paint-drying"],
  "P08-01": ["Color strip and pattern masking"],
  "P08-02": ["Color strip and pattern painting"],
  "P08-03": ["Color strip and pattern drying"],
  "P08-04": ["Color strip and pattern unmasking"],
  "PQ-02": ["Finishing and inspection", "Colour match verification", "Sign-off"],

  // ── Trim Line — EVS ─────────────────────────────────────────────────────────
  "EVS:T01-01": ["Installation of floor boards", "Installation of A/C", "Installation of heat shield"],
  "EVS:T01-01-01": ["Floorboard preparation (sub-assembly)"],
  "EVS:T01-02": ["Carpet installation"],
  "EVS:T01-02 EE": ["Installation and termination of HV components"],
  "EVS:T01-02-01": ["Carpets preparation (sub-assembly)"],
  "EVS:T01-03": ["Carpet welding", "A/C installation", "A/C accessories installation", "Side board aluminium profiles", "Escape hatch installation"],
  "EVS:T01-03 EE": ["Installation of cooling pipes", "Installation of antenna", "Installation of height marker lights", "Installation of ceiling, front wall and dashboard harness", "A/C terminations"],
  "EVS:T01-03-01": ["A/C sub-assembly"],
  "EVS:T01-04": ["Installation of roof boards", "Installation of side boards", "Installation of airducts", "Installation of pneumatic pipes", "Installation of front and rear mould", "Installation of left/right panel", "Latch cable preparation"],
  "EVS:T01-04 EE": ["Installation of front wall and front compartment components", "Routing and termination"],
  "EVS:T01-04-01": ["Dashboard, roof and air duct preparation (sub-assembly)"],
  "EVS:T01-05": ["Installation of side glass"],
  "EVS:T01-06": ["Installation of dashboard", "Installation of front and rear windshields", "Installation of steps aluminium floor profiles", "Installation of airduct doors", "Installation of waist beam cover and rear side panels"],
  "EVS:T01-06 EE": ["Exterior lights installation and termination"],
  "EVS:T01-07": ["Installation of poles", "Installation of column covers", "Installation of curtain rails", "Installation of E-valves", "Installation of E-hammers", "Installation of A/C air grille and curtains", "Installation of rubber for aluminium", "Side glass sealant application"],
  "EVS:T01-07 EE": ["Installation of final dashboard components", "Installation of display screens"],
  "EVS:T01-08": ["Installation of driver seat", "Installation of driver cabins", "Installation of barriers", "Installation of sun visor rods", "Installation of seat brackets", "Installation of inspection cover", "Installation of steering column cover", "Placement of fire extinguisher, trash-can", "Installation of water rails and false roof panel"],
  "EVS:T01-08 EE": ["Installation of interior cameras and speakers"],
  "EVS:T01-09": ["Installation of passenger door and locks", "Installation of exterior body accessories", "Installation of side mirrors, dampers and wipers", "Compartment door sealant application, aluminium strips"],
  "EVS:T01-09-01": ["Passenger doors sub-assembly"],
  "EVS:T01-10": ["Installation of seats", "Filling oils, coolant and mechanical checks"],
  "EVS:T01-10 EE": ["Installation of BMS", "Installation of USB", "Installation of steering column and side cameras"],
  "EVS:T01-10-01": ["Electrical system sub-assembly"],
  "EVS:T01-11 EE": ["First start, testing and debugging", "Calibration of the camera"],
  "EVS:T01-11": ["ECAS", "Fine tuning of passenger doors"],
  "EVS:T01-12": ["Quality inspection and rectification (TQ-01)"],
  // ── Trim Line — KDC ─────────────────────────────────────────────────────────
  "KDC:T01-01": ["Installation of floor boards", "Installation of A/C and heat shield"],
  "KDC:T01-01 EE": ["Installation of rear wall and rear side compartment components"],
  "KDC:T01-01-01": ["Floorboard preparation (sub-assembly)"],
  "KDC:T01-02": ["Carpet installation"],
  "KDC:T01-02-01": ["Carpets preparation (sub-assembly)"],
  "KDC:T01-03": ["Carpet welding", "A/C installation", "A/C accessories installation", "Side board aluminium profiles", "Escape hatch installation"],
  "KDC:T01-03 EE": ["Installation of cooling pipes", "Installation of antenna", "Installation of height marker lights", "Installation of ceiling", "Installation of front wall and dashboard harness", "A/C terminations"],
  "KDC:T01-03-01": ["A/C sub-assembly"],
  "KDC:T01-04": ["Installation of roof boards", "Installation of side boards", "Installation of airducts", "Installation of pneumatic pipes", "Installation of front and rear mould", "Installation of left/right panel", "Latch cable preparation"],
  "KDC:T01-04 EE": ["Installation of front wall and front compartment components", "Routing and termination"],
  "KDC:T01-04-01": ["Dashboard, roof and air duct preparation (sub-assembly)"],
  "KDC:T01-05": ["Installation of side glass"],
  "KDC:T01-06": ["Installation of dashboard", "Installation of front and rear windshields", "Installation of steps aluminium floor profiles", "Installation of airduct doors", "Installation of rear side panels"],
  "KDC:T01-06 EE": ["Exterior lights installation and termination", "Installation of front camera and step decorative lights"],
  "KDC:T01-07": ["Installation of step poles", "Installation of pillar and waist beam column covers", "Installation of side mirror brackets and water rails", "Installation of curtain rails", "Installation of E-valves", "Installation of A/C air grille and curtains", "Installation of rubber for aluminium", "Side glass sealant application"],
  "KDC:T01-07 EE": ["Installation of dashboard accessories", "Installation of display screens"],
  "KDC:T01-08": ["Installation of driver seat", "Installation of driver cabins", "Installation of driver guard rail", "Installation of barriers", "Installation of sun visor rods", "Installation of seat brackets", "Installation of inspection cover", "Installation of steering column cover", "Placement of fire extinguisher, trash-can", "Installation of false roof panel", "Installation of rear seats"],
  "KDC:T01-08 EE": ["Installation of speakers/reading lights", "Installation of interior cameras"],
  "KDC:T01-09": ["Installation of passenger door and locks", "Installation of exterior body accessories", "Installation of side mirrors, dampers and wipers", "Compartment door sealant application, aluminium strips"],
  "KDC:T01-09 EE": ["Installation of interior EE components", "Installation of lighting systems"],
  "KDC:T01-09-01": ["Passenger doors sub-assembly"],
  "KDC:T01-10": ["Installation of passenger seats", "Filling oils, coolant and mechanical checks"],
  "KDC:T01-10 EE": ["Installation of accelerator pedal", "Installation of USB harness", "Steering column assembly", "Installation of exterior camera", "Underbody routing and termination"],
  "KDC:T01-10-01": ["Electrical system sub-assembly"],
  "KDC:T01-11 EE": ["First start, testing and debugging", "Calibration of the camera"],
  "KDC:T01-11": ["A/C refilling", "Rubber from aluminium", "Fine tuning passenger doors", "Quality inspection and rectification"],

  // ── Quality Inspection & Testing (shared, with model-specific Q01-02) ───────
  "Q01-01": ["Test registration", "Pre-test checklist"],
  "EVS:Q01-02": ["Speed test on rollers", "Pass/fail recording"],
  "KDC:Q01-02": ["Vehicle exhaust emission test", "Speed test on rollers", "Pass/fail recording"],
  "Q01-03": ["Wheel alignment measurement", "Adjustment if required"],
  "Q01-04": ["Sound level inspection", "Pass/fail recording"],
  "Q01-05": ["Head lamp aim alignment", "Adjustment if required"],
  "Q01-06": ["Side slip test", "Pass/fail recording"],
  "Q01-07": ["Axle load and brake test", "Pass/fail recording"],
  "Q01-08": ["Test report generation", "Sign-off"],
  "Q01-09": ["Defects rectification", "Re-test if required"],
  "Q01-10": ["Chassis anti-corrosion application", "Underbody plastic primer application"],
  "Q01-11": ["Paint inspection", "Defect marking"],
  "Q01-12": ["Paint repair and drying"],
  "Q01-13": ["Rain test / water intrusion check", "Leak logging"],
  "Q01-14": ["Defects rectification", "Re-test if required"],
  "Q01-15": ["Road test / whole vehicle dynamic test", "Result recording"],
  "Q01-16": ["Inspection / decision gate", "Underbody inspection", "Pass/fail decision"],
  "Washing Bay": ["Washing and cleaning the bus", "Presentability check"],
  "Q01-17": ["Defects rectification", "Final sign-off"],
};

// ── Consumables / materials per station (travel card) ─────────────────────────
// Keyed by the exact travel-card line label, then station code.
export const RES = {
  "Machine Shop": {
    "B01-02": ["Band Saw Blade", "Coolant", "Deburring Tool"],
    "B01-03": ["Laser Cutting Nozzle", "Cutting Gas (O₂/N₂)"],
    "B01-04": ["Circular Saw Blade", "Coolant"],
    "B02-01": ["Laser Cutting Nozzle", "Cutting Gas (O₂/N₂)"],
    "B02-06": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm"],
  },
  "Frame Parts Making": {
    "B04-01": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm"],
    "B05-01": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm"],
    "B06-01": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm"],
    "B07-01": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm"],
    "B08-01": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm"],
    "B09-01": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm"],
  },
  "Frame & Body Welding — EVS": {
    "W01-03": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm", "Weld Bead Protection Compound (L)"],
    "W01-04": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Chassis Frame Profiles", "Sealing Plates (pcs)"],
    "W01-05": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Brackets (pcs)", "Silicon Sealant (ml)"],
    "W01-06": ["Fibre Roof", "A/C Bolts", "Cargo Rack & Ladder Bolts", "Silicon Sealant (ml)", "Rivets (pcs)"],
    "W01-12": ["Underbody Sealant (ml)", "Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)"],
  },
  "Frame & Body Welding — KDC": {
    "W01-01a": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Heat Shield", "Seal Plates (pcs)"],
    "W01-01b": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Chassis Infuse Profiles"],
    "W01-03": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Grinding Disc 115mm", "Weld Bead Protection Compound (L)"],
    "W01-04": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Attachment Brackets (pcs)", "Sealing Plates (pcs)"],
    "W01-05": ["Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)", "Seal Plates (pcs)", "Silicon Sealant (ml)"],
    "W01-06": ["Fibre Roof", "A/C Bolts", "Silicon Sealant (ml)", "Rivets (pcs)"],
    "W01-12": ["Underbody Sealant (ml)", "Welding Wire ER70S-6 (kg)", "CO₂ Gas (L)"],
  },
  "Chassis Line 01 — EVS": {
    "C01-01": ["VIN Engraving Tool Tip", "Cable Ties (pack)", "Split Loom 20mm (m)"],
    "C01-02": ["Air Tanks", "Air Pipes (m)", "Brake Components", "Fittings & Clamp Set"],
    "C01-03": ["Steering Components", "Mounting Bolts M12", "Thread Lock (ml)"],
    "C01-04": ["Air Tank Valves", "Brake Pedals", "ABS Valves", "Mounting Bolts M10"],
  },
  "Chassis Line 01 — KDC": {
    "C01-01": ["VIN Engraving Tool Tip"],
    "C01-02": ["Air Tanks", "Nylon Pipe 8mm (m)", "Nylon Pipe 10mm (m)", "Gear Selector Cable", "Hydraulic Pipe (m)", "Fittings & Clamp Set"],
    "C01-03": ["Steering Components", "Gear Lever Cables", "Clutch Radiator", "Tyre Bracket", "Mounting Bolts M12"],
    "C01-01-01": ["Radiator Unit", "Fan Blade Set", "Mounting Hardware"],
    "C01-04": ["LV Underbody Wiring Harness", "Cable Ties (pack)"],
  },
  "Chassis Line 02 — EVS": {
    "C02-01": ["HV Harness Set", "TPMS Sensor Set", "Fire Extinguisher Bracket", "Cable Ties (pack)"],
    "C02-02": ["Motor Mounting Hardware", "HV Batteries", "Thread Lock (ml)"],
    "C02-03": ["Front & Rear Axles", "Suspensions", "Air Bellow Shock Absorbers", "Thread Lock (ml)"],
    "C02-04": ["Air Compressor", "Radiator", "Air Dryer", "PDU", "MCU"],
    "C02-06": ["Wheel Arch Profile Set", "Customer Tyres"],
    "C02-07": ["Torque Wrench", "Tyre Pressure Gauge"],
  },
  "Chassis Line 02 — KDC": {
    "C02-01": ["TPMS Sensor Set", "Fire Extinguisher", "Rear LV Harness", "A/C Components", "Starter Motor", "Cable Ties (pack)"],
    "C02-02": ["Diesel Engine", "Gear Box", "Gasket Set", "Mounting Bolts M16"],
    "C02-03": ["Coolant Pipe (m)", "Fuel Line (m)", "Fuel Connectors"],
    "C02-04": ["Front & Rear Axles", "Suspensions", "Shock Absorbers", "Thread Lock (ml)"],
    "C02-06": ["Air Cleaner Kit", "Air Intake", "Emissions System", "Silencer", "Exhaust Clamps"],
    "C02-07": ["Customer Tyres", "Valve Cores"],
  },
  "Paint Shop": {
    "P01-01": ["Masking Tape 25mm (roll)", "Masking Tape 50mm (roll)", "Masking Paper (m)"],
    "P01-02": ["PU Foam Canister", "Utility Knife"],
    "P01-03": ["Anti-Corrosion Primer (L)", "Applicator Brush", "Respirator Cartridge"],
    "P02-01": ["Grinding Disc 115mm", "DA Sander Pad 150mm", "Sandpaper 80 grit", "Sandpaper 120 grit"],
    "P02-03": ["Epoxy Primer (L)", "Hardener (L)", "Thinner (L)", "Spray Gun Tip 1.4mm"],
    "P03-01": ["Body Filler (kg)", "Glass Fibre Mat (m²)", "Polyester Resin (L)", "Body Hammer Set"],
    "P04-01": ["NC Primer (L)", "NC Thinner (L)", "Spray Gun Tip 1.6mm"],
    "P05-02": ["Spot Putty (kg)", "Spreading Knife"],
    "P06-01": ["Intermediate Coat Paint (L)", "Hardener (L)", "Thinner (L)", "Spray Gun Tip 1.4mm"],
    "P07-01": ["AutoCryl Top Coat (L)", "Hardener (L)", "Thinner (L)", "Spray Gun Tip 1.3mm"],
    "P07-03": ["(KDC) Clear Coat (L)", "Hardener (L)", "Thinner (L)"],
    "P08-02": ["Colour Strip Paint (L)", "Thinner (L)", "Spray Gun Tip 1.2mm"],
    "PQ-02": ["Inspection Light", "Touch-up Paint (ml)", "Polish Compound (g)", "Buffer Pad"],
  },
  "Trim Line & Final Assembly — EVS": {
    "T01-02 EE": ["HV Component Set", "Connector Pins", "Cable Ties (pack)"],
    "T01-10 EE": ["BMS Unit", "USB Harness", "Side Cameras", "Cable Ties (pack)"],
  },
  "Trim Line & Final Assembly — KDC": {
    "T01-09 EE": ["Interior EE Components", "Lighting Systems", "Cable Ties (pack)"],
    "T01-10 EE": ["Accelerator Pedal", "USB Harness", "Exterior Camera", "Cable Ties (pack)"],
  },
};

const SIX = [
  { m: "Man", icon: "👤", d: "Operator skill, fatigue, attendance", subs: ["Skill gap / lack of training","Fatigue or health issue","Absenteeism / understaffing","Incorrect method used","Communication failure"] },
  { m: "Machine", icon: "🔧", d: "Equipment, tooling, fixtures", subs: ["Machine breakdown","Tooling failure","Fixture misalignment","Calibration issue","Machine setup delay"] },
  { m: "Method", icon: "📋", d: "Process, sequence, instructions", subs: ["Incorrect work sequence","Missing work instruction","Outdated procedure","Process not followed","Design / engineering issue"] },
  { m: "Material", icon: "📦", d: "Parts, consumables, supply", subs: ["Material shortage","Wrong material delivered","Defective incoming part","Consumable exhausted","Material handling delay"] },
  { m: "Measurement", icon: "📐", d: "Inspection, gauging, data", subs: ["Gauge / instrument error","Measurement method incorrect","Inspection delay","Tolerance issue","Documentation error"] },
  { m: "Mother Nature", icon: "🌦", d: "Environment, temperature, power", subs: ["High ambient temperature","Humidity / moisture issue","Power fluctuation / outage","Poor ventilation","External noise or vibration"] },
];

import { useState, useEffect } from "react";
import { buildStationReportPDF, buildBusReportPDF } from '../export/buildTravelCardPDF';
import { fetchLogoBase64 } from '../export/exportHelpers';

// ── Theme ─────────────────────────────────────────────────────────────────────
const R = "#dc2626";
const RA = "rgba(220,38,38,0.12)";
const RB = "rgba(220,38,38,0.3)";
const GR = "#10b981";
const AM = "#f59e0b";

function makeTheme(isDark) {
  return isDark ? {
    bg:       "rgba(7,9,15,0.82)",
    card:     "rgba(13,21,38,0.88)",
    border:   "rgba(255,255,255,0.08)",
    borderHi: "rgba(255,255,255,0.16)",
    text:     "#e2e8f0",
    muted:    "#94a3b8",
    dim:      "#64748b",
    dimmer:   "#475569",
    fm:       "'Inter', system-ui, sans-serif",
    mono:     "'Inter', system-ui, sans-serif",
    topbar:   "rgba(7,9,15,0.90)",
    inpBg:    "#0d1526",
    inpBor:   "rgba(255,255,255,0.10)",
  } : {
    bg:       "rgba(255,255,255,0.88)",
    card:     "rgba(255,255,255,0.95)",
    border:   "rgba(0,0,0,0.09)",
    borderHi: "rgba(0,0,0,0.18)",
    text:     "#1e293b",
    muted:    "#475569",
    dim:      "#64748b",
    dimmer:   "#94a3b8",
    fm:       "'Inter', system-ui, sans-serif",
    mono:     "'Inter', system-ui, sans-serif",
    topbar:   "rgba(255,255,255,0.92)",
    inpBg:    "#f8fafc",
    inpBor:   "rgba(0,0,0,0.12)",
  };
}

// Placeholder — overridden inside component with theme-aware values
let T = makeTheme(true);
let INP_BG  = T.inpBg;
let INP_BOR = T.inpBor;
const INP_FOC = "rgba(220,38,38,0.45)";

const css = {
  wrap:    { maxWidth: 680, margin: "0 auto", padding: "0 0 100px", fontFamily: T.fm, fontSize: 14, color: T.text, background: T.bg, boxSizing: 'border-box' },
  topbar:  { display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${T.border}`, marginBottom: 20, background: T.topbar, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", position: "sticky", top: 0, zIndex: 10 },
  logo:    { height: 36, width: "auto", objectFit: "contain" },
  t1:      { fontSize: 17, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.text },
  t2:      { fontSize: 10, color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.06em", marginTop: 2 },
  segsWrap:{ display: "flex", gap: 3, marginBottom: 5, padding: "0 20px" },
  seg:     { flex: 1, height: 2, borderRadius: 1, background: T.border, transition: "background .3s" },
  segDone: { background: GR },
  segAct:  { background: R },
  lblsWrap:{ display: "flex", marginBottom: 22, padding: "0 20px" },
  lbl:     { flex: 1, fontSize: 9, textAlign: "center", color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" },
  lblAct:  { color: T.text, fontWeight: 600 },
  lblDone: { color: T.dim },
  card:    { border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px 20px", marginBottom: 14, background: T.card, margin: "0 20px 14px" },
  cardHd:  { fontSize: 9, fontWeight: 600, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: T.mono, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` },
  fld:     { marginBottom: 14 },
  lbl_:    { display: "block", fontSize: 10, color: T.muted, fontFamily: T.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 },
  inp:     { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: T.fm, colorScheme: "dark", transition: "border-color .15s" },
  ta:      { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", resize: "vertical", minHeight: 64, boxSizing: "border-box", fontFamily: T.fm, colorScheme: "dark" },
  g2:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tagRow:  { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 },
  tag:     { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 10px", borderRadius: 3, border: `1px solid rgba(220,38,38,0.3)`, background: "rgba(220,38,38,0.07)", color: "#fca5a5", fontFamily: T.mono },
  tagX:    { background: "none", border: "none", cursor: "pointer", color: "#fca5a5", fontSize: 14, lineHeight: 1, padding: "0 0 0 3px" },
  addRow:  { display: "flex", gap: 6, marginTop: 8 },
  addInp:  { flex: 1, fontSize: 12, padding: "7px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", fontFamily: T.fm, colorScheme: "dark" },
  addBtn:  { fontSize: 11, padding: "7px 13px", border: `1px solid ${RB}`, borderRadius: 4, background: "rgba(220,38,38,0.08)", color: R, cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.06em", flexShrink: 0, transition: "background .15s" },
  cbGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 },
  cbItem:  { display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, cursor: "pointer", color: T.muted },
  actRow:  { display: "grid", gridTemplateColumns: "1fr 140px", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` },
  actName: { fontSize: 12, color: T.muted, lineHeight: 1.4 },
  stSel:   { fontSize: 11, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 3, background: INP_BG, color: T.text, cursor: "pointer", width: "100%", fontFamily: T.mono, colorScheme: "dark" },
  resRow:  { display: "grid", gridTemplateColumns: "1fr 70px", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.border}` },
  resName: { fontSize: 12, color: T.muted },
  qty:     { width: 70, fontSize: 12, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, textAlign: "center", outline: "none", fontFamily: T.mono, colorScheme: "dark" },
  togWrap: { display: "flex", alignItems: "center", gap: 10 },
  banner:  { display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", borderRadius: 6, marginBottom: 14, background: "rgba(245,158,11,0.08)", border: `1px solid rgba(245,158,11,0.25)`, margin: "0 20px 14px" },
  stat3:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "0 20px 14px" },
  statC:   { borderRadius: 6, padding: 12, textAlign: "center", background: T.card, border: `1px solid ${T.border}` },
  statV:   { fontSize: 28, fontWeight: 700, letterSpacing: "0.04em" },
  statL:   { fontSize: 9, color: T.dimmer, fontFamily: T.mono, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.1em" },
  sixGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  mCard:   { border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 13px", cursor: "pointer", transition: "border-color .15s", background: "rgba(255,255,255,0.02)" },
  mCardSel:{ border: `1px solid ${R}`, background: RA },
  mTitle:  { fontSize: 13, fontWeight: 700, letterSpacing: "0.06em" },
  mSub:    { fontSize: 10, color: T.dim, marginTop: 3, fontFamily: T.mono },
  subSec:  { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` },
  subHd:   { fontSize: 9, color: T.dimmer, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 },
  pill:    { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "4px 12px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: GR, border: "1px solid rgba(16,185,129,0.25)", fontFamily: T.mono },
  confC:   { background: T.card, borderRadius: 6, padding: 16, margin: "0 20px 14px", border: `1px solid ${T.border}` },
  confRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, gap: 10 },
  confLbl: { color: T.dim, flexShrink: 0, fontFamily: T.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" },
  confVal: { fontWeight: 600, textAlign: "right", maxWidth: "60%", wordBreak: "break-word", color: T.text },
  btnP:    { width: "100%", padding: "11px 0", background: R, color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: T.fm },
  btnS:    { width: "100%", padding: "10px 0", background: "transparent", color: T.muted, border: `1px solid ${INP_BOR}`, borderRadius: 4, fontSize: 13, cursor: "pointer", marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fm },
  btnDl:   { width: "100%", padding: "10px 0", background: "rgba(16,185,129,0.1)", color: GR, border: "1px solid rgba(16,185,129,0.3)", borderRadius: 4, fontSize: 13, cursor: "pointer", marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fm, fontWeight: 700 },
  nav2:    { display: "flex", gap: 8, marginTop: 12, padding: "0 20px" },
  note:    { fontSize: 10, color: T.dimmer, fontFamily: T.mono, marginTop: 4 },
  evsBox:  { textAlign: "center", padding: "32px 16px" },
  px:      { padding: "0 20px" },
  statusOk:  { color: GR },
  statusWarn:{ color: AM },
  statusErr: { color: R },
};

function Inp({ label, hint, ...p }) {
  return (
    <div style={css.fld}>
      {label && <label style={css.lbl_}>{label}</label>}
      <input style={css.inp} {...p} />
      {hint && <div style={css.note}>{hint}</div>}
    </div>
  );
}
function Sel({ label, children, ...p }) {
  return (
    <div style={css.fld}>
      {label && <label style={css.lbl_}>{label}</label>}
      <select style={css.inp} {...p}>{children}</select>
    </div>
  );
}
function Tag({ label, onDel }) {
  return (
    <div style={css.tag}>
      {label}
      {onDel && <button style={css.tagX} onClick={onDel}>×</button>}
    </div>
  );
}
function AddRow({ placeholder, onAdd }) {
  const [v, setV] = useState("");
  return (
    <div style={css.addRow}>
      <input style={css.addInp} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={e => e.key === "Enter" && (onAdd(v), setV(""))} />
      <button style={css.addBtn} onClick={() => { onAdd(v); setV(""); }}>+ ADD</button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TravelCard({ prefillVin = "", prefillModel = "", prefillStation = "", onReset, onSubmitSuccess, theme = "dark", catalog = {}, role = "user" }) {
  const isAdmin = role === "systemadmin" || role === "useradmin";
  // Recompute theme tokens on every render so styles react to theme changes
  T = makeTheme(theme === 'dark');
  INP_BG  = T.inpBg;
  INP_BOR = T.inpBor;

  // Rebuild css after T is updated
  css.wrap    = { maxWidth: 680, margin: "0 auto", padding: "0 0 100px", fontFamily: T.fm, fontSize: 14, color: T.text, background: T.bg };
  css.topbar  = { display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${T.border}`, marginBottom: 20, background: T.topbar, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap" };
  css.t2      = { fontSize: 10, color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.06em", marginTop: 2 };
  css.lbl_    = { display: "block", fontSize: 10, color: T.muted, fontFamily: T.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 };
  css.inp     = { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: T.fm, colorScheme: theme === 'dark' ? "dark" : "light", transition: "border-color .15s" };
  css.ta      = { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", resize: "vertical", minHeight: 64, boxSizing: "border-box", fontFamily: T.fm, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.stSel   = { fontSize: 11, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 3, background: INP_BG, color: T.text, cursor: "pointer", width: "100%", fontFamily: T.mono, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.qty     = { width: 70, fontSize: 12, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, textAlign: "center", outline: "none", fontFamily: T.mono, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.addInp  = { flex: 1, fontSize: 12, padding: "7px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", fontFamily: T.fm, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.cbItem  = { display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, cursor: "pointer", color: T.muted };
  css.card    = { border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px 20px", marginBottom: 14, background: T.card, margin: "0 20px 14px" };
  css.actRow  = { display: "grid", gridTemplateColumns: "1fr 140px", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` };
  css.actName = { fontSize: 12, color: T.muted, lineHeight: 1.4 };
  css.resRow  = { display: "grid", gridTemplateColumns: "1fr 70px", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.border}` };
  css.resName = { fontSize: 12, color: T.muted };
  css.statC   = { borderRadius: 6, padding: 12, textAlign: "center", background: T.card, border: `1px solid ${T.border}` };
  css.statL   = { fontSize: 9, color: T.dimmer, fontFamily: T.mono, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.1em" };
  css.confC   = { background: T.card, borderRadius: 6, padding: 16, margin: "0 20px 14px", border: `1px solid ${T.border}` };
  css.confRow = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, gap: 10 };
  css.confLbl = { color: T.dim, flexShrink: 0, fontFamily: T.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" };
  css.confVal = { fontWeight: 600, textAlign: "right", maxWidth: "60%", wordBreak: "break-word", color: T.text };
  css.lbl     = { flex: 1, fontSize: 9, textAlign: "center", color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" };
  css.t1      = { fontSize: 17, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.text };
  css.lblAct  = { color: T.text, fontWeight: 600 };
  css.lbl     = { flex: 1, fontSize: 9, textAlign: "center", color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" };
  css.lblDone = { color: T.dim };
  css.subHd   = { fontSize: 9, color: T.dimmer, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 };
  css.note    = { fontSize: 10, color: T.dimmer, fontFamily: T.mono, marginTop: 4 };
  css.mSub    = { fontSize: 10, color: T.dim, marginTop: 3, fontFamily: T.mono };
  css.seg     = { flex: 1, height: 2, borderRadius: 1, background: T.border, transition: "background .3s" };
  css.btnS    = { width: "100%", padding: "10px 0", background: "transparent", color: T.muted, border: `1px solid ${INP_BOR}`, borderRadius: 4, fontSize: 13, cursor: "pointer", marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fm };

  const [page, setPage] = useState(0);

  // Identity
  const [projects, setProjects] = useState(() => LS.get("kmc_projects", {}));
  const [curProj, setCurProj] = useState("");
  const [busModel, setBusModel] = useState(prefillModel);
  const [vin, setVin] = useState(prefillVin);
  const [curLine, setCurLine] = useState("");
  const [curCode, setCurCode] = useState(() => prefillStation ? prefillStation.split(":")[0].trim() : "");
  const [curSt, setCurSt] = useState(prefillStation);
  const [designedTime, setDesignedTime] = useState(0);

  // Staff (per station — pool is station-scoped, loaded dynamically in onStation)
  const [operators, setOperators] = useState([]);
  const [selOps, setSelOps] = useState([]);

  // Reviewers — global list, separate from station operators
  const [reviewers, setReviewers] = useState(() => LS.get("kmc_reviewers", []));
  const [hseCount, setHseCount] = useState("");

  // Activities
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState(""); // set automatically in p0next (change 4)
  const [actStatuses, setActStatuses] = useState({});
  const [otherActs, setOtherActs] = useState([]);   // ad-hoc activities added on the card
  const [otherActName, setOtherActName] = useState("");
  const [resQtys, setResQtys] = useState({});
  const [removedRes, setRemovedRes] = useState([]);
  const [otherRes, setOtherRes] = useState([]);
  const [otherResName, setOtherResName] = useState("");
  const [otherResQty, setOtherResQty] = useState("");
  const [ohs, setOhs] = useState(false);
  const [ohsTxt, setOhsTxt] = useState("");
  const [waste, setWaste] = useState("");

  // Downtime
  const [hasDowntime, setHasDowntime] = useState(false);
  const [actualTime, setActualTime] = useState(0);  // net productive minutes
  const [grossTime, setGrossTime]   = useState(0);  // elapsed clock-in→out
  const [breakTime, setBreakTime]   = useState(0);  // scheduled breaks excluded
  const [selMs, setSelMs] = useState([]);
  const [subCauses, setSubCauses] = useState({});
  const [causeTimes, setCauseTimes] = useState({});      // { causeName: minutes }
  const [customCauses, setCustomCauses] = useState([]);  // user-added causes beyond the 6M
  const [customCauseName, setCustomCauseName] = useState("");
  const [corrAction, setCorrAction] = useState("");
  const [orComments, setOrComments] = useState("");
  // Phase 1 CAPA fields
  const [rcaMethod, setRcaMethod] = useState("");
  const [why1, setWhy1] = useState("");
  const [why2, setWhy2] = useState("");
  const [why3, setWhy3] = useState("");
  const [why4, setWhy4] = useState("");
  const [why5, setWhy5] = useState("");
  const [fiveCategory, setFiveCategory] = useState("");
  const [preventiveAction, setPreventiveAction] = useState("");

  // Downtime evidence attachment
  const [attachmentFile, setAttachmentFile]     = useState(null);   // File object
  const [attachmentB64,  setAttachmentB64]       = useState(null);   // Base64 data-url
  const [attachmentName, setAttachmentName]      = useState('');
  const [attachmentMime, setAttachmentMime]      = useState('');
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  // Sign-off (no designation, change 7)
  const [reviewer, setReviewer] = useState("");
  const [revOther, setRevOther] = useState("");
  const [appStatus, setAppStatus] = useState("");
  const [revDate, setRevDate] = useState(new Date().toISOString().slice(0, 10));
  const [revComments, setRevComments] = useState("");

  // Done
  const [submission, setSubmission] = useState(null);
  const [gsStatus, setGsStatus] = useState("");

  // Station times
  const [stationTimesApi, setStationTimesApi] = useState(null);
  const [timesLoading, setTimesLoading] = useState(true);
  const [timesError, setTimesError] = useState(null);

  useEffect(() => {
    fetchStationTimes()
      .then(api => { setStationTimesApi(api); setTimesLoading(false); })
      .catch(err => { console.warn("Travel Card: station times unavailable.", err.message); setTimesError(true); setTimesLoading(false); });
  }, []);

  // Persist projects & reviewers to localStorage
  useEffect(() => { LS.set("kmc_projects", projects); }, [projects]);
  useEffect(() => { LS.set("kmc_reviewers", reviewers); }, [reviewers]);

  // KEC templates are not yet available (documents cover EVS and KDC only).
  const isKEC = busModel.includes("KEC");
  // Which model template applies. KEC is gated out before this matters.
  const modelKind = busModel.includes("KDC") ? "KDC" : "EVS";

  // ── Merge the shared catalog over the built-in seed ──────────────────────────
  // Admin edits (lines/stations/activities/resources) live in the catalog and
  // override or extend the defaults, so every session sees the same dropdowns.
  const LINES_  = { ...TC_LINES, ...(catalog.tcLines || {}) };
  const ACTS_   = { ...ACTS, ...(catalog.acts || {}) };
  const RES_    = (() => {
    const out = { ...RES };
    for (const [ln, obj] of Object.entries(catalog.res || {})) out[ln] = { ...(RES[ln] || {}), ...obj };
    return out;
  })();
  const LINE_MODELS_    = { ...LINE_MODELS, ...(catalog.lineModels || {}) };
  const STATION_MODELS_ = { ...STATION_MODELS, ...(catalog.stationModels || {}) };

  // Per-model filtering. Anything NOT listed below applies to BOTH models.
  const visibleLines = Object.keys(LINES_).filter(
    l => !LINE_MODELS_[l] || LINE_MODELS_[l].includes(modelKind)
  );
  const stationMatchesModel = (s) => {
    const code = s.split(":")[0].trim();
    const m = STATION_MODELS_[code];
    return !m || m.includes(modelKind);
  };
  const stations = curLine ? (LINES_[curLine] || []).filter(stationMatchesModel) : [];
  // Activities can differ by model for shared lines (e.g. Paint P07-02, QA Q01-02).
  // Look up the model-namespaced key first, then fall back to the bare code.
  const acts = curCode ? (ACTS_[modelKind + ":" + curCode] || ACTS_[curCode] || []) : [];
  const resList = (curLine && curCode && RES_[curLine]) ? RES_[curLine][curCode] || [] : [];

  // Bus projects offered in the dropdown: union of locally-remembered projects
  // (which carry VIN memory) and active catalog projects added by an admin.
  const catalogProjectNames = (catalog.projects || [])
    .filter(p => p && p.name && p.active !== false)
    .map(p => p.name);
  const projectNames = [...new Set([...Object.keys(projects), ...catalogProjectNames])].sort();

  // Fleet VINs for the selected project, filtered to the selected bus model —
  // shared (from the catalog, admin-managed) merged with locally-remembered ones
  // (which carry no model tag, so they always show once a project is picked).
  const catalogFleet = (curProj && catalog.projectVins && catalog.projectVins[curProj]) || [];
  const catalogVinsForModel = catalogFleet.filter(v => v && v.vin && (!busModel || v.model === busModel)).map(v => v.vin);
  const localVins = (curProj && projects[curProj] && projects[curProj].vins) || [];
  const vinOptions = [...new Set([...catalogVinsForModel, ...localVins])];
  const revName = reviewer === "__other__" ? revOther : reviewer;

  function goTo(n) { setPage(n); window.scrollTo(0, 0); }

  function onStation(v) {
    setCurSt(v);
    const code = v.split(":")[0].trim();
    setCurCode(code);
    const mins = stationTimesApi ? (stationTimesApi.getMinutes(code) ?? 0) : 0;
    setDesignedTime(mins);
    setActStatuses({});
    setOtherActs([]); setOtherActName("");

    // Load remembered quantities and custom consumables for this station
    const savedQtys = LS.get(`kmc_qty_${code}`, {});
    setResQtys(savedQtys);
    setRemovedRes([]);
    setOtherRes(LS.get(`kmc_other_res_${code}`, []));

    // Load station-specific operator pool and remembered selection
    const stationOps = LS.get(`kmc_station_ops_${code}`, []);
    setOperators(stationOps);
    const savedSel = LS.get(`kmc_sel_${code}`, stationOps);
    setSelOps(savedSel.filter(s => stationOps.includes(s)));
  }

  function saveQtyMemory(qtys, code) {
    if (code) LS.set(`kmc_qty_${code}`, qtys);
  }

  function saveOtherResMemory(list, code) {
    if (code) LS.set(`kmc_other_res_${code}`, list);
  }

  function updateQty(r, val) {
    const next = { ...resQtys, [r]: val };
    setResQtys(next);
    saveQtyMemory(next, curCode);
  }

  // change 4: clockOut is captured here (when operator leaves identity page)
  function p0next() {
    if (!curProj) { alert("Select or add a bus project."); return; }
    if (!busModel) { alert("Select a bus model."); return; }
    if (isKEC) { alert("KEC travel cards not yet available."); return; }
    if (!vin) { alert("Select or add a Bus VIN."); return; }
    if (!curLine) { alert("Select a production line."); return; }
    if (!curSt) { alert("Select a station."); return; }
    setClockOut(new Date().toISOString());
    goTo(1);
  }

  function p1next() {
    if (!clockIn) { alert("Enter a clock-in time."); return; }
    // clockIn is from datetime-local (local time, no Z); clockOut is ISO (UTC).
    // Parse both as local time by treating them uniformly via Date.
    // datetime-local values have no timezone suffix so Date parses them as local.
    // clockOut (ISO with Z) is UTC — convert to local equivalent string for comparison.
    // Net productive time = elapsed clock-in→clock-out minus scheduled breaks
    // (tea break + lunch). Breaks that fall within the worked span are excluded.
    const { gross, breaks: brkMin, net: actual } = productiveMinutes(clockIn, clockOut);
    setGrossTime(gross);
    setBreakTime(brkMin);
    setActualTime(actual);
    if (actual > 0 && designedTime > 0 && actual > designedTime) {
      setHasDowntime(true); setSelMs([]); setSubCauses({}); setCauseTimes({}); setCustomCauses([]); goTo(2); return;
    }
    setHasDowntime(false); goTo(3);
  }

  function togM(m) {
    setSelMs(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    setSubCauses(prev => { const n = { ...prev }; if (prev[m]) delete n[m]; return n; });
    setCauseTimes(prev => { const n = { ...prev }; if (prev[m] !== undefined) delete n[m]; return n; });
  }

  // Add a custom root cause (outside the 6Ms) and auto-select it.
  function addCustomCause(name) {
    const n = name.trim();
    if (!n) return;
    if (!customCauses.includes(n) && !SIX.some(x => x.m === n)) {
      setCustomCauses(prev => [...prev, n]);
    }
    setSelMs(prev => prev.includes(n) ? prev : [...prev, n]);
    setCustomCauseName("");
  }

  function removeCustomCause(name) {
    setCustomCauses(prev => prev.filter(x => x !== name));
    setSelMs(prev => prev.filter(x => x !== name));
    setSubCauses(prev => { const n = { ...prev }; delete n[name]; return n; });
    setCauseTimes(prev => { const n = { ...prev }; delete n[name]; return n; });
  }

  function handleAttachmentChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentFile(file);
    setAttachmentName(file.name);
    setAttachmentMime(file.type);
    const reader = new FileReader();
    reader.onload = ev => setAttachmentB64(ev.target.result); // data-url including mime prefix
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!revName) { alert("Enter a reviewer name."); return; }
    if (!appStatus) { alert("Select an approval status."); return; }

    // save qty memory, custom consumables & station staff on submit
    saveQtyMemory(resQtys, curCode);
    saveOtherResMemory(otherRes, curCode);
    if (curCode) LS.set(`kmc_station_ops_${curCode}`, operators);
    if (curCode) LS.set(`kmc_sel_${curCode}`, selOps);

    const sub = {
      timestamp: new Date().toISOString(),
      busModel, project: curProj, vin,
      line: curLine, station: curSt, stationCode: curCode,
      operators: selOps, hseResources: hseCount,
      clockIn, clockOut, actualTime, designedTime, hasDowntime,
      grossTime, breakMinutes: breakTime,
      activityStatuses: actStatuses,
      addedActivities: otherActs,
      resourcesUsed: resQtys,
      removedResources: removedRes,
      otherResources: otherRes,
      ohsIssue: ohs ? ohsTxt : null,
      wasteGenerated: waste,
      downtime: hasDowntime ? { selMs, subCauses, causeTimes, customCauses, correctiveAction: corrAction, comments: orComments, rcaMethod, why1, why2, why3, why4, why5, category: fiveCategory, preventiveAction, attachmentName, attachmentMime, attachmentB64 } : null,
      reviewer: revName, approvalStatus: appStatus, reviewDate: revDate, reviewComments: revComments,
    };
    setSubmission(sub);
    goTo(4);

    // change 10: save to bus log in localStorage
    const logKey = `kmc_bus_log_${vin}`;
    const existing = LS.get(logKey, []);
    LS.set(logKey, [...existing, sub]);

    setGsStatus("Saving to Google Sheets…");
    try {
      // URLSearchParams is a CORS-safelisted body type — works with no-cors.
      // Content-Type: application/json is NOT safelisted and gets silently dropped
      // by the browser, so we send the payload as a form field instead.
      const body = new URLSearchParams({ payload: JSON.stringify(sub) });
      await fetch(SHEETS_URL, { method: "POST", mode: "no-cors", body });
      setGsStatus("✅ Saved to production records.");
      if (onSubmitSuccess) onSubmitSuccess();
    } catch {
      setGsStatus("⚠️ Could not reach Google Sheets. Download the record below.");
    }
  }

  // change 10: two PDF download functions
  const [dlBusy, setDlBusy] = useState("");

  async function dlStationReport() {
    if (!submission || dlBusy) return;
    setDlBusy("station");
    try {
      const logo = await fetchLogoBase64('/kmc logo 2.png').catch(() => null);
      const doc = await buildStationReportPDF(submission, logo);
      doc.save(`station_report_${submission.stationCode}_${new Date(submission.timestamp).toISOString().slice(0,10)}.pdf`);
    } catch (e) { console.error("PDF error:", e); alert("PDF generation failed. Check console."); }
    finally { setDlBusy(""); }
  }

  async function dlBusReport() {
    if (!submission || dlBusy) return;
    setDlBusy("bus");
    try {
      const logKey = `kmc_bus_log_${submission.vin}`;
      const log = LS.get(logKey, []);
      const logo = await fetchLogoBase64('/kmc logo 2.png').catch(() => null);
      const doc = await buildBusReportPDF(log, logo);
      doc.save(`bus_report_${submission.vin}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (e) { console.error("PDF error:", e); alert("PDF generation failed. Check console."); }
    finally { setDlBusy(""); }
  }

  function another() {
    const km = busModel, kp = curProj, kv = vin;
    setActStatuses({}); setOtherActs([]); setOtherActName(""); setResQtys({}); setRemovedRes([]); setOtherRes([]);
    setClockIn(""); setClockOut(""); setOhs(false); setOhsTxt(""); setWaste("");
    setHasDowntime(false); setActualTime(0); setGrossTime(0); setBreakTime(0); setSelMs([]); setSubCauses({}); setCauseTimes({}); setCustomCauses([]); setCustomCauseName("");
    setAttachmentFile(null); setAttachmentB64(null); setAttachmentName(''); setAttachmentMime('');
    setCorrAction(""); setOrComments("");
    setRcaMethod(""); setWhy1(""); setWhy2(""); setWhy3(""); setWhy4(""); setWhy5(""); setFiveCategory(""); setPreventiveAction("");
    setReviewer(""); setRevOther("");
    setAppStatus(""); setRevComments(""); setSubmission(null); setGsStatus("");
    setCurLine(""); setCurSt(""); setCurCode(""); setDesignedTime(0);
    setSelOps([]); setOperators([]); // operators reload when station is selected
    setBusModel(km); setCurProj(kp); setVin(kv);
    if (onReset) onReset();
    goTo(0);
  }

  const segStyle = i => ({ ...css.seg, ...(i < page ? css.segDone : i === page ? css.segAct : {}) });
  const lblStyle = i => ({ ...css.lbl, ...(i === page ? css.lblAct : i < page ? css.lblDone : {}) });
  const LABELS = ["Identity", "Activities", "Downtime", "Sign-off", "Done"];

  return (
    <div style={{
      position: 'relative', minHeight: '100vh',
      backgroundImage: theme === 'dark' ? "url('/Bus background.png')" : "url('/Bus background 2.png')",
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
    }}>
    <div style={{...css.wrap, position: 'relative', zIndex: 1}} className="tc-wrap">
      <style>{`
        .tc-wrap select option,
        .tc-wrap select optgroup {
          background: ${T.inpBg};
          color: ${T.text};
          font-family: 'Inter', system-ui, sans-serif;
        }
        .tc-wrap select option:checked,
        .tc-wrap select option:hover {
          background: rgba(220,38,38,0.25);
          color: #fca5a5;
        }
        .tc-wrap input:focus,
        .tc-wrap select:focus,
        .tc-wrap textarea:focus {
          border-color: rgba(220,38,38,0.55) !important;
          box-shadow: 0 0 0 2px rgba(220,38,38,0.12);
        }
        .tc-wrap input[type="date"]::-webkit-calendar-picker-indicator,
        .tc-wrap input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          filter: invert(0.6) sepia(1) saturate(3) hue-rotate(310deg);
          cursor: pointer;
        }
        .tc-wrap input[type="number"]::-webkit-inner-spin-button {
          filter: invert(0.4);
        }
        .tc-wrap select {
          appearance: auto;
        }
        .tc-wrap .add-btn:hover { background: rgba(220,38,38,0.15) !important; }
      `}</style>
      {/* Header */}
      <div style={css.topbar}>
        <img src={theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png'} alt="KMC" style={css.logo} />
        <div>
          <div style={css.t1}>Production Travel Card</div>
          <div style={css.t2}>KMC.DPN.05/26-FM004 · Rev #01</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={css.segsWrap}>{LABELS.map((_, i) => <div key={i} style={segStyle(i)} />)}</div>
      <div style={css.lblsWrap}>{LABELS.map((l, i) => <span key={i} style={lblStyle(i)}>{l}</span>)}</div>

      {/* ── PAGE 0: IDENTITY ── */}
      {page === 0 && <>
        {/* change 2: Project first */}
        <div style={css.card}>
          <div style={css.cardHd}>Bus project</div>
          <div style={css.fld}>
            <label style={css.lbl_}>Project</label>
            <select style={css.inp} value={curProj} onChange={e => { const v = e.target.value; setCurProj(v); if (v && !projects[v]) setProjects(p => ({ ...p, [v]: { vins: [] } })); }}>
              <option value="">Select project…</option>
              {projectNames.map(p => <option key={p}>{p}</option>)}
            </select>
            <AddRow placeholder="Add new project name…" onAdd={n => { if (!n.trim()) return; setProjects(p => ({ ...p, [n.trim()]: { vins: [] } })); setCurProj(n.trim()); }} />
            <div style={css.tagRow}>{Object.keys(projects).map(p => <Tag key={p} label={p} onDel={() => { setProjects(prev => { const n = { ...prev }; delete n[p]; return n; }); if (curProj === p) setCurProj(""); }} />)}</div>
          </div>
        </div>

        <div style={css.card}>
          <div style={css.cardHd}>Bus identity</div>
          <Sel label="Bus model" value={busModel} onChange={e => { setBusModel(e.target.value); setCurLine(""); setCurSt(""); setCurCode(""); }}>
            <option value="">Select model…</option>
            <optgroup label="KDC — available now">
              <option value="10.5m KDC">10.5m KDC</option>
              <option value="12m KDC">12m KDC</option>
            </optgroup>
            <optgroup label="EVS — available now">
              <option value="7m EVS">7m EVS</option>
              <option value="8.5m EVS">8.5m EVS</option>
              <option value="10.5m EVS">10.5m EVS</option>
              <option value="12m EVS">12m EVS</option>
            </optgroup>
            <optgroup label="KEC — coming soon">
              <option value="13m KEC">13m KEC</option>
            </optgroup>
          </Sel>

          {isKEC && <div style={css.evsBox}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
            <div style={{ fontWeight: 700, marginBottom: 4, letterSpacing: "0.08em" }}>KEC travel cards coming soon</div>
            <div style={{ fontSize: 12, color: T.dim }}>Templates for this model are under development. Select a KDC or EVS model, or contact your supervisor.</div>
          </div>}

          {!isKEC && busModel && <>
            <div style={css.fld}>
              <label style={css.lbl_}>Bus VIN</label>
              <select style={css.inp} value={vin} onChange={e => setVin(e.target.value)}>
                <option value="">Select VIN…</option>
                {vinOptions.map(v => <option key={v}>{v}</option>)}
              </select>
              <AddRow placeholder="Add VIN for this project…" onAdd={n => { if (!n.trim() || !curProj) return; setProjects(p => ({ ...p, [curProj]: { ...p[curProj], vins: [...(p[curProj]?.vins || []), n.trim()] } })); setVin(n.trim()); }} />
              <div style={css.tagRow}>
                {catalogVinsForModel.map(v => <Tag key={'c_' + v} label={v} />)}
                {localVins.filter(v => !catalogVinsForModel.includes(v)).map(v => <Tag key={'l_' + v} label={v} onDel={() => setProjects(p => ({ ...p, [curProj]: { ...p[curProj], vins: p[curProj].vins.filter(x => x !== v) } }))} />)}
              </div>
            </div>
          </>}
        </div>

        {!isKEC && busModel && <>
          <div style={css.card}>
            <div style={css.cardHd}>Station</div>
            <div className="tc-grid-2" style={css.g2}>
              <Sel label="Production line" value={curLine} onChange={e => { setCurLine(e.target.value); setCurSt(""); setCurCode(""); setDesignedTime(0); setSelOps([]); setOperators([]); }}>
                <option value="">Select line…</option>
                {visibleLines.map(l => <option key={l}>{l}</option>)}
              </Sel>
              <Sel label="Station" value={curSt} onChange={e => onStation(e.target.value)}>
                <option value="">Select station…</option>
                {stations.map(s => <option key={s}>{s}</option>)}
              </Sel>
            </div>
            {/* Admin can always override the designed (cycle) time */}
            {isAdmin && curCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: R, fontFamily: T.mono, letterSpacing: "0.04em" }}>Designed time (admin):</span>
                <input type="number" style={{ ...css.inp, maxWidth: 90, fontSize: 12 }} value={designedTime || ""} onChange={e => setDesignedTime(Number(e.target.value) || 0)} min="0" placeholder="min" />
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>min</span>
              </div>
            )}
            {!isAdmin && timesLoading && curCode && <div style={{ ...css.pill, opacity: .6, marginTop: 6 }}>⏱ Loading cycle time…</div>}
            {!isAdmin && !timesLoading && timesError && curCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: AM, fontFamily: T.mono }}>⚠ Sheet unavailable — enter manually:</span>
                <input type="number" style={{ ...css.inp, maxWidth: 90, fontSize: 12 }} value={designedTime || ""} onChange={e => setDesignedTime(Number(e.target.value) || 0)} min="0" placeholder="min" />
              </div>
            )}
            {!isAdmin && !timesLoading && !timesError && curCode && designedTime > 0 && (
              <div style={{ ...css.pill, marginTop: 8 }}>⏱ Designed time: <strong style={{ marginLeft: 4 }}>{designedTime} min</strong></div>
            )}
            {!isAdmin && !timesLoading && !timesError && curCode && designedTime === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 11, color: T.dim, fontFamily: T.mono }}>
                No cycle time set — enter manually:&nbsp;
                <input type="number" style={{ ...css.inp, maxWidth: 80, fontSize: 12, display: "inline", width: 80 }} value={designedTime || ""} onChange={e => setDesignedTime(Number(e.target.value) || 0)} min="0" placeholder="min" />
              </div>
            )}
          </div>

          {/* change 3: Staff on duty after station selection */}
          {curSt && <div style={css.card}>
            <div style={css.cardHd}>Staff on duty — {curCode}</div>
            <div className="tc-cb-grid" style={css.cbGrid}>
              {operators.map(op => <label key={op} style={css.cbItem}>
                <input type="checkbox" checked={selOps.includes(op)} onChange={e => { const newSel = e.target.checked ? [...selOps, op] : selOps.filter(x => x !== op); setSelOps(newSel); if (curCode) LS.set(`kmc_sel_${curCode}`, newSel); }} style={{ accentColor: R, width: 13, height: 13, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: T.muted }}>{op}</span>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 13 }} onClick={() => { const newOps = operators.filter(x => x !== op); setOperators(newOps); setSelOps(prev => prev.filter(x => x !== op)); if (curCode) LS.set(`kmc_station_ops_${curCode}`, newOps); }}>×</button>
              </label>)}
            </div>
            <AddRow placeholder="Add staff member name…" onAdd={n => { if (!n.trim()) return; const newOps = [...operators, n.trim()]; setOperators(newOps); setSelOps(prev => [...prev, n.trim()]); if (curCode) LS.set(`kmc_station_ops_${curCode}`, newOps); }} />
            <div style={{ ...css.fld, marginTop: 14 }}>
              <label style={css.lbl_}>HSE resources required (count)</label>
              <input type="number" style={{ ...css.inp, maxWidth: 120 }} value={hseCount} onChange={e => setHseCount(e.target.value)} min="0" placeholder="0" />
            </div>
          </div>}
        </>}

        <div style={css.px}>
          <button style={css.btnP} onClick={p0next}>Continue to activities →</button>
        </div>
      </>}

      {/* ── PAGE 1: ACTIVITIES ── */}
      {page === 1 && <>
        <div style={css.card}>
          <div style={css.cardHd}>Clock in{isAdmin ? " / out" : ""}</div>
          {/* change 4: clock-out removed; only clock-in here */}
          <Inp label="Clock in time" type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} />
          {isAdmin ? (
            <>
              <Inp
                label="Clock out time (admin)"
                type="datetime-local"
                value={isoToLocalInput(clockOut)}
                onChange={e => setClockOut(e.target.value ? new Date(e.target.value).toISOString() : "")}
              />
              <div style={css.note}>Admin can adjust the auto-recorded clock-out time.</div>
            </>
          ) : (
            <div style={css.note}>Clock-out was recorded automatically when you completed the identity page.</div>
          )}
          <div style={{ ...css.note, marginTop: 8 }}>
            ⏱ Time used excludes scheduled breaks (tea {SCHEDULE.breaks[0].start}–{SCHEDULE.breaks[0].end}, lunch {SCHEDULE.breaks[1].start}–{SCHEDULE.breaks[1].end}). Default shift {SCHEDULE.shiftStart}–{SCHEDULE.shiftEnd}.
          </div>
        </div>

        <div style={css.card}>
          <div style={{ ...css.cardHd, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Activities — <span style={{ fontWeight: 400, color: T.dim }}>{curCode}</span></span>
            {(acts.length > 0 || otherActs.length > 0) && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { const all = {}; [...acts, ...otherActs].forEach(a => { all[a] = "complete"; }); setActStatuses(all); }}
                  style={{ fontSize: 10, padding: "3px 10px", border: "1px solid rgba(16,185,129,0.35)", borderRadius: 3, background: "rgba(16,185,129,0.08)", color: "#10b981", cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.06em" }}
                >
                  ALL COMPLETE
                </button>
                <button
                  onClick={() => setActStatuses({})}
                  style={{ fontSize: 10, padding: "3px 10px", border: `1px solid ${T.border}`, borderRadius: 3, background: "transparent", color: T.dim, cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.06em" }}
                >
                  CLEAR
                </button>
              </div>
            )}
          </div>
          {acts.length === 0 && otherActs.length === 0 && <div style={{ fontSize: 12, color: T.dim }}>No predefined activities for this station — add one below.</div>}
          {acts.map((a, i) => <div key={i} className="tc-act-row" style={{ ...css.actRow, ...(i === acts.length - 1 && otherActs.length === 0 ? { borderBottom: "none" } : {}) }}>
            <div style={css.actName}>{a}</div>
            <select style={css.stSel} value={actStatuses[a] || ""} onChange={e => setActStatuses(p => ({ ...p, [a]: e.target.value }))}>
              <option value="">Status…</option>
              <option value="complete">✅ Complete</option>
              <option value="incomplete">⏳ Incomplete</option>
              <option value="issue">⚠️ Issue noted</option>
              <option value="rework">🔁 Rework needed</option>
              <option value="na">— N/A</option>
            </select>
          </div>)}
          {/* Ad-hoc activities added on this card (not in the predefined list) */}
          {otherActs.map((a, i) => <div key={`o${i}`} className="tc-act-row" style={{ ...css.actRow, gridTemplateColumns: "1fr 140px 28px", ...(i === otherActs.length - 1 ? { borderBottom: "none" } : {}) }}>
            <div style={css.actName}>{a}</div>
            <select style={css.stSel} value={actStatuses[a] || ""} onChange={e => setActStatuses(p => ({ ...p, [a]: e.target.value }))}>
              <option value="">Status…</option>
              <option value="complete">✅ Complete</option>
              <option value="incomplete">⏳ Incomplete</option>
              <option value="issue">⚠️ Issue noted</option>
              <option value="rework">🔁 Rework needed</option>
              <option value="na">— N/A</option>
            </select>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 16, lineHeight: 1 }} title="Remove activity"
              onClick={() => { setOtherActs(prev => prev.filter(x => x !== a)); setActStatuses(prev => { const n = { ...prev }; delete n[a]; return n; }); }}>×</button>
          </div>)}
          <div style={css.subSec}>
            <div style={css.subHd}>Other activity (not in list)</div>
            <div style={css.addRow}>
              <input style={css.addInp} value={otherActName} onChange={e => setOtherActName(e.target.value)} placeholder="Activity description…"
                onKeyDown={e => { if (e.key === "Enter") { const n = otherActName.trim(); if (n && !acts.includes(n) && !otherActs.includes(n)) { setOtherActs(p => [...p, n]); } setOtherActName(""); } }} />
              <button style={css.addBtn} onClick={() => { const n = otherActName.trim(); if (n && !acts.includes(n) && !otherActs.includes(n)) { setOtherActs(p => [...p, n]); } setOtherActName(""); }}>+ ADD</button>
            </div>
          </div>
        </div>

        {/* change 5: "Consumables & Materials Used" */}
        <div style={css.card}>
          <div style={css.cardHd}>Consumables & Materials Used</div>
          {resList.filter(r => !removedRes.includes(r)).length === 0 && <div style={{ fontSize: 12, color: T.dim, marginBottom: 8 }}>No preset consumables for this station.</div>}
          {resList.filter(r => !removedRes.includes(r)).map((r, i, arr) => <div key={r} className="tc-res-row" style={{ ...css.resRow, ...(i === arr.length - 1 ? { borderBottom: "none" } : {}), gridTemplateColumns: "1fr 70px 28px" }}>
            <div style={css.resName}>{r}</div>
            <input type="number" style={css.qty} min="0" placeholder="0" value={resQtys[r] || ""} onChange={e => updateQty(r, e.target.value)} />
            <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 16, lineHeight: 1, padding: 0, textAlign: "center" }} title="Remove consumable" onClick={() => { setRemovedRes(p => [...p, r]); const next = { ...resQtys }; delete next[r]; setResQtys(next); saveQtyMemory(next, curCode); }}>×</button>
          </div>)}
          <div style={css.subSec}>
            <div style={css.subHd}>Other consumable / material (not in list)</div>
            <div style={css.addRow}>
              <input style={css.addInp} value={otherResName} onChange={e => setOtherResName(e.target.value)} placeholder="Consumable or material name…" />
              <input type="number" style={{ ...css.qty, flexShrink: 0 }} value={otherResQty} onChange={e => setOtherResQty(e.target.value)} placeholder="Qty" />
              <button style={css.addBtn} onClick={() => { if (!otherResName.trim()) return; const next = [...otherRes, { name: otherResName.trim(), qty: otherResQty || 0 }]; setOtherRes(next); saveOtherResMemory(next, curCode); setOtherResName(""); setOtherResQty(""); }}>+ ADD</button>
            </div>
            {otherRes.map((r, i) => <div key={i} className="tc-res-row" style={{ ...css.resRow, borderBottom: "none" }}>
              <div style={css.resName}>{r.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
                ×{r.qty} <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 14 }} onClick={() => { const next = otherRes.filter((_, j) => j !== i); setOtherRes(next); saveOtherResMemory(next, curCode); }}>×</button>
              </div>
            </div>)}
          </div>
        </div>

        <div style={css.card}>
          <div style={css.cardHd}>Health, safety & environment</div>
          <div style={css.fld}>
            <label style={css.lbl_}>OHS issue?</label>
            <div style={css.togWrap}>
              <label style={{ position: "relative", width: 36, height: 20, flexShrink: 0, display: "block" }}>
                <input type="checkbox" checked={ohs} onChange={e => setOhs(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{ position: "absolute", inset: 0, background: ohs ? R : T.border, borderRadius: 20, cursor: "pointer", transition: ".2s" }} />
                <span style={{ position: "absolute", width: 14, height: 14, left: ohs ? 20 : 3, top: 3, background: "#fff", borderRadius: "50%", transition: ".2s" }} />
              </label>
              <span style={{ fontSize: 12, color: T.muted }}>{ohs ? "Issue reported" : "No issue"}</span>
            </div>
            {ohs && <textarea style={{ ...css.ta, marginTop: 8 }} value={ohsTxt} onChange={e => setOhsTxt(e.target.value)} placeholder="Describe the OHS issue…" />}
          </div>
          <div style={css.fld}>
            <label style={css.lbl_}>Waste generated</label>
            <input style={css.inp} value={waste} onChange={e => setWaste(e.target.value)} placeholder="e.g. Used sandpaper, solvent rags, metal offcuts…" />
          </div>
        </div>

        <div style={css.nav2}>
          <button style={{ ...css.btnS, marginTop: 0, flex: .35 }} onClick={() => goTo(0)}>← Back</button>
          <button style={{ ...css.btnP, marginTop: 0, flex: 1 }} onClick={p1next}>Continue →</button>
        </div>
      </>}

      {/* ── PAGE 2: DOWNTIME ── */}
      {page === 2 && <>
        <div style={css.banner}>
          <span style={{ fontSize: 20, color: AM, flexShrink: 0 }}>⚠</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: AM, letterSpacing: "0.06em" }}>Station time exceeded</div>
            <div style={{ fontSize: 11, color: AM, marginTop: 3 }}>Please identify the root cause below before proceeding to sign-off.</div>
          </div>
        </div>

        <div style={css.stat3}>
          <div style={css.statC}><div style={css.statV}>{designedTime}</div><div style={css.statL}>Designed (min)</div></div>
          <div style={css.statC}><div style={css.statV}>{actualTime}</div><div style={css.statL}>Actual (min)</div></div>
          <div style={css.statC}><div style={{ ...css.statV, color: R }}>+{actualTime - designedTime}</div><div style={css.statL}>Downtime (min)</div></div>
        </div>
        {breakTime > 0 && (
          <div style={{ ...css.note, textAlign: "center", margin: "-6px 20px 8px" }}>
            Actual excludes {breakTime} min of scheduled breaks (gross {grossTime} min).
          </div>
        )}

        <div style={css.card}>
          <div style={css.cardHd}>Root cause — 6Ms <span style={{ fontWeight: 400, textTransform: "none", opacity: .5, fontSize: 10, letterSpacing: 0 }}>(select all that apply)</span></div>
          <div style={css.sixGrid}>
            {SIX.map(m => <div key={m.m} style={{ ...css.mCard, ...(selMs.includes(m.m) ? css.mCardSel : {}) }} onClick={() => togM(m.m)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ fontSize: 18 }}>{m.icon}</span><div style={css.mTitle}>{m.m}</div></div>
              <div style={css.mSub}>{m.d}</div>
            </div>)}
          </div>

          {/* Custom causes — when the 6Ms don't cover it */}
          <div style={css.subSec}>
            <div style={css.subHd}>Other cause (not one of the 6Ms)</div>
            {customCauses.map(c => (
              <div key={c} style={{ ...css.mCard, ...(selMs.includes(c) ? css.mCardSel : {}), display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div onClick={() => togM(c)} style={{ flex: 1, cursor: "pointer" }}>
                  <div style={css.mTitle}>{c}</div>
                  <div style={css.mSub}>{selMs.includes(c) ? "Selected" : "Tap to select"}</div>
                </div>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 16 }} onClick={() => removeCustomCause(c)}>×</button>
              </div>
            ))}
            <div style={css.addRow}>
              <input style={css.addInp} value={customCauseName} onChange={e => setCustomCauseName(e.target.value)} placeholder="Add another cause…"
                onKeyDown={e => e.key === "Enter" && addCustomCause(customCauseName)} />
              <button style={css.addBtn} onClick={() => addCustomCause(customCauseName)}>+ ADD</button>
            </div>
          </div>
        </div>

        {selMs.length > 0 && <div style={css.card}>
          <div style={css.cardHd}>Root cause detail <span style={{ fontWeight: 400, textTransform: "none", opacity: .5, fontSize: 10, letterSpacing: 0 }}>(add the delay each cause took)</span></div>
          {selMs.map(m => {
            const md = SIX.find(x => x.m === m);
            return (<div key={m} style={{ ...css.fld, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
              <label style={css.lbl_}>{m} — specific cause</label>
              {md ? (
                <select style={css.inp} value={subCauses[m] || ""} onChange={e => setSubCauses(p => ({ ...p, [m]: e.target.value }))}>
                  <option value="">Select…</option>
                  {md.subs.map(s => <option key={s}>{s}</option>)}
                  <option>Other (see comments)</option>
                </select>
              ) : (
                <input style={css.inp} value={subCauses[m] || ""} onChange={e => setSubCauses(p => ({ ...p, [m]: e.target.value }))} placeholder="Describe this cause…" />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <label style={{ ...css.lbl_, marginBottom: 0 }}>Delay caused</label>
                <input type="number" min="0" style={{ ...css.inp, maxWidth: 100 }} value={causeTimes[m] ?? ""} onChange={e => setCauseTimes(p => ({ ...p, [m]: e.target.value === "" ? "" : Number(e.target.value) }))} placeholder="min" />
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>min</span>
              </div>
            </div>);
          })}
          {(() => {
            const summed = selMs.reduce((t, m) => t + (Number(causeTimes[m]) || 0), 0);
            const overrun = actualTime - designedTime;
            if (summed === 0) return null;
            return (
              <div style={{ ...css.note, marginTop: 6 }}>
                Causes account for {summed} min of the {overrun} min downtime
                {summed !== overrun ? ` (${summed > overrun ? "+" : "−"}${Math.abs(summed - overrun)} min vs total).` : "."}
              </div>
            );
          })()}
        </div>}

        <div style={css.card}>
          <div style={css.cardHd}>Response</div>
          <Inp label="Immediate corrective action taken" value={corrAction} onChange={e => setCorrAction(e.target.value)} placeholder="e.g. Re-allocated operators, sourced replacement material…" />
          <div style={css.fld}>
            <label style={css.lbl_}>Additional comments</label>
            <textarea style={css.ta} value={orComments} onChange={e => setOrComments(e.target.value)} placeholder="Further context, observations or follow-up actions…" />
          </div>
        </div>

        {/* ── CAPA Analysis (Phase 1 — KMC.DQHSE.02/26-PR0010) ── */}
        <div style={css.card}>
          <div style={{ ...css.cardHd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>CAPA Analysis</span>
            <span style={{ fontSize: 8, color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.06em", textTransform: "none", fontWeight: 400 }}>KMC.DQHSE.02/26-PR0010</span>
          </div>

          {/* RCA Method */}
          <Sel label="RCA method" value={rcaMethod} onChange={e => setRcaMethod(e.target.value)}>
            <option value="">Select method…</option>
            <option value="5-Why">5-Why</option>
            <option value="8D">8D</option>
            <option value="Fishbone">Fishbone (Ishikawa)</option>
            <option value="DMAIC">DMAIC</option>
          </Sel>

          {/* 5M Category */}
          <Sel label="5M category (primary driver)" value={fiveCategory} onChange={e => setFiveCategory(e.target.value)}>
            <option value="">Select category…</option>
            <option value="Man">Man — Operator / skill / attendance</option>
            <option value="Machine">Machine — Equipment / tooling / fixtures</option>
            <option value="Method">Method — Process / sequence / instructions</option>
            <option value="Material">Material — Parts / consumables / supply</option>
            <option value="Measurement">Measurement — Inspection / gauging / data</option>
            <option value="Mother Nature">Mother Nature — Environment / power / temperature</option>
          </Sel>

          {/* 5-Why progressive inputs */}
          {rcaMethod === "5-Why" && (
            <div style={{ marginTop: 4 }}>
              <div style={{ ...css.subHd, marginBottom: 10 }}>5-Why drill-down</div>
              <div style={css.fld}>
                <label style={css.lbl_}>Why 1 — why did the downtime occur?</label>
                <input style={css.inp} value={why1} onChange={e => setWhy1(e.target.value)} placeholder="State the immediate cause…" />
              </div>
              {why1.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 2 — why did that happen?</label>
                  <input style={css.inp} value={why2} onChange={e => setWhy2(e.target.value)} placeholder="Dig one level deeper…" />
                </div>
              )}
              {why1.trim() && why2.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 3</label>
                  <input style={css.inp} value={why3} onChange={e => setWhy3(e.target.value)} placeholder="Continue…" />
                </div>
              )}
              {why1.trim() && why2.trim() && why3.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 4</label>
                  <input style={css.inp} value={why4} onChange={e => setWhy4(e.target.value)} placeholder="Continue…" />
                </div>
              )}
              {why1.trim() && why2.trim() && why3.trim() && why4.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 5 — root cause</label>
                  <input style={css.inp} value={why5} onChange={e => setWhy5(e.target.value)} placeholder="Underlying root cause…" />
                </div>
              )}
            </div>
          )}

          {/* Preventive action */}
          <div style={{ ...css.fld, marginTop: 4 }}>
            <label style={css.lbl_}>Preventive action <span style={{ color: T.dimmer, fontWeight: 400 }}>(to stop recurrence)</span></label>
            <textarea style={css.ta} value={preventiveAction} onChange={e => setPreventiveAction(e.target.value)} placeholder="What systemic change will prevent this downtime from happening again?…" />
          </div>
        </div>

        {/* ── Evidence Attachment ── */}
        <div style={css.card}>
          <div style={css.cardHd}>Evidence attachment <span style={{ fontWeight: 400, textTransform: "none", opacity: .5, fontSize: 10, letterSpacing: 0 }}>(optional)</span></div>
          <div style={css.fld}>
            <label style={css.lbl_}>Photo or document showing cause / evidence</label>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              border: `1px dashed ${attachmentFile ? T.accent : T.border}`,
              borderRadius: 6, padding: "12px 14px",
              background: attachmentFile ? "rgba(220,38,38,0.06)" : T.inpBg,
              transition: "border-color .2s, background .2s",
            }}>
              <input
                type="file"
                accept="image/*,application/pdf"
                style={{ display: "none" }}
                onChange={handleAttachmentChange}
              />
              <span style={{ fontSize: 20 }}>{attachmentFile ? "📎" : "📁"}</span>
              <div>
                <div style={{ fontSize: 12, color: attachmentFile ? T.text : T.dim, fontWeight: attachmentFile ? 600 : 400 }}>
                  {attachmentFile ? attachmentFile.name : "Tap to select file…"}
                </div>
                {attachmentFile && (
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                    {(attachmentFile.size / 1024).toFixed(0)} KB · {attachmentFile.type || "unknown type"}
                  </div>
                )}
                {!attachmentFile && (
                  <div style={{ fontSize: 10, color: T.dimmer, marginTop: 2 }}>Images (JPG, PNG) or PDF — max 5 MB</div>
                )}
              </div>
            </label>
            {attachmentFile && (
              <button
                style={{ ...css.btnS, marginTop: 8, fontSize: 10, padding: "5px 12px" }}
                onClick={() => { setAttachmentFile(null); setAttachmentB64(null); setAttachmentName(''); setAttachmentMime(''); }}
              >
                ✕ Remove
              </button>
            )}
            {/* Image preview */}
            {attachmentB64 && attachmentMime.startsWith("image/") && (
              <img
                src={attachmentB64}
                alt="Evidence preview"
                style={{ marginTop: 10, maxWidth: "100%", maxHeight: 180, borderRadius: 6, objectFit: "contain", border: `1px solid ${T.border}` }}
              />
            )}
          </div>
          <div style={{ ...css.note, marginTop: 4 }}>
            The file will be uploaded to Google Drive and the link saved alongside this downtime record.
          </div>
        </div>

        <div style={css.nav2}>
          <button style={{ ...css.btnS, marginTop: 0, flex: .35 }} onClick={() => goTo(1)}>← Back</button>
          <button style={{ ...css.btnP, marginTop: 0, flex: 1 }} onClick={() => goTo(3)}>Continue to sign-off →</button>
        </div>
      </>}

      {/* ── PAGE 3: SIGN-OFF ── */}
      {page === 3 && <>
        <div style={css.card}>
          {/* change 7: no designation field */}
          <div style={css.cardHd}>Reviewer sign-off</div>
          <div style={css.fld}>
            <label style={css.lbl_}>Reviewer name</label>
            <select style={css.inp} value={reviewer} onChange={e => setReviewer(e.target.value)}>
              <option value="">Select reviewer…</option>
              {reviewers.map(r => <option key={r}>{r}</option>)}
              <option value="__other__">Other (type name)</option>
            </select>
            {reviewer === "__other__" && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <input style={css.inp} value={revOther} onChange={e => setRevOther(e.target.value)} placeholder="Enter reviewer name…" />
                {revOther.trim() && !reviewers.includes(revOther.trim()) && (
                  <button style={css.addBtn} onClick={() => { const n = revOther.trim(); setReviewers(prev => [...prev, n]); setReviewer(n); }}>+ SAVE TO REVIEWER LIST</button>
                )}
              </div>
            )}
            {reviewers.length > 0 && (
              <div style={css.tagRow}>
                {reviewers.map(r => <Tag key={r} label={r} onDel={() => { setReviewers(prev => prev.filter(x => x !== r)); if (reviewer === r) setReviewer(""); }} />)}
              </div>
            )}
          </div>
          <div style={css.g2}>
            <Sel label="Approval status" value={appStatus} onChange={e => setAppStatus(e.target.value)}>
              <option value="">Select…</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending review</option>
              <option value="rejected">Rejected / Rework required</option>
            </Sel>
            <Inp label="Review date" type="date" value={revDate} onChange={e => setRevDate(e.target.value)} />
          </div>
          <Inp label="Comments (optional)" value={revComments} onChange={e => setRevComments(e.target.value)} placeholder="Any notes from the reviewer…" />
        </div>

        <div style={css.nav2}>
          <button style={{ ...css.btnS, marginTop: 0, flex: .35 }} onClick={() => goTo(hasDowntime ? 2 : 1)}>← Back</button>
          <button style={{ ...css.btnP, marginTop: 0, flex: 1 }} onClick={submit}>Submit travel card</button>
        </div>
      </>}

      {/* ── PAGE 4: DONE ── */}
      {page === 4 && submission && <>
        <div style={css.card}>
          <div style={{ textAlign: "center", padding: "12px 0 6px" }}>
            <div style={{ fontSize: 42, color: GR }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", marginTop: 8, textTransform: "uppercase" }}>Travel card submitted</div>
            <div style={{ fontSize: 10, color: T.dimmer, fontFamily: T.mono, marginTop: 5 }}>{new Date(submission.timestamp).toLocaleString()}</div>
          </div>
        </div>

        <div style={css.confC}>
          <div style={css.cardHd}>Station summary</div>
          {[
            ["Project", submission.project],
            ["Bus model", submission.busModel],
            ["VIN", submission.vin],
            ["Line", submission.line],
            ["Station", submission.stationCode],
            ["Operators", submission.operators.join(", ") || "—"],
            ["Clock in", submission.clockIn ? new Date(submission.clockIn).toLocaleTimeString() : "—"],
            ["Clock out", submission.clockOut ? new Date(submission.clockOut).toLocaleTimeString() : "—"],
            ["Actual time", `${submission.actualTime} min`],
            ...(submission.breakMinutes > 0 ? [["Breaks excluded", `${submission.breakMinutes} min (gross ${submission.grossTime} min)`]] : []),
            ["Designed time", `${submission.designedTime} min`],
            ["Approval", submission.approvalStatus],
            ["Reviewer", submission.reviewer],
          ].map(([l, v]) => <div key={l} style={css.confRow}><span style={css.confLbl}>{l}</span><span style={css.confVal}>{v || "—"}</span></div>)}
        </div>

        {/* Activities summary */}
        {(() => {
          const entries = Object.entries(submission.activityStatuses || {});
          const added = submission.addedActivities || [];
          if (entries.length === 0 && added.length === 0) return null;
          const statusLabel = { complete: "✅ Complete", incomplete: "⏳ Incomplete", issue: "⚠️ Issue noted", rework: "🔁 Rework needed", na: "— N/A" };
          return (
            <div style={css.confC}>
              <div style={css.cardHd}>Activities</div>
              {entries.map(([a, s]) => (
                <div key={a} style={css.confRow}>
                  <span style={css.confLbl}>{a}</span>
                  <span style={css.confVal}>{statusLabel[s] || s}</span>
                </div>
              ))}
              {added.map(a => (
                <div key={a} style={css.confRow}>
                  <span style={css.confLbl}>{a}</span>
                  <span style={{ ...css.confVal, color: T.dim }}>{statusLabel[submission.activityStatuses?.[a]] || "—"}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Consumables summary */}
        {(() => {
          const presets = Object.entries(submission.resourcesUsed || {}).filter(([, v]) => v !== "" && v !== undefined);
          const custom = submission.otherResources || [];
          const removed = submission.removedResources || [];
          if (presets.length === 0 && custom.length === 0 && removed.length === 0) return null;
          return (
            <div style={css.confC}>
              <div style={css.cardHd}>Consumables & Materials</div>
              {presets.map(([r, qty]) => (
                <div key={r} style={css.confRow}>
                  <span style={css.confLbl}>{r}</span>
                  <span style={css.confVal}>×{qty}</span>
                </div>
              ))}
              {custom.map((r, i) => (
                <div key={i} style={css.confRow}>
                  <span style={css.confLbl}>{r.name}</span>
                  <span style={css.confVal}>×{r.qty}</span>
                </div>
              ))}
              {removed.map(r => (
                <div key={r} style={css.confRow}>
                  <span style={{ ...css.confLbl, color: T.dimmer, textDecoration: "line-through" }}>{r}</span>
                  <span style={{ ...css.confVal, color: T.dimmer }}>Not used</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* change 9: downtime details on done page */}
        {submission.hasDowntime && <div style={{ ...css.confC, background: RA, border: `1px solid ${RB}` }}>
          <div style={{ ...css.cardHd, color: R, borderColor: RB }}>Downtime details</div>
          <div style={css.stat3}>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: T.text }}>{submission.designedTime}</div><div style={css.statL}>Designed (min)</div></div>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: T.text }}>{submission.actualTime}</div><div style={css.statL}>Actual (min)</div></div>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: R }}>+{submission.actualTime - submission.designedTime}</div><div style={css.statL}>Downtime (min)</div></div>
          </div>
          {submission.downtime?.selMs?.length > 0 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Root causes</span>
              <span style={{ ...css.confVal, color: AM }}>{submission.downtime.selMs.join(", ")}</span>
            </div>
          )}
          {submission.downtime?.selMs?.map((m) => {
            const detail = submission.downtime.subCauses?.[m];
            const mins = submission.downtime.causeTimes?.[m];
            if (!detail && (mins === undefined || mins === "")) return null;
            return (
              <div key={m} style={css.confRow}>
                <span style={css.confLbl}>{m}</span>
                <span style={css.confVal}>{detail || "—"}{(mins !== undefined && mins !== "") ? ` · ${mins} min` : ""}</span>
              </div>
            );
          })}
          {submission.downtime?.correctiveAction && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Corrective action</span>
              <span style={css.confVal}>{submission.downtime.correctiveAction}</span>
            </div>
          )}
          {submission.downtime?.comments && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Comments</span>
              <span style={css.confVal}>{submission.downtime.comments}</span>
            </div>
          )}
          {submission.downtime?.rcaMethod && (
            <div style={css.confRow}>
              <span style={css.confLbl}>RCA method</span>
              <span style={css.confVal}>{submission.downtime.rcaMethod}</span>
            </div>
          )}
          {submission.downtime?.category && (
            <div style={css.confRow}>
              <span style={css.confLbl}>5M category</span>
              <span style={css.confVal}>{submission.downtime.category}</span>
            </div>
          )}
          {submission.downtime?.why1 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 1</span>
              <span style={css.confVal}>{submission.downtime.why1}</span>
            </div>
          )}
          {submission.downtime?.why2 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 2</span>
              <span style={css.confVal}>{submission.downtime.why2}</span>
            </div>
          )}
          {submission.downtime?.why3 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 3</span>
              <span style={css.confVal}>{submission.downtime.why3}</span>
            </div>
          )}
          {submission.downtime?.why4 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 4</span>
              <span style={css.confVal}>{submission.downtime.why4}</span>
            </div>
          )}
          {submission.downtime?.why5 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 5 (root cause)</span>
              <span style={css.confVal}>{submission.downtime.why5}</span>
            </div>
          )}
          {submission.downtime?.preventiveAction && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Preventive action</span>
              <span style={css.confVal}>{submission.downtime.preventiveAction}</span>
            </div>
          )}
        </div>}

        <div style={{ fontSize: 11, textAlign: "center", color: T.dim, fontFamily: T.mono, marginBottom: 8 }}>{gsStatus}</div>

        {/* change 10: two PDF download buttons */}
        <div style={css.px}>
          <button style={{ ...css.btnDl, opacity: dlBusy === "station" ? 0.6 : 1 }} onClick={dlStationReport} disabled={!!dlBusy}>
            {dlBusy === "station" ? "Generating PDF…" : "⬇ Download station report (PDF)"}
          </button>
          <button style={{ ...css.btnDl, opacity: dlBusy === "bus" ? 0.6 : 1 }} onClick={dlBusReport} disabled={!!dlBusy}>
            {dlBusy === "bus" ? "Generating PDF…" : "⬇ Download full bus report (PDF)"}
          </button>
          <button style={css.btnP} onClick={another}>Log another station →</button>
          <button style={css.btnS} onClick={() => { if (onReset) onReset(); }}>← Back to tracker</button>
        </div>
      </>}
    </div>
    </div>
  );
}
