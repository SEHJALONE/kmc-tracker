# KMC Bus Production Tracker — Handover (2026-07-25, major update 2026-07-27)

## 🔴 Open and urgent (2026-07-27): re-upload the new master workbook

**Superseded the whole "3 new tabs" plan below** — the user shared the real
**IMS-objectives master workbook** (`KMC DPN SCOREBOARD.xlsx`, via WhatsApp),
which is a much richer 15-tab file (README/Dashboard/Targets/Tracker/Daily
Output/Downtime/Bottlenecks/Quality/Safety/Environment/ECR/Cost/Waste/
Kaizen/Calc) than the lean 4-tab grid we'd been reverse-engineering since
07-25. `useScoreboardData.js` was **rewritten from scratch** around it —
see "DPN Scoreboard — rebuilt around the real master workbook" below for
full detail. `src/KMC_Department_Monthly_Scoreboard.xlsx` now **is** that
master workbook (plus our own `Cost Inputs` tab) — the old
`Monthly Downtime Log` / `Weekly Meter Readings` tabs are gone, replaced by
the master's own `Downtime` and `Environment` tabs which do the same job
properly.

**This needs to be re-uploaded to the live Google Sheet
(`1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs`)** before any of it goes
live — it's a bigger structural change than previous re-uploads (the whole
tab set changed, not just 3 additions), so treat it as replacing the sheet
wholesale rather than an incremental update. Until that happens, the
Scoreboard falls back to `SAMPLE` data (old workshop names, old shape) —
verified that fallback still renders without crashing, but it's stale.

Also still true: **Cost Inputs rates are all 0** (Staff Hourly Rate,
Machine Hourly Rate, Energy Tariff Rate) — user hasn't shared real numbers
yet. Production Operational Cost and per-line costs will show 0 until then.

## ✅ DPN Scoreboard — rebuilt around the real master workbook (2026-07-27)

`useScoreboardData.js` was rewritten essentially from scratch. The old
version reverse-engineered everything from a bare 46-column Tracker grid
because that's all the sheet had; the real master workbook the user shared
turns out to have a **`Calc` tab that's pre-computed by spreadsheet formulas**
— a workshop-status table + a flat label/value KPI dump covering almost
every field `Scoreboard.jsx` reads (Completed, In Production, Achievement %,
SPI, OEE, MTTR, M1-M7 downtime minutes, FPY, Safety/Environment KPIs, cost
Budget/Actual/Variance, register counts...). So most of the hook is now a
direct lookup into `Calc`'s kv map, not re-derived math.

**Tabs fetched now**: `Targets`, `Tracker`, `Daily Output`, `Downtime`,
`Bottlenecks`, `Quality`, `Environment`, `ECR`, `Cost`, `Waste`, `Kaizen`,
`Calc`, plus our own `Cost Inputs` (soft-fetched) and the Travel Card's
`operators`/`submissions` (cross-sheet, soft-fetched).

- **`Calc`** → workshop-status array (8 workshops now, incl. Quality
  Inspection & Testing) + ~75 KV fields covering nearly every KPI card on
  the board.
- **`Targets`** → Scoreboard Period Start/End, Shift Label, Program Target
  (vehicles — no longer hardcoded to 45), all the "Target: X" fields,
  baselines.
- **`Daily Output`** → the `daily` array (Date/Planned/Actual/Cum
  Plan/Cum Act/Gap) read directly — it's formula-driven in the sheet, no
  need to re-derive from Tracker Plan/Actual dates anymore.
- **`Downtime`** → event log (Date/Workshop/Equipment/Reason
  Code/Downtime min/...), bucketed by month for the "Downtime — by Month"
  trend chart. Current-period M1-M7 totals still come from `Calc`.
- **`Bottlenecks` / `ECR` / `Waste` / `Kaizen`** → real registers, finally
  populating panels that showed "No X logged" placeholders since this
  workbook didn't exist yet. All 4 currently have 0-3 real rows.
- **`Quality`** → per-inspection log, bucketed by month for a First Pass
  Yield trend. 0 real rows currently — the parser assumes the result
  column contains something matching `/pass/i`, unverified against real
  data since none exists yet; worth double-checking once rows appear.
- **`Environment`** → monthly Energy Used (kWh), read for the *latest*
  month with data — feeds the NEW Energy Cost calc (see below). The
  existing Energy-per-Unit/vs-Baseline KPIs are still `Calc`'s own formulas
  off this same tab, untouched.
- **Workshop names changed** to match the real sheet's naming exactly:
  `Chassis Production Line 02` (not `Chassis Line 02`), `Chassis Production
  Line 01`, `Frame & Body Parts Making`. Updated everywhere: `WORKSHOP_COLS`
  and `LINE_WORKSHOP_NAMES`/`LINE_ID_TO_WORKSHOP` in the hook,
  `LINE_WORKSHOPS`/`WORKSHOP_IMG`/`SAMPLE` in `Scoreboard.jsx`. The
  `display` labels shown in the UI are unchanged (still "Chassis Line 02"
  etc.) — only the internal `dataName` used to match sheet data changed.
- **Cost Inputs** tab kept as our own addition (Staff/Machine Hourly Rate,
  Energy Tariff Rate) — still the only new tab we maintain outside the
  master template. Labour cost calc (Travel Card headcount × hours × rate)
  is unchanged from 07-25. Energy cost now reads `Environment`'s latest
  month × Energy Tariff Rate, replacing the old separate meter-reading tab.
- **`Monthly Downtime Log` and `Weekly Meter Readings` tabs are gone** —
  fully superseded by the master's own `Downtime` and `Environment` tabs.

**Two real bugs found and fixed while verifying against real exported data**
(don't trust "renders fine with SAMPLE" as proof — SAMPLE bypasses all real
parsing; a Node test harness feeding actual CSV exports through the parser
functions caught both of these):
1. **Date parsing** — `parseTrackerDate` only handled ISO/US-style dates via
   native `Date()`, which silently returns Invalid Date for hand-typed
   `DD/MM/YYYY` text (e.g. a Downtime row with `"25/06/2026"` — day=25 makes
   `new Date()` assume MM/DD and fail). Added a DD/MM/YYYY regex fallback.
   Real risk: any tab with hand-typed dates instead of a real Excel date
   picker could silently drop rows from monthly trends.
2. **Mojibake** — a PowerShell bulk `-replace` I ran to add `export` to
   several functions round-tripped the file through the wrong default
   encoding, turning every em-dash/arrow into garbage (`â€”` etc.) plus a
   stray BOM. Repaired via a Python `cp1252`-encode → `utf-8`-decode
   round-trip. Worth remembering: **PowerShell `Get-Content`/`Set-Content`
   default encoding is not reliably UTF-8** — always pass `-Encoding utf8`
   explicitly, or better, do bulk text edits in Python.

**Verification method**: exported `Calc`, `Targets`, `Daily Output`,
`Downtime`, `Quality`, `Environment`, `Bottlenecks`, `ECR`, `Waste`,
`Kaizen`, `Cost`, `Cost Inputs`, `Tracker` to CSV from the real xlsx
(`data_only=True`, restored from the *original* WhatsApp file for the
formula-driven tabs since an earlier `openpyxl` re-save had stripped their
cached values — Sheets recalculates on import regardless, this only
affected local testing) and ran every parser function against that real
CSV text via a small Node ESM harness (parser functions now exported from
`useScoreboardData.js` for this reason — harmless to leave exported).
Output cross-checked by hand against the raw `openpyxl` cell dump earlier in
the session. All fields matched.

**Not yet verified**: actual live fetch from Google Sheets (this sandbox
can't reach `docs.google.com`) — do a real check once the sheet is
re-uploaded, same as every previous "verified against SAMPLE only" caveat
this project has had.

## 🟡 Superseded 2026-07-25 plan: 3 new sheet tabs (historical, no longer the plan)

DPN Scoreboard now has real charts and a real cost model (see next section),
but they read from **3 brand-new tabs** that only exist in the local file
`src/KMC_Department_Monthly_Scoreboard.xlsx` — not yet on the live Google
Sheet (`1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs`). Following the sheet's
own established workflow ("re-upload this file" — already in the Breakdown
tab's instructions), the user needs to **re-upload/replace the Google Sheet
with this xlsx file** for any of the new charts/costs to show real data.
Until that happens, everything gracefully falls back to zeros/empty states
— it won't crash, it just won't be live.

The 3 new tabs, each styled to match the sheet's existing convention
(navy header, yellow = edit-this-cell, blue text = input):
- **`Monthly Downtime Log`** — Month | Downtime Hours | Notes. Seeded with
  one historical row (Apr-26, 0.7h, from the existing Breakdown snapshot).
  Feeds the "Downtime — by Month" bar chart. User chose manual monthly entry
  over an automatic Delay-column-derived proxy for now, but wants the
  automatic derivation kept in mind for later.
- **`Cost Inputs`** — 3 config cells: **Staff Hourly Rate** (UGX/hour,
  currently 0 — user said they'll share the real number), **Machine Hourly
  Rate** (UGX/hour, reserved for later, not used in any calc yet), **Energy
  Tariff Rate** (UGX/kWh, currently 0). All cost figures downstream of these
  show 0 until they're set to real values — deliberate, not a bug.
- **`Weekly Meter Readings`** (renamed from `Daily Meter Readings` same day,
  per request) — Week Ending | Meter Reading (kWh) | Notes. Meter reading =
  **TX1 + TX2 + TX3** (the site's three transformer feeds = total grid draw;
  solar generation meters 250K/500K/144K and area submeters Trim/QIT/SMDB
  Chassis are excluded — they sit downstream of the transformers, not
  additional draw). **Seeded with 4 real legacy rows** (22/06, 29/06, 06/07,
  13/07/2026) read from a shared energy-audit photo, converted MWh→kWh.
  The 06/07 and 13/07 rows involved reconstructing OCR-wrapped decimal
  digits from a phone screenshot — flagged in each row's Notes as
  "verify against source PDF" since exact digits weren't fully certain.
  Dashboard computes consumption as the delta between the earliest and
  latest logged reading.

**Immediate next step**: user re-uploads the xlsx (already updated in the
repo) to the live Google Sheet, then sends the real Staff Hourly Rate and
Energy Tariff Rate so `Cost Inputs` can be filled in with real numbers.

## ✅ DPN Scoreboard — monthly charts + real cost model (2026-07-25)

Built on top of the Tracker-grid rewiring from earlier the same day. All new
logic lives in `useScoreboardData.js` (parsing) and `Scoreboard.jsx`
(rendering); `SAMPLE` data updated to match so the page never crashes before
the new tabs exist on the live sheet.

- **Downtime — by Month** — changed from a line chart to a bar chart
  (`MonthlyBarChart`), reading the new `Monthly Downtime Log` tab.
- **Planned vs Actual — by Month (whole program)** — new bar-chart panel
  (`MonthlyPlanActualChart`), derived from the Tracker's Trim & Final
  Assembly Plan End / Actual End dates bucketed by month, spanning the
  full production timeline (not just the last N days like the existing
  daily/cumulative charts, which are untouched).
- **Planned vs Actual — by Month, per Line** — same chart type, one panel
  each for the 4 reported lines (Trim & Final Assembly, Chassis Line 02,
  Paint Shop, Frame & Body Welding — these 4 were already established in
  an earlier session as "the four we report on", per `LINE_WORKSHOPS` in
  Scoreboard.jsx).
- **Monthly Output — by Line** — new comparison chart (`MultiLineOutputChart`),
  4 colored bars per month (one per line), so throughput trends across the
  4 lines can be compared side by side.
- **Cost model** — `Production Operational Cost` and per-line
  `Operational Cost — <line>` are no longer permanently blank placeholders:
  - **Labour cost**: cross-sheet read of the Travel Card's own `operators`
    + `submissions` tabs (on the *other* sheet, `1npt7Tf2y...`) — each
    `operators` row is one staff member on duty for one submission; joined
    to that submission's `actual_time_min` and `station_code` (mapped to
    one of the 4 lines via `data/stations.js`'s `STATIONS[code].line`).
    Cost = Σ(headcount-instances × hours worked) × Staff Hourly Rate.
  - **Energy cost**: `Daily Meter Readings` delta × Energy Tariff Rate.
  - **Production Operational Cost** = Labour + Energy (Material not
    included — no per-shift material data source exists yet).
  - All cost KV values are stored in UGX '000 to match the existing Cost
    tab's unit convention (raw UGX ÷ 1000) — this matters if extending the
    calc later, easy to get a 1000x display bug otherwise.
  - Cost panel reordered so **Production Operational Cost** leads, per
    request, followed by Labour/Budget/Actual/Variance, then the existing
    **Operational Cost per Line** panel right below it (already existed,
    was just always empty).
- Fixed a pre-existing typo in `Scoreboard.jsx`'s `SAMPLE` data: the key was
  `'Operational Cost — Chassis Production Line 02'` but every real code path
  uses `'Operational Cost — Chassis Line 02'` (no "Production") — the sample
  fallback was showing `—` for that one line's cost card only.

Verified in-browser against `SAMPLE` fallback data (live sheet fetch isn't
reachable from this sandboxed dev environment) — all new panels render, no
console errors, values match `SAMPLE` exactly. **Not yet verified against
real live data** since the new tabs don't exist on the live sheet yet (see
previous section) — do that once the xlsx is re-uploaded.

## ✅ NCR + Travel Card data now wired into Dashboard, Bus Report, Line Tracker

User confirmed the correct data source is the **`NI Travel Tool Data`** sheet
(ID `1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es`, tabs incl. `ncrs`,
`Travel Card Data`), and the correct Apps Script project is
**`KMC Travel Card Data Collector`** — both already matched what
`useNCRData.js`, `useSheetData.js`, `useOverrunData.js`, `useHandoverData.js`
and `catalogConfig.js` were pointed at, so no sheet-ID changes were needed.

What *was* missing/broken, now fixed:
- **`useNCRData.js` parsing bug** — it searched for `station_code`/`ncr_type`
  header names, but the live `ncrs` tab (matching `NCR_HEADERS` in
  `APPS_SCRIPT_CATALOG.md`) uses plain `station`/`type`. NCR station and
  type were silently parsing as blank on every row. Fixed by adding those
  as fallback search terms.
- **Dashboard.jsx** — added an `NCRSummaryCard` (open/critical/overdue/
  closed/total, links to `/ncr.html`) and actually rendered the existing
  `HandoverSummaryCard`, which was fully built but never mounted in JSX.
- **BusReport.jsx** — each bus row now shows a `⚑ NCR ×N` badge when it has
  open NCRs against its VIN; summary grid gets an "Open NCRs" tile when any
  exist.
- **LineTracker.jsx** — bus cards on the live floor view get a small red
  flag badge (count) when they have open NCRs, threaded down through
  `LineCard` → `StationDot` → `BusCallout`; also shown in the hover tooltip.

Verified live in the browser (dev server, systemadmin login): all three
views render without console errors; NCR summary card on Dashboard showed
real counts (1 total / 1 overdue) from the live sheet's one test NCR record.
Note the test NCR's VIN (`KMC TEST 001`) doesn't match any real bus
currently on the floor, so the BusReport/LineTracker badges didn't have
a chance to visually confirm against real data yet — logic was verified
by code review + the Dashboard card pulling from the same hook correctly.


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
  a single current snapshot, not a monthly trend. *(Superseded later the same
  day — see "DPN Scoreboard — monthly charts + real cost model" above: the
  "Downtime — by Month" chart now reads a separate `Monthly Downtime Log` tab.)*
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
operational cost, total production cost) originally showed `—`. *(Superseded
later the same day — see "DPN Scoreboard — monthly charts + real cost model"
above: Production Operational Cost and per-line Operational Cost are now
computed from Travel Card labour data + the new `Cost Inputs`/`Daily Meter
Readings` tabs, currently 0 pending real rate values. `Workshop Supplies per
Unit` and `Cost of Using the Production System` still have no data source.)*

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
