import jsPDF from 'jspdf';
import { LINES, STATIONS } from '../data/stations';
import { isKDC, isEVS, fmt, fmtDate, getStatus } from './exportHelpers';

export async function buildSlidePDF(buses, rows, metrics, logoBase64) {
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
  const totalSlides = (hasAnalytics ? 2 : 1) + chunks.length;

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
  const hasAnalytics = (metrics.overrunPareto?.length > 0) || (metrics.stationEfficiency?.some(s => s.efficiency != null)) || metrics.hasDowntimeData || metrics.hasReworkData;

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
    ...(metrics.firstPassYield != null ? [{ label: 'First Pass Yield', val: `${metrics.firstPassYield}%`, color: metrics.firstPassYield >= 90 ? GREEN : metrics.firstPassYield >= 75 ? AMBER : BLUE }] : []),
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
        const effStr = item.efficiency != null ? `  ·  ${item.efficiency}% eff.` : '';
        const vp     = item.variancePct != null ? `  ·  ${item.variancePct > 0 ? '+' : ''}${item.variancePct}% vs est.` : '';
        doc.text(`avg ${item.hours.toFixed(1)}h${effStr}${vp}`, COL3_X + 4, py + perfH - 3);
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...VDIM);
      doc.text('Not enough data yet', COL3_X + 4, py + 14);
    }
  });

  drawFooter();

  // ── Analytics slide ───────────────────────────────────────────
  if (hasAnalytics) {
    doc.addPage([W, H], 'landscape');
    resetPage();
    drawHeader(2);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DIM);
    doc.text('PRODUCTION ANALYTICS  ·  EFFICIENCY & DOWNTIME', W / 2, BODY_Y + 5, { align: 'center' });

    const AY = BODY_Y + 9, AH = FTR_Y - AY - 2;
    const AGAP = 4;
    const AL_W = (CW - AGAP) / 2;
    const AL_X = M, AR_X = M + AL_W + AGAP;

    const darkSectionTitle = (x, y, w, title) => {
      doc.setFillColor(18, 28, 48); doc.rect(x, y, w, 7, 'F');
      doc.setDrawColor(30, 45, 64); doc.setLineWidth(0.2); doc.line(x, y + 7, x + w, y + 7);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MID);
      doc.text(title.toUpperCase(), x + 3, y + 5);
      return y + 9;
    };

    let leftY = AY, rightY = AY;

    // LEFT: Station Efficiency
    const effData = (metrics.stationEfficiency || []).filter(s => s.efficiency != null).slice(0, 12);
    if (effData.length > 0) {
      leftY = darkSectionTitle(AL_X, leftY, AL_W, 'Station Efficiency (Planned ÷ Actual)');
      const maxBarW = AL_W - 32;
      const rowH = Math.min((AH - 14) / effData.length, 10);
      effData.forEach((s, i) => {
        const ry = leftY + i * rowH;
        const effColor = s.efficiency >= 95 ? GREEN : s.efficiency >= 80 ? AMBER : RED;
        if (i % 2 === 0) { doc.setFillColor(18, 28, 48); doc.rect(AL_X + 1, ry, AL_W - 2, rowH, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...LIGHT);
        const label = (s.name || s.code).length > 26 ? (s.name || s.code).slice(0, 25) + '…' : (s.name || s.code);
        doc.text(label, AL_X + 3, ry + rowH / 2 + 1.5);
        const bx = AL_X + 3, by = ry + rowH / 2 + 3.5, bw = maxBarW, bh = 2;
        doc.setFillColor(30, 45, 64); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = Math.min(s.efficiency / 130, 1) * bw;
        doc.setFillColor(...effColor); doc.roundedRect(bx, by, Math.max(fw, 0.5), bh, 0.6, 0.6, 'F');
        const markerX = bx + (100 / 130) * bw;
        doc.setDrawColor(...VDIM); doc.setLineWidth(0.3); doc.line(markerX, by, markerX, by + bh);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...effColor);
        doc.text(`${s.efficiency}%`, AL_X + AL_W - 2, ry + rowH / 2 + 2, { align: 'right' });
      });
      leftY += effData.length * rowH + 3;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...VDIM);
      doc.text('▏ white marker = 100% target  ●green ≥95%  ●amber 80-94%  ●red <80%', AL_X + 3, leftY);
    }

    // Rework below efficiency if space
    if (metrics.hasReworkData && (metrics.reworkByStationList || []).length > 0 && leftY < AY + AH * 0.65) {
      leftY += 5;
      leftY = darkSectionTitle(AL_X, leftY, AL_W, 'Rework Hours by Station');
      const rwData = metrics.reworkByStationList.slice(0, 7);
      const maxHrs = rwData[0].hrs;
      const maxBW = AL_W - 32;
      const rowHR = Math.min((AY + AH - leftY - 2) / rwData.length, 10);
      rwData.forEach((r, i) => {
        const ry = leftY + i * rowHR;
        const c = i === 0 ? [249, 115, 22] : AMBER;
        if (i % 2 === 0) { doc.setFillColor(18, 28, 48); doc.rect(AL_X + 1, ry, AL_W - 2, rowHR, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...LIGHT);
        const lbl = (r.name || r.code).length > 26 ? (r.name || r.code).slice(0, 25) + '…' : (r.name || r.code);
        doc.text(lbl, AL_X + 3, ry + rowHR / 2 + 1.5);
        const bx = AL_X + 3, by = ry + rowHR / 2 + 3.5, bw = maxBW, bh = 2;
        doc.setFillColor(30, 45, 64); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = (r.hrs / maxHrs) * bw;
        doc.setFillColor(...c); doc.roundedRect(bx, by, Math.max(fw, 0.5), bh, 0.6, 0.6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...c);
        doc.text(`${r.hrs.toFixed(1)}h`, AL_X + AL_W - 2, ry + rowHR / 2 + 2, { align: 'right' });
      });
    }

    // RIGHT: Overrun Pareto
    if ((metrics.overrunPareto || []).length > 0) {
      rightY = darkSectionTitle(AR_X, rightY, AL_W, `Overrun by Station — Top ${metrics.overrunPareto.length}`);
      const maxMin = metrics.overrunPareto[0].totalMin;
      const maxBW2 = AL_W - 40;
      const rowH2 = Math.min((AH * 0.5) / metrics.overrunPareto.length, 10);
      metrics.overrunPareto.forEach((item, i) => {
        const ry = rightY + i * rowH2;
        if (i % 2 === 0) { doc.setFillColor(18, 28, 48); doc.rect(AR_X + 1, ry, AL_W - 2, rowH2, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...VDIM);
        doc.text(`#${i + 1}`, AR_X + 3, ry + rowH2 / 2 + 1.5);
        doc.setTextColor(...LIGHT);
        const lbl = (item.name || item.code).length > 20 ? (item.name || item.code).slice(0, 19) + '…' : (item.name || item.code);
        doc.text(lbl, AR_X + 10, ry + rowH2 / 2 + 1.5);
        const bx = AR_X + 10, by = ry + rowH2 / 2 + 3.5, bw = maxBW2, bh = 2;
        doc.setFillColor(30, 45, 64); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = (item.totalMin / maxMin) * bw;
        const c = i === 0 ? RED : AMBER;
        doc.setFillColor(...c); doc.roundedRect(bx, by, Math.max(fw, 0.5), bh, 0.6, 0.6, 'F');
        const hrs = Math.floor(item.totalMin / 60), mins = Math.round(item.totalMin % 60);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...c);
        doc.text(hrs > 0 ? `${hrs}h${mins}m` : `${mins}m`, AR_X + AL_W - 2, ry + rowH2 / 2 + 2, { align: 'right' });
      });
      rightY += metrics.overrunPareto.length * rowH2 + 6;
    }

    // RIGHT: Downtime Pareto
    if ((metrics.downtimePareto || []).length > 0) {
      rightY = darkSectionTitle(AR_X, rightY, AL_W, 'Downtime by Reason — Pareto');
      const dtData = metrics.downtimePareto;
      const maxMinD = dtData[0].mins;
      const maxBW3 = AL_W - 36;
      const rowH3 = Math.min((AY + AH - rightY - 2) / dtData.length, 10);
      dtData.forEach((d, i) => {
        const ry = rightY + i * rowH3;
        if (i % 2 === 0) { doc.setFillColor(18, 28, 48); doc.rect(AR_X + 1, ry, AL_W - 2, rowH3, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...LIGHT);
        const lbl = d.reason.length > 22 ? d.reason.slice(0, 21) + '…' : d.reason;
        doc.text(lbl, AR_X + 3, ry + rowH3 / 2 + 1.5);
        const bx = AR_X + 3, by = ry + rowH3 / 2 + 3.5, bw = maxBW3, bh = 2;
        doc.setFillColor(30, 45, 64); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = (d.mins / maxMinD) * bw;
        const c = i === 0 ? RED : i === 1 ? [249, 115, 22] : AMBER;
        doc.setFillColor(...c); doc.roundedRect(bx, by, Math.max(fw, 0.5), bh, 0.6, 0.6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...c);
        doc.text(`${d.pct}%  cum.${d.cumPct}%`, AR_X + AL_W - 2, ry + rowH3 / 2 + 2, { align: 'right' });
      });
    }

    drawFooter();
  }

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

  const busSlideOffset = hasAnalytics ? 3 : 2;
  chunks.forEach((chunk, pageIdx) => {
    doc.addPage([W, H], 'landscape');
    resetPage();
    drawHeader(pageIdx + busSlideOffset);

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
