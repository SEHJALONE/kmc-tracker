import { useState } from 'react';
import { SEED_STATIONS } from '../data/stations';

const LINE_IMAGE = {
  MACHINE:  '/Machine Shop.jpg',
  BODY:     '/Frame Parts Making.jpg',
  ELECTRO:  '/Electrophoresis.png',
  FRAME:    '/Frame & Body Welding.png',
  CHASSIS1: '/Chassis Line 02.jpg',
  CHASSIS2: '/Chassis Line 02.jpg',
  PAINT:    '/Paint Shop.png',
  TRIM:     '/Trim Line & Final Assembly.jpg',
  QA:       '/Quality Inspection & Testing.png',
};

const LS = {
  get: (k, fallback = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export default function PendingReviews({ onBack, theme = 'dark', role = 'supervisor', assignedStations = null, assignedLine = null }) {
  const isDark = theme === 'dark';
  const bg      = isDark ? 'rgba(7,9,15,0.92)'     : 'rgba(255,255,255,0.97)';
  const card    = isDark ? 'rgba(13,21,38,0.90)'    : '#fff';
  const text    = isDark ? '#e2e8f0'                : '#1e293b';
  const muted   = isDark ? '#94a3b8'                : '#475569';
  const dim     = isDark ? '#64748b'                : '#94a3b8';
  const border  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
  const inpBg   = isDark ? '#0d1526'                : '#f8fafc';
  const inpBor  = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  const R       = '#dc2626';
  const GR      = '#10b981';
  const AM      = '#f59e0b';
  const fm      = "'Inter', system-ui, sans-serif";
  const mono    = "'Inter', system-ui, sans-serif";

  const allPending = LS.get('kmc_pending_reviews', []);

  // Filter by role scope: supervisor sees only their assigned stations,
  // manager sees only their assigned line, director/admin sees everything.
  const [pending, setPending] = useState(() => {
    if (role === 'supervisor' && assignedStations?.length) {
      return allPending.filter(r => assignedStations.includes(r.stationCode));
    }
    if (role === 'manager' && assignedLine) {
      return allPending.filter(r => SEED_STATIONS[r.stationCode]?.line === assignedLine);
    }
    return allPending;
  });
  const [selected, setSelected] = useState(null);
  const [reviewFields, setReviewFields] = useState({ approvalStatus: '', reviewComments: '', reviewer: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  function openReview(item) {
    setSelected(item);
    setReviewFields({ approvalStatus: '', reviewComments: '', reviewer: '' });
  }

  function saveReview() {
    if (!reviewFields.approvalStatus) { alert('Select an approval status.'); return; }
    if (!reviewFields.reviewer) { alert('Enter reviewer name.'); return; }
    setSaving(true);
    const updated = pending.map(p =>
      p.id === selected.id
        ? { ...p, approvalStatus: reviewFields.approvalStatus, reviewComments: reviewFields.reviewComments, reviewer: reviewFields.reviewer, reviewDate: new Date().toISOString().slice(0,10) }
        : p
    ).filter(p => p.id !== selected.id || reviewFields.approvalStatus === 'pending_review');

    const completedItem = { ...selected, ...reviewFields, reviewDate: new Date().toISOString().slice(0,10) };
    LS.set('kmc_pending_reviews', updated.filter(p => p.id !== selected.id));

    const busLog = LS.get(`kmc_bus_log_${selected.vin}`, []);
    const updatedLog = busLog.map(s =>
      s.timestamp === selected.timestamp ? { ...s, ...reviewFields, reviewDate: completedItem.reviewDate } : s
    );
    LS.set(`kmc_bus_log_${selected.vin}`, updatedLog);

    setPending(prev => prev.filter(p => p.id !== selected.id));
    setSelected(null);
    setSaving(false);
    showToast('Review submitted ✓');
  }

  const inp = { width: '100%', fontSize: 13, padding: '8px 10px', border: `1px solid ${inpBor}`, borderRadius: 4, background: inpBg, color: text, outline: 'none', boxSizing: 'border-box', fontFamily: fm, colorScheme: isDark ? 'dark' : 'light' };

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>
      <style>{`@keyframes prSpin { to { transform: rotate(360deg); } }`}</style>

      {/* Banner image */}
      <div style={{
        width: '100%', maxWidth: 860, height: 130, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: "url('/Trim Line & Final Assembly.jpg')",
        backgroundSize: 'cover', backgroundPosition: 'center 40%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.82) 0%, rgba(7,9,15,0.35) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>Pending Reviews</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Travel cards submitted by users — awaiting your review</div>
          </div>
          <div style={{ marginLeft: 'auto', background: pending.length > 0 ? `${AM}33` : 'rgba(255,255,255,0.1)', color: pending.length > 0 ? AM : 'rgba(255,255,255,0.6)', border: `1px solid ${pending.length > 0 ? AM + '55' : 'rgba(255,255,255,0.15)'}`, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {pending.length} pending
          </div>
        </div>
      </div>

      {pending.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: GR }}>All reviews complete</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>No pending travel cards at this time.</div>
        </div>
      )}

      {/* List */}
      {!selected && pending.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 800 }}>
          {pending.map(item => {
            const lineId = SEED_STATIONS[item.stationCode]?.line;
            const img = lineId ? LINE_IMAGE[lineId] : null;
            return (
              <div key={item.id} onClick={() => openReview(item)} style={{
                borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative',
                border: `1px solid ${border}`,
                backgroundImage: img ? `url('${img}')` : 'none',
                backgroundSize: 'cover', backgroundPosition: 'center',
                minHeight: 88,
              }}>
                {/* dark scrim */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.88) 0%, rgba(7,9,15,0.55) 60%, rgba(7,9,15,0.30) 100%)' }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: AM, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>{item.vin} — {item.stationCode}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{item.project} · {item.line}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: mono, marginTop: 2 }}>{new Date(item.timestamp).toLocaleString()} · Operators: {(item.operators || []).join(', ') || '—'}</div>
                  </div>
                  <div style={{ fontSize: 11, color: AM, fontFamily: mono, letterSpacing: '0.06em', flexShrink: 0, fontWeight: 700 }}>Review →</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review panel */}
      {selected && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: `1px solid ${border}`, color: muted, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: mono, letterSpacing: '0.08em' }}>← List</button>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.vin} — {selected.stationCode}</div>
          </div>

          {/* Summary card */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '16px 20px', background: card, marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: mono, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` }}>Travel Card Details</div>
            {[
              ['Project', selected.project],
              ['Bus model', selected.busModel],
              ['VIN', selected.vin],
              ['Line', selected.line],
              ['Station', selected.stationCode],
              ['Operators', (selected.operators || []).join(', ') || '—'],
              ['Clock in', selected.clockIn ? new Date(selected.clockIn).toLocaleString() : '—'],
              ['Clock out', selected.clockOut ? new Date(selected.clockOut).toLocaleString() : '—'],
              ['Actual time', `${selected.actualTime} min`],
              ['OHS issue', selected.ohsIssue || 'None'],
              ['Waste', selected.wasteGenerated || '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${border}`, fontSize: 12 }}>
                <span style={{ color: dim, fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</span>
                <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
              </div>
            ))}

            {/* Activities */}
            {Object.keys(selected.activityStatuses || {}).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: dim, fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Activities</div>
                {Object.entries(selected.activityStatuses).map(([act, status]) => (
                  <div key={act} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, borderBottom: `1px solid ${border}` }}>
                    <span style={{ color: muted, maxWidth: '70%' }}>{act}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: status === 'complete' ? GR : status === 'issue' ? AM : muted }}>{status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review form */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '16px 20px', background: card }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: mono, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` }}>Your Review</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: mono, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Approval status</label>
              <select style={inp} value={reviewFields.approvalStatus} onChange={e => setReviewFields(f => ({ ...f, approvalStatus: e.target.value }))}>
                <option value="">Select…</option>
                <option value="approved">Approved</option>
                <option value="pending">Needs further review</option>
                <option value="rejected">Rejected / Rework required</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: mono, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Reviewer name</label>
              <input style={inp} value={reviewFields.reviewer} onChange={e => setReviewFields(f => ({ ...f, reviewer: e.target.value }))} placeholder="Your name" />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 10, color: muted, fontFamily: mono, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Comments (optional)</label>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 64 }} value={reviewFields.reviewComments} onChange={e => setReviewFields(f => ({ ...f, reviewComments: e.target.value }))} placeholder="Any notes or feedback for the operator…" />
            </div>
            <button onClick={saveReview} disabled={saving} style={{ width: '100%', padding: '11px 0', background: R, color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: fm, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? 'rgba(16,185,129,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.35)' : 'rgba(220,38,38,0.35)'}`, borderLeft: `3px solid ${toast.ok ? GR : R}`, borderRadius: '0 6px 6px 0', padding: '10px 18px', fontSize: 12, fontFamily: fm, color: toast.ok ? GR : R }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
