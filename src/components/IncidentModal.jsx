import { useState, useEffect } from 'react';
import {
  useIncidentData,
  INCIDENT_TYPES, INCIDENT_CLASSES, INCIDENT_STATUSES, RCA_METHODS,
  suggestClass, CLASS_ESCALATION,
} from '../hooks/useIncidentData';

// ── Classification colours ────────────────────────────────────────────────────
export const CLASS_COLOR = {
  'Class A — Critical': '#dc2626',
  'Class B — Major':    '#f59e0b',
  'Class C — Minor':    '#10b981',
};
export const STATUS_COLOR = {
  'Reported':             '#64748b',
  'Under Investigation':  '#3b82f6',
  'CAPA Pending':         '#f59e0b',
  'Closed':               '#10b981',
  'Escalated':            '#dc2626',
};

// ── Shared field primitives ───────────────────────────────────────────────────
function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 3 }}>*</span>}
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

function SectionHd({ children, sub }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 14, marginTop: 22 }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif" }}>{children}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Investigation deadline countdown
export function InvDeadlineBadge({ investigationDue, investigationSubmitted }) {
  if (!investigationDue || investigationSubmitted) return null;
  const diff = Math.round((new Date(investigationDue) - new Date()) / 86400000);
  const color = diff < 0 ? '#dc2626' : diff <= 2 ? '#f59e0b' : '#3b82f6';
  const label = diff < 0 ? `Investigation ${Math.abs(diff)}d overdue` : diff === 0 ? 'Investigation due today' : `Investigation due in ${diff}d`;
  return (
    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}55`, fontFamily: 'monospace' }}>
      {label}
    </span>
  );
}

// ── Stage progress indicator ──────────────────────────────────────────────────
function StagePill({ stage, active, done }) {
  const color = done ? '#10b981' : active ? 'var(--accent)' : 'var(--border)';
  const textColor = done ? '#10b981' : active ? 'var(--accent)' : 'var(--text-dim)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${color}`, background: done ? '#10b98122' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: textColor, fontWeight: 700 }}>
        {done ? '✓' : stage}
      </div>
      <span style={{ fontSize: 10, color: textColor, fontFamily: "'Inter', system-ui, sans-serif", fontWeight: active ? 700 : 400 }}>
        {stage === 1 ? 'Initial Report' : 'Investigation'}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// IncidentModal
//
// Props:
//   mode         'new' | 'view'
//   incident     existing incident object (view mode)
//   role         'admin' | 'user'
//   onClose      () => void
//   onSaved      () => void
// ═══════════════════════════════════════════════════════════════════════════════
export default function IncidentModal({ mode = 'new', incident = null, role = 'user', onClose, onSaved }) {
  const { postIncident, updateIncident } = useIncidentData();

  // ── Stage: 1 = initial report, 2 = investigation (view mode only) ──────────
  const hasStage1 = mode === 'view' && !!incident;
  const [activeStage, setActiveStage] = useState(hasStage1 ? 2 : 1);

  // ── Stage 1 state ──────────────────────────────────────────────────────────
  const init = incident || {};
  const [reportedBy,       setReportedBy]       = useState(init.reportedBy       || '');
  const [locationLine,     setLocationLine]     = useState(init.locationLine     || '');
  const [locationStation,  setLocationStation]  = useState(init.locationStation  || '');
  const [incidentType,     setIncidentType]     = useState(init.incidentType     || '');
  const [classification,   setClassification]   = useState(init.classification   || '');
  const [description,      setDescription]      = useState(init.description      || '');
  const [immediateAction,  setImmediateAction]  = useState(init.immediateAction  || '');
  const [injuredPersons,   setInjuredPersons]   = useState(init.injuredPersons   || '');
  const [propertyDamage,   setPropertyDamage]   = useState(init.propertyDamage   || 'No');
  const [propertyDetail,   setPropertyDetail]   = useState('');
  const [equipmentAffected,setEquipmentAffected]= useState(init.equipmentAffected|| '');
  const [witnessNames,     setWitnessNames]     = useState(init.witnessNames     || '');

  // Auto-suggest class when type changes
  useEffect(() => {
    if (mode === 'new' && incidentType) {
      setClassification(suggestClass(incidentType));
    }
  }, [incidentType, mode]);

  // ── Stage 2 state ──────────────────────────────────────────────────────────
  const [assignedInvestigator, setAssignedInvestigator] = useState(init.assignedInvestigator || '');
  const [rootCause,            setRootCause]            = useState(init.rootCause            || '');
  const [rcaMethod,            setRcaMethod]            = useState(init.rcaMethod            || '');
  const [correctiveAction,     setCorrectiveAction]     = useState(init.correctiveAction     || '');
  const [preventiveAction,     setPreventiveAction]     = useState(init.preventiveAction     || '');
  const [lessonsLearned,       setLessonsLearned]       = useState('');
  const [status,               setStatus]               = useState(init.status               || 'Reported');
  const [escalatedTo,          setEscalatedTo]          = useState(init.escalatedTo          || '');

  const [busy,   setBusy]   = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const isAdmin    = role === 'admin';
  const stage2Done = !!init.investigationSubmitted;
  const classColor = CLASS_COLOR[classification] || '#64748b';
  const escalationHint = CLASS_ESCALATION[classification] || '';

  // ── Submit Stage 1 (new report) ────────────────────────────────────────────
  async function submitStage1(e) {
    e.preventDefault();
    if (!reportedBy)   return setErrMsg('Reported By is required.');
    if (!incidentType) return setErrMsg('Select an incident type.');
    if (!description)  return setErrMsg('Description is required.');
    setErrMsg(''); setBusy(true);
    try {
      await postIncident({
        reportedBy, locationLine, locationStation,
        incidentType, classification, description,
        immediateAction, injuredPersons,
        propertyDamage: propertyDamage === 'Yes' ? `Yes — ${propertyDetail}` : 'No',
        equipmentAffected, witnessNames,
        status: 'Reported',
      });
      setSaved(true);
      if (onSaved) onSaved();
    } catch {
      setErrMsg('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Submit Stage 2 (investigation update, admin only) ─────────────────────
  async function submitStage2(e) {
    e.preventDefault();
    if (!assignedInvestigator) return setErrMsg('Assigned Investigator is required.');
    if (!rootCause)            return setErrMsg('Root cause is required.');
    setErrMsg(''); setBusy(true);
    try {
      await updateIncident({
        incidentId: incident.id,
        assignedInvestigator, rootCause, rcaMethod,
        correctiveAction, preventiveAction,
        investigationSubmitted: new Date().toISOString().slice(0, 10),
        status,
        escalatedTo: classification?.includes('Class A') || classification?.includes('Class B') ? escalatedTo : '',
        closedDate: status === 'Closed' ? new Date().toISOString().slice(0, 10) : '',
      });
      setSaved(true);
      if (onSaved) onSaved();
    } catch {
      setErrMsg('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Overlay ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 580, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* ── Header ── */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {mode === 'new' ? 'Report Incident' : `Incident — ${incident?.id || ''}`}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', marginTop: 3 }}>KMC.DQHSE.01/26-PR003</div>

            {/* Stage pills */}
            <div style={{ display: 'flex', gap: 16, marginTop: 10, alignItems: 'center' }}>
              <StagePill stage={1} active={activeStage === 1} done={mode === 'view'} />
              <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
              <StagePill stage={2} active={activeStage === 2} done={stage2Done} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {mode === 'view' && classification && (
              <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${classColor}22`, color: classColor, border: `1px solid ${classColor}55`, whiteSpace: 'nowrap' }}>
                {classification.split('—')[0].trim()}
              </span>
            )}
            {mode === 'view' && incident?.status && (
              <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${STATUS_COLOR[incident.status] || '#64748b'}22`, color: STATUS_COLOR[incident.status] || '#64748b', border: `1px solid ${STATUS_COLOR[incident.status] || '#64748b'}55`, whiteSpace: 'nowrap' }}>
                {incident.status}
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
        </div>

        {/* ── Saved ── */}
        {saved ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>
              {activeStage === 1 ? 'Incident Reported' : 'Investigation Submitted'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
              {activeStage === 1
                ? 'Stage 1 saved. Investigation report is due within 7 days.'
                : 'Stage 2 saved to the incident register.'}
            </div>
            {escalationHint && activeStage === 1 && (
              <div style={{ marginBottom: 20, padding: '10px 14px', background: `${classColor}18`, border: `1px solid ${classColor}44`, borderRadius: 6, fontSize: 11, color: classColor }}>
                ⚠ This incident requires escalation to: <strong>{escalationHint}</strong>
              </div>
            )}
            <button onClick={onClose} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Close
            </button>
          </div>

        ) : activeStage === 1 && mode === 'new' ? (
          /* ════════════ STAGE 1 — Initial Report ════════════ */
          <form onSubmit={submitStage1} style={{ padding: '20px 22px' }}>

            <SectionHd sub="Submit within 24 hours of occurrence">Reporter & Location</SectionHd>
            <Field label="Reported by" required>
              <Inp value={reportedBy} onChange={e => setReportedBy(e.target.value)} placeholder="Your full name" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Production line">
                <Inp value={locationLine} onChange={e => setLocationLine(e.target.value)} placeholder="e.g. Chassis 1" />
              </Field>
              <Field label="Station">
                <Inp value={locationStation} onChange={e => setLocationStation(e.target.value)} placeholder="e.g. C01-02" />
              </Field>
            </div>

            <SectionHd>Incident classification</SectionHd>
            <Field label="Incident type" required>
              <Sel value={incidentType} onChange={e => setIncidentType(e.target.value)}>
                <option value="">Select…</option>
                {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </Sel>
            </Field>
            <Field label="Classification (auto-suggested — override if needed)">
              <Sel value={classification} onChange={e => setClassification(e.target.value)} style={{ ...inputSx, color: classColor || 'inherit', fontWeight: classification ? 700 : 400 }}>
                <option value="">Select…</option>
                {INCIDENT_CLASSES.map(c => (
                  <option key={c} style={{ color: CLASS_COLOR[c] }}>{c}</option>
                ))}
              </Sel>
            </Field>
            {escalationHint && classification && (
              <div style={{ marginBottom: 14, marginTop: -8, padding: '7px 10px', background: `${classColor}14`, border: `1px solid ${classColor}44`, borderRadius: 4, fontSize: 10, color: classColor }}>
                Escalation required → <strong>{escalationHint}</strong>
              </div>
            )}

            <SectionHd>What happened</SectionHd>
            <Field label="Description" required>
              <Ta value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what happened, how, and where…" />
            </Field>
            <Field label="Immediate action taken">
              <Ta value={immediateAction} onChange={e => setImmediateAction(e.target.value)} placeholder="First aid, area isolation, tool removed from service…" />
            </Field>

            <SectionHd>Persons & damage</SectionHd>
            <Field label="Injured persons (names / count)">
              <Inp value={injuredPersons} onChange={e => setInjuredPersons(e.target.value)} placeholder="e.g. 1 — John Doe, minor laceration" />
            </Field>
            <Field label="Property damage?">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {['No', 'Yes'].map(v => (
                  <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="radio" name="propDmg" value={v} checked={propertyDamage === v} onChange={() => setPropertyDamage(v)} />
                    {v}
                  </label>
                ))}
              </div>
              {propertyDamage === 'Yes' && (
                <Inp style={{ ...inputSx, marginTop: 8 }} value={propertyDetail} onChange={e => setPropertyDetail(e.target.value)} placeholder="Describe damage…" />
              )}
            </Field>
            <Field label="Equipment affected / tools removed from service">
              <Inp value={equipmentAffected} onChange={e => setEquipmentAffected(e.target.value)} placeholder="e.g. Torque wrench SN-441, welding gun #3…" />
            </Field>
            <Field label="Witness names">
              <Inp value={witnessNames} onChange={e => setWitnessNames(e.target.value)} placeholder="Comma-separated names…" />
            </Field>

            {errMsg && (
              <div style={{ marginBottom: 14, padding: '9px 12px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>{errMsg}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ padding: '9px 20px', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {busy ? 'Saving…' : 'Submit Report'}
              </button>
            </div>
          </form>

        ) : (
          /* ════════════ VIEW / STAGE 2 ════════════ */
          <div style={{ padding: '20px 22px' }}>

            {/* Stage toggle (view mode) */}
            {mode === 'view' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {[1, 2].map(s => (
                  <button
                    key={s}
                    onClick={() => setActiveStage(s)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: activeStage === s ? '1px solid var(--accent)' : '1px solid var(--border)', background: activeStage === s ? 'var(--accent)' : 'transparent', color: activeStage === s ? '#fff' : 'var(--text-dim)', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                  >
                    {s === 1 ? 'Initial Report' : `Investigation${stage2Done ? ' ✓' : ''}`}
                  </button>
                ))}
              </div>
            )}

            {activeStage === 1 ? (
              /* ── View Stage 1 ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Reported by',        incident?.reportedBy],
                  ['Date reported',       incident?.timestamp?.slice(0, 10)],
                  ['Line',               incident?.locationLine],
                  ['Station',            incident?.locationStation],
                  ['Incident type',      incident?.incidentType],
                  ['Classification',     incident?.classification],
                  ['Description',        incident?.description],
                  ['Immediate action',   incident?.immediateAction],
                  ['Injured persons',    incident?.injuredPersons],
                  ['Property damage',    incident?.propertyDamage],
                  ['Equipment affected', incident?.equipmentAffected],
                  ['Witnesses',          incident?.witnessNames],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{value}</div>
                  </div>
                ))}
                {incident?.investigationDue && (
                  <div style={{ marginTop: 4 }}>
                    <InvDeadlineBadge investigationDue={incident.investigationDue} investigationSubmitted={incident.investigationSubmitted} />
                  </div>
                )}
              </div>

            ) : (
              /* ── Stage 2 — Investigation ── */
              <form onSubmit={submitStage2}>
                {stage2Done ? (
                  // Read-only view of submitted investigation
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      ['Investigator',       incident?.assignedInvestigator],
                      ['Submitted',          incident?.investigationSubmitted],
                      ['RCA method',         incident?.rcaMethod],
                      ['Root cause',         incident?.rootCause],
                      ['Corrective action',  incident?.correctiveAction],
                      ['Preventive action',  incident?.preventiveAction],
                      ['Escalated to',       incident?.escalatedTo],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                ) : isAdmin ? (
                  // Editable investigation form (admin only)
                  <>
                    <SectionHd sub="Must be submitted within 7 days of initial report">Investigation Details</SectionHd>
                    <Field label="Assigned investigator" required>
                      <Inp value={assignedInvestigator} onChange={e => setAssignedInvestigator(e.target.value)} placeholder="Full name" />
                    </Field>
                    <Field label="RCA method">
                      <Sel value={rcaMethod} onChange={e => setRcaMethod(e.target.value)}>
                        <option value="">Select…</option>
                        {RCA_METHODS.map(m => <option key={m}>{m}</option>)}
                      </Sel>
                    </Field>
                    <Field label="Root cause" required>
                      <Ta value={rootCause} onChange={e => setRootCause(e.target.value)} placeholder="Identified root cause of the incident…" />
                    </Field>
                    <Field label="Corrective action">
                      <Ta value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} placeholder="Actions taken to address the incident…" />
                    </Field>
                    <Field label="Preventive action">
                      <Ta value={preventiveAction} onChange={e => setPreventiveAction(e.target.value)} placeholder="Systemic changes to prevent recurrence…" />
                    </Field>
                    <Field label="Lessons learned">
                      <Ta value={lessonsLearned} onChange={e => setLessonsLearned(e.target.value)} placeholder="Key takeaways for the production team…" />
                    </Field>

                    {(classification?.includes('Class A') || classification?.includes('Class B')) && (
                      <Field label={`Escalated to (${CLASS_ESCALATION[classification] || 'required for this class'})`}>
                        <Inp value={escalatedTo} onChange={e => setEscalatedTo(e.target.value)} placeholder={CLASS_ESCALATION[classification] || ''} />
                      </Field>
                    )}

                    <SectionHd>Status update</SectionHd>
                    <Field label="Status">
                      <Sel value={status} onChange={e => setStatus(e.target.value)}>
                        {INCIDENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                      </Sel>
                    </Field>

                    {errMsg && (
                      <div style={{ marginBottom: 14, padding: '9px 12px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>{errMsg}</div>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={onClose} style={{ padding: '9px 20px', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                      <button type="submit" disabled={busy} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {busy ? 'Saving…' : 'Submit Investigation'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontSize: 12 }}>
                    Investigation not yet submitted. An admin will complete this within 7 days.
                    {incident?.investigationDue && (
                      <div style={{ marginTop: 12 }}>
                        <InvDeadlineBadge investigationDue={incident.investigationDue} investigationSubmitted={incident.investigationSubmitted} />
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
