// ── pdfImagePager ───────────────────────────────────────────────────────────
// Places one tall canvas (a captured scoreboard page) across as many PDF pages
// as it needs.
//
// The old approach fitted each board-page canvas onto a SINGLE landscape A4
// page with `Math.min(pageW/w, pageH/h)`. The board pages are tall and narrow,
// so the height term always won: the image shrank to a centred strip and left
// wide, uneven margins down both sides — and the tallest page (registers)
// shrank the most, so the three pages came out at three different scales.
//
// Here the canvas is scaled to the FULL content width (no side margins) and
// split into equal horizontal slices, one per PDF page. Every page is filled
// edge to edge; the slices are equal so each page carries the same small
// bottom gap rather than one page having a huge one. All board pages render at
// the same scale because that scale is only ever `contentW / canvas.width`.

/**
 * @param {import('jspdf').jsPDF} pdf   target document (its current orientation is respected)
 * @param {HTMLCanvasElement} canvas    the page capture
 * @param {object} [opts]
 * @param {number} [opts.margin=8]      mm kept clear left and right
 * @param {number} [opts.top=opts.margin]    mm from the top edge to the first slice
 * @param {number} [opts.bottom=opts.margin] mm kept clear at the bottom (page numbers etc.)
 * @param {boolean} [opts.newPageFirst=false] add a page before the first slice
 * @param {number} [opts.quality=0.95]  JPEG quality for the embedded slices
 * @returns {number} how many PDF pages the canvas occupied
 */
export function addCanvasPaged(pdf, canvas, opts = {}) {
  if (!canvas || !canvas.width || !canvas.height) return 0;
  const { margin = 8, quality = 0.95, newPageFirst = false } = opts;
  const top = opts.top ?? margin;
  const bottom = opts.bottom ?? margin;

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const contentH = pageH - top - bottom;

  const scale = contentW / canvas.width;              // mm per source pixel
  const fullH = canvas.height * scale;                // mm the canvas wants
  const pages = Math.max(1, Math.ceil(fullH / contentH));
  const sliceH = Math.ceil(canvas.height / pages);    // equal source-px slices

  for (let i = 0; i < pages; i++) {
    if (i > 0 || newPageFirst) pdf.addPage();
    const sy = i * sliceH;
    const sh = Math.min(sliceH, canvas.height - sy);
    if (sh <= 0) break;

    let src = canvas;
    if (pages > 1) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sh;
      slice.getContext('2d').drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      src = slice;
    }
    pdf.addImage(src.toDataURL('image/jpeg', quality), 'JPEG',
      margin, top, contentW, sh * scale);
  }
  return pages;
}
