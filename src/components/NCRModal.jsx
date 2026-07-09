import { useState } from 'react';
import {
  useNCRData,
  NCR_TYPES, NCR_SEVERITIES, NCR_DISPOSITIONS, NCR_STATUSES, RCA_METHODS, NCR_DOMAINS,
} from '../hooks/useNCRData';

// ── Severity badge colours ─────────────────────────────────────────────────────
export const SEVERITY_COLOR = {
  Critical: '#dc2626',
  Major:    '#f59e0b',
  Minor:    '#10b981',
};
export const STATUS_COLOR = {
  'Open':                '#f59e0b',
  'In Progress':         '#3b82f6',
  'Closed':              '#10b981',
  'Concession Approved': '#8b5cf6',
};

// ── Shared field components (self-contained — no external css object) ──────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputSx = {
  width: '100%', boxSizing: 'border-box',
  fontSize: 13, padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: "'Inter', system-ui, sans-serif",
  outline: 'none',
};

function Inp(props) {
  return <input style={inputSx} {...props} />;
}
function Sel({ children, ...props }) {
  return <select style={inputSx} {...props}>{children}</select>;
}
function Ta(props) {
  return <textarea style={{ ...inputSx, minHeight: 70, resize: 'vertical', lineHeight: 1.5 }} {...props} />;
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHd({ children }) {
  return (
    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif", borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 14, marginTop: 22 }}>
      {children}
    </div>
  );
}

// ── Days-remaining badge ───────────────────────────────────────────────────────
export function DaysBadge({ dueDate, status }) {
  if (!dueDate || status === 'Closed' || status === 'Concession Approved') return null;
  const diff = Math.round((new Date(dueDate) - new Date()) / 86400000);
  const color = diff < 0 ? '#dc2626' : diff <= 2 ? '#f59e0b' : '#10b981';
  const label = diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Due today' : `${diff}d left`;
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}55`, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NCRModal — log new NCR or view/update existing
//
// Props:
//   mode         'new' | 'view'
//   prefill      { vin, stationCode } — for 'new' from bus card
//   ncr          existing NCR object — for 'view'
//   role         'admin' | 'user'
//   onClose      () => void
//   onSaved      () => void   optional callback after save
// ═══════════════════════════════════════════════════════════════════════════════
export default function NCRModal({ mode = 'new', prefill = {}, ncr = null, role = 'user', defaultDomain = null, onClose, onSaved }) {
  const { postNCR, updateNCR } = useNCRData();

  // ── Form state ──────────────────────────────────────────────────────────────
  const initial = ncr || {};
  const [vin,              setVin]              = useState(initial.vin              || prefill.vin         || '');
  const [stationCode,      setStationCode]      = useState(initial.stationCode      || prefill.stationCode || '');
  const [ncrType,          setNcrType]          = useState(initial.ncrType          || '');
  const [description,      setDescription]      = useState(initial.description      || '');
  const [severity,         setSeverity]         = useState(initial.severity         || '');
  const [disposition,      setDisposition]      = useState(initial.disposition      || '');
  const [rootCause,        setRootCause]        = useState(initial.rootCause        || '');
  const [rcaMethod,        setRcaMethod]        = useState(initial.rcaMethod        || '');
  const [correctiveAction, setCorrectiveAction] = useState(initial.correctiveAction || '');
  const [preventiveAction, setPreventiveAction] = useState(initial.preventiveAction || '');
  const [assignedTo,       setAssignedTo]       = useState(initial.assignedTo       || '');
  const [dueDate,          setDueDate]          = useState(initial.dueDate          || '');
  const [raisedBy,         setRaisedBy]         = useState(initial.raisedBy         || '');
  const [domain,           setDomain]           = useState(initial.domain           || defaultDomain || '');
  // Update-only fields
  const [status,           setStatus]           = useState(initial.status           || 'Open');
  const [closedDate,       setClosedDate]       = useState(initial.closedDate       || '');

  const [busy,    setBusy]    = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  // ── Auto-suggest due date (10 working days) for new NCRs ──────────────────
  function defaultDue() {
    const d = new Date(); let added = 0;
    while (added < 10) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
    return d.toISOString().slice(0, 10);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ncrType)    return setErrMsg('Select an NCR type.');
    if (!description) return setErrMsg('Description is required.');
    if (!severity)   return setErrMsg('Select a severity.');
    if (!raisedBy)   return setErrMsg('Raised By is required.');
    setErrMsg('');
    setBusy(true);
    try {
      if (mode === 'new') {
        await postNCR({
          vin, stationCode, ncrType, description, severity, disposition,
          rootCause, rcaMethod, correctiveAction, preventiveAction,
          assignedTo, dueDate: dueDate || defaultDue(), raisedBy, domain, status: 'Open',
        });
      } else {
        await updateNCR({
          ncrId: ncr.id,
          status, disposition, correctiveAction, preventiveAction,
          assignedTo, dueDate,
          closedDate: status === 'Closed' || status === 'Concession Approved'
            ? (closedDate || new Date().toISOString().slice(0, 10))
            : '',
        });
      }
      setSaved(true);
      if (onSaved) onSaved();
    } catch {
      setErrMsg('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = role === 'admin';
  const isView  = mode === 'view';

  // ── Overlay ─────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {mode === 'new' ? 'Log Non-Conformance' : `NCR — ${ncr?.id || ''}`}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', marginTop: 3, letterSpacing: '0.06em' }}>
              KMC.DQHSE.02/26-PR009
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isView && ncr?.severity && (
              <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${SEVERITY_COLOR[ncr.severity]}22`, color: SEVERITY_COLOR[ncr.severity], border: `1px solid ${SEVERITY_COLOR[ncr.severity]}55` }}>
                {ncr.severity}
              </span>
            )}
            {isView && ncr?.status && (
              <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${STATUS_COLOR[ncr.status]}22`, color: STATUS_COLOR[ncr.status], border: `1px solid ${STATUS_COLOR[ncr.status]}55` }}>
                {ncr.status}
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Saved confirmation */}
        {saved ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>
              {mode === 'new' ? 'NCR Logged' : 'NCR Updated'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24 }}>
              {mode === 'new' ? 'Record saved to the NCR register.' : 'Changes saved to Google Sheets.'}
            </div>
            <button onClick={onClose} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '20px 22px' }}>

            {/* ── Identity ── */}
            <SectionHd>Identification</SectionHd>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="VIN">
                <Inp value={vin} onChange={e => setVin(e.target.value)} placeholder="e.g. KMC-001" disabled={isView} />
              </Field>
              <Field label="Station code">
                <Inp value={stationCode} onChange={e => setStationCode(e.target.value)} placeholder="e.g. C01-02" disabled={isView} />
              </Field>
            </div>
            <Field label="Raised by">
              <Inp value={raisedBy} onChange={e => setRaisedBy(e.target.value)} placeholder="Your name" disabled={isView} />
            </Field>

            {/* ── Classification ── */}
            <SectionHd>Classification</SectionHd>
            <Field label="Domain *">
              <Sel value={domain} onChange={e => setDomain(e.target.value)} disabled={isView}>
                <option value="">Select domain…</option>
                {NCR_DOMAINS.map(d => <option key={d}>{d}</option>)}
              </Sel>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="NCR type *">
                <Sel value={ncrType} onChange={e => setNcrType(e.target.value)} disabled={isView}>
                  <option value="">Select…</option>
                  {NCR_TYPES.map(t => <option key={t}>{t}</option>)}
                </Sel>
              </Field>
              <Field label="Severity *">
                <Sel value={severity} onChange={e => setSeverity(e.target.value)} disabled={isView}>
                  <option value="">Select…</option>
                  {NCR_SEVERITIES.map(s => (
                    <option key={s} style={{ color: SEVERITY_COLOR[s] }}>{s}</option>
                  ))}
                </Sel>
              </Field>
            </div>
            <Field label="Disposition">
              <Sel value={disposition} onChange={e => setDisposition(e.target.value)} disabled={isView && !isAdmin}>
                <option value="">Select or leave for later…</option>
                {NCR_DISPOSITIONS.map(d => <option key={d}>{d}</option>)}
              </Sel>
            </Field>

            {/* ── Description ── */}
            <SectionHd>Non-conformance description</SectionHd>
            <Field label="Description *">
              <Ta value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what was found, where, and when…" disabled={isView} />
            </Field>

            {/* ── Root Cause & Corrective Action ── */}
            <SectionHd>Root cause & corrective action</SectionHd>
            <Field label="RCA method">
              <Sel value={rcaMethod} onChange={e => setRcaMethod(e.target.value)} disabled={isView && !isAdmin}>
                <option value="">Select…</option>
                {RCA_METHODS.map(m => <option key={m}>{m}</option>)}
              </Sel>
            </Field>
            <Field label="Root cause">
              <Ta value={rootCause} onChange={e => setRootCause(e.target.value)} placeholder="Describe the identified root cause…" disabled={isView && !isAdmin} />
            </Field>
            <Field label="Corrective action">
              <Ta value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} placeholder="Action taken to resolve this non-conformance…" disabled={isView && !isAdmin} />
            </Field>
            <Field label="Preventive action">
              <Ta value={preventiveAction} onChange={e => setPreventiveAction(e.target.value)} placeholder="Systemic change to prevent recurrence…" disabled={isView && !isAdmin} />
            </Field>

            {/* ── Assignment ── */}
            <SectionHd>Assignment & due date</SectionHd>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Assigned to">
                <Inp value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name / team" disabled={isView && !isAdmin} />
              </Field>
              <Field label="Due date">
                <Inp type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={isView && !isAdmin} />
              </Field>
            </div>

            {/* ── Status (admin update, view mode only) ── */}
            {isView && isAdmin && (
              <>
                <SectionHd>Status update (admin)</SectionHd>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Status">
                    <Sel value={status} onChange={e => setStatus(e.target.value)}>
                      {NCR_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </Sel>
                  </Field>
                  {(status === 'Closed' || status === 'Concession Approved') && (
                    <Field label="Closed date">
                      <Inp type="date" value={closedDate} onChange={e => setClosedDate(e.target.value)} />
                    </Field>
                  )}
                </div>
              </>
            )}

            {/* Error */}
            {errMsg && (
              <div style={{ marginBottom: 14, padding: '9px 12px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>
                {errMsg}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ padding: '9px 20px', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif" }}>
                Cancel
              </button>
              {(mode === 'new' || (isView && isAdmin)) && (
                <button type="submit" disabled={busy} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif" }}>
                  {busy ? 'Saving…' : mode === 'new' ? 'Log NCR' : 'Save changes'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
