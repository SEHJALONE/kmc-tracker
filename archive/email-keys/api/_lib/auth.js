/**
 * Checks a tracker session token (issued by the tracker's Apps Script at
 * sign-in) so the email endpoints only send for signed-in people. Without
 * this, anyone on the internet could use the endpoints to send email from
 * the tracker's Gmail account.
 *
 * TRACKER_SESSION_SECRET must equal the Apps Script's `session_secret`
 * script property (Project Settings → Script properties).
 *
 * Token: base64url(JSON {u, r, e}) + "." + base64url(HMAC-SHA256(payload)).
 * Apps Script pads its base64 with "=", Node does not — compared unpadded.
 */
import crypto from 'node:crypto';

export const ADMIN_ROLES = ['systemadmin', 'useradmin'];

const unpad = s => String(s).replace(/=+$/, '');

export function verifyTrackerSession(token, secret = process.env.TRACKER_SESSION_SECRET) {
  if (!secret || !token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0]) return null;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(parts[0], 'utf8').digest('base64url'));
  const given = Buffer.from(unpad(parts[1]));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const b64 = unpad(parts[0]).replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!p || !p.u || !(Number(p.e) > Date.now())) return null;
    return { username: String(p.u), role: String(p.r || 'user') };
  } catch {
    return null;
  }
}

/**
 * Returns the signed-in user, or sends the error response and returns null.
 * `roles` limits it to those roles (e.g. ADMIN_ROLES).
 */
export function requireSession(req, res, roles) {
  if (!process.env.TRACKER_SESSION_SECRET) {
    res.status(503).json({ error: 'Email sending is switched off until TRACKER_SESSION_SECRET is set in Vercel (see EMAIL-SETUP.md).' });
    return null;
  }
  const user = verifyTrackerSession(req.body?.session);
  if (!user) {
    res.status(401).json({ error: 'Your session has expired. Sign in again, then resend.' });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    res.status(403).json({ error: 'Your account is not allowed to send this email.' });
    return null;
  }
  return user;
}
