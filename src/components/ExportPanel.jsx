/**
 * ExportPanel.jsx — v7
 * PNG button now downloads the Dashboard cover slide (dark design).
 * A hidden off-screen cover div is rendered and captured with html2canvas.
 *
 * Props: { buses, rows, startDate, endDate, metrics, dashboardRef, slideRef, onPresent }
*/

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { LINES, STATIONS } from '../data/stations';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
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

async function fetchLogoBase64(path = '/kmc logo 2.png') {
  try {
    const res = await fetch(path);
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

// ─────────────────────────────────────────────────────────────
// HiddenCoverSlide — rendered off-screen for PNG capture
// Mirrors the CoverSlide in Presentation.jsx
// ─────────────────────────────────────────────────────────────
function HiddenCoverSlide({ coverRef, buses, rows, metrics, stationTimes = {} }) {
  const lineColors = {
    MACHINE: '#64748b', BODY: '#8b5cf6', BODY_KDC: '#7c3aed',
    FRAME: '#f97316', CHASSIS1: '#10b981', CHASSIS2: '#059669',
    ELECTRO: '#06b6d4', PAINT: '#ec4899', TRIM: '#3b82f6', QA: '#ef4444',
  };
  const modelColor = (m = '') => isKDC(m) ? '#dc2626' : isEVS(m) ? '#38bdf8' : '#64748b';

  const lineDistribution = LINES
    .map(l => ({ ...l, count: metrics.busesByLine?.[l.id] || 0 }))
    .filter(l => l.count > 0)
    .sort((a, b) => b.count - a.count);

  const modelEntries = Object.entries(metrics.byModel || {}).sort((a, b) => b[1] - a[1]);
  const maxLine  = Math.max(...lineDistribution.map(l => l.count), 1);
  const maxModel = Math.max(...modelEntries.map(e => e[1]), 1);

  const byVin = {};
  for (const row of rows) {
    if (!byVin[row.vin]) byVin[row.vin] = [];
    byVin[row.vin].push(row);
  }
  const delayed = buses.filter(b => {
    const hist = (byVin[b.vin] || []).filter(r => r.rawTimestamp)
      .sort((a, c) => new Date(c.rawTimestamp) - new Date(a.rawTimestamp));
    const latestTs = hist[0] ? new Date(hist[0].rawTimestamp).getTime() : null;
    const ms = latestTs ? Date.now() - latestTs : null;
    return ms && ms > 48 * 3600000;
  }).length;

  const now = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const kpis = [
    { label: 'Total on Floor',    value: metrics.total    || 0, color: '#475569' },
    { label: 'KDC Units',         value: metrics.kdcCount || 0, color: '#dc2626' },
    { label: 'EVS Units',         value: metrics.evsCount || 0, color: '#38bdf8' },
    { label: 'Delayed',           value: delayed,               color: '#ef4444' },
    { label: 'Prod Rate (7-day)', value: `${metrics.prodRate || 0}/d`, color: '#10b981' },
  ];

  const perfItems = [
    { title: '↑ Best Station',    item: metrics.bestStation,  accent: '#10b981' },
    { title: '↓ Slowest Station', item: metrics.worstStation, accent: '#dc2626' },
    { title: '↑ Best Line',       item: metrics.bestLine,     accent: '#10b981' },
    { title: '↓ Slowest Line',    item: metrics.worstLine,    accent: '#dc2626' },
  ];

  return (
    <div
      ref={coverRef}
      style={{
        position: 'fixed',
        top: -9999,
        left: -9999,
        width: 1400,
        background: '#07090f',
        fontFamily: "'Barlow Condensed', sans-serif",
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        borderBottom: '2px solid rgba(220,38,38,0.4)',
        padding: '18px 32px 14px',
        background: 'rgba(10,16,28,0.95)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, transparent, #dc2626 30%, #dc2626 70%, transparent)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/kmc logo 2.png" alt="KMC" style={{ height: 44, objectFit: 'contain' }} />
            <div>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 22, fontWeight: 900, letterSpacing: '0.2em',
                color: '#ffffff', textTransform: 'uppercase', lineHeight: 1,
              }}>KMC Bus Production Report</div>
              <div style={{ fontSize: 11, color: '#475569', fontFamily: "'Space Mono', monospace", marginTop: 4, letterSpacing: '0.1em' }}>
                {now} · KIIRA MOTORS CORPORATION — CONFIDENTIAL
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em' }}>
            DASHBOARD SUMMARY · COVER SLIDE
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 32px 28px' }}>
        {/* KPI row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {kpis.map(({ label, value, color }) => (
            <div key={label} style={{
              flex: 1,
              background: 'rgba(13,21,38,0.9)',
              border: `1px solid ${color}44`,
              borderTop: `2px solid ${color}`,
              borderRadius: 6, padding: '14px 16px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* 3-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {/* Buses by Model */}
          <div style={{ background: 'rgba(13,21,38,0.85)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' }}>
            <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Space Mono', monospace", marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Buses by Model
            </div>
            {modelEntries.slice(0, 8).map(([model, count]) => (
              <div key={model} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: "'Barlow Condensed', sans-serif" }}>{model}</span>
                  <span style={{ fontSize: 10, color: modelColor(model), fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{count}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(count / maxModel) * 100}%`, background: modelColor(model), borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Buses by Line */}
          <div style={{ background: 'rgba(13,21,38,0.85)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' }}>
            <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Space Mono', monospace", marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Buses by Line
            </div>
            {lineDistribution.slice(0, 8).map(line => (
              <div key={line.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: "'Barlow Condensed', sans-serif" }}>{line.label}</span>
                  <span style={{ fontSize: 10, color: lineColors[line.id] || '#64748b', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{line.count}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(line.count / maxLine) * 100}%`, background: lineColors[line.id] || '#64748b', borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Performance highlights */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {perfItems.map(({ title, item, accent }) => (
              <div key={title} style={{
                flex: 1,
                background: `rgba(${accent === '#10b981' ? '16,185,129' : '220,38,38'},0.06)`,
                border: `1px solid ${accent}33`,
                borderRadius: 7, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 9, color: accent, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>{title}</div>
                {item
                  ? <>
                      <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 700, lineHeight: 1.3 }}>
                        {item.name || item.label || '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#475569', fontFamily: "'Space Mono', monospace", marginTop: 3 }}>
                        {item.hours ? `avg ${item.hours.toFixed(1)}h` : ''}
                        {item.variancePct != null ? ` · ${item.variancePct > 0 ? '+' : ''}${item.variancePct}% vs est.` : ''}
                      </div>
                    </>
                  : <div style={{ fontSize: 10, color: '#334155', fontFamily: "'Space Mono', monospace" }}>Not enough data</div>
                }
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(7,9,15,0.95)',
        padding: '8px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 9, color: '#1e2d40', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em' }}>
          KIIRA MOTORS CORPORATION
        </span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {[['#10b981','ON TRACK'], ['#f59e0b','SLOW (>24h)'], ['#dc2626','DELAYED (>48h)'], ['#dc2626','KDC'], ['#38bdf8','EVS']].map(([c, l]) => (
            <span key={l} style={{ fontSize: 9, color: c, fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em' }}>● {l}</span>
          ))}
        </div>
        <span style={{ fontSize: 9, color: '#1e2d40', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em' }}>
          {now}
        </span>
      </div>
    </div>
  );
}

// ── Excel ─────────────────────────────────────────────────────
function buildWorkbook(buses, rows, metrics) {
  const wb    = XLSX.utils.book_new();
  const stamp = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const ws1 = XLSX.utils.aoa_to_sheet([
    ['KMC Bus Production Tracker — Dashboard Export'], [`Generated: ${stamp}`], [],
    ['Metric', 'Value'],
    ['Total buses on floor', metrics.total],
    ['KDC units', metrics.kdcCount],
    ['EVS units', metrics.evsCount],
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
  for (const row of rows) { if (!byVin[row.vin]) byVin[row.vin] = []; byVin[row.vin].push(row); }
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

  const ws5 = XLSX.utils.json_to_sheet(rows.map(r => ({
    VIN: r.vin, Model: r.model || '—', 'Station Code': r.stationCode,
    'Station Name': STATIONS[r.stationCode]?.name || '—',
    Line: STATIONS[r.stationCode] ? LINES.find(l => l.id === STATIONS[r.stationCode].line)?.label || '—' : '—',
    Timestamp: r.rawTimestamp || '—',
  })));
  ws5['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 42 }, { wch: 30 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Full History');

  return wb;
}



// ── buildSlidePDF (unchanged from v6) ─────────────────────────
async function buildSlidePDF(buses, rows, metrics, logoBase64) {
  const W = 297, H = 210;
  const M = 12;

  const BG      = [7,   9,   15 ];
  const BG2     = [13,  21,  38 ];
  const RED     = [220, 38,  38 ];
  const RED_DIM = [127, 29,  29 ];
  const GREEN   = [16,  185, 129];
  const AMBER   = [245, 158, 11 ];
  const BLUE    = [56,  189, 248];
  const WHITE   = [255, 255, 255];
  const LIGHT   = [241, 245, 249];
  const MID     = [148, 163, 184];
  const DIM     = [71,  85,  105];
  const VDIM    = [51,  65,  85 ];
  const KDC_C   = [220, 38,  38 ];
  const EVS_C   = [56,  189, 248];

  const stamp = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const byVin = {};
  for (const row of rows) {
    if (!byVin[row.vin]) byVin[row.vin] = [];
    byVin[row.vin].push(row);
  }
  const nowMs = Date.now();
  const busRows = buses.map(bus => {
    const history  = (byVin[bus.vin] || []).filter(r => r.rawTimestamp)
      .sort((a, b) => new Date(a.rawTimestamp) - new Date(b.rawTimestamp));
    const firstTs  = history[0]                  ? new Date(history[0].rawTimestamp).getTime() : null;
    const latestTs = history[history.length - 1] ? new Date(history[history.length - 1].rawTimestamp).getTime() : null;
    const totalMs  = firstTs  ? nowMs - firstTs  : null;
    const curMs    = latestTs ? nowMs - latestTs : null;
    const visited  = new Set(history.map(r => r.stationCode)).size;
    const lineId   = bus.station?.line;
    const lineTot  = lineId ? Object.values(STATIONS).filter(s => s.line === lineId).length : 0;
    const progress = lineTot > 0 ? Math.min(Math.round((visited / lineTot) * 100), 100) : 0;
    const status   = getStatus(curMs);
    return {
      vin: bus.vin, model: bus.model || '—',
      lineName: LINES.find(l => l.id === lineId)?.label || lineId || '—',
      stationName: bus.station?.name || bus.stationCode || '—',
      stationCode: bus.stationCode || '—',
      atStation: fmt(curMs), totalTime: fmt(totalMs),
      firstEntry: fmtDate(firstTs), progress, status,
      _latestTs: latestTs || 0,
    };
  }).sort((a, b) => b._latestTs - a._latestTs);

  const HDR_H   = 22;
  const FTR_H   = 10;
  const FTR_Y   = H - FTR_H;
  const BODY_Y  = HDR_H + 2;

  const TH_H    = 8;
  const ROW_H   = 9.5;
  const STRIP_H = 8;
  const TABLE_START_Y = BODY_Y + STRIP_H + TH_H;
  const ROW_AREA_H    = FTR_Y - TABLE_START_Y - 2;
  const BUSES_PER_PAGE = Math.max(1, Math.floor(ROW_AREA_H / ROW_H));

  const chunks = [];
  for (let i = 0; i < busRows.length; i += BUSES_PER_PAGE) {
    chunks.push(busRows.slice(i, i + BUSES_PER_PAGE));
  }
  const totalSlides = 1 + chunks.length;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  function resetPage() {
    doc.setFillColor(...BG);
    doc.rect(0, 0, W, H, 'F');
  }

  function drawHeader(slideNum) {
    doc.setFillColor(...RED);
    doc.rect(0, 0, W, 3, 'F');
    doc.setFillColor(10, 16, 28);
    doc.rect(0, 3, W, HDR_H - 3, 'F');
    doc.setDrawColor(...RED_DIM);
    doc.setLineWidth(0.3);
    doc.line(M, HDR_H, W - M, HDR_H);
    if (logoBase64) {
      try { doc.addImage(logoBase64, 'PNG', M, 5, 22, 0); } catch {}
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text('KMC BUS PRODUCTION REPORT', M + (logoBase64 ? 26 : 0), 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...DIM);
    doc.text(`${stamp}  ·  KIIRA MOTORS CORPORATION — CONFIDENTIAL`, M + (logoBase64 ? 26 : 0), 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DIM);
    doc.text(`SLIDE ${slideNum} / ${totalSlides}`, W - M, 13, { align: 'right' });
  }

  function drawFooter() {
    doc.setFillColor(10, 16, 28);
    doc.rect(0, FTR_Y, W, FTR_H, 'F');
    doc.setDrawColor(...RED_DIM);
    doc.setLineWidth(0.2);
    doc.line(0, FTR_Y, W, FTR_Y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...VDIM);
    doc.text('KIIRA MOTORS CORPORATION', M, FTR_Y + 3.5);
    const legends = [
      { color: GREEN, label: 'ON TRACK' },
      { color: AMBER, label: 'SLOW (>24h)' },
      { color: RED,   label: 'DELAYED (>48h)' },
      { color: KDC_C, label: 'KDC' },
      { color: EVS_C, label: 'EVS' },
    ];
    let lx = W / 2 - 44;
    doc.setFontSize(7);
    legends.forEach(({ color, label }) => {
      doc.setFillColor(...color);
      doc.circle(lx, FTR_Y + 3.2, 1, 'F');
      doc.setTextColor(...MID);
      doc.text(label, lx + 2.5, FTR_Y + 4);
      lx += doc.getTextWidth(label) + 7;
    });
    doc.setTextColor(...VDIM);
    doc.text(stamp, W - M, FTR_Y + 3.5, { align: 'right' });
  }

  function darkCard(x, y, w, h, accentColor) {
    doc.setFillColor(...BG2);
    doc.setDrawColor(...(accentColor || [30, 45, 64]));
    doc.setLineWidth(accentColor ? 0.4 : 0.2);
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');
  }

  function drawBar(x, y, w, h, pct, color) {
    doc.setFillColor(30, 45, 64);
    doc.roundedRect(x, y, w, h, 0.8, 0.8, 'F');
    const fw = Math.max(0, Math.min(pct, 1)) * w;
    if (fw > 0.5) {
      doc.setFillColor(...color);
      doc.roundedRect(x, y, fw, h, 0.8, 0.8, 'F');
    }
  }

  // Cover slide
  resetPage();
  drawHeader(1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...DIM);
  doc.text('DASHBOARD SUMMARY  ·  COVER SLIDE', W / 2, BODY_Y + 5, { align: 'center' });

  const delayed    = busRows.filter(b => b.status === 'Delayed').length;
  const prodRate   = metrics.prodRate || 0;

  const KPI_Y = BODY_Y + 8;
  const KPI_H = 24;
  const KPI_GAP = 3;
  const CW = W - M * 2;
  const kpis = [
    { label: 'Total on Floor',    val: String(metrics.total    || 0), color: MID   },
    { label: 'KDC Units',         val: String(metrics.kdcCount || 0), color: KDC_C },
    { label: 'EVS Units',         val: String(metrics.evsCount || 0), color: EVS_C },
    { label: 'Delayed',           val: String(delayed),               color: RED   },
    { label: 'Prod Rate (7-day)', val: `${prodRate}/d`,               color: GREEN },
  ];
  const kpiW = (CW - KPI_GAP * (kpis.length - 1)) / kpis.length;

  kpis.forEach(({ label, val, color }, i) => {
    const kx = M + i * (kpiW + KPI_GAP);
    doc.setFillColor(...BG2);
    doc.setDrawColor(color[0] * 0.4, color[1] * 0.4, color[2] * 0.4);
    doc.setLineWidth(0.4);
    doc.roundedRect(kx, KPI_Y, kpiW, KPI_H, 1.5, 1.5, 'FD');
    doc.setFillColor(...color);
    doc.roundedRect(kx, KPI_Y, kpiW, 2.5, 1.5, 1.5, 'F');
    doc.rect(kx, KPI_Y + 1, kpiW, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...DIM);
    doc.text(label.toUpperCase(), kx + kpiW / 2, KPI_Y + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...color);
    doc.text(val, kx + kpiW / 2, KPI_Y + 21, { align: 'center' });
  });

  const SEC_Y  = KPI_Y + KPI_H + 3;
  const SEC_H  = FTR_Y - SEC_Y - 2;
  const CGAP   = 3;
  const COL1_W = CW * 0.30;
  const COL2_W = CW * 0.30;
  const COL3_W = CW - COL1_W - COL2_W - CGAP * 2;
  const COL1_X = M;
  const COL2_X = COL1_X + COL1_W + CGAP;
  const COL3_X = COL2_X + COL2_W + CGAP;

  darkCard(COL1_X, SEC_Y, COL1_W, SEC_H);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.text('BUSES BY MODEL', COL1_X + 4, SEC_Y + 7);
  doc.setDrawColor(30, 45, 64);
  doc.setLineWidth(0.2);
  doc.line(COL1_X + 3, SEC_Y + 9, COL1_X + COL1_W - 3, SEC_Y + 9);

  const modelEntries = Object.entries(metrics.byModel || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxModel = Math.max(...modelEntries.map(e => e[1]), 1);
  const mRowH = Math.min((SEC_H - 12) / Math.max(modelEntries.length, 1), 13);

  modelEntries.forEach(([model, count], i) => {
    const ry = SEC_Y + 11 + i * mRowH;
    const col = isKDC(model) ? KDC_C : isEVS(model) ? EVS_C : MID;
    if (i % 2 === 0) {
      doc.setFillColor(18, 28, 48);
      doc.rect(COL1_X + 2, ry, COL1_W - 4, mRowH - 0.5, 'F');
    }
    doc.setFillColor(...col);
    doc.circle(COL1_X + 6, ry + mRowH / 2, 1.3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...LIGHT);
    const shortModel = model.length > 16 ? model.slice(0, 15) + '…' : model;
    doc.text(shortModel, COL1_X + 10, ry + mRowH / 2 + 1.5);
    const barX = COL1_X + 10;
    const barY = ry + mRowH / 2 + 3.5;
    const barW = COL1_W - 18;
    drawBar(barX, barY, barW, 2.5, count / maxModel, col);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...col);
    doc.text(String(count), COL1_X + COL1_W - 4, ry + mRowH / 2 + 2, { align: 'right' });
  });

  darkCard(COL2_X, SEC_Y, COL2_W, SEC_H);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.text('BUSES BY LINE', COL2_X + 4, SEC_Y + 7);
  doc.setDrawColor(30, 45, 64);
  doc.setLineWidth(0.2);
  doc.line(COL2_X + 3, SEC_Y + 9, COL2_X + COL2_W - 3, SEC_Y + 9);

  const lineColorMap = {
    MACHINE: [100,116,139], BODY: [139,92,246], BODY_KDC: [124,58,237],
    FRAME: [249,115,22], CHASSIS1: [16,185,129], CHASSIS2: [5,150,105],
    ELECTRO: [6,182,212], PAINT: [236,72,153], TRIM: [59,130,246], QA: [220,38,38],
  };
  const lineDist = LINES
    .map(l => ({ ...l, count: metrics.busesByLine?.[l.id] || 0 }))
    .filter(l => l.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const maxLine = Math.max(...lineDist.map(l => l.count), 1);
  const lRowH = Math.min((SEC_H - 12) / Math.max(lineDist.length, 1), 13);

  lineDist.forEach((line, i) => {
    const ry = SEC_Y + 11 + i * lRowH;
    const col = lineColorMap[line.id] || MID;
    if (i % 2 === 0) {
      doc.setFillColor(18, 28, 48);
      doc.rect(COL2_X + 2, ry, COL2_W - 4, lRowH - 0.5, 'F');
    }
    doc.setFillColor(...col);
    doc.circle(COL2_X + 6, ry + lRowH / 2, 1.3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...LIGHT);
    const shortLabel = line.label.length > 20 ? line.label.slice(0, 19) + '…' : line.label;
    doc.text(shortLabel, COL2_X + 10, ry + lRowH / 2 + 1.5);
    const barX = COL2_X + 10;
    const barY = ry + lRowH / 2 + 3.5;
    const barW = COL2_W - 18;
    drawBar(barX, barY, barW, 2.5, line.count / maxLine, col);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...col);
    doc.text(String(line.count), COL2_X + COL2_W - 4, ry + lRowH / 2 + 2, { align: 'right' });
  });

  const perfItems = [
    { title: '↑ BEST STATION',    item: metrics.bestStation,  good: true  },
    { title: '↓ SLOWEST STATION', item: metrics.worstStation, good: false },
    { title: '↑ BEST LINE',       item: metrics.bestLine,     good: true  },
    { title: '↓ SLOWEST LINE',    item: metrics.worstLine,    good: false },
  ];
  const perfH = (SEC_H - CGAP * 3) / 4;

  perfItems.forEach(({ title, item, good }, i) => {
    const py = SEC_Y + i * (perfH + CGAP);
    const accent = good ? GREEN : RED;
    const bgR = good ? [10, 30, 20] : [28, 10, 10];
    doc.setFillColor(...bgR);
    doc.setDrawColor(accent[0] * 0.35, accent[1] * 0.35, accent[2] * 0.35);
    doc.setLineWidth(0.35);
    doc.roundedRect(COL3_X, py, COL3_W, perfH, 1.5, 1.5, 'FD');
    doc.setFillColor(...accent);
    doc.roundedRect(COL3_X, py, COL3_W, 2, 1.5, 1.5, 'F');
    doc.rect(COL3_X, py + 0.8, COL3_W, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...accent);
    doc.text(title, COL3_X + 4, py + 8);
    if (item) {
      const name = item.name || item.label || '—';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      const lines = doc.splitTextToSize(name, COL3_W - 8);
      doc.text(lines.slice(0, 2), COL3_X + 4, py + 14, { lineHeightFactor: 1.25 });
      if (item.hours) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...DIM);
        const vp = item.variancePct != null
          ? `  ·  ${item.variancePct > 0 ? '+' : ''}${item.variancePct}% vs est.` : '';
        doc.text(`avg ${item.hours.toFixed(1)}h dwell${vp}`, COL3_X + 4, py + perfH - 3);
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...VDIM);
      doc.text('Not enough data yet', COL3_X + 4, py + 14);
    }
  });

  drawFooter();

  // Table slides
  const TABLE_COLS = [
    { label: 'VIN',              pct: 0.16 },
    { label: 'Model',            pct: 0.07 },
    { label: 'Line',             pct: 0.11 },
    { label: 'Current Station',  pct: 0.17 },
    { label: 'Code',             pct: 0.06 },
    { label: 'At Station',       pct: 0.08 },
    { label: 'On Floor',         pct: 0.08 },
    { label: 'First Entry',      pct: 0.09 },
    { label: 'Progress',         pct: 0.09 },
    { label: 'Status',           pct: 0.09 },
  ];

  const colXs = [];
  let cx = M + 4;
  TABLE_COLS.forEach(c => { colXs.push(cx); cx += CW * c.pct; });

  chunks.forEach((chunk, pageIdx) => {
    doc.addPage([W, H], 'landscape');
    resetPage();
    drawHeader(pageIdx + 2);

    const stripY = BODY_Y + 1;
    doc.setFillColor(13, 21, 38);
    doc.rect(M, stripY, CW, STRIP_H, 'F');
    doc.setDrawColor(30, 45, 64);
    doc.setLineWidth(0.2);
    doc.line(M, stripY + STRIP_H, M + CW, stripY + STRIP_H);

    const pageOnTrack = chunk.filter(b => b.status === 'On Track').length;
    const pageSlow    = chunk.filter(b => b.status === 'Slow').length;
    const pageDelayed = chunk.filter(b => b.status === 'Delayed').length;

    const summaryItems = [
      { label: 'BUS REPORT', val: null,                         color: MID   },
      { label: 'FLOOR',      val: String(metrics.total || '—'), color: MID   },
      { label: 'ON TRACK',   val: String(pageOnTrack),          color: GREEN },
      { label: 'SLOW',       val: String(pageSlow),             color: AMBER },
      { label: 'DELAYED',    val: String(pageDelayed),          color: RED   },
    ];

    let sx = M + 3;
    doc.setFontSize(7.5);
    summaryItems.forEach(({ label, val, color }, si) => {
      if (si === 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...WHITE);
        doc.text(label, sx, stripY + 5.5);
        sx += doc.getTextWidth(label) + 5;
        doc.setDrawColor(30, 45, 64);
        doc.setLineWidth(0.2);
        doc.line(sx - 1.5, stripY + 1, sx - 1.5, stripY + STRIP_H - 1);
        sx += 2;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DIM);
        doc.text(label, sx, stripY + 5.5);
        sx += doc.getTextWidth(label) + 1.5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...color);
        doc.text(val, sx, stripY + 5.5);
        sx += doc.getTextWidth(val) + 5;
        if (si < summaryItems.length - 1) {
          doc.setDrawColor(30, 45, 64);
          doc.setLineWidth(0.15);
          doc.line(sx - 2, stripY + 1, sx - 2, stripY + STRIP_H - 1);
        }
      }
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...VDIM);
    const r0 = pageIdx * BUSES_PER_PAGE + 1;
    const r1 = r0 + chunk.length - 1;
    doc.text(`ROWS ${r0}–${r1}  ·  SORTED MOST RECENT FIRST`, W - M, stripY + 5.5, { align: 'right' });

    const thY = stripY + STRIP_H;
    doc.setFillColor(35, 12, 12);
    doc.rect(M, thY, CW, TH_H, 'F');
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.4);
    doc.line(M, thY + TH_H, M + CW, thY + TH_H);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MID);
    TABLE_COLS.forEach((col, i) => {
      doc.text(col.label.toUpperCase(), colXs[i], thY + TH_H - 2);
    });

    let rowY = thY + TH_H;
    chunk.forEach((bus, ri) => {
      const mColor = isKDC(bus.model) ? KDC_C : isEVS(bus.model) ? EVS_C : MID;
      const sColor = bus.status === 'Delayed' ? RED : bus.status === 'Slow' ? AMBER : GREEN;
      const isEven = ri % 2 === 0;
      doc.setFillColor(...(isEven ? [13, 21, 38] : [10, 16, 28]));
      doc.rect(M, rowY, CW, ROW_H, 'F');
      doc.setFillColor(...mColor);
      doc.rect(M, rowY, 2.5, ROW_H, 'F');
      doc.setDrawColor(20, 32, 52);
      doc.setLineWidth(0.15);
      doc.line(M, rowY + ROW_H, M + CW, rowY + ROW_H);

      const textY = rowY + ROW_H / 2 + 2.5;
      const cells = [
        { text: bus.vin,          bold: true,  color: LIGHT,  fs: 6.5 },
        { text: bus.model,        bold: true,  color: mColor, fs: 7.5 },
        { text: bus.lineName,     bold: false, color: MID,    fs: 7   },
        { text: bus.stationName,  bold: false, color: LIGHT,  fs: 7.5 },
        { text: bus.stationCode,  bold: false, color: DIM,    fs: 7   },
        { text: bus.atStation,    bold: true,  color: sColor, fs: 8.5 },
        { text: bus.totalTime,    bold: false, color: MID,    fs: 7.5 },
        { text: bus.firstEntry,   bold: false, color: DIM,    fs: 6.5 },
        { text: `${bus.progress}%`, bold: false, color: MID,  fs: 7.5 },
        { text: bus.status,       bold: true,  color: sColor, fs: 7.5 },
      ];
      cells.forEach((cell, i) => {
        const maxW = CW * TABLE_COLS[i].pct - 2;
        doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
        doc.setFontSize(cell.fs);
        doc.setTextColor(...cell.color);
        const txt = doc.splitTextToSize(String(cell.text), maxW)[0] || '';
        doc.text(txt, colXs[i], textY);
      });

      const statusX = colXs[9];
      const statusW = CW * TABLE_COLS[9].pct - 2;
      const pillBg  = bus.status === 'Delayed' ? [50, 10, 10]
                    : bus.status === 'Slow'    ? [50, 35, 5]
                    :                            [5,  35, 22];
      doc.setFillColor(...pillBg);
      doc.roundedRect(statusX - 1, rowY + 1.5, statusW, ROW_H - 3, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...sColor);
      doc.text(bus.status, statusX + statusW / 2 - 1, textY, { align: 'center' });

      rowY += ROW_H;
    });

    drawFooter();
  });

  return doc;
}

// ── Legacy PDF (white branded) ────────────────────────────────
async function buildPDF(buses, rows, metrics, logoBase64) {
  const RED        = [220, 38,  38 ];
  const GREEN      = [16,  185, 129];
  const AMBER      = [245, 158, 11 ];
  const BLUE       = [6,   182, 212];
  const BLACK      = [0,   0,   0  ];
  const DARKGRAY   = [0,   0,   0  ];
  const LIGHTGRAY  = [180, 180, 180];
  const XLIGHT     = [241, 245, 249];
  const WHITE      = [255, 255, 255];
  const KDC_C      = [220, 38,  38 ];
  const EVS_C      = [6,   182, 212];
  const SLATE      = [40,  40,  40 ];
  const MID        = [148, 163, 184];
  const DIM        = [71,  85,  105];

  const W = 297, H = 210;
  const M = 10;
  const CW = W - M * 2;
  const HDR_H    = 18;
  const STRIP_H  = 3;
  const FTR_Y    = H - 9;
  const FTR_H    = 9;
  const BODY_Y   = HDR_H + 2;

  const stamp = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const byVin = {};
  for (const row of rows) {
    if (!byVin[row.vin]) byVin[row.vin] = [];
    byVin[row.vin].push(row);
  }
  const nowMs = Date.now();
  const busRows = buses.map(bus => {
    const history  = (byVin[bus.vin] || []).filter(r => r.rawTimestamp)
      .sort((a, b) => new Date(a.rawTimestamp) - new Date(b.rawTimestamp));
    const firstTs  = history[0]                  ? new Date(history[0].rawTimestamp).getTime()                  : null;
    const latestTs = history[history.length - 1] ? new Date(history[history.length - 1].rawTimestamp).getTime() : null;
    const totalMs  = firstTs  ? nowMs - firstTs  : null;
    const curMs    = latestTs ? nowMs - latestTs : null;
    const visited  = new Set(history.map(r => r.stationCode)).size;
    const lineId   = bus.station?.line;
    const lineTot  = lineId ? Object.values(STATIONS).filter(s => s.line === lineId).length : 0;
    const progress = lineTot > 0 ? Math.min(Math.round((visited / lineTot) * 100), 100) : 0;
    const status   = getStatus(curMs);
    return {
      vin: bus.vin, model: bus.model || '—',
      lineName: LINES.find(l => l.id === lineId)?.label || lineId || '—',
      stationName: (bus.station?.name || bus.stationCode || '—'),
      stationCode: bus.stationCode || '—',
      atStation: fmt(curMs), totalTime: fmt(totalMs),
      firstEntry: fmtDate(firstTs), progress, status, _latestTs: latestTs || 0,
    };
  }).sort((a, b) => b._latestTs - a._latestTs);

  const delayed = busRows.filter(b => b.status === 'Delayed').length;

  const TABLE_STRIP_H = 7;
  const TH_H          = 7;
  const ROW_H         = 10;
  const TABLE_BODY_Y  = BODY_Y + TABLE_STRIP_H + TH_H;
  const ROW_AREA_H    = FTR_Y - TABLE_BODY_Y - 2;
  const BUSES_PER_PAGE = Math.floor(ROW_AREA_H / ROW_H);
  const totalPages = 1 + Math.ceil(busRows.length / BUSES_PER_PAGE);

  function resetPage(doc) {
    doc.setFillColor(...WHITE);
    doc.rect(0, 0, W, H, 'F');
  }

  function drawHeader(doc, pageNum) {
    doc.setFillColor(...RED);
    doc.rect(0, 0, W, STRIP_H, 'F');
    doc.setFillColor(248, 250, 252);
    doc.rect(0, STRIP_H, W, HDR_H - STRIP_H, 'F');
    const logoW = 28, logoX = M, logoY = STRIP_H + 1.5;
    if (logoBase64) { try { doc.addImage(logoBase64, 'PNG', logoX, logoY, logoW, 0); } catch {} }
    const titleX = M + (logoBase64 ? 31 : 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...BLACK);
    doc.text('KMC BUS PRODUCTION REPORT', titleX, STRIP_H + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
    doc.text(`${stamp}  ·  KIIRA MOTORS CORPORATION — CONFIDENTIAL`, titleX, STRIP_H + 14.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BLACK);
    doc.text(`PAGE ${pageNum} / ${totalPages}`, W - M, STRIP_H + 10, { align: 'right' });
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.25);
    doc.line(M, HDR_H, W - M, HDR_H);
  }

  function drawFooter(doc) {
    doc.setFillColor(...XLIGHT);
    doc.rect(0, FTR_Y, W, FTR_H, 'F');
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.2);
    doc.line(0, FTR_Y, W, FTR_Y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...BLACK);
    doc.text('KIIRA MOTORS CORPORATION', M, FTR_Y + 3.5);
    const legends = [
      { dot: GREEN, label: 'ON TRACK' }, { dot: AMBER, label: 'SLOW (>24h)' },
      { dot: RED, label: 'DELAYED (>48h)' }, { dot: KDC_C, label: 'KDC' }, { dot: EVS_C, label: 'EVS' },
    ];
    let lx = W / 2 - 40;
    legends.forEach(({ dot, label }) => {
      doc.setFillColor(...dot); doc.circle(lx, FTR_Y + 3, 1, 'F');
      doc.setTextColor(...BLACK); doc.text(label, lx + 2.5, FTR_Y + 3.8);
      lx += doc.getTextWidth(label) + 7;
    });
    doc.setTextColor(...BLACK);
    doc.text(stamp, W - M, FTR_Y + 3.5, { align: 'right' });
  }

  function card(doc, x, y, w, h, accentColor) {
    doc.setFillColor(...WHITE); doc.setDrawColor(...(accentColor || LIGHTGRAY));
    doc.setLineWidth(accentColor ? 0.5 : 0.25);
    doc.roundedRect(x, y, w, h, 1, 1, 'FD');
  }

  function drawBarChart(doc, x, y, w, h, entries, maxVal, title) {
    card(doc, x, y, w, h);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...BLACK);
    doc.text(title.toUpperCase(), x + 4, y + 7);
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.2);
    doc.line(x + 3, y + 8.5, x + w - 3, y + 8.5);
    if (!entries.length) return;
    const areaY = y + 10.5, areaH = h - 12;
    const rowH = Math.min(areaH / entries.length, 13);
    const barMaxW = w - 22;
    entries.forEach(([label, val, color], i) => {
      const ry = areaY + i * rowH;
      if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(x + 2, ry, w - 4, rowH - 0.5, 'F'); }
      doc.setFillColor(...color); doc.circle(x + 5.5, ry + rowH / 2, 1.5, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
      const sl = label.length > 20 ? label.slice(0, 19) + '…' : label;
      doc.text(sl, x + 9, ry + rowH / 2 + 1.5);
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(x + 9, ry + rowH / 2 + 3.5, barMaxW, 3, 0.8, 0.8, 'F');
      const bw = (val / maxVal) * barMaxW;
      if (bw > 0) { doc.setFillColor(...color); doc.roundedRect(x + 9, ry + rowH / 2 + 3.5, bw, 3, 0.8, 0.8, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...color);
      doc.text(String(val), x + w - 3, ry + rowH / 2 + 2, { align: 'right' });
    });
  }

  function drawPerfCard(doc, x, y, w, h, label, item, good) {
    const accent = good ? GREEN : RED;
    const bgAlpha = good ? [232, 250, 242] : [254, 242, 242];
    doc.setFillColor(...bgAlpha); doc.setDrawColor(...accent); doc.setLineWidth(0.4);
    doc.roundedRect(x, y, w, h, 1, 1, 'FD');
    doc.setFillColor(...accent); doc.roundedRect(x, y, w, 3, 1, 1, 'F');
    doc.rect(x, y + 1.5, w, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...accent);
    doc.text(label.toUpperCase(), x + 4, y + 10);
    if (item) {
      const name = item.name || item.label || '—';
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...BLACK);
      const nameLines = doc.splitTextToSize(name, w - 8);
      doc.text(nameLines.slice(0, 2), x + 4, y + 17, { lineHeightFactor: 1.3 });
      const nameBlockH = nameLines.slice(0, 2).length * 9.5 * 0.352 * 1.3;
      if (item.hours) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...BLACK);
        const vp = item.variancePct != null ? `  ·  ${item.variancePct > 0 ? '+' : ''}${item.variancePct}% vs est.` : '';
        doc.text(`avg ${item.hours.toFixed(1)}h dwell${vp}`, x + 4, y + 17 + nameBlockH + 2);
      }
    } else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
      doc.text('Not enough data yet', x + 4, y + 16);
    }
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  resetPage(doc); drawHeader(doc, 1);

  const KPI_Y = BODY_Y + 2, KPI_H = 26, KPI_GAP = 3;
  const kpis2 = [
    { label: 'Total on Floor',    val: String(metrics.total    || 0),  color: SLATE },
    { label: 'KDC Units',         val: String(metrics.kdcCount || 0),  color: KDC_C },
    { label: 'EVS Units',         val: String(metrics.evsCount || 0),  color: EVS_C },
    { label: 'Delayed',           val: String(delayed),                color: RED   },
    { label: 'Prod Rate (7-day)', val: `${metrics.prodRate || 0}/day`, color: GREEN },
  ];
  const kpiW = (CW - KPI_GAP * (kpis2.length - 1)) / kpis2.length;
  kpis2.forEach(({ label, val, color }, i) => {
    const kx = M + i * (kpiW + KPI_GAP);
    doc.setFillColor(...WHITE); doc.setDrawColor(...color); doc.setLineWidth(0.5);
    doc.roundedRect(kx, KPI_Y, kpiW, KPI_H, 1.5, 1.5, 'FD');
    doc.setFillColor(...color); doc.roundedRect(kx, KPI_Y, kpiW, 3, 1.5, 1.5, 'F');
    doc.rect(kx, KPI_Y + 1, kpiW, 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
    doc.text(label.toUpperCase(), kx + kpiW / 2, KPI_Y + 11, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...color);
    doc.text(val, kx + kpiW / 2, KPI_Y + 23, { align: 'center' });
  });

  const SEC_Y = KPI_Y + KPI_H + 3, SEC_H = FTR_Y - SEC_Y - 2, COL_GAP = 3;
  const COL1_W = CW * 0.29, COL2_W = CW * 0.29, COL3_W = CW - COL1_W - COL2_W - COL_GAP * 2;
  const COL1_X = M, COL2_X = COL1_X + COL1_W + COL_GAP, COL3_X = COL2_X + COL2_W + COL_GAP;

  const modelEntries2 = Object.entries(metrics.byModel || {}).sort((a, b) => b[1] - a[1]);
  const maxModel2 = Math.max(...modelEntries2.map(e => e[1]), 1);
  const modelData = modelEntries2.slice(0, 8).map(([m, c]) => [m, c, isKDC(m) ? KDC_C : isEVS(m) ? EVS_C : SLATE]);
  drawBarChart(doc, COL1_X, SEC_Y, COL1_W, SEC_H, modelData, maxModel2, 'Buses by Model');

  const lcm = { MACHINE: SLATE, BODY: [139,92,246], BODY_KDC: [124,58,237], FRAME: [249,115,22], CHASSIS1: GREEN, CHASSIS2: [5,150,105], ELECTRO: BLUE, PAINT: [236,72,153], TRIM: [59,130,246], QA: RED };
  const lineDistData = LINES.map(l => [l.label, metrics.busesByLine?.[l.id] || 0, lcm[l.id] || SLATE]).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxLine2 = Math.max(...lineDistData.map(e => e[1]), 1);
  drawBarChart(doc, COL2_X, SEC_Y, COL2_W, SEC_H, lineDistData, maxLine2, 'Buses by Line');

  const perfItems2 = [
    { label: '↑ Best Station',    item: metrics.bestStation,  good: true },
    { label: '↓ Slowest Station', item: metrics.worstStation, good: false },
    { label: '↑ Best Line',       item: metrics.bestLine,     good: true },
    { label: '↓ Slowest Line',    item: metrics.worstLine,    good: false },
  ];
  const perfH2 = (SEC_H - COL_GAP * 3) / 4;
  perfItems2.forEach(({ label, item, good }, i) => drawPerfCard(doc, COL3_X, SEC_Y + i * (perfH2 + COL_GAP), COL3_W, perfH2, label, item, good));

  drawFooter(doc);

  const TABLE_COLS_PDF = [
    { label: 'VIN',       pct: 0.18 }, { label: 'Model',      pct: 0.07 }, { label: 'Line',         pct: 0.10 },
    { label: 'Station',   pct: 0.16 }, { label: 'Code',       pct: 0.06 }, { label: 'At Station',   pct: 0.07 },
    { label: 'On Floor',  pct: 0.09 }, { label: 'First Entry',pct: 0.10 }, { label: 'Progress',     pct: 0.09 },
    { label: 'Status',    pct: 0.08 },
  ];
  const colXs2 = [];
  let cx2 = M + 4;
  TABLE_COLS_PDF.forEach(c => { colXs2.push(cx2); cx2 += CW * c.pct; });

  const wChunks = [];
  for (let i = 0; i < busRows.length; i += BUSES_PER_PAGE) wChunks.push(busRows.slice(i, i + BUSES_PER_PAGE));

  wChunks.forEach((chunk, pageIdx) => {
    doc.addPage([W, H], 'landscape');
    resetPage(doc); drawHeader(doc, pageIdx + 2);
    const stripY = BODY_Y + 1;
    doc.setFillColor(...XLIGHT); doc.rect(M, stripY, CW, TABLE_STRIP_H, 'F');
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.2);
    doc.line(M, stripY + TABLE_STRIP_H, M + CW, stripY + TABLE_STRIP_H);
    const pOT = chunk.filter(b => b.status === 'On Track').length;
    const pS  = chunk.filter(b => b.status === 'Slow').length;
    const pD  = chunk.filter(b => b.status === 'Delayed').length;
    const si2 = [
      { label: 'BUS REPORT', val: null, color: DARKGRAY },
      { label: 'FLOOR', val: String(metrics.total || '—'), color: SLATE },
      { label: 'ON TRACK', val: String(pOT), color: GREEN },
      { label: 'SLOW', val: String(pS), color: AMBER },
      { label: 'DELAYED', val: String(pD), color: RED },
    ];
    let sx2 = M + 3; doc.setFontSize(7.5);
    si2.forEach(({ label, val, color }, si) => {
      if (si === 0) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLACK); doc.text(label, sx2, stripY + 5);
        sx2 += doc.getTextWidth(label) + 4;
        doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.2);
        doc.line(sx2 - 1, stripY + 1, sx2 - 1, stripY + TABLE_STRIP_H - 1); sx2 += 2;
      } else {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...BLACK); doc.text(label, sx2, stripY + 5);
        sx2 += doc.getTextWidth(label) + 1.5;
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...color); doc.text(val, sx2, stripY + 5);
        sx2 += doc.getTextWidth(val) + 5;
        if (si < si2.length - 1) { doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.15); doc.line(sx2 - 2, stripY + 1, sx2 - 2, stripY + TABLE_STRIP_H - 1); }
      }
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...BLACK);
    const r02 = pageIdx * BUSES_PER_PAGE + 1, r12 = r02 + chunk.length - 1;
    doc.text(`ROWS ${r02}–${r12}  ·  SORTED MOST RECENT FIRST`, W - M, stripY + 5, { align: 'right' });

    const thY2 = stripY + TABLE_STRIP_H;
    doc.setFillColor(254, 242, 242); doc.rect(M, thY2, CW, TH_H, 'F');
    doc.setDrawColor(...RED); doc.setLineWidth(0.4);
    doc.line(M, thY2 + TH_H, M + CW, thY2 + TH_H);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
    TABLE_COLS_PDF.forEach((col, i) => doc.text(col.label.toUpperCase(), colXs2[i], thY2 + 5));

    let rowY2 = thY2 + TH_H;
    chunk.forEach((bus, ri) => {
      const mColor = isKDC(bus.model) ? KDC_C : isEVS(bus.model) ? EVS_C : SLATE;
      const sColor = bus.status === 'Delayed' ? RED : bus.status === 'Slow' ? AMBER : GREEN;
      doc.setFillColor(...(ri % 2 === 0 ? WHITE : XLIGHT));
      doc.rect(M, rowY2, CW, ROW_H, 'F');
      doc.setFillColor(...mColor); doc.rect(M, rowY2, 2, ROW_H, 'F');
      doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.15);
      doc.line(M, rowY2 + ROW_H, M + CW, rowY2 + ROW_H);
      const textY2 = rowY2 + ROW_H / 2 + 2.5;
      const cells2 = [
        { text: bus.vin,          bold: true,  color: BLACK,  fs: 6.5 },
        { text: bus.model,        bold: true,  color: mColor, fs: 7.5 },
        { text: bus.lineName,     bold: false, color: BLACK,  fs: 7.5 },
        { text: bus.stationName,  bold: false, color: BLACK,  fs: 7.5 },
        { text: bus.stationCode,  bold: false, color: BLACK,  fs: 7   },
        { text: bus.atStation,    bold: true,  color: sColor, fs: 8.5 },
        { text: bus.totalTime,    bold: false, color: BLACK,  fs: 7.5 },
        { text: bus.firstEntry,   bold: false, color: BLACK,  fs: 7   },
        { text: `${bus.progress}%`, bold: false, color: BLACK, fs: 7.5 },
        { text: bus.status,       bold: true,  color: sColor, fs: 7.5 },
      ];
      cells2.forEach((cell, i) => {
        const maxW = CW * TABLE_COLS_PDF[i].pct - 2;
        doc.setFont('helvetica', cell.bold ? 'bold' : 'normal'); doc.setFontSize(cell.fs); doc.setTextColor(...cell.color);
        doc.text(doc.splitTextToSize(String(cell.text), maxW)[0] || '', colXs2[i], textY2);
      });
      const sX = colXs2[9], sW = CW * TABLE_COLS_PDF[9].pct - 2;
      const pillBg = bus.status === 'Delayed' ? [254,226,226] : bus.status === 'Slow' ? [254,243,199] : [209,250,229];
      doc.setFillColor(...pillBg); doc.roundedRect(sX - 1, rowY2 + 2, sW, ROW_H - 4, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...sColor);
      doc.text(bus.status, sX + sW / 2 - 1, textY2, { align: 'center' });
      rowY2 += ROW_H;
    });
    drawFooter(doc);
  });

  return doc;
}

async function captureElement(el, landscape = false) {
  const canvas = await html2canvas(el, {
    backgroundColor: '#07090f', scale: 2,
    useCORS: true, logging: false,
    ...(landscape ? { windowWidth: el.scrollWidth, windowHeight: el.scrollHeight } : {}),
  });
  if (landscape && canvas.height > canvas.width) {
    const rotated = document.createElement('canvas');
    rotated.width  = canvas.height;
    rotated.height = canvas.width;
    const ctx = rotated.getContext('2d');
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return rotated;
  }
  return canvas;
}

async function captureAttachments(slideRef, dashboardRef) {
  const attachments = [];
  const date = new Date().toISOString().slice(0, 10);
  const slideEl = slideRef?.current;
  if (slideEl) {
    try {
      const canvas = await captureElement(slideEl, true);
      attachments.push({ filename: `KMC_Presentation_${date}.png`, dataUrl: canvas.toDataURL('image/png'), label: 'Presentation Slide' });
    } catch (e) { console.warn('Slide capture failed', e); }
  }
  const reportEl = dashboardRef?.current;
  if (reportEl) {
    try {
      const canvas = await captureElement(reportEl, true);
      attachments.push({ filename: `KMC_BusReport_${date}.png`, dataUrl: canvas.toDataURL('image/png'), label: 'Bus Report' });
    } catch (e) { console.warn('Report capture failed', e); }
  }
  return attachments;
}

async function postEmailRequest(payload) {
  const endpoint =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMAIL_ENDPOINT) ||
    (typeof process    !== 'undefined' && process.env?.REACT_APP_EMAIL_ENDPOINT)  ||
    null;
  if (!endpoint) {
    const dateRange = (payload.dataStartDate || payload.dataEndDate)
      ? `Data range: ${payload.dataStartDate || 'beginning'} → ${payload.dataEndDate || 'today'}\n`
      : '';
    const body = encodeURIComponent(
      `KMC Bus Production Report\n` +
      `Generated: ${new Date().toLocaleString('en-GB')}\n` +
      `Schedule: ${payload.schedule}\n` +
      (payload.scheduledTime ? `Time: ${payload.scheduledTime}\n` : '') +
      `Buses on floor: ${payload.busCount}\n` +
      dateRange +
      `\nAttachments generated programmatically:\n` +
      `  1. KMC_CoverSlide_[date].png  — Dashboard cover slide (dark theme)\n` +
      `  2. KMC_Presentation_[date].pdf — Dark slide-style PDF (cover + bus report pages)\n` +
      `  3. KMC_Dashboard_[date].pdf   — Branded white PDF report\n` +
      `\nNote: If your mail client did not receive the attachments automatically,\n` +
      `please use the Export buttons to download and attach them manually.`
    );
    window.open(
      `mailto:${encodeURIComponent(payload.to)}?subject=${encodeURIComponent(payload.subject)}&body=${body}`,
      '_blank'
    );
    return { ok: true, fallback: true };
  }
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

// ── localStorage schedule helpers ────────────────────────────
const SCHEDULES_KEY = 'kmc_email_schedules';

function loadSchedules() {
  try { return JSON.parse(localStorage.getItem(SCHEDULES_KEY) || '[]'); }
  catch { return []; }
}
function saveSchedules(list) {
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(list));
}

// ── Email Modal ───────────────────────────────────────────────
function EmailModal({ onClose, buses, rows, metrics, coverRef }) {
  const [to, setTo]                       = useState('');
  const [subject, setSubject]             = useState('KMC Bus Production Dashboard Report');
  const [schedule, setSchedule]           = useState('now');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [weekday, setWeekday]             = useState('MON');
  const [busy, setBusy]                   = useState(false);
  const [status, setStatus]               = useState(null);

  // ── Date range filter for email data ─────────────────────────
  const [emailStartDate, setEmailStartDate] = useState('');
  const [emailEndDate,   setEmailEndDate]   = useState('');

  // ── Saved schedules list ──────────────────────────────────────
  const [savedSchedules, setSavedSchedules] = useState(loadSchedules);

  function refreshSchedules() { setSavedSchedules(loadSchedules()); }

  function cancelSchedule(id) {
    const updated = loadSchedules().filter(s => s.id !== id);
    saveSchedules(updated);
    refreshSchedules();
  }

  function cancelAllSchedules() {
    saveSchedules([]);
    refreshSchedules();
  }

  // ── Filter rows by the email date range ───────────────────────
  function getFilteredRows() {
    if (!emailStartDate && !emailEndDate) return rows;
    const start = emailStartDate ? new Date(emailStartDate + 'T00:00:00').getTime() : null;
    const end   = emailEndDate   ? new Date(emailEndDate   + 'T23:59:59.999').getTime() : null;
    return rows.filter(r => {
      if (!r.rawTimestamp) return false;
      const t = new Date(r.rawTimestamp).getTime();
      if (isNaN(t)) return false;
      if (start !== null && t < start) return false;
      if (end   !== null && t > end)   return false;
      return true;
    });
  }

  async function handleSend() {
    if (!to.trim()) { setStatus({ ok: false, msg: 'Enter at least one recipient.' }); return; }
    setBusy(true); setStatus(null);
    try {
      const filteredRows = getFilteredRows();
      const date = new Date().toISOString().slice(0, 10);
      const attachments = [];

      // 1. Cover slide PNG from the hidden HiddenCoverSlide element
      const el = coverRef?.current;
      if (el) {
        try {
          el.style.left = '0';
          const canvas = await html2canvas(el, {
            backgroundColor: '#07090f', scale: 2,
            useCORS: true, logging: false,
            width: el.offsetWidth, height: el.offsetHeight,
          });
          el.style.left = '-9999px';
          attachments.push({
            filename: `KMC_CoverSlide_${date}.png`,
            dataUrl: canvas.toDataURL('image/png'),
            label: 'Dashboard Cover Slide (PNG)',
          });
        } catch (e) {
          console.warn('Cover PNG capture failed', e);
          if (el) el.style.left = '-9999px';
        }
      }

      // 2. Dark presentation-style slide PDF (matches "Slide PDF" export button)
      try {
        const logo2 = await fetchLogoBase64('/kmc logo 2.png');
        const slideDoc = await buildSlidePDF(buses, filteredRows, metrics, logo2);
        const slidePdfBytes = slideDoc.output('datauristring');
        attachments.push({
          filename: `KMC_Presentation_${date}.pdf`,
          dataUrl: slidePdfBytes,
          label: 'Presentation Slide PDF (dark)',
        });
      } catch (e) { console.warn('Slide PDF build failed', e); }

      // 3. Branded white PDF report (matches "PDF Report" export button)
      try {
        const logo1 = await fetchLogoBase64('/kmc logo.png');
        const reportDoc = await buildPDF(buses, filteredRows, metrics, logo1);
        const reportPdfBytes = reportDoc.output('datauristring');
        attachments.push({
          filename: `KMC_Dashboard_${date}.pdf`,
          dataUrl: reportPdfBytes,
          label: 'Dashboard PDF Report (white)',
        });
      } catch (e) { console.warn('Report PDF build failed', e); }

      const result = await postEmailRequest({
        to: to.trim(), subject: subject.trim() || 'KMC Bus Production Dashboard Report',
        schedule, scheduledTime: schedule !== 'now' ? scheduledTime : null,
        weekday: schedule === 'weekly' ? weekday : null,
        busCount: buses.length, attachments,
        dataStartDate: emailStartDate || null,
        dataEndDate:   emailEndDate   || null,
      });

      // Persist scheduled (non-immediate) sends to localStorage
      if (schedule !== 'now' && !result.fallback) {
        const entry = {
          id:        Date.now().toString(),
          to:        to.trim(),
          subject:   subject.trim(),
          schedule,
          scheduledTime,
          weekday:   schedule === 'weekly' ? weekday : null,
          startDate: emailStartDate || null,
          endDate:   emailEndDate   || null,
          createdAt: new Date().toISOString(),
        };
        saveSchedules([...loadSchedules(), entry]);
        refreshSchedules();
      }

      setStatus({
        ok: true,
        msg: result.fallback
          ? `Mail client opened — ${attachments.length} attachment(s) included in payload (PNG + 2 PDFs). Attach manually if needed.`
          : schedule === 'now'
            ? `Report sent with ${attachments.length} attachment(s) ✓`
            : `Scheduled: ${schedule === 'daily' ? `Daily at ${scheduledTime}` : `Every ${weekday} at ${scheduledTime}`} ✓`,
      });
    } catch (e) {
      setStatus({ ok: false, msg: `Send failed: ${e.message}` });
    }
    setBusy(false);
  }

  const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 5, padding: '8px 11px', color: '#f1f5f9', fontSize: 12,
    fontFamily: "'Space Mono', monospace", outline: 'none',
  };
  const labelStyle = {
    fontSize: 9, color: '#475569', letterSpacing: '0.12em',
    textTransform: 'uppercase', fontFamily: "'Space Mono', monospace",
    marginBottom: 5, display: 'block',
  };
  const dateInputStyle = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4, padding: '6px 9px', color: '#94a3b8', fontSize: 11,
    fontFamily: "'Space Mono', monospace", outline: 'none', colorScheme: 'dark',
    flex: 1,
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: '#0d1526', border: '1px solid rgba(255,255,255,0.09)',
        borderTop: '2px solid #6366f1', borderRadius: 10,
        width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        padding: '22px 24px 20px', display: 'flex', flexDirection: 'column', gap: 18,
        boxShadow: '0 24px 64px rgba(0,0,0,0.9)',
        fontFamily: "'Barlow Condensed', sans-serif",
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Schedule Email Report
          </span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* ── Recipients ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Recipients (comma-separated)</label>
          <input type="text" placeholder="ops@kmc.go.ug, manager@kmc.go.ug" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </div>

        {/* ── Subject ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Subject</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
        </div>

        {/* ── Data date range ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={labelStyle}>Report Data Range (optional)</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(99,102,241,0.05)',
            border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: 6, padding: '10px 12px',
          }}>
            <span style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>FROM</span>
            <input
              type="date"
              value={emailStartDate}
              onChange={e => setEmailStartDate(e.target.value)}
              style={dateInputStyle}
            />
            <span style={{ fontSize: 9, color: '#475569', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>TO</span>
            <input
              type="date"
              value={emailEndDate}
              onChange={e => setEmailEndDate(e.target.value)}
              style={dateInputStyle}
            />
            {(emailStartDate || emailEndDate) && (
              <button
                onClick={() => { setEmailStartDate(''); setEmailEndDate(''); }}
                style={{
                  background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 3, color: '#f87171', fontSize: 9,
                  fontFamily: "'Space Mono', monospace", padding: '4px 7px',
                  cursor: 'pointer', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                }}
              >
                CLEAR
              </button>
            )}
          </div>
          {(emailStartDate || emailEndDate) && (
            <div style={{ fontSize: 9, color: '#6366f1', fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em', paddingLeft: 2 }}>
              ◈ Report will include data
              {emailStartDate ? ` from ${emailStartDate}` : ''}
              {emailEndDate   ? ` to ${emailEndDate}` : ''}
              {' '}only
            </div>
          )}
        </div>

        {/* ── Schedule type ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Schedule</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: 'now', label: 'Send Now', icon: '⚡' }, { val: 'daily', label: 'Daily', icon: '📅' }, { val: 'weekly', label: 'Weekly', icon: '🗓' }].map(opt => (
              <button key={opt.val} onClick={() => setSchedule(opt.val)} style={{
                flex: 1, padding: '8px 0',
                background: schedule === opt.val ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${schedule === opt.val ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 5, cursor: 'pointer',
                color: schedule === opt.val ? '#a5b4fc' : '#475569',
                fontSize: 12, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif",
              }}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Time / day pickers ── */}
        {schedule !== 'now' && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>Send Time</label>
              <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            </div>
            {schedule === 'weekly' && (
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>Day of Week</label>
                <div style={{ display: 'flex', gap: 5 }}>
                  {DAYS.map(d => (
                    <button key={d} onClick={() => setWeekday(d)} style={{
                      flex: 1, padding: '6px 0',
                      background: weekday === d ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${weekday === d ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 4, cursor: 'pointer',
                      color: weekday === d ? '#a5b4fc' : '#334155',
                      fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                    }}>{d}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Status message ── */}
        {status && (
          <div style={{
            background: status.ok ? 'rgba(16,185,129,0.09)' : 'rgba(220,38,38,0.09)',
            border: `1px solid ${status.ok ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)'}`,
            borderLeft: `3px solid ${status.ok ? '#10b981' : '#dc2626'}`,
            borderRadius: '0 6px 6px 0', padding: '9px 14px',
            fontSize: 11, color: status.ok ? '#6ee7b7' : '#fca5a5',
            fontFamily: "'Space Mono', monospace",
          }}>
            {status.msg}
          </div>
        )}

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 5, padding: '8px 20px', color: '#475569', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif",
          }}>Cancel</button>
          <button onClick={handleSend} disabled={busy} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: busy ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.18)',
            border: `1px solid ${busy ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.5)'}`,
            borderRadius: 5, padding: '8px 22px',
            color: busy ? '#334155' : '#a5b4fc',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif",
          }}>
            {busy ? 'Sending…' : schedule === 'now' ? '⚡ Send Now' : schedule === 'daily' ? '📅 Schedule Daily' : '🗓 Schedule Weekly'}
          </button>
        </div>

        {/* ── Active schedules panel ── */}
        {savedSchedules.length > 0 && (
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span style={{ fontSize: 10, color: '#f59e0b', fontFamily: "'Space Mono', monospace", letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Active Schedules ({savedSchedules.length})
                </span>
              </div>
              <button
                onClick={cancelAllSchedules}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(220,38,38,0.08)',
                  border: '1px solid rgba(220,38,38,0.3)',
                  borderRadius: 4, padding: '4px 10px',
                  color: '#fca5a5', fontSize: 10, fontWeight: 700,
                  fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em',
                  cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Cancel All
              </button>
            </div>

            {/* Schedule entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedSchedules.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: 'rgba(245,158,11,0.05)',
                  border: '1px solid rgba(245,158,11,0.15)',
                  borderLeft: '2px solid rgba(245,158,11,0.5)',
                  borderRadius: '0 6px 6px 0',
                  padding: '9px 12px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Recipients */}
                    <div style={{
                      fontSize: 11, color: '#e2e8f0', fontWeight: 700,
                      fontFamily: "'Space Mono', monospace",
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      marginBottom: 4,
                    }}>
                      {s.to}
                    </div>
                    {/* Schedule summary */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 9, color: '#f59e0b',
                        fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em',
                        background: 'rgba(245,158,11,0.12)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 3, padding: '2px 6px',
                      }}>
                        {s.schedule === 'daily'
                          ? `📅 Daily @ ${s.scheduledTime}`
                          : `🗓 Every ${s.weekday} @ ${s.scheduledTime}`}
                      </span>
                      {(s.startDate || s.endDate) && (
                        <span style={{
                          fontSize: 9, color: '#818cf8',
                          fontFamily: "'Space Mono', monospace", letterSpacing: '0.06em',
                          background: 'rgba(99,102,241,0.1)',
                          border: '1px solid rgba(99,102,241,0.2)',
                          borderRadius: 3, padding: '2px 6px',
                        }}>
                          ◈ {s.startDate || '…'} → {s.endDate || '…'}
                        </span>
                      )}
                    </div>
                    {/* Created timestamp */}
                    <div style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", marginTop: 4 }}>
                      Created {new Date(s.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Cancel individual */}
                  <button
                    onClick={() => cancelSchedule(s.id)}
                    title="Cancel this schedule"
                    style={{
                      flexShrink: 0,
                      background: 'rgba(220,38,38,0.08)',
                      border: '1px solid rgba(220,38,38,0.25)',
                      borderRadius: 4, padding: '5px 8px',
                      color: '#fca5a5', cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────
// ExportPanel — v7
// ─────────────────────────────────────────────────────────────
export default function ExportPanel({ buses, rows, allRows, metrics, dashboardRef, slideRef, onPresent, stationTimes = {} }) {
  // Support both `rows` (new) and `allRows` (legacy) prop names
  rows = rows ?? allRows ?? [];
  const [busy,      setBusy]      = useState({});
  const [toast,     setToast]     = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const coverRef = useRef(null);
  const date = new Date().toISOString().slice(0, 10);

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }
  function setLoading(key, val) { setBusy(b => ({ ...b, [key]: val })); }

  async function handleExcel() {
    setLoading('excel', true);
    try { XLSX.writeFile(buildWorkbook(buses, rows, metrics), `KMC_Dashboard_${date}.xlsx`); showToast('Excel downloaded ✓'); }
    catch (e) { console.error(e); showToast('Excel export failed', false); }
    finally { setLoading('excel', false); }
  }

  async function handlePDF() {
    setLoading('pdf', true);
    try {
      const logo = await fetchLogoBase64('/kmc logo.png');
      const doc  = await buildPDF(buses, rows, metrics, logo);
      doc.save(`KMC_Dashboard_${date}.pdf`);
      showToast('PDF downloaded ✓');
    } catch (e) { console.error(e); showToast('PDF export failed', false); }
    finally { setLoading('pdf', false); }
  }

  async function handleSlidePDF() {
    setLoading('scpdf', true);
    try {
      const logo = await fetchLogoBase64('/kmc logo 2.png');
      const doc  = await buildSlidePDF(buses, rows, metrics, logo);
      doc.save(`KMC_Presentation_${date}.pdf`);
      showToast('Presentation PDF downloaded ✓');
    } catch (e) { console.error(e); showToast('Slide PDF failed', false); }
    finally { setLoading('scpdf', false); }
  }

  // ── PNG: capture the hidden cover slide div ───────────────────
  async function handlePNG() {
    const el = coverRef?.current;
    if (!el) { showToast('Cover slide not ready', false); return; }
    setLoading('png', true);
    try {
      // Temporarily move it into view so html2canvas can render it
      el.style.position = 'fixed';
      el.style.top = '-9999px';
      el.style.left = '0';
      el.style.visibility = 'visible';

      const canvas = await html2canvas(el, {
        backgroundColor: '#07090f',
        scale: 2,
        useCORS: true,
        logging: false,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });

      el.style.position = 'fixed';
      el.style.top = '-9999px';
      el.style.left = '-9999px';

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `KMC_CoverSlide_${date}.png`;
      a.click();
      showToast('Cover slide PNG downloaded ✓');
    } catch (e) { console.error(e); showToast('PNG export failed', false); }
    finally { setLoading('png', false); }
  }

  const Spinner = () => (
    <div style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'epSpin 0.7s linear infinite', display: 'inline-block' }} />
  );

  const Btn = ({ id, color, border, icon, label, onClick, title }) => (
    <button onClick={onClick} disabled={!!busy[id]} title={title} style={{
      display: 'flex', alignItems: 'center', gap: 7,
      background: 'transparent',
      border: `1px solid ${busy[id] ? 'rgba(255,255,255,0.06)' : border}`,
      borderRadius: 4, padding: '6px 14px',
      fontSize: 13, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
      fontFamily: "'Barlow Condensed', sans-serif", cursor: busy[id] ? 'not-allowed' : 'pointer',
      color: busy[id] ? '#334155' : color, transition: 'all 0.15s',
    }}>
      {busy[id] ? <Spinner /> : icon}
      {label}
    </button>
  );

  const icons = {
    excel:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
    pdf:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6M9 11h3"/></svg>,
    cam:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
    png:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    email:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    present: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  };

  return (
    <div style={{ position: 'relative' }}>
      <style>{`@keyframes epSpin { to { transform: rotate(360deg); } }`}</style>

      {/* Hidden cover slide for PNG capture */}
      <HiddenCoverSlide
        coverRef={coverRef}
        buses={buses}
        rows={rows}
        metrics={metrics}
        stationTimes={stationTimes}
      />

      {emailOpen && (
        <EmailModal
          onClose={() => setEmailOpen(false)}
          buses={buses}
          rows={rows}
          metrics={metrics}
          coverRef={coverRef}
        />
      )}

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(7,9,15,0.96)', backdropFilter: 'blur(16px)',
        padding: '10px 32px',
      }}>
        <span style={{ fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 4 }}>
          Export
        </span>

        <Btn id="excel" color="#4ade80" border="rgba(74,222,128,0.22)"  icon={icons.excel} label="Excel"       onClick={handleExcel}    title="Full Excel workbook (5 sheets)" />
        <Btn id="pdf"   color="#f87171" border="rgba(248,113,113,0.22)" icon={icons.pdf}   label="PDF Report"  onClick={handlePDF}      title="Formatted PDF report with KMC branding" />
        <Btn id="scpdf" color="#818cf8" border="rgba(129,140,248,0.22)" icon={icons.cam}   label="Slide PDF"   onClick={handleSlidePDF} title="Dark presentation-style PDF (cover + bus report pages)" />
        <Btn id="png"   color="#fbbf24" border="rgba(251,191,36,0.22)"  icon={icons.png}   label="PNG"         onClick={handlePNG}      title="Download cover slide as PNG" />

        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.07)', margin: '0 4px' }} />

        <button
          onClick={onPresent}
          title="Open full-screen presentation slide deck"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.45)',
            borderRadius: 4, padding: '6px 16px',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            fontFamily: "'Barlow Condensed', sans-serif", cursor: 'pointer',
            color: '#fca5a5', transition: 'all 0.15s',
          }}
        >
          {icons.present}
          Present
        </button>

        <button
          onClick={() => setEmailOpen(true)}
          title="Schedule email delivery"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: 4, padding: '6px 14px',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
            fontFamily: "'Barlow Condensed', sans-serif", cursor: 'pointer',
            color: '#a5b4fc', transition: 'all 0.15s',
          }}
        >
          {icons.email}
          Email Report
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#334155', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em' }}>
          {buses.length} BUS{buses.length !== 1 ? 'ES' : ''} · {rows.length} RECORDS
        </span>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 60, right: 24, zIndex: 9999,
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
