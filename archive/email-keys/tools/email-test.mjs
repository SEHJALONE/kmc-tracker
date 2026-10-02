/**
 * Sends one test email through the same mailer the tracker uses on Vercel.
 *
 *   node tools/email-test.mjs                      → checks the Gmail sign-in only, sends nothing
 *   node tools/email-test.mjs a@x.com b@y.com      → sends a test email to those people
 *
 * Reads EMAIL_USER / EMAIL_PASS (or RESEND_API_KEY) from .env.
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { sendMail, mailProvider, explainGmailError } from '../api/_lib/mailer.js';

const to = process.argv.slice(2);
const provider = mailProvider();
console.log(`Provider: ${provider || 'none configured'}${provider === 'gmail' ? ` (sending as ${process.env.EMAIL_USER})` : ''}`);

if (!to.length) {
  if (provider !== 'gmail') { console.log('Nothing to check — set EMAIL_USER and EMAIL_PASS in .env.'); process.exit(1); }
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: String(process.env.EMAIL_PASS).replace(/\s+/g, '') } });
  try { await t.verify(); console.log('Gmail sign-in OK. Add addresses to send a test: node tools/email-test.mjs someone@example.com'); }
  catch (e) { console.log('Gmail sign-in FAILED: ' + explainGmailError(e)); process.exit(1); }
  process.exit(0);
}

try {
  const r = await sendMail({
    to,
    subject: 'KMC Tracker — email test',
    html: `<p>This is a test from the KMC Bus Production Tracker, sent through ${provider}.</p><p>If you received it, the tracker can email you.</p>`,
  });
  console.log(`Sent. Accepted: ${r.accepted.join(', ')}${r.rejected.length ? ` · Refused: ${r.rejected.join(', ')}` : ''}`);
} catch (e) {
  console.log('Send FAILED: ' + e.message);
  process.exit(1);
}
