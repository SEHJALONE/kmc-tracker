import { useState } from 'react';
import { useHandoverData, SHIFTS, LINES, HOUSEKEEPING_STATUSES } from '../hooks/useHandoverData';

export const STATUS_COLOR = {
  'Open':         '#f59e0b',
  'Acknowledged': '#10b981',
};

const inputSx = {
  width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px',
  border: '1px solid var(--border)', borderRadius: 4,
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  fontFamily: "'Inter', system-ui, sans-serif", outline: 'none',
};
function Inp(props) { return <input style={inputSx} {...props} />; }
function Sel({ children, ...p }) { return <select style={inputSx} {...p}>{children}</select>; }
function Ta(props) { return <textarea style={{ ...inputSx, minHeight: 72, resize: 'vertical', lineHeight: 1.5 }} {...props} />; }

function Field({ label, children, required, half }) {
  return (
    <div style={{ marginBottom: 14, gridColumn: half ? 'span 1' : 'span 2' }}>
      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHd({ children }) {
  return (
    <div style={{ gridColumn: 'span 2', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 2, marginTop: 18 }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif" }}>{children}</div>
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  );
}

function IssueFlag({ label, value }) {
  const hasIssue = value && value.trim();
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 6, background: hasIssue ? '#dc262610' : '#10b98110', border: `1px solid ${hasIssue ? '#dc262633' : '#10b98133'}`, marginBottom: 10 }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{hasIssue ? '⚠' : '✓'}</span>
      <div>
        <div style={{ fontSize: 9, color: hasIssue ? '#dc2626' : '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{value || 'No issues reported'}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HandoverModal
// Props: mode 'new'|'view', handover, role, onClose, onSaved
// ═══════════════════════════════════════════════════════════════════════════════
export default function HandoverModal({ mode = 'new', handover = null, role = 'user', onClose, onSaved }) {
  const { postHandover, acknowledgeHandover } = useHandoverData();

  const todayStr = new Date().toISOString().slice(0, 10);
  const init = handover || {};

  // ── Form state ──────────────────────────────────────────────────────────────
  const [shiftDate,         setShiftDate]         = useState(init.shiftDate         || todayStr);
  const [shift,             setShift]             = useState(init.shift             || 'Morning');
  const [line,              setLine]              = useState(init.line              || '');
  const [outgoingSupervisor,setOutgoingSupervisor]= useState(init.outgoingSupervisor|| '');
  const [incomingSupervisor,setIncomingSupervisor]= useState(init.incomingSupervisor|| '');
  const [busesInProgress,   setBusesInProgress]   = useState(init.busesInProgress   || '');
  const [workCompleted,     setWorkCompleted]     = useState(init.workCompleted     || '');
  const [outstandingWork,   setOutstandingWork]   = useState(init.outstandingWork   || '');
  const [safetyIssues,      setSafetyIssues]      = useState(init.safetyIssues      || '');
  const [qualityIssues,     setQualityIssues]     = useState(init.qualityIssues     || '');
  const [equipmentStatus,   setEquipmentStatus]   = useState(init.equipmentStatus   || '');
  const [housekeeping,      setHousekeeping]      = useState(init.housekeeping      || 'OK');
  const [actionsNextShift,  setActionsNextShift]  = useState(init.actionsNextShift  || '');
  const [notes,             setNotes]             = useState(init.notes             || '');

  // Acknowledge
  const [ackName, setAckName] = useState('');

  const [busy,   setBusy]   = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const isView  = mode === 'view';
  const canAck  = isView && handover?.status === 'Open';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!outgoingSupervisor) return setErrMsg('Outgoing supervisor name is required.');
    if (!line)               return setErrMsg('Select a production line.');
    setErrMsg(''); setBusy(true);
    try {
      await postHandover({
        shiftDate, shift, line, outgoingSupervisor, incomingSupervisor,
        busesInProgress, workCompleted, outstandingWork,
        safetyIssues, qualityIssues, equipmentStatus, housekeeping,
        actionsNextShift, notes,
        status: 'Open',
      });
      setSaved(true);
      if (onSaved) onSaved();
    } catch { setErrMsg('Could not save. Check connection and try again.'); }
    finally { setBusy(false); }
  }

  async function handleAcknowledge() {
    if (!ackName) return setErrMsg('Enter your name to acknowledge.');
    setBusy(true);
    try {
      await acknowledgeHandover({
        handoverId: handover.id,
        acknowledgedBy:   ackName,
        acknowledgedDate: todayStr,
        status: 'Acknowledged',
      });
      setSaved(true);
      if (onSaved) onSaved();
    } catch { setErrMsg('Could not save acknowledgement.'); }
    finally { setBusy(false); }
  }

  const shiftColors = { Morning: '#f59e0b', Afternoon: '#f97316', Night: '#6366f1' };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {isView ? `Shift Handover — ${handover?.shiftDate || ''}` : 'New Shift Handover'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', marginTop: 3 }}>KMC Production · Shift Handover Log</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isView && handover?.shift && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${shiftColors[handover.shift] || '#64748b'}22`, color: shiftColors[handover.shift] || '#64748b', border: `1px solid ${shiftColors[handover.shift] || '#64748b'}55`, fontWeight: 700 }}>
                  {handover.shift}
                </span>
              )}
              {isView && handover?.status && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${STATUS_COLOR[handover.status] || '#64748b'}22`, color: STATUS_COLOR[handover.status] || '#64748b', border: `1px solid ${STATUS_COLOR[handover.status] || '#64748b'}55`, fontWeight: 700 }}>
                  {handover.status}
                </span>
              )}
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
            </div>
          </div>
        </div>

        {saved ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{mode === 'new' ? '📋' : '✅'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>
              {mode === 'new' ? 'Handover Logged' : 'Handover Acknowledged'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24 }}>Record saved to the handover register.</div>
            <button onClick={onClose} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Close</button>
          </div>

        ) : isView ? (
          /* ════════ VIEW MODE ════════ */
          <div style={{ padding: '20px 22px' }}>
            <DetailRow label="Date"                value={handover?.shiftDate} />
            <DetailRow label="Shift"               value={handover?.shift} />
            <DetailRow label="Line / Department"   value={handover?.line} />
            <DetailRow label="Outgoing Supervisor"  value={handover?.outgoingSupervisor} />
            <DetailRow label="Incoming Supervisor"  value={handover?.incomingSupervisor} />
            <DetailRow label="Buses In Progress"    value={handover?.busesInProgress} />
            <DetailRow label="Work Completed"       value={handover?.workCompleted} />
            <DetailRow label="Outstanding Work"     value={handover?.outstandingWork} />
            <DetailRow label="Actions Next Shift"   value={handover?.actionsNextShift} />
            <DetailRow label="Equipment Status"     value={handover?.equipmentStatus} />
            <DetailRow label="Housekeeping"         value={handover?.housekeeping} />
            <DetailRow label="Notes"                value={handover?.notes} />

            <div style={{ marginTop: 16 }}>
              <IssueFlag label="Safety Issues"  value={handover?.safetyIssues} />
              <IssueFlag label="Quality Issues" value={handover?.qualityIssues} />
            </div>

            {handover?.acknowledgedBy && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#10b98110', border: '1px solid #10b98133', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Acknowledged</div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{handover.acknowledgedBy} · {handover.acknowledgedDate}</div>
              </div>
            )}

            {canAck && (
              <div style={{ marginTop: 22, padding: '16px 18px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Acknowledge Handover
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.6 }}>
                  By acknowledging, you confirm you have received this handover and are taking responsibility for the shift.
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Your name *</label>
                  <Inp value={ackName} onChange={e => setAckName(e.target.value)} placeholder="Full name of incoming supervisor" />
                </div>
                {errMsg && <div style={{ marginBottom: 12, padding: '8px 10px', background: '#dc262618', border: '1px solid #dc262644', borderRadius: 4, fontSize: 11, color: '#dc2626' }}>{errMsg}</div>}
                <button onClick={handleAcknowledge} disabled={busy} style={{ width: '100%', padding: '10px 0', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {busy ? 'Saving…' : 'Acknowledge & Sign'}
                </button>
              </div>
            )}
          </div>

        ) : (
          /* ════════ NEW HANDOVER FORM ════════ */
          <form onSubmit={handleSubmit} style={{ padding: '20px 22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              <SectionHd>Shift Details</SectionHd>

              <Field label="Shift date" required half>
                <Inp type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)} />
              </Field>
              <Field label="Shift" required half>
                <Sel value={shift} onChange={e => setShift(e.target.value)}>
                  {SHIFTS.map(s => <option key={s}>{s}</option>)}
                </Sel>
              </Field>
              <Field label="Line / Department" required half>
                <Sel value={line} onChange={e => setLine(e.target.value)}>
                  <option value="">Select…</option>
                  {LINES.map(l => <option key={l}>{l}</option>)}
                </Sel>
              </Field>
              <Field label="Outgoing supervisor" required half>
                <Inp value={outgoingSupervisor} onChange={e => setOutgoingSupervisor(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Incoming supervisor" half>
                <Inp value={incomingSupervisor} onChange={e => setIncomingSupervisor(e.target.value)} placeholder="Full name (if known)" />
              </Field>

              <SectionHd>Production Status</SectionHd>

              <Field label="Buses in progress (VINs / stations)">
                <Ta value={busesInProgress} onChange={e => setBusesInProgress(e.target.value)} placeholder="e.g. KMC-001 @ Chassis 2, KMC-003 @ Trim…" style={{ ...inputSx, minHeight: 56 }} />
              </Field>
              <Field label="Work completed this shift">
                <Ta value={workCompleted} onChange={e => setWorkCompleted(e.target.value)} placeholder="Summary of tasks completed…" />
              </Field>
              <Field label="Outstanding work / carry-over">
                <Ta value={outstandingWork} onChange={e => setOutstandingWork(e.target.value)} placeholder="Tasks not completed, pending approvals…" />
              </Field>
              <Field label="Actions required next shift">
                <Ta value={actionsNextShift} onChange={e => setActionsNextShift(e.target.value)} placeholder="Priority tasks for incoming shift…" />
              </Field>

              <SectionHd>Safety, Quality & Equipment</SectionHd>

              <Field label="Safety issues / observations">
                <Ta value={safetyIssues} onChange={e => setSafetyIssues(e.target.value)} placeholder="Any incidents, near misses, hazards observed… (leave blank if none)" style={{ ...inputSx, minHeight: 56 }} />
              </Field>
              <Field label="Quality issues / NCRs raised">
                <Ta value={qualityIssues} onChange={e => setQualityIssues(e.target.value)} placeholder="Non-conformances, rework, customer complaints… (leave blank if none)" style={{ ...inputSx, minHeight: 56 }} />
              </Field>
              <Field label="Equipment status" half>
                <Inp value={equipmentStatus} onChange={e => setEquipmentStatus(e.target.value)} placeholder="e.g. Drill press #3 down for maintenance" />
              </Field>
              <Field label="Housekeeping" half>
                <Sel value={housekeeping} onChange={e => setHousekeeping(e.target.value)}>
                  {HOUSEKEEPING_STATUSES.map(s => <option key={s}>{s}</option>)}
                </Sel>
              </Field>
              <Field label="Additional notes">
                <Ta value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else the incoming shift should know…" style={{ ...inputSx, minHeight: 56 }} />
              </Field>
            </div>

            {errMsg && <div style={{ marginBottom: 14, padding: '9px 12px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>{errMsg}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ padding: '9px 20px', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {busy ? 'Saving…' : 'Log Handover'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
