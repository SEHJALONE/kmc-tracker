import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { fetchSubmissions } from '../hooks/useSubmissionsData';
import { fetchDowntimeLog, parseDowntimeLog } from '../hooks/useScoreboardData';
import { ORG_UNITS, DIVISIONS, orgUnit, defaultUnitForLines } from '../data/orgStructure';
import { buildDailyLog, averageActual, isoLocal, FORM_NO, REASON_CODES } from '../utils/dailyLogModel';
import { downloadDailyLogDocx } from '../utils/dailyLogDocx';

// ── DPN Operations Daily Log (Word) ──────────────────────────────────────
// Picks a unit and a day, prefills the log from that day's Travel Cards and
// the Production Downtime Log, lets the person correct anything, then fills
// the issued FM013 Word template with it. `C` is the Scoreboard's palette.

const readJSON = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const readStr = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

const BLANK_TASK = { task: '', planned: '', actual: '', downtime: '', reason: '', remarks: '', source: 'Manual' };

export default function DailyLogModal({ onClose, C, font }) {
  const [date, setDate] = useState(() => isoLocal(new Date()));
  const [unitId, setUnitId] = useState(() => defaultUnitForLines(readJSON('kmc_assigned_lines'))?.id || ORG_UNITS[0].id);
  const [sources, setSources] = useState(null);       // { submissions, downtimeEvents, at }
  const [loadErr, setLoadErr] = useState('');
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  // The two sources are fetched once per open; each fails soft on its own.
  useEffect(() => {
    let live = true;
    Promise.allSettled([fetchSubmissions({ withDowntime: true }), fetchDowntimeLog()]).then(([s, d]) => {
      if (!live) return;
      const errs = [];
      if (s.status !== 'fulfilled') errs.push('Travel Cards');
      if (d.status !== 'fulfilled') errs.push('Downtime Log');
      setLoadErr(errs.length ? `Could not load ${errs.join(' or ')}; fill those rows by hand.` : '');
      setSources({
        submissions: s.status === 'fulfilled' ? s.value : [],
        downtimeEvents: d.status === 'fulfilled' ? parseDowntimeLog(d.value) : [],
        at: new Date(),
      });
    });
    return () => { live = false; };
  }, []);

  const prefill = useCallback(() => {
    if (!sources) return;
    setLog(buildDailyLog({
      date, unitId,
      submissions: sources.submissions,
      downtimeEvents: sources.downtimeEvents,
      preparedBy: { name: readStr('kmc_user_fullname'), role: readStr('kmc_role') || 'user' },
    }));
    setStatus(null);
  }, [sources, date, unitId]);

  // A new unit or day starts a fresh prefill.
  useEffect(() => { prefill(); }, [prefill]);

  const set = patch => setLog(l => ({ ...l, ...patch }));
  const setTask = (i, patch) => setLog(l => ({ ...l, tasks: l.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const addTask = () => setLog(l => ({ ...l, tasks: [...l.tasks, { ...BLANK_TASK }] }));
  const removeTask = i => setLog(l => ({ ...l, tasks: l.tasks.filter((_, j) => j !== i) }));
  const setPerson = (who, patch) => setLog(l => ({ ...l, [who]: { ...l[who], ...patch } }));

  async function download() {
    const bad = log.tasks.find(t => Number(t.downtime) > 0 && !t.reason);
    if (bad) { setStatus({ ok: false, msg: `Pick a reason code for "${bad.task || 'the row'}" — it has downtime.` }); return; }
    if (log.tasks.some(t => t.reason === 'D6') && !log.otherDowntimeReason.trim()) {
      setStatus({ ok: false, msg: 'A row uses D6: describe it under "Other Downtime Reason".' }); return;
    }
    setBusy(true); setStatus(null);
    try {
      await downloadDailyLogDocx(log);
      setStatus({ ok: true, msg: 'Word document saved.' });
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  const field = { width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.line}`, color: C.ink, borderRadius: 8, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit' };
  const cellIn = { ...field, padding: '5px 6px', borderRadius: 6, fontSize: 11.5 };
  const label = { fontFamily: font, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5, display: 'block' };
  const th = { ...label, marginBottom: 0, padding: '0 4px 6px', textAlign: 'left', fontWeight: 600 };
  const btn = { border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const pctIn = v => (v === '' ? '' : Math.max(0, Math.min(100, Number(v))));
  const division = orgUnit(unitId)?.division || '';
  const score = log ? averageActual(log.tasks) : '';

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,16,30,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.glassBorder}`, borderRadius: 16, width: 'min(1040px, 96vw)', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box', padding: 20, color: C.ink, boxShadow: C.shadowLg, fontFamily: "'Inter', Arial, sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.014em' }}>Operations Daily Log</div>
          <div style={{ fontFamily: font, fontSize: 10, color: C.muted }}>Department of Production · {FORM_NO}</div>
        </div>
        <div style={{ fontSize: 11, color: loadErr ? C.amber : C.muted, marginBottom: 14 }}>
          {!sources ? 'Loading Travel Cards and the Downtime Log…'
            : loadErr || `Prefilled from ${log?.sources.cards ?? 0} Travel Card(s) and ${log?.sources.events ?? 0} Downtime Log event(s) · fetched ${sources.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Check every row before saving.`}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div><span style={label}>Date</span><input type="date" style={field} value={date} onChange={e => setDate(e.target.value)} /></div>
          <div style={{ gridColumn: 'span 2' }}>
            <span style={label}>Unit</span>
            <select style={field} value={unitId} onChange={e => setUnitId(e.target.value)}>
              {DIVISIONS.map(d => (
                <optgroup key={d} label={d}>
                  {ORG_UNITS.filter(u => u.division === d).map(u => <option key={u.id} value={u.id}>{u.unit}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}><span style={label}>Division</span><div style={{ ...field, background: 'transparent' }}>{division}</div></div>
          <div><span style={label}>Start time</span><input style={field} value={log?.startTime || ''} onChange={e => set({ startTime: e.target.value })} /></div>
          <div><span style={label}>Finishing time</span><input style={field} value={log?.finishTime || ''} onChange={e => set({ finishTime: e.target.value })} /></div>
        </div>

        {log && (
          <>
            <span style={label}>Activities performed</span>
            <div style={{ overflowX: 'auto', marginBottom: 8 }}>
              <table style={{ width: '100%', minWidth: 820, borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 24 }}>SN</th>
                    <th style={th}>Task</th>
                    <th style={{ ...th, width: 72 }}>Planned %</th>
                    <th style={{ ...th, width: 72 }}>Actual %</th>
                    <th style={{ ...th, width: 76 }}>Downtime h</th>
                    <th style={{ ...th, width: 70 }}>Reason</th>
                    <th style={{ ...th, width: 200 }}>Remarks</th>
                    <th style={{ ...th, width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {log.tasks.map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: C.muted, padding: '0 4px' }} title={t.source}>{i + 1}</td>
                      <td style={{ padding: '0 4px' }}><input style={cellIn} value={t.task} onChange={e => setTask(i, { task: e.target.value })} /></td>
                      <td style={{ padding: '0 4px' }}><input type="number" min="0" max="100" style={cellIn} value={t.planned} onChange={e => setTask(i, { planned: pctIn(e.target.value) })} /></td>
                      <td style={{ padding: '0 4px' }}><input type="number" min="0" max="100" style={cellIn} value={t.actual} onChange={e => setTask(i, { actual: pctIn(e.target.value) })} /></td>
                      <td style={{ padding: '0 4px' }}><input type="number" min="0" step="0.25" style={cellIn} value={t.downtime} onChange={e => setTask(i, { downtime: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} /></td>
                      <td style={{ padding: '0 4px' }}>
                        <select style={cellIn} value={t.reason} onChange={e => setTask(i, { reason: e.target.value })}>
                          <option value="">—</option>
                          {REASON_CODES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0 4px' }}><input style={cellIn} value={t.remarks} onChange={e => setTask(i, { remarks: e.target.value })} /></td>
                      <td style={{ padding: '0 4px' }}>
                        <button onClick={() => removeTask(i)} title="Remove row" style={{ ...btn, padding: '4px 8px', background: 'transparent', color: C.muted }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!log.tasks.length && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 4px' }}>No Travel Cards or downtime for this unit on this day. Add the day's tasks by hand.</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              <button onClick={addTask} style={{ ...btn, padding: '6px 12px', background: C.surface2, color: C.ink2 }}>+ Add task</button>
              <button onClick={prefill} style={{ ...btn, padding: '6px 12px', background: C.surface2, color: C.ink2 }} title="Discard edits and prefill again">Reset to prefill</button>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 12 }}>Score (average actual status): <b>{score === '' ? '—' : `${score}%`}</b></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div><span style={label}>Other downtime reason (where applicable)</span><textarea rows={3} style={field} value={log.otherDowntimeReason} onChange={e => set({ otherDowntimeReason: e.target.value })} /></div>
              <div><span style={label}>Supervisor's comment</span><textarea rows={3} style={field} value={log.supervisorComment} onChange={e => set({ supervisorComment: e.target.value })} /></div>
            </div>

            <span style={label}>Sign off</span>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              {[['operator', "Operator's"], ['supervisor', "Supervisor's"]].map(([who, title]) => (
                <div key={who} style={{ display: 'contents' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
                  <input style={field} placeholder="Name" value={log[who].name} onChange={e => setPerson(who, { name: e.target.value })} />
                  <input style={field} placeholder="Designation" value={log[who].designation} onChange={e => setPerson(who, { designation: e.target.value })} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 12 }}>The Signature column is left blank for signing on the printed form.</div>
          </>
        )}

        {status && <div style={{ fontSize: 11.5, color: status.ok ? C.green : C.red, marginBottom: 8 }}>{status.msg}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btn, background: C.surface2, color: C.ink2 }}>Close</button>
          <button onClick={download} disabled={busy || !log} style={{ ...btn, background: C.red, color: '#fff', opacity: busy || !log ? 0.6 : 1 }}>
            {busy ? 'Building…' : 'Download Word'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
