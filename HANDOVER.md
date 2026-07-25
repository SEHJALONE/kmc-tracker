# KMC Bus Production Tracker — Handover (2026-07-25)

Read this first in a fresh session. It's the state of the system, what's
solid, what's broken, and — especially — what's unresolved with the DPN
Scoreboard.

## What this app is

A React 18 + Vite MPA for Kiira Motors Corporation, deployed on Vercel at
**kmc-tracker.vercel.app**, git repo pushed to `main` on GitHub
(`SEHJALONE/kmc-tracker`). Surfaces: Travel Card (data entry), Bus Tracker
(line/dashboard), NCR Register, Shift Handover, DPN Scoreboard, and admin
screens (Access Requests, User Management).

## 🔴 Open and urgent: Apps Script redeploy still not live

This has failed **three times** in a row for the same reason: **there are
two different Apps Script projects in the Google account**, and the wrong
one keeps getting redeployed.

- **Correct project** — Web app URL ends in `...UePnesSQgnbJlfyIuiy7FkuAOH_q`.
  This is the one the whole app actually calls (`CATALOG_WRITE_URL` in
  `src/data/catalogConfig.js`, and the same constant duplicated in
  `useNCRData.js`/`useHandoverData.js`/`TravelCard.jsx`). Full source lives in
  **`APPS_SCRIPT_CATALOG.md`** at the repo root — always paste that file's
  code block in whole, never partial edits.
- **Wrong project** (keeps getting redeployed by mistake) — URL ends in
  `...X4I8nuqm5f0anh9JvLv8TjjsQtoWFf`. An old, unrelated legacy script. Not
  used by anything in this app anymore.

**How to verify which is deployed**, before trusting any "I redeployed it"
claim: run this in a browser console (or ask Claude to run it) —

```js
fetch('https://script.google.com/macros/s/AKfycbyHsyDOXkIURCTNrsxl4MbUVhqZxNco0qz1Bl95UePnesSQgnbJlfyIuiy7FkuAOH_q/exec', {
  method: 'POST', body: new URLSearchParams({ action: 'listDynamicUsers', token: 'kmcisgood' })
}).then(r => r.json()).then(j => console.log(j.users[0]));
```
If the returned user object has a `canAccessTracker` key, the current script
is live. If not, the redeploy hasn't landed — go find the *other* Apps
Script project at [script.google.com/home](https://script.google.com/home).

**Once it's actually deployed correctly**, these become usable for the first
time (they're fully built and tested on the frontend, just waiting on this):
- NCR Register writes (`saveNCR`/`updateNCR`) — currently silently falling
  through to the travel-card writer.
- Shift Handover writes — same problem; the `handovers` tab doesn't exist
  in the sheet yet, gets created on first successful write.
- Per-user Bus Tracker access toggle (User Management / Access Requests) —
  UI works and saves, but the server ignores the `can_access_tracker` field
  until this script version is live.

## 🟡 DPN Scoreboard — needs alignment, explicitly deferred

The user's instruction this session was: **"For now let the DPN scoreboard
be a standalone"** — i.e., don't merge its data pipeline with the main
Apps Script/tracker sheet. That's respected. But there's a real, unresolved
mismatch underneath it that will need fixing whenever scoreboard work
resumes:

1. **Wrong sheet ID configured.** `src/hooks/useScoreboardData.js` points at
   `SHEET_ID = '1Z338nnUHTxelGTUtXwbVQPdFi0czu_4us39070i3axM'` — this was
   flagged as a blocker back on 2026-07-10 (never set to "Anyone with the
   link → Viewer", so gviz can't read it). The user's actual working sheet,
   confirmed via screenshot this session, is a **different** spreadsheet:
   `KMC_Department_Monthly_Scoreboard`, ID
   `1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs`.

2. **Schema mismatch, not just a wrong ID.** That real sheet is a
   **Tracker-grid workbook** (tabs: `Tracker`, `SUGGESTION`, `Breakdown`,
   `Cost` — 45-bus × workshop columns, matching the original
   `KMC_Department_Monthly_Scoreboard.xlsx`/`.gsheet` files sitting untracked
   in `src/`). `useScoreboardData.js`, by contrast, expects a totally
   different shape: `Calc`/`Targets` tabs with label→value KV rows plus a
   workshop summary table (matching the IMS-objectives dashboard design from
   the 2026-07-10 rebuild). **Pointing the hook at the real sheet ID alone
   will not work** — the parser needs to be rewritten to match the real
   sheet's actual columns, or the real sheet needs new tabs built to match
   what the parser expects. Decide which direction before touching this.

3. **Because of #1, `Scoreboard.jsx` has been running on `SAMPLE` fallback
   data** for a while now — the "Live" badge in the toolbar tells you which
   mode it's in at a glance.

4. **A second, unrelated scoreboard artifact exists**: two standalone HTML
   files in `src/components/` —
   `DPN_July_2026_Scoreboard_LOGO_UPDATED (4).html` and `(5).html` — a
   self-contained, JS-driven dashboard (donut rings, workshop cards, its own
   `.xlsx` importer) that the user edits directly and is **not** wired into
   the live app at all (no App.jsx route references it). `(5).html` is the
   more recent of the two. This session's UI decluttering work (bigger
   donuts, remove target/behind pills, reordered workshop blocks, new cost
   fields) was applied to **`Scoreboard.jsx` only**, per the user's explicit
   choice — the standalone HTML files were left untouched. If asked to
   apply matching changes there, that's a separate, not-yet-started task.

5. **New cost fields added to `Scoreboard.jsx` this session** (Production
   Operational Cost, Workshop Supplies per Unit, Labour, Cost of Using the
   Production System, per-line operational cost, total production cost) all
   read via `num('<label>')` from the sheet's KV rows — they'll show `—`
   until matching rows are added to whichever sheet ends up being the real
   data source (see #2 above). The exact label strings needed are listed in
   the commit message for `57a0813`.

**Bottom line for next session:** don't assume the Scoreboard "just needs
its sheet ID fixed" — the real work is deciding whether to rewrite the
parser to match the Tracker-grid sheet, or rebuild that sheet to match the
KV/Calc format the parser already expects, and what (if anything) to do
about the two orphaned standalone HTML files.

## Architecture quick reference

Three Google Sheets in play, deliberately separate:

| Sheet | ID | Used for |
|---|---|---|
| Main tracker | `1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es` | Travel Card, Catalog, MOC, NCR, Handover — all via the Apps Script above |
| Private (access control) | `1TS2xV3kDIOlQ9W1-j-P9DExvt5lNZhLX6xeeuLX9BNA` | Access Requests + Dynamic Users (passwords) — never publicly shared, only the Apps Script can read it |
| DPN Scoreboard | `1Z338nnUHTxelGTUtXwbVQPdFi0czu_4us39070i3axM` (configured, broken) vs `1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs` (real, per screenshot) | Standalone — see section above |

Login is server-side only (`login` Apps Script action) — passwords never
reach any browser, including admin sessions. Static hardcoded accounts
(`systemadmin`, `kmcadmin`, etc.) live in `Login.jsx`'s `CREDENTIALS` array
and always have full access, independent of the private sheet.

Full credentials/tokens reference: **`CREDENTIALS-PRIVATE.md`** (repo root,
gitignored — never committed, exists only on this machine).

## What's built and working (verified live, this session)

- Cross-device access requests + dynamic user accounts, server-side login,
  passwords never sent to any client.
- Multi-station operators, multi-line supervisors, a "select whole line"
  quick-toggle, Chassis Line 01+02 grouped as one pick for General User.
- Manager role removed from the grant picker (code untouched, just hidden).
- Per-user Bus Tracker access toggle — built, saves correctly, **not yet
  enforced server-side** pending the redeploy above.
- Travel Card Save Session / Resume / Discard — explicit, not auto-saved.
- New **Daily Fleet Log** page (Supervisor section) — pick a date, see every
  bus's latest known station that day. Verified against real data.
- Access-approval and admin-notification emails via Resend, with real
  error-surfacing (Resend's free tier only sends to your own address until
  a domain is verified at resend.com/domains — known limitation, not a bug).
- DPN Scoreboard decluttering (see caveats above).

## Immediate next step

1. Find and redeploy the **correct** Apps Script project (see verification
   snippet above).
2. Re-verify NCR, Handover, and tracker-access all actually write once
   that's confirmed live.
3. Whenever ready: decide the DPN Scoreboard data-source direction (rewrite
   parser vs. rebuild sheet) — see that section for the full picture.
