// KMC Station Database — aligned to Build Process Summary documents (EVS & KDC)
// Each station: { name, line, lineLabel, order, models }
// models: ['KDC'] | ['EVS'] | ['KDC','EVS']

export const LINES = [
  { id: 'MACHINE',  label: 'Machine Shop',                 models: ['KDC','EVS'] },
  { id: 'BODY',     label: 'Frame Parts Making',           models: ['KDC','EVS'] },
  { id: 'ELECTRO',  label: 'Electrophoresis',              models: ['KDC','EVS'] },
  { id: 'FRAME',    label: 'Frame & Body Welding',         models: ['KDC','EVS'] },
  { id: 'CHASSIS1', label: 'Chassis Line 01',              models: ['KDC','EVS'] },
  { id: 'CHASSIS2', label: 'Chassis Line 02',              models: ['KDC','EVS'] },
  { id: 'PAINT',    label: 'Paint Shop',                   models: ['KDC','EVS'] },
  { id: 'TRIM',     label: 'Trim Line & Final Assembly',   models: ['KDC','EVS'] },
  { id: 'QA',       label: 'Quality Inspection & Testing', models: ['KDC','EVS'] },
];

export const STATIONS = {
  // ─── MACHINE SHOP ────────────────────────────────────────────────────────────
  // B01: Rectangular Tubes Making
  'B01-01': { name: 'Rectangular Tubes & Steel Plate Storage',            line: 'MACHINE', order: 1,  models: ['KDC','EVS'] },
  'B01-02': { name: 'Rectangular Tubes Cutting — Band Saw',               line: 'MACHINE', order: 2,  models: ['KDC','EVS'] },
  'B01-03': { name: 'Rectangular Tube Cutting — Laser Cutting Machine',   line: 'MACHINE', order: 3,  models: ['KDC','EVS'] },
  'B01-04': { name: 'Rectangular Tubes Cutting — Circular Saw',           line: 'MACHINE', order: 4,  models: ['KDC','EVS'] },
  'B01-05': { name: 'Sheet Metal Punching',                               line: 'MACHINE', order: 5,  models: ['KDC','EVS'] },
  'B01-06': { name: '3D CNC Pipe Bending',                                line: 'MACHINE', order: 6,  models: ['KDC','EVS'] },
  'B01-07': { name: 'Table Type Drilling',                                line: 'MACHINE', order: 7,  models: ['KDC','EVS'] },
  // B02: Metal Sheet Parts Making
  'B02-01': { name: 'Plate Cutting — Laser Cutting Machine',              line: 'MACHINE', order: 8,  models: ['KDC','EVS'] },
  'B02-02': { name: 'Plate Shearing — Shearing Machine',                  line: 'MACHINE', order: 9,  models: ['KDC','EVS'] },
  'B02-03': { name: 'Plate Bending — Bending Machine',                    line: 'MACHINE', order: 10, models: ['KDC','EVS'] },
  'B02-04': { name: 'Metal Sheet Processing — Hydraulic Press',           line: 'MACHINE', order: 11, models: ['KDC','EVS'] },
  'B02-05': { name: 'Lathe, Milling and Drilling Machine',                line: 'MACHINE', order: 12, models: ['KDC','EVS'] },
  'B02-06': { name: 'Sheet Metal Welding',                                line: 'MACHINE', order: 13, models: ['KDC','EVS'] },
  'B02-07': { name: 'Storage of Finished Parts',                          line: 'MACHINE', order: 14, models: ['KDC','EVS'] },
  // B03: Steel Panel Rolling
  'B03-01': { name: 'Uncoiling and Alignment',                            line: 'MACHINE', order: 15, models: ['KDC','EVS'] },
  'B03-02': { name: 'Side Panel Roller Press',                            line: 'MACHINE', order: 16, models: ['KDC','EVS'] },
  'B03-03': { name: 'Roof Middle Panel Roller Press',                     line: 'MACHINE', order: 17, models: ['KDC','EVS'] },
  'B03-04': { name: 'Side Roof Panel Roller Press',                       line: 'MACHINE', order: 18, models: ['KDC','EVS'] },
  'B03-05': { name: 'Storage of Finished Parts',                          line: 'MACHINE', order: 19, models: ['KDC','EVS'] },

  // ─── FRAME PARTS MAKING (B04–B09) — both KDC and EVS ────────────────────────
  // B04: Roof Frame
  'B04-01': { name: 'Roof Frame Welding',                                 line: 'BODY', order: 1,  models: ['KDC','EVS'] },
  'B04-02': { name: 'Repair Welding of Roof Panel Framework',             line: 'BODY', order: 2,  models: ['KDC','EVS'] },
  'B04-03': { name: 'Turn-over Welding of Roof Panel Framework',          line: 'BODY', order: 3,  models: ['KDC','EVS'] },
  'B04-04': { name: 'Grinding, Alignment and Cleaning of Roof Framework', line: 'BODY', order: 4,  models: ['KDC','EVS'] },
  'B04-05': { name: 'Top Panel Stretcher',                                line: 'BODY', order: 5,  models: ['KDC','EVS'] },
  'B04-06': { name: 'Escape Hatch Welding',                               line: 'BODY', order: 6,  models: ['KDC','EVS'] },
  'B04-07': { name: 'Repair Welding, Grinding & Alignment of Roof Panel Assembly', line: 'BODY', order: 7, models: ['KDC','EVS'] },
  // B05: Right Side Wall
  'B05-01': { name: 'Welding of Right Side Wall Framework',               line: 'BODY', order: 8,  models: ['KDC','EVS'] },
  'B05-02': { name: 'Repair Welding of Right Side Wall Framework',        line: 'BODY', order: 9,  models: ['KDC','EVS'] },
  'B05-03': { name: 'Turn-over and Repair Welding — Right Side Wall',     line: 'BODY', order: 10, models: ['KDC','EVS'] },
  'B05-04': { name: 'Grinding and Correction — Right Side Wall',          line: 'BODY', order: 11, models: ['KDC','EVS'] },
  // B06: Left Side Wall
  'B06-01': { name: 'Welding of Left Side Wall Framework',                line: 'BODY', order: 12, models: ['KDC','EVS'] },
  'B06-02': { name: 'Repair Welding of Left Side Wall Framework',         line: 'BODY', order: 13, models: ['KDC','EVS'] },
  'B06-03': { name: 'Turn-over and Repair Welding — Left Side Wall',      line: 'BODY', order: 14, models: ['KDC','EVS'] },
  'B06-04': { name: 'Grinding and Correction — Left Side Wall',           line: 'BODY', order: 15, models: ['KDC','EVS'] },
  // B07: Rear Face
  'B07-01': { name: 'Welding of Rear Face Framework',                     line: 'BODY', order: 16, models: ['KDC','EVS'] },
  'B07-02': { name: 'Repair Welding and Correction — Rear Face',          line: 'BODY', order: 17, models: ['KDC','EVS'] },
  'B07-03': { name: 'Welding of Rear Panel',                              line: 'BODY', order: 18, models: ['KDC','EVS'] },
  'B07-04': { name: 'Repair, Grinding and Storage — Rear Face',           line: 'BODY', order: 19, models: ['KDC','EVS'] },
  // B08: Front Face
  'B08-01': { name: 'Front Face Frame Welding',                           line: 'BODY', order: 20, models: ['KDC','EVS'] },
  'B08-02': { name: 'Repair Welding and Correction — Front Face',         line: 'BODY', order: 21, models: ['KDC','EVS'] },
  'B08-03': { name: 'Welding of Front Panel',                             line: 'BODY', order: 22, models: ['KDC','EVS'] },
  'B08-04': { name: 'Repair, Grinding and Storage — Front Face',          line: 'BODY', order: 23, models: ['KDC','EVS'] },
  // B09: Frame Assembly
  'B09-01': { name: 'Frame Parts Welding',                                line: 'BODY', order: 24, models: ['KDC','EVS'] },
  'B09-02': { name: 'Integration Welding of Frame Assembly',              line: 'BODY', order: 25, models: ['KDC','EVS'] },
  'B09-03': { name: 'Repair Welding of Frame Assembly',                   line: 'BODY', order: 26, models: ['KDC','EVS'] },
  'B09-04': { name: 'Installation of Frame Accessories',                  line: 'BODY', order: 27, models: ['KDC','EVS'] },
  'B09-05': { name: 'Grinding and Alignment of Frame Assembly',           line: 'BODY', order: 28, models: ['KDC','EVS'] },
  'B09-06': { name: 'Inspection and Storage of Frame Assembly',           line: 'BODY', order: 29, models: ['KDC','EVS'] },

  // ─── ELECTROPHORESIS ─────────────────────────────────────────────────────────
  'E01-01': { name: 'Pre-degreasing',          line: 'ELECTRO', order: 1,  models: ['KDC','EVS'] },
  'E01-02': { name: 'Degreasing',              line: 'ELECTRO', order: 2,  models: ['KDC','EVS'] },
  'E01-03': { name: 'Washing 1',               line: 'ELECTRO', order: 3,  models: ['KDC','EVS'] },
  'E01-04': { name: 'Washing 2',               line: 'ELECTRO', order: 4,  models: ['KDC','EVS'] },
  'E01-05': { name: 'Transfer',                line: 'ELECTRO', order: 5,  models: ['KDC','EVS'] },
  'E01-06': { name: 'Pure Water Wash 1',       line: 'ELECTRO', order: 6,  models: ['KDC','EVS'] },
  'E01-07': { name: 'Silane',                  line: 'ELECTRO', order: 7,  models: ['KDC','EVS'] },
  'E01-08': { name: 'Pure Water Wash 2',       line: 'ELECTRO', order: 8,  models: ['KDC','EVS'] },
  'E01-09': { name: 'Pure Water Washing 3',    line: 'ELECTRO', order: 9,  models: ['KDC','EVS'] },
  'E01-10': { name: 'Transfer',                line: 'ELECTRO', order: 10, models: ['KDC','EVS'] },
  'E02-01': { name: 'Electrophoresis',         line: 'ELECTRO', order: 11, models: ['KDC','EVS'] },
  'E02-02': { name: 'UF1',                     line: 'ELECTRO', order: 12, models: ['KDC','EVS'] },
  'E02-03': { name: 'UF2',                     line: 'ELECTRO', order: 13, models: ['KDC','EVS'] },
  'E02-04': { name: 'Pure Water Wash 4',       line: 'ELECTRO', order: 14, models: ['KDC','EVS'] },
  'E02-05': { name: 'Electrophoresis Drying',  line: 'ELECTRO', order: 15, models: ['KDC','EVS'] },

  // ─── FRAME & BODY WELDING ─────────────────────────────────────────────────────
  // KDC-specific: W01-01a → WQ-01 → W01-01b → WQ-02 → W01-02…
  // EVS-specific: WQ-01 → WQ-02 → W01-01 → W01-02…
  // Shared from W01-02 onwards
  'W01-01A': { name: 'Integration of Back Seat, Engine Heat Shield, Floor Sub-frame & Rear Fascia to U-Hoop Web Frame', line: 'FRAME', order: 1, models: ['KDC'] },
  'WQ-01':   { name: 'Quality Gate',                                                                      line: 'FRAME', order: 2,  models: ['KDC','EVS'] },
  'W01-01B': { name: 'Integration of U-Hoop Web Frame, Driver Cabin Floor & Chassis Infuses to Chassis Frame; Front Fascia Integration', line: 'FRAME', order: 3, models: ['KDC'] },
  'WQ-02':   { name: 'Quality Gate',                                                                      line: 'FRAME', order: 4,  models: ['KDC','EVS'] },
  'W01-01':  { name: 'Six Parts Merging and Alignment',                                                   line: 'FRAME', order: 5,  models: ['EVS'] },
  'W01-02':  { name: 'Coach Frame Alignment, Passenger Door Step & Additional Chassis Infuse Profiles',   line: 'FRAME', order: 6,  models: ['KDC','EVS'] },
  'W01-03':  { name: 'Full Welding, Grinding and Weld Bead Protection',                                   line: 'FRAME', order: 7,  models: ['KDC','EVS'] },
  'W01-04':  { name: 'Welding of Attachment Brackets, Chassis Frame Profiles & Inner Sealing Plates',    line: 'FRAME', order: 8,  models: ['KDC','EVS'] },
  'W01-05':  { name: 'Welding of Exterior Sealing Plates & Additional Brackets; Sealant Application',    line: 'FRAME', order: 9,  models: ['KDC','EVS'] },
  'W01-06':  { name: 'Installation of Fibre Roof & A/C Bolts; Cargo Rack & Ladder Bolts (EVS 7m)',       line: 'FRAME', order: 10, models: ['KDC','EVS'] },
  'W01-07':  { name: 'Transfer',                                                                          line: 'FRAME', order: 11, models: ['KDC','EVS'] },
  'W01-08':  { name: 'Side Panel Extension and Side Panel Trimming',                                      line: 'FRAME', order: 12, models: ['KDC','EVS'] },
  'W01-09':  { name: 'Installation of Passenger Door Frames and Door Actuator',                           line: 'FRAME', order: 13, models: ['KDC','EVS'] },
  'W01-10':  { name: 'External Side Frame, Side Fibre Strips & Side Marker Light Installation',           line: 'FRAME', order: 14, models: ['KDC','EVS'] },
  'W01-11':  { name: 'Installation of Compartment Doors; Fascia Bumper Alignment',                        line: 'FRAME', order: 15, models: ['KDC','EVS'] },
  'W01-12':  { name: 'Underbody Welding and Sealant Application',                                         line: 'FRAME', order: 16, models: ['KDC','EVS'] },
  'W01-13':  { name: 'Rectification',                                                                     line: 'FRAME', order: 17, models: ['KDC','EVS'] },
  'W01-14':  { name: 'Quality Gate (WQ-03)',                                                              line: 'FRAME', order: 18, models: ['KDC','EVS'] },

  // ─── CHASSIS LINE 01 ──────────────────────────────────────────────────────────
  'CQ-01':    { name: 'Chassis Frame Defects Rectification Buffer & Pre-Chassis Assembly', line: 'CHASSIS1', order: 1, models: ['KDC','EVS'] },
  // EVS C01-01: VIN Engraving + LV Underbody Wiring Harnesses
  // KDC C01-01: VIN Engraving only
  'C01-01':    { name: 'VIN Engraving & LV Underbody Wiring Harness Installation',         line: 'CHASSIS1', order: 2, models: ['KDC','EVS'] },
  // EVS C01-02: Air Tanks, Air Pipes and Braking Systems
  // KDC C01-02: Air Tanks, Air Pipes, Braking Systems + Nylon Pipes, Gear Selector, Hydraulic Pipes
  'C01-02':    { name: 'Chassis Air Tanks, Air Pipes, Braking & Hydraulic Systems',        line: 'CHASSIS1', order: 3, models: ['KDC','EVS'] },
  'C01-02-01': { name: 'Air Tanks / Wiring Harness Sub-Assembly',                          line: 'CHASSIS1', order: 4, models: ['KDC','EVS'] },
  // EVS C01-03: Steering System
  // KDC C01-03: Steering System + Gear Lever Cables, Clutch Radiator, Tyre Bracket
  'C01-03':    { name: 'Steering System, Gear Lever Cables, Clutch Radiator & Tyre Bracket', line: 'CHASSIS1', order: 5, models: ['KDC','EVS'] },
  'C01-01-01': { name: 'Radiator-Fan Assembly',                                            line: 'CHASSIS1', order: 6, models: ['KDC'] },
  // EVS C01-04: Air Tanks, Valves, Brake Pedals, ABS Valves and Pipes Sub-Assembly
  // KDC C01-04: Low Voltage Underbody Wiring Harness
  'C01-04':    { name: 'Air Tanks, Valves, Brake Pedals & ABS Valves / LV Underbody Wiring Harness', line: 'CHASSIS1', order: 7, models: ['KDC','EVS'] },
  'C01-04-01': { name: 'Wiring Harness Sub-Assembly',                                      line: 'CHASSIS1', order: 8, models: ['KDC','EVS'] },
  'CQ-02':     { name: 'Quality Gate',                                                     line: 'CHASSIS1', order: 9, models: ['KDC','EVS'] },

  // ─── CHASSIS LINE 02 ──────────────────────────────────────────────────────────
  // EVS C02-01: HV Harnesses, TPMS Modules, Fire Extinguishers, LV Harness Routing
  // KDC C02-01: TPMS Modules, Fire Extinguisher, Rear LV, AC, Starter Motor, Wiring Harness Routing
  'C02-01':    { name: 'TPMS Modules, Fire Extinguisher, HV/LV Harnesses & Wiring Harness Routing', line: 'CHASSIS2', order: 1, models: ['KDC','EVS'] },
  // EVS C02-02: Motor + HV Batteries
  // KDC C02-02: Diesel Engine and Gear Box + Engine Accessories Termination
  'C02-02':    { name: 'Motor & HV Batteries (EVS) / Diesel Engine, Gear Box & Accessories (KDC)', line: 'CHASSIS2', order: 2, models: ['KDC','EVS'] },
  // EVS C02-03: Front and Rear Axles + Suspensions + Air Bellow Shock Absorbers
  // KDC C02-03: Engine Cooling and Fuel System
  'C02-03':    { name: 'Front & Rear Axles & Suspensions (EVS) / Engine Cooling & Fuel System (KDC)', line: 'CHASSIS2', order: 3, models: ['KDC','EVS'] },
  'C02-03-01': { name: 'Axles Sub-Assembly',                                               line: 'CHASSIS2', order: 4, models: ['EVS'] },
  // EVS C02-04: Air Compressor, Radiator, Air Dryer, PDU, MCU
  // KDC C02-04: Front and Rear Axles, Suspensions, Shock Absorbers
  'C02-04':    { name: 'Air Compressor, Radiator, Air Dryer, PDU & MCU (EVS) / Axles & Suspensions (KDC)', line: 'CHASSIS2', order: 5, models: ['KDC','EVS'] },
  'C02-04-01': { name: 'Axles Sub-Assembly',                                               line: 'CHASSIS2', order: 6, models: ['KDC'] },
  // EVS C02-05: HV Battery Accessories, ABS, Speed & Brake-wear Sensor Termination
  // KDC C02-05: Pneumatic & Steering System Completion, Driver Floorboard, Clutch Bleeding, ABS & Sensor Routing/Termination
  'C02-05':    { name: 'HV Battery Accessories & Sensor Termination (EVS) / Pneumatic, Steering, Clutch & Sensor Systems (KDC)', line: 'CHASSIS2', order: 7, models: ['KDC','EVS'] },
  // EVS C02-06: Wheel Arch Profile + Customer Tyres
  // KDC C02-06: Air Cleaner, Air Intake, Emissions System & Silencer
  'C02-06':    { name: 'Wheel Arch Profile & Tyres (EVS) / Air Cleaner, Air Intake, Emissions & Silencer (KDC)', line: 'CHASSIS2', order: 8, models: ['KDC','EVS'] },
  'C02-06-01': { name: 'Tires Sub-Assembly',                                               line: 'CHASSIS2', order: 9, models: ['EVS'] },
  // EVS C02-07: Torquing + Pressure Balancing
  // KDC C02-07: Installation of Tyres
  'C02-07':    { name: 'Tyre Torquing & Pressure Balancing (EVS) / Tyre Installation (KDC)', line: 'CHASSIS2', order: 10, models: ['KDC','EVS'] },
  'C02-07-01': { name: 'Tires Sub-Assembly',                                               line: 'CHASSIS2', order: 11, models: ['KDC'] },

  // ─── PAINT SHOP ───────────────────────────────────────────────────────────────
  // Order follows the document sequence exactly
  'P01-01': { name: 'Bus Body Panel Masking',                             line: 'PAINT', order: 1,  models: ['KDC','EVS'] },
  'P01-02': { name: 'Foaming Application and Trimming',                   line: 'PAINT', order: 2,  models: ['KDC','EVS'] },
  'P01-03': { name: 'Underbody Anti-Corrosion Painting',                  line: 'PAINT', order: 3,  models: ['KDC','EVS'] },
  'P02-01': { name: 'Body Panel Surface Grinding and Sanding',            line: 'PAINT', order: 4,  models: ['KDC','EVS'] },
  'P02-02': { name: 'Ground Body Manual Surface-Cleaning',                line: 'PAINT', order: 5,  models: ['KDC','EVS'] },
  'P02-03': { name: 'Epoxy Primer Painting',                              line: 'PAINT', order: 6,  models: ['KDC','EVS'] },
  'P02-04': { name: 'Epoxy Primer Drying',                                line: 'PAINT', order: 7,  models: ['KDC','EVS'] },
  'P02-05': { name: 'Epoxy Primer Polishing',                             line: 'PAINT', order: 8,  models: ['KDC','EVS'] },
  'P03-01': { name: 'Panel Beating; Filler and Fibre Application',        line: 'PAINT', order: 9,  models: ['KDC','EVS'] },
  'P03-02': { name: 'Filler and Fibre Polishing',                         line: 'PAINT', order: 10, models: ['KDC','EVS'] },
  'P03-03': { name: 'Filler Polish Manual Surface-Cleaning',              line: 'PAINT', order: 11, models: ['KDC','EVS'] },
  'P04-01': { name: 'NC Primer Painting',                                 line: 'PAINT', order: 12, models: ['KDC','EVS'] },
  'P04-02': { name: 'NC Primer Drying',                                   line: 'PAINT', order: 13, models: ['KDC','EVS'] },
  'P05-01': { name: 'Defects Rectification',                              line: 'PAINT', order: 14, models: ['KDC','EVS'] },
  'P05-02': { name: 'Putty Application and Drying',                       line: 'PAINT', order: 15, models: ['KDC','EVS'] },
  'P05-03': { name: 'Putty Polishing',                                    line: 'PAINT', order: 16, models: ['KDC','EVS'] },
  'P05-04': { name: 'Putty Polish Manual Surface-Cleaning',               line: 'PAINT', order: 17, models: ['KDC','EVS'] },
  'PQ-01':  { name: 'Paint Inspection',                                   line: 'PAINT', order: 18, models: ['KDC','EVS'] },
  'P06-01': { name: 'Intermediate Coat Painting',                         line: 'PAINT', order: 19, models: ['KDC','EVS'] },
  'P06-02': { name: 'Intermediate Coat Paint-Drying',                     line: 'PAINT', order: 20, models: ['KDC','EVS'] },
  'P06-03': { name: 'Intermediate Coat Polishing',                        line: 'PAINT', order: 21, models: ['KDC','EVS'] },
  'P07-01': { name: 'AutoCryl TopCoat Painting',                          line: 'PAINT', order: 22, models: ['KDC','EVS'] },
  // EVS: P07-02 = AutoCryl TopCoat Paint-Drying (no P07-03)
  // KDC: P07-02 = Clear Coat Painting, P07-03 = TopCoat Paint-Drying
  'P07-02': { name: 'AutoCryl TopCoat Paint-Drying (EVS) / Clear Coat Painting (KDC)', line: 'PAINT', order: 23, models: ['KDC','EVS'] },
  'P07-03': { name: 'TopCoat Paint-Drying',                               line: 'PAINT', order: 24, models: ['KDC'] },
  'P08-01': { name: 'Color Strip and Pattern Masking',                    line: 'PAINT', order: 25, models: ['KDC','EVS'] },
  'P08-02': { name: 'Color Strip and Pattern Painting',                   line: 'PAINT', order: 26, models: ['KDC','EVS'] },
  'P08-03': { name: 'Color Strip and Pattern Drying',                     line: 'PAINT', order: 27, models: ['KDC','EVS'] },
  'P08-04': { name: 'Color Strip and Pattern Unmasking',                  line: 'PAINT', order: 28, models: ['KDC','EVS'] },
  'PQ-02':  { name: 'Finishing and Inspection',                           line: 'PAINT', order: 29, models: ['KDC','EVS'] },

  // ─── TRIM LINE & FINAL ASSEMBLY ───────────────────────────────────────────────
  // Stations follow document station codes. "EE" suffix = electrical sub-station at same physical station.
  'T01-01':    { name: 'Installation of Floor Boards, A/C & Heat Shield',                       line: 'TRIM', order: 1,  models: ['KDC','EVS'] },
  'T01-01-EE': { name: 'Rear Wall & Rear Side Compartment Components (KDC) / — (EVS)',          line: 'TRIM', order: 2,  models: ['KDC'] },
  'T01-01-01': { name: 'Floorboard Preparation (Sub-Assembly)',                                  line: 'TRIM', order: 3,  models: ['KDC','EVS'] },
  'T01-02':    { name: 'Carpet Installation',                                                    line: 'TRIM', order: 4,  models: ['KDC','EVS'] },
  'T01-02-EE': { name: 'Installation and Termination of HV Components',                         line: 'TRIM', order: 5,  models: ['EVS'] },
  'T01-02-01': { name: 'Carpets Preparation (Sub-Assembly)',                                     line: 'TRIM', order: 6,  models: ['KDC','EVS'] },
  'T01-03':    { name: 'Carpet Welding; A/C Installation & Accessories; Side Board Aluminium Profiles; Escape Hatch', line: 'TRIM', order: 7, models: ['KDC','EVS'] },
  'T01-03-EE': { name: 'Cooling Pipes; Antenna; Height Marker Lights; Ceiling, Front Wall & Dashboard Harness; A/C Terminations', line: 'TRIM', order: 8, models: ['KDC','EVS'] },
  'T01-03-01': { name: 'A/C Sub-Assembly',                                                      line: 'TRIM', order: 9,  models: ['KDC','EVS'] },
  'T01-04':    { name: 'Roof Boards, Side Boards, Airducts, Pneumatic Pipes, Front & Rear Mould, L/R Panel, Latch Cable Preparation', line: 'TRIM', order: 10, models: ['KDC','EVS'] },
  'T01-04-EE': { name: 'Front Wall & Front Compartment Components; Routing and Termination',    line: 'TRIM', order: 11, models: ['KDC','EVS'] },
  'T01-04-01': { name: 'Dashboard, Roof and Air Duct Preparation (Sub-Assembly)',               line: 'TRIM', order: 12, models: ['KDC','EVS'] },
  'T01-05':    { name: 'Installation of Side Glass',                                            line: 'TRIM', order: 13, models: ['KDC','EVS'] },
  'T01-06':    { name: 'Dashboard; Front & Rear Windshields; Steps Aluminium Floor Profiles; Airduct Doors; Rear Side Panels', line: 'TRIM', order: 14, models: ['KDC','EVS'] },
  'T01-06-EE': { name: 'Exterior Lights Installation and Termination; Front Camera & Step Decorative Lights', line: 'TRIM', order: 15, models: ['KDC','EVS'] },
  'T01-07':    { name: 'Step Poles; Column Covers; Curtain Rails; E-Valves; A/C Air Grille & Curtains; Rubber for Aluminium; Side Glass Sealant', line: 'TRIM', order: 16, models: ['KDC','EVS'] },
  'T01-07-EE': { name: 'Final Dashboard Components & Display Screens',                          line: 'TRIM', order: 17, models: ['KDC','EVS'] },
  'T01-08':    { name: 'Driver Seat, Driver Cabins, Guard Rail, Barriers, Sun Visor Rods, Seat Brackets, Inspection Cover, Steering Column Cover, False Roof Panel, Rear Seats', line: 'TRIM', order: 18, models: ['KDC','EVS'] },
  'T01-08-EE': { name: 'Interior Cameras & Speakers / Reading Lights',                          line: 'TRIM', order: 19, models: ['KDC','EVS'] },
  'T01-09':    { name: 'Passenger Door & Locks; Exterior Body Accessories; Side Mirrors, Dampers & Wipers; Compartment Door Sealant & Aluminium Strips', line: 'TRIM', order: 20, models: ['KDC','EVS'] },
  'T01-09-EE': { name: 'Interior EE Components and Lighting Systems',                           line: 'TRIM', order: 21, models: ['KDC'] },
  'T01-09-01': { name: 'Passenger Doors Sub-Assembly',                                          line: 'TRIM', order: 22, models: ['KDC','EVS'] },
  'T01-10':    { name: 'Installation of Passenger Seats; Filling Oils, Coolant & Mechanical Checks', line: 'TRIM', order: 23, models: ['KDC','EVS'] },
  'T01-10-EE': { name: 'BMS, USB, Steering Column, Exterior & Side Cameras; Underbody Routing & Termination', line: 'TRIM', order: 24, models: ['KDC','EVS'] },
  'T01-10-01': { name: 'Electrical System Sub-Assembly',                                        line: 'TRIM', order: 25, models: ['KDC','EVS'] },
  'T01-11-EE': { name: 'First Start, Testing and Debugging; Camera Calibration',                line: 'TRIM', order: 26, models: ['KDC','EVS'] },
  'T01-11':    { name: 'ECAS & Fine Tuning of Passenger Doors (EVS) / A/C Refilling, Fine Tuning & Quality Inspection (KDC)', line: 'TRIM', order: 27, models: ['KDC','EVS'] },
  'T01-12':    { name: 'Quality Inspection and Rectification (TQ-01)',                          line: 'TRIM', order: 28, models: ['EVS'] },

  // ─── QUALITY INSPECTION & TESTING ────────────────────────────────────────────
  'Q01-01': { name: 'Test Registration',                                  line: 'QA', order: 1,  models: ['KDC','EVS'] },
  // EVS: Speed Test (electric — no exhaust); KDC: Vehicle Exhaust & Speed Test
  'Q01-02': { name: 'Speed Test (EVS) / Vehicle Exhaust & Speed Test (KDC)', line: 'QA', order: 2,  models: ['KDC','EVS'] },
  'Q01-03': { name: 'Wheel Alignment',                                    line: 'QA', order: 3,  models: ['KDC','EVS'] },
  'Q01-04': { name: 'Sound Level Inspection',                             line: 'QA', order: 4,  models: ['KDC','EVS'] },
  'Q01-05': { name: 'Head Lamp Aim Alignment',                            line: 'QA', order: 5,  models: ['KDC','EVS'] },
  'Q01-06': { name: 'Side Slip Test',                                     line: 'QA', order: 6,  models: ['KDC','EVS'] },
  'Q01-07': { name: 'Axle Load and Brake Test',                           line: 'QA', order: 7,  models: ['KDC','EVS'] },
  'Q01-08': { name: 'Test Report Generation',                             line: 'QA', order: 8,  models: ['KDC','EVS'] },
  'Q01-09': { name: 'Defects Rectification',                              line: 'QA', order: 9,  models: ['KDC','EVS'] },
  'Q01-10': { name: 'Chassis Anti-Corrosion & Underbody Plastic Primer',  line: 'QA', order: 10, models: ['KDC','EVS'] },
  'Q01-11': { name: 'Paint Inspection',                                   line: 'QA', order: 11, models: ['KDC','EVS'] },
  'Q01-12': { name: 'Paint Repair and Drying',                            line: 'QA', order: 12, models: ['KDC','EVS'] },
  'Q01-13': { name: 'Rain Test / Water Intrusion',                        line: 'QA', order: 13, models: ['KDC','EVS'] },
  'Q01-14': { name: 'Defects Rectification',                              line: 'QA', order: 14, models: ['KDC','EVS'] },
  'Q01-15': { name: 'Road Test / Whole Vehicle Dynamic Test',             line: 'QA', order: 15, models: ['KDC','EVS'] },
  'Q01-16': { name: 'Inspection / Decision Gate & Underbody Inspection',  line: 'QA', order: 16, models: ['KDC','EVS'] },
  'Q01-17': { name: 'Defects Rectification',                              line: 'QA', order: 17, models: ['KDC','EVS'] },
  'WASHING': { name: 'Washing Bay — Washing and Cleaning',               line: 'QA', order: 18, models: ['KDC','EVS'] },
};

// Helper: look up a station by code (case-insensitive, spaces→hyphens)
export function lookupStation(rawCode) {
  if (!rawCode) return null;
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, '-');
  return STATIONS[code] ? { code, ...STATIONS[code] } : null;
}
