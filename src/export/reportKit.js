// ── KMC report kit ──────────────────────────────────────────────────────────
// The shared look of every report the browser produces (Travel Card station and
// bus reports, NCR report and register): navy hero, gold accent, white cards,
// status pills. A report is written as HTML with these pieces, then captured to
// an A4 PDF. HTML instead of hand-drawn shapes means real fonts, text that wraps
// instead of being cut to one line, and tables that flow onto as many pages as
// they need, cut only between rows and cards.

export const PAGE_W_PX = 794;           // A4 portrait width at 96 dpi
export const PAGE_W_LANDSCAPE_PX = 1123;

// ── Theme tokens (from the CML dashboard) ───────────────────────────────────
export const TOKENS = {
  light: {
    ground: '#E9EEF0', surface: '#FFFFFF', surface2: '#F1F5F3', ink: '#14203F', muted: '#4B5675',
    line: '#D6E0DA', lineSoft: '#E6ECE8', accent: '#E0A91B', accentInk: '#6E4F00', accentWash: '#FBF1D3', onAccent: '#2B1F00',
    ok: '#2F8C46', okInk: '#1B5E2E', okWash: '#E2F0E5', okLine: '#BFDDC7',
    warn: '#B0701F', warnInk: '#6F440C', warnWash: '#F7EDDD', warnLine: '#EBD2A9',
    info: '#26689F', infoInk: '#174A78', infoWash: '#E1EBF5', infoLine: '#BDD3E9',
    crit: '#A93434', critInk: '#7E1F1F', critWash: '#F8E6E6', critLine: '#EDC3C3',
    slate: '#4F5D8A', slateInk: '#2E3A63', slateWash: '#E7EAF4', slateLine: '#CAD0E4',
    hero: '#14203F', heroInk: '#FFFFFF', sh: '0 1px 2px rgba(20,32,63,.05),0 10px 30px -14px rgba(20,32,63,.28)',
    logo: '/kmc logo.png', // dark lettering on light
  },
  dark: {
    ground: '#080F1E', surface: '#111B33', surface2: '#17233F', ink: '#F1F5FB', muted: '#AEB9D3',
    line: '#26365A', lineSoft: '#1C2A48', accent: '#F2C53D', accentInk: '#F7D774', accentWash: '#33280A', onAccent: '#2B1F00',
    ok: '#5CBE72', okInk: '#A6E6B4', okWash: '#15301E', okLine: '#285C36',
    warn: '#D69C52', warnInk: '#F4CF9B', warnWash: '#31240E', warnLine: '#5E4620',
    info: '#68A5D9', infoInk: '#B5D5F2', infoWash: '#112438', infoLine: '#28496B',
    crit: '#DE6E6E', critInk: '#F6B7B7', critWash: '#341919', critLine: '#643030',
    slate: '#97A3CC', slateInk: '#D3D9EE', slateWash: '#1C2440', slateLine: '#36426A',
    hero: '#0B1328', heroInk: '#F1F5FB', sh: '0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.7)',
    logo: '/kmc logo 2.png', // white lettering on dark
  },
};

export const HERO_BACKDROP = '/Bus background 5.png';

// ── Formatting helpers ──────────────────────────────────────────────────────
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const url = p => encodeURI(p);
export const stamp = () => new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const safeName = s => String(s || '').replace(/[^\w.-]+/g, '_');
export const pill = (tone, text) => `<span class="pill p-${tone}">${esc(text)}</span>`;

// rgba() rather than 8-digit hex: html2canvas doesn't reliably parse #RRGGBBAA.
export function rgba(hex, a) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

// ── Shared CSS ──────────────────────────────────────────────────────────────
// html2canvas ignores `object-fit` and `filter`, so anything that must keep its
// proportions (the bus cut-out in the hero) is a contained background image.
export function css(t, pageW = PAGE_W_PX) {
  return `
  .rp{--r:14px;width:${pageW}px;background:${t.ground};color:${t.ink};font-family:Inter,"Segoe UI",system-ui,Arial,sans-serif;font-size:12px;line-height:1.45;padding:22px 24px 26px;box-sizing:border-box;-webkit-font-smoothing:antialiased}
  .rp *{box-sizing:border-box}
  .rp h1,.rp h2,.rp h3{margin:0;letter-spacing:-.01em}
  .top{display:flex;align-items:center;justify-content:space-between;gap:14px;background:${t.surface};border-radius:var(--r);box-shadow:${t.sh};padding:12px 16px}
  .top img{height:34px;width:auto;display:block}
  .top .ttl{text-align:right}
  .eyebrow{font-size:9.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${t.accentInk}}
  .top h2{font-size:17px;font-weight:800;margin-top:1px}
  .chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-top:6px}
  .chip{background:${t.surface2};border:1px solid ${t.line};border-radius:999px;padding:3px 9px;font-size:10px;font-weight:650;white-space:nowrap}
  .hero{position:relative;margin-top:14px;border-radius:var(--r);overflow:hidden;min-height:186px;background:${t.hero};color:${t.heroInk};box-shadow:${t.sh}}
  .hero.slim{min-height:128px}
  .hero .bg{position:absolute;inset:0;background-size:cover;background-position:center 40%;opacity:.55}
  .hero .wash{position:absolute;inset:0;background:linear-gradient(90deg,${rgba(t.hero, 1)} 0%,${rgba(t.hero, .94)} 42%,${rgba(t.hero, .4)} 72%,${rgba(t.hero, .13)} 100%)}
  .hero .glow{position:absolute;left:-70px;bottom:-90px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(242,197,61,.30),transparent 70%)}
  .hero .txt{position:relative;z-index:2;padding:20px 22px;max-width:62%}
  .hero .kicker{font-size:10px;font-weight:800;letter-spacing:.14em;color:#F2C53D;text-transform:uppercase}
  .hero h1{font-size:23px;font-weight:800;line-height:1.18;margin-top:6px;color:#fff}
  .hero .meta{margin-top:10px;font-size:11.5px;color:#fff;opacity:.92;line-height:1.7}
  .hero .meta b{font-weight:700}
  .hero .badge{margin-top:12px;display:inline-flex;gap:8px;align-items:center}
  .hero .render{position:absolute;z-index:1;right:6px;bottom:4px;width:44%;height:88%;background-repeat:no-repeat;background-position:right bottom;background-size:contain}
  .kpis{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:10px;margin-top:14px}
  .kpi{background:${t.surface};border:1px solid ${t.line};border-radius:12px;padding:11px 8px;text-align:center;box-shadow:${t.sh};position:relative}
  .kpi .lab{font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:${t.muted};min-height:2.3em}
  .kpi .val{font-size:21px;font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .kpi .sub{font-size:9.5px;color:${t.muted};margin-top:3px;font-weight:600}
  .kpi .dt{position:absolute;top:9px;right:9px;width:8px;height:8px;border-radius:50%}
  .kpi.gold{background:linear-gradient(150deg,${t.accent},#F2C53D);border-color:transparent}
  .kpi.gold .lab,.kpi.gold .val,.kpi.gold .sub{color:${t.onAccent}}
  .kpi.dark{background:${t.hero};border-color:transparent}
  .kpi.dark .lab,.kpi.dark .val,.kpi.dark .sub{color:${t.heroInk}}
  .card{background:${t.surface};border-radius:var(--r);box-shadow:${t.sh};padding:14px 16px;margin-top:14px}
  .card>h3{font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
  .card>h3 .cnt{font-size:10px;letter-spacing:.02em;text-transform:none;font-weight:700;background:${t.accentWash};color:${t.accentInk};padding:2px 8px;border-radius:999px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .grid2>.card{margin-top:14px}
  .kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:11.5px}
  .kv dt{color:${t.muted};font-weight:650}
  .kv dd{margin:0;font-weight:650;text-align:right;font-variant-numeric:tabular-nums}
  .ops{display:flex;flex-wrap:wrap;gap:6px}
  .op{background:${t.surface2};border:1px solid ${t.line};border-radius:999px;padding:3px 10px;font-size:11px;font-weight:650}
  table{width:100%;border-collapse:collapse;font-size:11.2px}
  thead th{background:${t.surface2};text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:7px 8px;border-bottom:1px solid ${t.line};font-weight:800;color:${t.ink}}
  tbody td{padding:6px 8px;border-bottom:1px solid ${t.lineSoft};vertical-align:top}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.code{white-space:nowrap}
  td.idx{color:${t.muted};width:22px}
  tr.band td{background:${t.accentWash};color:${t.accentInk};font-weight:800;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase}
  tr.late td{background:${t.critWash}}
  .pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:10px;font-weight:700;white-space:nowrap;border:1px solid transparent}
  .p-ok{background:${t.okWash};color:${t.okInk};border-color:${t.okLine}}
  .p-warn{background:${t.warnWash};color:${t.warnInk};border-color:${t.warnLine}}
  .p-info{background:${t.infoWash};color:${t.infoInk};border-color:${t.infoLine}}
  .p-crit{background:${t.critWash};color:${t.critInk};border-color:${t.critLine}}
  .p-slate{background:${t.slateWash};color:${t.slateInk};border-color:${t.slateLine}}
  .p-none{background:${t.surface2};color:${t.muted};border-color:${t.line}}
  .tag{font-size:9px;font-weight:800;color:${t.accentInk};background:${t.accentWash};border-radius:4px;padding:1px 5px;margin-left:6px;letter-spacing:.04em}
  .msrow{display:grid;grid-template-columns:170px 1fr 70px;gap:10px;align-items:center;margin-bottom:8px;font-size:11.2px}
  .msrow .nm{font-weight:650}
  .bar{height:10px;border-radius:99px;background:${t.lineSoft};overflow:hidden;box-shadow:inset 0 0 0 1px ${t.line}}
  .bar>i{display:block;height:100%;border-radius:99px;background:${t.ink}}
  .bar.gold>i{background:${t.accent}}
  .bar.crit>i{background:${t.crit}}
  .msrow .pc{text-align:right;font-weight:800;font-variant-numeric:tabular-nums}
  .note{font-size:11.5px;line-height:1.55;white-space:pre-wrap}
  .muted{color:${t.muted}}
  .empty{color:${t.muted};font-style:italic;font-size:11px}
  .sign{display:grid;grid-template-columns:repeat(var(--sn,2),1fr);gap:26px;margin-top:22px}
  .sign div{border-top:1px solid ${t.muted};padding-top:5px;font-size:10px;color:${t.muted};font-weight:650;letter-spacing:.04em}
  `;
}

// ── Building blocks ─────────────────────────────────────────────────────────
export function topBar(t, kind, chips, eyebrow = 'Production Travel Card') {
  return `<div class="top" data-break>
    <img src="${url(t.logo)}" alt="KMC" />
    <div class="ttl">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h2>${esc(kind)}</h2>
      <div class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    </div>
  </div>`;
}

// `render`: path of a cut-out picture shown bottom-right at its own proportions.
export function hero({ kicker, title, metaHtml, badgeHtml, render = null, slim = false }) {
  return `<div class="hero${slim ? ' slim' : ''}" data-break>
    <div class="bg" style="background-image:url('${url(HERO_BACKDROP)}')"></div>
    <div class="wash"></div><div class="glow"></div>
    ${render ? `<div class="render" style="background-image:url('${url(render)}')"></div>` : ''}
    <div class="txt">
      <div class="kicker">${esc(kicker)}</div>
      <h1>${esc(title)}</h1>
      <div class="meta">${metaHtml}</div>
      ${badgeHtml ? `<div class="badge">${badgeHtml}</div>` : ''}
    </div>
  </div>`;
}

export function kpiBand(items) {
  return `<div class="kpis" style="--n:${items.length}" data-break>${items.map(k => `
    <div class="kpi ${k.cls || ''}">${k.dot ? `<span class="dt" style="background:${k.dot}"></span>` : ''}
      <div class="lab">${esc(k.lab)}</div><div class="val">${esc(k.val)}</div>${k.sub ? `<div class="sub">${esc(k.sub)}</div>` : ''}
    </div>`).join('')}</div>`;
}

// ── HTML → PDF ──────────────────────────────────────────────────────────────
// Cut points: the bottom edge of every [data-break] element (a table row, a
// card, a KPI band), so a page never splits a row or a small card in half.
export function planPageCuts(totalH, safeCuts, pageH) {
  const cuts = [...new Set(safeCuts.filter(y => y > 0 && y < totalH))].sort((a, b) => a - b);
  const pages = [];
  let start = 0;
  while (start < totalH - 1) {
    const limit = start + pageH;
    if (limit >= totalH) { pages.push([start, totalH]); break; }
    // Latest safe cut that still fills at least 40% of the page; otherwise a
    // hard cut (only possible for a single element taller than 60% of a page).
    const cut = cuts.filter(y => y <= limit && y >= start + pageH * 0.4).pop();
    const end = cut ?? limit;
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

function waitForImages(el) {
  const urls = [...el.querySelectorAll('[style*="background-image"]')]
    .map(e => /url\(['"]?([^'")]+)/.exec(e.getAttribute('style') || '')?.[1]).filter(Boolean);
  const preload = src => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = src; });
  return Promise.all([
    ...[...el.querySelectorAll('img')].map(img => (img.complete && img.naturalWidth) ? null : new Promise(res => { img.onload = img.onerror = res; })),
    ...urls.map(preload),
  ]);
}

// footer: the document code printed at the bottom of every page.
export async function htmlToPdf(html, { theme = 'light', fileName, save = true, footer = '', landscape = false }) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const t = TOKENS[theme] || TOKENS.light;
  const widthPx = landscape ? PAGE_W_LANDSCAPE_PX : PAGE_W_PX;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;z-index:-1;pointer-events:none`;
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const root = host.firstElementChild;
    await waitForImages(root);
    if (document.fonts?.ready) await document.fonts.ready;
    const top = root.getBoundingClientRect().top;
    const safe = [...root.querySelectorAll('[data-break]')].map(e => Math.round(e.getBoundingClientRect().bottom - top));
    const totalH = root.scrollHeight;

    const SCALE = 2;
    const canvas = await html2canvas(root, { scale: SCALE, useCORS: true, backgroundColor: t.ground, logging: false });

    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageW = landscape ? 297 : 210, pageH = landscape ? 210 : 297, topM = 8, bottomM = 12;
    const mmPerPx = pageW / widthPx;
    const pagePx = Math.floor((pageH - topM - bottomM) / mmPerPx);
    const pages = planPageCuts(totalH, safe, pagePx);
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

    pages.forEach(([y0, y1], i) => {
      if (i > 0) pdf.addPage();
      pdf.setFillColor(...rgb(t.ground)); pdf.rect(0, 0, pageW, pageH, 'F');
      const slice = document.createElement('canvas');
      slice.width = canvas.width; slice.height = Math.round((y1 - y0) * SCALE);
      slice.getContext('2d').drawImage(canvas, 0, Math.round(y0 * SCALE), canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, i === 0 ? 0 : topM, pageW, (y1 - y0) * mmPerPx);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...rgb(t.muted));
      pdf.text(`KIIRA MOTORS CORPORATION${footer ? `  ·  ${footer}` : ''}`, 9, pageH - 5);
      pdf.text(`Page ${i + 1} of ${pages.length}`, pageW - 9, pageH - 5, { align: 'right' });
    });
    if (save) pdf.save(fileName);
    return pdf;
  } finally {
    host.remove();
  }
}
