import { useState } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { LOGO_WHITE, LOGO_DARK } from '../../data/logoData.js';
import { buildSlidePDF } from '../../export/buildSlidePDF';
import { buildPDF } from '../../export/buildPDF';
import { summarizeFilters, summarizeFiltersText } from '../../utils/filterSummary';

// ── localStorage schedule helpers ────────────────────────────
const SCHEDULES_KEY = 'kmc_email_schedules';

function loadSchedules() {
  try { return JSON.parse(localStorage.getItem(SCHEDULES_KEY) || '[]'); }
  catch { return []; }
}
function saveSchedules(list) {
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(list));
}

async function captureElement(el, landscape = false) {
  const canvas = await html2canvas(el, {
    backgroundColor: '#07090f', scale: 2,
    useCORS: true, logging: false,
    ...(landscape ? { windowWidth: el.scrollWidth, windowHeight: el.scrollHeight } : {}),
  });
  if (landscape && canvas.height > canvas.width) {
    const rotated = document.createElement('canvas');
    rotated.width  = canvas.height;
    rotated.height = canvas.width;
    const ctx = rotated.getContext('2d');
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return rotated;
  }
  return canvas;
}

async function postEmailRequest(payload) {
  // Always same-origin — this Vercel serverless function is deployed
  // alongside the app itself, so there's no env-dependent URL to get wrong
  // (unlike a build-time VITE_* var, which bakes in whatever was last
  // committed to .env and can silently drift from what's intended).
  const res = await fetch('/api/send-report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

export default function EmailModal({ onClose, buses, rows, metrics, filters = {}, coverRef, theme = 'dark' }) {
  const filterChips   = summarizeFilters(filters);
  const filterSummary = summarizeFiltersText(filters);
  const [to, setTo]                       = useState('');
  const [subject, setSubject]             = useState('KMC Bus Production Dashboard Report');
  const [schedule, setSchedule]           = useState('now');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [weekday, setWeekday]             = useState('MON');
  const [busy, setBusy]                   = useState(false);
  const [status, setStatus]               = useState(null);
  const [emailStartDate, setEmailStartDate] = useState('');
  const [emailEndDate,   setEmailEndDate]   = useState('');
  const [savedSchedules, setSavedSchedules] = useState(loadSchedules);

  function refreshSchedules() { setSavedSchedules(loadSchedules()); }

  function cancelSchedule(id) {
    const updated = loadSchedules().filter(s => s.id !== id);
    saveSchedules(updated);
    refreshSchedules();
  }

  function cancelAllSchedules() {
    saveSchedules([]);
    refreshSchedules();
  }

  function getFilteredRows() {
    if (!emailStartDate && !emailEndDate) return rows;
    const start = emailStartDate ? new Date(emailStartDate + 'T00:00:00').getTime() : null;
    const end   = emailEndDate   ? new Date(emailEndDate   + 'T23:59:59.999').getTime() : null;
    return rows.filter(r => {
      if (!r.rawTimestamp) return false;
      const t = new Date(r.rawTimestamp).getTime();
      if (isNaN(t)) return false;
      if (start !== null && t < start) return false;
      if (end   !== null && t > end)   return false;
      return true;
    });
  }

  async function handleSend() {
    if (!to.trim()) { setStatus({ ok: false, msg: 'Enter at least one recipient.' }); return; }
    setBusy(true); setStatus(null);
    try {
      const filteredRows = getFilteredRows();
      const date = new Date().toISOString().slice(0, 10);
      const attachments = [];

      const el = coverRef?.current;
      if (el) {
        try {
          el.style.left = '0';
          const canvas = await html2canvas(el, {
            backgroundColor: '#07090f', scale: 2,
            useCORS: true, logging: false,
            width: el.offsetWidth, height: el.offsetHeight,
          });
          el.style.left = '-9999px';
          attachments.push({
            filename: `KMC_CoverSlide_${date}.png`,
            dataUrl: canvas.toDataURL('image/png'),
            label: 'Dashboard Cover Slide (PNG)',
          });
        } catch (e) {
          console.warn('Cover PNG capture failed', e);
          if (el) el.style.left = '-9999px';
        }
      }

      try {
        const slideDoc = await buildSlidePDF(buses, filteredRows, metrics, LOGO_DARK);
        attachments.push({
          filename: `KMC_Presentation_${date}.pdf`,
          dataUrl: slideDoc.output('datauristring'),
          label: 'Presentation Slide PDF (dark)',
        });
      } catch (e) { console.warn('Slide PDF build failed', e); }

      try {
        const reportDoc = await buildPDF(buses, filteredRows, metrics, LOGO_WHITE);
        attachments.push({
          filename: `KMC_Dashboard_${date}.pdf`,
          dataUrl: reportDoc.output('datauristring'),
          label: 'Dashboard PDF Report (white)',
        });
      } catch (e) { console.warn('Report PDF build failed', e); }

      const result = await postEmailRequest({
        to: to.trim(), subject: subject.trim() || 'KMC Bus Production Dashboard Report',
        schedule, scheduledTime: schedule !== 'now' ? scheduledTime : null,
        weekday: schedule === 'weekly' ? weekday : null,
        busCount: buses.length, attachments,
        filterSummary,
        filters,
        dataStartDate: emailStartDate || null,
        dataEndDate:   emailEndDate   || null,
        firstPassYield:    metrics.firstPassYield    ?? null,
        totalDowntimeMin:  metrics.totalDowntimeMin  ?? null,
      });

      if (schedule !== 'now' && !result.fallback) {
        const entry = {
          id:        Date.now().toString(),
          to:        to.trim(),
          subject:   subject.trim(),
          schedule,
          scheduledTime,
          weekday:   schedule === 'weekly' ? weekday : null,
          startDate: emailStartDate || null,
          endDate:   emailEndDate   || null,
          filterSummary,
          createdAt: new Date().toISOString(),
        };
        saveSchedules([...loadSchedules(), entry]);
        refreshSchedules();
      }

      setStatus({
        ok: true,
        msg: result.fallback
          ? `Mail client opened — ${attachments.length} attachment(s) included in payload (PNG + 2 PDFs). Attach manually if needed.`
          : schedule === 'now'
            ? `Report sent with ${attachments.length} attachment(s) ✓`
            : `Scheduled: ${schedule === 'daily' ? `Daily at ${scheduledTime}` : `Every ${weekday} at ${scheduledTime}`} ✓`,
      });
    } catch (e) {
      setStatus({ ok: false, msg: `Send failed: ${e.message}` });
    }
    setBusy(false);
  }

  const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 5, padding: '9px 12px',
    color: 'var(--input-color)', fontSize: 13,
    fontFamily: "'Inter', system-ui, sans-serif",
    outline: 'none',
    transition: 'border-color 0.15s',
    colorScheme: theme === 'light' ? 'light' : 'dark',
  };

  const labelStyle = {
    fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
    textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 700, marginBottom: 6, display: 'block',
  };

  const dateInputStyle = {
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 4, padding: '7px 10px',
    color: 'var(--input-color)', fontSize: 12,
    fontFamily: "'Inter', system-ui, sans-serif",
    outline: 'none',
    colorScheme: theme === 'light' ? 'light' : 'dark',
    flex: 1,
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderTop: '2px solid #6366f1',
        borderRadius: 12,
        width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        padding: '24px 26px 22px',
        display: 'flex', flexDirection: 'column', gap: 18,
        boxShadow: 'var(--shadow-login)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
            Schedule Email Report
          </span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Recipients */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Recipients (comma-separated)</label>
          <input type="text" placeholder="ops@kmc.go.ug, manager@kmc.go.ug" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </div>

        {/* Subject */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Subject</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
        </div>

        {/* Active dashboard filters (read-only) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Active Dashboard Filters</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 6, padding: '9px 12px',
          }}>
            {filterChips.length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.03em' }}>
                No filters applied — report covers the full dataset.
              </span>
            ) : (
              filterChips.map(c => (
                <span key={c.key} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 10, color: '#a5b4fc',
                  fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em',
                  background: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.28)',
                  borderRadius: 20, padding: '3px 10px',
                }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.08em' }}>{c.label}</span>
                  <span style={{ fontWeight: 700 }}>{c.value}</span>
                </span>
              ))
            )}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em', paddingLeft: 2 }}>
            The report reflects the filters currently set on your dashboard. Adjust them there, then reopen this dialog.
          </div>
        </div>

        {/* Data date range — overrides the dashboard date filter for this report only */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={labelStyle}>Override Data Range (for scheduled sends)</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 6, padding: '10px 12px',
          }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.1em', whiteSpace: 'nowrap', fontWeight: 600 }}>FROM</span>
            <input type="date" value={emailStartDate} onChange={e => setEmailStartDate(e.target.value)} style={dateInputStyle} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.1em', whiteSpace: 'nowrap', fontWeight: 600 }}>TO</span>
            <input type="date" value={emailEndDate} onChange={e => setEmailEndDate(e.target.value)} style={dateInputStyle} />
            {(emailStartDate || emailEndDate) && (
              <button
                onClick={() => { setEmailStartDate(''); setEmailEndDate(''); }}
                style={{
                  background: 'transparent', border: '1px solid var(--accent-border)',
                  borderRadius: 3, color: 'var(--accent-text)', fontSize: 9,
                  fontFamily: "'Inter', system-ui, sans-serif", padding: '4px 8px',
                  cursor: 'pointer', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: 700,
                }}
              >
                CLEAR
              </button>
            )}
          </div>
          {(emailStartDate || emailEndDate) ? (
            <div style={{ fontSize: 10, color: '#6366f1', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em', paddingLeft: 2 }}>
              ◈ Overrides the dashboard date filter — report includes data
              {emailStartDate ? ` from ${emailStartDate}` : ''}
              {emailEndDate   ? ` to ${emailEndDate}` : ''}
              {' '}only
            </div>
          ) : (
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em', paddingLeft: 2 }}>
              Leave blank to follow the dashboard date filter above. Set a fixed window here for recurring reports (e.g. a quarter), independent of the dashboard.
            </div>
          )}
        </div>

        {/* Schedule type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Schedule</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: 'now', label: 'Send Now', icon: '⚡' }, { val: 'daily', label: 'Daily', icon: '📅' }, { val: 'weekly', label: 'Weekly', icon: '🗓' }].map(opt => (
              <button key={opt.val} onClick={() => setSchedule(opt.val)} style={{
                flex: 1, padding: '9px 0',
                background: schedule === opt.val ? 'rgba(99,102,241,0.12)' : 'var(--bg-surface-2)',
                border: `1px solid ${schedule === opt.val ? 'rgba(99,102,241,0.5)' : 'var(--border-subtle)'}`,
                borderRadius: 6, cursor: 'pointer',
                color: schedule === opt.val ? '#818cf8' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 700, fontFamily: "'Inter', system-ui, sans-serif",
                transition: 'all 0.15s',
              }}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time / day pickers */}
        {schedule !== 'now' && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>Send Time</label>
              <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            </div>
            {schedule === 'weekly' && (
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>Day of Week</label>
                <div style={{ display: 'flex', gap: 5 }}>
                  {DAYS.map(d => (
                    <button key={d} onClick={() => setWeekday(d)} style={{
                      flex: 1, padding: '7px 0',
                      background: weekday === d ? 'rgba(99,102,241,0.12)' : 'var(--bg-surface-2)',
                      border: `1px solid ${weekday === d ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
                      borderRadius: 4, cursor: 'pointer',
                      color: weekday === d ? '#818cf8' : 'var(--text-muted)',
                      fontSize: 9, fontWeight: 700, fontFamily: "'Inter', system-ui, sans-serif",
                      transition: 'all 0.15s',
                    }}>{d}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Server-side cron info */}
        <div style={{
          background: 'rgba(6,182,212,0.05)',
          border: '1px solid rgba(6,182,212,0.2)',
          borderLeft: '3px solid rgba(6,182,212,0.5)',
          borderRadius: '0 6px 6px 0',
          padding: '10px 14px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(6,182,212,0.8)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif" }}>
            ⚙ Server-Side Scheduled Send (Vercel)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.5 }}>
            A Vercel Cron Job runs at <strong style={{ color: 'var(--text-primary)' }}>07:00 UTC daily</strong> and automatically generates fresh PDFs + Excel from live Google Sheets data, then emails them to the addresses set in the <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>SCHEDULED_EMAIL_TO</code> Vercel environment variable. No browser session needed.
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.03em' }}>
            Use <strong>Send Now</strong> below for an immediate on-demand send (includes the cover PNG from your browser). The Vercel send runs independently in the cloud and includes 3 attachments: Slide PDF, Dashboard PDF, Excel.
          </div>
        </div>

        {/* Status message */}
        {status && (
          <div style={{
            background: status.ok ? 'var(--success-alpha)' : 'var(--accent-alpha)',
            border: `1px solid ${status.ok ? 'var(--success-border)' : 'var(--accent-border)'}`,
            borderLeft: `3px solid ${status.ok ? 'var(--success-color)' : 'var(--accent)'}`,
            borderRadius: '0 6px 6px 0', padding: '9px 14px',
            fontSize: 12, color: status.ok ? 'var(--success-color)' : 'var(--accent-text)',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            {status.msg}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-medium)',
            borderRadius: 6, padding: '9px 22px', color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: "'Inter', system-ui, sans-serif",
            transition: 'all 0.15s',
          }}>Cancel</button>
          <button onClick={handleSend} disabled={busy} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: busy ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.14)',
            border: `1px solid ${busy ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.45)'}`,
            borderRadius: 6, padding: '9px 24px',
            color: busy ? 'var(--text-dim)' : '#818cf8',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: "'Inter', system-ui, sans-serif",
            transition: 'all 0.15s',
          }}>
            {busy ? 'Sending…' : schedule === 'now' ? '⚡ Send Now' : schedule === 'daily' ? '📅 Schedule Daily' : '🗓 Schedule Weekly'}
          </button>
        </div>

        {/* Active schedules panel */}
        {savedSchedules.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--warning-color)" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span style={{ fontSize: 10, color: 'var(--warning-color)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Active Schedules ({savedSchedules.length})
                </span>
              </div>
              <button
                onClick={cancelAllSchedules}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'var(--accent-alpha)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 4, padding: '4px 10px',
                  color: 'var(--accent-text)', fontSize: 10, fontWeight: 700,
                  fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.08em',
                  cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Cancel All
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedSchedules.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: 'var(--warning-alpha)',
                  border: '1px solid var(--warning-border)',
                  borderLeft: '2px solid var(--warning-color)',
                  borderRadius: '0 6px 6px 0',
                  padding: '9px 12px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, color: 'var(--text-primary)', fontWeight: 700,
                      fontFamily: "'Inter', system-ui, sans-serif",
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      marginBottom: 4,
                    }}>
                      {s.to}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 9, color: 'var(--warning-color)',
                        fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em',
                        background: 'var(--warning-alpha)',
                        border: '1px solid var(--warning-border)',
                        borderRadius: 3, padding: '2px 6px',
                      }}>
                        {s.schedule === 'daily'
                          ? `📅 Daily @ ${s.scheduledTime}`
                          : `🗓 Every ${s.weekday} @ ${s.scheduledTime}`}
                      </span>
                      {(s.startDate || s.endDate) && (
                        <span style={{
                          fontSize: 9, color: '#818cf8',
                          fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em',
                          background: 'rgba(99,102,241,0.08)',
                          border: '1px solid rgba(99,102,241,0.2)',
                          borderRadius: 3, padding: '2px 6px',
                        }}>
                          ◈ {s.startDate || '…'} → {s.endDate || '…'}
                        </span>
                      )}
                      {s.filterSummary && s.filterSummary !== 'No filters applied (full dataset)' && (
                        <span style={{
                          fontSize: 9, color: '#a5b4fc',
                          fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em',
                          background: 'rgba(99,102,241,0.08)',
                          border: '1px solid rgba(99,102,241,0.2)',
                          borderRadius: 3, padding: '2px 6px',
                        }}>
                          ⛃ {s.filterSummary}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif", marginTop: 4 }}>
                      Created {new Date(s.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <button
                    onClick={() => cancelSchedule(s.id)}
                    title="Cancel this schedule"
                    style={{
                      flexShrink: 0,
                      background: 'var(--accent-alpha)',
                      border: '1px solid var(--accent-border)',
                      borderRadius: 4, padding: '5px 8px',
                      color: 'var(--accent-text)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
