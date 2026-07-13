import { useState } from 'react';
import {
  useMOCData,
  CHANGE_TYPES, CHANGE_STATUSES_FORM, CHANGE_TIERS,
  nextStage, stageLabel,
} from '../hooks/useMOCData';

// ── Status / tier colours ─────────────────────────────────────────────────────
export const STATUS_COLOR = {
  'Pending Supervisor': '#f59e0b',
  'Pending HoD':        '#f59e0b',
  'Pending Exec':       '#f59e0b',
  'Approved':           '#10b981',
  'Rejected':           '#dc2626',
  'Closed':             '#64748b',
};
export const TIER_COLOR = { Major: '#dc2626', Minor: '#3b82f6' };

// ── Field primitives ──────────────────────────────────────────────────────────
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

const inputSx = {
  width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px',
  border: '1px solid var(--border)', borderRadius: 4,
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  fontFamily: "'Inter', system-ui, sans-serif", outline: 'none',
};
function Inp(props) { return <input style={inputSx} {...props} />; }
function Sel({ children, ...p }) { return <select style={inputSx} {...p}>{children}</select>; }
function Ta(props) { return <textarea style={{ ...inputSx, minHeight: 72, resize: 'vertical', lineHeight: 1.5 }} {...props} />; }

function YesNo({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {['Yes', 'No'].map(v => (
        <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-primary)', cursor: disabled ? 'default' : 'pointer' }}>
          <input type="radio" value={v} checked={value === v} onChange={() => !disabled && onChange(v)} disabled={disabled} />
          {v}
        </label>
      ))}
    </div>
  );
}

function SectionHd({ children, sub }) {
  return (
    <div style={{ gridColumn: 'span 2', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 2, marginTop: 18 }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif" }}>{children}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Approval stage progress bar
function ApprovalTrack({ moc }) {
  const tier   = moc?.tier;
  const status = moc?.status || '';
  const stages = tier === 'Major'
    ? ['Pending Supervisor', 'Pending HoD', 'Pending Exec', 'Approved']
    : ['Pending Supervisor', 'Pending HoD', 'Approved'];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 10, flexWrap: 'wrap' }}>
      {stages.map((s, i) => {
        const idx     = stages.indexOf(status);
        const done    = idx > i || status === 'Approved' || status === 'Closed';
        const current = status === s;
        const color   = done ? '#10b981' : current ? '#f59e0b' : 'var(--border)';
        const label   = s.replace('Pending ', '');
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${color}`, background: done ? '#10b98122' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color, fontWeight: 700 }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 8, color: current ? '#f59e0b' : done ? '#10b981' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>{label}</div>
            </div>
            {i < stages.length - 1 && (
              <div style={{ width: 24, height: 2, background: done ? '#10b981' : 'var(--border)', margin: '0 2px', marginBottom: 14 }} />
            )}
          </div>
        );
      })}
      {status === 'Rejected' && (
        <span style={{ fontSize: 9, color: '#dc2626', marginLeft: 10, fontWeight: 700 }}>REJECTED</span>
      )}
    </div>
  );
}

// Read-only detail row
function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCModal
// Props: mode 'new'|'view', moc, role 'admin'|'user', onClose, onSaved
// ═══════════════════════════════════════════════════════════════════════════════
export default function MOCModal({ mode = 'new', moc = null, role = 'user', onClose, onSaved }) {
  const { postMOC, updateMOC } = useMOCData();

  const init = moc || {};
  // ── Form state ──────────────────────────────────────────────────────────────
  const [requestedBy,           setRequestedBy]           = useState(init.requestedBy           || '');
  const [department,            setDepartment]            = useState(init.department            || '');
  const [changeTitle,           setChangeTitle]           = useState(init.changeTitle           || '');
  const [changeType,            setChangeType]            = useState(init.changeType            || '');
  const [changeStatus,          setChangeStatus]          = useState(init.changeStatus          || 'Permanent');
  const [expiryDate,            setExpiryDate]            = useState(init.expiryDate            || '');
  const [tier,                  setTier]                  = useState(init.tier                  || 'Minor');
  const [description,           setDescription]           = useState(init.description           || '');
  const [justification,         setJustification]         = useState(init.justification         || '');
  const [potentialHazards,      setPotentialHazards]      = useState(init.potentialHazards      || '');
  const [safeguardsCompromised, setSafeguardsCompromised] = useState(init.safeguardsCompromised || '');
  const [associatedActions,     setAssociatedActions]     = useState(init.associatedActions     || '');
  const [trainingRequired,      setTrainingRequired]      = useState(init.trainingRequired      || 'No');
  const [proceduresUpdate,      setProceduresUpdate]      = useState(init.proceduresUpdate      || 'No');
  const [drawingsUpdate,        setDrawingsUpdate]        = useState(init.drawingsUpdate        || 'No');
  const [isEmergency,           setIsEmergency]           = useState(false);

  // Admin approval / closure
  const [approverName,    setApproverName]    = useState('');
  const [closureComments, setClosureComments] = useState(init.closureComments || '');
  const [pssrDate,        setPssrDate]        = useState(init.pssrDate        || '');

  const [activeTab,  setActiveTab]  = useState('details'); // 'details' | 'approval' | 'closure'
  const [busy,   setBusy]   = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const isAdmin   = role === 'admin';
  const isView    = mode === 'view';
  const canAdvance = isAdmin && isView && nextStage(moc || {});
  const tierColor  = TIER_COLOR[tier] || '#64748b';

  // ── Submit new MOC ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!requestedBy) return setErrMsg('Requested By is required.');
    if (!changeTitle)  return setErrMsg('Change title is required.');
    if (!changeType)   return setErrMsg('Select a change type.');
    if (!description)  return setErrMsg('Description is required.');
    setErrMsg(''); setBusy(true);
    try {
      await postMOC({
        requestedBy, department, changeTitle, changeType,
        changeStatus, expiryDate: changeStatus === 'Temporary' ? expiryDate : '',
        tier, description, justification, potentialHazards,
        safeguardsCompromised, associatedActions,
        trainingRequired, proceduresUpdate, drawingsUpdate,
        status: isEmergency ? 'Approved' : 'Pending Supervisor',
      });
      setSaved(true);
      if (onSaved) onSaved();
    } catch { setErrMsg('Could not save. Check connection and try again.'); }
    finally { setBusy(false); }
  }

  // ── Advance approval stage (admin) ──────────────────────────────────────────
  async function handleApprove() {
    if (!approverName) return setErrMsg('Enter your name to approve.');
    if (!moc) return;
    const next = nextStage(moc);
    if (!next) return;
    setErrMsg(''); setBusy(true);
    const patch = { mocId: moc.id, status: next };
    const stage = moc.status;
    if (stage === 'Pending Supervisor') { patch.supervisorName = approverName; patch.supervisorDate = today(); }
    if (stage === 'Pending HoD')        { patch.hodName        = approverName; patch.hodDate        = today(); }
    if (stage === 'Pending Exec')       { patch.execName       = approverName; patch.execDate       = today(); }
    try {
      await updateMOC(patch);
      setSaved(true);
      if (onSaved) onSaved();
    } catch { setErrMsg('Could not save approval.'); }
    finally { setBusy(false); }
  }

  // ── Reject ──────────────────────────────────────────────────────────────────
  async function handleReject() {
    if (!moc) return;
    setBusy(true);
    try {
      await updateMOC({ mocId: moc.id, status: 'Rejected' });
      setSaved(true);
      if (onSaved) onSaved();
    } catch { setErrMsg('Could not save rejection.'); }
    finally { setBusy(false); }
  }

  // ── Close MOC ───────────────────────────────────────────────────────────────
  async function handleClose() {
    if (!moc) return;
    setBusy(true);
    try {
      await updateMOC({
        mocId: moc.id, status: 'Closed',
        closureComments, pssrDate,
        closureDate: today(),
      });
      setSaved(true);
      if (onSaved) onSaved();
    } catch { setErrMsg('Could not close MOC.'); }
    finally { setBusy(false); }
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      style={{ flex: 1, padding: '7px 0', border: activeTab === id ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 6, background: activeTab === id ? 'var(--accent)' : 'transparent', color: activeTab === id ? '#fff' : 'var(--text-dim)', fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif" }}
    >{label}</button>
  );

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* ── Header ── */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {mode === 'new' ? 'Management of Change' : (moc?.changeTitle || moc?.id || 'MOC')}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', marginTop: 3 }}>KMC.OCEO.02/26.FM001</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isView && moc?.tier && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${TIER_COLOR[moc.tier]}22`, color: TIER_COLOR[moc.tier], border: `1px solid ${TIER_COLOR[moc.tier]}55` }}>{moc.tier}</span>
              )}
              {isView && moc?.status && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: `${STATUS_COLOR[moc.status] || '#64748b'}22`, color: STATUS_COLOR[moc.status] || '#64748b', border: `1px solid ${STATUS_COLOR[moc.status] || '#64748b'}55` }}>{moc.status}</span>
              )}
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
            </div>
          </div>
          {isView && <ApprovalTrack moc={moc} />}
        </div>

        {/* ── Saved ── */}
        {saved ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>MOC Saved</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24 }}>Record updated in the MOC register.</div>
            <button onClick={onClose} style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Close</button>
          </div>

        ) : mode === 'new' ? (
          /* ════════ NEW MOC FORM ════════ */
          <form onSubmit={handleSubmit} style={{ padding: '20px 22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              <SectionHd>Change Request Details</SectionHd>

              <Field label="Requested by" required half>
                <Inp value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Department" half>
                <Inp value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Production Engineering" />
              </Field>
              <Field label="Change title" required>
                <Inp value={changeTitle} onChange={e => setChangeTitle(e.target.value)} placeholder="Brief descriptive title of the change" />
              </Field>
              <Field label="Change type" required half>
                <Sel value={changeType} onChange={e => setChangeType(e.target.value)}>
                  <option value="">Select…</option>
                  {CHANGE_TYPES.map(t => <option key={t}>{t}</option>)}
                </Sel>
              </Field>
              <Field label="Tier" half>
                <Sel value={tier} onChange={e => setTier(e.target.value)} style={{ ...inputSx, color: TIER_COLOR[tier] || 'inherit', fontWeight: 700 }}>
                  {CHANGE_TIERS.map(t => <option key={t}>{t}</option>)}
                </Sel>
              </Field>
              <Field label="Change status" half>
                <Sel value={changeStatus} onChange={e => setChangeStatus(e.target.value)}>
                  {CHANGE_STATUSES_FORM.map(s => <option key={s}>{s}</option>)}
                </Sel>
              </Field>
              {changeStatus === 'Temporary' && (
                <Field label="Expiry date" half>
                  <Inp type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                </Field>
              )}

              <SectionHd>Description & Justification</SectionHd>

              <Field label="Description of change" required>
                <Ta value={description} onChange={e => setDescription(e.target.value)} placeholder="What is changing, how, and when…" />
              </Field>
              <Field label="Justification / business reason">
                <Ta value={justification} onChange={e => setJustification(e.target.value)} placeholder="Why is this change necessary…" />
              </Field>

              <SectionHd>Risk & Safety Assessment</SectionHd>

              <Field label="Potential hazards introduced">
                <Ta value={potentialHazards} onChange={e => setPotentialHazards(e.target.value)} placeholder="Identify any new risks this change creates…" />
              </Field>
              <Field label="Safeguards compromised">
                <Ta value={safeguardsCompromised} onChange={e => setSafeguardsCompromised(e.target.value)} placeholder="Any existing controls that this change affects…" />
              </Field>
              <Field label="Associated actions / mitigation">
                <Ta value={associatedActions} onChange={e => setAssociatedActions(e.target.value)} placeholder="Actions required before, during or after the change…" />
              </Field>

              <SectionHd>Process Safety Management Checklist</SectionHd>

              <Field label="Training required?" half>
                <YesNo value={trainingRequired} onChange={setTrainingRequired} />
              </Field>
              <Field label="Procedures update required?" half>
                <YesNo value={proceduresUpdate} onChange={setProceduresUpdate} />
              </Field>
              <Field label="Drawings / documents update required?">
                <YesNo value={drawingsUpdate} onChange={setDrawingsUpdate} />
              </Field>

              <SectionHd sub="Emergency MOC: change is implemented immediately; full review must follow within the next business day">Emergency MOC</SectionHd>

              <Field label="Submit as emergency MOC?">
                <div style={{ display: 'flex', gap: 16 }}>
                  {[false, true].map(v => (
                    <label key={String(v)} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: isEmergency && v ? '#dc2626' : 'var(--text-primary)', cursor: 'pointer', fontWeight: isEmergency && v ? 700 : 400 }}>
                      <input type="radio" checked={isEmergency === v} onChange={() => setIsEmergency(v)} />
                      {v ? 'Yes — Emergency' : 'No — Standard review'}
                    </label>
                  ))}
                </div>
                {isEmergency && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#dc262618', border: '1px solid #dc262644', borderRadius: 4, fontSize: 10, color: '#dc2626' }}>
                    This MOC will be marked Approved immediately. A full retrospective review must be completed by the next business day per IMS §6.2.
                  </div>
                )}
              </Field>
            </div>

            {errMsg && <div style={{ marginBottom: 14, padding: '9px 12px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>{errMsg}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ padding: '9px 20px', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: '9px 24px', background: isEmergency ? '#dc2626' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {busy ? 'Saving…' : isEmergency ? 'Submit Emergency MOC' : 'Submit for Approval'}
              </button>
            </div>
          </form>

        ) : (
          /* ════════ VIEW MODE ════════ */
          <div style={{ padding: '20px 22px' }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {tabBtn('details',  'Details')}
              {isAdmin && tabBtn('approval', 'Approval')}
              {isAdmin && moc?.status === 'Approved' && tabBtn('closure', 'Closure')}
            </div>

            {activeTab === 'details' && (
              <div>
                <DetailRow label="Requested by"      value={moc?.requestedBy} />
                <DetailRow label="Department"         value={moc?.department} />
                <DetailRow label="Date submitted"     value={moc?.timestamp?.slice(0, 10)} />
                <DetailRow label="Change type"        value={moc?.changeType} />
                <DetailRow label="Tier"               value={moc?.tier} />
                <DetailRow label="Change status"      value={moc?.changeStatus} />
                <DetailRow label="Expiry date"        value={moc?.expiryDate} />
                <DetailRow label="Description"        value={moc?.description} />
                <DetailRow label="Justification"      value={moc?.justification} />
                <DetailRow label="Potential hazards"  value={moc?.potentialHazards} />
                <DetailRow label="Safeguards affected" value={moc?.safeguardsCompromised} />
                <DetailRow label="Associated actions" value={moc?.associatedActions} />
                <DetailRow label="Training required"  value={moc?.trainingRequired} />
                <DetailRow label="Procedures update"  value={moc?.proceduresUpdate} />
                <DetailRow label="Drawings update"    value={moc?.drawingsUpdate} />
                {moc?.closureComments && <DetailRow label="Closure comments" value={moc.closureComments} />}
                {moc?.closureDate     && <DetailRow label="Closed on"        value={moc.closureDate} />}
              </div>
            )}

            {activeTab === 'approval' && isAdmin && (
              <div>
                {/* Approval history */}
                {[
                  { label: 'Supervisor', name: moc?.supervisorName, date: moc?.supervisorDate },
                  { label: 'HoD',        name: moc?.hodName,        date: moc?.hodDate },
                  { label: 'Executive',  name: moc?.execName,       date: moc?.execDate },
                ].map(row => row.name && (
                  <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{row.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', fontFamily: 'monospace' }}>{row.date}</div>
                  </div>
                ))}

                {canAdvance && (
                  <div style={{ marginTop: 22, padding: '16px 18px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {stageLabel(moc.status)}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Your name *</label>
                      <Inp value={approverName} onChange={e => setApproverName(e.target.value)} placeholder="Full name — this will be recorded as the approver" />
                    </div>
                    {errMsg && <div style={{ marginBottom: 12, padding: '8px 10px', background: '#dc262618', border: '1px solid #dc262644', borderRadius: 4, fontSize: 11, color: '#dc2626' }}>{errMsg}</div>}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={handleApprove} disabled={busy} style={{ flex: 1, padding: '9px 0', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {busy ? 'Saving…' : stageLabel(moc.status)}
                      </button>
                      <button onClick={handleReject} disabled={busy} style={{ padding: '9px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {!canAdvance && moc?.status !== 'Rejected' && (
                  <div style={{ marginTop: 16, padding: '12px', background: '#10b98118', border: '1px solid #10b98144', borderRadius: 6, fontSize: 11, color: '#10b981', textAlign: 'center' }}>
                    {moc?.status === 'Approved' ? '✓ Fully approved' : 'No further approval actions available.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'closure' && isAdmin && moc?.status === 'Approved' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.6 }}>
                  Close this MOC once the change has been fully implemented and verified.
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Closure comments</label>
                  <Ta value={closureComments} onChange={e => setClosureComments(e.target.value)} placeholder="Confirm implementation, outcomes, any deviations from the plan…" />
                </div>
                {moc?.proceduresUpdate === 'Yes' || moc?.drawingsUpdate === 'Yes' ? (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>PSSR completion date</label>
                    <Inp type="date" value={pssrDate} onChange={e => setPssrDate(e.target.value)} />
                  </div>
                ) : null}
                {errMsg && <div style={{ marginBottom: 14, padding: '9px 12px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>{errMsg}</div>}
                <button onClick={handleClose} disabled={busy} style={{ width: '100%', padding: '10px 0', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {busy ? 'Closing…' : 'Close MOC'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
