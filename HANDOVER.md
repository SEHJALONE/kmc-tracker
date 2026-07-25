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

## ✅ DPN Scoreboard — now reading real data (resolved 2026-07-25)

Previously flagged as broken/unresolved; fixed same day. `useScoreboardData.js`
was completely rewritten to read the user's actual working sheet,
**`KMC_Department_Monthly_Scoreboard`**, ID
`1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs` (the old ID,
`1Z338nnUHTxelGTUtXwbVQPdFi0czu_4us39070i3axM`, was never made public and is
no longer referenced anywhere). Verified live in the browser — the "Live"
badge shows, and figures (workshop completion, cumulative throughput, cost
variance) were checked by hand against the raw sheet CSV and matched exactly.

**What changed:** the real sheet is a **Tracker-grid workbook** (tabs
`Tracker`, `SUGGESTION`, `Breakdown`, `Cost` — 45-bus × 7-workshop
Plan/Actual/Status/Delay columns), not the `Calc`/`Targets` KV-row format the
hook originally expected. The parser now derives everything directly from
that grid instead:

- **Workshops** (`Tracker` tab, columns hardcoded by index — see
  `WORKSHOP_COLS` in the hook, verified against the live header row):
  Machine Shop, Frame & Body Parts, Chassis Line 01, Frame & Body Welding,
  Paint Shop, Chassis Line 02, Trim & Final Assembly. Done/Active/Not
  Started/N/A counted directly from the `Status` sub-column per workshop;
  `DELAYED` status is set if any in-progress row has a positive `Delay` value.
- **Daily/cumulative output** — built from Trim & Final Assembly's Plan
  End / Actual End dates across all 45 buses (this is the "completed"
  workshop).
- **Cost** — reads the `Cost` tab's repeating period blocks (Labour/
  Material/Energy rows). Picks the most recent period that actually has
  non-zero actuals logged (not just the last row — several months ahead are
  pre-filled with budget-only placeholders and would otherwise get picked
  as "current" and show all zeros).
- **Kaizen** — from `SUGGESTION` tab (just SN/NAME columns; workshop/
  proposedBy/impact aren't tracked there, so those columns show blank).
- **Downtime** — from `Breakdown` tab's M1–M7 reason-code minutes. This is
  a single current snapshot, not a monthly trend, so the "Downtime — by
  Month" chart has no data to show (correctly says so rather than faking it).
- **No data source in this sheet at all** for: Safety, Quality/FPY, OEE,
  MTTR, Environment (energy/waste per unit), Open Bottlenecks, ECR register,
  Waste register. These all correctly show `—` / empty states rather than
  sample/fake numbers. If the user wants these tracked, it needs new tabs
  added to the real sheet — nothing to fix in code until that data exists.

**Still true, unchanged:** the two orphaned standalone HTML files —
`src/components/DPN_July_2026_Scoreboard_LOGO_UPDATED (4).html` and `(5).html`
— are a separate, self-contained dashboard (own `.xlsx` importer, not gviz)
that the user edits directly and is **not wired into the live app**. Not
touched by this fix. If asked to apply the same real-data wiring there,
that's a distinct task — that file reads an uploaded workbook buffer, not a
live Google Sheet.

**New cost fields added earlier this session** (Production Operational Cost,
Workshop Supplies per Unit, Cost of Using the Production System, per-line
operational cost, total production cost) still show `—` — the real sheet has
no columns for these yet. Only `Budget Total`/`Actual Total`/`Variance`/
`Variance %`/`Labour Cost` are populated from real data.

## Architecture quick reference

Three Google Sheets in play, deliberately separate:

| Sheet | ID | Used for |
|---|---|---|
| Main tracker | `1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es` | Travel Card, Catalog, MOC, NCR, Handover — all via the Apps Script above |
| Private (access control) | `1TS2xV3kDIOlQ9W1-j-P9DExvt5lNZhLX6xeeuLX9BNA` | Access Requests + Dynamic Users (passwords) — never publicly shared, only the Apps Script can read it |
| DPN Scoreboard | `1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs` (`KMC_Department_Monthly_Scoreboard`) | Standalone — now wired up for real, see section above |

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
- DPN Scoreboard reading real data end-to-end (see section above).

## Immediate next step

1. Find and redeploy the **correct** Apps Script project (see verification
   snippet above) — this is the only thing still blocking NCR, Handover, and
   tracker-access from actually working.
2. Re-verify NCR, Handover, and tracker-access all actually write once
   that's confirmed live.
