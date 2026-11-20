import { useEffect, useState } from 'react';
import { jobLine } from '../../data/jobOrders';
import { JOB_ERRORS, useJobData } from '../../hooks/useJobData';

// Supervisors' comments on a job order, shown to the people doing the work in
// an amber panel that cannot be missed (newest first, with "New" on the ones
// this person has not seen yet), plus the supervisors' own tools: add a
// comment, delete the job order with a reason.

const seenKey = () => `kmc_jo_seen_comments_${String(localStorage.getItem('kmc_username') || 'anon').toLowerCase()}`;
const readSeen = () => { try { return JSON.parse(localStorage.getItem(seenKey()) || '{}') || {}; } catch { return {}; } };
const writeSeen = m => { try { localStorage.setItem(seenKey(), JSON.stringify(m)); } catch { /* blocked */ } };

// Comments on this job order this person has not opened yet.
export const unseenComments = job => Math.max(0, (job.comments || []).length - (readSeen()[job.id] || 0));

const when = iso => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function JobComments({ job, limit = 0, markSeen = true }) {
  const list = [...(job?.comments || [])].reverse();
  const [seenBefore] = useState(() => (job ? readSeen()[job.id] || 0 : 0));
  const total = (job?.comments || []).length;
  useEffect(() => {
    if (!job || !markSeen || !total) return;
    const m = readSeen();
    if ((m[job.id] || 0) < total) { m[job.id] = total; writeSeen(m); }
  }, [job, total, markSeen]);
  if (!list.length) return null;
  const shown = limit ? list.slice(0, limit) : list;
  const fresh = total - seenBefore;
  return (
    <div role="note" aria-label="Supervisor comments" style={{
      border: '1px solid var(--warning-color)', borderLeft: '5px solid var(--warning-color)', borderRadius: 12,
      background: 'color-mix(in srgb, var(--warning-color) 12%, transparent)', padding: '10px 14px', marginTop: 10,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span className="kmc-label" style={{ color: 'var(--warning-color)', fontWeight: 700 }}>Supervisor comments</span>
        {fresh > 0 && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#fff', background: '#dc2626', borderRadius: 999, padding: '2px 8px' }}>{fresh} NEW</span>}
      </div>
      {shown.map((c, i) => (
        <div key={`${c.at}-${i}`} style={{ padding: '4px 0', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ fontSize: 14, color: 'var(--text-heading)', fontWeight: i < fresh ? 700 : 500, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.text}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.byName || c.by} · {when(c.at)}</div>
        </div>
      ))}
      {limit > 0 && list.length > limit && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{list.length - limit} earlier comment{list.length - limit === 1 ? '' : 's'} on the job order.</div>}
    </div>
  );
}

// Comments for a running task's job order (loads the job data itself).
export function JobCommentsLive({ jobOrderId }) {
  const jobData = useJobData();
  const job = jobData.jobOrders.find(j => j.id === jobOrderId) || jobData.deletedJobs.find(j => j.id === jobOrderId);
  if (!job) return null;
  return (
    <>
      {job.status === 'deleted' && (
        <div style={{ fontSize: 13, color: '#dc2626', marginTop: 10, fontWeight: 600 }}>
          This job order was deleted by {job.deletedBy}: {job.deleteReason}. Check with your supervisor before carrying on.
        </div>
      )}
      <JobComments job={job} />
    </>
  );
}

// Supervisor tools on a job order card: comment, delete with a reason.
export function JobOrderAdmin({ job, jobData, onDeleted }) {
  const [mode, setMode] = useState('');   // '' | 'comment' | 'delete'
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!(jobData.manageLines || []).includes(jobLine(job)) || job.status === 'deleted') return null;

  async function submit() {
    setBusy(true); setError('');
    try {
      if (mode === 'comment') await jobData.commentJobOrder(job.id, text.trim());
      else { await jobData.deleteJobOrder(job.id, text.trim()); onDeleted?.(job.id); }
      setMode(''); setText('');
    } catch (e) { setError(JOB_ERRORS[e.message] || e.message); }
    setBusy(false);
  }
  const open = m => { setMode(mode === m ? '' : m); setText(''); setError(''); };
  const inp = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', minHeight: 64 };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className={`kmc-btn${mode === 'comment' ? ' primary' : ''}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => open('comment')}>Comment</button>
        <button className="kmc-btn ghost" style={{ fontSize: 12, padding: '5px 12px', color: mode === 'delete' ? '#dc2626' : undefined }} onClick={() => open('delete')}>Delete</button>
      </div>
      {mode && (
        <div style={{ marginTop: 8, display: 'grid', gap: 6, maxWidth: 560 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }} htmlFor={`jo-${mode}-${job.id}`}>
            {mode === 'comment' ? 'Comment for the people working on this job order' : `Why is ${job.id} being deleted? (required)`}
          </label>
          <textarea id={`jo-${mode}-${job.id}`} style={inp} value={text} onChange={e => setText(e.target.value)}
            placeholder={mode === 'comment' ? 'e.g. Use drawing revision C for the brackets' : 'e.g. Duplicate of JO-261120-AB12'} />
          {mode === 'delete' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>The job order disappears from the operators' lists. Runs already filed against it keep their times.</div>}
          {error && <div style={{ fontSize: 12, color: 'var(--accent-text)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="kmc-btn primary" disabled={busy || (mode === 'delete' ? text.trim().length < 3 : !text.trim())} onClick={submit}
              style={mode === 'delete' ? { background: '#dc2626', borderColor: '#dc2626' } : undefined}>
              {busy ? 'Saving…' : mode === 'comment' ? 'Post comment' : 'Delete job order'}
            </button>
            <button className="kmc-btn ghost" onClick={() => open('')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
