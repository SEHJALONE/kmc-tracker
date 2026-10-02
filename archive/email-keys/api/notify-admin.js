/**
 * POST /api/notify-admin
 * Sends an access request notification email to the system administrator.
 * Called from the Sign Up form when a user requests system access. No sign-in
 * needed (the applicant has no account yet) — safe because it can only ever
 * email the fixed admin list, never an address the caller chooses.
 */
import { sendMail, escapeHtml } from './_lib/mailer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { fullName, email, username, department, position, accessLevel, reason } = req.body || {};
  if (!fullName || !email) return res.status(400).json({ error: 'Missing required fields.' });

  const adminList = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SCHEDULED_EMAIL_TO || 'xcellencysehj@gmail.com';
  const submittedAt = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' });
  const e = s => escapeHtml(String(s ?? '').slice(0, 500));

  const accessBadge = accessLevel === 'admin' ? '🔴 Admin'
    : accessLevel === 'supervisor' ? '🟡 Supervisor'
    : '🟢 General User';

  const row = (label, value, style = '') => `
          <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
            <td style="color:#64748b;padding:8px 0;font-family:monospace;width:40%;">${label}</td>
            <td style="color:#f1f5f9;padding:8px 0;${style}">${value}</td>
          </tr>`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">
      <div style="border-top:3px solid #dc2626;padding-top:20px;margin-bottom:24px;">
        <h1 style="color:#fff;font-size:18px;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">New Access Request</h1>
        <p style="color:#475569;font-size:11px;margin:0;font-family:monospace;">KMC Bus Tracker · ${submittedAt}</p>
      </div>
      <div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:16px;">
        <p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">A user has submitted an access request and is waiting for your approval.</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          ${row('Full Name', e(fullName), 'font-weight:700;')}
          ${row('Email', e(email))}
          ${row('Requested Username', e(username || '—'), 'font-family:monospace;')}
          ${row('Department', e(department || '—'))}
          ${row('Position', e(position || '—'))}
          ${row('Requested Access', accessBadge, 'font-weight:700;')}
        </table>
        ${reason ? `<div style="margin-top:14px;padding:12px;background:rgba(255,255,255,.04);border-radius:6px;border-left:2px solid rgba(99,102,241,.5);"><p style="color:#64748b;font-size:10px;font-family:monospace;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">Reason</p><p style="color:#94a3b8;font-size:12px;margin:0;">${e(reason)}</p></div>` : ''}
      </div>
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:14px 16px;margin-bottom:20px;">
        <p style="color:#a5b4fc;font-size:12px;margin:0;">Log in as an administrator and open <strong>Access Requests</strong> from the home screen to approve or deny this request and assign credentials.</p>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:16px;font-size:10px;color:#1e2d40;font-family:monospace;letter-spacing:.06em;">
        KIIRA MOTORS CORPORATION — CONFIDENTIAL · KMC Bus Production Tracker
      </div>
    </div>
  `;

  try {
    const r = await sendMail({
      to: adminList,
      subject: `[KMC Tracker] Access Request — ${String(fullName).slice(0, 80)} (${accessBadge})`,
      html,
    });
    return res.json({ ok: true, emailed: true, id: r.id });
  } catch (err) {
    // Non-fatal: the request itself is already saved.
    console.error('notify-admin email error:', err.message);
    return res.json({ ok: true, emailed: false, note: err.message });
  }
}
