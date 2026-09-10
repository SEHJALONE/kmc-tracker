import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addCanvasPaged } from '../utils/pdfImagePager.js';

// Minimal jsPDF stand-in: records every addImage call and its page.
function fakePdf(w, h) {
  const calls = [];
  let page = 1;
  return {
    calls,
    get pages() { return page; },
    internal: { pageSize: { getWidth: () => w, getHeight: () => h } },
    addPage() { page += 1; },
    addImage(_data, _fmt, x, y, iw, ih) { calls.push({ page, x, y, iw, ih }); },
  };
}

function fakeCanvas(w, h) {
  return {
    width: w, height: h,
    toDataURL: () => 'data:image/jpeg;base64,AA',
    getContext: () => ({ drawImage() {} }),
  };
}

beforeEach(() => {
  // The multi-page path slices through a scratch canvas.
  vi.stubGlobal('document', {
    createElement: () => fakeCanvas(0, 0),
  });
});

const A4_LANDSCAPE = [297, 210];

describe('addCanvasPaged', () => {
  it('a short capture lands on one page, filling the full content width', () => {
    const pdf = fakePdf(...A4_LANDSCAPE);
    const pages = addCanvasPaged(pdf, fakeCanvas(2640, 900), { margin: 8 });
    expect(pages).toBe(1);
    expect(pdf.calls).toHaveLength(1);
    const { x, iw, ih } = pdf.calls[0];
    expect(x).toBe(8);                 // left margin only — no centring gap
    expect(iw).toBeCloseTo(297 - 16);  // fills content width
    expect(ih).toBeLessThan(210 - 16); // shorter than the page → bottom gap, not sides
  });

  it('a tall capture is split into equal full-width slices, one per page', () => {
    const pdf = fakePdf(...A4_LANDSCAPE);
    // ~2.6 content-pages tall at full width → 3 pages
    const pages = addCanvasPaged(pdf, fakeCanvas(2640, 4800), { margin: 8 });
    expect(pages).toBe(3);
    expect(pdf.calls).toHaveLength(3);
    expect(pdf.calls.map(c => c.page)).toEqual([1, 2, 3]);
    // every slice fills the width and starts at the left margin
    for (const c of pdf.calls) {
      expect(c.x).toBe(8);
      expect(c.iw).toBeCloseTo(297 - 16);
      expect(c.ih).toBeLessThanOrEqual(210 - 16 + 0.01);
    }
    // slices are equal in height (even gaps, not one big one)
    const heights = pdf.calls.map(c => Math.round(c.ih));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  });

  it('newPageFirst adds a leading page so it appends after existing content', () => {
    const pdf = fakePdf(...A4_LANDSCAPE);
    addCanvasPaged(pdf, fakeCanvas(2640, 900), { margin: 8, newPageFirst: true });
    expect(pdf.calls[0].page).toBe(2);
  });

  it('respects an asymmetric top / bottom (page-number clearance)', () => {
    const pdf = fakePdf(...A4_LANDSCAPE);
    addCanvasPaged(pdf, fakeCanvas(2640, 500), { margin: 10, top: 10, bottom: 16 });
    expect(pdf.calls[0].y).toBe(10);
  });

  it('is a no-op for an empty canvas', () => {
    const pdf = fakePdf(...A4_LANDSCAPE);
    expect(addCanvasPaged(pdf, { width: 0, height: 0 })).toBe(0);
    expect(pdf.calls).toHaveLength(0);
  });
});
