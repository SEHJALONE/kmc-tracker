# Email: why it only reached one inbox, and how it works now

*Written 2026-09-30. Covers the Bus Production Tracker (Travel Card, dashboard
reports, access requests) and the Machine Shop Job Orders app.*

## Why the tracker could only email you

Every tracker email went through **Resend** from the sender
`onboarding@resend.dev`. That is Resend's shared **test** address. Resend
delivers mail from it **only to the email address that owns the Resend
account**. For any other recipient, Resend refuses the send with:

> You can only send testing emails to your own email address

It will only send to other people after you **verify a domain you own**
(for example `kiiramotors.com`) by adding DNS records at the domain's host. The
tracker never had a domain verified, so:

- the dashboard "Email Report" to colleagues failed with *"Server responded 502"*
  (the real reason was hidden),
- applicants were never told their access was approved,
- the daily 07:00 scheduled report reached only your inbox.

The code and the app were fine. The *sender* was a test sender.

## Options reviewed

| Option | Sends to anyone today? | Daily limit (free) | What it needs | Verdict |
|---|---|---|---|---|
| **Gmail via SMTP + App Password** | **Yes** | ~500 recipients | 2-Step Verification on the Gmail account and a 16-character App Password | **Chosen for now** |
| Gmail via Apps Script (MailApp) | Yes | 100 recipients | Nothing extra | Used by Job Orders (it reads drawings straight from Drive) |
| Resend (current setup) | No, only the owner | 100 / day, 3,000 / month | A verified domain | Keep for later |
| Brevo | Not properly: without your own domain, the sender is rewritten to `@brevosend.com` | 300 / day | A verified domain | Good once there is a domain |
| Mailtrap, Amazon SES, Postmark | No | 150 / day, or paid | A verified domain | Same limitation |
| SendGrid | No | No free plan since 2025 | A domain and payment | No |

Every professional sending service needs a domain you control. KMC's domain
isn't available yet, so **Gmail is the only option that emails other people
today, with no purchase and no DNS work.** Sending *through* Gmail's own servers
also means the mail is properly signed as coming from that Gmail address, so it
lands in inboxes instead of spam.

## What was changed

- **`api/_lib/mailer.js`** is now the single way out for every tracker email. It
  uses **Gmail** when `EMAIL_USER` + `EMAIL_PASS` are set. It falls back to
  Resend only if Gmail isn't configured, or if `MAIL_PROVIDER=resend` is set.
  - Checks every address.
  - Sends to up to 50 recipients per email.
  - Reports anyone Gmail refused.
  - Turns errors into plain messages ("the App Password was revoked", "daily
    limit reached", "attachments too large").
- **All four email endpoints now use it:**
  - `send-report`: Email Report button
  - `run-scheduled`: daily 07:00 report
  - `notify-admin`: new access request → admins
  - `notify-approved`: access granted → applicant
- **Security.** An email endpoint that can reach *anyone* must not be usable
  by *anyone*, or strangers could send mail as the tracker's Gmail account:
  - `send-report` now requires a signed-in tracker user.
  - `notify-approved` requires an administrator.
  - `run-scheduled` refuses to run unless `CRON_SECRET` is set. Before, a
    missing secret left it open.
  - `notify-admin` stays open (applicants have no account yet), but it can
    only ever email the fixed admin list.
  - Everything people type is now HTML-escaped in the emails, and report
    attachments are limited to PDF / PNG / JPEG / XLSX.
- **Clearer messages in the app.**
  - The Email Report dialog shows who it was sent to and who was refused,
    and the real error if it fails.
  - Access Requests says *why* an approval email didn't go.
- **`tools/email-test.mjs`** checks the Gmail sign-in, or sends a test to
  addresses you give it.
- Tests: `src/test/mailer.test.js`.

**Job Orders** keeps sending through Apps Script (MailApp) from the same Gmail
account. It attaches drawings and DXFs straight from Google Drive, and Vercel
can't take uploads over ~4.5 MB. Both apps already email anyone.

## Go-live steps (in this order)

> ⚠️ **Step 1 is urgent.** The Gmail App Password in `.env` was committed
> to the public GitHub repo in June 2026, and it **still works** (checked
> 2026-09-30). Anyone who finds it can send email as this Gmail account.

1. **Replace the App Password.** Sign in to the Gmail account, go to
   <https://myaccount.google.com/apppasswords>, **delete** the old app password,
   and create a new one named "KMC Tracker". Copy the 16 characters.
2. **Put it in your local `.env`** as `EMAIL_PASS=…`. `.env` is git-ignored now,
   so it stays on this PC.
3. **Copy the session secret.** Open the tracker's Apps Script ("Password
   masterdata" project) → Project Settings → Script properties → copy the value
   of `session_secret`.
4. **In Vercel → kmc-tracker → Settings → Environment Variables**
   (Production), set:

   | Name | Value |
   |---|---|
   | `EMAIL_USER` | the Gmail address |
   | `EMAIL_PASS` | the new App Password |
   | `TRACKER_SESSION_SECRET` | the `session_secret` from step 3 |
   | `CRON_SECRET` | any long random string (skip if already set) |
   | `SCHEDULED_EMAIL_TO` | the daily report list, comma-separated |
   | `ADMIN_NOTIFICATION_EMAIL` | who hears about new access requests |
   | `MAIL_FROM_NAME` *(optional)* | display name, default "KMC Tracker" |

   `RESEND_API_KEY` can stay. It is ignored while Gmail is configured.
5. **Redeploy** (push the commit, or Vercel → Deployments → Redeploy).
6. **Test**:
   - `node tools/email-test.mjs` checks the sign-in and sends nothing.
   - `node tools/email-test.mjs colleague@example.com` sends a real test.
   - Then use **Email Report** in the dashboard to send to two colleagues.

Until step 4 is done, the Email Report button answers *"Email sending is
switched off until TRACKER_SESSION_SECRET is set"*. That is on purpose: it
stays off rather than open.

## Limits to know

- **About 500 recipients a day** for a personal Gmail account. One report to 5
  people counts as 5. Job Orders emails come from the same account; plan on
  the two apps sharing roughly 500 a day.
- **25 MB per email.** Vercel also caps what the browser can upload at ~4.5 MB.
  If a big date range makes the report files larger than that, the dialog says
  so; narrow the range.
- Mail shows as coming from the Gmail address, e.g.
  "KMC Tracker <xcellencysehj@gmail.com>".

## Later: the KMC email account

When KMC's own email/domain is ready (planned handover session), you have two
choices:

- **KMC on Google Workspace:** make a sending account there (e.g. `tracker@…`),
  create its App Password, and change `EMAIL_USER` / `EMAIL_PASS`. The limit
  rises to ~2,000/day with no code change. Move the Job Orders Apps Script to
  that account too (see `tools/job-orders/README.md`).
- **KMC not on Google:** verify the domain in **Resend** (resend.com/domains →
  add the DNS records IT gives you). Then set
  `EMAIL_FROM=KMC Tracker <tracker@your-domain>` and `MAIL_PROVIDER=resend`.
  No code change is needed.

## Sources

- Resend test-sender restriction: <https://resend.com/docs/dashboard/domains/introduction>
- Gmail App Passwords with SMTP (still supported in 2026, needs 2-Step Verification): <https://nodemailer.com/guides/using-gmail>
- Gmail sending limits: <https://support.google.com/mail/answer/22839>
- Apps Script email quotas: <https://developers.google.com/apps-script/guides/services/quotas>
- Brevo sender rewrite without a verified domain: <https://www.captaindns.com/en/blog/brevo-transactional-email-technical-guide>
