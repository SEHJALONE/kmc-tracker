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
//            the reporting period; Annexes B–E — the full rows behind the
//            board's register scorecards: engineering changes (ECR),
//            production incidents, kaizen, and downtime events
//
// The reporting period is a month, a quarter, a year or a custom range
// (utils/reportPeriod.js); every annex is sliced to it.
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
// A quarter's label ("Q3 2026 (JULY – SEPTEMBER)") is too long for the gap
// on one line, so anything with a bracketed part goes on two, and the size
// steps down until the widest line fits the cover's text column.
const COVER_MAX_W = 118;
function drawCover(pdf, coverImg, model) {
  if (coverImg) pdf.addImage(coverImg, 'PNG', 0, 0, PAGE.w, PAGE.h);
  pdf.setTextColor(0);
  pdf.setFont('times', 'bold');
  const lines = /\(/.test(model.monthUpper)
    ? model.monthUpper.split(/\s*\(\s*/).map(s => s.replace(/\)\s*$/, ''))
    : [model.monthUpper];
  let pt = COVER.pt;
  pdf.setFontSize(pt);
  while (pt > 12 && Math.max(...lines.map(l => pdf.getTextWidth(l))) > COVER_MAX_W) {
    pt -= 1;
    pdf.setFontSize(pt);
  }
  const lh = pt * PT_MM * 1.15;
  const y0 = COVER.textY - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => pdf.text(l, COVER.textX, y0 + i * lh, { align: 'center' }));
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

// ── Annexes B–E ─────────────────────────────────────────────────────────
// The rows behind the board's register scorecards, for the reporting period
// (the same `deriveRangeKpis` result the board shows). Each annex closes with
// the register's dates that are not written dd.mm.yyyy, so they get fixed at
// source.
const clip = (s, n = 320) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || '–';
};
const ddmmyyyy = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
const dateOf = dt => (dt
  ? `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`
  : '');

function annexHeading(flow, text) {
  flow.need(30);
  flow.y += 4;
  flow.para(text, { bold: true });
}

function flaggedTable(flow, flagged) {
  if (!flagged || !flagged.length) return;
  flow.para('Dates to correct in the register (house format dd.mm.yyyy):', { pt: 10, gapAfter: 2 });
  flow.table(['SHEET ROW', 'ENTRY', 'FIELD', 'AS ENTERED', 'ISSUE'],
    flagged.map(f => [String(f.sheetRow), clip(f.name, 90), f.field, f.raw,
      `${f.reason}${f.flag !== 'format' ? ', not counted' : ''}`]),
    [0.9, 3.2, 1.6, 1.6, 2.2], ['center', 'left', 'left', 'left', 'left'], { bodyPt: 9 });
}

function drawRegisterAnnexes(flow, regs, model) {
  const { ecr, incidents, kaizen, downtimeEvents = [], activeDowntime = [] } = regs;
  const p = model.monthName;

  annexHeading(flow, `Annex B: Engineering Changes (ECR) — ${p}`);
  flow.para(`${ecr.total} change${ecr.total === 1 ? '' : 's'} in the period: ${ecr.raisedCount} raised and ${ecr.implementedCount} implemented.`, { pt: 10 });
  flow.table(
    ['CHANGE ID', 'RAISED', 'TITLE', 'MODEL', 'CATEGORY / TYPE', 'RISK', 'DECISION', 'STATUS', 'IMPLEMENTED'],
    ecr.rows.length ? ecr.rows.map(e => [
      e.id, ddmmyyyy(e.raised.iso) || e.raised.raw, clip(e.title, 140), clip(e.model, 40),
      [e.category, e.type].filter(Boolean).join(' / ') || '–', e.risk || '–', e.decision || '–', e.status || '–',
      ddmmyyyy(e.implemented.iso || e.closed.iso) || '–',
    ]) : [[`No changes were raised or implemented in ${p}.`, '', '', '', '', '', '', '', '']],
    [1.1, 1, 3.2, 1.3, 1.6, 0.9, 1.3, 1.3, 1.45],
    ['left', 'center', 'left', 'left', 'left', 'center', 'left', 'left', 'center'],
    { bodyPt: 9 });
  flaggedTable(flow, ecr.flagged);

  annexHeading(flow, `Annex C: Production Incidents — ${p}`);
  const sev = Object.entries(incidents.bySeverity).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ');
  flow.para(`${incidents.total} incident${incidents.total === 1 ? '' : 's'} in the period${sev ? ` (${sev})` : ''}.`, { pt: 10 });
  flow.table(
    ['NO.', 'DATE', 'LOCATION', 'CLASSIFICATION', 'SEVERITY', 'DESCRIPTION', 'IMMEDIATE ACTIONS'],
    incidents.rows.length ? incidents.rows.map(x => [
      x.no, ddmmyyyy(x.date.iso), clip(x.location, 60), clip(x.classification, 60), x.severity || '–',
      clip(x.description), clip(x.actions, 220),
    ]) : [[`No incidents were recorded in ${p}.`, '', '', '', '', '', '']],
    [0.6, 1, 1.5, 1.5, 1.25, 4, 3],
    ['center', 'center', 'left', 'left', 'center', 'left', 'left'],
    { bodyPt: 9 });
  flaggedTable(flow, incidents.flagged);

  annexHeading(flow, `Annex D: Kaizen / Improvement Ideas — ${p}`);
  flow.para(`${kaizen.total} idea${kaizen.total === 1 ? '' : 's'} in the period: ${kaizen.implemented} implemented, ${kaizen.open} proposed or open.`, { pt: 10 });
  flow.table(
    ['DATE', 'KAIZEN IDEA', 'WORKSHOP', 'PROPOSED BY', 'STATUS', 'IMPACT'],
    kaizen.rows.length ? kaizen.rows.map(k => [
      ddmmyyyy(k.date.iso), clip(k.idea, 200), clip(k.workshop, 50), k.proposedBy || '–', k.status || '–', clip(k.impact, 160),
    ]) : [[`No kaizen ideas are dated in ${p}.`, '', '', '', '', '']],
    [1, 4, 1.6, 1.4, 1.2, 3],
    ['center', 'left', 'left', 'left', 'center', 'left'],
    { bodyPt: 9 });
  flaggedTable(flow, kaizen.flagged);

  annexHeading(flow, `Annex E: Production Downtime Events — ${p}`);
  // Faults still open as the report is generated, whenever they started — the
  // board's "Active Downtime Events" panel. The period table below only holds
  // events that started in the period, so a fault open since an earlier month
  // would otherwise be missing from this report altogether.
  flow.para(`Active downtime events: ${activeDowntime.length
    ? `${activeDowntime.length} fault${activeDowntime.length === 1 ? '' : 's'} still open as at ${dateOf(new Date())}.`
    : `none open as at ${dateOf(new Date())}.`}`, { pt: 10, bold: true });
  if (activeDowntime.length) {
    flow.table(
      ['WORKSHOP', 'MACHINE', 'FAULT', 'STARTED', 'HOURS OPEN', 'REASON'],
      activeDowntime.map(e => [
        clip(e.workshop, 50), clip(e.machineName, 60), clip(e.description, 160),
        `${dateOf(e.startDate)} ${e.startTime || ''}`.trim(), (e.minutes / 60).toFixed(1), e.reasonCode || '–',
      ]),
      [1.8, 2, 3.2, 1.4, 1.1, 1.8],
      ['left', 'left', 'left', 'center', 'right', 'left'],
      { bodyPt: 9 });
  }

  const hours = downtimeEvents.reduce((s, e) => s + e.minutes, 0) / 60;
  flow.para(`${downtimeEvents.length} event${downtimeEvents.length === 1 ? '' : 's'} started in the period, ${hours.toFixed(1)} hours lost.`, { pt: 10 });
  flow.table(
    ['WORKSHOP', 'MACHINE', 'REASON', 'START', 'END', 'STATUS', 'HOURS', 'FAULT'],
    downtimeEvents.length ? downtimeEvents.map(e => [
      clip(e.workshop, 50), clip(e.machineName, 60), e.reasonCode || '–',
      `${dateOf(e.startDate)} ${e.startTime || ''}`.trim(), `${dateOf(e.endDate)} ${e.endTime || ''}`.trim() || '–',
      e.status || '–', (e.minutes / 60).toFixed(1), clip(e.description, 160),
    ]) : [[`No downtime events started in ${p}.`, '', '', '', '', '', '', '']],
    [1.6, 1.6, 1.6, 1.3, 1.3, 1, 0.8, 3],
    ['left', 'left', 'left', 'center', 'center', 'center', 'right', 'left'],
    { bodyPt: 9 });
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
 * @param {object} opts.registers     deriveRangeKpis(data, period) — Annexes B–E
 * @returns {jsPDF}
 */
export async function buildProductionReport({ meta, buses = [], pageCanvases = [], registers = null }) {
  const model = buildReportModel({ buses, month: meta.month, period: meta.period });
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
  if (registers) drawRegisterAnnexes(flow, registers, model);

  drawPageNumbers(pdf);
  return pdf;
}
