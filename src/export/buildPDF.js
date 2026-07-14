import jsPDF from 'jspdf';
import { LINES, isMajorStation, majorStationCountForLine } from '../data/stations';
import { isKDC, isEVS, fmt, fmtDate, getStatus } from './exportHelpers';

export async function buildPDF(buses, rows, metrics, logoBase64) {
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
    const visited  = new Set(history.map(r => r.stationCode).filter(isMajorStation)).size;
    const lineId   = bus.station?.line;
    const lineTot  = lineId ? majorStationCountForLine(lineId) : 0;
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
  const hasAnalytics = (metrics.overrunPareto?.length > 0) || (metrics.stationEfficiency?.some(s => s.efficiency != null)) || metrics.hasDowntimeData || metrics.hasReworkData;
  const totalPages = (hasAnalytics ? 2 : 1) + Math.ceil(busRows.length / BUSES_PER_PAGE);

  function resetPage(doc) {
    doc.setFillColor(...WHITE);
    doc.rect(0, 0, W, H, 'F');
  }

  function drawHeader(doc, pageNum) {
    // Full navy header band
    doc.setFillColor(...[15, 23, 42]);
    doc.rect(0, 0, W, HDR_H, 'F');
    // Red bottom accent
    doc.setFillColor(...RED);
    doc.rect(0, HDR_H, W, 1.5, 'F');

    // Logo — left in navy band
    if (logoBase64) { try { doc.addImage(logoBase64, 'PNG', M, 3, 28, 0); } catch {} }

    // Title — centred
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text('KMC BUS PRODUCTION TRACKER', W / 2, 9, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(180, 190, 210);
    doc.text(`Kiira Motors Corporation  ·  Confidential  ·  ${stamp}`, W / 2, 14.5, { align: 'center' });

    // Page number — right
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(180, 190, 210);
    doc.text(`Page ${pageNum} / ${totalPages}`, W - M, 9, { align: 'right' });
  }

  function drawFooter(doc) {
    doc.setDrawColor(...LIGHTGRAY); doc.setLineWidth(0.2);
    doc.line(M, FTR_Y, W - M, FTR_Y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...[148, 163, 184]);
    doc.text('KIIRA MOTORS CORPORATION · KMC BUS PRODUCTION TRACKER', M, FTR_Y + 4);
    const legends = [
      { dot: GREEN, label: 'ON TRACK' }, { dot: AMBER, label: 'SLOW (>24h)' },
      { dot: RED, label: 'DELAYED (>48h)' }, { dot: KDC_C, label: 'KDC' }, { dot: EVS_C, label: 'EVS' },
    ];
    let lx = W / 2 - 45;
    legends.forEach(({ dot, label }) => {
      doc.setFillColor(...dot); doc.circle(lx, FTR_Y + 3, 1, 'F');
      doc.setTextColor(...[100, 116, 139]); doc.text(label, lx + 2.5, FTR_Y + 3.8);
      lx += doc.getTextWidth(label) + 7;
    });
    doc.setTextColor(...[148, 163, 184]);
    doc.text(stamp, W - M, FTR_Y + 4, { align: 'right' });
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
        const effStr = item.efficiency != null ? `  ·  ${item.efficiency}% eff.` : '';
        const vp     = item.variancePct != null ? `  ·  ${item.variancePct > 0 ? '+' : ''}${item.variancePct}% vs est.` : '';
        doc.text(`avg ${item.hours.toFixed(1)}h dwell${effStr}${vp}`, x + 4, y + 17 + nameBlockH + 2);
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
    ...(metrics.firstPassYield != null ? [{ label: 'First Pass Yield', val: `${metrics.firstPassYield}%`, color: metrics.firstPassYield >= 90 ? GREEN : metrics.firstPassYield >= 75 ? AMBER : RED }] : []),
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

  // ── Analytics page (only when any analytics data exists) ──────
  if (hasAnalytics) {
    doc.addPage([W, H], 'landscape');
    resetPage(doc); drawHeader(doc, 2);
    const AY = BODY_Y + 2, AH = FTR_Y - AY - 2;
    const AGAP = 4;

    // Layout: two columns
    const AL_W = (CW - AGAP) / 2;
    const AL_X = M, AR_X = M + AL_W + AGAP;

    let leftY = AY, rightY = AY;
    const sectionTitle = (doc, x, y, w, title) => {
      doc.setFillColor(...[30, 41, 59]); doc.rect(x, y, w, 7, 'F');
      doc.setFillColor(...RED); doc.rect(x, y, 3, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...WHITE);
      doc.text(title.toUpperCase(), x + 6, y + 5);
      return y + 9;
    };

    // LEFT: Station Efficiency
    const effData = (metrics.stationEfficiency || []).filter(s => s.efficiency != null).slice(0, 12);
    if (effData.length > 0) {
      leftY = sectionTitle(doc, AL_X, leftY, AL_W, 'Station Efficiency (Planned ÷ Actual)');
      const maxBarW = AL_W - 34;
      const rowH = Math.min((AH - 20) / effData.length, 10);
      effData.forEach((s, i) => {
        const ry = leftY + i * rowH;
        const effColor = s.efficiency >= 95 ? GREEN : s.efficiency >= 80 ? AMBER : RED;
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(AL_X, ry, AL_W, rowH, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...BLACK);
        const label = (s.name || s.code).length > 26 ? (s.name || s.code).slice(0, 25) + '…' : (s.name || s.code);
        doc.text(label, AL_X + 3, ry + rowH / 2 + 1.5);
        const bx = AL_X + 3, by = ry + rowH / 2 + 3, bw = maxBarW, bh = 2.5;
        doc.setFillColor(229, 231, 235); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = Math.min(s.efficiency / 130, 1) * bw;
        doc.setFillColor(...effColor); doc.roundedRect(bx, by, Math.max(fw, 1), bh, 0.6, 0.6, 'F');
        const markerX = bx + (100 / 130) * bw;
        doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.4); doc.line(markerX, by, markerX, by + bh);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...effColor);
        doc.text(`${s.efficiency}%`, AL_X + AL_W - 2, ry + rowH / 2 + 2, { align: 'right' });
      });
      leftY += effData.length * rowH + 3;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...LIGHTGRAY);
      doc.text('▏ marker = 100% target', AL_X + 3, leftY);
    }

    // RIGHT: Overrun Pareto or Downtime Pareto
    const paretoData = metrics.downtimePareto?.length > 0 ? metrics.downtimePareto : null;
    const overrunData = metrics.overrunPareto?.length > 0 ? metrics.overrunPareto : null;

    if (overrunData) {
      rightY = sectionTitle(doc, AR_X, rightY, AL_W, `Downtime by Station — Top ${overrunData.length}`);
      const maxMin = overrunData[0].totalMin;
      const maxBarW2 = AL_W - 42;
      const rowH2 = Math.min((AH * 0.5) / overrunData.length, 10);
      overrunData.forEach((item, i) => {
        const ry = rightY + i * rowH2;
        const pct = (item.totalMin / maxMin) * 100;
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(AR_X, ry, AL_W, rowH2, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...BLACK);
        const label = (item.name || item.code).length > 22 ? (item.name || item.code).slice(0, 21) + '…' : (item.name || item.code);
        doc.text(`#${i + 1}`, AR_X + 3, ry + rowH2 / 2 + 1.5);
        doc.text(label, AR_X + 10, ry + rowH2 / 2 + 1.5);
        const bx = AR_X + 10, by = ry + rowH2 / 2 + 3, bw = maxBarW2, bh = 2.5;
        doc.setFillColor(229, 231, 235); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = (pct / 100) * bw;
        doc.setFillColor(...(i === 0 ? RED : AMBER)); doc.roundedRect(bx, by, Math.max(fw, 1), bh, 0.6, 0.6, 'F');
        const hrs = Math.floor(item.totalMin / 60), mins = Math.round(item.totalMin % 60);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...(i === 0 ? RED : AMBER));
        doc.text(hrs > 0 ? `${hrs}h${mins}m` : `${mins}m`, AR_X + AL_W - 2, ry + rowH2 / 2 + 2, { align: 'right' });
      });
      rightY += overrunData.length * rowH2 + 5;
    }

    if (paretoData) {
      rightY = sectionTitle(doc, AR_X, rightY, AL_W, 'Downtime by Reason — Pareto');
      const maxMinD = paretoData[0].mins;
      const maxBarW3 = AL_W - 42;
      const rowH3 = Math.min((AH - (rightY - AY) - 4) / paretoData.length, 10);
      paretoData.forEach((d, i) => {
        const ry = rightY + i * rowH3;
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(AR_X, ry, AL_W, rowH3, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...BLACK);
        const lbl = d.reason.length > 22 ? d.reason.slice(0, 21) + '…' : d.reason;
        doc.text(lbl, AR_X + 3, ry + rowH3 / 2 + 1.5);
        const bx = AR_X + 3, by = ry + rowH3 / 2 + 3, bw = maxBarW3, bh = 2.5;
        doc.setFillColor(229, 231, 235); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = (d.mins / maxMinD) * bw;
        const c = i === 0 ? RED : i === 1 ? [249, 115, 22] : AMBER;
        doc.setFillColor(...c); doc.roundedRect(bx, by, Math.max(fw, 1), bh, 0.6, 0.6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...c);
        doc.text(`${d.pct}%`, AR_X + AL_W - 2, ry + rowH3 / 2 + 2, { align: 'right' });
      });
    }

    // Rework by station (below left column if space)
    if (metrics.hasReworkData && (metrics.reworkByStationList || []).length > 0 && leftY < AY + AH * 0.7) {
      leftY += 4;
      leftY = sectionTitle(doc, AL_X, leftY, AL_W, 'Rework Hours by Station');
      const rwData = metrics.reworkByStationList.slice(0, 8);
      const maxHrs = rwData[0].hrs;
      const maxBarWR = AL_W - 34;
      const rowHR = Math.min((AY + AH - leftY - 2) / rwData.length, 10);
      rwData.forEach((r, i) => {
        const ry = leftY + i * rowHR;
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(AL_X, ry, AL_W, rowHR, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...BLACK);
        const label = (r.name || r.code).length > 26 ? (r.name || r.code).slice(0, 25) + '…' : (r.name || r.code);
        doc.text(label, AL_X + 3, ry + rowHR / 2 + 1.5);
        const bx = AL_X + 3, by = ry + rowHR / 2 + 3, bw = maxBarWR, bh = 2.5;
        doc.setFillColor(229, 231, 235); doc.roundedRect(bx, by, bw, bh, 0.6, 0.6, 'F');
        const fw = (r.hrs / maxHrs) * bw;
        doc.setFillColor(...(i === 0 ? [249, 115, 22] : AMBER)); doc.roundedRect(bx, by, Math.max(fw, 1), bh, 0.6, 0.6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...(i === 0 ? [249, 115, 22] : AMBER));
        doc.text(`${r.hrs.toFixed(1)}h`, AL_X + AL_W - 2, ry + rowHR / 2 + 2, { align: 'right' });
      });
    }

    drawFooter(doc);
  }

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

  const busPageOffset = hasAnalytics ? 3 : 2;
  wChunks.forEach((chunk, pageIdx) => {
    doc.addPage([W, H], 'landscape');
    resetPage(doc); drawHeader(doc, pageIdx + busPageOffset);
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
    doc.setFillColor(...[15, 23, 42]); doc.rect(M, thY2, CW, TH_H, 'F');
    doc.setDrawColor(...[15, 23, 42]); doc.setLineWidth(0.1);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE);
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
