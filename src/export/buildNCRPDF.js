// ── NCR reports (single Non-Conformance Report + Register) ──────────────────
// Same look as the Travel Card reports: written as HTML with the shared report
// kit (./reportKit.js), then captured to an A4 PDF. Long descriptions wrap and
// flow onto further pages instead of being cut off.
import { TOKENS, css, esc, pill, stamp, safeName, topBar, hero, kpiBand, htmlToPdf } from './reportKit.js';

const DOC_CODE = 'KMC.DQHSE.02/26-PR009';
const DOC_TITLE = 'Control of Non-Conformities';

const SEVERITY_TONE = { Critical: 'crit', Major: 'warn', Minor: 'ok' };
const STATUS_TONE = { 'Open': 'warn', 'In Progress': 'info', 'Closed': 'ok', 'Concession Approved': 'slate' };

const val = v => (v && String(v).trim() ? String(v).trim() : '-');
function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
const sevPill = s => pill(SEVERITY_TONE[s] || 'none', val(s));
const statPill = s => pill(STATUS_TONE[s] || 'none', val(s));
const idOf = ncr => val(ncr.id || ncr.ncrId);

function daysOpen(ncr) {
  const from = new Date(ncr.date || ncr.timestamp);
  if (isNaN(from)) return null;
  const to = ncr.closedDate && !isNaN(new Date(ncr.closedDate)) ? new Date(ncr.closedDate) : new Date();
  return Math.max(0, Math.round((to - from) / 86400000));
}
function isOverdue(ncr) {
  const due = new Date(ncr.dueDate);
  return !isNaN(due) && ncr.status !== 'Closed' && due < new Date();
}

const textCard = (title, text) => `<div class="card" data-break><h3>${esc(title)}</h3>
  ${text && String(text).trim() ? `<div class="note">${esc(String(text).trim())}</div>` : '<div class="empty">Not recorded.</div>'}</div>`;

// ── Single NCR ──────────────────────────────────────────────────────────────
export function ncrReportHTML(ncr, { theme = 'light' } = {}) {
  const t = TOKENS[theme] || TOKENS.light;
  const days = daysOpen(ncr);
  const overdue = isOverdue(ncr);
  const closed = ncr.status === 'Closed';

  return `<div class="rp"><style>${css(t)}</style>
    ${topBar(t, 'Non-Conformance Report', [DOC_CODE, `Generated ${stamp()}`], DOC_TITLE)}
    ${hero({
      slim: true,
      kicker: [ncr.domain, ncr.ncrType].filter(Boolean).join(' · ') || 'Non-conformance',
      title: idOf(ncr),
      metaHtml: `<b>Raised</b> ${esc(fmtDate(ncr.date || ncr.timestamp))} &nbsp;·&nbsp; <b>Station</b> ${esc(val(ncr.stationCode))}<br/><b>VIN / asset</b> ${esc(val(ncr.vin))}`,
      badgeHtml: sevPill(ncr.severity) + statPill(ncr.status) + (overdue ? pill('crit', 'Overdue') : ''),
    })}
    ${kpiBand([
      { lab: 'Severity', val: val(ncr.severity), dot: t[SEVERITY_TONE[ncr.severity]] || t.muted },
      { lab: 'Status', val: val(ncr.status), cls: 'dark' },
      { lab: closed ? 'Days to close' : 'Days open', val: days == null ? '-' : String(days), cls: 'gold' },
      { lab: 'Due date', val: fmtDate(ncr.dueDate), dot: overdue ? t.crit : t.ok, sub: overdue ? 'overdue' : (closed ? 'closed' : '') },
    ])}
    <div class="grid2">
      <div class="card" data-break><h3>Classification</h3><dl class="kv">
        <dt>Domain</dt><dd>${esc(val(ncr.domain))}</dd>
        <dt>NCR type</dt><dd>${esc(val(ncr.ncrType))}</dd>
        <dt>Disposition</dt><dd>${esc(val(ncr.disposition))}</dd>
        <dt>RCA method</dt><dd>${esc(val(ncr.rcaMethod))}</dd></dl></div>
      <div class="card" data-break><h3>People and dates</h3><dl class="kv">
        <dt>Raised by</dt><dd>${esc(val(ncr.raisedBy))}</dd>
        <dt>Assigned to</dt><dd>${esc(val(ncr.assignedTo))}</dd>
        <dt>Due</dt><dd>${esc(fmtDate(ncr.dueDate))}</dd>
        <dt>Closed</dt><dd>${esc(fmtDate(ncr.closedDate))}</dd></dl></div>
    </div>
    ${textCard('Non-conformance description', ncr.description)}
    ${textCard('Root cause', ncr.rootCause)}
    ${textCard('Corrective action', ncr.correctiveAction)}
    ${textCard('Preventive action', ncr.preventiveAction)}
    <div class="card" data-break><h3>Sign-off</h3>
      <div class="sign" style="--sn:3"><div>Quality / HSE representative</div><div>Production manager</div><div>Date</div></div></div>
  </div>`;
}

// ── Register ────────────────────────────────────────────────────────────────
export function ncrRegisterHTML(ncrs, filterLabel = 'All NCRs', { theme = 'light' } = {}) {
  const t = TOKENS[theme] || TOKENS.light;
  const count = pred => ncrs.filter(pred).length;
  const open = count(n => n.status !== 'Closed');
  const rows = ncrs.map(n => `<tr data-break class="${isOverdue(n) ? 'late' : ''}">
      <td class="code"><b>${esc(idOf(n))}</b><div class="muted" style="font-size:10px">${esc(fmtDate(n.timestamp || n.date))}</div></td>
      <td>${esc(val(n.domain))}<div class="muted" style="font-size:10px">${esc(val(n.ncrType))}</div></td>
      <td>${esc(val(n.description))}</td>
      <td class="num">${sevPill(n.severity)}</td>
      <td class="num">${statPill(n.status)}</td></tr>`).join('');

  return `<div class="rp"><style>${css(t)}</style>
    ${topBar(t, 'Non-Conformance Register', [DOC_CODE, `Generated ${stamp()}`], DOC_TITLE)}
    ${hero({
      slim: true,
      kicker: `Filter · ${filterLabel}`,
      title: `${ncrs.length} record${ncrs.length === 1 ? '' : 's'}`,
      metaHtml: `<b>${open}</b> still open &nbsp;·&nbsp; <b>${count(isOverdue)}</b> past the due date`,
      badgeHtml: Object.keys(STATUS_TONE).filter(s => count(n => n.status === s)).map(s => pill(STATUS_TONE[s], `${s}: ${count(n => n.status === s)}`)).join(''),
    })}
    ${kpiBand([
      { lab: 'Records', val: String(ncrs.length), cls: 'gold' },
      { lab: 'Open', val: String(open), cls: 'dark' },
      { lab: 'Critical', val: String(count(n => n.severity === 'Critical')), dot: count(n => n.severity === 'Critical') ? t.crit : t.ok },
      { lab: 'Overdue', val: String(count(isOverdue)), dot: count(isOverdue) ? t.crit : t.ok },
      { lab: 'Closed', val: String(count(n => n.status === 'Closed')), dot: t.ok },
    ])}
    <div class="card"><h3>Register <span class="cnt">${ncrs.length}</span></h3>
      <table><thead><tr><th>NCR</th><th>Domain / type</th><th>Description</th><th class="num">Severity</th><th class="num">Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

export async function buildNCRPDF(ncr, { theme = 'light' } = {}) {
  return htmlToPdf(ncrReportHTML(ncr, { theme }), {
    theme, footer: `${DOC_CODE} - ${idOf(ncr)}`, fileName: `NCR-${safeName(ncr.id || ncr.ncrId || 'report')}.pdf`,
  });
}

export async function buildNCRRegisterPDF(ncrs, filterLabel = 'All NCRs', { theme = 'light' } = {}) {
  if (!ncrs?.length) return null;
  return htmlToPdf(ncrRegisterHTML(ncrs, filterLabel, { theme }), {
    theme, footer: `${DOC_CODE} - ${filterLabel}`,
    fileName: `NCR-Register-${safeName(filterLabel)}-${new Date().toISOString().slice(0, 10)}.pdf`,
  });
}
