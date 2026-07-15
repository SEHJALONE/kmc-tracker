/**
 * POST /api/notify-admin
 * Sends an access request notification email to the system administrator.
 * Called from the Sign Up form when a user requests system access.
 */
import { Resend } from 'resend';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.RESEND_API_KEY) {
    // Graceful degradation — request is still saved locally even if email fails
    return res.json({ ok: true, emailed: false, note: 'RESEND_API_KEY not configured — request saved locally only.' });
  }

  const { fullName, email, username, department, position, accessLevel, reason } = req.body || {};
  if (!fullName || !email) return res.status(400).json({ error: 'Missing required fields.' });

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SCHEDULED_EMAIL_TO || 'xcellencysehj@gmail.com';
  const adminList  = adminEmail.split(',').map(e => e.trim()).filter(Boolean);
  const from       = process.env.EMAIL_FROM || 'KMC Tracker <onboarding@resend.dev>';
  const submittedAt = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const accessBadge = accessLevel === 'admin' ? '🔴 Admin'
    : accessLevel === 'supervisor' ? '🟡 Supervisor'
    : '🟢 General User';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">
      <div style="border-top:3px solid #dc2626;padding-top:20px;margin-bottom:24px;">
        <h1 style="color:#fff;font-size:18px;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">New Access Request</h1>
        <p style="color:#475569;font-size:11px;margin:0;font-family:monospace;">KMC Bus Tracker · ${submittedAt}</p>
      </div>
      <div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:16px;">
        <p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">A user has submitted an access request and is waiting for your approval.</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
            <td style="color:#64748b;padding:8px 0;font-family:monospace;width:40%;">Full Name</td>
            <td style="color:#f1f5f9;font-weight:700;padding:8px 0;">${fullName}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
            <td style="color:#64748b;padding:8px 0;font-family:monospace;">Email</td>
            <td style="color:#f1f5f9;padding:8px 0;">${email}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
            <td style="color:#64748b;padding:8px 0;font-family:monospace;">Requested Username</td>
            <td style="color:#f1f5f9;font-family:monospace;padding:8px 0;">${username || '—'}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
            <td style="color:#64748b;padding:8px 0;font-family:monospace;">Department</td>
            <td style="color:#f1f5f9;padding:8px 0;">${department || '—'}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
            <td style="color:#64748b;padding:8px 0;font-family:monospace;">Position</td>
            <td style="color:#f1f5f9;padding:8px 0;">${position || '—'}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:8px 0;font-family:monospace;">Requested Access</td>
            <td style="color:#f1f5f9;font-weight:700;padding:8px 0;">${accessBadge}</td>
          </tr>
        </table>
        ${reason ? `<div style="margin-top:14px;padding:12px;background:rgba(255,255,255,.04);border-radius:6px;border-left:2px solid rgba(99,102,241,.5);"><p style="color:#64748b;font-size:10px;font-family:monospace;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">Reason</p><p style="color:#94a3b8;font-size:12px;margin:0;">${reason}</p></div>` : ''}
      </div>
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:14px 16px;margin-bottom:20px;">
        <p style="color:#a5b4fc;font-size:12px;margin:0;">Log in as <strong>systemadmin</strong> and open <strong>Access Requests</strong> from the home screen to approve or deny this request and assign credentials.</p>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:16px;font-size:10px;color:#1e2d40;font-family:monospace;letter-spacing:.06em;">
        KIIRA MOTORS CORPORATION — CONFIDENTIAL · KMC Bus Production Tracker
      </div>
    </div>
  `;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from, to: adminList,
      subject: `[KMC Tracker] Access Request — ${fullName} (${accessBadge})`,
      html,
    });
    return res.json({ ok: true, emailed: true });
  } catch (err) {
    console.error('notify-admin email error:', err);
    return res.json({ ok: true, emailed: false, note: err.message });
  }
}
