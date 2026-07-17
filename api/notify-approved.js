/**
 * POST /api/notify-approved
 * Sends a confirmation email to an applicant once an admin approves their
 * access request. Called from AccessRequests.jsx after a successful grant.
 */
import { Resend } from 'resend';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.RESEND_API_KEY) {
    return res.json({ ok: true, emailed: false, note: 'RESEND_API_KEY not configured — applicant not emailed.' });
  }

  const { fullName, email, username, role } = req.body || {};
  if (!fullName || !email || !username) return res.status(400).json({ error: 'Missing required fields.' });

  const from = process.env.EMAIL_FROM || 'KMC Tracker <onboarding@resend.dev>';
  const roleLabel = {
    user: 'General User', supervisor: 'Supervisor', manager: 'Manager',
    director: 'Director', useradmin: 'User Admin',
  }[role] || 'User';

  const appUrl = process.env.APP_URL || 'https://kmc-tracker.vercel.app';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">
      <div style="border-top:3px solid #10b981;padding-top:20px;margin-bottom:24px;">
        <h1 style="color:#fff;font-size:18px;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">Access Approved</h1>
        <p style="color:#475569;font-size:11px;margin:0;font-family:monospace;">KMC Bus Tracker</p>
      </div>
      <div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:16px;">
        <p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Hi ${fullName}, your access request has been approved. You can now sign in.</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
            <td style="color:#64748b;padding:8px 0;font-family:monospace;width:40%;">Username</td>
            <td style="color:#f1f5f9;font-weight:700;font-family:monospace;padding:8px 0;">${username}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:8px 0;font-family:monospace;">Access Level</td>
            <td style="color:#f1f5f9;font-weight:700;padding:8px 0;">${roleLabel}</td>
          </tr>
        </table>
        <p style="color:#64748b;font-size:11px;margin:14px 0 0;">Sign in with the password you chose when you submitted your request.</p>
      </div>
      <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:14px 16px;margin-bottom:20px;text-align:center;">
        <a href="${appUrl}" style="color:#10b981;font-size:13px;font-weight:700;text-decoration:none;">Open KMC Bus Production Tracker →</a>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:16px;font-size:10px;color:#1e2d40;font-family:monospace;letter-spacing:.06em;">
        KIIRA MOTORS CORPORATION — CONFIDENTIAL · KMC Bus Production Tracker
      </div>
    </div>
  `;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from, to: [email],
      subject: `[KMC Tracker] Your access has been approved`,
      html,
    });
    return res.json({ ok: true, emailed: true });
  } catch (err) {
    console.error('notify-approved email error:', err);
    return res.json({ ok: true, emailed: false, note: err.message });
  }
}
