import { useEffect, useMemo, useState } from 'react';
import { LINES, STATIONS } from '../data/stations';
import { requestMoreAccess, listAccessChangeRequests, resolveAccessChangeRequest, profileErrorText, isOldServer } from '../data/profile';

// Asking for more access after you already have an account, and the
// administrators' side of it.
//
//   <MoreAccessRequest />  Settings page: pick extra stations and/or modules,
//                          say why, send. Shows your earlier requests.
//   <AccessChangeInbox />  User Management: every open request, with a button
//                          to open that account and one to close the request.
//
// A request never changes an account by itself: an administrator edits the
// account in User Management, then marks the request done.

export const EXTRA_OPTIONS = [
  'Bus Tracker',
  'Review travel cards (supervisor)',
  'Cost Estimation',
  'VIN Register (Type Approvals)',
  'Job Orders (Machine Shop)',
];

const STATUS = { pending: ['Waiting', 'var(--c-amber)'], done: ['Done', 'var(--c-lime)'], declined: ['Declined', 'var(--c-red)'] };
const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const errorText = r => (r.error === 'too-many-pending' ? 'You already have three requests waiting. Wait for an answer before sending another.'
  : r.error === 'nothing-requested' ? 'Pick at least one station or item, or say what you need.'
  : r.error === 'request-not-found' ? 'That request no longer exists.'
  : profileErrorText(r));

function StatusTag({ status }) {
  const [label, color] = STATUS[status] || [status, 'var(--text-muted)'];
  return <span style={{ fontSize: 12, fontWeight: 600, color, whiteSpace: 'nowrap' }}>{label}</span>;
}

function RequestLine({ r, showWho = false, children = null }) {
  const asked = [...(r.stations || []), ...(r.extras || [])].join(', ');
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        {showWho && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>{r.fullName || r.username} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({r.username})</span></div>}
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{asked || 'See the note'}</div>
        {r.reason && <div className="kmc-hint" style={{ marginTop: 2 }}>{r.reason}</div>}
        {r.adminNote && <div className="kmc-hint" style={{ marginTop: 2 }}>Administrator: {r.adminNote}</div>}
        <div className="kmc-hint" style={{ marginTop: 2 }}>Sent {when(r.submittedAt)}</div>
      </div>
      {children || <StatusTag status={r.status} />}
    </div>
  );
}

export function MoreAccessRequest({ assignedStations = [] }) {
  const [line, setLine] = useState('');
  const [stations, setStations] = useState([]);
  const [extras, setExtras] = useState([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [mine, setMine] = useState([]);
  const [off, setOff] = useState(false);   // server not updated yet

  const load = () => listAccessChangeRequests().then(r => {
    if (r.ok) setMine(r.requests || []);
    else if (isOldServer(r.error)) setOff(true);
  });
  useEffect(() => { load(); }, []);

  const have = useMemo(() => new Set((assignedStations || []).map(c => String(c).toUpperCase())), [assignedStations]);
  const lineStations = useMemo(() => Object.entries(STATIONS)
    .filter(([, s]) => s.line === line && s.active !== false)
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0)), [line]);
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const nothing = !stations.length && !extras.length && reason.trim().length < 5;

  async function send() {
    if (busy || nothing) return;
    setBusy(true); setMsg(null);
    const r = await requestMoreAccess({ stations, extras, reason: reason.trim() });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: errorText(r) }); return; }
    setStations([]); setExtras([]); setReason(''); setLine('');
    setMsg({ ok: true, text: 'Sent. The administrators have been told and will answer here.' });
    load();
  }

  return (
    <section className="kmc-panel" style={{ padding: 20 }}>
      <h2 className="kmc-section-title">Request more access</h2>
      {off ? (
        <div className="kmc-hint">This is not switched on at the server yet. The system admin needs to update the live script.</div>
      ) : (
        <>
          <div className="kmc-hint" style={{ marginBottom: 14 }}>
            Need another station, another line or a module you cannot open? Ask here. An administrator reviews it; nothing changes until they approve.
          </div>

          <div className="kmc-label" style={{ marginBottom: 6 }}>More stations</div>
          <select className="kmc-input" style={{ maxWidth: 340 }} value={line} onChange={e => setLine(e.target.value)} aria-label="Production line">
            <option value="">Choose a line to see its stations</option>
            {LINES.filter(l => l.active !== false).map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          {line && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
              {lineStations.map(([code, s]) => {
                const mineAlready = have.has(code);
                const on = stations.includes(code);
                return (
                  <button key={code} type="button" disabled={mineAlready} title={s.name}
                    className={`kmc-btn sm${on ? ' on' : ''}`} onClick={() => toggle(stations, setStations, code)}>
                    {code}{mineAlready ? ' (yours)' : ''}
                  </button>
                );
              })}
            </div>
          )}
          {stations.length > 0 && <div className="kmc-hint" style={{ marginTop: 8 }}>Asking for: {stations.join(', ')}</div>}

          <div className="kmc-label" style={{ margin: '18px 0 6px' }}>Other access</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EXTRA_OPTIONS.map(x => (
              <label key={x} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={extras.includes(x)} onChange={() => toggle(extras, setExtras, x)} /> {x}
              </label>
            ))}
          </div>

          <label className="kmc-field" style={{ marginTop: 18 }}>
            <span className="kmc-label">Why you need it, or anything else you need</span>
            <textarea className="kmc-input" style={{ minHeight: 76, resize: 'vertical', lineHeight: 1.5 }} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
          </label>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            <button type="button" className="kmc-btn" disabled={busy || nothing} onClick={send} style={{ minHeight: 40 }}>{busy ? 'Sending...' : 'Send request'}</button>
            {msg && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? 'var(--c-lime)' : 'var(--c-red)' }}>{msg.text}</span>}
          </div>

          {mine.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="kmc-label" style={{ marginBottom: 4 }}>Your requests</div>
              {mine.slice(0, 6).map(r => <RequestLine key={r.id} r={r} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function AccessChangeInbox({ onOpenUser }) {
  const [list, setList] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = () => listAccessChangeRequests().then(r => { if (r.ok) setList(r.requests || []); else setList([]); });
  useEffect(() => { load(); }, []);

  async function close(r, status) {
    const note = status === 'declined' ? (window.prompt(`Reason for declining ${r.fullName || r.username}'s request (they will see it):`, '') ?? null) : '';
    if (note === null) return;
    setBusyId(r.id); setError('');
    const res = await resolveAccessChangeRequest(r.id, status, note);
    setBusyId('');
    if (!res.ok) { setError(errorText(res)); return; }
    load();
  }

  const open = (list || []).filter(r => r.status === 'pending');
  if (!open.length) return null;
  return (
    <div className="kmc-panel" style={{ padding: '14px 16px 6px', marginBottom: 22, borderLeft: '4px solid var(--c-amber)' }}>
      <div className="kmc-section-title" style={{ marginBottom: 4 }}>Requests for more access ({open.length})</div>
      <div className="kmc-hint" style={{ marginBottom: 6 }}>Open the account, add what was asked for, save, then mark the request done.</div>
      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--c-red)', marginBottom: 6 }}>{error}</div>}
      {open.map(r => (
        <RequestLine key={r.id} r={r} showWho>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="kmc-btn sm" onClick={() => onOpenUser(r.username)}>Open account</button>
            <button type="button" className="kmc-btn sm on" disabled={busyId === r.id} onClick={() => close(r, 'done')}>Mark done</button>
            <button type="button" className="kmc-btn sm" disabled={busyId === r.id} onClick={() => close(r, 'declined')}>Decline</button>
          </div>
        </RequestLine>
      ))}
    </div>
  );
}
