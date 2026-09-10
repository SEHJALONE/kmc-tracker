import { useState, useRef, useEffect, useCallback, useId, createContext, useContext, Children } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useScoreboardData, computeLineCard } from '../hooks/useScoreboardData';
import { buildProductionReport, defaultReference } from '../utils/productionReportPdf';
import { buildReportModel, monthBounds, monthName } from '../utils/productionReportModel';

// ── Theme-aware palettes ──────────────────────────────────────────────────
// Scoreboard keeps its own theme state (separate from the rest of the app —
// this is a standalone wall-display/export module) but follows the same
// toggle pattern as App.jsx: persisted choice, defaulting to dark.
//
// The token set mirrors the cockpit design language: a ground the backdrop
// photo shows through, translucent `glass`/`stat` card fills that float on
// it, an ink/ink2/muted text ramp, hairline `line`/`lineSoft` rules instead
// of hard borders, and every semantic colour paired with a low-saturation
// `…Wash` for chips and callouts.
//
// Deliberately NO color-mix() or backdrop-filter in the *fills* — html2canvas
// ignores both, and these pages are captured for the PNG/PDF/report exports.
// The fills are plain rgba/gradients so an export looks like the screen;
// blur and shadow are layered on top as screen-only polish.
const PALETTES = {
  dark: {
    bg: '#080d18', panel: '#111a2e', surface2: '#18233c', border: '#22314f',
    glass: 'linear-gradient(150deg, rgba(28,40,66,0.90), rgba(15,23,42,0.76))',
    stat: 'linear-gradient(150deg, rgba(34,48,78,0.86), rgba(17,26,46,0.62))',
    glassBorder: 'rgba(130,150,190,0.22)',
    red: '#e0392c', green: '#3ddc84', amber: '#f2b134', blue: '#5aa9e6',
    redWash: '#341a1a', greenWash: '#123021', amberWash: '#312611', blueWash: '#112438',
    ink: '#e9eff8', ink2: '#b6c4dc', muted: '#8291ae',
    line: '#22314f', lineSoft: '#1a2743',
    grey: '#8291ae', text: '#e9eff8', navy: '#18233c', rowAlt: 'transparent',
    header: '#0b1424', headerAlt: '#16233d', track: '#1b2740', rowBorder: '#1a2743',
    greenDeep: '#0f5c37', greenLite: '#8ff0bb', blueDeep: '#1d4f7c',
    gridline: 'rgba(146,166,200,0.16)', progressText: '#04210f',
    logo: '/kmc logo 2.png',
    overlay: 'linear-gradient(rgba(8,13,24,0.66), rgba(8,13,24,0.90))',
    pageWash: 'linear-gradient(rgba(8,13,24,0.87), rgba(8,13,24,0.95))',
    shadow: '0 1px 2px rgba(0,0,0,0.34), 0 10px 30px -14px rgba(0,0,0,0.72)',
    shadowLg: '0 2px 6px rgba(0,0,0,0.4), 0 26px 60px -22px rgba(0,0,0,0.8)',
  },
  light: {
    bg: '#e9edf1', panel: '#ffffff', surface2: '#eff2f6', border: '#dde2ea',
    glass: 'linear-gradient(150deg, rgba(255,255,255,0.90), rgba(255,255,255,0.72))',
    stat: 'linear-gradient(150deg, rgba(255,255,255,0.92), rgba(255,255,255,0.68))',
    glassBorder: 'rgba(255,255,255,0.78)',
    red: '#c81e20', green: '#1e8449', amber: '#b0701f', blue: '#2563a8',
    redWash: '#f9e8e8', greenWash: '#e3f1e8', amberWash: '#f7eddd', blueWash: '#e3ebf6',
    ink: '#000000', ink2: '#000000', muted: '#000000',
    line: '#dde2ea', lineSoft: '#eaedf3',
    grey: '#000000', text: '#000000', navy: '#eff2f6', rowAlt: 'transparent',
    header: '#ffffff', headerAlt: '#f4f6fa', track: '#dfe4ec', rowBorder: '#eaedf3',
    greenDeep: '#10502f', greenLite: '#5fcf92', blueDeep: '#17466f',
    gridline: 'rgba(22,32,58,0.10)', progressText: '#ffffff',
    // light mode uses the red-and-black lockup, so it needs no plate
    logo: '/kmc logo.png',
    overlay: 'linear-gradient(rgba(233,237,241,0.62), rgba(233,237,241,0.90))',
    pageWash: 'linear-gradient(rgba(233,237,241,0.87), rgba(233,237,241,0.95))',
    shadow: '0 1px 2px rgba(22,32,58,0.05), 0 10px 30px -14px rgba(22,32,58,0.24)',
    shadowLg: '0 2px 6px rgba(22,32,58,0.07), 0 24px 54px -20px rgba(22,32,58,0.30)',
  },
};

// One typeface across the whole board — Inter. (The reference splits UI and
// tabular text between Inter and IBM Plex Mono; per request this board stays
// on Inter, so figures get `font-variant-numeric: tabular-nums` for column
// alignment instead of a monospaced face.)
const UI_FONT = "'Inter', system-ui, sans-serif";
// Reference width of a board page: the layout the exports always reproduce,
// and the widest the board ever grows on screen. Declared up here because the
// responsive layout context below defaults to it.
const PAGE_WIDTH = 1320;
const BG_IMAGE = "url('/Bus background 5.png')";

const ThemeCtx = createContext(PALETTES.dark);
const useC = () => useContext(ThemeCtx);

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

// Workshops actually shown as line-status scorecards — Machine Shop, Frame & Body
// Parts Making, Quality Inspection & Testing, and Chassis Production Line 01 are
// excluded per request. Order: Trim, Chassis Line 02, Paint Shop, Body Shop.
// `dataName` matches the Tracker sheet's workshop name; `display` is the label shown.
const LINE_WORKSHOPS = [
  { dataName: 'Trim & Final Assembly', display: 'Trim & Final Assembly' },
  { dataName: 'Chassis Production Line 02', display: 'Chassis Line 02' },
  { dataName: 'Paint Shop', display: 'Paint Shop' },
  { dataName: 'Frame & Body Welding', display: 'Body Shop' },
];
const WORKSHOP_IMG = {
  'Trim & Final Assembly': '/Trim Line & Final Assembly.jpg',
  'Chassis Production Line 02': '/Chassis Line 02.jpg',
  'Paint Shop': '/Paint Shop.png',
  'Frame & Body Welding': '/Frame & Body Welding.png',
};

const DT_REASONS = ['M1 - Machine breakdown', 'M2 - Material shortage', 'M3 - Power/Energy',
  'M4 - Tooling/jig failure', 'M5 - Operator/skill gap', 'M6 - Quality rework stoppage', 'M7 - Other'];

// Sample data so the layout renders before the sheet is shared publicly.
const SAMPLE = {
  kv: {
    'Scoreboard Period Start': { raw: '01-Jul-2026' }, 'Scoreboard Period End': { raw: '31-Jul-2026' },
    'Program / Project Name': { raw: '45-BUS PRODUCTION PROJECT' }, 'Shift Label': { raw: 'DAY SHIFT' },
    'Program Target (vehicles)': { num: 45 },
    'Completed': { num: 16 }, 'In Production': { num: 26 }, 'Not Started (buses)': { num: 3 },
    'Achievement %': { num: 0.356 }, 'Behind Schedule (buses)': { num: 26 },
    'Forecast Completion': { raw: '27-Oct-2026' },
    'Buses per Day (period)': { num: 0.4 }, 'On-Time Delivery %': { num: 0 },
    'Avg Cycle Time (days)': { num: 36.8 }, 'SPI': { num: 0.55 },
    'On-Time %': { num: 0.13 }, 'Delayed %': { num: 0.87 }, 'Avg Schedule Delay (days)': { num: 23.9 },
    'Critical Activity': { raw: 'Frame & Body Parts Making' },
    'Available Hours': { num: 480 }, 'Planned Downtime (hrs)': { num: 40 },
    'Unplanned Downtime (hrs)': { num: 0.7 }, 'Total Hours Lost': { num: 40.7 },
    'Downtime % of Available': { num: 0.085 }, 'Breakdown Events (M1)': { num: 1 },
    'MTTR (hrs)': { num: 0.7 }, 'MTBF (hrs)': { num: 439 }, 'Downtime vs Baseline': { num: -0.99 },
    'OEE': { num: 0.33 }, 'Availability': { num: 0.92 }, 'Performance': { num: 0.36 },
    'M1 - Machine breakdown': { num: 0.7 }, 'M2 - Material shortage': { num: 0 },
    'M3 - Power/Energy': { num: 0 }, 'M4 - Tooling/jig failure': { num: 0 },
    'M5 - Operator/skill gap': { num: 0 }, 'M6 - Quality rework stoppage': { num: 0 },
    'M7 - Other': { num: 0 },
    'Vehicles Inspected': { num: 0, ytdNum: 0 }, 'First Pass Yield': { num: 0, ytdNum: 0 },
    'Rework Hours per Unit': { num: 0, ytdNum: 0 }, 'Critical Defects': { num: 0, ytdNum: 0 },
    'Defects Found': { num: 0, ytdNum: 0 }, 'Defects Closed': { num: 0, ytdNum: 0 },
    'Open Defects (YTD)': { num: 0, ytdNum: 0 }, 'Defects per Vehicle': { num: 0, ytdNum: 0 },
    'Days Without Lost-Time Injury': { num: 60 }, 'Lost-Time Injuries': { num: 0, ytdNum: 0 },
    'Recordable Incidents': { num: 0, ytdNum: 0 }, 'Near Misses Reported': { num: 0, ytdNum: 0 },
    'Near-Miss Response Rate': { num: 1, ytdNum: 1 }, 'PPE Misuse Incidents': { num: 0, ytdNum: 0 },
    'Unsafe Conditions': { num: 0, ytdNum: 0 }, 'Corrective Actions Closed': { num: 0, ytdNum: 0 },
    'Safety Inspection Compliance': { num: 1, ytdNum: 1 },
    'Energy per Unit (latest month, kWh)': { num: 0 }, 'Energy vs Baseline': { num: 0 },
    'Waste per Unit (period, kg)': { num: 0 }, 'Waste vs Baseline': { num: 0 },
    'Paper Used (latest month, reams)': { num: 0 }, 'Paper vs Baseline': { num: 0 },
    'Budget Total': { num: 704000 }, 'Actual Total': { num: 0 },
    'Variance': { num: -704000 }, 'Variance %': { num: -1 },
    'Production Operational Cost': { num: 0 }, 'Workshop Supplies per Unit': { num: 0 },
    'Labour Cost': { num: 0 }, 'Cost of Using the Production System': { num: 0 },
    'Operational Cost — Trim & Final Assembly': { num: 0 },
    'Operational Cost — Chassis Production Line 02': { num: 0 },
    'Operational Cost — Paint Shop': { num: 0 },
    'Operational Cost — Frame & Body Welding': { num: 0 },
    'Total Production Cost': { num: 0 },
    "Waste Cost (period, UGX '000)": { num: 0 }, 'Waste Items (period)': { num: 0 },
    'Kaizen Implemented': { num: 0 }, 'Kaizen In Progress': { num: 0 }, 'Kaizen Proposed': { num: 2 },
    'ECR Open': { num: 0 }, 'ECR Under Review': { num: 0 }, 'ECR Approved': { num: 0 }, 'ECR Implemented': { num: 0 },
    'Open Bottlenecks': { num: 0 },
    'Target: Buses per Day': { num: 3 }, 'Target: On-Time Delivery': { num: 0.95 },
    'Target: First Pass Yield': { num: 0.95 }, 'Target: OEE': { num: 0.8 },
    'Target: MTTR (hours)': { num: 3 }, 'Target: Cycle Time (days)': { num: 21 },
    'Baseline Unplanned Downtime (hrs / period)': { num: 60 },
  },
  workshops: [
    { name: 'Machine Shop', done: 3, due: 10, na: 35, pct: 0.3, status: 'DELAYED', constraint: 'None' },
    { name: 'Frame & Body Parts Making', done: 2, due: 10, na: 35, pct: 0.2, status: 'DELAYED', constraint: 'None' },
    { name: 'Chassis Production Line 01', done: 41, due: 45, na: 0, pct: 0.91, status: 'ON TRACK', constraint: 'None' },
    { name: 'Frame & Body Welding', done: 28, due: 45, na: 0, pct: 0.62, status: 'DELAYED', constraint: 'None' },
    { name: 'Paint Shop', done: 21, due: 45, na: 0, pct: 0.47, status: 'DELAYED', constraint: 'None' },
    { name: 'Chassis Production Line 02', done: 20, due: 45, na: 0, pct: 0.44, status: 'DELAYED', constraint: 'None' },
    { name: 'Trim & Final Assembly', done: 16, due: 40, na: 0, pct: 0.36, status: 'DELAYED', constraint: 'None' },
    { name: 'Quality Inspection & Testing', done: 0, due: 0, na: 0, pct: 0, status: 'ON TRACK', constraint: 'None' },
  ],
  lineCompletion: {
    'Trim & Final Assembly': { done: 16, target: 40, totalUnits: 45 },
    'Chassis Production Line 02': { done: 20, target: 45, totalUnits: 45 },
    'Paint Shop': { done: 21, target: 45, totalUnits: 45 },
    'Frame & Body Welding': { done: 28, target: 45, totalUnits: 45 },
  },
  machineCostRows: [
    { id: 'm1', stationCode: 'WLD-01', activity: 'Welding', machineName: 'MIG Welder A', rate: 12000, costK: 5760 },
    { id: 'm2', stationCode: 'PNT-01', activity: 'Spraying', machineName: 'Paint Booth 1', rate: 9000, costK: 4320 },
    { id: 'm3', stationCode: 'CHS-02', activity: 'Assembly', machineName: 'Chassis Jig B', rate: 6000, costK: 2880 },
  ],
  daily: [
    { date: 'Wed 1 Jul', planned: 2, actual: 1, cumPlan: 2, cumAct: 1, gap: -1 },
    { date: 'Thu 2 Jul', planned: 1, actual: 0, cumPlan: 3, cumAct: 1, gap: -2 },
    { date: 'Fri 3 Jul', planned: 1, actual: 0, cumPlan: 4, cumAct: 1, gap: -3 },
    { date: 'Sat 4 Jul', planned: 1, actual: 0, cumPlan: 5, cumAct: 1, gap: -4 },
    { date: 'Mon 6 Jul', planned: 1, actual: 0, cumPlan: 6, cumAct: 1, gap: -5 },
    { date: 'Tue 7 Jul', planned: 1, actual: 2, cumPlan: 7, cumAct: 3, gap: -4 },
    { date: 'Wed 8 Jul', planned: 2, actual: 0, cumPlan: 9, cumAct: 3, gap: -6 },
    { date: 'Thu 9 Jul', planned: 1, actual: 1, cumPlan: 10, cumAct: 4, gap: -6 },
    { date: 'Fri 10 Jul', planned: 1, actual: 0, cumPlan: 11, cumAct: 4, gap: -7 },
  ],
  busUnits: [
    {
      no: 1, vin: 'BUKBHZ6A8TJ000029', unit: '7m KEV 01', batch: '1', status: 'Done', done: true,
      cycleDays: 34, maxDelay: 2, completedOn: '2026-07-24', completedLabel: '24 Jul 2026',
      ws: {
        'Frame & Body Welding': { actualStart: '2026-07-01', actualEnd: '2026-07-09' },
        'Paint Shop': { actualStart: '2026-07-10', actualEnd: '2026-07-17' },
        'Chassis Production Line 02': { actualStart: '2026-07-20', actualEnd: '2026-07-20' },
        'Trim & Final Assembly': { actualStart: '2026-07-21', actualEnd: '2026-07-24' },
      },
    },
    {
      no: 2, vin: 'BUKBHZ6A8TJ000030', unit: '7m KEV 02', batch: '1', status: 'Done', done: true,
      cycleDays: 31, maxDelay: 0, completedOn: '2026-07-31', completedLabel: '31 Jul 2026',
      ws: {
        'Frame & Body Welding': { actualStart: '2026-07-06', actualEnd: '2026-07-14' },
        'Paint Shop': { actualStart: '2026-07-15', actualEnd: '2026-07-21' },
        'Chassis Production Line 02': { actualStart: '2026-07-22', actualEnd: '2026-07-23' },
        'Trim & Final Assembly': { actualStart: '2026-07-24', actualEnd: '2026-07-31' },
      },
    },
    {
      no: 3, vin: 'BUKBHZ6A8TJ000031', unit: '7m KEV 03', batch: '1', status: 'In Production', done: false,
      cycleDays: null, maxDelay: 5, completedOn: '2026-07-28', completedLabel: '28 Jul 2026',
      ws: {
        'Frame & Body Welding': { actualStart: '2026-07-13', actualEnd: '2026-07-24' },
        'Paint Shop': { actualStart: '2026-07-27', actualEnd: '2026-07-28' },
        'Chassis Production Line 02': {},
        'Trim & Final Assembly': {},
      },
    },
  ],
  bottlenecks: [], kaizen: [], ecr: [], waste: [],
  fpyTrend: [
    { label: 'May 26', value: 0.68 }, { label: 'Jun 26', value: 0.71 }, { label: 'Jul 26', value: 0 },
  ],
  downtimeTrend: [
    { label: 'May 26', value: 18 }, { label: 'Jun 26', value: 9 }, { label: 'Jul 26', value: 0.7 },
  ],
  overallMonthly: [
    { label: 'May 26', planned: 8, actual: 6 }, { label: 'Jun 26', planned: 10, actual: 7 }, { label: 'Jul 26', planned: 9, actual: 3 },
  ],
  linePlannedVsActual: {
    'Trim & Final Assembly':  [{ label: 'May 26', planned: 8, actual: 6 }, { label: 'Jun 26', planned: 10, actual: 7 }, { label: 'Jul 26', planned: 9, actual: 3 }],
    'Chassis Production Line 02': [{ label: 'May 26', planned: 5, actual: 4 }, { label: 'Jun 26', planned: 6, actual: 5 }, { label: 'Jul 26', planned: 6, actual: 2 }],
    'Paint Shop':             [{ label: 'May 26', planned: 6, actual: 5 }, { label: 'Jun 26', planned: 7, actual: 6 }, { label: 'Jul 26', planned: 6, actual: 3 }],
    'Frame & Body Welding':   [{ label: 'May 26', planned: 9, actual: 7 }, { label: 'Jun 26', planned: 9, actual: 8 }, { label: 'Jul 26', planned: 8, actual: 4 }],
  },
};

// ── formatting helpers ──────────────────────────────────────────
const fpct  = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fpct1 = v => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const f1    = v => (v == null ? '—' : Number(v).toFixed(1));
const f2    = v => (v == null ? '—' : Number(v).toFixed(2));
const fint  = v => (v == null ? '—' : Math.round(v).toLocaleString());

// SVG-only donut (CSS conic-gradient is silently blank in html2canvas exports —
// this renders as plain circles/text so PNG/PDF capture keeps the ring).
function Donut({ pct, color, size = 58, thickness = 14 }) {
  const C = useC();
  const p = Math.max(0, Math.min(100, Math.round((pct || 0) * 100)));
  const r = (size - thickness - 6) / 2, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (p / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.track} strokeWidth={thickness} />
      {/* at 0% the rounded cap would still paint a stray dot at 12 o'clock,
          so the arc is simply not drawn */}
      {p > 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.25} fontWeight="700" fill={C.ink}
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{p}%</text>
    </svg>
  );
}

// Small pill badge — the reference's `.chip`, used for period/shift/status
// metadata that used to be spelled out in label:value rows.
function Chip({ children, tone }) {
  const C = useC();
  const tones = {
    ok: [C.greenWash, C.green], warn: [C.amberWash, C.amber],
    crit: [C.redWash, C.red], info: [C.blueWash, C.blue],
  };
  const [bg, fg] = tones[tone] || [C.surface2, C.ink2];
  return (
    <span style={{
      fontFamily: UI_FONT, fontSize: 10.5, fontWeight: 600, padding: '3.5px 9px',
      borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap',
      letterSpacing: '0.02em',
    }}>{children}</span>
  );
}

// Section divider. Was a solid red banner; now an eyebrow label with a red
// leading tick and a hairline rule running out to the edge — the same
// low-chrome treatment the cockpit uses, with KMC red kept as the accent.
function SectionLabel({ children, right }) {
  const C = useC();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '3px 0 1px' }}>
      <span style={{ width: 3.5, height: 15, background: C.red, borderRadius: 2, flex: '0 0 auto' }} />
      <span style={{
        fontFamily: UI_FONT, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: C.ink, whiteSpace: 'nowrap',
      }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: C.line }} />
      {right}
    </div>
  );
}

// The reusable KPI tile — the reference's `.stat`: translucent gradient glass
// on a hairline highlight border, label above, one large tabular figure below.
function ScoreCard({ label, value, valueColor }) {
  const C = useC();
  return (
    <div style={{
      background: C.stat, border: `1px solid ${C.glassBorder}`, borderRadius: 13,
      padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 1,
      alignItems: 'center', textAlign: 'center',
      boxShadow: C.shadow, minHeight: 62,
    }}>
      <div style={{
        fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', lineHeight: 1.35, minHeight: '2.2em',
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: valueColor || C.ink, lineHeight: 1.15,
        letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word',
      }}>{value}</div>
    </div>
  );
}

// ── Responsive layout ────────────────────────────────────────────────────
// Breakpoints are driven by the PAGE's own measured width, never by the
// viewport. That distinction is what makes exports device-independent: a
// capture pins the page to PAGE_WIDTH, the observer below reports the new
// width, and the board re-lays out as the full desktop grid even on a phone.
// Viewport media queries would instead bake the phone layout into the PNG.
//
// `auto-fit`+`minmax` alone can't express this either — it ramps smoothly, so
// eight KPI tiles would end up on one 1320px row instead of two rows of four.
const PageWidthCtx = createContext(PAGE_WIDTH);
const usePageWidth = () => useContext(PageWidthCtx);

// Column count for `max` tiles at container width `w`.
function colsFor(w, max) {
  if (w >= 1120) return max;
  if (w >= 880) return Math.min(max, 4);
  if (w >= 640) return Math.min(max, 3);
  if (w >= 330) return Math.min(max, 2);
  return 1;
}
// Never leave a single tile stranded on its own last row — four line-status
// cards in three columns reads as 3 + 1, which looks like a mistake.
function noOrphan(cols, count) {
  if (!count || cols <= 2 || count <= cols || count % cols !== 1) return cols;
  for (let c = cols - 1; c >= 2; c--) if (count % c !== 1) return c;
  return cols;
}

// Charts need far more room per tile than a stat tile does.
function chartCols(w) { return w >= 1140 ? 4 : w >= 600 ? 2 : 1; }
// The four line-status cards carry a 90px donut plus a photo.
function lineCols(w) { return w >= 1040 ? 4 : w >= 700 ? 3 : w >= 440 ? 2 : 1; }

const grid = (cols, gap = 8) => ({
  display: 'grid',
  gridTemplateColumns: typeof cols === 'string' ? cols : `repeat(${cols}, minmax(0, 1fr))`,
  gap,
});

function CardGrid({ cols = 4, children }) {
  const w = usePageWidth();
  return <div style={grid(noOrphan(colsFor(w, cols), Children.count(children)))}>{children}</div>;
}

// A page-level grid row. `cols` is either a tile count or a function of the
// measured page width; either way it is resolved INSIDE the page, where the
// width context lives.
function Row({ cols, gap = 8, children }) {
  const w = usePageWidth();
  const resolved = typeof cols === 'function' ? cols(w) : colsFor(w, cols);
  const tracks = typeof resolved === 'number' ? noOrphan(resolved, Children.count(children)) : resolved;
  return <div style={grid(tracks, gap)}>{children}</div>;
}

// Glass card. The red title bar is gone — the title now sits as a plain
// heading on the card itself with an optional chip on the right, so the eye
// lands on the data rather than on a wall of red.
function Panel({ title, chip, children, style }) {
  const C = useC();
  return (
    <div style={{
      background: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 14,
      display: 'flex', flexDirection: 'column', padding: '11px 13px 12px',
      boxShadow: C.shadow, minWidth: 0, ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, marginBottom: 9,
      }}>
        <div style={{
          fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: '-0.008em',
          lineHeight: 1.28,
        }}>{title}</div>
        {chip}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// Shared table chrome: mono uppercase column heads over a hairline rule, no
// zebra fill, figures set in tabular mono and the label column in Inter — the
// cockpit's table treatment.
const thStyle = (C, align = 'left') => ({
  fontFamily: UI_FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: C.ink, padding: '0 6px 6px',
  textAlign: align, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap',
});
const tdStyle = (C, { first = false, align = 'left', strong = false } = {}) => ({
  padding: '5px 6px', textAlign: align,
  borderBottom: `1px solid ${C.lineSoft}`,
  color: strong ? C.ink : first ? C.ink : C.ink2,
  fontFamily: first ? 'inherit' : UI_FONT,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: strong ? 700 : 400,
});

// Tables get their own horizontal scroller: on a phone a six-column register
// would otherwise stretch its card and blow out the whole grid.
function TableScroll({ children, min = 380 }) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: min }}>{children}</div>
    </div>
  );
}

function MiniTable({ headers, rows, empty }) {
  const C = useC();
  return (
    <TableScroll min={Math.max(300, headers.length * 78)}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>{headers.map(h => <th key={h} style={thStyle(C)}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} style={{ padding: '9px 6px', color: C.muted }}>{empty}</td></tr>
        ) : rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={tdStyle(C, { first: j === 0 })}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </TableScroll>
  );
}

// Same header row pattern used by the original downtime table (section 7):
// total available / planned / unplanned, one row per M-code, then total lost.
function DowntimeTable({ kv }) {
  const C = useC();
  const num = (key) => kv[key]?.num ?? null;
  const avail = num('Available Hours') || 0;
  const rows = [
    ['Total Available Production Hours', fint(avail), '100%'],
    ['Planned Downtime', f1(num('Planned Downtime (hrs)')), avail ? fpct1((num('Planned Downtime (hrs)') || 0) / avail) : '—'],
    ['Unplanned Downtime', f1(num('Unplanned Downtime (hrs)')), avail ? fpct1((num('Unplanned Downtime (hrs)') || 0) / avail) : '—'],
    ...DT_REASONS.map(r => [`— ${r}`, f1(num(r)), avail ? fpct1((num(r) || 0) / avail) : '—']),
  ];
  return (
    <TableScroll min={320}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          <th style={thStyle(C)}>Description</th>
          <th style={thStyle(C, 'right')}>Hours</th>
          <th style={thStyle(C, 'right')}>%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={tdStyle(C, { first: true })}>{r[0]}</td>
            <td style={tdStyle(C, { align: 'right' })}>{r[1]}</td>
            <td style={tdStyle(C, { align: 'right' })}>{r[2]}</td>
          </tr>
        ))}
        {/* total row: a top rule and full-ink figures, no fill */}
        <tr>
          <td style={{ ...tdStyle(C, { first: true, strong: true }), borderTop: `1px solid ${C.line}`, borderBottom: 'none' }}>
            Total Production Hours Lost
          </td>
          <td style={{ ...tdStyle(C, { align: 'right', strong: true }), borderTop: `1px solid ${C.line}`, borderBottom: 'none' }}>
            {f1(num('Total Hours Lost'))}
          </td>
          <td style={{ ...tdStyle(C, { align: 'right', strong: true }), borderTop: `1px solid ${C.line}`, borderBottom: 'none' }}>
            {fpct1(num('Downtime % of Available'))}
          </td>
        </tr>
      </tbody>
    </table>
    </TableScroll>
  );
}

// Shared vertical-axis gridlines + tick labels + rotated axis title, so every
// custom SVG chart on the board reads its scale instead of just trend shape.
// Rounds a step up to a "nice" 1/2/5 × 10^n value so axis ticks land on
// clean numbers instead of arbitrary fractions.
function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const frac = rough / base;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * base;
}

// Computes a clean axis ceiling + step so ticks never round to duplicate
// labels — e.g. a 0-1 data range split into fixed fractional ticks used to
// round to "1, 1, 0, 0". integer=true rounds the step up to whole numbers,
// for count-based charts (buses, vehicles); false allows decimal steps
// (percentages, hours). Also the single source of scale for both the axis
// and the chart's own data points, so gridlines and marks always agree.
function niceAxis(dataMax, targetTicks = 4, integer = false) {
  const bumped = Math.max(dataMax, integer ? 1 : 0.0001) * 1.06;
  let step = niceStep(bumped / targetTicks);
  if (integer) step = Math.max(1, Math.round(step));
  const niceMax = Math.ceil(bumped / step) * step;
  const tickCount = Math.max(1, Math.round(niceMax / step));
  return { niceMax, step, tickCount };
}

// Bar path with rounded TOP corners only, bottom anchored square to the
// baseline (a plain <rect rx> rounds all four corners, which reads wrong for
// a bar anchored at zero). h<=0 collapses to nothing rather than a negative path.
function barPath(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

// Vertical bar gradient (solid at the cap, fading toward the baseline) and the
// matching area-under-line wash. Both live in one <defs> helper so every chart
// gets the same treatment, and both are plain SVG gradients — html2canvas
// serialises inline SVG faithfully, unlike the CSS gradients it drops.
function BarGradient({ id, color }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity="1" />
      <stop offset="100%" stopColor={color} stopOpacity="0.42" />
    </linearGradient>
  );
}
function AreaGradient({ id, color }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity="0.34" />
      <stop offset="100%" stopColor={color} stopOpacity="0" />
    </linearGradient>
  );
}

// Solid baseline + a small circle marker per category, evoking a timeline —
// used by the monthly bar charts (Downtime, Planned vs Actual, Output by Line).
function AxisTimeline({ C, y0, padL, padR, w, positions }) {
  return (
    <>
      <line x1={padL} y1={y0} x2={w - padR} y2={y0} stroke={C.line} strokeWidth="1.2" />
      {positions.map((cx, i) => (
        <circle key={i} cx={cx} cy={y0} r="2.6" fill={C.panel} stroke={C.muted} strokeWidth="1.2" />
      ))}
    </>
  );
}

// Legend row shared by the charts — the reference's `.legend`/`.lg`/`.sw`:
// a 9px rounded swatch beside 11.5px label text.
function Legend({ items }) {
  const C = useC();
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 5 }}>
      {items.map(it => (
        <span key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: C.ink2 }}>
          <span style={{
            width: 9, height: 9, borderRadius: 2.5, background: it.color, flex: '0 0 auto',
          }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

function YAxis({ niceMax, step, tickCount, padL, padT, padB, h, w, title, fmt = (v) => Math.round(v) }) {
  const C = useC();
  const yFor = v => h - padB - (v / niceMax) * (h - padB - padT);
  return (
    <>
      {Array.from({ length: tickCount + 1 }).map((_, i) => {
        const val = step * i, yy = yFor(val);
        return (
          <g key={i}>
            {/* solid hairline gridlines, no dashes — quieter behind the marks */}
            <line x1={padL} y1={yy} x2={w - 12} y2={yy} stroke={C.gridline} strokeWidth="1" />
            <text x={padL - 6} y={yy + 3} fontSize="7.5" fill={C.muted} textAnchor="end"
              fontFamily={UI_FONT}>{fmt(val)}</text>
          </g>
        );
      })}
      <text x={10} y={(h - padB + padT) / 2} fontSize="8" fill={C.muted} textAnchor="middle"
        fontFamily={UI_FONT} letterSpacing="0.06em"
        transform={`rotate(-90 10 ${(h - padB + padT) / 2})`}>{title}</text>
    </>
  );
}

// Cumulative throughput is a running total of buses manufactured over a
// period — a line, not discrete bars, so the trend of the running count
// actually reads as a trend. Points come pre-filtered to whatever window the
// caller wants (e.g. the selected range).
function CumChart({ daily }) {
  const C = useC();
  const uid = useId().replace(/[:]/g, '');
  const w = 460, h = 190, padL = 34, padR = 12, padT = 12, padB = 26;
  const pts = daily.filter(d => d.cumAct != null);
  if (pts.length < 2) return <div style={{ color: C.muted, fontSize: 10, padding: 20, textAlign: 'center' }}>No output data yet in this range.</div>;
  const dataMax = Math.max(...pts.map(d => d.cumAct), 1);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 4, true);
  const x = i => padL + i * ((w - padL - padR) / (pts.length - 1));
  const y = v => h - padB - (v / niceMax) * (h - padB - padT);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cumAct).toFixed(1)}`).join(' ');
  const area = `${path} L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const showEvery = Math.max(1, Math.ceil(pts.length / 8));
  const last = pts.length - 1;
  return (
    <div>
      <Legend items={[{ name: 'Actual (cum.)', color: C.green }]} />
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
        <defs><AreaGradient id={`ca${uid}`} color={C.green} /></defs>
        <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title="Vehicles (cum.)" />
        <path d={area} fill={`url(#ca${uid})`} stroke="none" />
        <path d={path} fill="none" stroke={C.green} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            {(i % showEvery === 0 || i === last) && <circle cx={x(i)} cy={y(p.cumAct)} r="3" fill={C.panel} stroke={C.green} strokeWidth="2" />}
            {i % showEvery === 0 && (
              <text x={x(i)} y={h - 8} fontSize="7.5" fill={C.muted} textAnchor="middle" fontFamily={UI_FONT}>
                {String(p.date).split(' ').slice(-2).join(' ')}
              </text>
            )}
          </g>
        ))}
        {/* the running total is the number that matters — call out the last point */}
        <circle cx={x(last)} cy={y(pts[last].cumAct)} r="5.5" fill={C.green} opacity="0.22" />
        <circle cx={x(last)} cy={y(pts[last].cumAct)} r="3.2" fill={C.green} />
        <text x={x(last)} y={y(pts[last].cumAct) - 9} fontSize="9.5" fill={C.ink} textAnchor="middle" fontWeight="600" fontFamily={UI_FONT}>
          {pts[last].cumAct}
        </text>
      </svg>
    </div>
  );
}


// Single-series monthly bar chart — used for the Downtime trend now that
// it's a bar chart, not a line, per request.
function MonthlyBarChart({ points, color, axisTitle, fmt = (v) => f1(v) }) {
  const C = useC();
  const uid = useId().replace(/[:]/g, '');
  if (!points || points.length === 0) {
    return <div style={{ color: C.muted, fontSize: 10, padding: '26px 0', textAlign: 'center' }}>No monthly entries logged yet — add rows to the Monthly Downtime Log tab.</div>;
  }
  const w = 460, h = 160, padL = 34, padR = 12, padT = 18, padB = 26;
  const dataMax = Math.max(...points.map(p => p.value), 0.0001);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 4, false);
  const bw = (w - padL - padR) / points.length;
  const yFor = v => h - padB - (v / niceMax) * (h - padB - padT);
  const y0 = yFor(0);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs><BarGradient id={`mb${uid}`} color={color} /></defs>
      <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title={axisTitle || ''} />
      {points.map((p, i) => {
        const x0 = padL + i * bw, pw = bw * 0.5;
        return (
          <g key={i}>
            {/* faint full-height ghost so short bars still read against the scale */}
            <path d={barPath(x0 + bw * 0.25, padT, pw, Math.max(0, y0 - padT))} fill={C.gridline} />
            <path d={barPath(x0 + bw * 0.25, yFor(p.value), pw, Math.max(0, y0 - yFor(p.value)))}
              fill={`url(#mb${uid})`} stroke={color} strokeWidth="0.6" />
            <text x={x0 + bw / 2} y={yFor(p.value) - 6} fontSize="8.5" fill={C.ink} textAnchor="middle" fontWeight="600" fontFamily={UI_FONT}>{fmt(p.value)}</text>
          </g>
        );
      })}
      <AxisTimeline C={C} y0={y0} padL={padL} padR={padR} w={w} positions={points.map((_, i) => padL + i * bw + bw / 2)} />
      {points.map((p, i) => (
        <text key={p.label} x={padL + i * bw + bw / 2} y={h - 6} fontSize="7.5" fill={C.muted} textAnchor="middle" fontFamily={UI_FONT}>{p.label}</text>
      ))}
    </svg>
  );
}

// Grouped monthly Planned-vs-Actual bar chart, spanning the whole
// production timeline (no slicing to a recent window).
function MonthlyPlanActualChart({ points, axisTitle = 'Buses' }) {
  const C = useC();
  const uid = useId().replace(/[:]/g, '');
  const pts = (points || []).filter(p => p.planned != null || p.actual != null);
  if (pts.length === 0) {
    return <div style={{ color: C.muted, fontSize: 10, padding: '20px 0', textAlign: 'center' }}>No monthly data yet.</div>;
  }
  const w = 460, h = 160, padL = 30, padR = 10, padT = 10, padB = 22;
  const dataMax = Math.max(...pts.map(d => d.planned || 0), ...pts.map(d => d.actual ?? 0), 1);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 3, true);
  const bw = (w - padL - padR) / pts.length;
  const yFor = v => h - padB - (v / niceMax) * (h - padB - padT);
  const y0 = yFor(0);
  return (
    <div>
      <Legend items={[{ name: 'Planned', color: C.blue }, { name: 'Actual', color: C.green }]} />
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
        <defs>
          <BarGradient id={`pp${uid}`} color={C.blue} />
          <BarGradient id={`pa${uid}`} color={C.green} />
        </defs>
        <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title={axisTitle} />
        {pts.map((d, i) => {
          const x0 = padL + i * bw, pw = bw * 0.32;
          const planned = d.planned || 0;
          return (
            <g key={i}>
              <path d={barPath(x0 + bw * 0.1, yFor(planned), pw, Math.max(0, y0 - yFor(planned)))}
                fill={`url(#pp${uid})`} stroke={C.blue} strokeWidth="0.6" />
              {planned > 0 && <text x={x0 + bw * 0.1 + pw / 2} y={yFor(planned) - 4} fontSize="7" fill={C.ink2} textAnchor="middle" fontWeight="600" fontFamily={UI_FONT}>{planned}</text>}
              {d.actual != null && (
                <>
                  <path d={barPath(x0 + bw * 0.5, yFor(d.actual), pw, Math.max(0, y0 - yFor(d.actual)))}
                    fill={`url(#pa${uid})`} stroke={C.green} strokeWidth="0.6" />
                  {d.actual > 0 && <text x={x0 + bw * 0.5 + pw / 2} y={yFor(d.actual) - 4} fontSize="7" fill={C.ink2} textAnchor="middle" fontWeight="600" fontFamily={UI_FONT}>{d.actual}</text>}
                </>
              )}
            </g>
          );
        })}
        {/* dot centers on the true midpoint of the planned+actual bar cluster
            ([0.1bw, 0.5bw+pw] = [0.1bw, 0.82bw]), not bw/2 which sits visibly
            off-center between the two bars */}
        <AxisTimeline C={C} y0={y0} padL={padL} padR={padR} w={w} positions={pts.map((_, i) => padL + i * bw + bw * 0.46)} />
        {pts.map((d, i) => (
          <text key={d.label} x={padL + i * bw + bw * 0.46} y={h - 6} fontSize="7" fill={C.muted} textAnchor="middle" fontFamily={UI_FONT}>{d.label}</text>
        ))}
      </svg>
    </div>
  );
}

// Date helper — plain 'YYYY-MM-DD' strings compare correctly as-is, so no
// Generic monthly trend line — used for FPY%.
function TrendChart({ points, color, fmt, axisTitle, axisFmt }) {
  const C = useC();
  const uid = useId().replace(/[:]/g, '');
  if (!points || points.length < 2) {
    return <div style={{ color: C.muted, fontSize: 10, padding: '26px 0', textAlign: 'center' }}>Not enough monthly history yet — needs at least two months of logged rows.</div>;
  }
  const w = 460, h = 160, padL = 34, padR = 12, padT = 18, padB = 26;
  const vals = points.map(p => p.value);
  const dataMax = Math.max(...vals, 0.0001);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 4, false);
  const x = i => padL + i * ((w - padL - padR) / (points.length - 1));
  const y = v => h - padB - (v / niceMax) * (h - padB - padT);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs><AreaGradient id={`tr${uid}`} color={color} /></defs>
      <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title={axisTitle || ''} fmt={axisFmt || (v => Math.round(v))} />
      <path d={area} fill={`url(#tr${uid})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.2" fill={C.panel} stroke={color} strokeWidth="2" />
          <text x={x(i)} y={h - 6} fontSize="7.5" fill={C.muted} textAnchor="middle" fontFamily={UI_FONT}>{p.label}</text>
          <text x={x(i)} y={y(p.value) - 8} fontSize="8.5" fill={C.ink} textAnchor="middle" fontWeight="600" fontFamily={UI_FONT}>{fmt(p.value)}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Email modal (posts to the Vercel /api/send-report function) ───────────
function ScoreboardEmailModal({ onClose, capturePages }) {
  const C = useC();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('KMC DPN Scoreboard');
  const [schedule, setSchedule] = useState('now');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [weekday, setWeekday] = useState('MON');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  async function send() {
    if (!to.trim()) { setStatus({ ok: false, msg: 'Enter a recipient email.' }); return; }
    setBusy(true); setStatus(null);
    try {
      const canvases = await capturePages();
      const stamp = localISODate();
      const attachments = canvases.map((cv, i) => ({
        filename: `KMC_Scoreboard_p${i + 1}_${stamp}.png`,
        dataUrl: cv.toDataURL('image/png'),
      }));
      // Always same-origin — see EmailModal.jsx for why this isn't read from
      // VITE_EMAIL_ENDPOINT (a committed .env value that drifts from prod).
      const res = await fetch('/api/send-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, schedule, scheduledTime, weekday, busCount: 0, attachments }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const out = await res.json();
      setStatus({ ok: true, msg: out.scheduled ? `Scheduled (${schedule} at ${scheduledTime}).` : 'Report sent.' });
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  const field = { width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.line}`, color: C.ink, borderRadius: 9, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit' };
  const label = { fontFamily: UI_FONT, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5, display: 'block' };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,16,30,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.glassBorder}`, borderRadius: 16, width: 'min(440px, 92vw)', padding: 20, color: C.ink, boxShadow: C.shadowLg, fontFamily: "'Inter', Arial, sans-serif" }}>
        <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.014em', marginBottom: 15 }}>
          Email Scoreboard
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><span style={label}>To</span><input style={field} value={to} onChange={e => setTo(e.target.value)} placeholder="name@kmc.co.ug" /></div>
          <div><span style={label}>Subject</span><input style={field} value={subject} onChange={e => setSubject(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={label}>Schedule</span>
              <select style={field} value={schedule} onChange={e => setSchedule(e.target.value)}>
                <option value="now">Send now</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {schedule !== 'now' && (
              <div style={{ flex: 1 }}>
                <span style={label}>Time</span>
                <input type="time" style={field} value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
              </div>
            )}
            {schedule === 'weekly' && (
              <div style={{ flex: 1 }}>
                <span style={label}>Day</span>
                <select style={field} value={weekday} onChange={e => setWeekday(e.target.value)}>
                  {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            )}
          </div>
          {status && (
            <div style={{ fontSize: 11.5, color: status.ok ? C.green : C.red }}>{status.msg}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ background: C.surface2, border: 'none', color: C.ink2, borderRadius: 10, padding: '9px 15px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
            <button onClick={send} disabled={busy} style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 10, padding: '9px 17px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Capturing…' : schedule === 'now' ? 'Send' : 'Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Production Report modal ───────────────────────────────────────────────
// The preliminary form for the monthly Production Report. Everything the
// template leaves blank is filled here up front: the reporting month (which
// is all that appears on the cover, and what Annex A is sliced to) plus the
// three empty Document Version History cells — Reference No., Issue Date and
// Last Review Date.
//
// Choosing a month also moves the board's own selected range to that month
// before the pages are captured, so the embedded screenshots report the same
// period as Annex A.
function ProductionReportModal({ onClose, capturePages, buses, month, setMonth, applyMonthRange }) {
  const C = useC();
  const [referenceNo, setReferenceNo] = useState(() => defaultReference(month));
  const [issueDate, setIssueDate] = useState(() => localISODate());
  const [lastReviewDate, setLastReviewDate] = useState('');
  const [versionNo, setVersionNo] = useState('00');
  const [nextReview, setNextReview] = useState('AS REQUIRED');
  const [refTouched, setRefTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  // The reference number tracks the month until the preparer overrides it.
  useEffect(() => { if (!refTouched) setReferenceNo(defaultReference(month)); }, [month, refTouched]);

  const model = buildReportModel({ buses, month });

  async function generate() {
    setBusy(true); setStatus(null);
    try {
      applyMonthRange(month);
      // Let the board re-render against the month before it is captured. A
      // plain timer, not requestAnimationFrame — rAF is suspended while the
      // tab is in the background, which would hang the export the moment the
      // operator switched away.
      await new Promise(r => setTimeout(r, 450));
      const pageCanvases = await capturePages();
      const pdf = await buildProductionReport({
        meta: { month, referenceNo, issueDate, lastReviewDate, versionNo, nextReview },
        buses,
        pageCanvases,
      });
      pdf.save(`KMC_Production_Report_${month}.pdf`);
      setStatus({ ok: true, msg: `Report generated for ${monthName(month)}.` });
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  const field = { width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.line}`, color: C.ink, borderRadius: 9, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit' };
  const label = { fontFamily: UI_FONT, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5, display: 'block' };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,16,30,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.glassBorder}`, borderRadius: 16, width: 'min(500px, 92vw)', padding: 20, color: C.ink, boxShadow: C.shadowLg, fontFamily: "'Inter', Arial, sans-serif" }}>
        <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.014em', marginBottom: 15 }}>
          Production Report (PDF)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><span style={label}>Reporting Month</span>
            <input type="month" style={field} value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></div>

          <div style={{ fontFamily: UI_FONT, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>
            Document Version History
          </div>
          <div><span style={label}>Reference No.</span>
            <input style={field} value={referenceNo}
              onChange={e => { setRefTouched(true); setReferenceNo(e.target.value); }} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><span style={label}>Issue Date</span>
              <input type="date" style={field} value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
            <div style={{ flex: 1 }}><span style={label}>Last Review Date</span>
              <input type="date" style={field} value={lastReviewDate} onChange={e => setLastReviewDate(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><span style={label}>Version No.</span>
              <input style={field} value={versionNo} onChange={e => setVersionNo(e.target.value)} /></div>
            <div style={{ flex: 1 }}><span style={label}>Next Review Date</span>
              <input style={field} value={nextReview} onChange={e => setNextReview(e.target.value)} /></div>
          </div>

          <div style={{ fontSize: 11.5, color: C.ink2 }}>
            Annex A will list the {model.completedCount} bus{model.completedCount === 1 ? '' : 'es'} completed
            in {monthName(month)}.
          </div>
          {status && <div style={{ fontSize: 11.5, color: status.ok ? C.green : C.red }}>{status.msg}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ background: C.surface2, border: 'none', color: C.ink2, borderRadius: 10, padding: '9px 15px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
            <button onClick={generate} disabled={busy} style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 10, padding: '9px 17px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Building…' : 'Generate PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Range & per-line target selector — mirrors the "⚙ Set Targets" panel in
// the standalone workbook view (public/dpn-scoreboard-workbook.html): a date
// range that drives the "selected range" Planned vs Actual chart, plus an
// optional manual target override per line (blank = auto, computed from the
// Tracker). Not captured in exports — rendered outside the Page refs.
function RangeTargetPanel({ range, setRange, lineTargets, setLineTargets }) {
  const C = useC();
  const field = { background: C.surface2, border: `1px solid ${C.line}`, color: C.ink, borderRadius: 9, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit' };
  const label = { fontFamily: UI_FONT, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5, display: 'block' };
  return (
    <div style={{
      maxWidth: PAGE_WIDTH, margin: '0 auto 10px', background: C.glass, border: `1px solid ${C.glassBorder}`,
      borderRadius: 14, padding: 16, boxShadow: C.shadow,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.014em', marginBottom: 12, color: C.ink }}>
        Selected Range &amp; Line Targets
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
        <div><span style={label}>Range Start</span>
          <input type="date" style={field} value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} />
        </div>
        <div><span style={label}>Range End</span>
          <input type="date" style={field} value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} />
        </div>
        <button
          onClick={() => setLineTargets({})}
          style={{ background: C.surface2, border: 'none', color: C.ink2, borderRadius: 10, padding: '8px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >Clear Targets</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {LINE_WORKSHOPS.map(lw => (
          <div key={lw.dataName}>
            <span style={label}>{lw.display} target</span>
            <input
              type="number" min="0" style={{ ...field, width: '100%', boxSizing: 'border-box' }}
              placeholder="auto"
              value={lineTargets[lw.dataName] ?? ''}
              onChange={e => setLineTargets(t => ({ ...t, [lw.dataName]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Masthead (shared by all pages) ───────────────────────────────
// A glass card in the same family as every other card, rather than a black
// bar with hard dividers: logo on a plate (needed in light mode — the lockup
// is white-on-transparent), the title as an h1, and the period / shift / ref
// metadata as chips instead of label:value rows. Nothing is dropped, it is
// just carried in less chrome.
function BoardHeader({ raw, referenceNo }) {
  const C = useC();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      background: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 16,
      padding: '13px 18px', boxShadow: C.shadow,
    }}>
      <img src={C.logo} alt="Kiira Motors Corporation" crossOrigin="anonymous"
        style={{ height: 50, width: 'auto', display: 'block', objectFit: 'contain', flex: '0 0 auto' }} />
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{
          fontSize: 28, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.018em', color: C.ink,
        }}>
          Department of Production Scoreboard
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
          <Chip>{raw('Scoreboard Period Start')} – {raw('Scoreboard Period End')}</Chip>
          <Chip>{raw('Shift Label') || 'DAY SHIFT'}</Chip>
          <Chip tone="crit">{referenceNo}</Chip>
        </div>
      </div>
    </div>
  );
}

// Overall achievement, as a single wide meter, on its own glass strip: the
// figure and the "n of N buses" reading sit above a fully-rounded track with
// quarter ticks. Same information as before, less hard chrome.
function ProgressBar({ pct, target, done }) {
  const C = useC();
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <div style={{
      background: C.stat, border: `1px solid ${C.glassBorder}`, borderRadius: 13,
      padding: '11px 14px 12px', boxShadow: C.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <span style={{
          fontFamily: UI_FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: C.ink,
        }}>Programme Completion</span>
        <span style={{
          fontSize: 21, fontWeight: 700, color: C.green, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>{fpct(pct)}</span>
      </div>
      <div style={{ position: 'relative', height: 12, borderRadius: 999, overflow: 'hidden', background: C.track }}>
        <div style={{
          width: `${p * 100}%`, height: '100%', borderRadius: 999,
          background: `linear-gradient(90deg, ${C.greenDeep} 0%, ${C.green} 72%, ${C.greenLite} 100%)`,
        }} />
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            position: 'absolute', left: `${i * 25}%`, top: 0, bottom: 0,
            width: 1, background: C.gridline,
          }} />
        ))}
      </div>
      {/* tick labels sit on the same 25% grid as the marks above them, so they
          are absolutely placed rather than space-between'd (which spaces by
          label width, not by position) */}
      <div style={{
        position: 'relative', height: 12, marginTop: 5, fontSize: 8.5,
        color: C.muted, fontFamily: UI_FONT,
      }}>
        <span style={{ position: 'absolute', left: 0 }}>0</span>
        {[1, 2, 3].map(i => (
          <span key={i} style={{ position: 'absolute', left: `${i * 25}%`, transform: 'translateX(-50%)' }}>{i * 25}%</span>
        ))}
        <span style={{ position: 'absolute', right: 0 }}>{fint(done)} / {fint(target)} buses</span>
      </div>
    </div>
  );
}

// One board page. The backdrop photo is painted on the page itself rather
// than only on the outer shell, so the cards float on it in the PNG/PDF
// captures exactly as they do on screen.
function Page({ innerRef, children }) {
  const C = useC();
  const [width, setWidth] = useState(PAGE_WIDTH);
  const el = useRef(null);
  // one node, two refs: the parent needs it for html2canvas, we need it to measure
  const attach = useCallback(node => {
    el.current = node;
    if (innerRef) innerRef.current = node;
  }, [innerRef]);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const read = () => setWidth(node.clientWidth || PAGE_WIDTH);
    read();
    // A window resize listener is the reliable signal — ResizeObserver is
    // missing or inert in some embedded/webview browsers. RO is added on top
    // where it works, since it also catches layout changes that move the page
    // without resizing the window (the sidebar/selector opening, say).
    window.addEventListener('resize', read);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(read);
      ro.observe(node);
    }
    return () => {
      window.removeEventListener('resize', read);
      if (ro) ro.disconnect();
    };
  }, []);

  return (
    <PageWidthCtx.Provider value={width}>
      <div ref={attach} style={{
        width: '100%', maxWidth: PAGE_WIDTH, margin: '14px auto 0', display: 'flex',
        flexDirection: 'column', gap: 10, padding: 12, borderRadius: 18, boxShadow: C.shadowLg,
        backgroundColor: C.bg,
        backgroundImage: `${C.pageWash}, ${BG_IMAGE}`,
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      }}>{children}</div>
    </PageWidthCtx.Provider>
  );
}

// ── Main component ──────────────────────────────────────────────
const SB_TABS = [
  { id: 'dashboard', label: 'Live Dashboard' },
  { id: 'workbook',  label: 'Workbook View' },
];

// Local calendar date as YYYY-MM-DD. NOT toISOString(): that converts to UTC
// first, so in Kampala (UTC+3) every local midnight reads back as the previous
// day — the default "this month" range opened as 31-Aug → 08-Sep rather than
// 01-Sep → 08-Sep, silently pulling a day of the previous month into every
// period figure (and mislabelling the range chip on the board).
export function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultRange() {
  const now = new Date();
  return { start: localISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end: localISODate(now) };
}

function ScoreboardInner({ view, setView, onHome, onLogout, hideHome }) {
  const C = useC();
  const { data, loading, error, lastUpdated, refresh } = useScoreboardData();
  const [emailOpen, setEmailOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [range, setRange] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kmc_scoreboard_range') || 'null');
      if (saved?.start && saved?.end) return saved;
    } catch { /* ignore malformed storage */ }
    return defaultRange();
  });
  const [lineTargets, setLineTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kmc_scoreboard_targets') || '{}'); } catch { return {}; }
  });
  // The Production Report is month-scoped; the picker seeds from whatever
  // month the board's selected range currently ends in.
  const [reportMonth, setReportMonth] = useState(() => range.end.slice(0, 7));
  const applyMonthRange = useCallback(m => setRange(monthBounds(m)), []);
  useEffect(() => { localStorage.setItem('kmc_scoreboard_range', JSON.stringify(range)); }, [range]);
  useEffect(() => { localStorage.setItem('kmc_scoreboard_targets', JSON.stringify(lineTargets)); }, [lineTargets]);
  const pageRefs = [useRef(null), useRef(null), useRef(null)];

  const live = !!data;
  const d = data || SAMPLE;
  const kv = d.kv;
  const g = (key) => kv[key] || {};
  const num = (key) => g(key).num ?? null;
  const raw = (key) => g(key).raw ?? '';

  // Every export — PNG, PDF and the Production Report's embedded board pages —
  // must look the same whatever device triggered it. The board itself is fluid,
  // so each page is pinned to the reference width for the duration of the
  // capture and released afterwards. Because the layout reflows on container
  // width (see `fit`) rather than on viewport media queries, pinning is enough
  // to restore the full desktop board even on a phone.
  const capturePages = useCallback(async () => {
    const opts = { backgroundColor: C.bg, scale: 2, useCORS: true, logging: false };
    const pinned = pageRefs.map(r => r.current).filter(Boolean);
    const previous = pinned.map(el => [el.style.width, el.style.maxWidth]);
    pinned.forEach(el => {
      el.style.width = `${PAGE_WIDTH}px`;
      el.style.maxWidth = `${PAGE_WIDTH}px`;
      void el.offsetWidth;                 // force reflow before the capture
    });
    // Nudge every Page to re-measure and re-render at the pinned width, then
    // let React commit, so the capture sees the desktop grid rather than
    // whatever the device was showing.
    window.dispatchEvent(new Event('resize'));
    await new Promise(r => setTimeout(r, 120));
    try {
      const canvases = [];
      for (const el of pinned) canvases.push(await html2canvas(el, opts));
      return canvases;
    } finally {
      pinned.forEach((el, i) => { [el.style.width, el.style.maxWidth] = previous[i]; });
    }
  }, [C.bg]);

  // One stacked PNG (all pages, one file) — separate downloads were easy to
  // lose track of / get blocked as pop-ups, so later pages are just a scroll away.
  async function exportPNG() {
    setExporting(true);
    try {
      const canvases = await capturePages();
      const gap = 28;
      const width = Math.max(...canvases.map(c => c.width));
      const totalHeight = canvases.reduce((s, c) => s + c.height, 0) + gap * (canvases.length - 1);
      const combined = document.createElement('canvas');
      combined.width = width; combined.height = totalHeight;
      const ctx = combined.getContext('2d');
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, totalHeight);
      let yOff = 0;
      canvases.forEach(cv => { ctx.drawImage(cv, (width - cv.width) / 2, yOff); yOff += cv.height + gap; });
      const a = document.createElement('a');
      a.download = `KMC_Scoreboard_${localISODate()}.png`;
      a.href = combined.toDataURL('image/png');
      a.click();
    } finally { setExporting(false); }
  }

  async function exportPDF() {
    setExporting(true);
    try {
      const canvases = await capturePages();
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      canvases.forEach((cv, i) => {
        if (i > 0) pdf.addPage();
        const ratio = Math.min(pw / cv.width, ph / cv.height);
        const iw = cv.width * ratio, ih = cv.height * ratio;
        pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
      });
      pdf.save(`KMC_Scoreboard_${localISODate()}.pdf`);
    } finally { setExporting(false); }
  }

  // Document reference shown on the board header and pre-filled into the
  // report's version-history table, so both always agree.
  const referenceNo = defaultReference(range.end);

  const target = num('Program Target (vehicles)') ?? 45;
  const achievement = num('Achievement %') ?? 0;
  const actualRate = num('Buses per Day (period)');
  const targetRate = num('Target: Buses per Day');

  // ── Overall Progress scorecards (exempt from any future period filter — these
  // reflect current tracker state, not a date-bounded slice) ──
  const overallCards = [
    { label: 'Production Achievement', value: fpct(achievement) },
    { label: 'Completed', value: fint(num('Completed')) },
    { label: 'In Progress', value: fint(num('In Production')) },
    { label: 'Rate (Takt)', value: `${f1(actualRate)}/day` },
    { label: 'Target Rate (Takt)', value: `${fint(targetRate)}/day` },
    { label: 'SPI', value: f2(num('SPI')) },
  ];

  // The 8 "big rock" KPIs pulled out of objectives 2-5 — the numbers that
  // actually move the needle, one card each, no more per-objective tables.
  const bigRocks = [
    { label: 'First Pass Yield', value: fpct(num('First Pass Yield')) },
    { label: 'Critical Defects', value: fint(num('Critical Defects')) },
    { label: 'OEE', value: fpct(num('OEE')) },
    { label: 'MTTR', value: `${f1(num('MTTR (hrs)'))} h` },
    { label: 'Days Without LTI', value: fint(num('Days Without Lost-Time Injury')) },
    { label: 'Near-Miss Response', value: fpct(num('Near-Miss Response Rate')) },
    { label: 'Energy vs Baseline', value: fpct1(num('Energy vs Baseline')) },
    { label: 'Waste vs Baseline', value: fpct1(num('Waste vs Baseline')) },
  ];

  // Cost reporting is deliberately just these two things — overall and
  // per-line — no budget/actual/variance clutter (removed per request).
  const productionOperationalCost = fint(num('Production Operational Cost'));
  const lineCostCards = LINE_WORKSHOPS.map(lw => ({
    label: lw.display,
    value: fint(num(`Operational Cost — ${lw.dataName}`)),
  }));
  const schedCards = [
    { label: 'Activities On Time', value: fpct(num('On-Time %')) },
    { label: 'Avg Delay (days)', value: f1(num('Avg Schedule Delay (days)')) },
    { label: 'Critical Activity', value: raw('Critical Activity') || '—' },
    { label: 'Downtime % of Hours', value: fpct1(num('Downtime % of Available')) },
  ];

  const wsColor = s => s === 'ON TRACK' ? C.green : s === 'AT RISK' ? C.amber : C.red;
  // Done/target come straight from the Tracker (d.lineCompletion), not the
  // Calc tab's workshop table — Calc's rows for these 4 lines can drift out
  // of sync with the sheet's own formulas. The selected range ALWAYS drives
  // these pies; see computeLineCard for the cohort rule (why a bus completed
  // on 7 Sep now shows when the board is filtered to September).
  const lineWorkshops = LINE_WORKSHOPS.map(lw => {
    const calcRow = d.workshops.find(x => x.name === lw.dataName);
    const comp = d.lineCompletion?.[lw.dataName] || { done: 0, target: 0, tasks: [] };
    const card = computeLineCard(comp, calcRow, range, lineTargets[lw.dataName]);
    return { name: lw.dataName, display: lw.display, ...card };
  });

  // Cumulative throughput (whole program, never range-sliced) — a running
  // sum of buses actually built. Built off the monthly Planned vs Actual
  // series (d.overallMonthly) rather than the Daily Output tab: that tab is
  // often sparse/incomplete, while the monthly actuals come straight off the
  // Tracker's own Actual End dates, so they're the more reliably-available
  // data to sum. Each month's actual count just adds onto the running total.
  let cumRunning = 0;
  const cumulativeMonthly = (d.overallMonthly || []).map(m => {
    cumRunning += m.actual || 0;
    return { date: m.label, cumAct: cumRunning };
  });

  // Soft-filled pill buttons rather than outlined uppercase ones — the
  // reference's `.btn.ghost`.
  const btn = {
    background: C.surface2, border: 'none', color: C.ink2,
    borderRadius: 10, padding: '8px 14px', fontSize: 11.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  return (
    <div style={{
      minHeight: '100vh', padding: '14px clamp(6px, 1.4vw, 14px) 40px', overflowX: 'hidden',
      fontFamily: "'Inter', Arial, sans-serif", color: C.ink,
      backgroundColor: C.bg,
      backgroundImage: `${C.overlay}, ${BG_IMAGE}`,
      backgroundSize: 'cover', backgroundPosition: 'top center', backgroundRepeat: 'no-repeat',
    }}>
      {/* toolbar + range/target selector (neither captured in exports) */}
      <ScoreboardToolbar
        live={live} loading={loading} error={error} lastUpdated={lastUpdated}
        refresh={refresh} exportPNG={exportPNG} exportPDF={exportPDF}
        exporting={exporting} setEmailOpen={setEmailOpen} setReportOpen={setReportOpen} btn={btn}
        selectorOpen={selectorOpen} setSelectorOpen={setSelectorOpen}
        view={view} setView={setView} onHome={onHome} onLogout={onLogout} hideHome={hideHome}
      />
      {selectorOpen && (
        <RangeTargetPanel range={range} setRange={setRange} lineTargets={lineTargets} setLineTargets={setLineTargets} />
      )}

      {view === 'workbook' ? <WorkbookView /> : (
        <>
        {/* ═══════════ PAGE 1 — Overview ═══════════ */}
        <Page innerRef={pageRefs[0]}>
          <BoardHeader raw={raw} referenceNo={referenceNo} />

          {/* Overall Progress — first, and exempt from any period slicing */}
          <SectionLabel>Overall Progress</SectionLabel>
          <CardGrid cols={6}>
            {overallCards.map(c => <ScoreCard key={c.label} {...c} />)}
          </CardGrid>
          <ProgressBar pct={achievement} target={target} done={num('Completed')} />

          {/* Production Line Status — 4 core assembly-line workshops as
              scorecards, scoped to the selected range (labelled so a reader
              never mistakes a period figure for a program-to-date one) */}
          <SectionLabel right={<Chip>{range.start} → {range.end}</Chip>}>Production Line Status</SectionLabel>
          <Row cols={lineCols}>
            {lineWorkshops.map(w => (
              <div key={w.name} style={{
                background: C.stat, border: `1px solid ${C.glassBorder}`,
                borderRadius: 13, padding: 9, textAlign: 'center', boxShadow: C.shadow,
              }}>
                <div style={{ height: 52, borderRadius: 9, overflow: 'hidden', marginBottom: 7, background: C.surface2 }}>
                  {WORKSHOP_IMG[w.name] && (
                    <img src={WORKSHOP_IMG[w.name]} alt="" crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div style={{
                  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                  minHeight: 24, lineHeight: 1.25, color: C.muted,
                }}>{w.display}</div>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: C.ink, margin: '2px 0 6px',
                  letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
                }}>{w.done} / {w.target}</div>
                <Donut pct={w.pct} color={wsColor(w.status)} size={90} thickness={11} />
              </div>
            ))}
          </Row>

          {/* Key Performance Indicators — the 8 big rocks */}
          <SectionLabel>Key Performance Indicators</SectionLabel>
          <CardGrid cols={4}>
            {bigRocks.map(c => <ScoreCard key={c.label} {...c} />)}
          </CardGrid>
        </Page>

        {/* ═══════════ PAGE 2 — Performance ═══════════ */}
        <Page innerRef={pageRefs[1]}>
          {/* One row of four whole-program trends. The two selected-range pies
              that used to sit here are gone (removed per request); the range
              picker still drives the line-status cards on page 1. */}
          <Row cols={chartCols}>
            <Panel title="First Pass Yield — by Month">
              <TrendChart points={d.fpyTrend} color={C.green} fmt={v => fpct(v)} axisTitle="First Pass Yield" axisFmt={v => `${Math.round(v * 100)}%`} />
            </Panel>
            <Panel title="Downtime — by Month (hours)">
              <MonthlyBarChart points={d.downtimeTrend} color={C.red} axisTitle="Hours" fmt={v => `${f1(v)}h`} />
            </Panel>
            <Panel title="Planned vs Actual — by Month (whole program)">
              <MonthlyPlanActualChart points={d.overallMonthly} />
            </Panel>
            <Panel title="Cumulative Throughput (whole program)">
              <CumChart daily={cumulativeMonthly} />
            </Panel>
          </Row>

          <SectionLabel>Planned vs Actual — by Month, per Line</SectionLabel>
          <Row cols={chartCols}>
            {LINE_WORKSHOPS.map(lw => (
              <Panel key={lw.dataName} title={lw.display}>
                <MonthlyPlanActualChart points={d.linePlannedVsActual?.[lw.dataName] || []} />
              </Panel>
            ))}
          </Row>
        </Page>

        {/* ═══════════ PAGE 3 — Detail & Registers ═══════════ */}
        <Page innerRef={pageRefs[2]}>
          <Row cols={w => (w >= 1040 ? '1.4fr 1fr 1fr' : w >= 700 ? '1fr 1fr' : '1fr')}>
            <Panel title="Production Downtime — Full Breakdown (Period)">
              <DowntimeTable kv={kv} />
            </Panel>
            <Panel title="Safety">
              <CardGrid cols={2}>
                {[
                  { label: 'Lost-Time Injuries', value: fint(num('Lost-Time Injuries')) },
                  { label: 'PPE Misuse', value: fint(num('PPE Misuse Incidents')) },
                  { label: 'Unsafe Conditions', value: fint(num('Unsafe Conditions')) },
                  { label: 'Inspection Compliance', value: fpct(num('Safety Inspection Compliance')) },
                ].map(c => <ScoreCard key={c.label} {...c} />)}
              </CardGrid>
            </Panel>
            <Panel title="Environment">
              <CardGrid cols={2}>
                {[
                  { label: 'Energy / Unit (kWh)', value: f1(num('Energy per Unit (latest month, kWh)')) },
                  { label: 'Waste / Unit (kg)', value: f1(num('Waste per Unit (period, kg)')) },
                  { label: "Waste Cost (UGX '000)", value: fint(num("Waste Cost (period, UGX '000)")) },
                ].map(c => <ScoreCard key={c.label} {...c} />)}
              </CardGrid>
            </Panel>
          </Row>

          <Row cols={w => (w >= 700 ? 2 : 1)}>
            <Panel title="Production Operational Cost">
              <ScoreCard label="Total (UGX '000)" value={productionOperationalCost} />
            </Panel>
            <Panel title="Schedule">
              <CardGrid cols={4}>{schedCards.map(c => <ScoreCard key={c.label} {...c} />)}</CardGrid>
            </Panel>
          </Row>

          <Panel title="Operational Cost per Line">
            <CardGrid cols={4}>{lineCostCards.map(c => <ScoreCard key={c.label} {...c} />)}</CardGrid>
          </Panel>

          <Row cols={w => (w >= 700 ? 2 : 1)}>
            <Panel title="Open Bottlenecks">
              <MiniTable
                headers={['Raised', 'Bottleneck', 'Workshop', 'Impact', 'Owner', 'Recovery']}
                rows={d.bottlenecks.filter(r => (r[6] || '').toLowerCase() === 'open').slice(0, 6).map(r => r.slice(0, 6))}
                empty="No open bottlenecks."
              />
            </Panel>
            <Panel title="Engineering Change Control (ECR)">
              <MiniTable
                headers={['ECR', 'Description', 'Area', 'Status', 'Target']}
                rows={d.ecr.slice(-6).map(r => [r[0], r[1], r[2], r[4], r[5]])}
                empty="No ECRs logged."
              />
            </Panel>
          </Row>
          <Row cols={w => (w >= 700 ? 2 : 1)}>
            <Panel title="Kaizen / Improvement Ideas">
              <MiniTable
                headers={['Idea', 'Workshop', 'Proposed By', 'Status', 'Impact']}
                rows={d.kaizen.slice(-6).map(r => [r[1], r[2], r[3], r[4], r[5]])}
                empty="No kaizen ideas yet."
              />
            </Panel>
            <Panel title="Production Waste (Period)">
              <MiniTable
                headers={['Date', 'Type', 'Qty', 'Unit', "Cost (UGX '000)", 'Workshop']}
                rows={d.waste.slice(-6).map(r => r.slice(0, 6))}
                empty="No waste entries this period."
              />
            </Panel>
          </Row>

          {/* Footer — one card, centred inside the page rather than a motto strip
              plus a loose full-bleed note underneath (which sat 14px wider than
              the page's own content on each side and read as misaligned).
              Note: this reads the full IMS-objectives master workbook (Targets,
              Tracker, Daily Output, Downtime, Bottlenecks, Quality, Safety,
              Environment, ECR, Cost, Waste, Kaizen, Calc) plus our own Cost
              Inputs tab — see useScoreboardData.js. */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            background: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 14,
            padding: '12px 20px', boxShadow: C.shadow, textAlign: 'center',
          }}>
            <div style={{
              fontFamily: UI_FONT, fontWeight: 700, letterSpacing: '0.26em',
              color: C.red, fontSize: 11.5,
            }}>
              FOCUS · PLAN · EXECUTE · DELIVER
            </div>
            <div style={{ width: '100%', height: 1, background: C.line }} />
            <div style={{ fontSize: 9.5, lineHeight: 1.65, color: C.muted, maxWidth: 1080 }}>
              Most KPIs are read live from the <b>Calc</b>/<b>Targets</b> tabs, pre-computed by the sheet itself. Production Operational Cost = Labour + Energy + Machine: Labour from Travel Card staff-on-duty records × the current Staff Hourly Rate; Energy from the <b>Environment</b> tab's latest logged month × the current Energy Tariff Rate; Machine from every registered machine's rate × Available Hours for the period. All three rates come from the Cost Estimation module's time-bounded rate history (Cost Estimations Engineer role) — a rate change never rewrites past costing. Cost figures show 0 until real rates are set.
            </div>
          </div>
        </Page>
        </>
      )}

      {emailOpen && <ScoreboardEmailModal onClose={() => setEmailOpen(false)} capturePages={capturePages} />}
      {reportOpen && (
        <ProductionReportModal
          onClose={() => setReportOpen(false)}
          capturePages={capturePages}
          buses={d.busUnits || []}
          month={reportMonth}
          setMonth={setReportMonth}
          applyMonthRange={applyMonthRange}
        />
      )}
    </div>
  );
}

// Single control line: view tabs, live-status, every action, and Sign Out.
// The tabs and the Sign Out button used to live on two separate bars above
// this one (Sign Out came from App.jsx's standalone wrapper) — they are all
// on this row now.
function ScoreboardToolbar({
  live, loading, error, lastUpdated, refresh, exportPNG, exportPDF, exporting,
  setEmailOpen, setReportOpen, btn, selectorOpen, setSelectorOpen,
  view, setView, onHome, onLogout, hideHome,
}) {
  const C = useC();
  const { theme, toggleTheme } = useContext(ThemeToggleCtx);
  const tab = active => ({
    ...btn,
    background: active ? C.red : C.surface2,
    color: active ? '#fff' : C.ink2,
    fontWeight: 700,
  });
  return (
    <div style={{
      maxWidth: PAGE_WIDTH, margin: '0 auto 10px', display: 'flex', gap: 8,
      alignItems: 'center', flexWrap: 'wrap',
    }}>
      {!hideHome && onHome && (
        <button style={btn} onClick={onHome} title="Back to home">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Home
        </button>
      )}
      {SB_TABS.map(t => (
        <button key={t.id} style={tab(view === t.id)} onClick={() => setView(t.id)}>{t.label}</button>
      ))}
      <span style={{ fontFamily: UI_FONT, fontSize: 10, color: C.muted, marginLeft: 4 }}>
        {live
          ? `Live · updated ${lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : `Showing sample data${error ? ` — ${error}` : ''}`}
      </span>
      <div style={{ flex: 1 }} />
      <button
        style={{ ...btn, background: selectorOpen ? C.redWash : C.surface2, color: selectorOpen ? C.red : C.ink2 }}
        onClick={() => setSelectorOpen(o => !o)}
      >⚙ {selectorOpen ? 'Hide' : 'Set'} Range &amp; Targets</button>
      <button style={btn} onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>
      <button style={btn} onClick={refresh} disabled={loading}>{loading ? 'Syncing…' : 'Refresh'}</button>
      <button style={btn} onClick={exportPNG} disabled={exporting}>Export PNG</button>
      <button style={btn} onClick={exportPDF} disabled={exporting}>Export PDF</button>
      <button style={{ ...btn, background: C.redWash, color: C.red }} onClick={() => setReportOpen(true)}>Production Report</button>
      <button style={{ ...btn, color: '#fff', background: C.red }} onClick={() => setEmailOpen(true)}>Email / Schedule</button>
      {onLogout && (
        <button style={{ ...btn, background: C.redWash, color: C.red }} onClick={onLogout}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sign Out
        </button>
      )}
    </div>
  );
}

// ── Theme provider wrapper ────────────────────────────────────────
const ThemeToggleCtx = createContext({ theme: 'dark', toggleTheme: () => {} });

// The uploaded standalone workbook dashboard (public/dpn-scoreboard-workbook.html) is a
// separate, self-contained vanilla-JS app (its own Excel parser, live-file watcher, and
// theme) — embedding it via iframe keeps it intact rather than risking a lossy rewrite
// into the React component's rendering model.
function WorkbookView() {
  const C = useC();
  return (
    <div style={{ maxWidth: PAGE_WIDTH, margin: '0 auto', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.glassBorder}`, boxShadow: C.shadowLg }}>
      <iframe
        src="/dpn-scoreboard-workbook.html"
        title="DPN Scoreboard Workbook"
        style={{ width: '100%', height: 'calc(100vh - 90px)', border: 'none', display: 'block' }}
      />
    </div>
  );
}

export default function Scoreboard({ onHome, onLogout, hideHome }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('kmc_scoreboard_theme') || 'dark');
  const [view, setView] = useState('dashboard');

  useEffect(() => {
    localStorage.setItem('kmc_scoreboard_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  return (
    <ThemeToggleCtx.Provider value={{ theme, toggleTheme }}>
      <ThemeCtx.Provider value={PALETTES[theme]}>
        <ScoreboardInner
          view={view} setView={setView}
          onHome={onHome} onLogout={onLogout} hideHome={hideHome}
        />
      </ThemeCtx.Provider>
    </ThemeToggleCtx.Provider>
  );
}
