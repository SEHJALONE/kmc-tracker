# Archived: key-based email (not deployed)

Parked here on 2026-10-01 so the repo and Vercel need **no email keys**.
Nothing in this folder runs: Vercel only deploys `/api`, and the test runner
only looks in `src/`.

Live email now goes through the Apps Script (`tools/mail-relay/Mail.gs`,
called by `src/data/mailer.js`) — Gmail sign-in lives in Google, not here.

To bring this back:
- `api/`            → move back to `/api` (Vercel functions: send-report, notify-admin,
                      notify-approved, run-scheduled, `_lib/mailer.js` + `_lib/auth.js`)
- vercel.json       → re-add the `/api/(.*)` rewrite and the 07:00 `crons` entry
                      (`{ "path": "/api/run-scheduled", "schedule": "0 7 * * *" }`)
- `server.js`       → local Express mailer; `tools/email-test.mjs`; `src-test/mailer.test.js` → `src/test/`
- `EMAIL-SETUP.md`  → the full setup notes and Vercel variables
- Keys: set them in Vercel's dashboard. `.env.saved` (git-ignored, local only)
  holds the old values — the Gmail App Password in it was exposed in the public
  repo history and must be revoked and replaced before reuse.

Note: `run-scheduled.js` here is the old all-in-one cron (build + send with keys).
Its report-building half now lives on, keyless, as `api/build-report.js`; the
daily send is an Apps Script time trigger (`runScheduledReport` in Mail.gs).
