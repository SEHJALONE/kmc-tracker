import jsPDF from 'jspdf';
import { fetchLogoBase64 } from './exportHelpers.js';

// ── Palette ────────────────────────────────────────────────────────────────────
const RED   = [220, 38,  38 ];
const BLACK = [15,  23,  42 ];
const SLATE = [40,  40,  55 ];
const MID   = [100, 116, 139];
const DIM   = [148, 163, 184];
const WHITE = [255, 255, 255];
const XLIT  = [241, 245, 249];

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
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

function stamp() {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function pill(doc, x, y, text, rgb, light) {
  doc.setFillColor(...(light || rgb.map(v => Math.min(255, v + 180))));
  doc.roundedRect(x, y - 4, doc.getTextWidth(text) + 8, 6, 1.5, 1.5, 'F');
  doc.setTextColor(...rgb);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text(text, x + 4, y);
}

function section(doc, y, label) {
  doc.setFillColor(...XLIT);
  doc.rect(M, y, CW, 6, 'F');
  doc.setFillColor(...RED);
  doc.rect(M, y, 2.5, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text(label.toUpperCase(), M + 5, y + 4);
  return y + 9;
}

function metaRow(doc, y, label, value, xOffset = 0, wOverride) {
  const colW = wOverride || CW / 2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.setTextColor(...DIM);
  doc.text(label.toUpperCase(), M + xOffset, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  const lines = doc.splitTextToSize(value, colW - 4);
  doc.text(lines, M + xOffset, y + 4.5);
  return y + 4.5 + (lines.length - 1) * 4.5;
}

function bodyText(doc, y, text, indent = 0) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  const lines = doc.splitTextToSize(text || '—', CW - indent);
  doc.text(lines, M + indent, y);
  return y + lines.length * 4.8;
}

function drawPageChrome(doc, logo, pageNum, totalPages, ncrId, severityRgb) {
  // Severity colour left edge
  doc.setFillColor(...(severityRgb || RED));
  doc.rect(0, 0, 3, H, 'F');

  // Red top stripe
  doc.setFillColor(...RED);
  doc.rect(3, 0, W - 3, 3.5, 'F');

  // Header band
  doc.setFillColor(...XLIT);
  doc.rect(3, 3.5, W - 3, 18, 'F');

  // Logo
  if (logo) {
    try { doc.addImage(logo, 'PNG', M, 5, 22, 0); } catch {}
  }

  // Title
  const tx = logo ? M + 25 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BLACK);
  doc.text('NON-CONFORMANCE REPORT', tx, 12.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MID);
  doc.text('KMC.DQHSE.02/26-PR009 · Control of Non-Conformities · Kiira Motors Corporation', tx, 17.5);

  // NCR ID top-right
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...RED);
  doc.text(ncrId || 'NCR-XXXX', W - M, 12.5, { align: 'right' });

  // Page number bottom
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...DIM);
  doc.text(`Page ${pageNum} of ${totalPages}`, W - M, H - 5, { align: 'right' });
  doc.text(`Generated: ${stamp()}`, M, H - 5);

  // Bottom border
  doc.setDrawColor(...DIM); doc.setLineWidth(0.3);
  doc.line(M, H - 8, W - M, H - 8);
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function buildNCRPDF(ncr) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await fetchLogoBase64('/kmc logo 2.png');

  const sevRgb    = SEVERITY_RGB[ncr.severity]  || RED;
  const statRgb   = STATUS_RGB[ncr.status]       || MID;
  const totalPages = 1;

  drawPageChrome(doc, logo, 1, totalPages, ncr.id || ncr.ncrId, sevRgb);

  let y = 30;

  // ── Hero strip: NCR ID + status + severity ──────────────────────────────────
  doc.setFillColor(...WHITE);
  doc.roundedRect(M, y, CW, 18, 2, 2, 'F');
  doc.setDrawColor(...XLIT); doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, 18, 2, 2, 'S');

  // Severity left accent
  doc.setFillColor(...sevRgb);
  doc.roundedRect(M, y, 4, 18, 2, 2, 'F');
  doc.rect(M + 2, y, 2, 18, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...BLACK);
  doc.text(val(ncr.id || ncr.ncrId), M + 9, y + 8);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MID);
  doc.text(`Raised: ${fmtDate(ncr.date || ncr.timestamp)}`, M + 9, y + 13.5);

  // Status pill
  const statText = val(ncr.status);
  pill(doc, W - M - doc.getTextWidth(statText) - 14, y + 9, statText, statRgb);

  // Severity pill
  const sevText = val(ncr.severity);
  pill(doc, W - M - doc.getTextWidth(sevText) - doc.getTextWidth(statText) - 26, y + 9, sevText, sevRgb);

  y += 24;

  // ── Classification ──────────────────────────────────────────────────────────
  y = section(doc, y, 'Classification');

  const half = CW / 2 - 4;
  // Row 1
  metaRow(doc, y, 'Domain',   val(ncr.domain),   0,    half);
  metaRow(doc, y, 'NCR Type', val(ncr.ncrType),  CW/2, half);
  y += 13;
  // Row 2
  metaRow(doc, y, 'Disposition', val(ncr.disposition), 0,    half);
  metaRow(doc, y, 'RCA Method',  val(ncr.rcaMethod),   CW/2, half);
  y += 13;

  // ── Identification ──────────────────────────────────────────────────────────
  y = section(doc, y, 'Identification');
  metaRow(doc, y, 'VIN / Asset',  val(ncr.vin),         0,    half);
  metaRow(doc, y, 'Station Code', val(ncr.stationCode), CW/2, half);
  y += 13;
  metaRow(doc, y, 'Raised By',   val(ncr.raisedBy),  0,    half);
  metaRow(doc, y, 'Assigned To', val(ncr.assignedTo), CW/2, half);
  y += 13;
  metaRow(doc, y, 'Due Date',    fmtDate(ncr.dueDate),    0,    half);
  metaRow(doc, y, 'Closed Date', fmtDate(ncr.closedDate), CW/2, half);
  y += 14;

  // ── Description ─────────────────────────────────────────────────────────────
  y = section(doc, y, 'Non-Conformance Description');
  y = bodyText(doc, y, val(ncr.description));
  y += 6;

  // ── Root Cause ───────────────────────────────────────────────────────────────
  y = section(doc, y, 'Root Cause');
  y = bodyText(doc, y, val(ncr.rootCause));
  y += 6;

  // ── Corrective Action ────────────────────────────────────────────────────────
  y = section(doc, y, 'Corrective Action');
  y = bodyText(doc, y, val(ncr.correctiveAction));
  y += 6;

  // ── Preventive Action ────────────────────────────────────────────────────────
  if (y + 30 < H - 14) {
    y = section(doc, y, 'Preventive Action');
    y = bodyText(doc, y, val(ncr.preventiveAction));
    y += 6;
  }

  // ── Sign-off block ───────────────────────────────────────────────────────────
  if (y + 28 < H - 14) {
    y = Math.max(y, H - 55);
    doc.setFillColor(...XLIT);
    doc.roundedRect(M, y, CW, 26, 2, 2, 'F');

    const colW = CW / 3;
    ['Quality / HSE Representative', 'Production Manager', 'Date Verified'].forEach((lbl, i) => {
      const cx = M + i * colW + 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...DIM);
      doc.text(lbl.toUpperCase(), cx, y + 6);
      doc.setDrawColor(...DIM); doc.setLineWidth(0.3);
      doc.line(cx, y + 18, cx + colW - 8, y + 18);
    });
  }

  doc.save(`NCR-${(ncr.id || ncr.ncrId || 'report').replace(/\s+/g, '-')}.pdf`);
}

// ── Register summary export (multiple NCRs → one PDF) ─────────────────────────
export async function buildNCRRegisterPDF(ncrs, filterLabel = 'All NCRs') {
  if (!ncrs?.length) return;
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await fetchLogoBase64('/kmc logo 2.png');

  const rowH   = 9;
  const cols   = [
    { label: 'NCR ID',      key: 'id',          w: 28 },
    { label: 'Date',        key: 'date',        w: 22, fmt: fmtDate },
    { label: 'Domain',      key: 'domain',      w: 32 },
    { label: 'Type',        key: 'ncrType',     w: 20 },
    { label: 'Severity',    key: 'severity',    w: 20 },
    { label: 'Status',      key: 'status',      w: 26 },
    { label: 'Description', key: 'description', w: 52, truncate: 38 },
  ];
  const totalCW = cols.reduce((s, c) => s + c.w, 0);
  const scale   = CW / totalCW;
  cols.forEach(c => { c.w = c.w * scale; });

  let page = 1;
  const totalPages = Math.ceil(ncrs.length / 28) + 1;

  function newPage(isFirst) {
    if (!isFirst) doc.addPage();
    drawPageChrome(doc, logo, page++, totalPages, `Register — ${filterLabel}`, RED);
  }

  newPage(true);
  let y = 30;

  // Title block
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...BLACK);
  doc.text('Non-Conformance Register', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(`Filter: ${filterLabel}  ·  ${ncrs.length} record${ncrs.length !== 1 ? 's' : ''}  ·  Exported: ${stamp()}`, M, y);
  y += 8;

  // Summary pills
  const statCounts = {};
  ncrs.forEach(r => { statCounts[r.status] = (statCounts[r.status] || 0) + 1; });
  let px = M;
  Object.entries(statCounts).forEach(([s, n]) => {
    const rgb = STATUS_RGB[s] || MID;
    const txt = `${s}: ${n}`;
    pill(doc, px, y, txt, rgb);
    px += doc.getTextWidth(txt) + 14;
  });
  y += 8;

  // Table header
  doc.setFillColor(...BLACK);
  doc.rect(M, y, CW, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE);
  let cx = M + 2;
  cols.forEach(c => {
    doc.text(c.label, cx, y + 4.8);
    cx += c.w;
  });
  y += 7;

  // Rows
  ncrs.forEach((ncr, i) => {
    if (y + rowH > H - 14) { newPage(false); y = 28; }

    doc.setFillColor(...(i % 2 === 0 ? WHITE : XLIT));
    doc.rect(M, y, CW, rowH, 'F');

    const sevRgb = SEVERITY_RGB[ncr.severity] || MID;
    doc.setFillColor(...sevRgb);
    doc.rect(M, y, 2, rowH, 'F');

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    cx = M + 2;
    cols.forEach(c => {
      let text = c.fmt ? c.fmt(ncr[c.key]) : val(ncr[c.key]);
      if (c.truncate && text.length > c.truncate) text = text.slice(0, c.truncate) + '…';
      doc.text(text, cx + 1, y + 5.8);
      cx += c.w;
    });

    // Bottom rule
    doc.setDrawColor(...XLIT); doc.setLineWidth(0.2);
    doc.line(M, y + rowH, M + CW, y + rowH);
    y += rowH;
  });

  doc.save(`NCR-Register-${filterLabel.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.pdf`);
}
