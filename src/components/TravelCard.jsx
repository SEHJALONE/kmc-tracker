
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

// ── Station data ──────────────────────────────────────────────────────────────
const LINES = {
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
    "B04-07: Repair Welding, Grinding & Alignment of Roof Panel Assembly",
    "B05-01: Welding of Right Side Wall Framework",
    "B05-02: Repair Welding of Right Side Wall Framework",
    "B05-03: Turn-over and Repair Welding — Right Side Wall",
    "B05-04: Grinding and Correction — Right Side Wall",
    "B06-01: Welding of Left Side Wall Framework",
    "B06-02: Repair Welding of Left Side Wall Framework",
    "B06-03: Turn-over and Repair Welding — Left Side Wall",
    "B06-04: Grinding and Correction — Left Side Wall",
    "B07-01: Welding of Rear Face Framework",
    "B07-02: Repair Welding and Correction — Rear Face",
    "B07-03: Welding of Rear Panel",
    "B07-04: Repair, Grinding and Storage — Rear Face",
    "B08-01: Front Face Frame Welding",
    "B08-02: Repair Welding and Correction — Front Face",
    "B08-03: Welding of Front Panel",
    "B08-04: Repair, Grinding and Storage — Front Face",
    "B09-01: Frame Parts Welding",
    "B09-02: Integration Welding of Frame Assembly",
    "B09-03: Repair Welding of Frame Assembly",
    "B09-04: Installation of Frame Accessories",
    "B09-05: Grinding and Alignment of Frame Assembly",
    "B09-06: Inspection and Storage of Frame Assembly",
  ],
  "Frame & Body Welding": [
    "W01-01A: Integration of Back Seat, Heat Shield, Floor Sub-frame & Rear Fascia to U-Hoop (KDC)",
    "WQ-01: Quality Gate",
    "W01-01B: Integration of U-Hoop Web Frame to Chassis, Driver Cabin Floor & Front Fascia (KDC)",
    "WQ-02: Quality Gate",
    "W01-01: Six Parts Merging and Alignment (EVS)",
    "W01-02: Coach Frame Alignment, Passenger Door Step & Chassis Infuse Profiles",
    "W01-03: Full Welding, Grinding and Weld Bead Protection",
    "W01-04: Welding of Attachment Brackets, Chassis Frame Profiles & Inner Sealing Plates",
    "W01-05: Welding of Exterior Sealing Plates & Additional Brackets; Sealant Application",
    "W01-06: Installation of Fibre Roof & A/C Bolts; Cargo Rack & Ladder Bolts (EVS 7m)",
    "W01-07: Transfer",
    "W01-08: Side Panel Extension and Side Panel Trimming",
    "W01-09: Installation of Passenger Door Frames and Door Actuator",
    "W01-10: External Side Frame, Side Fibre Strips & Side Marker Light Installation",
    "W01-11: Installation of Compartment Doors; Fascia Bumper Alignment",
    "W01-12: Underbody Welding and Sealant Application",
    "W01-13: Rectification",
    "W01-14: Quality Gate (WQ-03)",
  ],
  "Chassis Line 01": [
    "CQ-01: Chassis Frame Defects Rectification Buffer & Pre-Chassis Assembly",
    "C01-01: VIN Engraving & LV Underbody Wiring Harness Installation",
    "C01-02: Chassis Air Tanks, Air Pipes, Braking & Hydraulic Systems",
    "C01-02-01: Air Tanks / Wiring Harness Sub-Assembly",
    "C01-03: Steering System, Gear Lever Cables, Clutch Radiator & Tyre Bracket",
    "C01-01-01: Radiator-Fan Assembly (KDC)",
    "C01-04: Air Tanks, Valves, Brake Pedals & ABS Valves / LV Underbody Wiring Harness",
    "C01-04-01: Wiring Harness Sub-Assembly",
    "CQ-02: Quality Gate",
  ],
  "Chassis Line 02 — EVS": [
    "C02-01: HV Harnesses, TPMS Modules, Fire Extinguishers & LV Harness Routing",
    "C02-02: Installation of Motor & HV Batteries",
    "C02-03: Installation of Front & Rear Axles, Suspensions & Air Bellow Shock Absorbers",
    "C02-03-01: Axles Sub-Assembly",
    "C02-04: Air Compressor, Radiator, Air Dryer, PDU & MCU Installation",
    "C02-05: Termination of HV Battery Accessories, ABS & Speed/Brake-wear Sensors",
    "C02-06: Installation of Wheel Arch Profile & Customer Tyres",
    "C02-06-01: Tires Sub-Assembly",
    "C02-07: Tyre Torquing & Pressure Balancing",
  ],
  "Chassis Line 02 — KDC": [
    "C02-01: TPMS Modules, Fire Extinguisher, Rear LV, A/C, Starter Motor & Wiring Harness Routing",
    "C02-02: Installation of Diesel Engine, Gear Box & Engine Accessories Termination",
    "C02-03: Installation of Engine Cooling and Fuel System",
    "C02-04-01: Axles Sub-Assembly",
    "C02-04: Installation of Front & Rear Axles, Suspensions & Shock Absorbers",
    "C02-05: Pneumatic & Steering System Completion; Driver Floorboard; Clutch Bleeding; ABS & Sensor Routing/Termination",
    "C02-06: Installation of Air Cleaner, Air Intake, Emissions System & Silencer",
    "C02-07-01: Tires Sub-Assembly",
    "C02-07: Installation of Tyres",
  ],
  "Paint Shop": [
    "P01-01: Bus Body Panel Masking",
    "P01-02: Foaming Application and Trimming",
    "P01-03: Underbody Anti-Corrosion Painting",
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
    "PQ-01: Paint Inspection",
    "P06-01: Intermediate Coat Painting",
    "P06-02: Intermediate Coat Paint-Drying",
    "P06-03: Intermediate Coat Polishing",
    "P07-01: AutoCryl TopCoat Painting",
    "P07-02: AutoCryl TopCoat Paint-Drying (EVS) / Clear Coat Painting (KDC)",
    "P07-03: TopCoat Paint-Drying (KDC)",
    "P08-01: Color Strip and Pattern Masking",
    "P08-02: Color Strip and Pattern Painting",
    "P08-03: Color Strip and Pattern Drying",
    "P08-04: Color Strip and Pattern Unmasking",
    "PQ-02: Finishing and Inspection",
  ],
  "Trim Line & Final Assembly": [
    "T01-01: Installation of Floor Boards, A/C & Heat Shield",
    "T01-01 EE: Rear Wall & Rear Side Compartment Components (KDC)",
    "T01-01-01: Floorboard Preparation (Sub-Assembly)",
    "T01-02: Carpet Installation",
    "T01-02 EE: Installation and Termination of HV Components (EVS)",
    "T01-02-01: Carpets Preparation (Sub-Assembly)",
    "T01-03: Carpet Welding; A/C Installation & Accessories; Side Board Aluminium Profiles; Escape Hatch",
    "T01-03 EE: Cooling Pipes; Antenna; Height Marker Lights; Ceiling, Front Wall & Dashboard Harness; A/C Terminations",
    "T01-03-01: A/C Sub-Assembly",
    "T01-04: Roof Boards, Side Boards, Airducts, Pneumatic Pipes, Front & Rear Mould, L/R Panel, Latch Cable Preparation",
    "T01-04 EE: Front Wall & Front Compartment Components; Routing and Termination",
    "T01-04-01: Dashboard, Roof and Air Duct Preparation (Sub-Assembly)",
    "T01-05: Installation of Side Glass",
    "T01-06: Dashboard; Front & Rear Windshields; Steps Aluminium Floor Profiles; Airduct Doors; Rear Side Panels",
    "T01-06 EE: Exterior Lights Installation and Termination; Front Camera & Step Decorative Lights",
    "T01-07: Step Poles; Column Covers; Curtain Rails; E-Valves; A/C Air Grille & Curtains; Rubber for Aluminium; Side Glass Sealant",
    "T01-07 EE: Final Dashboard Components & Display Screens",
    "T01-08: Driver Seat, Driver Cabins, Guard Rail, Barriers, Sun Visor Rods, Seat Brackets, Inspection Cover, Steering Column Cover, False Roof Panel, Rear Seats",
    "T01-08 EE: Interior Cameras & Speakers / Reading Lights",
    "T01-09: Passenger Door & Locks; Exterior Body Accessories; Side Mirrors, Dampers & Wipers; Compartment Door Sealant & Aluminium Strips",
    "T01-09 EE: Interior EE Components and Lighting Systems (KDC)",
    "T01-09-01: Passenger Doors Sub-Assembly",
    "T01-10: Installation of Passenger Seats; Filling Oils, Coolant & Mechanical Checks",
    "T01-10 EE: BMS, USB, Steering Column, Exterior & Side Cameras; Underbody Routing & Termination",
    "T01-10-01: Electrical System Sub-Assembly",
    "T01-11 EE: First Start, Testing and Debugging; Camera Calibration",
    "T01-11: ECAS & Fine Tuning of Passenger Doors (EVS) / A/C Refilling, Fine Tuning & Quality Inspection (KDC)",
    "T01-12: Quality Inspection and Rectification — TQ-01 (EVS)",
  ],
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
    "Q01-10: Chassis Anti-Corrosion & Underbody Plastic Primer Application",
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

// ── Per-model visibility ───────────────────────────────────────────────────────
// Lines / stations that apply to ONLY one model. Anything not listed = BOTH.
// Derived from the EVS & KDC Build Process Summary documents.
const LINE_MODELS = {
  "Chassis Line 02 — EVS": ["EVS"],
  "Chassis Line 02 — KDC": ["KDC"],
};
const STATION_MODELS = {
  // Frame & Body Welding — U-Hoop integration is KDC-specific; Six Parts Merging is EVS-specific
  "W01-01A": ["KDC"],
  "W01-01B": ["KDC"],
  "W01-01":  ["EVS"],
  // Chassis Line 01 — Radiator-Fan sub-assembly only in KDC
  "C01-01-01": ["KDC"],
  // Paint Shop — KDC has an extra TopCoat drying station (clear-coat process)
  "P07-03": ["KDC"],
  // Trim Line — model-specific electrical sub-stations & final QA
  "T01-01 EE": ["KDC"],
  "T01-02 EE": ["EVS"],
  "T01-09 EE": ["KDC"],
  "T01-12":    ["EVS"],
};

const ACTS = {
  // ── Machine Shop ──────────────────────────────────────────────────────────────
  "B01-01": ["Receiving and storing rectangular tubes","Receiving and storing steel plates","Stock labelling and organisation","Material inspection"],
  "B01-02": ["Band saw blade setup and tensioning","Rectangular tube cutting to length","Cut quality inspection","Deburring of cut ends"],
  "B01-03": ["Laser cutting machine setup","Rectangular tube laser cutting to profile","Cut quality and dimension inspection","Part labelling"],
  "B01-04": ["Circular saw blade setup","Rectangular tube cutting","Cut quality inspection","Deburring"],
  "B01-05": ["Punch press setup and tooling","Sheet metal punching to template","Hole pattern inspection","Part labelling"],
  "B01-06": ["CNC bending program loading","3D CNC pipe bending to specification","Bend angle and dimension check","Part labelling"],
  "B01-07": ["Table drill setup","Drilling holes to specification","Hole diameter and position inspection","Deburring"],
  "B02-01": ["Laser cutting machine setup","Steel plate laser cutting to profile","Cut quality and dimension inspection","Part labelling"],
  "B02-02": ["Shearing machine setup","Plate shearing to length/width","Cut quality inspection","Deburring"],
  "B02-03": ["Bending machine setup","Plate bending to angle/profile","Angle and dimension inspection"],
  "B02-04": ["Hydraulic press setup","Sheet metal forming/pressing","Dimension inspection","Part labelling"],
  "B02-05": ["Machine setup (lathe / milling / drilling)","Machining to drawing specification","Dimension and surface finish inspection"],
  "B02-06": ["Fixture setup and part clamping","Sheet metal MIG/TIG welding","Weld inspection and grinding","Cleaning"],
  "B02-07": ["Parts sorting and labelling","Storage racking","Inventory update"],
  "B03-01": ["Steel coil loading and uncoiling","Strip alignment and feed setting","Strip tension and straightness check"],
  "B03-02": ["Side panel roller press setup","Panel rolling to profile","Profile dimension check"],
  "B03-03": ["Roof middle panel roller press setup","Panel rolling to profile","Profile dimension check"],
  "B03-04": ["Side roof panel roller press setup","Panel rolling to profile","Profile dimension check"],
  "B03-05": ["Finished panel sorting and labelling","Storage racking","Inventory update"],
  // ── Frame Parts Making ────────────────────────────────────────────────────────
  "B04-01": ["Jig and fixture setup","Roof frame member tack welding","Full welding of roof frame","Weld inspection"],
  "B04-02": ["Repair welding of roof panel framework defects","Grinding of repair welds","Inspection"],
  "B04-03": ["Turn-over of roof panel framework","Repair welding of underside","Alignment check"],
  "B04-04": ["Angle grinding of roof framework welds","Alignment correction","Cleaning"],
  "B04-05": ["Top panel stretcher setup","Panel stretching to profile","Dimension check"],
  "B04-06": ["Escape hatch frame positioning","Welding of escape hatch frame","Weld inspection and grinding"],
  "B04-07": ["Repair welding of roof panel assembly","Grinding and alignment","Assembly inspection and storage"],
  "B05-01": ["Jig setup","Right side wall framework tack welding","Full welding","Weld inspection"],
  "B05-02": ["Repair welding of right side wall framework defects","Weld grinding","Inspection"],
  "B05-03": ["Turn-over of right side wall framework","Repair welding of underside","Alignment check"],
  "B05-04": ["Grinding and straightening of right side wall","Correction welding if required","Inspection"],
  "B06-01": ["Jig setup","Left side wall framework tack welding","Full welding","Weld inspection"],
  "B06-02": ["Repair welding of left side wall framework defects","Weld grinding","Inspection"],
  "B06-03": ["Turn-over of left side wall framework","Repair welding of underside","Alignment check"],
  "B06-04": ["Grinding and straightening of left side wall","Correction welding if required","Inspection"],
  "B07-01": ["Rear face framework tack welding","Full welding of rear face","Weld inspection"],
  "B07-02": ["Repair welding of rear face framework","Correction welding","Inspection"],
  "B07-03": ["Rear panel positioning and tack welding","Full welding of rear panel","Weld inspection"],
  "B07-04": ["Repair welding of rear face","Grinding","Storage of rear face assembly"],
  "B08-01": ["Front face frame tack welding","Full welding","Weld inspection"],
  "B08-02": ["Repair welding of front face framework","Correction welding","Inspection"],
  "B08-03": ["Front panel positioning and tack welding","Full welding of front panel","Weld inspection"],
  "B08-04": ["Repair welding of front face","Grinding","Storage of front face assembly"],
  "B09-01": ["Frame parts sub-assembly tack welding","Full welding of frame parts","Weld inspection"],
  "B09-02": ["Integration welding of complete frame assembly","Alignment check during welding"],
  "B09-03": ["Repair welding of frame assembly defects","Weld inspection"],
  "B09-04": ["Installation of frame accessories (brackets, inserts, plates)","Torque and fit check"],
  "B09-05": ["Grinding of frame assembly welds","Alignment measurement and correction"],
  "B09-06": ["Final inspection of frame assembly","Defect logging","Storage and labelling"],
  // ── Frame & Body Welding ──────────────────────────────────────────────────────
  "CQ-01": ["Chassis frame buffer check","Pre-chassis assembly quality gate inspection","Defect identification & logging","Defect rectification sign-off"],
  "W01-01A": ["Integration of back seat brackets to U-hoop web frame","Integration of engine heat shield to U-hoop web frame","Integration of floor sub-frame seal plates to U-hoop web frame","Integration of rear fascia to U-hoop web frame","Systems quality inspection & defect rectification"],
  "WQ-01": ["Quality gate inspection — systems check","Defect identification and logging","Sign-off for next stage"],
  "W01-01B": ["Integration of U-hoop web frame onto chassis frame assembly","Integration of driver cabin floor frame to chassis","Integration of chassis infuses to chassis frame","Integration of front fascia to chassis frame assembly","Systems quality inspection & defect rectification"],
  "WQ-02": ["Quality gate inspection — structure check","Defect identification and logging","Sign-off for next stage"],
  "W01-01": ["Six parts merging & initial alignment","Body frame structural fit checks","Quality gate checkpoint"],
  "W01-02": ["Coach frame alignment and installation of chassis infuse profiles","Installation of passenger door step","Installation of additional chassis infuse profiles","Full welding of front and rear fascia frame onto bus frame"],
  "W01-03": ["Full welding of frame joints and members","Welding of driver doorstep","Full welding of floor frame to body frame","Full welding of luggage compartment infused members","Full welding of shock tower enforcement members","Full welding of roof joints and side frame joints","Grinding, sanding, surface preparation and weld bead protection","Systems quality inspection and defect rectification"],
  "W01-04": ["Welding of attachment brackets to chassis frame","Welding of chassis frame profiles","Welding of inner sealing plates","Weld inspection and grinding"],
  "W01-05": ["Welding of exterior sealing plates","Welding of additional attachment brackets","Grinding and weld inspection","Sealant application to seams"],
  "W01-06": ["Installation and alignment of fibre roof","Silicon application to fibre roof perimeter","Riveting of fibre roof (left and right)","Installation of A/C panel bolts","Installation of cargo rack and ladder bolts (EVS 7m)","Bonding silicon application","Quality inspection"],
  "W01-07": ["Transfer of body to next station"],
  "W01-08": ["Side panel extension fitting and trimming","Fit and gap inspection","Grinding and surface preparation"],
  "W01-09": ["Installation of passenger door frames","Installation of door actuator","Alignment and gap check","Torque verification"],
  "W01-10": ["External side frame installation","Side fibre strips installation","Side marker light installation","Camera hole cutting and preparation (EVS)"],
  "W01-11": ["Installation and alignment of compartment doors","Fascia bumper alignment","Fit and gap checks"],
  "W01-12": ["Underbody welding of exposed joints","Sealant application to underbody seams","Coverage inspection"],
  "W01-13": ["Identification and logging of defects","Rectification welding","Grinding and surface repair","Re-inspection"],
  "W01-14": ["Systems quality inspection","Defect rectification","Quality gate (WQ-03) sign-off"],
  // ── Chassis Line 01 ───────────────────────────────────────────────────────────
  "C01-01": ["VIN engraving","LV underbody wiring harness installation (EVS)","Cable tie & routing inspection"],
  "C01-02": ["Chassis air tank installation","Air pipe routing and clamping","Braking system installation","Nylon pipe 8mm routing (KDC)","Nylon pipe 10mm routing (KDC)","Gear selector cable installation (KDC)","Hydraulic pipe installation (KDC)","Leak check"],
  "C01-02-01": ["Air tank sub-assembly build (KDC) / Wiring harness preparation (EVS)","Connector crimping & quality check"],
  "C01-03": ["Steering column and steering box installation","Gear lever cable installation (KDC)","Clutch radiator installation (KDC)","Tyre bracket installation (KDC)","Torque verification"],
  "C01-01-01": ["Radiator unit & fan blade sub-assembly (KDC)","Fan shroud installation","Mounting hardware torque check"],
  "C01-04": ["Air tank valve installation (EVS)","Brake chamber installation (EVS)","Slack adjuster installation (EVS)","ABS valve and pipe sub-assembly (EVS)","LV underbody wiring harness installation (KDC)","Systems quality inspection"],
  "C01-04-01": ["Wiring harness loom preparation","Connector crimping","Continuity & quality check"],
  "CQ-02": ["Chassis line quality gate inspection","Defect identification & logging","Sign-off for next stage"],
  // ── Chassis Line 02 — EVS ──────────────────────────────────────────────────────
  "C02-01": ["HV wiring harness routing (EVS)","TPMS sensor installation","Fire extinguisher bracket and installation","LV harness routing (EVS)","Wiring harness routing (KDC)","Rear LV installation (KDC)","A/C installation (KDC)","Starter motor installation (KDC)","Cable management & tie-downs"],
  "C02-02": ["Motor installation (EVS)","HV battery installation (EVS)","Diesel engine installation (KDC)","Gear box installation (KDC)","Engine accessories termination (KDC)","Mounting hardware torque check"],
  "C02-03": ["Front axle installation (EVS)","Rear axle installation (EVS)","Suspension installation (EVS)","Air bellow shock absorber installation (EVS)","Engine cooling system installation (KDC)","Fuel system installation (KDC)","Coolant pipe routing (KDC)","Leak check (KDC)"],
  "C02-03-01": ["Axle sub-assembly build (EVS)","Leaf spring & suspension plate assembly","Centre pin & torque arm installation","Axle oil filling"],
  "C02-04": ["Air compressor installation (EVS)","Radiator installation (EVS)","Air dryer installation (EVS)","PDU installation (EVS)","MCU installation (EVS)","Front axle integration (KDC)","Rear axle integration (KDC)","Suspension installation (KDC)","Shock absorber installation (KDC)"],
  "C02-04-01": ["Axle sub-assembly build (KDC)","Leaf spring & suspension plate assembly","Centre pin & torque arm installation","Axle oil filling"],
  "C02-05": ["HV battery accessories termination (EVS)","ABS termination (EVS)","Speed and brake-wear sensor termination (EVS)","Pneumatic system completion (KDC)","Steering system completion (KDC)","Driver floorboard installation (KDC)","Clutch system bleeding (KDC)","ABS routing & termination (KDC)","Speed and brake-wear sensor routing & termination (KDC)"],
  "C02-06": ["Wheel arch profile installation (EVS)","Customer tyre installation (EVS)","Air cleaner installation (KDC)","Air intake installation (KDC)","Emissions system installation (KDC)","Silencer installation (KDC)"],
  "C02-06-01": ["Tyre sub-assembly build (EVS)","Wheel balancing check","Valve core installation"],
  "C02-07": ["Tyre torquing (EVS)","Pressure balancing of customer tyres (EVS)","Tyre installation (KDC)"],
  "C02-07-01": ["Tyre sub-assembly build (KDC)","Wheel balancing check","Valve core installation"],
  // ── Paint Shop ────────────────────────────────────────────────────────────────
  "P01-01": ["Bus body panel masking","Glass & trim area protection","Masking quality check"],
  "P01-02": ["PU foaming application","Foam trimming & shaping","Quality check"],
  "P01-03": ["Underbody anti-corrosion paint application","Coverage & thickness inspection"],
  "P02-01": ["Body panel surface grinding (DA sander & disc)","Sanding to required grit","Inspection of ground surfaces for uniformity"],
  "P02-02": ["Manual pre-cleaning of ground body (tack cloth & solvent)","Compressed air blow-off"],
  "P02-03": ["Epoxy primer mixing & spraying","Coverage inspection"],
  "P02-04": ["Epoxy primer drying (timed — do not disturb)"],
  "P02-05": ["Epoxy primer wet sanding (400 grit)","Rinse & dry","Inspection"],
  "P03-01": ["Panel beating to correct dents and surface irregularities","Body filler mixing & application","Glass fibre application where required","Cure time"],
  "P03-02": ["Filler block sanding (80→120→180 grit)","Profile & flatness inspection"],
  "P03-03": ["Filler surface manual pre-cleaning (tack cloth & compressed air)"],
  "P04-01": ["NC primer mixing & spraying","Coverage inspection"],
  "P04-02": ["NC primer drying (timed)"],
  "P05-01": ["Identification and marking of surface defects","Defect rectification"],
  "P05-02": ["Spot putty application","Putty drying (timed)"],
  "P05-03": ["Putty wet sanding (320→400 grit)","Rinse & dry"],
  "P05-04": ["Putty polish surface manual cleaning (tack cloth & compressed air)"],
  "PQ-01": ["Paint inspection — visual check of all surfaces","Defect marking","Sign-off for next stage"],
  "P06-01": ["Intermediate coat paint mixing & spraying","Coverage inspection"],
  "P06-02": ["Intermediate coat drying (timed)"],
  "P06-03": ["Intermediate coat polishing (600→800 grit)","Surface inspection"],
  "P07-01": ["AutoCryl TopCoat paint mixing & spraying","Wet film thickness check"],
  "P07-02": ["AutoCryl TopCoat drying (EVS, timed)","Clear coat application (KDC)","Initial drying (KDC)"],
  "P07-03": ["TopCoat full cure drying (KDC, timed — do not disturb)"],
  "P08-01": ["Fine-line masking for colour strip and pattern application"],
  "P08-02": ["Colour strip and pattern paint mixing & spraying"],
  "P08-03": ["Colour strip and pattern drying (timed)"],
  "P08-04": ["Colour strip and pattern unmasking","Edge inspection"],
  "PQ-02": ["Final paint quality visual inspection (all panels)","Colour match verification","Defect marking & rectification","Surface polish & finishing","Quality gate sign-off"],
  // ── Trim Line & Final Assembly ────────────────────────────────────────────────
  "T01-01": ["Installation of floor boards","Installation of A/C unit","Installation of heat shield"],
  "T01-01 EE": ["Installation of rear wall components (KDC)","Installation of rear side compartment components (KDC)","Routing and termination"],
  "T01-01-01": ["Floorboard preparation and pre-assembly","Quality check"],
  "T01-02": ["Carpet installation"],
  "T01-02 EE": ["Installation and termination of HV components (EVS)"],
  "T01-02-01": ["Carpet cutting and preparation","Quality check"],
  "T01-03": ["Carpet welding","A/C installation and accessories","Side board aluminium profiles installation","Escape hatch installation"],
  "T01-03 EE": ["Installation of cooling pipes","Installation of antenna","Installation of height marker lights","Installation of ceiling, front wall and dashboard harness","A/C terminations"],
  "T01-03-01": ["A/C unit sub-assembly build","Quality check"],
  "T01-04": ["Installation of roof boards","Installation of side boards","Installation of airducts","Installation of pneumatic pipes","Installation of front and rear mould","Installation of left/right panel","Latch cable preparation"],
  "T01-04 EE": ["Installation of front wall and front compartment components","Routing and termination"],
  "T01-04-01": ["Dashboard, roof and air duct preparation and sub-assembly","Quality check"],
  "T01-05": ["Installation of side glass","Sealing and alignment check"],
  "T01-06": ["Installation of dashboard","Installation of front and rear windshields","Installation of steps aluminium floor profiles","Installation of airduct doors","Installation of waist beam cover (EVS)","Installation of rear side panels"],
  "T01-06 EE": ["Exterior lights installation and termination","Installation of front camera","Installation of step decorative lights"],
  "T01-07": ["Installation of step poles","Installation of pillar and waist beam column covers","Installation of side mirror brackets and water rails","Installation of curtain rails","Installation of E-Valves and E-Hammers (EVS)","Installation of A/C air grille and curtains","Installation of rubber for aluminium","Side glass sealant application"],
  "T01-07 EE": ["Installation of final dashboard components","Installation of display screens"],
  "T01-08": ["Installation of driver seat","Installation of driver cabins","Installation of driver guard rail (KDC)","Installation of barriers","Installation of sun visor rods","Installation of seat brackets","Installation of inspection cover","Installation of steering column cover","Placement of fire extinguisher and trash-can","Installation of water rails (EVS)","Installation of false roof panel","Installation of rear seats (KDC)"],
  "T01-08 EE": ["Installation of interior cameras","Installation of speakers and reading lights"],
  "T01-09": ["Installation of passenger door and locks","Installation of exterior body accessories","Installation of side mirrors, dampers and wipers","Compartment door sealant application","Installation of aluminium strips"],
  "T01-09 EE": ["Installation of interior EE components (KDC)","Installation of lighting systems (KDC)"],
  "T01-09-01": ["Passenger door sub-assembly build","Door mechanism check","Quality check"],
  "T01-10": ["Installation of passenger seats","Filling oils and coolant","Mechanical checks"],
  "T01-10 EE": ["Installation of BMS (EVS)","Installation of USB harness","Steering column assembly","Installation of exterior and side cameras","Underbody routing and termination (KDC)","Installation of accelerator pedal (KDC)"],
  "T01-10-01": ["Electrical system sub-assembly build","Continuity and quality check"],
  "T01-11 EE": ["First start and system testing","Debugging","Camera calibration"],
  "T01-11": ["ECAS setup and fine tuning of passenger doors (EVS)","A/C system refilling (KDC)","Removal of rubber from aluminium (KDC)","Fine tuning of passenger doors (KDC)","Quality inspection and rectification (KDC)"],
  "T01-12": ["Quality inspection of all systems (EVS — TQ-01)","Defect logging and rectification","Final sign-off"],
  // ── Quality Inspection & Testing ──────────────────────────────────────────────
  "Q01-01": ["Vehicle registration for testing","Pre-test checklist completion","Test lane assignment"],
  "Q01-02": ["Speed test on rollers","Vehicle exhaust emission test (KDC)","Speed test pass/fail recording"],
  "Q01-03": ["Wheel alignment measurement","Alignment correction if required","Alignment pass/fail recording"],
  "Q01-04": ["Interior and exterior sound level measurement","Pass/fail recording"],
  "Q01-05": ["Head lamp aim measurement","Adjustment if required","Pass/fail recording"],
  "Q01-06": ["Side slip test on rollers","Pass/fail recording"],
  "Q01-07": ["Axle load measurement","Brake efficiency test","Pass/fail recording"],
  "Q01-08": ["Compilation of all test results","Test report generation","Sign-off"],
  "Q01-09": ["Identification of defects from test results","Rectification work","Re-test if required"],
  "Q01-10": ["Chassis anti-corrosion compound application","Underbody plastic primer application","Coverage inspection"],
  "Q01-11": ["Full paint inspection — all panels","Defect marking"],
  "Q01-12": ["Paint defect rectification and repair","Paint drying"],
  "Q01-13": ["Rain test — water intrusion check","Leak identification and logging"],
  "Q01-14": ["Rectification of water intrusion and other defects","Re-test if required"],
  "Q01-15": ["Road test — whole vehicle dynamic test","Performance and handling assessment","Test result recording"],
  "Q01-16": ["Final inspection and decision gate","Underbody inspection","Pass/fail decision and recording"],
  "Washing Bay": ["Exterior washing and cleaning of bus","Interior cleaning","Presentability check"],
  "Q01-17": ["Final defects rectification","Quality sign-off"],
};

const RES = {
  "Machine Shop": {
    "B01-01": ["Storage Racking","Labelling Tags","Inspection Tape Measure"],
    "B01-02": ["Band Saw Blade","Coolant","Deburring Tool","Measuring Tape"],
    "B01-03": ["Laser Cutting Nozzle","Cutting Gas (O₂/N₂)","Measuring Tape"],
    "B01-04": ["Circular Saw Blade","Coolant","Deburring Tool"],
    "B01-05": ["Punch Tooling Set","Marking Pen","Measuring Tape"],
    "B01-06": ["CNC Bending Mandrel","Lubricant","Angle Gauge"],
    "B01-07": ["Drill Bits (various)","Coolant","Deburring Tool"],
    "B02-01": ["Laser Cutting Nozzle","Cutting Gas (O₂/N₂)","Measuring Tape"],
    "B02-02": ["Shearing Blade","Measuring Tape","Deburring Tool"],
    "B02-03": ["Bending Die Set","Angle Gauge","Measuring Tape"],
    "B02-04": ["Hydraulic Press Tooling","Measuring Tape"],
    "B02-05": ["Cutting Inserts","Coolant (L)","Measuring Tools"],
    "B02-06": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B02-07": ["Storage Racking","Labelling Tags"],
    "B03-01": ["Coil Loading Equipment","Alignment Guides"],
    "B03-02": ["Roller Dies","Lubricant (L)","Profile Gauge"],
    "B03-03": ["Roller Dies","Lubricant (L)","Profile Gauge"],
    "B03-04": ["Roller Dies","Lubricant (L)","Profile Gauge"],
    "B03-05": ["Storage Racking","Labelling Tags"],
  },
  "Frame Parts Making": {
    "B04-01": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm","Jig Clamps"],
    "B04-02": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B04-03": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B04-04": ["Grinding Disc 115mm","Straight Edge","Spirit Level"],
    "B04-05": ["Panel Stretcher Dies"],
    "B04-06": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B04-07": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B05-01": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B05-02": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B05-03": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B05-04": ["Grinding Disc 115mm","Straight Edge"],
    "B06-01": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B06-02": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B06-03": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B06-04": ["Grinding Disc 115mm","Straight Edge"],
    "B07-01": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B07-02": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B07-03": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B07-04": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B08-01": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B08-02": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B08-03": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B08-04": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B09-01": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B09-02": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B09-03": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "B09-04": ["Mounting Hardware Set","Thread Lock (ml)"],
    "B09-05": ["Grinding Disc 115mm","Straight Edge","Spirit Level"],
    "B09-06": ["Inspection Checklist Form","Storage Tags"],
  },
  "Frame & Body Welding": {
    "CQ-01": ["Inspection Checklist Form","Marking Chalk","Repair Weld Wire (kg)","Grinding Disc 115mm"],
    "W01-01A": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "WQ-01": ["Inspection Checklist Form"],
    "W01-01B": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm","Chassis Infuse Profiles"],
    "WQ-02": ["Inspection Checklist Form"],
    "W01-01": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "W01-02": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm","Chassis Infuse Profiles"],
    "W01-03": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm","Weld Bead Protection Compound (L)","Sandpaper 80 grit","Sandpaper 120 grit"],
    "W01-04": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm","Seal Plates — various (pcs)","Angle Iron (pcs)","Silicon Sealant (ml)"],
    "W01-05": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm","Closure Plates — various (pcs)","Silicon Sealant (ml)"],
    "W01-06": ["Silicon Sealant (ml)","Rivets (pcs)","Adhesive / Bonding Agent (ml)","Grinding Disc 115mm"],
    "W01-07": [],
    "W01-08": ["Grinding Disc 115mm","Fitting Tools"],
    "W01-09": ["Door Seal Strip (m)","Alignment Shims (pcs)","Thread Lock (ml)"],
    "W01-10": ["Silicon Sealant (ml)","Fibre Strips","Marker Light Set"],
    "W01-11": ["Door Seal Strip (m)","Alignment Pins (pcs)","Thread Lock (ml)"],
    "W01-12": ["Underbody Sealant (ml)","Welding Wire ER70S-6 (kg)","CO₂ Gas (L)"],
    "W01-13": ["Welding Wire ER70S-6 (kg)","CO₂ Gas (L)","Grinding Disc 115mm"],
    "W01-14": ["Inspection Checklist Form"],
  },
  "Chassis Line 01": {
    "CQ-01": ["Inspection Checklist Form","Marking Chalk","Repair Weld Wire (kg)"],
    "C01-01": ["VIN Engraving Tool Tip","Cable Ties (pack)","Split Loom 20mm (m)"],
    "C01-02": ["Nylon Pipe 8mm (m)","Nylon Pipe 10mm (m)","Hydraulic Pipe (m)","Fittings & Clamp Set"],
    "C01-02-01": ["Connector Pins","Heat Shrink Tubing (m)","Cable Ties (pack)"],
    "C01-03": ["Copper Washers","Thread Lock (ml)","Mounting Bolts M12"],
    "C01-01-01": ["Mounting Hardware Set","Fan Blade Set"],
    "C01-04": ["Mounting Bolts M10","Thread Lock (ml)","Cable Ties (pack)"],
    "C01-04-01": ["Connector Pins","Heat Shrink Tubing (m)","Cable Ties (pack)"],
    "CQ-02": ["Inspection Checklist Form"],
  },
  "Chassis Line 02": {
    "C02-01": ["HV Harness Set (EVS)","TPMS Sensor Set","Fire Extinguisher Bracket","Cable Ties (pack)","Mounting Bolts M10","Thread Lock (ml)"],
    "C02-02": ["Mounting Bolts M16","Gasket Set (KDC)","Thread Lock (ml)"],
    "C02-03": ["Coolant Pipe (m) (KDC)","Fuel Line (m) (KDC)","Mounting Bolts M14","Thread Lock (ml)"],
    "C02-03-01": ["Axle Oil (L)","Thread Lock (ml)"],
    "C02-04": ["Compressor Mounting Hardware","PDU Mounting Bolts (EVS)","MCU Mounting Bolts (EVS)","Thread Lock (ml)"],
    "C02-04-01": ["Axle Oil (L)","Thread Lock (ml)"],
    "C02-05": ["Cable Ties (pack)","Mounting Hardware Set","Thread Lock (ml)"],
    "C02-06": ["Wheel Arch Profile Set (EVS)","Air Cleaner Kit (KDC)","Exhaust Clamps (KDC)","Thread Lock (ml)"],
    "C02-06-01": ["Balance Weights","Valve Cores"],
    "C02-07": ["Torque Wrench","Tyre Pressure Gauge","Valve Cores (KDC)"],
    "C02-07-01": ["Balance Weights","Valve Cores"],
  },
  "Paint Shop": {
    "P01-01": ["Masking Tape 25mm (roll)","Masking Tape 50mm (roll)","Masking Paper (m)","Plastic Drop Sheet"],
    "P01-02": ["PU Foam Canister","Utility Knife"],
    "P01-03": ["Anti-Corrosion Primer (L)","Applicator Brush","PPE Gloves (pair)","Respirator Cartridge"],
    "P02-01": ["Grinding Disc 115mm","DA Sander Pad 150mm","Sandpaper 80 grit","Sandpaper 120 grit"],
    "P02-02": ["Tack Cloth","Solvent Wipes (pack)","Lint-Free Cloth"],
    "P02-03": ["Epoxy Primer (L)","Hardener (L)","Thinner (L)","Mixing Cup","Spray Gun Tip 1.4mm"],
    "P02-04": [],
    "P02-05": ["Wet-Dry Sandpaper 400 grit","Wet-Dry Sandpaper 600 grit","Sanding Block"],
    "P03-01": ["Body Filler (kg)","Glass Fibre Mat (m²)","Polyester Resin (L)","Hardener Cream (g)","Spreader","Body Hammer Set"],
    "P03-02": ["Sandpaper 80 grit","Sandpaper 120 grit","Sandpaper 180 grit","Long Board Sanding Block"],
    "P03-03": ["Tack Cloth","Solvent Wipes (pack)","Compressed Air (bar)"],
    "P04-01": ["NC Primer (L)","NC Thinner (L)","Spray Gun Tip 1.6mm","Mixing Cup"],
    "P04-02": [],
    "P05-01": ["Marking Chalk","Repair Materials"],
    "P05-02": ["Spot Putty (kg)","Spreading Knife","Sandpaper 180 grit"],
    "P05-03": ["Wet-Dry Sandpaper 320 grit","Wet-Dry Sandpaper 400 grit"],
    "P05-04": ["Tack Cloth","Lint-Free Cloth","Compressed Air (bar)"],
    "PQ-01": ["Inspection Checklist Form","Inspection Light"],
    "P06-01": ["Intermediate Coat Paint (L)","Hardener (L)","Thinner (L)","Spray Gun Tip 1.4mm","Mixing Cup"],
    "P06-02": [],
    "P06-03": ["Wet-Dry Sandpaper 600 grit","Wet-Dry Sandpaper 800 grit","Polishing Compound (g)"],
    "P07-01": ["AutoCryl Top Coat (L)","Hardener (L)","Thinner (L)","Spray Gun Tip 1.3mm","Mixing Cup"],
    "P07-02": ["Clear Coat (L) (KDC)","Hardener (L)","Thinner (L)","Spray Gun Tip 1.3mm"],
    "P07-03": [],
    "P08-01": ["Fine Line Masking Tape 6mm (roll)","Fine Line Masking Tape 10mm (roll)"],
    "P08-02": ["Colour Strip Paint (L)","Thinner (L)","Spray Gun Tip 1.2mm","Mixing Cup"],
    "P08-03": [],
    "P08-04": ["Tack Cloth"],
    "PQ-02": ["Inspection Light","Touch-up Paint (ml)","Polish Compound (g)","Buffer Pad","Wax Applicator"],
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
      <button style={css.tagX} onClick={onDel}>×</button>
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
export default function TravelCard({ prefillVin = "", prefillModel = "", prefillStation = "", onReset, onSubmitSuccess, theme = "dark" }) {
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
  const [resQtys, setResQtys] = useState({});
  const [removedRes, setRemovedRes] = useState([]);
  const [otherRes, setOtherRes] = useState([]);
  const [otherResName, setOtherResName] = useState("");
  const [otherResQty, setOtherResQty] = useState("");
  const [ohs, setOhs] = useState(false);
  const [ohsTxt, setOhsTxt] = useState("");
  const [waste, setWaste] = useState("");

  // Overrun
  const [hasOverrun, setHasOverrun] = useState(false);
  const [actualTime, setActualTime] = useState(0);
  const [selMs, setSelMs] = useState([]);
  const [subCauses, setSubCauses] = useState({});
  const [corrAction, setCorrAction] = useState("");
  const [orComments, setOrComments] = useState("");

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

  // Per-model filtering. Anything NOT listed below applies to BOTH models.
  const visibleLines = Object.keys(LINES).filter(
    l => !LINE_MODELS[l] || LINE_MODELS[l].includes(modelKind)
  );
  const stationMatchesModel = (s) => {
    const code = s.split(":")[0].trim();
    const m = STATION_MODELS[code];
    return !m || m.includes(modelKind);
  };
  const stations = curLine ? (LINES[curLine] || []).filter(stationMatchesModel) : [];
  const acts = curCode ? ACTS[curCode] || [] : [];
  const resList = (curLine && curCode && RES[curLine]) ? RES[curLine][curCode] || [] : [];
  const revName = reviewer === "__other__" ? revOther : reviewer;

  function goTo(n) { setPage(n); window.scrollTo(0, 0); }

  function onStation(v) {
    setCurSt(v);
    const code = v.split(":")[0].trim();
    setCurCode(code);
    const mins = stationTimesApi ? (stationTimesApi.getMinutes(code) ?? 0) : 0;
    setDesignedTime(mins);
    setActStatuses({});

    // Load remembered quantities for this station
    const savedQtys = LS.get(`kmc_qty_${code}`, {});
    setResQtys(savedQtys);
    setRemovedRes([]);

    // Load station-specific operator pool and remembered selection
    const stationOps = LS.get(`kmc_station_ops_${code}`, []);
    setOperators(stationOps);
    const savedSel = LS.get(`kmc_sel_${code}`, stationOps);
    setSelOps(savedSel.filter(s => stationOps.includes(s)));
  }

  function saveQtyMemory(qtys, code) {
    if (code) LS.set(`kmc_qty_${code}`, qtys);
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
    const coLocal = new Date(clockOut).toLocaleString('sv-SE').replace(' ', 'T'); // "2026-06-17T14:16"
    const actual = Math.round((new Date(coLocal) - new Date(clockIn)) / 60000);
    setActualTime(actual);
    if (actual > 0 && designedTime > 0 && actual > designedTime) {
      setHasOverrun(true); setSelMs([]); setSubCauses({}); goTo(2); return;
    }
    setHasOverrun(false); goTo(3);
  }

  function togM(m) {
    setSelMs(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    setSubCauses(prev => { const n = { ...prev }; if (prev[m]) delete n[m]; return n; });
  }

  async function submit() {
    if (!revName) { alert("Enter a reviewer name."); return; }
    if (!appStatus) { alert("Select an approval status."); return; }

    // save qty memory & station staff on submit
    saveQtyMemory(resQtys, curCode);
    if (curCode) LS.set(`kmc_station_ops_${curCode}`, operators);
    if (curCode) LS.set(`kmc_sel_${curCode}`, selOps);

    const sub = {
      timestamp: new Date().toISOString(),
      busModel, project: curProj, vin,
      line: curLine, station: curSt, stationCode: curCode,
      operators: selOps, hseResources: hseCount,
      clockIn, clockOut, actualTime, designedTime, hasOverrun,
      activityStatuses: actStatuses,
      resourcesUsed: resQtys,
      otherResources: otherRes,
      ohsIssue: ohs ? ohsTxt : null,
      wasteGenerated: waste,
      overrun: hasOverrun ? { selMs, subCauses, correctiveAction: corrAction, comments: orComments } : null,
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
    setActStatuses({}); setResQtys({}); setRemovedRes([]); setOtherRes([]);
    setClockIn(""); setClockOut(""); setOhs(false); setOhsTxt(""); setWaste("");
    setHasOverrun(false); setActualTime(0); setSelMs([]); setSubCauses({});
    setCorrAction(""); setOrComments(""); setReviewer(""); setRevOther("");
    setAppStatus(""); setRevComments(""); setSubmission(null); setGsStatus("");
    setCurLine(""); setCurSt(""); setCurCode(""); setDesignedTime(0);
    setSelOps([]); setOperators([]); // operators reload when station is selected
    setBusModel(km); setCurProj(kp); setVin(kv);
    if (onReset) onReset();
    goTo(0);
  }

  const segStyle = i => ({ ...css.seg, ...(i < page ? css.segDone : i === page ? css.segAct : {}) });
  const lblStyle = i => ({ ...css.lbl, ...(i === page ? css.lblAct : i < page ? css.lblDone : {}) });
  const LABELS = ["Identity", "Activities", "Overrun", "Sign-off", "Done"];

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
              {Object.keys(projects).map(p => <option key={p}>{p}</option>)}
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
                {curProj && projects[curProj] && projects[curProj].vins.map(v => <option key={v}>{v}</option>)}
              </select>
              <AddRow placeholder="Add VIN for this project…" onAdd={n => { if (!n.trim() || !curProj) return; setProjects(p => ({ ...p, [curProj]: { ...p[curProj], vins: [...(p[curProj]?.vins || []), n.trim()] } })); setVin(n.trim()); }} />
              <div style={css.tagRow}>{curProj && projects[curProj] && projects[curProj].vins.map(v => <Tag key={v} label={v} onDel={() => setProjects(p => ({ ...p, [curProj]: { ...p[curProj], vins: p[curProj].vins.filter(x => x !== v) } }))} />)}</div>
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
            {timesLoading && curCode && <div style={{ ...css.pill, opacity: .6, marginTop: 6 }}>⏱ Loading cycle time…</div>}
            {!timesLoading && timesError && curCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: AM, fontFamily: T.mono }}>⚠ Sheet unavailable — enter manually:</span>
                <input type="number" style={{ ...css.inp, maxWidth: 90, fontSize: 12 }} value={designedTime || ""} onChange={e => setDesignedTime(Number(e.target.value) || 0)} min="0" placeholder="min" />
              </div>
            )}
            {!timesLoading && !timesError && curCode && designedTime > 0 && (
              <div style={{ ...css.pill, marginTop: 8 }}>⏱ Designed time: <strong style={{ marginLeft: 4 }}>{designedTime} min</strong></div>
            )}
            {!timesLoading && !timesError && curCode && designedTime === 0 && (
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
          <div style={css.cardHd}>Clock in</div>
          {/* change 4: clock-out removed; only clock-in here */}
          <Inp label="Clock in time" type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} />
          <div style={css.note}>Clock-out was recorded automatically when you completed the identity page.</div>
        </div>

        <div style={css.card}>
          <div style={{ ...css.cardHd, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Activities — <span style={{ fontWeight: 400, color: T.dim }}>{curCode}</span></span>
            {acts.length > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { const all = {}; acts.forEach(a => { all[a] = "complete"; }); setActStatuses(all); }}
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
          {acts.length === 0 && <div style={{ fontSize: 12, color: T.dim }}>No predefined activities for this station.</div>}
          {acts.map((a, i) => <div key={i} className="tc-act-row" style={{ ...css.actRow, ...(i === acts.length - 1 ? { borderBottom: "none" } : {}) }}>
            <div style={css.actName}>{a}</div>
            <select style={css.stSel} value={actStatuses[a] || ""} onChange={e => setActStatuses(p => ({ ...p, [a]: e.target.value }))}>
              <option value="">Status…</option>
              <option value="complete">✅ Complete</option>
              <option value="issue">⚠️ Issue noted</option>
              <option value="rework">🔁 Rework needed</option>
              <option value="na">— N/A</option>
            </select>
          </div>)}
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
              <button style={css.addBtn} onClick={() => { if (!otherResName.trim()) return; setOtherRes(p => [...p, { name: otherResName.trim(), qty: otherResQty || 0 }]); setOtherResName(""); setOtherResQty(""); }}>+ ADD</button>
            </div>
            {otherRes.map((r, i) => <div key={i} className="tc-res-row" style={{ ...css.resRow, borderBottom: "none" }}>
              <div style={css.resName}>{r.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
                ×{r.qty} <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 14 }} onClick={() => setOtherRes(p => p.filter((_, j) => j !== i))}>×</button>
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

      {/* ── PAGE 2: OVERRUN ── */}
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
          <div style={css.statC}><div style={{ ...css.statV, color: R }}>+{actualTime - designedTime}</div><div style={css.statL}>Overrun (min)</div></div>
        </div>

        <div style={css.card}>
          <div style={css.cardHd}>Root cause — 6Ms <span style={{ fontWeight: 400, textTransform: "none", opacity: .5, fontSize: 10, letterSpacing: 0 }}>(select all that apply)</span></div>
          <div style={css.sixGrid}>
            {SIX.map(m => <div key={m.m} style={{ ...css.mCard, ...(selMs.includes(m.m) ? css.mCardSel : {}) }} onClick={() => togM(m.m)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ fontSize: 18 }}>{m.icon}</span><div style={css.mTitle}>{m.m}</div></div>
              <div style={css.mSub}>{m.d}</div>
            </div>)}
          </div>
        </div>

        {selMs.length > 0 && <div style={css.card}>
          <div style={css.cardHd}>Root cause detail</div>
          {selMs.map(m => {
            const md = SIX.find(x => x.m === m);
            return (<div key={m} style={css.fld}>
              <label style={css.lbl_}>{m} — specific cause</label>
              <select style={css.inp} value={subCauses[m] || ""} onChange={e => setSubCauses(p => ({ ...p, [m]: e.target.value }))}>
                <option value="">Select…</option>
                {md.subs.map(s => <option key={s}>{s}</option>)}
                <option>Other (see comments)</option>
              </select>
            </div>);
          })}
        </div>}

        <div style={css.card}>
          <div style={css.cardHd}>Response</div>
          <Inp label="Immediate corrective action taken" value={corrAction} onChange={e => setCorrAction(e.target.value)} placeholder="e.g. Re-allocated operators, sourced replacement material…" />
          <div style={css.fld}>
            <label style={css.lbl_}>Additional comments</label>
            <textarea style={css.ta} value={orComments} onChange={e => setOrComments(e.target.value)} placeholder="Further context, observations or follow-up actions…" />
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
          <button style={{ ...css.btnS, marginTop: 0, flex: .35 }} onClick={() => goTo(hasOverrun ? 2 : 1)}>← Back</button>
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
            ["Designed time", `${submission.designedTime} min`],
            ["Approval", submission.approvalStatus],
            ["Reviewer", submission.reviewer],
          ].map(([l, v]) => <div key={l} style={css.confRow}><span style={css.confLbl}>{l}</span><span style={css.confVal}>{v || "—"}</span></div>)}
        </div>

        {/* change 9: overrun details on done page */}
        {submission.hasOverrun && <div style={{ ...css.confC, background: RA, border: `1px solid ${RB}` }}>
          <div style={{ ...css.cardHd, color: R, borderColor: RB }}>Overrun details</div>
          <div style={css.stat3}>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: T.text }}>{submission.designedTime}</div><div style={css.statL}>Designed (min)</div></div>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: T.text }}>{submission.actualTime}</div><div style={css.statL}>Actual (min)</div></div>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: R }}>+{submission.actualTime - submission.designedTime}</div><div style={css.statL}>Overrun (min)</div></div>
          </div>
          {submission.overrun?.selMs?.length > 0 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Root causes</span>
              <span style={{ ...css.confVal, color: AM }}>{submission.overrun.selMs.join(", ")}</span>
            </div>
          )}
          {submission.overrun?.subCauses && Object.entries(submission.overrun.subCauses).map(([m, c]) => (
            <div key={m} style={css.confRow}>
              <span style={css.confLbl}>{m}</span>
              <span style={css.confVal}>{c}</span>
            </div>
          ))}
          {submission.overrun?.correctiveAction && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Corrective action</span>
              <span style={css.confVal}>{submission.overrun.correctiveAction}</span>
            </div>
          )}
          {submission.overrun?.comments && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Comments</span>
              <span style={css.confVal}>{submission.overrun.comments}</span>
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
