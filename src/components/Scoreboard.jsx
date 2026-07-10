import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useScoreboardData } from '../hooks/useScoreboardData';

// ── Fixed scoreboard palette (independent of app theme so exports are consistent) ──
const C = {
  bg: '#05070a', panel: '#0d1117', border: '#1c2330', red: '#e0292b',
  navy: '#101623', green: '#2ecc71', amber: '#f2a900', blue: '#3498db',
  grey: '#8a93a3', text: '#eef1f6', rowAlt: '#0a0f16',
};

const WORKSHOP_IMG = {
  'Machine Shop': '/Machine Shop.jpg',
  'Frame & Body Parts Making': '/Frame Parts Making.jpg',
  'Chassis Production Line 01': '/Chassis Line 01.jpeg',
  'Frame & Body Welding': '/Frame & Body Welding.png',
  'Paint Shop': '/Paint Shop.png',
  'Chassis Production Line 02': '/Chassis Line 02.jpg',
  'Trim & Final Assembly': '/Trim Line & Final Assembly.jpg',
  'Quality Inspection & Testing': '/Quality Inspection & Testing.png',
};

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
};

// ── formatting helpers ──────────────────────────────────────────
const fpct  = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fpct1 = v => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const f1    = v => (v == null ? '—' : Number(v).toFixed(1));
const f2    = v => (v == null ? '—' : Number(v).toFixed(2));
const fint  = v => (v == null ? '—' : Math.round(v).toLocaleString());

function statusOf(actual, target, dir) {
  if (actual == null || target == null || dir == null) return null;
  if (dir === 'gte') return actual >= target ? 'ON TRACK' : 'BEHIND';
  if (dir === 'lte') return actual <= target ? 'ON TRACK' : 'BEHIND';
  return null;
}

function Pill({ status }) {
  if (!status) return <span style={{ color: C.grey, fontSize: 9 }}>—</span>;
  const bg = status === 'ON TRACK' ? C.green : status === 'AT RISK' ? C.amber : C.red;
  const fg = status === 'ON TRACK' || status === 'AT RISK' ? '#04210f' : '#fff';
  return (
    <span style={{
      background: bg, color: fg, fontSize: 8, fontWeight: 800, padding: '2px 7px',
      borderRadius: 3, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

function Donut({ pct, color, size = 64 }) {
  const p = Math.max(0, Math.min(100, Math.round((pct || 0) * 100)));
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', margin: '0 auto',
      background: `conic-gradient(${color} ${p}%, #1c2330 0)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: size - 22, height: size - 22, borderRadius: '50%', background: C.panel,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13, color: C.text,
      }}>{p}%</div>
    </div>
  );
}

function Panel({ title, children, style }) {
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style,
    }}>
      <div style={{
        background: C.red, color: '#fff', fontWeight: 800, fontSize: 11,
        letterSpacing: '0.05em', textTransform: 'uppercase', padding: '5px 10px',
      }}>{title}</div>
      <div style={{ padding: '8px 10px', flex: 1 }}>{children}</div>
    </div>
  );
}

function KpiTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
      <thead>
        <tr>
          {['KPI', 'Actual', 'Target', 'Status'].map(h => (
            <th key={h} style={{
              background: C.navy, color: C.grey, fontSize: 8.5, textTransform: 'uppercase',
              padding: '4px 6px', textAlign: h === 'KPI' ? 'left' : 'center',
              borderBottom: `1px solid ${C.border}`, letterSpacing: '0.04em',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label} style={{ background: i % 2 ? C.rowAlt : 'transparent' }}>
            <td style={{ padding: '4px 6px', color: C.grey, borderBottom: '1px solid #131a24' }}>{r.label}</td>
            <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 800, color: C.text, borderBottom: '1px solid #131a24' }}>{r.actual}</td>
            <td style={{ padding: '4px 6px', textAlign: 'center', color: C.grey, borderBottom: '1px solid #131a24' }}>{r.target ?? '—'}</td>
            <td style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #131a24' }}><Pill status={r.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MiniTable({ headers, rows, empty }) {
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
              <td key={j} style={{ padding: '4px 5px', color: j === 0 ? C.text : C.grey, borderBottom: '1px solid #131a24' }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CumChart({ daily }) {
  const w = 460, h = 170, pad = 28;
  const pts = daily.filter(d => d.cumPlan != null);
  if (pts.length < 2) return <div style={{ color: C.grey, fontSize: 10, padding: 20 }}>No output data yet.</div>;
  const maxV = Math.max(...pts.map(d => d.cumPlan), ...pts.map(d => d.cumAct ?? 0), 1) * 1.15;
  const x = i => pad + i * ((w - pad * 2) / (pts.length - 1));
  const y = v => h - pad - (v / maxV) * (h - pad * 1.6);
  const path = (key) => pts.map((d, i) => (d[key] == null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`)).filter(Boolean).join(' ');
  const actPts = pts.filter(d => d.cumAct != null);
  const gap = actPts.length ? (actPts[actPts.length - 1].cumPlan ?? 0) - (actPts[actPts.length - 1].cumAct ?? 0) : 0;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 9, color: C.grey, marginBottom: 4 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 3, background: C.blue, marginRight: 4 }} />Planned (cum.)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 3, background: C.green, marginRight: 4 }} />Actual (cum.)</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke={C.border} />
        <path d={path('cumPlan')} fill="none" stroke={C.blue} strokeWidth="2" />
        <path d={path('cumAct')} fill="none" stroke={C.green} strokeWidth="2" />
        {pts.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.cumPlan)} r="2.5" fill={C.blue} />
            {d.cumAct != null && <circle cx={x(i)} cy={y(d.cumAct)} r="2.5" fill={C.green} />}
            {i % Math.ceil(pts.length / 8) === 0 && (
              <text x={x(i)} y={h - 8} fontSize="7.5" fill={C.grey} textAnchor="middle">
                {String(d.date).split(' ').slice(-2).join(' ')}
              </text>
            )}
          </g>
        ))}
      </svg>
      {gap > 0 && (
        <div style={{
          position: 'absolute', right: 6, top: '38%', background: C.panel,
          border: `1px solid ${C.red}`, borderRadius: 4, padding: '4px 10px',
          textAlign: 'center', fontSize: 8.5, color: C.grey,
        }}>
          CURRENT GAP<span style={{ color: C.red, fontWeight: 800, fontSize: 14, display: 'block' }}>{gap} VEHICLES</span>
        </div>
      )}
    </div>
  );
}

// ── Email modal (posts to server.js /api/send-report) ───────────
function ScoreboardEmailModal({ onClose, capturePages }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('KMC DPN Scoreboard');
  const [schedule, setSchedule] = useState('now');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [weekday, setWeekday] = useState('MON');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const endpoint = import.meta.env?.VITE_EMAIL_ENDPOINT || null;

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
      if (!endpoint) {
        window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
          'KMC DPN Scoreboard — email server not configured (VITE_EMAIL_ENDPOINT). Use the PNG/PDF export buttons and attach manually.'
        )}`, '_blank');
        setStatus({ ok: true, msg: 'No email server configured — opened your mail client instead.' });
        return;
      }
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to, subject, schedule, scheduledTime, weekday,
          busCount: 0, attachments,
        }),
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

// ── Main component ──────────────────────────────────────────────
export default function Scoreboard() {
  const { data, loading, error, lastUpdated, refresh } = useScoreboardData();
  const [emailOpen, setEmailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const page1Ref = useRef(null);
  const page2Ref = useRef(null);

  const live = !!data;
  const d = data || SAMPLE;
  const kv = d.kv;
  const g = (key) => kv[key] || {};
  const num = (key) => g(key).num ?? null;
  const raw = (key) => g(key).raw ?? '';
  const ytd = (key) => g(key).ytdNum ?? null;

  async function capturePages() {
    const opts = { backgroundColor: C.bg, scale: 2, useCORS: true, logging: false };
    const c1 = await html2canvas(page1Ref.current, opts);
    const c2 = await html2canvas(page2Ref.current, opts);
    return [c1, c2];
  }

  async function exportPNG() {
    setExporting(true);
    try {
      const canvases = await capturePages();
      const stamp = new Date().toISOString().slice(0, 10);
      canvases.forEach((cv, i) => {
        const a = document.createElement('a');
        a.download = `KMC_Scoreboard_p${i + 1}_${stamp}.png`;
        a.href = cv.toDataURL('image/png');
        a.click();
      });
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
        pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
      });
      pdf.save(`KMC_Scoreboard_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExporting(false); }
  }

  const target = num('Program Target (vehicles)') ?? 45;
  const o1 = [
    { label: 'Buses per Day', actual: f1(num('Buses per Day (period)')), target: fint(num('Target: Buses per Day')), status: statusOf(num('Buses per Day (period)'), num('Target: Buses per Day'), 'gte') },
    { label: 'On-Time Delivery', actual: fpct(num('On-Time Delivery %')), target: fpct(num('Target: On-Time Delivery')), status: statusOf(num('On-Time Delivery %'), num('Target: On-Time Delivery'), 'gte') },
    { label: 'Avg Cycle Time (days)', actual: f1(num('Avg Cycle Time (days)')), target: `≤ ${fint(num('Target: Cycle Time (days)'))}`, status: statusOf(num('Avg Cycle Time (days)'), num('Target: Cycle Time (days)'), 'lte') },
    { label: 'Completed Buses', actual: fint(num('Completed')), target: fint(target), status: null },
    { label: 'In Production', actual: fint(num('In Production')), target: null, status: null },
    { label: 'Behind Schedule', actual: fint(num('Behind Schedule (buses)')), target: '0', status: statusOf(num('Behind Schedule (buses)'), 0, 'lte') },
    { label: 'SPI', actual: f2(num('SPI')), target: '≥ 0.95', status: statusOf(num('SPI'), 0.95, 'gte') },
    { label: 'Forecast Completion', actual: raw('Forecast Completion') || '—', target: raw('Scoreboard Period End'), status: null },
  ];
  const insp = num('Vehicles Inspected');
  const o2 = [
    { label: 'First Pass Yield', actual: fpct(num('First Pass Yield')), target: fpct(num('Target: First Pass Yield')), status: insp ? statusOf(num('First Pass Yield'), num('Target: First Pass Yield'), 'gte') : null },
    { label: 'Rework Hrs / Unit', actual: f1(num('Rework Hours per Unit')), target: '↓ 80%', status: null },
    { label: 'Critical Defects', actual: fint(num('Critical Defects')), target: '0', status: statusOf(num('Critical Defects'), 0, 'lte') },
    { label: 'Vehicles Inspected', actual: fint(insp), target: null, status: null },
    { label: 'Defects Found', actual: fint(num('Defects Found')), target: null, status: null },
    { label: 'Defects Closed', actual: fint(num('Defects Closed')), target: null, status: null },
    { label: 'Open Defects (YTD)', actual: fint(num('Open Defects (YTD)')), target: '0', status: statusOf(num('Open Defects (YTD)'), 0, 'lte') },
    { label: 'Defects per Vehicle', actual: f2(num('Defects per Vehicle')), target: null, status: null },
  ];
  const baseDT = num('Baseline Unplanned Downtime (hrs / period)');
  const o3 = [
    { label: 'OEE', actual: fpct(num('OEE')), target: fpct(num('Target: OEE')), status: statusOf(num('OEE'), num('Target: OEE'), 'gte') },
    { label: 'Unplanned Downtime (h)', actual: f1(num('Unplanned Downtime (hrs)')), target: baseDT ? f1(baseDT * 0.8) : null, status: baseDT ? statusOf(num('Unplanned Downtime (hrs)'), baseDT * 0.8, 'lte') : null },
    { label: 'Downtime vs Baseline', actual: fpct(num('Downtime vs Baseline')), target: '≤ −20%', status: baseDT ? statusOf(num('Downtime vs Baseline'), -0.2, 'lte') : null },
    { label: 'MTTR (hrs)', actual: f1(num('MTTR (hrs)')), target: `≤ ${fint(num('Target: MTTR (hours)'))}`, status: num('Breakdown Events (M1)') ? statusOf(num('MTTR (hrs)'), num('Target: MTTR (hours)'), 'lte') : null },
    { label: 'MTBF (hrs)', actual: fint(num('MTBF (hrs)')), target: '↑ +20%', status: null },
    { label: 'Breakdown Events', actual: fint(num('Breakdown Events (M1)')), target: null, status: null },
    { label: 'Total Hours Lost', actual: f1(num('Total Hours Lost')), target: null, status: null },
    { label: 'Open Bottlenecks', actual: fint(num('Open Bottlenecks')), target: '0', status: statusOf(num('Open Bottlenecks'), 0, 'lte') },
  ];
  const o4 = [
    { label: 'Days Without LTI', actual: fint(num('Days Without Lost-Time Injury')), target: '↑', status: null },
    { label: 'Lost-Time Injuries', actual: fint(num('Lost-Time Injuries')), target: '0', status: statusOf(num('Lost-Time Injuries'), 0, 'lte') },
    { label: 'Near Misses Reported', actual: fint(num('Near Misses Reported')), target: null, status: null },
    { label: 'Near-Miss Response', actual: fpct(num('Near-Miss Response Rate')), target: '100%', status: statusOf(num('Near-Miss Response Rate'), 1, 'gte') },
    { label: 'PPE Misuse', actual: fint(num('PPE Misuse Incidents')), target: '0', status: statusOf(num('PPE Misuse Incidents'), 0, 'lte') },
    { label: 'Unsafe Conditions', actual: fint(num('Unsafe Conditions')), target: null, status: null },
    { label: 'Corrective Actions Closed', actual: fint(num('Corrective Actions Closed')), target: null, status: null },
    { label: 'Inspection Compliance', actual: fpct(num('Safety Inspection Compliance')), target: '100%', status: statusOf(num('Safety Inspection Compliance'), 0.95, 'gte') },
  ];
  const o5 = [
    { label: 'Energy / Unit (kWh)', actual: f1(num('Energy per Unit (latest month, kWh)')), target: '↓ 5%', status: null },
    { label: 'Energy vs Baseline', actual: fpct(num('Energy vs Baseline')), target: '≤ −5%', status: null },
    { label: 'Waste / Unit (kg)', actual: f1(num('Waste per Unit (period, kg)')), target: '↓ 10%', status: null },
    { label: 'Waste vs Baseline', actual: fpct(num('Waste vs Baseline')), target: '≤ −10%', status: null },
    { label: 'Paper (reams / month)', actual: fint(num('Paper Used (latest month, reams)')), target: '↓ 50%', status: null },
    { label: 'Paper vs Baseline', actual: fpct(num('Paper vs Baseline')), target: '≤ −50%', status: null },
    { label: "Waste Cost (UGX '000)", actual: fint(num("Waste Cost (period, UGX '000)")), target: null, status: null },
    { label: 'Waste Items (period)', actual: fint(num('Waste Items (period)')), target: null, status: null },
  ];
  const cost = [
    { label: "Budget (UGX '000)", actual: fint(num('Budget Total')), target: null, status: null },
    { label: "Actual (UGX '000)", actual: fint(num('Actual Total')), target: null, status: null },
    { label: 'Variance', actual: fint(num('Variance')), target: '≤ 0', status: statusOf(num('Variance'), 0, 'lte') },
    { label: 'Variance %', actual: fpct1(num('Variance %')), target: '≤ 5%', status: num('Actual Total') ? statusOf(num('Variance %'), 0.05, 'lte') : null },
  ];
  const sched = [
    { label: 'Activities On Time', actual: fpct(num('On-Time %')), target: '≥ 95%', status: statusOf(num('On-Time %'), 0.95, 'gte') },
    { label: 'Avg Delay (days)', actual: f1(num('Avg Schedule Delay (days)')), target: '0', status: statusOf(num('Avg Schedule Delay (days)'), 0, 'lte') },
    { label: 'Critical Activity', actual: raw('Critical Activity') || '—', target: null, status: null },
    { label: 'Downtime % of Hours', actual: fpct1(num('Downtime % of Available')), target: null, status: null },
  ];
  const dtBreakdown = ['M1 - Machine breakdown', 'M2 - Material shortage', 'M3 - Power/Energy',
    'M4 - Tooling/jig failure', 'M5 - Operator/skill gap', 'M6 - Quality rework stoppage', 'M7 - Other']
    .map(k => [k, `${f1(num(k))} h`]);

  const wsColor = s => s === 'ON TRACK' ? C.green : s === 'AT RISK' ? C.amber : C.red;
  const achievement = num('Achievement %') ?? 0;
  const dailyRecent = d.daily.slice(-8);

  const btn = {
    background: 'transparent', border: `1px solid ${C.border}`, color: C.grey,
    borderRadius: 5, padding: '6px 12px', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 12, fontFamily: "'Inter', Arial, sans-serif", color: C.text }}>
      {/* toolbar (not captured in exports) */}
      <div style={{ maxWidth: 1560, margin: '0 auto 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!live && (
          <span style={{ background: C.amber, color: '#3a2600', fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 3, letterSpacing: '0.05em' }}>
            SAMPLE DATA — {error || 'sheet not reachable'}
          </span>
        )}
        {live && lastUpdated && (
          <span style={{ fontSize: 10, color: C.grey }}>
            Live · updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button style={btn} onClick={refresh} disabled={loading}>{loading ? 'Syncing…' : 'Refresh'}</button>
        <button style={btn} onClick={exportPNG} disabled={exporting}>Export PNG</button>
        <button style={btn} onClick={exportPDF} disabled={exporting}>Export PDF</button>
        <button style={{ ...btn, borderColor: C.red, color: '#fff', background: C.red }} onClick={() => setEmailOpen(true)}>Email / Schedule</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {/* ═══════════ PAGE 1 ═══════════ */}
        <div ref={page1Ref} style={{ width: 1560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'stretch', background: '#000', border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', minWidth: 210 }}>
              <img src="/kmc logo 2.png" alt="KMC" style={{ height: 40, objectFit: 'contain' }} crossOrigin="anonymous" />
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.05em' }}>KMC</div>
                <div style={{ fontSize: 8, color: C.grey, letterSpacing: '0.18em' }}>KIIRA MOTORS CORPORATION</div>
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 10px' }}>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Department of Production — Scoreboard
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.red, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {raw('Program / Project Name') || '45-BUS PRODUCTION PROJECT'} · IMS OBJECTIVES
              </div>
            </div>
            <div style={{ minWidth: 230, borderLeft: `1px solid ${C.border}`, padding: '6px 16px', fontSize: 11, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.grey }}>PERIOD</span><b>{raw('Scoreboard Period Start')} – {raw('Scoreboard Period End')}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.grey }}>UPDATED</span><b>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.grey }}>SHIFT</span><b>{raw('Shift Label') || 'DAY SHIFT'}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.grey }}>REF</span><b style={{ fontSize: 9 }}>KMC.DQHSE12/25-REG003</b></div>
            </div>
          </div>

          {/* objectives 1-3 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Panel title="Objective 1 — Throughput & On-Time Delivery"><KpiTable rows={o1} /></Panel>
            <Panel title="Objective 2 — Defect-Free Production"><KpiTable rows={o2} /></Panel>
            <Panel title="Objective 3 — Downtime / Equipment"><KpiTable rows={o3} /></Panel>
          </div>

          {/* line status */}
          <Panel title="Production Line Status" style={{ padding: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', margin: '-8px -10px' }}>
              {d.workshops.map((w, i) => (
                <div key={w.name} style={{ borderRight: i < 7 ? `1px solid ${C.border}` : 'none', padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ height: 44, borderRadius: 4, overflow: 'hidden', marginBottom: 5, background: C.navy }}>
                    {WORKSHOP_IMG[w.name] && (
                      <img src={WORKSHOP_IMG[w.name]} alt="" crossOrigin="anonymous"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                    )}
                  </div>
                  <div style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', minHeight: 22, lineHeight: 1.2 }}>{w.name}</div>
                  <div style={{ fontSize: 10, color: C.grey, margin: '2px 0 5px' }}>{w.done} / {45 - (w.na || 0)}</div>
                  <Donut pct={w.pct} color={wsColor(w.status)} size={58} />
                  <div style={{ marginTop: 5 }}><Pill status={w.status} /></div>
                  <div style={{ fontSize: 7, color: C.grey, textTransform: 'uppercase', marginTop: 4 }}>Constraint</div>
                  <div style={{ fontSize: 9, fontWeight: 700, minHeight: 12 }}>{w.constraint}</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* daily output + chart + cost/schedule */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.5fr 1fr 1fr', gap: 8 }}>
            <Panel title="Daily Production Output">
              <MiniTable
                headers={['Date', 'Plan', 'Act', 'Cum P', 'Cum A']}
                rows={dailyRecent.map(r => [r.date, r.planned, r.actual ?? '-', r.cumPlan, r.cumAct ?? '-'])}
                empty="No output rows for this period."
              />
            </Panel>
            <Panel title="Planned vs Actual (Cumulative)">
              <CumChart daily={d.daily} />
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 8.5, color: C.grey, textTransform: 'uppercase', marginBottom: 3 }}>
                  Overall Progress — {fpct(achievement)} of {fint(target)} buses
                </div>
                <div style={{ background: '#1c2330', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round(achievement * 100)}%`, height: '100%',
                    background: `linear-gradient(90deg, #1e8449, ${C.green})`,
                    fontSize: 9, fontWeight: 800, color: '#04210f', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', minWidth: 30,
                  }}>{fpct(achievement)}</div>
                </div>
              </div>
            </Panel>
            <Panel title="Production Cost (Period)"><KpiTable rows={cost} /></Panel>
            <Panel title="Schedule Performance"><KpiTable rows={sched} /></Panel>
          </div>
        </div>

        {/* ═══════════ PAGE 2 ═══════════ */}
        <div ref={page2Ref} style={{ width: 1560, margin: '8px auto 0', display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Panel title="Objective 4 — Safety (Zero LTI)"><KpiTable rows={o4} /></Panel>
            <Panel title="Objective 5 — Environment"><KpiTable rows={o5} /></Panel>
            <Panel title="Downtime Breakdown (Period)">
              <MiniTable headers={['Reason', 'Hours']} rows={dtBreakdown} empty="" />
            </Panel>
          </div>
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
          {/* footer legend */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4,
            padding: '7px 14px', fontSize: 10,
          }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', color: C.grey }}>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, background: C.green, borderRadius: 2, marginRight: 5, verticalAlign: -1 }} />ON TRACK — on plan</span>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, background: C.amber, borderRadius: 2, marginRight: 5, verticalAlign: -1 }} />AT RISK — requires attention</span>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, background: C.red, borderRadius: 2, marginRight: 5, verticalAlign: -1 }} />DELAYED / BEHIND — immediate action</span>
            </div>
            <div style={{ fontWeight: 800, letterSpacing: '0.25em', color: C.red, fontSize: 10 }}>
              FOCUS · PLAN · EXECUTE · DELIVER
            </div>
          </div>
        </div>
      </div>

      {emailOpen && <ScoreboardEmailModal onClose={() => setEmailOpen(false)} capturePages={capturePages} />}
    </div>
  );
}
