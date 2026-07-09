import jsPDF from 'jspdf';
import { fetchLogoBase64 } from './exportHelpers.js';

// ── Palette ────────────────────────────────────────────────────────────────────
const RED   = [220, 38,  38 ];
const BLACK = [15,  23,  42 ];
const SLATE = [40,  40,  55 ];
const MID   = [100, 116, 139];
const DIM   = [148, 163, 184];
const RULE  = [210, 215, 220];
const WHITE = [255, 255, 255];
const XLIT  = [247, 249, 251];
const HDR   = [30,  41,  59 ];   // dark navy table header

const SEVERITY_RGB = {
  Critical: [220, 38,  38 ],
  Major:    [245, 158, 11 ],
  Minor:    [16,  185, 129],
};
const STATUS_RGB = {
  'Open':                [245, 158, 11 ],
  'In Progress':         [59,  130, 246],
  'Closed':              [16,  185, 129],
  'Concession Approved': [139, 92,  246],
};

const W = 210, H = 297;
const M = 14;
const CW = W - M * 2;

function val(v) { return v && String(v).trim() ? String(v).trim() : '—'; }

function fmtDate(s) {
  if (!s || s === '—') return '—';
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

function stamp() {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Bordered pill ──────────────────────────────────────────────────────────────
function pill(doc, x, y, text, rgb) {
  const tw = doc.getTextWidth(text);
  doc.setFillColor(rgb[0], rgb[1], rgb[2], 0.12);
  doc.setDrawColor(...rgb);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y - 3.8, tw + 8, 5.5, 1.2, 1.2, 'FD');
  doc.setTextColor(...rgb);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text(text, x + 4, y);
  return tw + 12;
}

// ── Section heading bar ────────────────────────────────────────────────────────
function section(doc, y, label) {
  doc.setFillColor(...XLIT);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.rect(M, y, CW, 7, 'FD');
  doc.setFillColor(...RED);
  doc.rect(M, y, 3, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.setTextColor(...HDR);
  doc.text(label.toUpperCase(), M + 6, y + 4.8);
  return y + 10;
}

// ── Two-column meta grid cell ──────────────────────────────────────────────────
function metaCell(doc, x, y, w, label, value) {
  // border
  doc.setDrawColor(...RULE); doc.setLineWidth(0.25);
  doc.rect(x, y, w, 12, 'S');
  // label
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  doc.setTextColor(...DIM);
  doc.text(label.toUpperCase(), x + 3, y + 4);
  // value
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  const lines = doc.splitTextToSize(value, w - 6);
  doc.text(lines[0] || '—', x + 3, y + 9);
}

// ── Body text block ────────────────────────────────────────────────────────────
function bodyBlock(doc, y, text) {
  doc.setDrawColor(...RULE); doc.setLineWidth(0.25);
  const lines = doc.splitTextToSize(val(text), CW - 10);
  const bh    = Math.max(12, lines.length * 5 + 6);
  doc.setFillColor(...WHITE);
  doc.rect(M, y, CW, bh, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(lines, M + 4, y + 5.5, { lineHeightFactor: 1.4 });
  return y + bh + 4;
}

// ── Page chrome (header + footer) ─────────────────────────────────────────────
function drawPageChrome(doc, logo, pageNum, totalPages, rightLabel, sevRgb) {
  // Left severity stripe
  doc.setFillColor(...(sevRgb || RED));
  doc.rect(0, 0, 3.5, H, 'F');

  // Top red bar
  doc.setFillColor(...RED);
  doc.rect(3.5, 0, W - 3.5, 4, 'F');

  // Header background
  doc.setFillColor(255, 255, 255);
  doc.rect(3.5, 4, W - 3.5, 18, 'F');

  // Bottom header rule
  doc.setDrawColor(...RULE); doc.setLineWidth(0.5);
  doc.line(3.5, 22, W, 22);

  // Logo — black version
  if (logo) {
    try { doc.addImage(logo, 'PNG', M, 5.5, 24, 0); } catch {}
  }

  // Title
  const tx = logo ? M + 27 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...BLACK);
  doc.text('NON-CONFORMANCE REPORT', tx, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MID);
  doc.text('KMC.DQHSE.02/26-PR009 · Control of Non-Conformities · Kiira Motors Corporation', tx, 18.5);

  // Right label
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...RED);
  doc.text(rightLabel || '', W - M, 13, { align: 'right' });

  // Footer
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...DIM);
  doc.line(M, H - 9, W - M, H - 9);
  doc.text(`Generated: ${stamp()}`, M, H - 5);
  doc.text(`Page ${pageNum} of ${totalPages}`, W - M, H - 5, { align: 'right' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Single NCR report
// ══════════════════════════════════════════════════════════════════════════════
export async function buildNCRPDF(ncr) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await fetchLogoBase64('/kmc logo.png');   // black logo

  const sevRgb  = SEVERITY_RGB[ncr.severity] || RED;
  const statRgb = STATUS_RGB[ncr.status]     || MID;

  drawPageChrome(doc, logo, 1, 1, val(ncr.id || ncr.ncrId), sevRgb);

  let y = 27;

  // ── Hero banner ─────────────────────────────────────────────────────────────
  doc.setFillColor(...XLIT);
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
  doc.rect(M, y, CW, 16, 'FD');
  // left colour tab
  doc.setFillColor(...sevRgb);
  doc.rect(M, y, 4, 16, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...BLACK);
  doc.text(val(ncr.id || ncr.ncrId), M + 8, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(`Raised: ${fmtDate(ncr.date || ncr.timestamp)}`, M + 8, y + 12.5);

  // pills right-aligned
  doc.setFontSize(7.5);
  let px = W - M - 4;
  const statText = val(ncr.status);
  const statW = doc.getTextWidth(statText) + 12;
  px -= statW;
  pill(doc, px, y + 8.5, statText, statRgb);
  px -= 4;
  const sevText = val(ncr.severity);
  const sevW = doc.getTextWidth(sevText) + 12;
  px -= sevW;
  pill(doc, px, y + 8.5, sevText, sevRgb);

  y += 20;

  // ── Classification grid ──────────────────────────────────────────────────────
  y = section(doc, y, 'Classification');
  const hw = CW / 2;
  metaCell(doc, M,      y, hw,  'Domain',      val(ncr.domain));
  metaCell(doc, M + hw, y, hw,  'NCR Type',    val(ncr.ncrType));
  y += 12;
  metaCell(doc, M,      y, hw,  'Severity',    val(ncr.severity));
  metaCell(doc, M + hw, y, hw,  'Disposition', val(ncr.disposition));
  y += 12;
  metaCell(doc, M,      y, hw,  'RCA Method',  val(ncr.rcaMethod));
  metaCell(doc, M + hw, y, hw,  'Status',      val(ncr.status));
  y += 16;

  // ── Identification grid ──────────────────────────────────────────────────────
  y = section(doc, y, 'Identification');
  const qw = CW / 4;
  metaCell(doc, M,          y, qw * 2, 'VIN / Asset',  val(ncr.vin));
  metaCell(doc, M + qw * 2, y, qw,     'Station Code', val(ncr.stationCode));
  metaCell(doc, M + qw * 3, y, qw,     'Project',      val(ncr.project));
  y += 12;
  metaCell(doc, M,          y, hw,     'Raised By',    val(ncr.raisedBy));
  metaCell(doc, M + hw,     y, hw,     'Assigned To',  val(ncr.assignedTo));
  y += 12;
  metaCell(doc, M,          y, hw,     'Due Date',     fmtDate(ncr.dueDate));
  metaCell(doc, M + hw,     y, hw,     'Closed Date',  fmtDate(ncr.closedDate));
  y += 16;

  // ── Text sections ────────────────────────────────────────────────────────────
  y = section(doc, y, 'Non-Conformance Description');
  y = bodyBlock(doc, y, ncr.description);

  y = section(doc, y, 'Root Cause');
  y = bodyBlock(doc, y, ncr.rootCause);

  y = section(doc, y, 'Corrective Action');
  y = bodyBlock(doc, y, ncr.correctiveAction);

  if (y + 24 < H - 22) {
    y = section(doc, y, 'Preventive Action');
    y = bodyBlock(doc, y, ncr.preventiveAction);
  }

  // ── Sign-off table ───────────────────────────────────────────────────────────
  const signY = Math.max(y + 4, H - 52);
  if (signY + 30 < H - 12) {
    y = section(doc, signY, 'Authorisation');
    const sw = CW / 3;
    const sigH = 22;
    ['Quality / HSE Representative', 'Production Manager', 'Date'].forEach((lbl, i) => {
      const sx = M + i * sw;
      doc.setDrawColor(...RULE); doc.setLineWidth(0.25);
      doc.rect(sx, y, sw, sigH, 'S');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...DIM);
      doc.text(lbl.toUpperCase(), sx + 3, y + 5);
      // signature line
      doc.setDrawColor(...SLATE); doc.setLineWidth(0.4);
      doc.line(sx + 4, y + 17, sx + sw - 4, y + 17);
    });
  }

  doc.save(`NCR-${(ncr.id || ncr.ncrId || 'report').replace(/\s+/g, '-')}.pdf`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Register summary (multiple NCRs, paginated)
// ══════════════════════════════════════════════════════════════════════════════
export async function buildNCRRegisterPDF(ncrs, filterLabel = 'All NCRs') {
  if (!ncrs?.length) return;
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await fetchLogoBase64('/kmc logo.png');   // black logo

  const rowH = 8.5;
  const cols = [
    { label: 'NCR ID',      key: 'id',          w: 26 },
    { label: 'Date',        key: 'date',         w: 22, fmt: fmtDate },
    { label: 'Domain',      key: 'domain',       w: 30 },
    { label: 'Type',        key: 'ncrType',      w: 20 },
    { label: 'Severity',    key: 'severity',     w: 20 },
    { label: 'Status',      key: 'status',       w: 26 },
    { label: 'Description', key: 'description',  w: 56, truncate: 42 },
  ];
  const totalCW = cols.reduce((s, c) => s + c.w, 0);
  const scale   = CW / totalCW;
  cols.forEach(c => { c.scaledW = c.w * scale; });

  let page       = 1;
  const perPage  = 26;
  const totalPages = Math.ceil(ncrs.length / perPage) + 1;

  function newPage(isFirst) {
    if (!isFirst) doc.addPage();
    drawPageChrome(doc, logo, page++, totalPages, filterLabel, RED);
  }

  newPage(true);
  let y = 27;

  // ── Title ────────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...BLACK);
  doc.text('Non-Conformance Register', M, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(`Filter: ${filterLabel}  ·  ${ncrs.length} record${ncrs.length !== 1 ? 's' : ''}  ·  Exported: ${stamp()}`, M, y);
  y += 7;

  // ── Status summary pills ─────────────────────────────────────────────────────
  const statCounts = {};
  ncrs.forEach(r => { statCounts[r.status] = (statCounts[r.status] || 0) + 1; });
  let px = M;
  doc.setFontSize(7.5);
  Object.entries(statCounts).forEach(([s, n]) => {
    const rgb = STATUS_RGB[s] || MID;
    const txt = `${s}: ${n}`;
    const tw  = doc.getTextWidth(txt) + 12;
    pill(doc, px, y, txt, rgb);
    px += tw + 2;
  });
  y += 8;

  // ── Table header ─────────────────────────────────────────────────────────────
  doc.setFillColor(...HDR);
  doc.rect(M, y, CW, 7.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE);
  let cx = M;
  cols.forEach(c => {
    doc.text(c.label, cx + 3, y + 5);
    cx += c.scaledW;
  });
  // vertical dividers in header
  doc.setDrawColor(255, 255, 255, 0.3); doc.setLineWidth(0.2);
  cx = M;
  cols.forEach((c, i) => {
    cx += c.scaledW;
    if (i < cols.length - 1) doc.line(cx, y, cx, y + 7.5);
  });
  y += 7.5;

  // ── Rows ─────────────────────────────────────────────────────────────────────
  ncrs.forEach((ncr, i) => {
    if (y + rowH > H - 14) {
      // repeat header on new page
      newPage(false);
      y = 27;
      doc.setFillColor(...HDR);
      doc.rect(M, y, CW, 7.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE);
      cx = M;
      cols.forEach(c => { doc.text(c.label, cx + 3, y + 5); cx += c.scaledW; });
      y += 7.5;
    }

    const isEven = i % 2 === 0;
    doc.setFillColor(...(isEven ? WHITE : XLIT));
    doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
    doc.rect(M, y, CW, rowH, 'FD');

    // Severity left accent
    const sevRgb = SEVERITY_RGB[ncr.severity] || MID;
    doc.setFillColor(...sevRgb);
    doc.rect(M, y, 2.5, rowH, 'F');

    // Cell content + vertical dividers
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    cx = M + 2.5;
    cols.forEach((c, ci) => {
      let text = c.fmt ? c.fmt(ncr[c.key]) : val(ncr[c.key]);
      if (c.truncate && text !== '—' && text.length > c.truncate) text = text.slice(0, c.truncate) + '…';

      // colour-code severity and status cells
      if (c.key === 'severity' && SEVERITY_RGB[text]) doc.setTextColor(...SEVERITY_RGB[text]);
      else if (c.key === 'status' && STATUS_RGB[text]) doc.setTextColor(...STATUS_RGB[text]);
      else doc.setTextColor(...SLATE);

      doc.setFont('helvetica', c.key === 'severity' || c.key === 'status' ? 'bold' : 'normal');
      doc.text(text, cx + 2, y + 5.6);

      // vertical divider
      if (ci < cols.length - 1) {
        doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
        doc.line(cx + c.scaledW, y, cx + c.scaledW, y + rowH);
      }
      cx += c.scaledW;
    });

    y += rowH;
  });

  // closing border
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
  doc.line(M, y, M + CW, y);

  doc.save(`NCR-Register-${filterLabel.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0,10)}.pdf`);
}
