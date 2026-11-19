import { useState } from 'react';
import { sendViaAppsScript } from '../../data/mailer';
import { buildJobReport, jobReportRows, downloadCsv, fmtAmounts, makeItem, JOB_STATES } from '../../data/jobOrders';
import { workingMinutes } from '../../utils/workTime';
import { JOB_ERRORS } from '../../hooks/useJobData';
import { downloadJobReportPdf, periodLabel } from '../../export/jobOrderReport';

// Reports: pick a month (or any dates), see the totals, download the PDF
// report or a CSV that opens in Excel.

const inp = { padding: '8px 10px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const th = { fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', fontSize: 12.5, borderTop: '1px solid var(--border-subtle)' };
const tdn = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const pad = n => String(n).padStart(2, '0');
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const hours = m => (m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m} min`);
// Machine time = working minutes (shift hours, breaks out), as on the cards.
const runMinutes = r => workingMinutes(new Date(r.startedAt), new Date(r.closedAt || Date.now())).net;

export function periodFor(mode, month, fromDay, toDay) {
  if (mode === 'month') {
    const [y, m] = month.split('-').map(Number);
    return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
  }
  const [a, b] = [fromDay, toDay].map(s => s.split('-').map(Number));
  return { from: new Date(a[0], a[1] - 1, a[2]).toISOString(), to: new Date(b[0], b[1] - 1, b[2] + 1).toISOString() };
}

function Table({ head, rows, num = [] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => <th key={h} style={{ ...th, textAlign: num.includes(i) ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, i) => <td key={i} style={num.includes(i) ? tdn : td}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function JobReport() {
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(thisMonth());
  const today = new Date();
  const [fromDay, setFromDay] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`);
  const [toDay, setToDay] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError(''); setBusy('load');
    try {
      const period = periodFor(mode, month, fromDay, toDay);
      const r = await sendViaAppsScript('jobReport', period);
      const jobs = (r.jobOrders || []).map(j => ({ ...j, items: (j.items || []).map(makeItem) }));
      const built = buildJobReport(jobs, r.runs || [], { ...period, minutes: runMinutes });
      setRep(built);
      return built;
    } catch (e) {
      setError(JOB_ERRORS[e.message] || (/unknown-action|empty-submission/i.test(e.message) ? 'The server script does not have reports yet. Redeploy the Apps Script, then try again.' : e.message));
      return null;
    } finally { setBusy(''); }
  }
  async function pdf() {
    const r = rep || await load();
    if (!r) return;
    setBusy('pdf');
    try { await downloadJobReportPdf(r); } catch (e) { setError(e.message); }
    setBusy('');
  }
  async function csv() {
    const r = rep || await load();
    if (r) downloadCsv(`Machine-Shop-report_${r.from.slice(0, 10)}.csv`, jobReportRows(r));
  }
  const change = f => v => { f(v); setRep(null); };
  const T = rep?.totals;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="kmc-panel" style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={`kmc-btn${mode === 'month' ? ' primary' : ''}`} onClick={() => change(setMode)('month')}>Month</button>
          <button className={`kmc-btn${mode === 'range' ? ' primary' : ''}`} onClick={() => change(setMode)('range')}>Dates</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {mode === 'month'
            ? <div><label style={label} htmlFor="rep-month">Month</label><input id="rep-month" type="month" style={inp} value={month} max={thisMonth()} onChange={e => change(setMonth)(e.target.value)} /></div>
            : <>
                <div><label style={label} htmlFor="rep-from">From</label><input id="rep-from" type="date" style={inp} value={fromDay} onChange={e => change(setFromDay)(e.target.value)} /></div>
                <div><label style={label} htmlFor="rep-to">To (inclusive)</label><input id="rep-to" type="date" style={inp} value={toDay} onChange={e => change(setToDay)(e.target.value)} /></div>
              </>}
          <button className="kmc-btn" disabled={!!busy} onClick={load}>{busy === 'load' ? 'Loading…' : 'Show report'}</button>
          <button className="kmc-btn primary" disabled={!!busy} onClick={pdf}>{busy === 'pdf' ? 'Building PDF…' : 'Download PDF'}</button>
          <button className="kmc-btn" disabled={!!busy} onClick={csv}>Download CSV (Excel)</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Covers the job orders set up, machined or still open in the period: jobs done, models and buses served, material cut (parts ticked off on the machines), waste recorded by the operators and machine time.
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>{error}</div>}
      </div>

      {rep && (
        <>
          <div className="kmc-label">{periodLabel(rep.from, rep.to)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              ['Job orders', T.jobs, `${T.finished} finished`],
              ['Buses served', T.buses, `${rep.models.length} models`],
              ['Pieces cut', T.pieces, `${T.parts} part lines`],
              ['Material cut', `${T.metres} m`, 'sections, by length'],
              ['Waste', fmtAmounts(rep.wasteTotal), `${rep.waste.length} entries`],
              ['Machine time', hours(T.minutes), `${rep.machines.length} machines`],
            ].map(([l, v, s]) => (
              <div key={l} className="kmc-panel" style={{ padding: '12px 14px' }}>
                <div style={{ ...th, padding: 0 }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-heading)', margin: '4px 0 2px' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s}</div>
              </div>
            ))}
          </div>
          <div className="kmc-panel" style={{ padding: '12px 14px' }}>
            <div className="kmc-label" style={{ marginBottom: 6 }}>Job orders</div>
            {rep.jobs.length
              ? <Table head={['Job order', 'Model', 'VINs', 'Status', 'Cut in period (pcs)', 'Done / on order', 'Machines', 'Waste']} num={[2, 4, 5]}
                  rows={rep.jobs.map(j => [j.id, `${j.project} · ${j.busModel}`, j.vins.length, `${JOB_STATES[j.state][0]}${j.finished ? ' (finished in period)' : ''}`, j.piecesCut, `${j.done} / ${j.total}`, j.machines.join(', ') || '-', fmtAmounts(j.waste)])} />
              : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No job orders in this period.</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <div className="kmc-panel" style={{ padding: '12px 14px' }}>
              <div className="kmc-label" style={{ marginBottom: 6 }}>Models served</div>
              <Table head={['Model', 'Jobs', 'Finished', 'Buses', 'Pieces']} num={[1, 2, 3, 4]} rows={rep.models.map(m => [m.model, m.jobs, m.finished, m.vins, m.pieces])} />
            </div>
            <div className="kmc-panel" style={{ padding: '12px 14px' }}>
              <div className="kmc-label" style={{ marginBottom: 6 }}>Waste</div>
              {rep.waste.length
                ? <Table head={['Specification', 'Material', 'Amount', 'Unit']} num={[2]} rows={rep.waste.map(w => [w.spec, w.material || '-', Math.round(w.amount * 100) / 100, w.unit])} />
                : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No waste recorded.</div>}
            </div>
          </div>
          <div className="kmc-panel" style={{ padding: '12px 14px' }}>
            <div className="kmc-label" style={{ marginBottom: 6 }}>Material cut</div>
            {rep.specs.length
              ? <Table head={['Specification', 'Material', 'Parts', 'Pieces', 'Length (m)']} num={[2, 3, 4]} rows={rep.specs.map(s => [s.spec, s.material || '-', s.parts, s.pieces, s.metres ? Math.round(s.metres * 100) / 100 : '-'])} />
              : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No parts ticked off as cut in this period.</div>}
          </div>
        </>
      )}
    </div>
  );
}
