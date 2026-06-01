/**
 * ExportPanel.jsx — v3
 * Added: PNG download, presentation slide screenshot
 * npm install xlsx jspdf html2canvas
 */

import { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { LINES, STATIONS } from '../data/stations';

const isKDC = (m = '') => m.toUpperCase().includes('KDC');
const isEVS = (m = '') => m.toUpperCase().includes('EVS');

function fmt(ms) {
  if (!ms || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? String(ts) : d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function getStatus(ms) {
  if (!ms) return 'On Track';
  if (ms > 48 * 3600000) return 'Delayed';
  if (ms > 24 * 3600000) return 'Slow';
  return 'On Track';
}

async function fetchLogoBase64() {
  try {
    const res = await fetch('/kmc logo 2.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Excel ─────────────────────────────────────────────────
function buildWorkbook(buses, allRows, metrics) {
  const wb    = XLSX.utils.book_new();
  const stamp = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const ws1 = XLSX.utils.aoa_to_sheet([
    ['KMC Bus Production Tracker — Dashboard Export'], [`Generated: ${stamp}`], [],
    ['Metric', 'Value'],
    ['Total buses on floor', metrics.total], ['KDC units', metrics.kdcCount], ['EVS units', metrics.evsCount],
    ['Production rate (7-day avg)', `${metrics.prodRate} buses/day`], [],
    ['Best station', metrics.bestStation?.name || '—'],
    ['Best station avg dwell', metrics.bestStation ? `${metrics.bestStation.hours.toFixed(1)}h` : '—'],
    ['Slowest station', metrics.worstStation?.name || '—'],
    ['Slowest station avg dwell', metrics.worstStation ? `${metrics.worstStation.hours.toFixed(1)}h` : '—'], [],
    ['Best line', metrics.bestLine?.label || '—'],
    ['Best line avg dwell/station', metrics.bestLine ? `${metrics.bestLine.hours.toFixed(1)}h` : '—'],
    ['Slowest line', metrics.worstLine?.label || '—'],
    ['Slowest line avg dwell/station', metrics.worstLine ? `${metrics.worstLine.hours.toFixed(1)}h` : '—'],
  ]);
  ws1['!cols'] = [{ wch: 36 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  const byVin = {};
  for (const row of allRows) { if (!byVin[row.vin]) byVin[row.vin] = []; byVin[row.vin].push(row); }
  const busRows = buses.map(bus => {
    const history  = (byVin[bus.vin] || []).filter(r => r.rawTimestamp).sort((a, b) => new Date(a.rawTimestamp) - new Date(b.rawTimestamp));
    const firstTs  = history[0] ? new Date(history[0].rawTimestamp).getTime() : null;
    const latestTs = history[history.length - 1] ? new Date(history[history.length - 1].rawTimestamp).getTime() : null;
    const now2     = Date.now();
    const totalMs  = firstTs  ? now2 - firstTs  : null;
    const curMs    = latestTs ? now2 - latestTs : null;
    const visited  = new Set(history.map(r => r.stationCode)).size;
    const lineId   = bus.station?.line;
    const lineTot  = lineId ? Object.values(STATIONS).filter(s => s.line === lineId).length : 0;
    return {
      VIN: bus.vin, Model: bus.model || '—',
      Line: LINES.find(l => l.id === lineId)?.label || lineId || '—',
      'Station Code': bus.stationCode, 'Station Name': bus.station?.name || bus.stationCode || '—',
      Status: getStatus(curMs), 'Time at Station': fmt(curMs), 'Total on Floor': fmt(totalMs),
      'First Entry': fmtDate(firstTs), 'Stations Visited': visited, 'Line Stations': lineTot,
      'Progress (%)': lineTot > 0 ? Math.min(Math.round((visited / lineTot) * 100), 100) : 0,
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(busRows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 42 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Buses on Floor');

  const ws3 = XLSX.utils.json_to_sheet(Object.entries(metrics.byModel).sort((a, b) => b[1] - a[1]).map(([model, count]) => ({ Model: model, Count: count, Family: isKDC(model) ? 'KDC' : isEVS(model) ? 'EVS' : 'Other' })));
  ws3['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'By Model');

  const ws4 = XLSX.utils.json_to_sheet(LINES.map(l => ({ Line: l.label, ID: l.id, Count: metrics.busesByLine[l.id] || 0 })).sort((a, b) => b.Count - a.Count));
  ws4['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'By Line');

  const ws5 = XLSX.utils.json_to_sheet(allRows.map(r => ({
    VIN: r.vin, Model: r.model || '—', 'Station Code': r.stationCode,
    'Station Name': STATIONS[r.stationCode]?.name || '—',
    Line: STATIONS[r.stationCode] ? LINES.find(l => l.id === STATIONS[r.stationCode].line)?.label || '—' : '—',
    Timestamp: r.rawTimestamp || '—',
  })));
  ws5['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 42 }, { wch: 30 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Full History');

  return wb;
}

// ── PDF (data report) ────────────────────────────────────
async function buildPDF(buses, allRows, metrics, logoBase64) {
  const RED = [220, 38, 38], BLACK = [15, 15, 15], DARKGRAY = [60, 60, 60];
  const MIDGRAY = [120, 120, 120], LIGHTGRAY = [220, 220, 220];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 16, CW = PW - M * 2;
  const stamp = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  let y = 0;

  function pageHeader() {
    doc.setFillColor(...RED); doc.rect(0, 0, PW, 2, 'F');
    if (logoBase64) { try { doc.addImage(logoBase64, 'PNG', M, 5, 18, 0); } catch {} }
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARKGRAY);
    doc.text('KMC Bus Production Tracker', M + 21, 9.5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MIDGRAY); doc.text(stamp, PW - M, 9.5, { align: 'right' });
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.3); doc.line(M, 14, PW - M, 14);
    y = 20;
  }

  // Cover
  doc.setFillColor(...RED); doc.rect(0, 0, PW, 2, 'F');
  if (logoBase64) { try { doc.addImage(logoBase64, 'PNG', M, 22, 44, 0); } catch {} }
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLACK);
  doc.text('Bus Production', M, 68); doc.text('Dashboard Report', M, 80);
  doc.setFillColor(...RED); doc.rect(M, 85, 36, 1.2, 'F');
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MIDGRAY);
  doc.text(stamp, M, 93); doc.text('KIIRA MOTORS CORPORATION — CONFIDENTIAL', M, 99);

  // Summary box
  const kpis = [
    ['Total on Floor', metrics.total], ['KDC Units', metrics.kdcCount],
    ['EVS Units', metrics.evsCount], ['Prod. Rate', `${metrics.prodRate}/day`],
  ];
  let bx = M, by = 116, bw = (CW - 6) / 4;
  kpis.forEach(([label, val], i) => {
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.3); doc.rect(bx + i * (bw + 2), by, bw, 22);
    doc.setFillColor(...RED); doc.rect(bx + i * (bw + 2), by, bw, 1.5, 'F');
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MIDGRAY);
    doc.text(label.toUpperCase(), bx + i * (bw + 2) + 3, by + 7);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLACK);
    doc.text(String(val), bx + i * (bw + 2) + 3, by + 18);
  });

  // Performance
  y = 152;
  [
    ['↑ Best Station', metrics.bestStation, true],
    ['↓ Slowest Station', metrics.worstStation, false],
    ['↑ Best Line', metrics.bestLine, true],
    ['↓ Slowest Line', metrics.worstLine, false],
  ].forEach(([title, item, good], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = M + col * (CW / 2 + 2), cy = y + row * 22;
    const bcolor = good ? [16, 185, 129] : RED;
    doc.setDrawColor(...bcolor); doc.setLineWidth(0.4); doc.rect(cx, cy, CW / 2 - 2, 18);
    doc.setFillColor(...bcolor); doc.rect(cx, cy, 1.5, 18, 'F');
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(...bcolor);
    doc.text(title.toUpperCase(), cx + 4, cy + 5);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARKGRAY);
    if (item) {
      const name = item.name || item.label || '—';
      doc.text(name.substring(0, 40), cx + 4, cy + 11);
      doc.setFontSize(6.5); doc.setTextColor(...MIDGRAY);
      const detail = item.hours ? `avg ${item.hours.toFixed(1)}h dwell` : '';
      if (detail) doc.text(detail, cx + 4, cy + 16);
    } else {
      doc.text('Not enough data yet', cx + 4, cy + 11);
    }
  });

  // Bus table — new landscape page
  doc.addPage([297, 210]);
  const LW = 297, LH = 210, LM = 14;
  doc.setFillColor(...RED); doc.rect(0, 0, LW, 2, 'F');
  if (logoBase64) { try { doc.addImage(logoBase64, 'PNG', LM, 4, 14, 0); } catch {} }
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARKGRAY);
  doc.text('KMC Bus Production Tracker — Bus Detail', LM + 17, 9);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...MIDGRAY); doc.text(stamp, LW - LM, 9, { align: 'right' });
  doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.3); doc.line(LM, 13, LW - LM, 13);

  const cols = [
    { label: 'VIN',          x: LM,         w: 36 },
    { label: 'Model',        x: LM + 37,    w: 20 },
    { label: 'Station',      x: LM + 58,    w: 66 },
    { label: 'At Station',   x: LM + 125,   w: 22 },
    { label: 'Total Time',   x: LM + 148,   w: 22 },
    { label: 'Status',       x: LM + 171,   w: 20 },
    { label: 'Progress',     x: LM + 192,   w: 18 },
  ];
  let ty = 18;
  doc.setFillColor(240, 240, 240); doc.rect(LM, ty - 4.5, LW - LM * 2, 6, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARKGRAY);
  cols.forEach(c => doc.text(c.label, c.x + 1, ty));
  ty += 4;

  const byVin2 = {};
  for (const row of allRows) { if (!byVin2[row.vin]) byVin2[row.vin] = []; byVin2[row.vin].push(row); }

  buses.forEach((bus, idx) => {
    if (ty > LH - 16) {
      doc.addPage([297, 210]);
      doc.setFillColor(...RED); doc.rect(0, 0, LW, 2, 'F');
      doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.3); doc.line(LM, 13, LW - LM, 13);
      ty = 18;
    }
    const history  = (byVin2[bus.vin] || []).filter(r => r.rawTimestamp).sort((a, b) => new Date(a.rawTimestamp) - new Date(b.rawTimestamp));
    const firstTs  = history[0] ? new Date(history[0].rawTimestamp).getTime() : null;
    const latestTs = history[history.length - 1] ? new Date(history[history.length - 1].rawTimestamp).getTime() : null;
    const now3     = Date.now();
    const totalMs  = firstTs  ? now3 - firstTs  : null;
    const curMs    = latestTs ? now3 - latestTs : null;
    const visited  = new Set(history.map(r => r.stationCode)).size;
    const lineId   = bus.station?.line;
    const lineTot  = lineId ? Object.values(STATIONS).filter(s => s.line === lineId).length : 0;
    const progress = lineTot > 0 ? Math.min(Math.round((visited / lineTot) * 100), 100) : 0;
    const status   = getStatus(curMs);
    const sColor   = status === 'Delayed' ? RED : status === 'Slow' ? [245, 158, 11] : [16, 185, 129];

    doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255);
    doc.rect(LM, ty - 4, LW - LM * 2, 6, 'F');
    doc.setFontSize(6.2); doc.setFont('helvetica', 'normal');

    doc.setTextColor(...DARKGRAY); doc.text(bus.vin.substring(0, 22), cols[0].x + 1, ty);
    doc.setTextColor(...(isKDC(bus.model) ? RED : [6, 182, 212])); doc.setFont('helvetica', 'bold');
    doc.text(bus.model || '—', cols[1].x + 1, ty);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARKGRAY);
    doc.text((bus.station?.name || bus.stationCode || '—').substring(0, 36), cols[2].x + 1, ty);
    doc.setTextColor(...sColor); doc.setFont('helvetica', 'bold');
    doc.text(fmt(curMs), cols[3].x + 1, ty);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MIDGRAY);
    doc.text(fmt(totalMs), cols[4].x + 1, ty);
    doc.setTextColor(...sColor); doc.setFont('helvetica', 'bold');
    doc.text(status, cols[5].x + 1, ty);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARKGRAY);
    doc.text(`${progress}%`, cols[6].x + 1, ty);
    ty += 7;
  });

  // Footers
  const totalPages = doc.internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fw = p === 1 ? PW : LW, fh = p === 1 ? PH : LH;
    doc.setFillColor(245, 245, 245); doc.rect(0, fh - 8, fw, 8, 'F');
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.3); doc.line(0, fh - 8, fw, fh - 8);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MIDGRAY);
    doc.text('KIIRA MOTORS CORPORATION — CONFIDENTIAL', LM, fh - 3);
    doc.text(`Page ${p} of ${totalPages}`, fw - LM, fh - 3, { align: 'right' });
  }
  return doc;
}

// ── Capture element → canvas ──────────────────────────────
async function captureElement(el) {
  return html2canvas(el, { backgroundColor: '#07090f', scale: 2, useCORS: true, logging: false });
}

// ── ExportPanel ───────────────────────────────────────────
export default function ExportPanel({ buses, allRows, metrics, dashboardRef, slideRef, onPresent }) {
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState(null);
  const date = new Date().toISOString().slice(0, 10);

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }
  function setLoading(key, val) { setBusy(b => ({ ...b, [key]: val })); }

  async function handleExcel() {
    setLoading('excel', true);
    try { XLSX.writeFile(buildWorkbook(buses, allRows, metrics), `KMC_Dashboard_${date}.xlsx`); showToast('Excel downloaded ✓'); }
    catch (e) { console.error(e); showToast('Excel export failed', false); }
    finally { setLoading('excel', false); }
  }

  async function handlePDF() {
    setLoading('pdf', true);
    try {
      const logo = await fetchLogoBase64();
      const doc  = await buildPDF(buses, allRows, metrics, logo);
      doc.save(`KMC_Dashboard_${date}.pdf`);
      showToast('PDF downloaded ✓');
    } catch (e) { console.error(e); showToast('PDF export failed', false); }
    finally { setLoading('pdf', false); }
  }

  async function handleScreenshotPDF() {
    const el = slideRef?.current || dashboardRef?.current;
    if (!el) { showToast('Nothing to capture', false); return; }
    setLoading('scpdf', true);
    try {
      const canvas  = await captureElement(el);
      const imgData = canvas.toDataURL('image/png');
      const pdf     = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width / 2, canvas.height / 2] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`KMC_Presentation_${date}.pdf`);
      showToast('Presentation PDF downloaded ✓');
    } catch (e) { console.error(e); showToast('PDF screenshot failed', false); }
    finally { setLoading('scpdf', false); }
  }

  async function handlePNG() {
    const el = slideRef?.current || dashboardRef?.current;
    if (!el) { showToast('Nothing to capture', false); return; }
    setLoading('png', true);
    try {
      const canvas = await captureElement(el);
      const a = document.createElement('a');
      a.href     = canvas.toDataURL('image/png');
      a.download = `KMC_Dashboard_${date}.png`;
      a.click();
      showToast('PNG downloaded ✓');
    } catch (e) { console.error(e); showToast('PNG export failed', false); }
    finally { setLoading('png', false); }
  }

  const Spinner = () => (
    <div style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'epSpin 0.7s linear infinite', display: 'inline-block' }} />
  );

  const Btn = ({ id, color, border, icon, label, onClick, title }) => (
    <button
      onClick={onClick}
      disabled={!!busy[id]}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: 'transparent',
        border: `1px solid ${busy[id] ? 'rgba(255,255,255,0.06)' : border}`,
        borderRadius: 4, padding: '6px 14px',
        fontSize: 13, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        fontFamily: "'Barlow Condensed', sans-serif", cursor: busy[id] ? 'not-allowed' : 'pointer',
        color: busy[id] ? '#334155' : color, transition: 'all 0.15s',
      }}
    >
      {busy[id] ? <Spinner /> : icon}
      {label}
    </button>
  );

  const icons = {
    excel: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
    pdf:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6M9 11h3"/></svg>,
    cam:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    png:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    slide: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  };

  return (
    <div style={{ position: 'relative' }}>
      <style>{`@keyframes epSpin { to { transform: rotate(360deg); } }`}</style>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 14, marginTop: 4,
      }}>
        <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 4 }}>
          Export
        </span>

        <Btn id="excel" color="#4ade80" border="rgba(74,222,128,0.22)"  icon={icons.excel} label="Excel"          onClick={handleExcel}        title="Full Excel workbook (5 sheets)" />
        <Btn id="pdf"   color="#f87171" border="rgba(248,113,113,0.22)" icon={icons.pdf}   label="PDF Report"     onClick={handlePDF}          title="Formatted PDF report with KMC branding" />
        <Btn id="scpdf" color="#818cf8" border="rgba(129,140,248,0.22)" icon={icons.cam}   label="Slide PDF"      onClick={handleScreenshotPDF} title="Screenshot of presentation slide as PDF" />
        <Btn id="png"   color="#fbbf24" border="rgba(251,191,36,0.22)"  icon={icons.png}   label="PNG"            onClick={handlePNG}          title="Download dashboard as PNG image" />

        {onPresent && (
          <button
            onClick={onPresent}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
              color: '#93c5fd', borderRadius: 4, padding: '6px 14px',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: "'Barlow Condensed', sans-serif", cursor: 'pointer',
            }}
          >
            {icons.slide} Present
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em' }}>
          {buses.length} BUS{buses.length !== 1 ? 'ES' : ''} · {allRows.length} RECORDS
        </span>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.ok ? 'rgba(16,185,129,0.12)' : 'rgba(220,38,38,0.12)',
          border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.4)' : 'rgba(220,38,38,0.4)'}`,
          borderLeft: `3px solid ${toast.ok ? '#10b981' : '#dc2626'}`,
          borderRadius: '0 6px 6px 0', padding: '10px 18px',
          fontSize: 12, fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em',
          color: toast.ok ? '#6ee7b7' : '#fca5a5', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
