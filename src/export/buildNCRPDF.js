import jsPDF from 'jspdf';
import { fetchLogoBase64 } from './exportHelpers.js';

// ── Palette ────────────────────────────────────────────────────────────────────
const RED    = [220, 38,  38 ];
const NAVY   = [15,  23,  42 ];
const SLATE  = [51,  65,  85 ];
const MID    = [100, 116, 139];
const DIM    = [148, 163, 184];
const RULE   = [220, 225, 230];
const WHITE  = [255, 255, 255];
const XLIT   = [248, 250, 252];
const BAND   = [241, 245, 249];

const SEVERITY_RGB = {
  Critical: [220, 38,  38 ],
  Major:    [217, 119, 6  ],
  Minor:    [16,  185, 129],
};
const STATUS_RGB = {
  'Open':                [217, 119, 6  ],
  'In Progress':         [59,  130, 246],
  'Closed':              [16,  185, 129],
  'Concession Approved': [139, 92,  246],
};

const W = 210, H = 297;
const M = 16;          // margin
const CW = W - M * 2;  // content width

// ── Utilities ─────────────────────────────────────────────────────────────────
function val(v) { return v && String(v).trim() ? String(v).trim() : '—'; }

function fmtDate(s) {
  if (!s || s === '—') return '—';
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(s); }
}

function stamp() {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Pill badge ────────────────────────────────────────────────────────────────
function pill(doc, x, y, text, rgb) {
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  const tw = doc.getTextWidth(text);
  const pw = tw + 10, ph = 5.5;
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.1);
  doc.roundedRect(x, y - ph + 1, pw, ph, 1.5, 1.5, 'F');
  doc.setTextColor(...WHITE);
  doc.text(text, x + 5, y - 0.5);
  return pw + 4;
}

// ── Ruled divider ─────────────────────────────────────────────────────────────
function rule(doc, y) {
  doc.setDrawColor(...RULE); doc.setLineWidth(0.25);
  doc.line(M, y, W - M, y);
  return y + 1;
}

// ── Section heading ────────────────────────────────────────────────────────────
function section(doc, y, label) {
  doc.setFillColor(...BAND);
  doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
  doc.rect(M, y, CW, 8, 'FD');
  // Red left accent
  doc.setFillColor(...RED);
  doc.rect(M, y, 3, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.setTextColor(...NAVY);
  doc.text(label.toUpperCase(), M + 7, y + 5.3);
  return y + 11;
}

// ── Meta cell — label above value, clean and airy ─────────────────────────────
function metaCell(doc, x, y, w, h, label, value, valRgb) {
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'FD');

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  doc.setTextColor(...DIM);
  doc.text(label.toUpperCase(), x + 4, y + 5);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(...(valRgb || SLATE));
  const lines = doc.splitTextToSize(val(value), w - 8);
  doc.text(lines[0] || '—', x + 4, y + 12);
}

// ── Full-width text block ──────────────────────────────────────────────────────
function textBlock(doc, y, text) {
  const lines = doc.splitTextToSize(val(text), CW - 10);
  const bh    = Math.max(14, lines.length * 5.5 + 8);
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
  doc.rect(M, y, CW, bh, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.setTextColor(...SLATE);
  doc.text(lines, M + 5, y + 7, { lineHeightFactor: 1.5 });
  return y + bh + 5;
}

// ── Page header ───────────────────────────────────────────────────────────────
function pageHeader(doc, logo, pageNum, totalPages, docRef) {
  // Full navy header band
  const hdrH = 24;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, hdrH, 'F');

  // Red bottom accent strip on header
  doc.setFillColor(...RED);
  doc.rect(0, hdrH, W, 1.5, 'F');

  // Logo — white space on navy, so use white/light logo if available, else just skip
  if (logo) {
    try { doc.addImage(logo, 'PNG', M, 4, 22, 0); } catch {}
  }

  // Title — centred in the header
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text('NON-CONFORMANCE REPORT', W / 2, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setTextColor(180, 190, 210);
  doc.text('Kiira Motors Corporation · KMC.DQHSE.02/26-PR009 · Control of Non-Conformities', W / 2, 17.5, { align: 'center' });

  // Page number right
  doc.setFontSize(7); doc.setTextColor(180, 190, 210);
  doc.text(`Page ${pageNum} / ${totalPages}`, W - M, 11, { align: 'right' });

  // Footer
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...DIM);
  doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
  doc.line(M, H - 9, W - M, H - 9);
  doc.text(`Generated: ${stamp()}`, M, H - 5);
  doc.text(docRef || '', W - M, H - 5, { align: 'right' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Single NCR report
// ══════════════════════════════════════════════════════════════════════════════
export async function buildNCRPDF(ncr) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await fetchLogoBase64('/kmc logo 2.png');  // white logo for navy header

  const sevRgb  = SEVERITY_RGB[ncr.severity] || RED;
  const statRgb = STATUS_RGB[ncr.status]     || MID;

  pageHeader(doc, logo, 1, 1, val(ncr.id || ncr.ncrId));

  let y = 30;

  // ── Hero identity block ───────────────────────────────────────────────────
  // NCR ID + date on the left, pills on the right
  doc.setFillColor(...XLIT);
  doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
  doc.rect(M, y, CW, 18, 'FD');

  // Severity left stripe
  doc.setFillColor(...sevRgb);
  doc.rect(M, y, 4, 18, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY);
  doc.text(val(ncr.id || ncr.ncrId), M + 9, y + 8);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(`Raised: ${fmtDate(ncr.date || ncr.timestamp)}`, M + 9, y + 14);

  // Pills right-aligned inside hero
  let px = W - M - 4;
  const statW = pill(doc, px - (doc.getTextWidth(val(ncr.status)) + 14), y + 12, val(ncr.status), statRgb);
  px -= statW + 10;
  pill(doc, px - (doc.getTextWidth(val(ncr.severity)) + 14), y + 12, val(ncr.severity), sevRgb);

  y += 22;

  // ── Classification ────────────────────────────────────────────────────────
  y = section(doc, y, 'Classification');
  const hw = CW / 2;
  const qw = CW / 4;
  const cellH = 16;

  // Row 1: Domain | NCR Type
  metaCell(doc, M,      y, hw, cellH, 'Domain',      ncr.domain);
  metaCell(doc, M + hw, y, hw, cellH, 'NCR Type',    ncr.ncrType);
  y += cellH;

  // Row 2: Severity | Disposition
  metaCell(doc, M,      y, hw, cellH, 'Severity',    ncr.severity,    sevRgb);
  metaCell(doc, M + hw, y, hw, cellH, 'Disposition', ncr.disposition);
  y += cellH;

  // Row 3: RCA Method | Status
  metaCell(doc, M,      y, hw, cellH, 'RCA Method',  ncr.rcaMethod);
  metaCell(doc, M + hw, y, hw, cellH, 'Status',      ncr.status,      statRgb);
  y += cellH + 6;

  // ── Identification ────────────────────────────────────────────────────────
  y = section(doc, y, 'Identification');

  // Row 1: VIN (half) | Station Code (quarter) | Raised By (quarter)
  metaCell(doc, M,           y, hw,   cellH, 'VIN / Asset',  ncr.vin);
  metaCell(doc, M + hw,      y, qw,   cellH, 'Station Code', ncr.stationCode);
  metaCell(doc, M + hw + qw, y, qw,   cellH, 'Raised By',    ncr.raisedBy);
  y += cellH;

  // Row 2: Assigned To (half) | Due Date (quarter) | Closed Date (quarter)
  metaCell(doc, M,           y, hw,   cellH, 'Assigned To',  ncr.assignedTo);
  metaCell(doc, M + hw,      y, qw,   cellH, 'Due Date',     fmtDate(ncr.dueDate));
  metaCell(doc, M + hw + qw, y, qw,   cellH, 'Closed Date',  fmtDate(ncr.closedDate));
  y += cellH + 6;

  // ── Text sections ──────────────────────────────────────────────────────────
  y = section(doc, y, 'Non-Conformance Description');
  y = textBlock(doc, y, ncr.description);

  y = section(doc, y, 'Root Cause');
  y = textBlock(doc, y, ncr.rootCause);

  y = section(doc, y, 'Corrective Action');
  y = textBlock(doc, y, ncr.correctiveAction);

  if (y + 30 < H - 28) {
    y = section(doc, y, 'Preventive Action');
    y = textBlock(doc, y, ncr.preventiveAction);
  }

  // ── Sign-off ───────────────────────────────────────────────────────────────
  const signY = Math.max(y + 6, H - 50);
  if (signY + 30 < H - 12) {
    rule(doc, signY);
    const cols = ['Quality / HSE Representative', 'Production Manager', 'Date'];
    const sw   = CW / 3;
    cols.forEach((lbl, i) => {
      const sx = M + i * sw;
      doc.setFillColor(...XLIT);
      doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
      doc.rect(sx, signY + 2, sw, 22, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...DIM);
      doc.text(lbl.toUpperCase(), sx + 4, signY + 8);
      doc.setDrawColor(...MID); doc.setLineWidth(0.4);
      doc.line(sx + 5, signY + 20, sx + sw - 5, signY + 20);
    });
  }

  doc.save(`NCR-${(ncr.id || ncr.ncrId || 'report').replace(/\s+/g, '-')}.pdf`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Register export (multiple NCRs, paginated)
// ══════════════════════════════════════════════════════════════════════════════
export async function buildNCRRegisterPDF(ncrs, filterLabel = 'All NCRs') {
  if (!ncrs?.length) return;
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await fetchLogoBase64('/kmc logo 2.png');

  // Column definitions — widths are relative, scaled to fit CW
  const cols = [
    { label: 'NCR ID',      key: 'id',          w: 25 },
    { label: 'Date',        key: 'timestamp',    w: 22, fmt: fmtDate },
    { label: 'Domain',      key: 'domain',       w: 28 },
    { label: 'Type',        key: 'ncrType',      w: 20 },
    { label: 'Severity',    key: 'severity',     w: 18 },
    { label: 'Status',      key: 'status',       w: 24 },
    { label: 'Description', key: 'description',  w: 43, truncate: 38 },
  ];
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  cols.forEach(c => { c.sw = (c.w / totalW) * CW; });

  const rowH = 9;
  let page = 1;
  const totalPages = Math.ceil(ncrs.length / 25) + 1;

  function newPage(isFirst) {
    if (!isFirst) doc.addPage();
    pageHeader(doc, logo, page++, totalPages, filterLabel);
  }

  function drawTableHeader(y) {
    doc.setFillColor(...NAVY);
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.1);
    doc.rect(M, y, CW, 8, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE);
    let cx = M;
    cols.forEach((c, i) => {
      doc.text(c.label, cx + 3, y + 5.3);
      if (i < cols.length - 1) {
        doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.15);
        doc.line(cx + c.sw, y + 1, cx + c.sw, y + 7);
      }
      cx += c.sw;
    });
    return y + 8;
  }

  newPage(true);
  let y = 30;

  // ── Page title + summary ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY);
  doc.text('Non-Conformance Register', M, y); y += 7;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(
    `Filter: ${filterLabel}  ·  ${ncrs.length} record${ncrs.length !== 1 ? 's' : ''}  ·  Exported: ${stamp()}`,
    M, y
  );
  y += 6;

  // ── Status summary pills ───────────────────────────────────────────────────
  const counts = {};
  ncrs.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  let px = M;
  doc.setFontSize(7.5);
  Object.entries(counts).forEach(([s, n]) => {
    const rgb = STATUS_RGB[s] || MID;
    px += pill(doc, px, y + 4.5, `${s}: ${n}`, rgb) - 2;
  });
  y += 10;

  rule(doc, y); y += 4;

  // ── Table ──────────────────────────────────────────────────────────────────
  y = drawTableHeader(y);

  ncrs.forEach((ncr, i) => {
    if (y + rowH > H - 14) {
      newPage(false);
      y = 30;
      y = drawTableHeader(y);
    }

    // Alternating row background
    doc.setFillColor(...(i % 2 === 0 ? WHITE : XLIT));
    doc.setDrawColor(...RULE); doc.setLineWidth(0.15);
    doc.rect(M, y, CW, rowH, 'FD');

    // Severity left accent strip
    const sevRgb = SEVERITY_RGB[ncr.severity] || MID;
    doc.setFillColor(...sevRgb);
    doc.rect(M, y, 2.5, rowH, 'F');

    let cx = M + 2.5;
    cols.forEach((c, ci) => {
      let text = c.fmt ? c.fmt(ncr[c.key]) : val(ncr[c.key]);
      if (c.truncate && text !== '—' && text.length > c.truncate) {
        text = text.slice(0, c.truncate) + '…';
      }

      const isSev    = c.key === 'severity';
      const isStat   = c.key === 'status';
      const colorRgb = isSev  ? (SEVERITY_RGB[text] || null)
                     : isStat ? (STATUS_RGB[text]    || null)
                     : null;

      doc.setFont('helvetica', colorRgb ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...(colorRgb || SLATE));
      doc.text(text, cx + 3, y + 6);

      // vertical divider
      if (ci < cols.length - 1) {
        doc.setDrawColor(...RULE); doc.setLineWidth(0.15);
        doc.line(cx + c.sw, y, cx + c.sw, y + rowH);
      }
      cx += c.sw;
    });

    y += rowH;
  });

  // Closing bottom border
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.4);
  doc.line(M, y, M + CW, y);

  doc.save(`NCR-Register-${filterLabel.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
