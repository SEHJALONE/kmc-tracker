import { useState } from 'react';
import ThemeSwitch from './ui/ThemeSwitch';
import { StatTile } from './ui/Charts';
import { sameStationCode, stationLineOf } from '../data/stations';
import { useSubmissionsData } from '../hooks/useSubmissionsData';
import { workingMinutes } from '../utils/workTime';
import { delayLabel } from '../utils/delay';
import { cleanActivityTimes } from '../utils/activityTimes';
import { lineNeedsRepair, correctLineFor } from '../utils/stationLine';

// "2026-11-14T08:30" for a datetime-local box, from whatever the sheet holds.
function toLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T');
}

const STATUS_OPTS = [
  ['complete', 'Complete'], ['incomplete', 'Incomplete'], ['issue', 'Issue noted'],
  ['rework', 'Rework needed'], ['na', 'N/A'],
];

// The editable copy of a card a supervisor corrects while reviewing it.
function draftOf(item) {
  return {
    project: item.project || '', busModel: item.busModel || '', vin: item.vin || '',
    clockIn: toLocalInput(item.clockIn), clockOut: toLocalInput(item.clockOut),
    operators: (item.operators || []).join(', '),
    activityStatuses: { ...(item.activityStatuses || {}) },
    activityTimes: Object.fromEntries(Object.entries(item.activityTimes || {}).map(([a, m]) => [a, String(m)])),
    ohsIssue: item.ohsIssue || '', wasteGenerated: item.wasteGenerated || '',
    generalComments: item.generalComments || '',
  };
}

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

// Any status before "approved" still needs a reviewer's attention —
// includes a first look (pending_review) and a second pass after "needs
// further review" or "rejected" was chosen previously.
const PENDING_STATUSES = ['pending_review', 'pending', 'rejected', ''];

// Status words and colours for the submissions list.
const STATUS_LABEL = {
  approved: ['Approved', '#10b981'], pending_review: ['Awaiting review', '#f59e0b'], '': ['Awaiting review', '#f59e0b'],
  pending: ['Further review', '#0ea5e9'], rejected: ['Rework required', '#dc2626'],
};
const statusOf = s => STATUS_LABEL[s] || [s || 'Unknown', '#64748b'];

// Three views of the same cards: everything filed, the review queue, and the approved record.
const TABS = [
  { id: 'review', label: 'To review' },
  { id: 'all', label: 'All submissions' },
  { id: 'approved', label: 'Approved' },
];
const PAGE = 40;

const searchText = r => [r.vin, r.stationCode, r.station, r.project, r.busModel, r.line, r.submittedBy, r.reviewer, ...(r.operators || [])].join(' ').toLowerCase();
const newestFirst = (a, b) => String(b.timestamp).localeCompare(String(a.timestamp));

export default function PendingReviews({ onBack, onToggleTheme = null, theme = 'dark', role = 'supervisor', assignedStations = null, assignedLines = null, currentUserName = null }) {
  const isDark = theme === 'dark';
  const bg      = 'transparent';
  const card    = 'var(--bg-card)';
  const text    = 'var(--text-primary)';
  const muted   = 'var(--text-secondary)';
  const dim     = 'var(--text-muted)';
  const border  = 'var(--border-subtle)';
  const inpBg   = 'var(--input-bg)';
  const inpBor  = 'var(--input-border)';
  const R       = '#dc2626';
  const GR      = '#10b981';
  const AM      = '#f59e0b';
  const fm      = "'Inter', system-ui, sans-serif";
  const mono    = "'Inter', system-ui, sans-serif";

  const { submissions, loading, reviewSubmission, reviewAndEditSubmission } = useSubmissionsData();
  const knownModels = [...new Set(submissions.map(s => s.busModel).filter(Boolean))].sort();
  const knownProjects = [...new Set(submissions.map(s => s.project).filter(Boolean))].sort();

  // Filter by role scope: supervisor sees only their assigned stations,
  // director/admin sees everything. Scoped to still-pending items only —
  // already-approved cards don't belong in this queue.
  const scoped = submissions.filter(r => {
    if (role === 'supervisor' && assignedStations?.length) return assignedStations.some(c => sameStationCode(c, r.stationCode));
    if (role === 'manager' && assignedLines?.length) return assignedLines.includes(stationLineOf(r.stationCode));
    return true;
  }).sort(newestFirst);
  const pending = scoped.filter(r => PENDING_STATUSES.includes(r.approvalStatus));
  const approved = scoped.filter(r => r.approvalStatus === 'approved');

  const [tab, setTab] = useState('review');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const tabRows = tab === 'review' ? pending : tab === 'approved' ? approved : scoped;
  const q = query.trim().toLowerCase();
  const listed = q ? tabRows.filter(r => searchText(r).includes(q)) : tabRows;
  const tabCount = { review: pending.length, all: scoped.length, approved: approved.length };

  const [selected, setSelected] = useState(null);
  // Approved cards open as a record: no edits, no new decision.
  const readOnly = !!selected && !PENDING_STATUSES.includes(selected.approvalStatus);
  const [reviewFields, setReviewFields] = useState({ approvalStatus: '', reviewComments: '', reviewer: currentUserName || '' });
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null); // non-null while "Edit details" is open
  const [toast, setToast] = useState(null);

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  function openReview(item) {
    setSelected(item);
    setDraft(null);
    setReviewFields({ approvalStatus: '', reviewComments: '', reviewer: currentUserName || '' });
  }

  async function saveReview() {
    if (!reviewFields.approvalStatus) { alert('Select an approval status.'); return; }
    if (!reviewFields.reviewer) { alert('Enter reviewer name.'); return; }
    const review = {
      recordId: selected.recordId,
      approvalStatus: reviewFields.approvalStatus,
      reviewComments: reviewFields.reviewComments,
      reviewer: reviewFields.reviewer,
      reviewDate: new Date().toISOString().slice(0, 10),
    };
    let changes = null;
    // A card filed under the wrong line (C01-02 under Trim) is rewritten with
    // the right line as part of the review, even if nothing else was edited.
    const wrongLine = lineNeedsRepair(selected.line, selected.stationCode, selected.busModel);
    if (wrongLine || (draft && JSON.stringify(draft) !== JSON.stringify(draftOf(selected)))) {
      changes = cardChanges(selected, draft || draftOf(selected));
      if (typeof changes === 'string') {
        // Only the line needed fixing: never block the review over old data.
        if (!draft) changes = null;
        else { alert(changes); return; }
      }
    }
    setSaving(true);

    const result = changes
      ? await reviewAndEditSubmission({ changes, review })
      : await reviewSubmission(review);

    setSelected(null);
    setDraft(null);
    setSaving(false);
    if (result.ok) showToast(changes ? 'Card corrected and review submitted' : 'Review submitted');
    else showToast(`Could not save review: ${result.error || 'unknown error'}`, false);
  }

  // The full corrected card for updateSubmission (it rewrites the card's
  // activity/consumable/operator rows), or an error message to show.
  function cardChanges(item, d) {
    if (!d.vin.trim()) return 'VIN cannot be empty.';
    if (!d.clockIn || !d.clockOut) return 'Enter both clock-in and clock-out.';
    const start = new Date(d.clockIn), end = new Date(d.clockOut);
    if (isNaN(start) || isNaN(end) || end <= start) return 'Clock-out must be after clock-in.';
    const clocksSame = d.clockIn === toLocalInput(item.clockIn) && d.clockOut === toLocalInput(item.clockOut);
    // Per-day hours only still fit if the clock times did not move.
    const workDays = clocksSame && Array.isArray(item.workDays) ? item.workDays : null;
    const w = workingMinutes(start, end, workDays);
    const acts = Object.keys(d.activityStatuses);
    return {
      recordId: item.recordId, timestamp: item.timestamp,
      project: d.project.trim(), busModel: d.busModel.trim(), vin: d.vin.trim(),
      line: correctLineFor(item.line, item.stationCode, d.busModel || item.busModel), station: item.station, stationCode: item.stationCode,
      hseResources: item.hseResources,
      clockIn: d.clockIn, clockOut: end.toISOString(), workDays,
      actualTime: w.net, grossTime: w.gross, breakMinutes: Math.max(0, w.gross - w.net),
      designedTime: item.designedTime,
      operators: d.operators.split(',').map(x => x.trim()).filter(Boolean),
      activityStatuses: d.activityStatuses,
      activityTimes: cleanActivityTimes(d.activityTimes, acts),
      addedActivities: item.addedActivities || [],
      resourcesUsed: item.resourcesUsed || {},
      otherResources: item.otherResources || [],
      ohsIssue: d.ohsIssue.trim() || null,
      wasteGenerated: d.wasteGenerated,
      generalComments: d.generalComments.trim() || null,
    };
  }
  const setD = (k, v) => setDraft(p => ({ ...p, [k]: v }));

  const inp = { width: '100%', fontSize: 13, padding: '8px 10px', border: `1px solid ${inpBor}`, borderRadius: 4, background: inpBg, color: text, outline: 'none', boxSizing: 'border-box', fontFamily: fm, colorScheme: isDark ? 'dark' : 'light' };

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)', maxWidth: 1000, margin: '0 auto' }}>
      <style>{`@keyframes prSpin { to { transform: rotate(360deg); } }`}</style>

      {/* Banner image */}
      <div style={{
        width: '100%', maxWidth: '100%', height: 150, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--panel-shadow)',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('${isDark ? '/img 1.png' : '/img 2.png'}')`,
        backgroundSize: 'cover', backgroundPosition: 'center 40%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(10,13,20,0.92) 0%, rgba(10,13,20,0.72) 58%, rgba(10,13,20,0.5) 100%)' }} />
        {onToggleTheme && <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 2 }}><ThemeSwitch theme={theme} onToggle={onToggleTheme} /></div>}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} className="kmc-btn" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff', backdropFilter: 'blur(6px)' }}>← Back</button>
          <div>
            <div className="kmc-title" style={{ color: '#fff', fontSize: 34, textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>Card Activity</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)', letterSpacing: '0.02em', marginTop: 4 }}>Travel cards filed at your stations: submissions, reviews and approvals</div>
          </div>
          <div style={{ marginLeft: 'auto', background: pending.length > 0 ? `${AM}33` : 'rgba(255,255,255,0.1)', color: pending.length > 0 ? AM : 'rgba(255,255,255,0.6)', border: `1px solid ${pending.length > 0 ? AM + '55' : 'rgba(255,255,255,0.15)'}`, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {pending.length} pending
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 22 }}>
        <StatTile label="Submitted" value={scoped.length} tone="teal" sub="travel cards in your scope" />
        <StatTile label="Awaiting review" value={pending.filter(r => r.approvalStatus === 'pending_review' || !r.approvalStatus).length} tone="amber" sub="never reviewed" />
        <StatTile label="Sent back" value={pending.filter(r => r.approvalStatus === 'pending' || r.approvalStatus === 'rejected').length} tone="red" sub="further review or rework" />
        <StatTile label="Approved" value={approved.length} tone="lime" sub={scoped.length ? `${Math.round((approved.length / scoped.length) * 100)}% of submissions` : 'none yet'} />
      </div>

      {!selected && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t.id} className={`kmc-btn${tab === t.id ? ' primary' : ''}`} onClick={() => { setTab(t.id); setLimit(PAGE); }}>
              {t.label}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: tab === t.id ? 'rgba(255,255,255,0.22)' : 'var(--socket-bg)' }}>{tabCount[t.id]}</span>
            </button>
          ))}
          <input value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Search VIN, station, person…"
            aria-label="Search cards" style={{ ...inp, width: 'auto', flex: '1 1 200px', maxWidth: 320, marginLeft: 'auto', borderRadius: 999, padding: '8px 14px' }} />
        </div>
      )}

      {loading && scoped.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>Loading…</div>
      )}

      {!loading && !selected && listed.length === 0 && (
        <div className="kmc-panel" style={{ textAlign: 'center', padding: '40px 20px', color: dim }}>
          {q ? (
            <div style={{ fontSize: 13 }}>No cards match "{query}".</div>
          ) : tab === 'review' ? (<>
            <div style={{ fontSize: 16, fontWeight: 700, color: GR }}>All reviews complete</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>No travel cards are waiting for a decision.</div>
          </>) : (
            <div style={{ fontSize: 13 }}>{tab === 'approved' ? 'No approved cards yet.' : 'No cards have been filed at your stations yet.'}</div>
          )}
        </div>
      )}

      {/* List */}
      {!selected && listed.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: '100%' }}>
          {listed.slice(0, limit).map(item => {
            const lineId = stationLineOf(item.stationCode);
            const img = lineId ? LINE_IMAGE[lineId] : null;
            const [stLabel, stColor] = statusOf(item.approvalStatus);
            const canReview = PENDING_STATUSES.includes(item.approvalStatus);
            return (
              <div key={item.id} onClick={() => openReview(item)} style={{
                borderRadius: 16, overflow: 'hidden', cursor: 'pointer', position: 'relative', boxShadow: 'var(--panel-shadow)',
                border: `1px solid ${border}`,
                backgroundImage: img ? `url('${img}')` : 'none',
                backgroundSize: 'cover', backgroundPosition: 'center',
                minHeight: 88,
              }}>
                {/* dark scrim */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(10,13,20,0.93) 0%, rgba(10,13,20,0.80) 55%, rgba(10,13,20,0.62) 100%)' }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>{item.vin} - {item.stationCode}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.84)', marginTop: 3 }}>{[item.project, item.busModel, item.line].filter(Boolean).join(' · ')}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)', fontFamily: mono, marginTop: 2 }}>
                      {new Date(item.timestamp).toLocaleString()} · Operators: {(item.operators || []).join(', ') || '-'}
                      {item.approvalStatus === 'approved' && item.reviewer ? ` · Approved by ${item.reviewer}${item.reviewDate ? ` on ${String(item.reviewDate).slice(0, 10)}` : ''}` : ''}
                    </div>
                  </div>
                  {tab !== 'review' && (
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: `${stColor}cc`, borderRadius: 999, padding: '4px 10px' }}>{stLabel}</span>
                  )}
                  <span className={`kmc-btn${canReview ? ' primary' : ''}`} style={{ padding: '7px 14px', flexShrink: 0, ...(canReview ? {} : { background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }) }}>{canReview ? 'Review →' : 'View →'}</span>
                </div>
              </div>
            );
          })}
          {listed.length > limit && (
            <button className="kmc-btn" style={{ alignSelf: 'center', marginTop: 6 }} onClick={() => setLimit(n => n + PAGE)}>
              Show more ({listed.length - limit} left)
            </button>
          )}
        </div>
      )}

      {/* Review panel */}
      {selected && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: `1px solid ${border}`, color: muted, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: mono, letterSpacing: '0.08em' }}>← List</button>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.vin} - {selected.stationCode}</div>
            {readOnly ? (
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: statusOf(selected.approvalStatus)[1], border: `1px solid ${statusOf(selected.approvalStatus)[1]}`, borderRadius: 999, padding: '4px 10px' }}>{statusOf(selected.approvalStatus)[0]}</span>
            ) : (
              <button onClick={() => setDraft(d => d ? null : draftOf(selected))} className="kmc-btn" style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: 11, borderColor: draft ? border : AM, color: draft ? muted : AM }}>
                {draft ? 'Discard edits' : 'Edit details'}
              </button>
            )}
          </div>
          {!readOnly && lineNeedsRepair(selected.line, selected.stationCode, selected.busModel) && (
            <div style={{ fontSize: 12, color: R, border: `1px solid ${R}`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              This card was saved under {selected.line || 'no line'}, but {selected.stationCode} belongs to {correctLineFor(selected.line, selected.stationCode, selected.busModel)}. Submitting the review saves it under the right line.
            </div>
          )}
          {draft && (
            <div style={{ fontSize: 11, color: AM, marginBottom: 10 }}>
              Correct anything that's wrong (VIN, project, times, activities…). Your changes are saved together with your review when you press Submit Review.
            </div>
          )}

          {/* Summary card */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '16px 20px', background: card, marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: mono, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` }}>Travel Card Details</div>
            {draft && (() => {
              const lbl = { display: 'block', fontSize: 10, color: muted, fontFamily: mono, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 };
              const fld = { marginBottom: 12 };
              const acts = Object.keys(draft.activityStatuses);
              return (
                <div>
                  <datalist id="pr-models">{knownModels.map(m => <option key={m} value={m} />)}</datalist>
                  <datalist id="pr-projects">{knownProjects.map(m => <option key={m} value={m} />)}</datalist>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 12px' }}>
                    <div style={fld}><label style={lbl}>Project</label><input style={inp} list="pr-projects" value={draft.project} onChange={e => setD('project', e.target.value)} /></div>
                    <div style={fld}><label style={lbl}>Bus model</label><input style={inp} list="pr-models" value={draft.busModel} onChange={e => setD('busModel', e.target.value)} /></div>
                    <div style={fld}><label style={lbl}>VIN</label><input style={inp} value={draft.vin} onChange={e => setD('vin', e.target.value)} /></div>
                    <div style={fld}><label style={lbl}>Station</label><input style={{ ...inp, opacity: 0.6 }} value={`${selected.stationCode} · ${selected.line}`} disabled /></div>
                    <div style={fld}><label style={lbl}>Clock in</label><input type="datetime-local" style={inp} value={draft.clockIn} onChange={e => setD('clockIn', e.target.value)} /></div>
                    <div style={fld}><label style={lbl}>Clock out</label><input type="datetime-local" style={inp} value={draft.clockOut} onChange={e => setD('clockOut', e.target.value)} /></div>
                  </div>
                  <div style={fld}><label style={lbl}>Operators (comma-separated)</label><input style={inp} value={draft.operators} onChange={e => setD('operators', e.target.value)} /></div>
                  {acts.length > 0 && (
                    <div style={fld}>
                      <label style={lbl}>Activities · status and minutes taken (optional)</label>
                      {acts.map(a => (
                        <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${border}`, flexWrap: 'wrap' }}>
                          <span style={{ flex: '1 1 180px', fontSize: 11, color: muted }}>{a}</span>
                          <select style={{ ...inp, width: 150, fontSize: 12, padding: '5px 8px' }} value={draft.activityStatuses[a] || ''} onChange={e => setD('activityStatuses', { ...draft.activityStatuses, [a]: e.target.value })}>
                            <option value="">Status…</option>
                            {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input type="number" min="0" placeholder="min" aria-label={`Minutes taken: ${a}`} style={{ ...inp, width: 80, fontSize: 12, padding: '5px 8px' }}
                            value={draft.activityTimes[a] ?? ''} onChange={e => setD('activityTimes', { ...draft.activityTimes, [a]: e.target.value })} />
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={fld}><label style={lbl}>OHS issue (blank = none)</label><input style={inp} value={draft.ohsIssue} onChange={e => setD('ohsIssue', e.target.value)} /></div>
                  <div style={fld}><label style={lbl}>Waste generated</label><input style={inp} value={draft.wasteGenerated} onChange={e => setD('wasteGenerated', e.target.value)} /></div>
                  <div style={fld}><label style={lbl}>Operator's comments</label><textarea style={{ ...inp, resize: 'vertical', minHeight: 54 }} value={draft.generalComments} onChange={e => setD('generalComments', e.target.value)} /></div>
                </div>
              );
            })()}

            {!draft && [
              ['Project', selected.project],
              ['Bus model', selected.busModel],
              ['VIN', selected.vin],
              ['Line', selected.line],
              ['Station', selected.stationCode],
              ['Submitted by', selected.submittedBy || '-'],
              ['Operators', (selected.operators || []).join(', ') || '-'],
              ['Clock in', selected.clockIn ? new Date(selected.clockIn).toLocaleString() : '-'],
              ['Clock out', selected.clockOut ? new Date(selected.clockOut).toLocaleString() : '-'],
              ['Actual time', `${selected.actualTime} min`],
              ['OHS issue', selected.ohsIssue || 'None'],
              ['Waste', selected.wasteGenerated || '-'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${border}`, fontSize: 12 }}>
                <span style={{ color: dim, fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</span>
                <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
              </div>
            ))}

            {/* Activities */}
            {!draft && Object.keys(selected.activityStatuses || {}).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: dim, fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Activities</div>
                {Object.entries(selected.activityStatuses).map(([act, status]) => (
                  <div key={act} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, borderBottom: `1px solid ${border}` }}>
                    <span style={{ color: muted, maxWidth: '70%' }}>{act}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: status === 'complete' ? GR : status === 'issue' ? AM : muted }}>{status}{selected.activityTimes?.[act] ? ` · ${selected.activityTimes[act]} min` : ''}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Additional notes (comments + unexpected delay/time lost) */}
            {!draft && (selected.generalComments || selected.unexpectedDelay?.types?.length > 0) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: dim, fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Additional Notes</div>
                {!draft && selected.generalComments && (
                  <div style={{ fontSize: 11, color: muted, padding: '5px 0', borderBottom: `1px solid ${border}` }}>{selected.generalComments}</div>
                )}
                {!draft && selected.unexpectedDelay?.types?.map(t => (
                  <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, borderBottom: `1px solid ${border}` }}>
                    <span style={{ color: muted }}>{t}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: AM }}>{delayLabel(selected.unexpectedDelay, t)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Earlier decision on this card (the record for approved cards). */}
          {selected.reviewer && (
            <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '16px 20px', background: card, marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: mono, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` }}>{readOnly ? 'Review record' : 'Previous review'}</div>
              {[
                ['Decision', statusOf(selected.approvalStatus)[0]],
                ['Reviewer', selected.reviewer],
                ['Review date', selected.reviewDate ? String(selected.reviewDate).slice(0, 10) : '-'],
                ['Comments', selected.reviewComments || '-'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${border}`, fontSize: 12 }}>
                  <span style={{ color: dim, fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Review form */}
          {!readOnly && <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '16px 20px', background: card }}>
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
            <button onClick={saveReview} disabled={saving} style={{ width: '100%', padding: '11px 0', background: R, color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0', fontFamily: fm, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>}
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
