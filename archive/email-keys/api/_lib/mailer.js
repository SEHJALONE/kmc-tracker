/**
 * One way out for every tracker email (files under api/_lib are not routes).
 *
 * Provider, in order:
 *   MAIL_PROVIDER=gmail|resend   explicit choice, else
 *   EMAIL_USER + EMAIL_PASS      Gmail SMTP with a Google App Password — can
 *                                email anyone, ~500 recipients/day, 25 MB/message
 *   RESEND_API_KEY               Resend — can only email the account owner
 *                                until a domain is verified at resend.com/domains
 *
 * Why Gmail by default: Resend's shared test sender (onboarding@resend.dev)
 * delivers only to the Resend account's own address, which is why the tracker
 * could never email anyone else. Gmail needs no domain.
 */
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export const MAX_RECIPIENTS = 50;
const EMAIL_RE = /^[^@\s<>(),;:"]+@[^@\s<>(),;:"]+\.[^@\s<>(),;:"]{2,}$/;

export class MailError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "a@x.com, b@y.com; c@z.com" or an array → { valid, invalid }, de-duplicated.
export function parseRecipients(input) {
  const list = (Array.isArray(input) ? input : String(input ?? '').split(/[,;\s]+/))
    .map(s => String(s).trim()).filter(Boolean);
  const seen = new Set(), valid = [], invalid = [];
  for (const addr of list) {
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    (EMAIL_RE.test(addr) ? valid : invalid).push(addr);
  }
  return { valid, invalid };
}

export function mailProvider(env = process.env) {
  const chosen = String(env.MAIL_PROVIDER || '').toLowerCase();
  if (chosen === 'gmail' || chosen === 'resend') return chosen;
  if (env.EMAIL_USER && env.EMAIL_PASS) return 'gmail';
  if (env.RESEND_API_KEY) return 'resend';
  return null;
}

// Display name for the From line. Gmail always sends from EMAIL_USER itself.
function senderName(env = process.env) {
  if (env.MAIL_FROM_NAME) return env.MAIL_FROM_NAME;
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(env.EMAIL_FROM || '');
  return m ? m[1].trim() : 'KMC Tracker';
}

let gmailTransport = null;
export function _setTransportForTests(t) { gmailTransport = t; }

function gmail() {
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: String(process.env.EMAIL_PASS || '').replace(/\s+/g, '') },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 45000,
    });
  }
  return gmailTransport;
}

export function explainGmailError(e) {
  const text = String(e?.response || e?.message || '');
  if (e?.code === 'EAUTH' || e?.responseCode === 535 || /BadCredentials|Username and Password not accepted/i.test(text)) {
    return 'Gmail refused the sign-in: the App Password in EMAIL_PASS is wrong or has been revoked. Create a new one and update it in Vercel.';
  }
  if (/5\.4\.5|daily user sending limit|sending limit exceeded/i.test(text)) {
    return 'Gmail\'s daily sending limit is used up (about 500 recipients a day). Try again tomorrow.';
  }
  if (e?.responseCode === 552 || /message.*(too large|exceeded)|size limit/i.test(text)) {
    return 'The attachments are too large for Gmail (25 MB per email).';
  }
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS'].includes(e?.code)) {
    return 'Could not reach Gmail. Try again in a minute.';
  }
  return `Gmail could not send the email: ${text.slice(0, 200)}`;
}

export function explainResendError(err) {
  const text = String(err?.message || err || '');
  if (/own email address|verify a domain|testing emails/i.test(text)) {
    return 'Resend can only email your own address until a domain is verified at resend.com/domains. Set EMAIL_USER and EMAIL_PASS to send through Gmail instead.';
  }
  return `Resend could not send the email: ${text}`;
}

/**
 * Sends one email. attachments: [{ filename, content (base64), contentType? }].
 * Returns { provider, id, accepted, rejected }; throws MailError with a
 * message fit to show the person who pressed Send.
 */
export async function sendMail({ to, subject, html, text, attachments = [], replyTo }) {
  const { valid, invalid } = parseRecipients(to);
  if (invalid.length) throw new MailError(`Not a valid email address: ${invalid.join(', ')}`, 400);
  if (!valid.length) throw new MailError('Add at least one recipient.', 400);
  if (valid.length > MAX_RECIPIENTS) throw new MailError(`Too many recipients (${valid.length}); the limit is ${MAX_RECIPIENTS} per email.`, 400);

  const provider = mailProvider();
  if (!provider) {
    throw new MailError('Email is not set up. Add EMAIL_USER and EMAIL_PASS (a Gmail App Password) in the Vercel environment variables.', 503);
  }

  if (provider === 'gmail') {
    let info;
    try {
      info = await gmail().sendMail({
        from: { name: senderName(), address: process.env.EMAIL_USER },
        to: valid,
        subject,
        html,
        text,
        replyTo,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content, encoding: 'base64', contentType: a.contentType })),
      });
    } catch (e) {
      throw new MailError(explainGmailError(e));
    }
    const accepted = (info.accepted || []).map(String);
    const rejected = (info.rejected || []).map(String);
    if (!accepted.length) throw new MailError(`Gmail refused every recipient: ${rejected.join(', ') || valid.join(', ')}`);
    return { provider, id: info.messageId, accepted, rejected };
  }

  const from = process.env.EMAIL_FROM || 'KMC Tracker <onboarding@resend.dev>';
  let result;
  try {
    result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from, to: valid, subject, html, text, replyTo,
      attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
    });
  } catch (e) {
    throw new MailError(explainResendError(e));
  }
  // The Resend SDK resolves with { error } instead of throwing on API rejections.
  if (result.error) throw new MailError(explainResendError(result.error));
  return { provider, id: result.data?.id, accepted: valid, rejected: [] };
}
