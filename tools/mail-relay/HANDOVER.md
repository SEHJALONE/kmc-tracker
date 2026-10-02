# Email handover (2026-10-02)

## What it is
Tracker email needs **no keys** anywhere (no Resend key, no Gmail App Password, no
CRON_SECRET, no TRACKER_SESSION_SECRET). Google's Apps Script sends the mail from
the script owner's Gmail, shown as the system mailbox via Gmail "Send mail as".

| Piece | Where | Job |
|---|---|---|
| `src/data/mailer.js` | site | POSTs `sendReportEmail` / `notifyApproved` / `notifyAdminNew` to the Apps Script web app with the user's session |
| `Mail.gs` (file "Mail") | Apps Script, main tracker project | sends the mail; checks the session; daily report trigger |
| `Code.gs` | same project | `doPost` has 3 routing lines to the Mail functions (full copy: `Code-with-email.gs`) |
| `api/build-report.js` | Vercel | builds slide PDF / dashboard PDF / Excel from the live sheet; sends nothing, needs no key |
| `server/build-report.js` + `scripts/bundle-api.mjs` | repo | source of the above; run `npm run bundle-api` and commit after changing anything it imports (src/export, src/hooks/useStationTimes, stations, logoData) |

Old key-based code is parked in `archive/email-keys/` (not deployed; README there). Its
local secrets are in the git-ignored `archive/email-keys/.env.saved`.

## How each email is sent
- **Email Report buttons** (dashboard, scoreboard): signed-in users; any valid session.
- **Access approved** → applicant: administrators only.
- **New access request** → `ADMIN_NOTIFICATION_EMAILS`: public, rate-limited to 20/hour, can only email that fixed list.
- **Daily report**: Apps Script time trigger, 07:00 Kampala, fetches `https://kmc-tracker.vercel.app/api/build-report?part=slide|dashboard|workbook` and mails the three files to the saved recipients.

## Things you can change (all in the Apps Script "Mail" file)
- **Recipients of the daily report:** run `setScheduledReportRecipients("a@x.com, b@x.com")` (saved in Script Properties), or edit and run `setup()`.
- **Daily report subject:** Project Settings → Script properties → add `scheduled_report_subject`.
- **Daily report body text:** the `html` block inside `runScheduledReport`.
- **Report email body (buttons):** `sendReportEmail_`. **Access emails:** `notifyApproved_`, `notifyAdminNew_`.
- **Who gets access-request alerts:** `ADMIN_NOTIFICATION_EMAILS`.
- **Sender:** `MAIL_FROM` must exactly match an address in the owner Gmail's "Send mail as" list. Run `checkSender()` to verify. NOTE: the repo copy says `kmcproductionemail@gmail.com`; if the live script uses a different address (e.g. `kmcproductiondept@gmail.com`), update the repo copy to match.
- **Time of day:** `installDailyReportTrigger` (`atHour(7)`), re-run it after changing.
- After editing any Apps Script file: Deploy → Manage deployments → pencil → New version → Deploy (the URL does not change).

## Limits
~100 recipients/day on a normal Gmail account (~1,500 on Workspace), 25 MB per email, 50 recipients per email.

## Outstanding
1. Revoke the old Gmail App Password (leaked in public git history since June): myaccount.google.com/apppasswords.
2. Collaborator: pull `main`, retry the push; if GitHub still blocks it, send the exact error (old commit `6a04304` contains the old `.env`).
3. The "Daily/Weekly" choice in the Email Report dialogs still only sends at the moment you press Send (it is not a per-user schedule). The real automatic send is the single daily trigger above.
4. Make sure only ONE project has the daily trigger (delete the standalone "Mail" project if it still exists).
5. Uncommitted and unrelated: `/jobs` machine-shop work (jobs.html, src/jobs, tools/job-orders) and `src/hooks/useScoreboardData.js`.
