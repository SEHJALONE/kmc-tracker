import { jsPDF } from 'jspdf';
import {
  REPORT_WORKSHOPS, buildReportModel, busLabel, longDate, shortDate,
} from './productionReportModel';
import { addCanvasPaged } from './pdfImagePager';

// ── KMC Production Report (PDF) ──────────────────────────────────────────
// Renders "Poduction Report Template.docx" as a landscape A4 PDF:
//
//   cover    artwork, with the reporting month and year in the gap between
//            the title block and the confidentiality statement
//   p2       Document Version History — Reference No., Issue Date and Last
//            Review Date come from the preliminary form
//   p3–p5    the three scoreboard pages, one per page
//   annex    Annex A — workshop start/end dates for the buses completed in
//            the reporting month
//
// Everything typeset here is Times New Roman 12pt black on white, and the
// Annex is drawn with hairline black rules and no fills. The only colour in
// the document is the cover art and the embedded board captures.

const PAGE = { w: 297, h: 210 };
const MARGIN = 25.4;                       // the template's 1in margins
const CONTENT_W = PAGE.w - MARGIN * 2;
const TOP = MARGIN;
const BOTTOM = PAGE.h - MARGIN;            // page numbers live below this
const BODY_PT = 12;
const LINE_W = 0.3;
const PT_MM = 0.3528;
const LEAD = 1.22;

// Cover art is 2000×1414; its title block ends at 34.4% of the height and the
// confidentiality statement starts at 63.4%, both centred on the 22.7% column
// — measured off the file. The month sits on the midpoint of that gap.
const COVER = { src: '/report-cover.png', textX: 67.5, textY: 102, pt: 22 };
const LOGO_SRC = '/report-logo.png';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

// ── flowing-layout helper ───────────────────────────────────────────────
// jsPDF has no concept of a text flow, so this walks a y-cursor down the page
// and breaks to a new one whenever the next block would not fit.
class Flow {
  constructor(pdf) {
    this.pdf = pdf;
    this.y = TOP;
  }

  newPage() { this.pdf.addPage(); this.y = TOP; return this; }

  need(h) { if (this.y + h > BOTTOM) this.newPage(); return this; }

  font(bold = false, pt = BODY_PT) {
    this.pdf.setFont('times', bold ? 'bold' : 'normal');
    this.pdf.setFontSize(pt);
    this.pdf.setTextColor(0);
    return this;
  }

  lines(text, w, bold = false, pt = BODY_PT) {
    this.font(bold, pt);
    return this.pdf.splitTextToSize(String(text ?? ''), w);
  }

  heading(text, pt = 14) {
    const lh = pt * PT_MM * LEAD;
    this.need(lh + 6);
    this.y += 2;
    this.font(true, pt);
    this.pdf.text(text, MARGIN, this.y + lh * 0.78);
    this.y += lh + 3;
    return this;
  }

  para(text, { bold = false, pt = BODY_PT, gapAfter = 3 } = {}) {
    const lh = pt * PT_MM * LEAD;
    this.lines(text, CONTENT_W, bold, pt).forEach(ln => {
      this.need(lh);
      this.font(bold, pt);
      this.pdf.text(ln, MARGIN, this.y + lh * 0.78);
      this.y += lh;
    });
    this.y += gapAfter;
    return this;
  }

  /**
   * Colourless table: black hairline rules, no fills, Times.
   * @param {string[]} head    header labels
   * @param {Array[]}  rows    cell text, row-major
   * @param {number[]} widths  relative column widths
   * @param {string[]} aligns  'left' | 'center' | 'right' per column
   */
  table(head, rows, widths, aligns = [], { bodyPt = BODY_PT } = {}) {
    const pdf = this.pdf;
    const total = widths.reduce((a, b) => a + b, 0);
    const w = widths.map(x => (x / total) * CONTENT_W);
    const xs = w.reduce((acc, c, i) => [...acc, acc[i] + c], [MARGIN]);
    const lh = bodyPt * PT_MM * LEAD;
    const pad = 1.6;

    const measure = (cells, bold) => {
      let h = 0;
      cells.forEach((c, i) => {
        const n = this.lines(c, w[i] - 2 * pad - 1, bold, bodyPt).length;
        h = Math.max(h, n * lh);
      });
      return h + 2 * pad;
    };
    const draw = (cells, y, h, bold) => {
      pdf.setDrawColor(0);
      pdf.setLineWidth(LINE_W);
      cells.forEach((c, i) => {
        pdf.rect(xs[i], y, w[i], h);
        const ls = this.lines(c, w[i] - 2 * pad - 1, bold, bodyPt);
        const al = aligns[i] || 'left';
        const tx = al === 'center' ? xs[i] + w[i] / 2 : al === 'right' ? xs[i] + w[i] - pad : xs[i] + pad;
        let ty = y + (h - ls.length * lh) / 2 + lh * 0.76;
        ls.forEach(ln => {
          pdf.text(ln, tx, ty, al === 'left' ? undefined : { align: al });
          ty += lh;
        });
      });
    };

    const headH = measure(head, true);
    this.need(headH + measure(rows[0] || head, false));
    draw(head, this.y, headH, true);
    this.y += headH;

    rows.forEach(r => {
      const h = measure(r, false);
      if (this.y + h > BOTTOM) {
        this.newPage();
        draw(head, this.y, headH, true);      // repeat the header on each page
        this.y += headH;
      }
      draw(r, this.y, h, false);
      this.y += h;
    });
    this.y += 4;
    return this;
  }

  // A captured scoreboard page. Scaled to the full print width and split
  // across as many PDF pages as it needs, so every page is filled instead of
  // a tall capture being squeezed onto one page with wide side margins. All
  // three board pages land at the same scale (contentW / canvas.width).
  boardPage(canvas) {
    if (!canvas) return this;
    addCanvasPaged(this.pdf, canvas, { margin: 10, top: 10, bottom: 16, newPageFirst: true });
    this.y = BOTTOM;                       // force the next block onto a fresh page
    return this;
  }
}

// Default document reference, matching the one printed on the board header:
// KMC.DPN.<MM>/<YY>-REG004, keyed off the reporting month.
export function defaultReference(month) {
  const m = /^(\d{4})-(\d{2})/.exec(String(month || '').trim());
  const now = new Date();
  const mm = m ? m[2] : String(now.getMonth() + 1).padStart(2, '0');
  const yy = m ? m[1].slice(-2) : String(now.getFullYear()).slice(-2);
  return `KMC.DPN.${mm}/${yy}-REG004`;
}

// ── cover ───────────────────────────────────────────────────────────────
function drawCover(pdf, coverImg, model) {
  if (coverImg) pdf.addImage(coverImg, 'PNG', 0, 0, PAGE.w, PAGE.h);
  pdf.setTextColor(0);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(COVER.pt);
  pdf.text(model.monthUpper, COVER.textX, COVER.textY, { align: 'center' });
}

// ── Document Version History ────────────────────────────────────────────
// The template's 4-column grid: a logo cell merged down the first six rows, a
// label column, and a value column spanning the last two, then the version /
// approval strip. Reference No., Issue Date and Last Review Date are the
// cells left blank in the template and filled from the preliminary form.
function drawVersionHistory(flow, logoImg, meta) {
  const pdf = flow.pdf;
  flow.font(true, BODY_PT);
  pdf.text('Document Version History', MARGIN, flow.y + 4);
  flow.y += 8;

  const colW = [0.219, 0.272, 0.248, 0.261].map(f => CONTENT_W * f);
  const colX = colW.reduce((acc, w, i) => [...acc, acc[i] + w], [MARGIN]);
  const infoRows = [
    ['DOCUMENT DESCRIPTION', 'PRODUCTION REPORT'],
    ['REFERENCE NO:', meta.referenceNo],
    ['PREPARED BY:', meta.preparedBy],
    ['DOCUMENT OWNER:', meta.documentOwner],
    ['ISSUE DATE:', meta.issueDateLabel],
    ['LAST REVIEW DATE:', meta.lastReviewLabel],
  ];
  const infoH = 11;
  const blockTop = flow.y;

  const cell = (text, x, y, w, h, bold, align = 'left') => {
    pdf.setDrawColor(0); pdf.setLineWidth(LINE_W);
    pdf.rect(x, y, w, h);
    const ls = flow.lines(text, w - 4, bold);
    const lh = BODY_PT * PT_MM * LEAD;
    let ty = y + (h - ls.length * lh) / 2 + lh * 0.76;
    ls.forEach(ln => {
      const tx = align === 'center' ? x + w / 2 : x + 2;
      pdf.text(ln, tx, ty, align === 'center' ? { align: 'center' } : undefined);
      ty += lh;
    });
  };

  infoRows.forEach(([label, value], i) => {
    const ry = blockTop + i * infoH;
    cell(label, colX[1], ry, colW[1], infoH, true);
    cell(value || '', colX[2], ry, colW[2] + colW[3], infoH, false);
  });

  const blockH = infoRows.length * infoH;
  pdf.rect(colX[0], blockTop, colW[0], blockH);
  if (logoImg) {
    const lw = Math.min(colW[0] - 10, 44);
    const lh = lw * (logoImg.naturalHeight / logoImg.naturalWidth);
    pdf.addImage(logoImg, 'PNG', colX[0] + (colW[0] - lw) / 2, blockTop + (blockH - lh) / 2, lw, lh);
  }
  flow.y = blockTop + blockH;

  const headH = 11;
  ['VERSION NO.', 'NEXT REVIEW DATE:', 'PREPARED BY', 'APPROVED BY']
    .forEach((h, i) => cell(h, colX[i], flow.y, colW[i], headH, true, 'center'));
  flow.y += headH;

  const signH = 32;
  colW.forEach((w, i) => { pdf.setDrawColor(0); pdf.rect(colX[i], flow.y, w, signH); });
  cell(meta.versionNo, colX[0], flow.y, colW[0], signH, false, 'center');
  cell(meta.nextReview, colX[1], flow.y, colW[1], signH, false, 'center');

  const signBlock = (ci, name, title) => {
    const cx = colX[ci] + colW[ci] / 2;
    pdf.setDrawColor(0); pdf.setLineWidth(LINE_W);
    pdf.line(colX[ci] + 8, flow.y + signH / 2, colX[ci] + colW[ci] - 8, flow.y + signH / 2);
    flow.font(false, BODY_PT);
    pdf.text(name, cx, flow.y + signH / 2 + 6.5, { align: 'center' });
    pdf.text(title, cx, flow.y + signH / 2 + 12.5, { align: 'center' });
  };
  signBlock(2, meta.preparedByName, meta.preparedByTitle);
  signBlock(3, meta.approvedByName, meta.approvedByTitle);
  flow.y += signH;
}

// ── Annex A ─────────────────────────────────────────────────────────────
// Actual start and end date per workshop, one row per bus either completed
// in the reporting month or still in progress during it (a STATUS column
// tells them apart — an in-progress row's later End cells are naturally
// blank). A dash means the bus has no recorded date for that shop.
function drawAnnexure(flow, model) {
  flow.newPage();
  flow.heading('ANNEXURE');
  flow.para('Annex A: Completion Dates for the Different Kayoola Buses in the Different Workshops',
    { bold: true });

  const head = ['BUS', 'STATUS'];
  REPORT_WORKSHOPS.forEach(w => { head.push(`${w.short} – Start`, `${w.short} – End`); });
  const rowFor = (b, status) => {
    const cells = [busLabel(b), status];
    REPORT_WORKSHOPS.forEach(w => {
      const ws = b.ws?.[w.key] || {};
      cells.push(shortDate(ws.actualStart), shortDate(ws.actualEnd));
    });
    return cells;
  };
  const rows = [
    ...model.completed.map(b => rowFor(b, 'Completed')),
    ...model.inProgress.map(b => rowFor(b, 'In Progress')),
  ];

  flow.table(head,
    rows.length ? rows : [[`No buses were completed or in progress in ${model.monthName}.`, '', '', '', '', '', '', '', '', '']],
    [2.4, 1.1, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05],
    ['left', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
    { bodyPt: 10 });
}

function drawPageNumbers(pdf) {
  const n = pdf.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    pdf.setPage(i);
    pdf.setTextColor(0);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(BODY_PT);
    pdf.text(String(i), PAGE.w / 2, PAGE.h - 12, { align: 'center' });
  }
}

/**
 * @param {object} opts
 * @param {object} opts.meta          preliminary form: month, referenceNo, issueDate, lastReviewDate…
 * @param {Array}  opts.buses         parseBusUnits output
 * @param {Array}  opts.pageCanvases  the three captured scoreboard pages
 * @returns {jsPDF}
 */
export async function buildProductionReport({ meta, buses = [], pageCanvases = [] }) {
  const model = buildReportModel({ buses, month: meta.month });
  const resolved = {
    referenceNo: meta.referenceNo || '',
    issueDateLabel: longDate(meta.issueDate),
    lastReviewLabel: longDate(meta.lastReviewDate),
    preparedBy: meta.preparedBy || 'PRODUCTION PLANNING & CONTROL UNIT',
    documentOwner: meta.documentOwner || 'DEPARTMENT OF PRODUCTION',
    versionNo: meta.versionNo || '00',
    nextReview: meta.nextReview || 'AS REQUIRED',
    preparedByName: meta.preparedByName || 'ENG. RICHARD MADANDA',
    preparedByTitle: meta.preparedByTitle || 'DIRECTOR PRODUCTION',
    approvedByName: meta.approvedByName || 'PAUL ISAAC MUSAASIZI',
    approvedByTitle: meta.approvedByTitle || 'CHIEF EXECUTIVE OFFICER',
  };

  const [coverImg, logoImg] = await Promise.all([
    loadImage(COVER.src).catch(() => null),
    loadImage(LOGO_SRC).catch(() => null),
  ]);

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawCover(pdf, coverImg, model);

  const flow = new Flow(pdf).newPage();
  drawVersionHistory(flow, logoImg, resolved);

  pageCanvases.forEach(cv => flow.boardPage(cv));
  drawAnnexure(flow, model);

  drawPageNumbers(pdf);
  return pdf;
}
