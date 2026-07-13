import { useState, useCallback, useRef } from 'react';
import {
  useNCRData,
  NCR_TYPES, NCR_SEVERITIES, NCR_DISPOSITIONS, NCR_STATUSES, RCA_METHODS, NCR_DOMAINS,
} from '../hooks/useNCRData';
import { buildNCRPDF } from '../export/buildNCRPDF.js';

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

// Types that are vehicle-linked — show VIN + Station fields
const VEHICLE_TYPES = new Set(['Quality', 'Production']);

// ── Shared field components ───────────────────────────────────────────────────
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

function Inp(props) { return <input style={inputSx} {...props} />; }
function Sel({ children, ...props }) { return <select style={inputSx} {...props}>{children}</select>; }
function Ta(props) { return <textarea style={{ ...inputSx, minHeight: 70, resize: 'vertical', lineHeight: 1.5 }} {...props} />; }

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

// ── Evidence upload ───────────────────────────────────────────────────────────
function EvidenceUpload({ value, onChange, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        b64: ev.target.result.split(',')[1],
        preview: file.type?.startsWith('image/') ? ev.target.result : null,
      });
    };
    reader.readAsDataURL(file);
  }

  if (disabled && !value) return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>No evidence attached.</div>
  );

  if (value) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        {value.preview ? (
          <img src={value.preview} alt="Evidence" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📎</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{value.mime}</div>
          {!disabled && (
            <button type="button" onClick={() => onChange(null)} style={{ marginTop: 6, fontSize: 10, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ✕ Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (!disabled) readFile(e.dataTransfer.files[0]); }}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 6, padding: '20px 16px', textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
        background: dragOver ? 'rgba(59,130,246,0.06)' : 'transparent',
        transition: 'all .15s',
      }}
    >
      <div style={{ fontSize: 22, marginBottom: 6 }}>📷</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Click or drag an image / PDF</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>PNG, JPG, PDF up to 5 MB</div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => readFile(e.target.files[0])} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NCRModal
// ═══════════════════════════════════════════════════════════════════════════════
export default function NCRModal({ mode = 'new', prefill = {}, ncr = null, role = 'user', defaultDomain = null, onClose, onSaved }) {
  const { postNCR, updateNCR } = useNCRData();

  const initial = ncr || {};
  const [ncrType,          setNcrType]          = useState(initial.ncrType          || '');
  const [vin,              setVin]              = useState(initial.vin              || prefill.vin         || '');
  const [stationCode,      setStationCode]      = useState(initial.stationCode      || prefill.stationCode || '');
  const [raisedBy,         setRaisedBy]         = useState(initial.raisedBy         || '');
  const [domain,           setDomain]           = useState(initial.domain           || defaultDomain || '');
  const [severity,         setSeverity]         = useState(initial.severity         || '');
  const [disposition,      setDisposition]      = useState(initial.disposition      || '');
  const [description,      setDescription]      = useState(initial.description      || '');
  const [rcaMethod,        setRcaMethod]        = useState(initial.rcaMethod        || '');
  const [rootCause,        setRootCause]        = useState(initial.rootCause        || '');
  const [correctiveAction, setCorrectiveAction] = useState(initial.correctiveAction || '');
  const [preventiveAction, setPreventiveAction] = useState(initial.preventiveAction || '');
  const [evidence,         setEvidence]         = useState(null);
  const [assignedTo,       setAssignedTo]       = useState(initial.assignedTo       || '');
  const [dueDate,          setDueDate]          = useState(initial.dueDate          || '');
  const [status,           setStatus]           = useState(initial.status           || 'Open');
  const [closedDate,       setClosedDate]       = useState(initial.closedDate       || '');

  const [busy,      setBusy]      = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [errMsg,    setErrMsg]    = useState('');
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!ncr) return;
    setExporting(true);
    try { await buildNCRPDF(ncr); } finally { setExporting(false); }
  }, [ncr]);

  const isSafety  = ncrType === 'Safety';
  const isVehicle = VEHICLE_TYPES.has(ncrType);
  const isAdmin   = role === 'systemadmin' || role === 'useradmin';
  const isView    = mode === 'view';

  function defaultDue() {
    const d = new Date(); let added = 0;
    while (added < 10) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
    return d.toISOString().slice(0, 10);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ncrType)     return setErrMsg('Select an NCR type.');
    if (!description) return setErrMsg('Description is required.');
    if (!severity)    return setErrMsg('Select a severity.');
    if (!raisedBy)    return setErrMsg('Raised By is required.');
    setErrMsg(''); setBusy(true);
    try {
      if (mode === 'new') {
        await postNCR({
          vin: isVehicle ? vin : '',
          stationCode: isVehicle ? stationCode : '',
          ncrType, description, severity, disposition,
          rootCause, rcaMethod, correctiveAction, preventiveAction,
          assignedTo, dueDate: dueDate || defaultDue(), raisedBy, domain, status: 'Open',
          ...(evidence ? { attachmentB64: evidence.b64, attachmentName: evidence.name, attachmentMime: evidence.mime } : {}),
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
            {isView && ncr && (
              <button onClick={handleExport} disabled={exporting} style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 10, fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em', opacity: exporting ? 0.5 : 1 }}>
                {exporting ? '…' : '↓ PDF'}
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
        </div>

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

            {/* ── 1. Classification — Type first ── */}
            <SectionHd>Classification</SectionHd>

            <Field label="NCR type *">
              <Sel value={ncrType} onChange={e => setNcrType(e.target.value)} disabled={isView}>
                <option value="">Select type…</option>
                {NCR_TYPES.map(t => <option key={t}>{t}</option>)}
              </Sel>
            </Field>

            {isSafety && mode === 'new' && (
              <div style={{ marginBottom: 14, padding: '9px 12px', background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: 6, fontSize: 11, color: '#d97706', lineHeight: 1.5 }}>
                Safety NCRs are visible to all domains and do not require a VIN or station code.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Severity *">
                <Sel value={severity} onChange={e => setSeverity(e.target.value)} disabled={isView}>
                  <option value="">Select…</option>
                  {NCR_SEVERITIES.map(s => <option key={s} style={{ color: SEVERITY_COLOR[s] }}>{s}</option>)}
                </Sel>
              </Field>
              <Field label={isSafety ? 'Domain (optional)' : 'Domain *'}>
                <Sel value={domain} onChange={e => setDomain(e.target.value)} disabled={isView}>
                  <option value="">{isSafety ? 'All / not applicable' : 'Select domain…'}</option>
                  {NCR_DOMAINS.map(d => <option key={d}>{d}</option>)}
                </Sel>
              </Field>
            </div>

            <Field label="Disposition">
              <Sel value={disposition} onChange={e => setDisposition(e.target.value)} disabled={isView && !isAdmin}>
                <option value="">Select or leave for later…</option>
                {NCR_DISPOSITIONS.map(d => <option key={d}>{d}</option>)}
              </Sel>
            </Field>

            {/* ── 2. Identification ── */}
            <SectionHd>Identification</SectionHd>

            <Field label="Raised by *">
              <Inp value={raisedBy} onChange={e => setRaisedBy(e.target.value)} placeholder="Your name" disabled={isView} />
            </Field>

            {/* VIN + Station only for vehicle-related types */}
            {(isVehicle || (isView && (initial.vin || initial.stationCode))) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="VIN">
                  <Inp value={vin} onChange={e => setVin(e.target.value)} placeholder="e.g. KMC-001" disabled={isView} />
                </Field>
                <Field label="Station code">
                  <Inp value={stationCode} onChange={e => setStationCode(e.target.value)} placeholder="e.g. C01-02" disabled={isView} />
                </Field>
              </div>
            )}
            {!isVehicle && !isView && ncrType && (
              <div style={{ marginBottom: 14, fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                VIN / station code not applicable for {ncrType} non-conformances.
              </div>
            )}

            {/* ── 3. Description ── */}
            <SectionHd>Non-conformance description</SectionHd>
            <Field label="Description *">
              <Ta value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what was found, where, and when…" disabled={isView} />
            </Field>

            {/* ── 4. Root Cause & Corrective Action ── */}
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

            {/* ── 5. Evidence ── */}
            <SectionHd>Evidence</SectionHd>
            <Field label="Photo / document upload">
              <EvidenceUpload value={evidence} onChange={setEvidence} disabled={isView} />
            </Field>

            {/* ── 6. Assignment ── */}
            <SectionHd>Assignment & due date</SectionHd>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Assigned to">
                <Inp value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name / team" disabled={isView && !isAdmin} />
              </Field>
              <Field label="Due date">
                <Inp type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={isView && !isAdmin} />
              </Field>
            </div>

            {/* ── Status update (admin + view mode only) ── */}
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

            {errMsg && (
              <div style={{ marginBottom: 14, padding: '9px 12px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>
                {errMsg}
              </div>
            )}

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
