// ── Machine Shop period report (job orders) ─────────────────────────────────
// A month (or any period) of Machine Shop work, built from buildJobReport():
// jobs worked and finished, models and buses served, material cut, waste and
// machine time. Same report kit as the Travel Card reports.
import { TOKENS, css, esc, pill, stamp, topBar, hero, kpiBand, htmlToPdf } from './reportKit';
import { JOB_STATES, fmtAmounts } from '../data/jobOrders';

const STATE_TONE = { running: 'ok', started: 'warn', waiting: 'none', machined: 'info', closed: 'slate' };
const hours = m => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`);
const num = v => (Math.round(v * 100) / 100).toLocaleString('en-GB');

export function periodLabel(from, to) {
  const a = new Date(from), b = new Date(new Date(to).getTime() - 1);
  const opts = { day: 'numeric', month: 'long', year: 'numeric' };
  if (a.getDate() === 1 && a.getMonth() === b.getMonth() && new Date(to).getDate() === 1) {
    return a.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  return `${a.toLocaleDateString('en-GB', opts)} to ${b.toLocaleDateString('en-GB', opts)}`;
}

export function jobReportHTML(rep, { theme = 'light' } = {}) {
  const t = TOKENS[theme] || TOKENS.light;
  const period = periodLabel(rep.from, rep.to);
  const T = rep.totals;
  const empty = text => `<div class="empty">${esc(text)}</div>`;

  const jobsRows = rep.jobs.map(j => `<tr data-break>
    <td class="code"><b>${esc(j.id)}</b><div class="muted" style="font-size:9.5px;white-space:normal">${esc(j.project)}</div></td><td>${esc(j.busModel)}</td>
    <td class="num">${j.vins.length}</td><td>${pill(STATE_TONE[j.state] || 'none', JOB_STATES[j.state]?.[0] || j.state)}${j.finished ? '<span class="tag">FINISHED</span>' : ''}</td>
    <td class="num">${j.partsCut} / ${j.piecesCut}</td><td class="num">${j.done} / ${j.total}</td>
    <td>${esc(j.machines.join(', ') || '-')}</td><td class="num">${j.minutes ? hours(j.minutes) : '-'}</td><td>${esc(fmtAmounts(j.waste))}</td></tr>`).join('');

  const modelRows = rep.models.map(m => `<tr data-break><td><b>${esc(m.model)}</b></td><td class="num">${m.jobs}</td><td class="num">${m.finished}</td><td class="num">${m.vins}</td><td class="num">${m.pieces}</td></tr>`).join('');
  const maxPieces = Math.max(1, ...rep.specs.map(s => s.pieces));
  const specRows = rep.specs.map(s => `<tr data-break><td><b>${esc(s.spec)}</b></td><td>${esc(s.material || '-')}</td><td class="num">${s.parts}</td><td class="num">${s.pieces}</td>
    <td class="num">${s.metres ? num(s.metres) : '-'}</td><td style="width:28%"><div class="bar gold"><i style="width:${(s.pieces / maxPieces) * 100}%"></i></div></td></tr>`).join('');
  const wasteRows = rep.waste.map(w => `<tr data-break><td><b>${esc(w.spec)}</b></td><td>${esc(w.material || '-')}</td><td class="num">${num(w.amount)}</td><td>${esc(w.unit)}</td></tr>`).join('');
  const maxMin = Math.max(1, ...rep.machines.map(m => m.minutes));
  const machineRows = rep.machines.map(m => `<tr data-break><td class="code"><b>${esc(m.code)}</b></td><td>${esc(String(m.station || '').replace(/^[^:]+:\s*/, ''))}</td>
    <td class="num">${m.runs}</td><td class="num">${hours(m.minutes)}</td><td style="width:24%"><div class="bar"><i style="width:${(m.minutes / maxMin) * 100}%"></i></div></td><td>${esc(m.operators.join(', '))}</td></tr>`).join('');

  return `<div class="rp"><style>${css(t)}</style>
    ${topBar(t, 'Machine Shop Report', [period, `${T.jobs} job orders`], 'Job Orders')}
    ${hero({
      kicker: 'Machine Shop · Job orders', title: period,
      metaHtml: `<b>${T.jobs}</b> job orders worked or set up · <b>${T.finished}</b> finished<br/><b>${T.buses}</b> buses on ${rep.models.length} model${rep.models.length === 1 ? '' : 's'}<br/>Generated ${esc(stamp())}`,
      slim: true,
    })}
    ${kpiBand([
      { lab: 'Job orders', val: T.jobs, sub: `${T.finished} finished`, cls: 'dark' },
      { lab: 'Buses served', val: T.buses, sub: `${rep.models.length} models` },
      { lab: 'Pieces cut', val: T.pieces.toLocaleString('en-GB'), sub: `${T.parts} part lines`, cls: 'gold' },
      { lab: 'Material cut', val: `${num(T.metres)} m`, sub: 'sections, by length' },
      { lab: 'Waste', val: fmtAmounts(rep.wasteTotal), sub: `${rep.waste.length} entries` },
      { lab: 'Machine time', val: hours(T.minutes), sub: `${rep.machines.length} machines` },
    ])}
    <div class="card"><h3>Job orders <span class="cnt">${rep.jobs.length}</span></h3>
      ${rep.jobs.length ? `<table><thead><tr><th>Job order</th><th>Model</th><th class="num">VINs</th><th>Status</th><th class="num">Cut<br/>parts / pcs</th><th class="num">Done /<br/>on order</th><th>Machines</th><th class="num">Time</th><th>Waste</th></tr></thead><tbody>${jobsRows}</tbody></table>` : empty('No job orders in this period.')}
    </div>
    <div class="grid2">
      <div class="card"><h3>Models served <span class="cnt">${rep.models.length}</span></h3>
        ${rep.models.length ? `<table><thead><tr><th>Model</th><th class="num">Jobs</th><th class="num">Finished</th><th class="num">Buses</th><th class="num">Pieces</th></tr></thead><tbody>${modelRows}</tbody></table>` : empty('None.')}
      </div>
      <div class="card"><h3>Waste <span class="cnt">${esc(fmtAmounts(rep.wasteTotal))}</span></h3>
        ${rep.waste.length ? `<table><thead><tr><th>Specification</th><th>Material</th><th class="num">Amount</th><th>Unit</th></tr></thead><tbody>${wasteRows}</tbody></table>` : empty('No waste recorded on the machines in this period.')}
      </div>
    </div>
    <div class="card"><h3>Material cut <span class="cnt">${T.pieces} pcs · ${num(T.metres)} m</span></h3>
      ${rep.specs.length ? `<table><thead><tr><th>Specification</th><th>Material</th><th class="num">Parts</th><th class="num">Pieces</th><th class="num">Length (m)</th><th></th></tr></thead><tbody>${specRows}</tbody></table>
      <div class="muted" style="margin-top:8px;font-size:10px">Pieces = quantity of every part ticked off as cut in the period. Length = pieces × the part's cut length, where the cut list gives one.</div>` : empty('No parts ticked off as cut in this period.')}
    </div>
    <div class="card"><h3>Machines <span class="cnt">${hours(T.minutes)}</span></h3>
      ${rep.machines.length ? `<table><thead><tr><th>Machine</th><th>Station</th><th class="num">Runs</th><th class="num">Time</th><th></th><th>Operators</th></tr></thead><tbody>${machineRows}</tbody></table>
      <div class="muted" style="margin-top:8px;font-size:10px">Working time from Start to Close of each machine run, breaks out (runs still open count up to now).</div>` : empty('No machine runs in this period.')}
    </div>
    <div class="sign" style="--sn:2" data-break><div>Machine Shop supervisor</div><div>Production manager</div></div>
  </div>`;
}

export function downloadJobReportPdf(rep, { theme = 'light' } = {}) {
  const name = `Machine-Shop-report_${rep.from.slice(0, 10)}_${new Date(new Date(rep.to).getTime() - 1).toISOString().slice(0, 10)}.pdf`;
  return htmlToPdf(jobReportHTML(rep, { theme }), { theme, fileName: name, footer: 'Machine Shop job orders' });
}
