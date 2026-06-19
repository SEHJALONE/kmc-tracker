import jsPDF from 'jspdf';

// ── Palette (matches buildPDF.js / tracker brand) ─────────────────────────
const RED   = [220, 38,  38 ];
const GREEN = [16,  185, 129];
const AMBER = [245, 158, 11 ];
const BLACK = [15,  23,  42 ];
const SLATE = [40,  40,  55 ];
const MID   = [100, 116, 139];
const DIM   = [148, 163, 184];
const WHITE = [255, 255, 255];
const XLIT  = [241, 245, 249];
const LTRED = [254, 242, 242];
const LTGRN = [209, 250, 229];
const LTAMB = [254, 243, 199];
const LTBLU = [224, 242, 254];

const W = 210, H = 297; // A4 portrait (mm)
const M = 14;
const CW = W - M * 2;

function stamp() {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return iso; }
}

function fmtDur(mins) {
  if (mins == null || isNaN(mins) || mins < 0) return '—';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

function makeDoc() {
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
}

// ── Shared page chrome ─────────────────────────────────────────────────────
function drawHeader(doc, logoBase64, pageNum, totalPages, subtitle = '') {
  // Red top stripe
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 4, 'F');
  // Light header band
  doc.setFillColor(...XLIT);
  doc.rect(0, 4, W, 18, 'F');
  // Logo
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', M, 5.5, 22, 0); } catch {}
  }
  // Title block
  const tx = logoBase64 ? M + 25 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...BLACK);
  doc.text('PRODUCTION TRAVEL CARD', tx, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MID);
  doc.text(`KMC.DPN.05/26-FM004 · Rev #01   ·   ${subtitle}`, tx, 18.5);
  // Page number
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLACK);
  doc.text(`${pageNum} / ${totalPages}`, W - M, 15, { align: 'right' });
  // Divider
  doc.setDrawColor(...DIM); doc.setLineWidth(0.2);
  doc.line(M, 22, W - M, 22);
}

function drawFooter(doc, reviewer, status, reviewDate) {
  const fy = H - 18;
  doc.setFillColor(...XLIT);
  doc.rect(0, fy, W, 18, 'F');
  doc.setDrawColor(...DIM); doc.setLineWidth(0.15);
  doc.line(M, fy, W - M, fy);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MID);
  doc.text('KIIRA MOTORS CORPORATION', M, fy + 5);
  doc.text(stamp(), W - M, fy + 5, { align: 'right' });
  if (reviewer) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
    doc.text(`Reviewed by: ${reviewer}`, M, fy + 10);
    const statusColor = status === 'approved' ? GREEN : status === 'rejected' ? RED : AMBER;
    const statusLabel = status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'PENDING';
    const pillW = 24, pillX = M + 70;
    doc.setFillColor(...(status === 'approved' ? LTGRN : status === 'rejected' ? LTRED : LTAMB));
    doc.roundedRect(pillX, fy + 6.5, pillW, 6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...statusColor);
    doc.text(statusLabel, pillX + pillW / 2, fy + 10.5, { align: 'center' });
    if (reviewDate) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MID);
      doc.text(`Date: ${reviewDate}`, M + 100, fy + 10);
    }
  }
}

function sectionTitle(doc, y, title) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...RED);
  doc.text(title.toUpperCase(), M, y);
  doc.setDrawColor(...RED); doc.setLineWidth(0.4);
  doc.line(M, y + 1.5, W - M, y + 1.5);
  return y + 6;
}

function kvRow(doc, x, y, label, value, w = CW / 2 - 3, bold = false) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MID);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(...BLACK);
  const lines = doc.splitTextToSize(String(value || '—'), w - 2);
  doc.text(lines[0] || '—', x, y + 4);
  return y + 9;
}

// ── STATION REPORT PDF ─────────────────────────────────────────────────────
export async function buildStationReportPDF(sub, logoBase64) {
  const doc = makeDoc();
  const S = stamp();
  const totalPages = 1;

  function hdr(pg) { drawHeader(doc, logoBase64, pg, totalPages, `${sub.stationCode} — ${sub.vin}`); }
  function ftr() { drawFooter(doc, sub.reviewer, sub.approvalStatus, sub.reviewDate); }

  hdr(1);
  let y = 27;

  // ── Identity block ──
  y = sectionTitle(doc, y, 'Bus identity');
  doc.setFillColor(...XLIT);
  doc.roundedRect(M, y, CW, 28, 1.5, 1.5, 'F');
  doc.setDrawColor(...DIM); doc.setLineWidth(0.15);
  doc.roundedRect(M, y, CW, 28, 1.5, 1.5, 'D');
  y += 4;
  const half = CW / 2;
  kvRow(doc, M + 4, y, 'Project', sub.project, half);
  kvRow(doc, M + 4 + half, y, 'Bus model', sub.busModel, half);
  y += 9;
  kvRow(doc, M + 4, y, 'VIN', sub.vin, half, true);
  kvRow(doc, M + 4 + half, y, 'Production line', sub.line, half);
  y += 9;
  kvRow(doc, M + 4, y, 'Station', sub.station, CW - 8);
  y += 16;

  // ── Operators + Timing ──
  y = sectionTitle(doc, y, 'Operators & timing');
  doc.setFillColor(...XLIT);
  doc.roundedRect(M, y, CW, 24, 1.5, 1.5, 'F');
  doc.setDrawColor(...DIM); doc.setLineWidth(0.15);
  doc.roundedRect(M, y, CW, 24, 1.5, 1.5, 'D');
  y += 4;
  const third = CW / 3;
  kvRow(doc, M + 4, y, 'Operators on duty', (sub.operators || []).join(', ') || '—', third + 10);
  kvRow(doc, M + 4 + third + 10, y, 'Clock in', fmtTime(sub.clockIn), third - 5);
  kvRow(doc, M + 4 + (third + 10) * 2 - 10, y, 'Clock out', fmtTime(sub.clockOut), third - 5);
  y += 10;

  // Timing pills
  const timeItems = [
    { label: 'Designed time', val: fmtDur(sub.designedTime), color: BLACK, bg: XLIT },
    { label: 'Actual time',   val: fmtDur(sub.actualTime),   color: BLACK, bg: XLIT },
    {
      label: 'Time status',
      val: sub.hasOverrun ? `+${sub.actualTime - sub.designedTime} min overrun` : 'Within designed time',
      color: sub.hasOverrun ? RED : GREEN,
      bg: sub.hasOverrun ? LTRED : LTGRN,
    },
  ];
  const pillW = CW / 3 - 2;
  timeItems.forEach(({ label, val, color, bg }, i) => {
    const px = M + i * (pillW + 3);
    const py = y - 1;
    doc.setFillColor(...bg); doc.roundedRect(px, py, pillW, 10, 1, 1, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MID);
    doc.text(label.toUpperCase(), px + 3, py + 4);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...color);
    doc.text(val, px + 3, py + 9);
  });
  y += 18;

  // ── Activities ──
  const acts = Object.entries(sub.activityStatuses || {});
  if (acts.length > 0) {
    y = sectionTitle(doc, y, 'Activities');
    const ROW_H = 7;
    const TH_H = 7;
    doc.setFillColor(254, 242, 242);
    doc.rect(M, y, CW, TH_H, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLACK);
    doc.text('ACTIVITY', M + 3, y + 5);
    doc.text('STATUS', W - M - 3, y + 5, { align: 'right' });
    y += TH_H;
    const statusLabel = { complete: '✔ Complete', incomplete: '⏳ Incomplete', issue: '⚠ Issue noted', rework: '↺ Rework', na: 'N/A', '': '—' };
    const statusColor = { complete: GREEN, incomplete: AMBER, issue: AMBER, rework: RED, na: MID, '': MID };
    acts.slice(0, 30).forEach(([act, st], i) => {
      doc.setFillColor(...(i % 2 === 0 ? WHITE : XLIT));
      doc.rect(M, y, CW, ROW_H, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...BLACK);
      const actLabel = doc.splitTextToSize(act, CW - 35);
      doc.text(actLabel[0] || act, M + 3, y + 5);
      const col = statusColor[st] || MID;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...col);
      doc.text(statusLabel[st] || st, W - M - 3, y + 5, { align: 'right' });
      doc.setDrawColor(...XLIT); doc.setLineWidth(0.15);
      doc.line(M, y + ROW_H, W - M, y + ROW_H);
      y += ROW_H;
    });
    y += 4;
  }

  // ── Consumables ──
  const consumables = [
    ...Object.entries(sub.resourcesUsed || {}).filter(([, v]) => v && v !== '0'),
    ...(sub.otherResources || []).map(c => [c.name, c.qty]),
  ];
  if (consumables.length > 0) {
    y = sectionTitle(doc, y, 'Consumables & materials used');
    const ROW_H = 7;
    doc.setFillColor(254, 242, 242);
    doc.rect(M, y, CW, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLACK);
    doc.text('ITEM', M + 3, y + 5);
    doc.text('QTY', W - M - 3, y + 5, { align: 'right' });
    y += 7;
    consumables.slice(0, 25).forEach(([name, qty], i) => {
      doc.setFillColor(...(i % 2 === 0 ? WHITE : XLIT));
      doc.rect(M, y, CW, ROW_H, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
      doc.text(String(name), M + 3, y + 5);
      doc.setFont('helvetica', 'bold');
      doc.text(String(qty), W - M - 3, y + 5, { align: 'right' });
      y += ROW_H;
    });
    y += 4;
  }

  // ── Overrun detail ──
  if (sub.hasOverrun && sub.overrun) {
    y = sectionTitle(doc, y, 'Overrun analysis');
    const ov = sub.overrun;
    const sel = ov.selMs || [];
    // One line per selected cause: "<detail> — <delay> min"
    const causeLines = sel.map(m => {
      const detail = ov.subCauses?.[m];
      const mins = ov.causeTimes?.[m];
      const t = (mins !== undefined && mins !== '' && mins !== null) ? `${mins} min` : null;
      return { label: m, value: [detail, t].filter(Boolean).join(' — ') || '—' };
    });
    const summedDelay = sel.reduce((tot, m) => tot + (Number(ov.causeTimes?.[m]) || 0), 0);

    // Dynamic box height based on the rows we'll draw.
    const rowCount = 1 /* root causes */ + causeLines.length
      + (summedDelay ? 1 : 0) + 1 /* corrective */ + (ov.comments ? 1 : 0);
    const boxH = 4 + rowCount * 9 + 2;
    doc.setFillColor(...LTRED);
    doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'F');
    doc.setDrawColor(...RED); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'D');
    y += 4;
    kvRow(doc, M + 4, y, 'Root causes', sel.join(', ') || '—', CW - 8, true);
    y += 9;
    causeLines.forEach(c => {
      kvRow(doc, M + 4, y, c.label, c.value, CW - 8);
      y += 9;
    });
    if (summedDelay) {
      kvRow(doc, M + 4, y, 'Total delay attributed', `${summedDelay} min of +${sub.actualTime - sub.designedTime} min overrun`, CW - 8, true);
      y += 9;
    }
    kvRow(doc, M + 4, y, 'Corrective action', ov.correctiveAction || '—', CW - 8);
    y += 9;
    if (ov.comments) {
      kvRow(doc, M + 4, y, 'Additional comments', ov.comments, CW - 8);
      y += 9;
    }
    y += 6;
  }

  // ── HSE ──
  if (sub.ohsIssue || sub.wasteGenerated) {
    y = sectionTitle(doc, y, 'Health, safety & environment');
    doc.setFillColor(...XLIT);
    doc.roundedRect(M, y, CW, 16, 1.5, 1.5, 'F');
    doc.setDrawColor(...DIM); doc.setLineWidth(0.15);
    doc.roundedRect(M, y, CW, 16, 1.5, 1.5, 'D');
    y += 4;
    if (sub.ohsIssue) kvRow(doc, M + 4, y, 'OHS issue', sub.ohsIssue, half);
    if (sub.wasteGenerated) kvRow(doc, M + 4 + half, y, 'Waste generated', sub.wasteGenerated, half);
    y += 18;
  }

  ftr();
  return doc;
}

// ── BUS REPORT PDF ─────────────────────────────────────────────────────────
export async function buildBusReportPDF(log, logoBase64) {
  const sorted = [...log].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const first  = sorted[0] || {};
  const totalActual   = sorted.reduce((a, s) => a + (s.actualTime   || 0), 0);
  const totalDesigned = sorted.reduce((a, s) => a + (s.designedTime || 0), 0);
  const overruns      = sorted.filter(s => s.hasOverrun);

  const half = CW / 2;
  const totalPages = 1 + Math.ceil(sorted.length / 18);
  const doc = makeDoc();

  // ── Cover / Summary page ──
  function hdr(pg) { drawHeader(doc, logoBase64, pg, totalPages, `VIN ${first.vin || '—'} — Full Bus Report`); }
  hdr(1);
  drawFooter(doc, null, null, null);
  let y = 27;

  // Ident
  doc.setFillColor(...XLIT);
  doc.roundedRect(M, y, CW, 30, 2, 2, 'F');
  doc.setDrawColor(RED[0], RED[1], RED[2]); doc.setLineWidth(0.5);
  doc.rect(M, y, 4, 30, 'F');
  y += 5;
  kvRow(doc, M + 8, y, 'VIN',       first.vin       || '—', half, true);
  kvRow(doc, M + 8 + half, y, 'Bus model', first.busModel || '—', half, true);
  y += 10;
  kvRow(doc, M + 8, y, 'Project',   first.project   || '—', half);
  kvRow(doc, M + 8 + half, y, 'Report generated', stamp(), half);
  y += 22;

  // Summary pills (3 wide)
  const pills = [
    { label: 'Stations completed', val: String(sorted.length),      color: BLACK, bg: XLIT },
    { label: 'Total actual time',  val: fmtDur(totalActual),        color: BLACK, bg: XLIT },
    { label: 'Total designed time',val: fmtDur(totalDesigned),      color: BLACK, bg: XLIT },
    { label: 'Total overruns',     val: String(overruns.length),     color: overruns.length ? RED : GREEN, bg: overruns.length ? LTRED : LTGRN },
    { label: 'Total overrun time', val: fmtDur(totalActual - totalDesigned), color: overruns.length ? RED : GREEN, bg: overruns.length ? LTRED : LTGRN },
    { label: 'Efficiency',
      val: totalDesigned > 0 ? `${Math.round((totalDesigned / Math.max(totalActual, 1)) * 100)}%` : '—',
      color: totalActual <= totalDesigned ? GREEN : RED,
      bg: totalActual <= totalDesigned ? LTGRN : LTRED },
  ];
  const pillW3 = CW / 3 - 3;
  pills.forEach(({ label, val, color, bg }, i) => {
    const px = M + (i % 3) * (pillW3 + 4.5);
    const py = y + Math.floor(i / 3) * 16;
    doc.setFillColor(...bg); doc.roundedRect(px, py, pillW3, 13, 1.5, 1.5, 'F');
    doc.setDrawColor(...DIM); doc.setLineWidth(0.1); doc.roundedRect(px, py, pillW3, 13, 1.5, 1.5, 'D');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MID);
    doc.text(label.toUpperCase(), px + 4, py + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...color);
    doc.text(val, px + 4, py + 11);
  });
  y += 38;

  // Station timeline table (on cover page, condensed)
  y = sectionTitle(doc, y, 'Station log');
  const ROW_H = 8.5;
  const TH_H = 7.5;
  const COLS = [
    { label: 'Station',       pct: 0.35 },
    { label: 'Code',          pct: 0.09 },
    { label: 'Clock in',      pct: 0.16 },
    { label: 'Actual (min)',  pct: 0.11 },
    { label: 'Designed',      pct: 0.11 },
    { label: 'Status',        pct: 0.18 },
  ];
  let cxArr = []; let cx = M;
  COLS.forEach(c => { cxArr.push(cx); cx += CW * c.pct; });

  doc.setFillColor(254, 242, 242);
  doc.rect(M, y, CW, TH_H, 'F');
  doc.setDrawColor(...RED); doc.setLineWidth(0.3);
  doc.line(M, y + TH_H, W - M, y + TH_H);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLACK);
  COLS.forEach((c, i) => doc.text(c.label.toUpperCase(), cxArr[i] + 2, y + 5.5));
  y += TH_H;

  const maxRowsPage1 = Math.floor((H - y - 22) / ROW_H);
  const page1Rows = sorted.slice(0, maxRowsPage1);
  const remainRows = sorted.slice(maxRowsPage1);

  function renderStationRows(rows, startY) {
    let ry = startY;
    rows.forEach((s, ri) => {
      doc.setFillColor(...(ri % 2 === 0 ? WHITE : XLIT));
      doc.rect(M, ry, CW, ROW_H, 'F');
      if (s.hasOverrun) { doc.setFillColor(254, 242, 242); doc.rect(M, ry, 2.5, ROW_H, 'F'); }
      doc.setDrawColor(...XLIT); doc.setLineWidth(0.1);
      doc.line(M, ry + ROW_H, W - M, ry + ROW_H);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
      const cells = [
        { text: (s.station || '').split(':').pop()?.trim() || s.station || '—', bold: false },
        { text: s.stationCode || '—',                                            bold: false },
        { text: s.clockIn ? new Date(s.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—', bold: false },
        { text: String(s.actualTime ?? '—'),  bold: true,  color: s.hasOverrun ? RED : BLACK },
        { text: String(s.designedTime ?? '—'), bold: false },
        { text: s.hasOverrun ? `+${(s.actualTime||0) - (s.designedTime||0)} min` : 'On time',
          bold: true, color: s.hasOverrun ? RED : GREEN },
      ];
      cells.forEach((cell, ci) => {
        const maxW = CW * COLS[ci].pct - 4;
        doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...(cell.color || BLACK));
        doc.text(doc.splitTextToSize(cell.text, maxW)[0] || '', cxArr[ci] + 2, ry + 5.5);
      });
      ry += ROW_H;
    });
    return ry;
  }

  y = renderStationRows(page1Rows, y);

  // Overflow pages
  if (remainRows.length > 0) {
    const perPage = Math.floor((H - 22 - 22 - TH_H) / ROW_H);
    const chunks = [];
    for (let i = 0; i < remainRows.length; i += perPage) chunks.push(remainRows.slice(i, i + perPage));
    chunks.forEach((chunk, pi) => {
      doc.addPage([W, H], 'portrait');
      hdr(pi + 2);
      drawFooter(doc, null, null, null);
      let py = 27;
      py = sectionTitle(doc, py, `Station log (continued)`);
      doc.setFillColor(254, 242, 242);
      doc.rect(M, py, CW, TH_H, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLACK);
      COLS.forEach((c, i) => doc.text(c.label.toUpperCase(), cxArr[i] + 2, py + 5.5));
      py += TH_H;
      renderStationRows(chunk, py);
    });
  }

  return doc;
}
