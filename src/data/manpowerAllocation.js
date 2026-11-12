// Default operator pool per station, from "Production Manpower Allocation – All
// Shops v4" (Nov 2026), plus the newer "Production Manpower Allocation" (names
// added where they were missing; nobody from v4 removed). Used only when a station has no operators yet — no
// card filed there and nothing remembered on the device — so the Travel Card
// opens with the allocated staff instead of an empty list. Operators can still
// add and remove names on the card as usual.
//
// The document numbers some shops differently from the app (Machine Shop,
// Paint Shop, QIT), so names are placed by activity, not by the document's
// code. "FAM:CODE" keys apply to one model family only and win over "CODE".
// The KEC reuses the EVS chassis lists and the KDC welding/trim/paint lists.
// Leadership, buffer/transfer rows and stations with nobody are left out.

const VICTOR = ['Victor Bwanatai'];
const JOB = ['Eng. Job Masede'];
const DANIEL = ['Daniel Enyagu'];

const PRIMER = ['Joachim Jordan Mukuye', 'Sunday Lukyamuzi'];
const FOAMING = ['Benjamin Mulyanga', 'Allan Magembe', 'Collins Ssemadaali'];
const PUTTY = ['Martin Kizito', 'Remegious Kabiito'];
const GRINDING = ['Musa Kayondo', 'John Kayondo', 'Willy Ssebwana', 'Samuel Kiyingi Mpiima'];
const TOPCOAT = ['Sam Mikataro', 'Steven Ssenkaayi', 'Mark Kimula Musaazi'];
const MASKING = ['Vincent W Musitwa', 'Livingston Magala'];

const UHOOP = ['Onesmus Irunva', 'Jonathan Owiny', 'Alex Bakashaba', 'Lovisa Nyangoma'];

const AXLES = ['Mathias Kasumba', 'Ivan Ssekide', 'Peter Ochom'];
const DRIVE = ['Isaac Wandwasi', 'Nasser Kato'];
const MOTOR = ['Isaac Wandwasi', 'Nasser Kato', 'Peter Ochom'];
const TYRES = ['Ivan Ssekide', 'Nasser Kato', 'Denise Nfudu'];

export const MANPOWER = {
  // ── Machine Shop ────────────────────────────────────────────────────────────
  'B01-02': ['Sam Opolot'],             // Band saw
  'B01-03': ['Robert Musinguzi'],       // Tube laser cutting
  'B01-04': ['Hamisi Kalumba', 'Deogratius Mbehwereze'], // Circular saw
  'B02-01': ['Simon Wakunyaga'],        // Plate laser cutting
  'B02-05': ['Keneth Omodo'],           // Lathe, milling and drilling

  // ── Frame Parts Making ──────────────────────────────────────────────────────
  'B09-02': ['William Muhanguzi', 'Desmond Kiiza'],
  'B09-04': UHOOP,
  'B09-05': UHOOP,
  'B10-01A': UHOOP,
  'B10-01B': UHOOP,
  'B10-02': UHOOP,
  'B10-03': UHOOP,

  // ── Frame & Body Welding ────────────────────────────────────────────────────
  'W01-02': ['Edward Mucunguzi', 'Topher Nangholi'],
  'W01-03': ['Sam Odongo', 'Deogratius Mbehwereze'],
  'W01-04': ['Samuel Nabwiso', 'Moses Mungujakisa', 'Andrew Ikoba Waiswa', 'Vincent Andama'],
  'W01-05': ['Samuel Nabwiso', 'Moses Mungujakisa', 'Andrew Ikoba Waiswa', 'Vincent Andama'],
  'W01-06': ['Silver Mabeeri', 'Emmanuel Asianzu'],
  'W01-07': ['Innocent Naturinda'],
  'W01-08': ['Caroline Kiiza'],
  'W01-09': ['Caroline Kiiza'],
  'W01-10': ['Andrew Niyonzima', 'Davis Arinaitwe', 'Hamisi Kalumba'],
  'W01-11': ['Andrew Niyonzima', 'Davis Arinaitwe', 'Hamisi Kalumba'],
  'W01-12': ['Pricilia Lanyero'],
  'W01-13': ['Pricilia Lanyero'],

  // ── Chassis Line 01 ─────────────────────────────────────────────────────────
  'CQ-01': ['Calvin Otim'],
  'C01-01': ['Ivan Ssekide', 'Lucy Lean Sinakwoyo'],  // VIN engraving
  'C01-02': ['Steven Kato', 'Peter Ochom', 'Denise Nfudu'],
  'C01-03': ['Ivan Ssekide'],

  // ── Chassis Line 02 (document follows the EVS numbering) ────────────────────
  'C02-01': ['Roshan Kyasimire', 'James Twesige'],
  'C02-02': [...DRIVE, 'Oscar Anyeko'],
  'C02-03-01': AXLES,
  'C02-03': AXLES,
  'C02-04': MOTOR,
  'C02-06': [...TYRES, 'Burnet Kushaba Buhwezi'],
  'CQ-02': ['Ivan Ssekide', 'Mathias Kasumba'],
  'KDC:C02-03': MOTOR,                  // Engine cooling
  'KDC:C02-04-01': AXLES,
  'KDC:C02-04': AXLES,
  'KDC:C02-06': [],                     // Air intake & exhaust: nobody allocated
  'KDC:C02-07': TYRES,

  // ── Paint Shop (placed by activity) ─────────────────────────────────────────
  'P01-01': MASKING,                    // Body panel masking
  'P01-02': FOAMING,
  'P01-03': FOAMING,                    // Underbody anti-corrosion
  'P02-01': GRINDING,
  'P02-03': PRIMER,                     // Epoxy primer painting
  'P02-05': GRINDING,                   // Epoxy primer polishing
  'P03-01': GRINDING,                   // Panel beating, filler & fibre
  'P03-02': GRINDING,                   // Filler & fibre polishing
  'P04-01': PRIMER,                     // NC primer painting
  'P05-01': GRINDING,                   // Defects rectification
  'P05-02': PUTTY,
  'P05-03': PUTTY,
  'PQ-01': ['Deo Ssenkindu'],
  'P06-01': PRIMER,                     // Intermediate coat painting
  'P06-03': PUTTY,                      // Intermediate coat polishing
  'P07-01': TOPCOAT,
  'KDC:P07-02': TOPCOAT,                // Clear coat painting (KDC; KEC follows KDC)
  'KEC:P07-02': TOPCOAT,
  'P08-01': MASKING,
  'P08-02': TOPCOAT,
  'P08-04': MASKING,                    // Unmasking
  'PQ-02': ['Deo Ssenkindu'],

  // ── Trim Line & Final Assembly ──────────────────────────────────────────────
  'T01-01-01': ['Andrew Ogwal', 'Ogwel Lazarous', 'Geoffery Zaccheaus Opio', 'Waiswa Franco'],
  'T01-01-EE': ['Donato Oyuk Obbo'],
  'T01-02-01': ['Betty Kyalisiima', 'Sharon Nangobi'],
  'T01-02-EE': ['Gilbert Natusasiira'],
  'T01-03-01': ['Joseph Mayanja', 'Tom Machanja', 'Ntale Deogratius'],
  'T01-03-EE': ['Justus Emmanuel Akankunda'],
  'T01-04': ['Tonny Oluka', 'Douglas Okello', 'Asiimwe Ivan'],
  'T01-05': ['Percy Malvis Kato', 'Kiryowa Akram', 'Anatoli Muyingo'],
  'T01-06': ['Robin Kojo', 'Harunah Muhumuza'],
  'T01-07': ['Recheal Niwamanya'],
  'T01-07-EE': ['Jonath Natwijuka'],
  'T01-08': ['John Baidu Irege', 'Robert Ssemugabi'],
  'T01-08-EE': ['Jethro Basa Mukisa Kigobe'],
  'T01-09-01': ['Daniel Agec', 'Santo Okello', 'Owiny-Jiri Samuel'],
  'T01-09-EE': ['Ritah Grace Tino'],
  'T01-10-EE': ['Gerald Okok'],
  'T01-11': ['Deus Ashaba', 'Bilia Roger'],
  'T01-11-EE': ['Gerald Okok'],

  // ── Quality Inspection & Testing (placed by activity) ───────────────────────
  'Q01-01': VICTOR,
  'Q01-02': VICTOR,
  'Q01-03': VICTOR,
  'Q01-04': VICTOR,
  'Q01-05': VICTOR,
  'Q01-06': VICTOR,
  'Q01-07': VICTOR,
  'Q01-08': VICTOR,
  'Q01-09': JOB,
  'Q01-11': DANIEL,
  'Q01-13': DANIEL,
  'Q01-14': JOB,
  'Q01-15': DANIEL,
  'Q01-17': JOB,
};

const key = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');

// Allocated operators for a station code ("T01-02 EE", "c02-01b", …) and family.
export function manpowerFor(code, family) {
  const k = key(code);
  const fam = String(family || '').toUpperCase();
  const list = (fam ? MANPOWER[`${fam}:${k}`] : undefined) ?? MANPOWER[k] ?? [];
  return [...list];
}
