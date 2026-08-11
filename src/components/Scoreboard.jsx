import { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useScoreboardData } from '../hooks/useScoreboardData';

// ── Theme-aware palettes ──────────────────────────────────────────────────
// Scoreboard keeps its own theme state (separate from the rest of the app —
// this is a standalone wall-display/export module) but follows the same
// toggle pattern as App.jsx: persisted choice, defaulting to dark.
const PALETTES = {
  dark: {
    bg: '#05070a', panel: '#0d1117', border: '#1c2330', red: '#e0292b',
    navy: '#101623', green: '#2ecc71', amber: '#f2a900', blue: '#3498db',
    grey: '#8a93a3', text: '#eef1f6', rowAlt: '#0a0f16',
    header: '#000000', track: '#1c2330', rowBorder: '#131a24',
    overlay: 'linear-gradient(rgba(5,7,10,0.90), rgba(5,7,10,0.96))',
    shadow: '0 2px 6px rgba(0,0,0,0.3)', shadowLg: '0 20px 60px rgba(0,0,0,0.5)',
  },
  light: {
    bg: '#eef0f3', panel: '#ffffff', border: '#d8dce2', red: '#c81e20',
    navy: '#eef1f5', green: '#1e8449', amber: '#b8790a', blue: '#2563a8',
    grey: '#5c6572', text: '#12161c', rowAlt: '#f6f7f9',
    header: '#14181f', track: '#dfe3e8', rowBorder: '#e6e9ee',
    overlay: 'linear-gradient(rgba(238,240,243,0.90), rgba(238,240,243,0.96))',
    shadow: '0 2px 6px rgba(0,0,0,0.08)', shadowLg: '0 16px 40px rgba(0,0,0,0.12)',
  },
};

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
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={thickness}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.24} fontWeight="800" fill={C.text}>{p}%</text>
    </svg>
  );
}

// Red accent banner — used for section dividers and panel titles alike, so
// the page reads as a wall of clearly-bordered sections like the original.
function SectionLabel({ children }) {
  const C = useC();
  return (
    <div style={{
      background: C.red, color: '#fff', fontSize: 11, fontWeight: 800, textAlign: 'center',
      textTransform: 'uppercase', letterSpacing: '0.07em', padding: '7px 10px', borderRadius: 5,
    }}>{children}</div>
  );
}

// The reusable KPI tile — value first, no target/status clutter. Title is
// white + centred to match the red banners.
function ScoreCard({ label, value, valueColor }) {
  const C = useC();
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderTop: `4px solid ${C.border}`,
      borderRadius: 7, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 4,
      alignItems: 'center', textAlign: 'center',
      boxShadow: C.shadow, minHeight: 58,
    }}>
      <div style={{ fontSize: 9, color: C.text, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: valueColor || C.text, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function CardGrid({ cols = 4, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7 }}>{children}</div>
  );
}

function Panel({ title, children, style }) {
  const C = useC();
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      boxShadow: C.shadow, ...style,
    }}>
      <div style={{
        background: C.red, color: '#fff', fontSize: 10.5, fontWeight: 800, textAlign: 'center',
        textTransform: 'uppercase', letterSpacing: '0.05em', padding: '7px 11px',
      }}>{title}</div>
      <div style={{ padding: '8px 10px', flex: 1 }}>{children}</div>
    </div>
  );
}

function MiniTable({ headers, rows, empty }) {
  const C = useC();
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
      <thead>
        <tr>
          {headers.map(h => (
            <th key={h} style={{
              background: C.navy, color: C.grey, fontSize: 8.5, textTransform: 'uppercase',
              padding: '4px 5px', textAlign: 'left', borderBottom: `1px solid ${C.border}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} style={{ padding: '8px 6px', color: C.grey, fontStyle: 'italic' }}>{empty}</td></tr>
        ) : rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 ? C.rowAlt : 'transparent' }}>
            {r.map((c, j) => (
              <td key={j} style={{ padding: '4px 5px', color: j === 0 ? C.text : C.grey, borderBottom: `1px solid ${C.rowBorder}` }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
      <thead>
        <tr>
          {['Description', 'Hours', '%'].map(h => (
            <th key={h} style={{
              background: C.navy, color: C.grey, fontSize: 8.5, textTransform: 'uppercase',
              padding: '4px 5px', textAlign: h === 'Description' ? 'left' : 'center', borderBottom: `1px solid ${C.border}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 ? C.rowAlt : 'transparent' }}>
            <td style={{ padding: '4px 5px', color: C.text, borderBottom: `1px solid ${C.rowBorder}` }}>{r[0]}</td>
            <td style={{ padding: '4px 5px', color: C.grey, textAlign: 'center', borderBottom: `1px solid ${C.rowBorder}` }}>{r[1]}</td>
            <td style={{ padding: '4px 5px', color: C.grey, textAlign: 'center', borderBottom: `1px solid ${C.rowBorder}` }}>{r[2]}</td>
          </tr>
        ))}
        <tr style={{ background: C.navy, fontWeight: 800 }}>
          <td style={{ padding: '5px', color: C.text }}>Total Production Hours Lost</td>
          <td style={{ padding: '5px', color: C.text, textAlign: 'center' }}>{f1(num('Total Hours Lost'))}</td>
          <td style={{ padding: '5px', color: C.text, textAlign: 'center' }}>{fpct1(num('Downtime % of Available'))}</td>
        </tr>
      </tbody>
    </table>
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

// Solid baseline + a small circle marker per category, evoking a timeline —
// used by the monthly bar charts (Downtime, Planned vs Actual, Output by Line).
function AxisTimeline({ C, y0, padL, padR, w, positions }) {
  return (
    <>
      <line x1={padL} y1={y0} x2={w - padR} y2={y0} stroke={C.grey} strokeWidth="1.5" />
      {positions.map((cx, i) => (
        <circle key={i} cx={cx} cy={y0} r="3" fill={C.panel} stroke={C.grey} strokeWidth="1.5" />
      ))}
    </>
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
            <line x1={padL} y1={yy} x2={w - 12} y2={yy} stroke={C.border} strokeDasharray="2,3" />
            <text x={padL - 6} y={yy + 3} fontSize="7.5" fill={C.grey} textAnchor="end">{fmt(val)}</text>
          </g>
        );
      })}
      <line x1={padL} y1={padT - 4} x2={padL} y2={h - padB} stroke={C.border} />
      <text x={10} y={(h - padB + padT) / 2} fontSize="8" fill={C.grey} textAnchor="middle"
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
  const w = 460, h = 190, padL = 34, padR = 12, padT = 12, padB = 26;
  const pts = daily.filter(d => d.cumAct != null);
  if (pts.length < 2) return <div style={{ color: C.grey, fontSize: 10, padding: 20 }}>No output data yet in this range.</div>;
  const dataMax = Math.max(...pts.map(d => d.cumAct), 1);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 4, true);
  const x = i => padL + i * ((w - padL - padR) / (pts.length - 1));
  const y = v => h - padB - (v / niceMax) * (h - padB - padT);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cumAct).toFixed(1)}`).join(' ');
  const showEvery = Math.max(1, Math.ceil(pts.length / 8));
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, fontSize: 9, color: C.grey, marginBottom: 4 }}>
        <span><span style={{ display: 'inline-block', width: 9, height: 2, background: C.green, marginRight: 4, verticalAlign: 'middle' }} />Actual (cum.)</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
        <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title="Vehicles (cum.)" />
        <path d={path} fill="none" stroke={C.green} strokeWidth="2.5" />
        {pts.map((p, i) => (
          <g key={i}>
            {(i % showEvery === 0 || i === pts.length - 1) && <circle cx={x(i)} cy={y(p.cumAct)} r="3" fill={C.green} />}
            {i % showEvery === 0 && (
              <text x={x(i)} y={h - 8} fontSize="7.5" fill={C.grey} textAnchor="middle">
                {String(p.date).split(' ').slice(-2).join(' ')}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}


// Single-series monthly bar chart — used for the Downtime trend now that
// it's a bar chart, not a line, per request.
function MonthlyBarChart({ points, color, axisTitle, fmt = (v) => f1(v) }) {
  const C = useC();
  if (!points || points.length === 0) {
    return <div style={{ color: C.grey, fontSize: 10, padding: '26px 0', textAlign: 'center' }}>No monthly entries logged yet — add rows to the Monthly Downtime Log tab.</div>;
  }
  const w = 460, h = 160, padL = 34, padR = 12, padT = 18, padB = 26;
  const dataMax = Math.max(...points.map(p => p.value), 0.0001);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 4, false);
  const bw = (w - padL - padR) / points.length;
  const yFor = v => h - padB - (v / niceMax) * (h - padB - padT);
  const y0 = yFor(0);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title={axisTitle || ''} />
      {points.map((p, i) => {
        const x0 = padL + i * bw, pw = bw * 0.5;
        return (
          <g key={i}>
            <path d={barPath(x0 + bw * 0.25, yFor(p.value), pw, Math.max(0, y0 - yFor(p.value)))} fill={color} />
            <text x={x0 + bw / 2} y={yFor(p.value) - 6} fontSize="9" fill={C.text} textAnchor="middle" fontWeight="800">{fmt(p.value)}</text>
          </g>
        );
      })}
      <AxisTimeline C={C} y0={y0} padL={padL} padR={padR} w={w} positions={points.map((_, i) => padL + i * bw + bw / 2)} />
      {points.map((p, i) => (
        <text key={p.label} x={padL + i * bw + bw / 2} y={h - 6} fontSize="8" fill={C.grey} textAnchor="middle">{p.label}</text>
      ))}
    </svg>
  );
}

// Grouped monthly Planned-vs-Actual bar chart, spanning the whole
// production timeline (no slicing to a recent window).
function MonthlyPlanActualChart({ points, axisTitle = 'Buses' }) {
  const C = useC();
  const pts = (points || []).filter(p => p.planned != null || p.actual != null);
  if (pts.length === 0) {
    return <div style={{ color: C.grey, fontSize: 10, padding: '20px 0', textAlign: 'center' }}>No monthly data yet.</div>;
  }
  const w = 460, h = 160, padL = 30, padR = 10, padT = 10, padB = 22;
  const dataMax = Math.max(...pts.map(d => d.planned || 0), ...pts.map(d => d.actual ?? 0), 1);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 3, true);
  const bw = (w - padL - padR) / pts.length;
  const yFor = v => h - padB - (v / niceMax) * (h - padB - padT);
  const y0 = yFor(0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, fontSize: 9, color: C.grey, marginBottom: 4 }}>
        <span><span style={{ display: 'inline-block', width: 9, height: 8, background: C.blue, marginRight: 4 }} />Planned</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 8, background: C.green, marginRight: 4 }} />Actual</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
        <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title={axisTitle} />
        {pts.map((d, i) => {
          const x0 = padL + i * bw, pw = bw * 0.32;
          const planned = d.planned || 0;
          return (
            <g key={i}>
              <path d={barPath(x0 + bw * 0.1, yFor(planned), pw, Math.max(0, y0 - yFor(planned)))} fill={C.blue} />
              {planned > 0 && <text x={x0 + bw * 0.1 + pw / 2} y={yFor(planned) - 4} fontSize="7" fill={C.text} textAnchor="middle" fontWeight="700">{planned}</text>}
              {d.actual != null && (
                <>
                  <path d={barPath(x0 + bw * 0.5, yFor(d.actual), pw, Math.max(0, y0 - yFor(d.actual)))} fill={C.green} />
                  {d.actual > 0 && <text x={x0 + bw * 0.5 + pw / 2} y={yFor(d.actual) - 4} fontSize="7" fill={C.text} textAnchor="middle" fontWeight="700">{d.actual}</text>}
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
          <text key={d.label} x={padL + i * bw + bw * 0.46} y={h - 6} fontSize="7" fill={C.grey} textAnchor="middle">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}

// Range/task-date helpers — plain 'YYYY-MM-DD' strings sort/compare
// correctly as-is, no Date parsing needed here.
const inRange = (iso, start, end) => !!iso && (!start || iso >= start) && (!end || iso <= end);
const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  !!aStart && !!aEnd && aStart <= (bEnd || '9999-12-31') && aEnd >= (bStart || '0000-01-01');

// Two-slice pie — Planned vs Actual, summed across every reported line
// ("progress made per part") for the scheduled period. Donut is reused
// elsewhere for a single %; this one needs two independent slices.
function PlannedActualPie({ planned, actual, size = 130 }) {
  const C = useC();
  const r = size / 2 - 4, cx = size / 2, cy = size / 2, hole = r * 0.55;
  const total = planned + actual;
  const legend = (
    <div style={{ fontSize: 10, color: C.grey, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span><span style={{ display: 'inline-block', width: 9, height: 9, background: C.blue, marginRight: 6, borderRadius: 2 }} />Planned: {planned}</span>
      <span><span style={{ display: 'inline-block', width: 9, height: 9, background: C.green, marginRight: 6, borderRadius: 2 }} />Actual: {actual}</span>
    </div>
  );
  if (total === 0) {
    return <div style={{ color: C.grey, fontSize: 10, padding: '26px 0', textAlign: 'center' }}>No progress logged in this range yet.</div>;
  }
  const slice = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {planned === 0 || actual === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill={planned === 0 ? C.green : C.blue} />
      ) : (
        <>
          {(() => {
            const frac = planned / total, angle = frac * 2 * Math.PI;
            const x1 = cx, y1 = cy - r, x2 = cx + r * Math.sin(angle), y2 = cy - r * Math.cos(angle);
            const largeArc = angle > Math.PI ? 1 : 0;
            return (
              <>
                <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`} fill={C.blue} />
                <path d={`M${cx},${cy} L${x2},${y2} A${r},${r} 0 ${1 - largeArc} 1 ${x1},${y1} Z`} fill={C.green} />
              </>
            );
          })()}
        </>
      )}
      <circle cx={cx} cy={cy} r={hole} fill={C.panel} />
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize="15" fontWeight="800" fill={C.text}>{actual}/{planned}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="7.5" fill={C.grey}>actual / planned</text>
    </svg>
  );
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>{slice}{legend}</div>;
}

// Generic monthly trend line — used for FPY%.
function TrendChart({ points, color, fmt, axisTitle, axisFmt }) {
  const C = useC();
  if (!points || points.length < 2) {
    return <div style={{ color: C.grey, fontSize: 10, padding: '26px 0', textAlign: 'center' }}>Not enough monthly history yet — needs at least two months of logged rows.</div>;
  }
  const w = 460, h = 160, padL = 34, padR = 12, padT = 18, padB = 26;
  const vals = points.map(p => p.value);
  const dataMax = Math.max(...vals, 0.0001);
  const { niceMax, step, tickCount } = niceAxis(dataMax, 4, false);
  const x = i => padL + i * ((w - padL - padR) / (points.length - 1));
  const y = v => h - padB - (v / niceMax) * (h - padB - padT);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <YAxis niceMax={niceMax} step={step} tickCount={tickCount} padL={padL} padT={padT} padB={padB} h={h} w={w} title={axisTitle || ''} fmt={axisFmt || (v => Math.round(v))} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3" fill={color} />
          <text x={x(i)} y={h - 6} fontSize="8" fill={C.grey} textAnchor="middle">{p.label}</text>
          <text x={x(i)} y={y(p.value) - 8} fontSize="8.5" fill={C.text} textAnchor="middle" fontWeight="700">{fmt(p.value)}</text>
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
      const stamp = new Date().toISOString().slice(0, 10);
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

  const field = { width: '100%', background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit' };
  const label = { fontSize: 9, color: C.grey, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, width: 'min(440px, 92vw)', padding: 18, color: C.text, fontFamily: "'Inter', Arial, sans-serif" }}>
        <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
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
            <div style={{ fontSize: 11, color: status.ok ? C.green : C.red }}>{status.msg}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.grey, borderRadius: 4, padding: '7px 14px', fontSize: 11, cursor: 'pointer' }}>Close</button>
            <button onClick={send} disabled={busy} style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 4, padding: '7px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Capturing…' : schedule === 'now' ? 'Send' : 'Schedule'}
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
  const field = { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: '6px 9px', fontSize: 12, fontFamily: 'inherit' };
  const label = { fontSize: 9, color: C.grey, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };
  return (
    <div style={{
      maxWidth: PAGE_WIDTH, margin: '0 auto 10px', background: C.panel, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 14, boxShadow: C.shadow,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, color: C.text }}>
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
          style={{ background: 'transparent', border: `1px solid ${C.grey}`, color: C.grey, borderRadius: 4, padding: '7px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}
        >Clear Targets</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
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

// ── Header (shared by all pages) ─────────────────────────────────
function BoardHeader({ raw }) {
  const C = useC();
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', background: C.header, border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', minWidth: 260 }}>
        <img src="/kmc logo 2.png" alt="KMC" style={{ height: 60, objectFit: 'contain' }} crossOrigin="anonymous" />
      </div>
      <div style={{ flex: 1, textAlign: 'center', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff' }}>
          Department of Production Scoreboard
        </div>
      </div>
      <div style={{ minWidth: 210, borderLeft: `1px solid ${C.border}`, padding: '6px 16px', fontSize: 10.5, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.grey }}>PERIOD</span><b>{raw('Scoreboard Period Start')} – {raw('Scoreboard Period End')}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.grey }}>SHIFT</span><b>{raw('Shift Label') || 'DAY SHIFT'}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.grey }}>REF</span><b style={{ fontSize: 8.5 }}>KMC.DPN.07/26-REG004</b></div>
      </div>
    </div>
  );
}

function Page({ innerRef, children }) {
  const C = useC();
  return (
    <div ref={innerRef} style={{
      width: PAGE_WIDTH, margin: '10px auto 0', display: 'flex', flexDirection: 'column', gap: 9, padding: 12,
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: C.shadowLg,
    }}>{children}</div>
  );
}

// ── Main component ──────────────────────────────────────────────
const PAGE_WIDTH = 1320;

function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

function ScoreboardInner() {
  const C = useC();
  const { data, loading, error, lastUpdated, refresh } = useScoreboardData();
  const [emailOpen, setEmailOpen] = useState(false);
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
  useEffect(() => { localStorage.setItem('kmc_scoreboard_range', JSON.stringify(range)); }, [range]);
  useEffect(() => { localStorage.setItem('kmc_scoreboard_targets', JSON.stringify(lineTargets)); }, [lineTargets]);
  const pageRefs = [useRef(null), useRef(null), useRef(null)];

  const live = !!data;
  const d = data || SAMPLE;
  const kv = d.kv;
  const g = (key) => kv[key] || {};
  const num = (key) => g(key).num ?? null;
  const raw = (key) => g(key).raw ?? '';

  const capturePages = useCallback(async () => {
    const opts = { backgroundColor: C.bg, scale: 2, useCORS: true, logging: false };
    const canvases = [];
    for (const ref of pageRefs) {
      if (ref.current) canvases.push(await html2canvas(ref.current, opts));
    }
    return canvases;
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
      a.download = `KMC_Scoreboard_${new Date().toISOString().slice(0, 10)}.png`;
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
      pdf.save(`KMC_Scoreboard_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExporting(false); }
  }

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
  // of sync with the sheet's own formulas (seen live: 0/45 for all four
  // while Achievement % read 56%). Status/constraint still come from Calc
  // when available since those are more free-form ("ON TRACK"/"AT RISK"/
  // "DELAYED" + a constraint note), falling back to a pct-based guess.
  //
  // Once a manual target is set for a line (Range & Line Targets panel), its
  // pie switches from cumulative program-to-date to the selected period:
  // done = units of that line completed inside the range, target = what was
  // typed in. No target set = stays cumulative, same as before.
  const lineWorkshops = LINE_WORKSHOPS.map(lw => {
    const calcRow = d.workshops.find(x => x.name === lw.dataName);
    const comp = d.lineCompletion?.[lw.dataName] || { done: 0, target: 0, tasks: [] };
    const overrideTarget = Number(lineTargets[lw.dataName]);
    const periodMode = overrideTarget > 0;
    const done = periodMode
      ? (comp.tasks || []).filter(t => t.done && inRange(t.actualEnd, range.start, range.end)).length
      : comp.done;
    const target = periodMode ? overrideTarget : (comp.target || 1);
    const pct = target ? done / target : 0;
    const status = calcRow?.status || (pct >= 0.9 ? 'ON TRACK' : pct >= 0.6 ? 'AT RISK' : 'DELAYED');
    return { name: lw.dataName, display: lw.display, done, target, pct, status, constraint: calcRow?.constraint || '—', periodMode };
  });

  // Range selector applies to exactly one bar/line graph — the selected-range
  // Planned vs Actual chart. Daily Output rows (already day-granular with
  // real Date objects) windowed to the picked range.
  const rangeStartDate = range.start ? new Date(`${range.start}T00:00:00`) : null;
  const rangeEndDate = range.end ? new Date(`${range.end}T23:59:59`) : null;
  const rangeDaily = (d.daily || [])
    .filter(x => x.dateObj && (!rangeStartDate || x.dateObj >= rangeStartDate) && (!rangeEndDate || x.dateObj <= rangeEndDate))
    .map(x => ({ label: x.date, planned: x.planned, actual: x.actual }));

  // Planned vs Actual for the scheduled period, as a pie — summed across
  // every reported line's own task list ("progress made per part"), not the
  // Daily Output tab. Planned = a line's task whose Plan Start–Plan End
  // window overlaps the range; Actual = that line's tasks actually marked
  // Done with an Actual End inside the range.
  const periodPartsTotals = LINE_WORKSHOPS.reduce((acc, lw) => {
    const tasks = d.lineCompletion?.[lw.dataName]?.tasks || [];
    tasks.forEach(t => {
      if (rangesOverlap(t.planStart, t.planEnd, range.start, range.end)) acc.planned += 1;
      if (t.done && inRange(t.actualEnd, range.start, range.end)) acc.actual += 1;
    });
    return acc;
  }, { planned: 0, actual: 0 });

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

  const btn = {
    background: 'transparent', border: `1px solid ${C.grey}`, color: C.grey,
    borderRadius: 5, padding: '6px 12px', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      minHeight: '100vh', padding: '12px 12px 40px', fontFamily: "'Inter', Arial, sans-serif", color: C.text,
      backgroundColor: C.bg,
      backgroundImage: `${C.overlay}, url('/Bus background 3.png')`,
      backgroundSize: 'cover', backgroundPosition: 'top center', backgroundRepeat: 'no-repeat',
    }}>
      {/* toolbar + range/target selector (neither captured in exports) */}
      <ScoreboardToolbar
        live={live} loading={loading} error={error} lastUpdated={lastUpdated}
        refresh={refresh} exportPNG={exportPNG} exportPDF={exportPDF}
        exporting={exporting} setEmailOpen={setEmailOpen} btn={btn}
        selectorOpen={selectorOpen} setSelectorOpen={setSelectorOpen}
      />
      {selectorOpen && (
        <RangeTargetPanel range={range} setRange={setRange} lineTargets={lineTargets} setLineTargets={setLineTargets} />
      )}

      {/* ═══════════ PAGE 1 — Overview ═══════════ */}
      <Page innerRef={pageRefs[0]}>
        <BoardHeader raw={raw} />

        {/* Overall Progress — first, and exempt from any period slicing */}
        <SectionLabel>Overall Progress</SectionLabel>
        <CardGrid cols={6}>
          {overallCards.map(c => <ScoreCard key={c.label} {...c} />)}
        </CardGrid>
        <div>
          <div style={{ background: C.track, borderRadius: 9, height: 32, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.round(achievement * 100)}%`, height: '100%',
              background: `linear-gradient(90deg, #1e8449, ${C.green})`,
              fontSize: 15, fontWeight: 900, fontFamily: "'Arial Black', 'Inter', sans-serif",
              letterSpacing: '0.02em', color: '#04210f', display: 'flex',
              alignItems: 'center', justifyContent: 'center', minWidth: 44,
            }}>{fpct(achievement)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: C.grey, marginTop: 2 }}>
            <span>0</span><span>{fint(target)} buses</span>
          </div>
        </div>

        {/* Production Line Status — 4 core assembly-line workshops as scorecards */}
        <SectionLabel>Production Line Status</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {lineWorkshops.map(w => (
            <div key={w.name} style={{
              background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${wsColor(w.status)}`,
              borderRadius: 8, padding: 8, textAlign: 'center', boxShadow: C.shadow,
            }}>
              <div style={{ height: 52, borderRadius: 5, overflow: 'hidden', marginBottom: 6, background: C.navy }}>
                {WORKSHOP_IMG[w.name] && (
                  <img src={WORKSHOP_IMG[w.name]} alt="" crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
                )}
              </div>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', minHeight: 22, lineHeight: 1.2 }}>{w.display}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: '2px 0 6px' }}>{w.done} / {w.target}</div>
              <Donut pct={w.pct} color={wsColor(w.status)} size={92} />
            </div>
          ))}
        </div>

        {/* Key Performance Indicators — the 8 big rocks */}
        <SectionLabel>Key Performance Indicators</SectionLabel>
        <CardGrid cols={4}>
          {bigRocks.map(c => <ScoreCard key={c.label} {...c} />)}
        </CardGrid>
      </Page>

      {/* ═══════════ PAGE 2 — Performance ═══════════ */}
      <Page innerRef={pageRefs[1]}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Panel title="First Pass Yield — by Month">
            <TrendChart points={d.fpyTrend} color={C.green} fmt={v => fpct(v)} axisTitle="First Pass Yield" axisFmt={v => `${Math.round(v * 100)}%`} />
          </Panel>
          <Panel title="Downtime — by Month (hours)">
            <MonthlyBarChart points={d.downtimeTrend} color={C.red} axisTitle="Hours" fmt={v => `${f1(v)}h`} />
          </Panel>
        </div>

        {/* Whole-program Planned vs Actual, whole-program Cumulative Throughput
            (never range-sliced), and the Selected Range Planned vs Actual —
            the range picker above only ever applies to the latter two. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          <Panel title="Planned vs Actual — by Month (whole program)">
            <MonthlyPlanActualChart points={d.overallMonthly} />
          </Panel>
          <Panel title="Cumulative Throughput (whole program)">
            <CumChart daily={cumulativeMonthly} />
          </Panel>
          <Panel title={`Planned vs Actual — Selected Range (${range.start} to ${range.end})`}>
            <MonthlyPlanActualChart points={rangeDaily} />
          </Panel>
          <Panel title="Planned vs Actual — Selected Range (by Part)">
            <PlannedActualPie planned={periodPartsTotals.planned} actual={periodPartsTotals.actual} />
          </Panel>
        </div>

        <SectionLabel>Planned vs Actual — by Month, per Line</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {LINE_WORKSHOPS.map(lw => (
            <Panel key={lw.dataName} title={lw.display}>
              <MonthlyPlanActualChart points={d.linePlannedVsActual?.[lw.dataName] || []} />
            </Panel>
          ))}
        </div>
      </Page>

      {/* ═══════════ PAGE 3 — Detail & Registers ═══════════ */}
      <Page innerRef={pageRefs[2]}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8 }}>
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Panel title="Production Operational Cost">
            <ScoreCard label="Total (UGX '000)" value={productionOperationalCost} />
          </Panel>
          <Panel title="Schedule">
            <CardGrid cols={4}>{schedCards.map(c => <ScoreCard key={c.label} {...c} />)}</CardGrid>
          </Panel>
        </div>

        <Panel title="Operational Cost per Line">
          <CardGrid cols={4}>{lineCostCards.map(c => <ScoreCard key={c.label} {...c} />)}</CardGrid>
        </Panel>

        {/* Cost Estimations Engineer's own per-machine ranking (same figures
            as CostEstimation.jsx's Report tab — rate × Available Hours),
            surfaced here so the CEE's costing is visible on the scoreboard
            itself, not just inside the CEE module. */}
        <Panel title="Machine Cost Ranking (Cost Estimations Engineer)">
          <MiniTable
            headers={['Machine', 'Station', 'Activity', 'Rate (UGX/hr)', "Cost (UGX '000)"]}
            rows={(d.machineCostRows || []).slice(0, 8).map(r => [
              r.machineName || r.id, r.stationCode || '—', r.activity || '—', fint(r.rate), fint(r.costK),
            ])}
            empty="No machine rates set yet — add them in Cost Estimation."
          />
        </Panel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
        </div>

        {/* footer */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4,
          padding: '7px 14px', fontSize: 10,
        }}>
          <div style={{ fontWeight: 800, letterSpacing: '0.25em', color: C.red, fontSize: 10 }}>
            FOCUS · PLAN · EXECUTE · DELIVER
          </div>
        </div>
      </Page>

      {/* Note: this reads the full IMS-objectives master workbook (Targets,
          Tracker, Daily Output, Downtime, Bottlenecks, Quality, Safety,
          Environment, ECR, Cost, Waste, Kaizen, Calc) plus our own Cost
          Inputs tab — see useScoreboardData.js. Calc is pre-computed by the
          spreadsheet itself, so most KPIs are a direct lookup, not derived
          here. Labour cost is a cross-sheet read of the Travel Card's
          operators+submissions tabs, not this workbook. */}
      <div style={{ maxWidth: PAGE_WIDTH, margin: '8px auto 0', fontSize: 9.5, color: C.grey, textAlign: 'center' }}>
        Most KPIs are read live from the <b>Calc</b>/<b>Targets</b> tabs, pre-computed by the sheet itself. Production Operational Cost = Labour + Energy + Machine: Labour from Travel Card staff-on-duty records × the current Staff Hourly Rate; Energy from the <b>Environment</b> tab's latest logged month × the current Energy Tariff Rate; Machine from every registered machine's rate × Available Hours for the period. All three rates come from the Cost Estimation module's time-bounded rate history (Cost Estimations Engineer role) — a rate change never rewrites past costing. Cost figures show 0 until real rates are set. Safety/Quality/Environment/Bottlenecks/ECR/Waste all have real registers now — they'll populate as rows are logged in those tabs.
      </div>

      {emailOpen && <ScoreboardEmailModal onClose={() => setEmailOpen(false)} capturePages={capturePages} />}
    </div>
  );
}

function ScoreboardToolbar({ live, loading, error, lastUpdated, refresh, exportPNG, exportPDF, exporting, setEmailOpen, btn, selectorOpen, setSelectorOpen }) {
  const C = useC();
  const { theme, toggleTheme } = useContext(ThemeToggleCtx);
  return (
    <div style={{ maxWidth: PAGE_WIDTH, margin: '0 auto 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: C.grey }}>
        {live
          ? `Live · updated ${lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : `Showing sample data${error ? ` — ${error}` : ''}`}
      </span>
      <div style={{ flex: 1 }} />
      <button
        style={{ ...btn, borderColor: selectorOpen ? C.red : C.grey, color: selectorOpen ? C.red : C.grey }}
        onClick={() => setSelectorOpen(o => !o)}
      >⚙ {selectorOpen ? 'Hide' : 'Set'} Range &amp; Targets</button>
      <button style={btn} onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        <span style={{ marginLeft: 6 }}>{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>
      <button style={btn} onClick={refresh} disabled={loading}>{loading ? 'Syncing…' : 'Refresh'}</button>
      <button style={btn} onClick={exportPNG} disabled={exporting}>Export PNG</button>
      <button style={btn} onClick={exportPDF} disabled={exporting}>Export PDF</button>
      <button style={{ ...btn, borderColor: C.red, color: '#fff', background: C.red }} onClick={() => setEmailOpen(true)}>Email / Schedule</button>
    </div>
  );
}

// ── Theme provider wrapper ────────────────────────────────────────
const ThemeToggleCtx = createContext({ theme: 'dark', toggleTheme: () => {} });

const SB_TABS = [
  { id: 'dashboard', label: 'Live Dashboard' },
  { id: 'workbook',  label: 'Workbook View' },
];

function ScoreboardTabs({ view, setView }) {
  const C = useC();
  return (
    <div style={{ maxWidth: PAGE_WIDTH, margin: '0 auto 10px', display: 'flex', gap: 6 }}>
      {SB_TABS.map(t => {
        const active = view === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            style={{
              padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', fontFamily: 'inherit', cursor: 'pointer',
              borderRadius: 6, border: `1px solid ${active ? C.red : C.border}`,
              background: active ? C.red : 'transparent',
              color: active ? '#fff' : C.grey,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// The uploaded standalone workbook dashboard (public/dpn-scoreboard-workbook.html) is a
// separate, self-contained vanilla-JS app (its own Excel parser, live-file watcher, and
// theme) — embedding it via iframe keeps it intact rather than risking a lossy rewrite
// into the React component's rendering model.
function WorkbookView() {
  const C = useC();
  return (
    <div style={{ maxWidth: PAGE_WIDTH, margin: '0 auto', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: C.shadowLg }}>
      <iframe
        src="/dpn-scoreboard-workbook.html"
        title="DPN Scoreboard Workbook"
        style={{ width: '100%', height: 'calc(100vh - 90px)', border: 'none', display: 'block' }}
      />
    </div>
  );
}

export default function Scoreboard() {
  const [theme, setTheme] = useState(() => localStorage.getItem('kmc_scoreboard_theme') || 'dark');
  const [view, setView] = useState('dashboard');

  useEffect(() => {
    localStorage.setItem('kmc_scoreboard_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  return (
    <ThemeToggleCtx.Provider value={{ theme, toggleTheme }}>
      <ThemeCtx.Provider value={PALETTES[theme]}>
        <ScoreboardTabs view={view} setView={setView} />
        {view === 'dashboard' ? <ScoreboardInner /> : <WorkbookView />}
      </ThemeCtx.Provider>
    </ThemeToggleCtx.Provider>
  );
}
