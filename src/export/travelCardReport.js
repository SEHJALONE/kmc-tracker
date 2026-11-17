// ── Travel Card reports (Station Report + Full Bus Report) ──────────────────
// Written as HTML with the shared report kit (./reportKit.js: navy hero, gold
// accent, white cards, status pills, light and dark palettes), then captured
// to an A4 PDF.
import { STATIONS, LINES, modelFamilyOf, stationNameForModel, isSubassembly } from '../data/stations';
import { parsePpe } from '../utils/ppe';
import { delayLabel } from '../utils/delay';
import { TOKENS, css, esc, pill, stamp, safeName, topBar, hero, kpiBand, htmlToPdf, planPageCuts } from './reportKit';
import { TRAVEL_CARD_DOC } from '../data/travelCardRef';

// Tests and callers import these from here.
export { esc, planPageCuts };

const DOC_CODE = TRAVEL_CARD_DOC;
const DOC_FOOTER = DOC_CODE.replaceAll(' · ', ' - ');

// Model cut-out renders in /public.
const MODEL_RENDER = {
  '7m EVS': '/7m EVS.png', '8.5m EVS': '/8.5m EVS.png', '10.5m EVS': '/10.5m EVS.png', '12m EVS': '/12m EVS.png',
  '10.5m KDC': '/10.5m KDC.png', '12m KDC': '/12m KDC.png', '13m KEC': '/13m KEC.png',
};

// ── Formatting helpers ──────────────────────────────────────────────────────
export function fmtDur(mins) {
  const m = Math.round(Number(mins));
  if (!Number.isFinite(m) || m < 0) return '-';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
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
// PPE line for the Team card: "Safety helmet ×4 · Safety boots ×4", or the bare
// count older cards stored.
function ppeText(raw) {
  const { items, total, legacy } = parsePpe(raw);
  if (legacy) return esc(total);
  const parts = Object.entries(items).map(([k, v]) => `${esc(k)} ×${v}`);
  return parts.length ? parts.join(' · ') : '-';
}

const actPill = st => { const [t, l] = ACT_STATUS[st] || ['none', st || 'Not set']; return pill(t, l); };
const approvalPill = st => { const [t, l] = APPROVAL[st] || ['slate', st || 'Not reviewed']; return pill(t, l); };

// ── STATION REPORT ──────────────────────────────────────────────────────────
export function stationReportHTML(sub, { theme = 'light' } = {}) {
  const t = TOKENS[theme] || TOKENS.light;
  const acts = Object.entries(sub.activityStatuses || {});
  const added = new Set(sub.addedActivities || []);
  // Optional minutes per activity (Nov 2026); the column shows only when any were given.
  const times = sub.activityTimes || {};
  const hasTimes = acts.some(([a]) => Number(times[a]) > 0);
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
      <dt>PPE issued</dt><dd>${ppeText(sub.hseResources)}</dd>
      <dt>Submitted by</dt><dd>${esc(sub.submittedBy || '-')}</dd>
      <dt>Submitted</dt><dd>${fmtDateTime(sub.timestamp)}</dd></dl></div>`;

  const actTable = `<div class="card"><h3>Activities <span class="cnt">${done} of ${acts.length} complete</span></h3>
    ${acts.length ? `<table><thead><tr><th>#</th><th>Activity</th>${hasTimes ? '<th class="num">Time</th>' : ''}<th class="num">Status</th></tr></thead><tbody>
      ${acts.map(([a, s], i) => `<tr data-break><td class="idx">${i + 1}</td><td>${esc(a)}${added.has(a) ? '<span class="tag">ADDED</span>' : ''}</td>${hasTimes ? `<td class="num">${times[a] ? fmtDur(times[a]) : '-'}</td>` : ''}<td class="num">${actPill(s)}</td></tr>`).join('')}
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
        <div class="bar crit"><i style="width:${Math.round((c.mins / max) * 100)}%"></i></div><div class="pc">${c.mins ? esc(c.mins) + ' min' : '-'}</div></div>`).join('')}
      <dl class="kv" style="margin-top:8px" data-break>
        ${dt.rcaMethod ? `<dt>RCA method</dt><dd>${esc(dt.rcaMethod)}</dd>` : ''}
        ${dt.category ? `<dt>Category</dt><dd>${esc(dt.category)}</dd>` : ''}
        <dt>Corrective action</dt><dd>${esc(dt.correctiveAction || '-')}</dd>
        ${dt.preventiveAction ? `<dt>Preventive action</dt><dd>${esc(dt.preventiveAction)}</dd>` : ''}
        ${dt.attachmentName ? `<dt>Evidence</dt><dd>${esc(dt.attachmentName)}</dd>` : ''}
      </dl>
      ${whys.length ? `<div style="margin-top:10px" data-break><div class="eyebrow" style="margin-bottom:4px">5 Whys</div>${whys.map((w, i) => `<div class="note"><b>Why ${i + 1}.</b> ${esc(w)}</div>`).join('')}</div>` : ''}
      ${dt.comments ? `<div class="note" style="margin-top:8px" data-break>${esc(dt.comments)}</div>` : ''}
    </div>`;
  }

  const delay = sub.unexpectedDelay && (sub.unexpectedDelay.types || []).length
    ? sub.unexpectedDelay.types.map(ty => { const l = delayLabel(sub.unexpectedDelay, ty); return l === 'flagged' ? ty : `${ty} (${l})`; }).join(', ')
    : '';
  const notes = (sub.ohsIssue || sub.wasteGenerated || sub.generalComments || delay) ? `<div class="card" data-break><h3>HSE &amp; notes</h3><dl class="kv">
      <dt>OHS issue</dt><dd>${esc(sub.ohsIssue || 'None reported')}</dd>
      <dt>Waste generated</dt><dd>${esc(sub.wasteGenerated || '-')}</dd>
      ${delay ? `<dt>Unexpected delay</dt><dd>${esc(delay)}</dd>` : ''}</dl>
      ${sub.generalComments ? `<div class="note" style="margin-top:8px">${esc(sub.generalComments)}</div>` : ''}</div>` : '';

  const signoff = `<div class="card" data-break><h3>Sign-off</h3><dl class="kv">
      <dt>Reviewer</dt><dd>${esc(sub.reviewer || '-')}</dd>
      <dt>Status</dt><dd>${approvalPill(sub.approvalStatus)}</dd>
      <dt>Review date</dt><dd>${fmtDate(sub.reviewDate)}</dd></dl>
      ${sub.reviewComments ? `<div class="note" style="margin-top:8px">${esc(sub.reviewComments)}</div>` : ''}
      <div class="sign"><div>Operator / Team lead signature</div><div>Supervisor signature</div></div></div>`;

  return `<div class="rp"><style>${css(t)}</style>
    ${topBar(t, 'Station Report', [DOC_CODE, `Generated ${stamp()}`])}
    ${hero({
      kicker: `${sub.stationCode || ''} · ${baseLine(sub.line)}`,
      title: stationTitle(sub.station),
      metaHtml: `<b>Project</b> ${esc(sub.project || '-')} &nbsp;·&nbsp; <b>Model</b> ${esc(sub.busModel || '-')}<br/><b>VIN</b> ${esc(sub.vin || '-')}`,
      badgeHtml: approvalPill(sub.approvalStatus) + (late ? pill('crit', `+${Math.max(0, v)} min downtime`) : pill('ok', 'Within designed time')),
      render: MODEL_RENDER[sub.busModel],
    })}
    ${kpiBand([
      { lab: 'Designed time', val: fmtDur(sub.designedTime) },
      { lab: 'Productive time', val: fmtDur(sub.actualTime), cls: 'dark' },
      { lab: 'Variance', val: `${v > 0 ? '+' : ''}${v} min`, dot: late ? t.crit : t.ok, sub: late ? 'over designed' : 'on or under' },
      { lab: 'Activities complete', val: `${done}/${acts.length}`, cls: 'gold', sub: acts.length ? `${Math.round((done / acts.length) * 100)}%` : '' },
      { lab: 'Team size', val: String((sub.operators || []).length), sub: `${parsePpe(sub.hseResources).total} PPE` },
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
      return `<tr data-break class="${cv > 0 ? 'late' : ''}"><td class="code"><b>${esc(c.stationCode)}</b></td><td>${esc(name)}<div class="muted" style="font-size:10px">${fmtDate(c.clockOut || c.timestamp)} · ${esc((c.operators || []).join(', ') || '-')}</div></td>
        <td class="num">${fmtDur(c.actualTime)}<div class="muted" style="font-size:10px">of ${fmtDur(c.designedTime)}</div></td>
        <td class="num">${cv > 0 ? pill('crit', `+${cv} min`) : pill('ok', cv < 0 ? `${cv} min` : 'On time')}</td>
        <td class="num">${ok}/${acts.length}</td><td class="num">${approvalPill(c.approvalStatus)}</td></tr>`;
    }).join('')).join('');

  const causes = Object.entries(S.causeTotals).sort((a, b) => b[1] - a[1]);
  const maxCause = Math.max(1, ...causes.map(([, m]) => m));

  return `<div class="rp"><style>${css(t)}</style>
    ${topBar(t, 'Full Bus Report', [DOC_CODE, `Generated ${stamp()}`])}
    ${hero({
      kicker: `${S.model || 'Bus'} · ${S.project || 'No project'}`,
      title: `VIN ${S.vin || '-'}`,
      metaHtml: `<b>${S.cards.length}</b> station cards · <b>${S.loggedMajor}</b> of ${S.totalMajor} production stations logged<br/>${S.from ? `${fmtDate(S.from)} → ${fmtDate(S.to)}` : ''}`,
      badgeHtml: pill(cover >= 100 ? 'ok' : 'info', `${cover}% of build logged`) + pill(S.approved === S.cards.length && S.cards.length ? 'ok' : 'warn', `${S.approved}/${S.cards.length} approved`),
      render: MODEL_RENDER[S.model],
    })}
    ${kpiBand([
      { lab: 'Stations logged', val: String(S.cards.length), cls: 'gold', sub: `${cover}% of build` },
      { lab: 'Productive time', val: fmtDur(S.actual), cls: 'dark' },
      { lab: 'Designed time', val: fmtDur(S.designed) },
      { lab: 'Variance', val: `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtDur(Math.abs(v))}`, dot: v > 0 ? t.crit : t.ok, sub: v > 0 ? 'over designed' : 'on or under' },
      { lab: 'Efficiency', val: eff == null ? '-' : `${eff}%`, dot: eff != null && eff < 100 ? t.warn : t.ok },
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


export const stationReportFileName = sub =>
  `Station_Report_${safeName(sub.stationCode)}_${safeName(sub.vin)}_${new Date(sub.timestamp || Date.now()).toISOString().slice(0, 10)}.pdf`;
export const busReportFileName = vin => `Full_Bus_Report_${safeName(vin)}_${new Date().toISOString().slice(0, 10)}.pdf`;

// save:false returns the jsPDF document instead of downloading it (email, tests, previews).
export function downloadStationReport(sub, { theme = 'light', save = true } = {}) {
  return htmlToPdf(stationReportHTML(sub, { theme }), { theme, save, fileName: stationReportFileName(sub), footer: DOC_FOOTER });
}

export function downloadBusReport(cards, { theme = 'light', vin = '', save = true } = {}) {
  return htmlToPdf(busReportHTML(cards, { theme }), { theme, save, fileName: busReportFileName(vin || cards[0]?.vin), footer: DOC_FOOTER });
}
