// ── Travel Card reports (Station Report + Full Bus Report) ──────────────────
// Rendered as an HTML page in the visual language of the KMC CML Project
// Implementation Dashboard (navy hero, gold accent, glass cards, status pills,
// token-based light/dark palette with a logo lockup per theme), then captured
// to an A4 PDF. HTML instead of hand-drawn jsPDF shapes means real fonts and
// symbols, text that wraps instead of being cut to one line, and tables that
// flow onto as many pages as they need — cut only between rows/cards.
import { STATIONS, LINES, modelFamilyOf, stationNameForModel, isSubassembly } from '../data/stations';

const PAGE_W_PX = 794;           // A4 width at 96 dpi
const DOC_CODE = 'KMC.DPN.05/26-FM004 · Rev #01';

// ── Theme tokens (from the CML dashboard) ───────────────────────────────────
const TOKENS = {
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

// Model cut-out renders in /public. No 13m KEC render exists yet — the 12m
// coach body is the closest match until one is added.
const MODEL_RENDER = {
  '7m EVS': '/7m EVS.png', '8.5m EVS': '/8.5m EVS.png', '10.5m EVS': '/10.5m EVS.png', '12m EVS': '/12m EVS.png',
  '10.5m KDC': '/10.5m KDC.png', '12m KDC': '/12m KDC.png', '13m KEC': '/12m KDC.png',
};
const HERO_BACKDROP = '/Bus background 5.png';

// ── Formatting helpers ──────────────────────────────────────────────────────
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const url = p => encodeURI(p);
export function fmtDur(mins) {
  const m = Math.round(Number(mins));
  if (!Number.isFinite(m) || m < 0) return '—';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
const stamp = () => new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const stationTitle = s => String(s || '').split(':').slice(1).join(':').trim() || String(s || '');
const baseLine = l => String(l || '').replace(/\s+—\s+(EVS|KDC|KEC)$/, '');
const hasDowntime = s => !!(s.hasDowntime ?? s.hasOverrun);
const variance = s => (Number(s.actualTime) || 0) - (Number(s.designedTime) || 0);

const ACT_STATUS = {
  complete: ['ok', 'Complete'], incomplete: ['warn', 'Incomplete'], issue: ['info', 'Issue noted'],
  rework: ['crit', 'Rework needed'], na: ['slate', 'N/A'], not_set: ['none', 'Not set'], '': ['none', 'Not set'],
};
const APPROVAL = {
  approved: ['ok', 'Approved'], rejected: ['crit', 'Rejected'], pending: ['warn', 'Further review'],
  pending_review: ['warn', 'Pending review'],
};
const pill = (tone, text) => `<span class="pill p-${tone}">${esc(text)}</span>`;
const actPill = st => { const [t, l] = ACT_STATUS[st] || ['none', st || 'Not set']; return pill(t, l); };
const approvalPill = st => { const [t, l] = APPROVAL[st] || ['slate', st || 'Not reviewed']; return pill(t, l); };

// ── Shared CSS ──────────────────────────────────────────────────────────────
// rgba() rather than 8-digit hex: html2canvas doesn't reliably parse #RRGGBBAA.
function rgba(hex, a) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

function css(t) {
  return `
  .rp{--r:14px;width:${PAGE_W_PX}px;background:${t.ground};color:${t.ink};font-family:Inter,"Segoe UI",system-ui,Arial,sans-serif;font-size:12px;line-height:1.45;padding:22px 24px 26px;box-sizing:border-box;-webkit-font-smoothing:antialiased}
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
  .hero .bg{position:absolute;inset:0;background-size:cover;background-position:center 40%;opacity:.55}
  .hero .wash{position:absolute;inset:0;background:linear-gradient(90deg,${rgba(t.hero, 1)} 0%,${rgba(t.hero, .94)} 42%,${rgba(t.hero, .4)} 72%,${rgba(t.hero, .13)} 100%)}
  .hero .glow{position:absolute;left:-70px;bottom:-90px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(242,197,61,.30),transparent 70%)}
  .hero .txt{position:relative;z-index:2;padding:20px 22px;max-width:62%}
  .hero .kicker{font-size:10px;font-weight:800;letter-spacing:.14em;color:#F2C53D;text-transform:uppercase}
  .hero h1{font-size:23px;font-weight:800;line-height:1.18;margin-top:6px;color:#fff}
  .hero .meta{margin-top:10px;font-size:11.5px;color:#fff;opacity:.92;line-height:1.7}
  .hero .meta b{font-weight:700}
  .hero .badge{margin-top:12px;display:inline-flex;gap:8px;align-items:center}
  .hero .render{position:absolute;z-index:1;right:-6px;bottom:-4px;width:46%;max-height:92%;object-fit:contain;filter:drop-shadow(0 14px 22px rgba(0,0,0,.45))}
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
  .sign{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:22px}
  .sign div{border-top:1px solid ${t.muted};padding-top:5px;font-size:10px;color:${t.muted};font-weight:650;letter-spacing:.04em}
  `;
}

function topBar(t, kind, chips) {
  return `<div class="top" data-break>
    <img src="${url(t.logo)}" alt="KMC" />
    <div class="ttl">
      <div class="eyebrow">Production Travel Card</div>
      <h2>${esc(kind)}</h2>
      <div class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    </div>
  </div>`;
}

function hero({ kicker, title, metaHtml, badgeHtml, model }) {
  const render = MODEL_RENDER[model];
  return `<div class="hero" data-break>
    <div class="bg" style="background-image:url('${url(HERO_BACKDROP)}')"></div>
    <div class="wash"></div><div class="glow"></div>
    ${render ? `<img class="render" src="${url(render)}" alt="" />` : ''}
    <div class="txt">
      <div class="kicker">${esc(kicker)}</div>
      <h1>${esc(title)}</h1>
      <div class="meta">${metaHtml}</div>
      ${badgeHtml ? `<div class="badge">${badgeHtml}</div>` : ''}
    </div>
  </div>`;
}

function kpiBand(items) {
  return `<div class="kpis" style="--n:${items.length}" data-break>${items.map(k => `
    <div class="kpi ${k.cls || ''}">${k.dot ? `<span class="dt" style="background:${k.dot}"></span>` : ''}
      <div class="lab">${esc(k.lab)}</div><div class="val">${esc(k.val)}</div>${k.sub ? `<div class="sub">${esc(k.sub)}</div>` : ''}
    </div>`).join('')}</div>`;
}

// ── STATION REPORT ──────────────────────────────────────────────────────────
export function stationReportHTML(sub, { theme = 'light' } = {}) {
  const t = TOKENS[theme] || TOKENS.light;
  const acts = Object.entries(sub.activityStatuses || {});
  const added = new Set(sub.addedActivities || []);
  const done = acts.filter(([, s]) => s === 'complete').length;
  const v = variance(sub);
  const late = hasDowntime(sub) || v > 0;
  const preset = Object.entries(sub.resourcesUsed || {}).filter(([, q]) => q !== '' && q != null && Number(q) !== 0);
  const other = (sub.otherResources || []).filter(r => r && r.name);
  const dt = sub.downtime || sub.overrun || null;

  const timing = `<div class="card" data-break><h3>Timing</h3><dl class="kv">
    <dt>Clock in</dt><dd>${fmtDateTime(sub.clockIn)}</dd>
    <dt>Clock out</dt><dd>${fmtDateTime(sub.clockOut)}</dd>
    <dt>Gross time</dt><dd>${fmtDur(sub.grossTime)}</dd>
    <dt>Scheduled breaks</dt><dd>${fmtDur(sub.breakMinutes)}</dd>
    <dt>Productive time</dt><dd>${fmtDur(sub.actualTime)}</dd>
    <dt>Designed time</dt><dd>${fmtDur(sub.designedTime)}</dd></dl></div>`;

  const team = `<div class="card" data-break><h3>Team &amp; HSE</h3>
    <div class="ops">${(sub.operators || []).map(o => `<span class="op">${esc(o)}</span>`).join('') || '<span class="empty">No operators recorded</span>'}</div>
    <dl class="kv" style="margin-top:12px">
      <dt>HSE resources</dt><dd>${esc(sub.hseResources || 0)}</dd>
      <dt>Submitted by</dt><dd>${esc(sub.submittedBy || '—')}</dd>
      <dt>Submitted</dt><dd>${fmtDateTime(sub.timestamp)}</dd></dl></div>`;

  const actTable = `<div class="card"><h3>Activities <span class="cnt">${done} of ${acts.length} complete</span></h3>
    ${acts.length ? `<table><thead><tr><th>#</th><th>Activity</th><th class="num">Status</th></tr></thead><tbody>
      ${acts.map(([a, s], i) => `<tr data-break><td class="idx">${i + 1}</td><td>${esc(a)}${added.has(a) ? '<span class="tag">ADDED</span>' : ''}</td><td class="num">${actPill(s)}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">No activities recorded.</div>'}</div>`;

  const consTable = `<div class="card"><h3>Consumables &amp; materials <span class="cnt">${preset.length + other.length} items</span></h3>
    ${preset.length + other.length ? `<table><thead><tr><th>Item</th><th>Source</th><th class="num">Qty</th></tr></thead><tbody>
      ${preset.map(([n, q]) => `<tr data-break><td>${esc(n)}</td><td class="muted">Station list</td><td class="num"><b>${esc(q)}</b></td></tr>`).join('')}
      ${other.map(r => `<tr data-break><td>${esc(r.name)}</td><td class="muted">Added at station</td><td class="num"><b>${esc(r.qty)}</b></td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">No consumables recorded.</div>'}</div>`;

  let downtime = '';
  if (dt && (dt.selMs || []).length) {
    const causes = dt.selMs.map(m => ({ m, mins: Number(dt.causeTimes?.[m]) || 0, detail: dt.subCauses?.[m] || '' }));
    const max = Math.max(1, ...causes.map(c => c.mins));
    const whys = [dt.why1, dt.why2, dt.why3, dt.why4, dt.why5].filter(Boolean);
    downtime = `<div class="card"><h3>Downtime analysis <span class="cnt">+${Math.max(0, v)} min over designed</span></h3>
      ${causes.map(c => `<div class="msrow" data-break><div class="nm">${esc(c.m)}${c.detail ? `<div class="muted" style="font-weight:500;font-size:10.5px">${esc(c.detail)}</div>` : ''}</div>
        <div class="bar crit"><i style="width:${Math.round((c.mins / max) * 100)}%"></i></div><div class="pc">${c.mins ? esc(c.mins) + ' min' : '—'}</div></div>`).join('')}
      <dl class="kv" style="margin-top:8px" data-break>
        ${dt.rcaMethod ? `<dt>RCA method</dt><dd>${esc(dt.rcaMethod)}</dd>` : ''}
        ${dt.category ? `<dt>Category</dt><dd>${esc(dt.category)}</dd>` : ''}
        <dt>Corrective action</dt><dd>${esc(dt.correctiveAction || '—')}</dd>
        ${dt.preventiveAction ? `<dt>Preventive action</dt><dd>${esc(dt.preventiveAction)}</dd>` : ''}
        ${dt.attachmentName ? `<dt>Evidence</dt><dd>${esc(dt.attachmentName)}</dd>` : ''}
      </dl>
      ${whys.length ? `<div style="margin-top:10px" data-break><div class="eyebrow" style="margin-bottom:4px">5 Whys</div>${whys.map((w, i) => `<div class="note"><b>Why ${i + 1}.</b> ${esc(w)}</div>`).join('')}</div>` : ''}
      ${dt.comments ? `<div class="note" style="margin-top:8px" data-break>${esc(dt.comments)}</div>` : ''}
    </div>`;
  }

  const delay = sub.unexpectedDelay && (sub.unexpectedDelay.types || []).length
    ? sub.unexpectedDelay.types.map(ty => `${ty}${sub.unexpectedDelay.ranges?.[ty] ? ` (${sub.unexpectedDelay.ranges[ty]})` : ''}`).join(', ')
    : '';
  const notes = (sub.ohsIssue || sub.wasteGenerated || sub.generalComments || delay) ? `<div class="card" data-break><h3>HSE &amp; notes</h3><dl class="kv">
      <dt>OHS issue</dt><dd>${esc(sub.ohsIssue || 'None reported')}</dd>
      <dt>Waste generated</dt><dd>${esc(sub.wasteGenerated || '—')}</dd>
      ${delay ? `<dt>Unexpected delay</dt><dd>${esc(delay)}</dd>` : ''}</dl>
      ${sub.generalComments ? `<div class="note" style="margin-top:8px">${esc(sub.generalComments)}</div>` : ''}</div>` : '';

  const signoff = `<div class="card" data-break><h3>Sign-off</h3><dl class="kv">
      <dt>Reviewer</dt><dd>${esc(sub.reviewer || '—')}</dd>
      <dt>Status</dt><dd>${approvalPill(sub.approvalStatus)}</dd>
      <dt>Review date</dt><dd>${fmtDate(sub.reviewDate)}</dd></dl>
      ${sub.reviewComments ? `<div class="note" style="margin-top:8px">${esc(sub.reviewComments)}</div>` : ''}
      <div class="sign"><div>Operator / Team lead signature</div><div>Supervisor signature</div></div></div>`;

  return `<div class="rp"><style>${css(t)}</style>
    ${topBar(t, 'Station Report', [DOC_CODE, `Generated ${stamp()}`])}
    ${hero({
      kicker: `${sub.stationCode || ''} · ${baseLine(sub.line)}`,
      title: stationTitle(sub.station),
      metaHtml: `<b>Project</b> ${esc(sub.project || '—')} &nbsp;·&nbsp; <b>Model</b> ${esc(sub.busModel || '—')}<br/><b>VIN</b> ${esc(sub.vin || '—')}`,
      badgeHtml: approvalPill(sub.approvalStatus) + (late ? pill('crit', `+${Math.max(0, v)} min downtime`) : pill('ok', 'Within designed time')),
      model: sub.busModel,
    })}
    ${kpiBand([
      { lab: 'Designed time', val: fmtDur(sub.designedTime) },
      { lab: 'Productive time', val: fmtDur(sub.actualTime), cls: 'dark' },
      { lab: 'Variance', val: `${v > 0 ? '+' : ''}${v} min`, dot: late ? t.crit : t.ok, sub: late ? 'over designed' : 'on or under' },
      { lab: 'Activities complete', val: `${done}/${acts.length}`, cls: 'gold', sub: acts.length ? `${Math.round((done / acts.length) * 100)}%` : '' },
      { lab: 'Team size', val: String((sub.operators || []).length), sub: `${sub.hseResources || 0} HSE` },
    ])}
    <div class="grid2">${timing}${team}</div>
    ${actTable}${consTable}${downtime}${notes}${signoff}
  </div>`;
}

// ── FULL BUS REPORT ─────────────────────────────────────────────────────────
// Summarises every travel card filed for one VIN. Where the same station was
// filed more than once (e.g. an edit or a re-do), the latest card wins.
export function summariseBus(cards) {
  const byCode = new Map();
  for (const c of [...cards].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
    byCode.set(String(c.stationCode || c.station || '').toUpperCase(), c);
  }
  const latest = [...byCode.values()];
  const first = latest[0] || {};
  const model = (latest.find(c => c.busModel) || first).busModel || '';
  const fam = modelFamilyOf(model);
  const actual = latest.reduce((a, c) => a + (Number(c.actualTime) || 0), 0);
  const designed = latest.reduce((a, c) => a + (Number(c.designedTime) || 0), 0);
  const downtimeCards = latest.filter(c => hasDowntime(c) || variance(c) > 0);
  const approved = latest.filter(c => c.approvalStatus === 'approved').length;

  // Per-line coverage of MAJOR stations for this model family.
  const lines = LINES.map(l => {
    const codes = Object.entries(STATIONS)
      .filter(([code, s]) => s.line === l.id && !isSubassembly(code) && s.active !== false && (!fam || !s.models || s.models.includes(fam)))
      .map(([code]) => code);
    const logged = codes.filter(code => byCode.has(code));
    return { id: l.id, label: l.label, total: codes.length, logged: logged.length };
  }).filter(l => l.total > 0);
  const totalMajor = lines.reduce((a, l) => a + l.total, 0);
  const loggedMajor = lines.reduce((a, l) => a + l.logged, 0);

  const causeTotals = {};
  for (const c of latest) {
    const dt = c.downtime || c.overrun;
    if (!dt) continue;
    for (const m of dt.selMs || []) causeTotals[m] = (causeTotals[m] || 0) + (Number(dt.causeTimes?.[m]) || 0);
  }
  const consumables = {};
  for (const c of latest) {
    const add = (name, qty) => {
      const k = String(name).trim(); if (!k) return;
      const n = Number(qty);
      const e = (consumables[k] ||= { name: k, qty: 0, stations: new Set() });
      if (Number.isFinite(n)) e.qty += n;
      e.stations.add(c.stationCode);
    };
    Object.entries(c.resourcesUsed || {}).forEach(([n, q]) => { if (Number(q) > 0) add(n, q); });
    (c.otherResources || []).forEach(r => { if (Number(r.qty) > 0) add(r.name, r.qty); });
  }
  const exceptions = [];
  for (const c of latest) {
    for (const [a, s] of Object.entries(c.activityStatuses || {})) {
      if (['incomplete', 'issue', 'rework'].includes(s)) exceptions.push({ code: c.stationCode, activity: a, status: s });
    }
  }
  const team = {};
  for (const c of latest) for (const o of c.operators || []) team[o] = (team[o] || 0) + 1;

  const times = latest.flatMap(c => [c.clockIn, c.clockOut, c.timestamp]).map(x => new Date(x)).filter(d => !isNaN(d));
  return {
    cards: latest, vin: first.vin || '', project: (latest.find(c => c.project) || first).project || '', model, fam,
    actual, designed, downtimeCards, approved, lines, totalMajor, loggedMajor, causeTotals,
    consumables: Object.values(consumables).sort((a, b) => b.qty - a.qty),
    exceptions, team: Object.entries(team).sort((a, b) => b[1] - a[1]),
    from: times.length ? new Date(Math.min(...times)) : null, to: times.length ? new Date(Math.max(...times)) : null,
  };
}

export function busReportHTML(cards, { theme = 'light' } = {}) {
  const t = TOKENS[theme] || TOKENS.light;
  const S = summariseBus(cards);
  const v = S.actual - S.designed;
  const eff = S.actual > 0 && S.designed > 0 ? Math.round((S.designed / S.actual) * 100) : null;
  const cover = S.totalMajor ? Math.round((S.loggedMajor / S.totalMajor) * 100) : 0;

  // Station log grouped by line, in line order then station order.
  const lineOrder = Object.fromEntries(LINES.map((l, i) => [l.label, i]));
  const groups = {};
  for (const c of S.cards) (groups[baseLine(c.line) || 'Other'] ||= []).push(c);
  const orderOf = c => STATIONS[String(c.stationCode || '').toUpperCase()]?.order ?? 999;
  const groupNames = Object.keys(groups).sort((a, b) => (lineOrder[a] ?? 99) - (lineOrder[b] ?? 99));
  const logRows = groupNames.map(g => `<tr class="band"><td colspan="6">${esc(g)} · ${groups[g].length} station${groups[g].length === 1 ? '' : 's'}</td></tr>` +
    groups[g].sort((a, b) => orderOf(a) - orderOf(b)).map(c => {
      const cv = variance(c);
      const acts = Object.values(c.activityStatuses || {});
      const ok = acts.filter(s => s === 'complete').length;
      const name = STATIONS[String(c.stationCode || '').toUpperCase()]
        ? stationNameForModel({ code: String(c.stationCode).toUpperCase(), ...STATIONS[String(c.stationCode).toUpperCase()] }, c.busModel)
        : stationTitle(c.station);
      return `<tr data-break class="${cv > 0 ? 'late' : ''}"><td class="code"><b>${esc(c.stationCode)}</b></td><td>${esc(name)}<div class="muted" style="font-size:10px">${fmtDate(c.clockOut || c.timestamp)} · ${esc((c.operators || []).join(', ') || '—')}</div></td>
        <td class="num">${fmtDur(c.actualTime)}<div class="muted" style="font-size:10px">of ${fmtDur(c.designedTime)}</div></td>
        <td class="num">${cv > 0 ? pill('crit', `+${cv} min`) : pill('ok', cv < 0 ? `${cv} min` : 'On time')}</td>
        <td class="num">${ok}/${acts.length}</td><td class="num">${approvalPill(c.approvalStatus)}</td></tr>`;
    }).join('')).join('');

  const causes = Object.entries(S.causeTotals).sort((a, b) => b[1] - a[1]);
  const maxCause = Math.max(1, ...causes.map(([, m]) => m));

  return `<div class="rp"><style>${css(t)}</style>
    ${topBar(t, 'Full Bus Report', [DOC_CODE, `Generated ${stamp()}`])}
    ${hero({
      kicker: `${S.model || 'Bus'} · ${S.project || 'Project —'}`,
      title: `VIN ${S.vin || '—'}`,
      metaHtml: `<b>${S.cards.length}</b> station cards · <b>${S.loggedMajor}</b> of ${S.totalMajor} production stations logged<br/>${S.from ? `${fmtDate(S.from)} → ${fmtDate(S.to)}` : ''}`,
      badgeHtml: pill(cover >= 100 ? 'ok' : 'info', `${cover}% of build logged`) + pill(S.approved === S.cards.length && S.cards.length ? 'ok' : 'warn', `${S.approved}/${S.cards.length} approved`),
      model: S.model,
    })}
    ${kpiBand([
      { lab: 'Stations logged', val: String(S.cards.length), cls: 'gold', sub: `${cover}% of build` },
      { lab: 'Productive time', val: fmtDur(S.actual), cls: 'dark' },
      { lab: 'Designed time', val: fmtDur(S.designed) },
      { lab: 'Variance', val: `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtDur(Math.abs(v))}`, dot: v > 0 ? t.crit : t.ok, sub: v > 0 ? 'over designed' : 'on or under' },
      { lab: 'Efficiency', val: eff == null ? '—' : `${eff}%`, dot: eff != null && eff < 100 ? t.warn : t.ok },
      { lab: 'Downtime events', val: String(S.downtimeCards.length), dot: S.downtimeCards.length ? t.crit : t.ok },
    ])}
    <div class="card" data-break><h3>Build progress by line <span class="cnt">${S.loggedMajor}/${S.totalMajor} stations</span></h3>
      ${S.lines.map(l => `<div class="msrow"><div class="nm">${esc(l.label)}</div><div class="bar gold"><i style="width:${l.total ? Math.round((l.logged / l.total) * 100) : 0}%"></i></div><div class="pc">${l.logged}/${l.total}</div></div>`).join('')}
    </div>
    <div class="card"><h3>Station log</h3>
      ${S.cards.length ? `<table><thead><tr><th>Code</th><th>Station</th><th class="num">Time</th><th class="num">Variance</th><th class="num">Activities</th><th class="num">Status</th></tr></thead><tbody>${logRows}</tbody></table>` : '<div class="empty">No travel cards filed for this VIN yet.</div>'}
    </div>
    <div class="grid2">
      <div class="card" data-break><h3>Downtime by cause</h3>
        ${causes.length ? causes.map(([m, mins]) => `<div class="msrow" style="grid-template-columns:120px 1fr 56px"><div class="nm">${esc(m)}</div><div class="bar crit"><i style="width:${Math.round((mins / maxCause) * 100)}%"></i></div><div class="pc">${mins} min</div></div>`).join('') : '<div class="empty">No downtime causes recorded.</div>'}
      </div>
      <div class="card" data-break><h3>Team <span class="cnt">${S.team.length} people</span></h3>
        <div class="ops">${S.team.map(([n, k]) => `<span class="op">${esc(n)} · ${k}</span>`).join('') || '<span class="empty">No operators recorded</span>'}</div>
      </div>
    </div>
    <div class="card"><h3>Activity exceptions <span class="cnt">${S.exceptions.length}</span></h3>
      ${S.exceptions.length ? `<table><thead><tr><th>Station</th><th>Activity</th><th class="num">Status</th></tr></thead><tbody>
        ${S.exceptions.map(x => `<tr data-break><td class="code"><b>${esc(x.code)}</b></td><td>${esc(x.activity)}</td><td class="num">${actPill(x.status)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Every recorded activity was completed.</div>'}
    </div>
    <div class="card"><h3>Consumables used <span class="cnt">${S.consumables.length} items</span></h3>
      ${S.consumables.length ? `<table><thead><tr><th>Item</th><th>Stations</th><th class="num">Total qty</th></tr></thead><tbody>
        ${S.consumables.map(c => `<tr data-break><td>${esc(c.name)}</td><td class="muted">${esc([...c.stations].join(', '))}</td><td class="num"><b>${esc(Math.round(c.qty * 100) / 100)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No consumables recorded.</div>'}
    </div>
  </div>`;
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
  return Promise.all([...el.querySelectorAll('img')].map(img => (img.complete && img.naturalWidth)
    ? null
    : new Promise(res => { img.onload = img.onerror = res; })));
}

async function htmlToPdf(html, { theme, fileName, save = true }) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const t = TOKENS[theme] || TOKENS.light;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W_PX}px;z-index:-1;pointer-events:none`;
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

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, topM = 8, bottomM = 12;
    const mmPerPx = pageW / PAGE_W_PX;
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
      pdf.text(`KIIRA MOTORS CORPORATION  ·  ${DOC_CODE.replace('·', '-')}`, 9, pageH - 5);
      pdf.text(`Page ${i + 1} of ${pages.length}`, pageW - 9, pageH - 5, { align: 'right' });
    });
    if (save) pdf.save(fileName);
    return pdf;
  } finally {
    host.remove();
  }
}

const safeName = s => String(s || '').replace(/[^\w.-]+/g, '_');

// save:false returns the jsPDF document instead of downloading it (tests/previews).
export function downloadStationReport(sub, { theme = 'light', save = true } = {}) {
  const day = new Date(sub.timestamp || Date.now()).toISOString().slice(0, 10);
  return htmlToPdf(stationReportHTML(sub, { theme }), { theme, save, fileName: `Station_Report_${safeName(sub.stationCode)}_${safeName(sub.vin)}_${day}.pdf` });
}

export function downloadBusReport(cards, { theme = 'light', vin = '', save = true } = {}) {
  const day = new Date().toISOString().slice(0, 10);
  return htmlToPdf(busReportHTML(cards, { theme }), { theme, save, fileName: `Full_Bus_Report_${safeName(vin || cards[0]?.vin)}_${day}.pdf` });
}
