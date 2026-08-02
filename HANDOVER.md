# KMC Bus Production Tracker — Handover (2026-07-25, major update 2026-07-27, root-cause fix + new features 2026-08-02)

## ✅ 2026-08-02, later: Travel Card additions + Access Request station preference

Three more things shipped the same session as the Apps Script fix above, all
deployed live and verified end-to-end in the browser (not just code review):

1. **Travel Card — optional Comments + Unexpected Delay/Time Lost** for
   general users only (supervisors already have the full 6M/RCA downtime
   flow when actual time exceeds designed time). New card at the bottom of
   page 1 ("Additional notes — optional"): a free-text Comments box, plus
   pick-any-of-6M delay tags each with a rough time-range dropdown (0–15,
   15–30, 30–60, 60–120, 120+ min) instead of an exact number, since the
   ask was "a range of time, not exact." Stored as `general_comments` /
   `unexpected_delay` (JSON) columns on the `submissions` tab. See
   `TravelCard.jsx` — state near `genComments`/`delayTypes`/`delayRanges`,
   UI right before the page-1 nav buttons, payload in `submitUserCard`.
2. **Access Requests — applicant station preference, preselected for admin.**
   `SignUpModal.jsx` now shows an optional per-line station picker (only for
   "Production" dept, since Product Development lines have no station
   catalog) once at least one production line is picked. Stored as
   `preferredStations` → `preferred_stations` column on `AccessRequests`.
   `AccessRequests.jsx`'s `openRequest()` preselects `assignedStations` (and
   `stationLine`/`supervisorLines`) from it, plus shows a "Applicant
   requested" box so the admin can see the original ask even after
   adjusting. Admin can still add/remove before granting — it's a
   starting point, not a lock.
3. **Found and fixed a real pre-existing data bug while verifying #1/#2**:
   `getOrCreate` only sets headers when it creates a tab from scratch — it
   never updates headers on a tab that already exists (same class of issue
   as the original "add `roles` column by hand" instruction). Appending new
   columns to `writeSubmission`/`submitAccessRequest_` without also editing
   the *already-live* header row meant the written data landed in the right
   column positionally, but any name-based reader (`listAccessRequests_`,
   and potentially future report code) couldn't find it — confirmed via a
   real submitted request coming back with `preferredStations: []` despite
   the sheet actually having the data. Worse: this uncovered that the
   `submissions` tab's header row had been stuck at an **old 21-column
   schema since before `gross_time_min`/`break_min` were ever added to the
   code** — every column from `actual_time_min` onward was mislabeled by 2
   positions for any row written after that change. Fixed by rewriting the
   `submissions` header row to match the current 25-column write order
   exactly, and moving `preferred_stations` to its correct column on
   `AccessRequests`. **This only relabels going forward — it does not
   migrate historical rows.** Any row written before `gross_time_min`/
   `break_min` were added to the code will still have those specific
   columns effectively blank/misaligned if read by name; only rows from
   whenever that schema change actually shipped onward are affected by the
   mislabeling this fix corrects. Worth a spot-check if a report ever looks
   wrong for `gross_time_min`/`break_min`/`overrun_min` on an older row.

## ✅ 2026-08-02, later still: edit-before-approval, built properly

The user chose "fix approval sync first" when asked (see the flag this
section used to contain, kept in git history). Built and verified live
end-to-end in the browser, not just code review:

- **`updateSubmission_`** (Apps Script) — one action, two callers: a
  supervisor's review decision (`reviewOnly` — patches
  `reviewer`/`approvalStatus`/`reviewDate`/`reviewComments` only, no
  restriction) and a general user's own edit (`requireStillPending` +
  `_fullEdit` — rewrites the submission row plus deletes-and-rewrites its
  `activities`/`resources`/`operators` rows, since those are one-row-per-item
  tables with no stable per-item id to patch in place). Blocks only on
  `approval_status === "approved"` — a first-pass "pending"/"rejected"
  decision still leaves the card editable, per the actual requirement
  ("as long as the supervisor has not yet approved").
- **`PendingReviews.jsx` rewritten** off `kmc_pending_reviews` localStorage
  onto `useSubmissionsData` (new hook) — reads live from the sheet
  (submissions + activities + resources + operators joined by `record_id`
  via gviz), and `saveReview` now calls `updateSubmission_` for real instead
  of only touching localStorage. This was the load-bearing fix: without it,
  an edit-lock gated on "has a supervisor approved" would've been checking
  data that only ever existed in one browser.
- **New `submitted_by` column** on `submissions` — was being sent in every
  payload all along (`sub.submittedBy`) but `writeSubmission` never actually
  wrote it anywhere until this was needed to reliably find "this general
  user's own cards."
- **`MySubmissions.jsx`** (new) — general user's own submission history,
  status badges, "Edit →" when not yet approved, "Locked" once it is. New
  HomeScreen card, `role === 'user'` only.
- **`TravelCard.jsx` edit mode** — `editSubmission`/`onEditSubmit` props,
  pre-fills every field (including the new Comments/delay-range section)
  from the record being edited, "Save Changes" instead of "Submit for
  Review," posts through `updateSubmission_` instead of creating a new row.
  Guards the pre-existing `p0next()` auto-`clockOut`-to-now side effect so
  editing doesn't silently overwrite the original clock-out.

**Verified live, full round trip**: submitted a real card as a general user
→ saw it in My Submissions with live "Pending review" status → edited it
(changed the Comments field) → confirmed the edit landed in the sheet →
logged in as admin, saw the SAME edited data in Pending Reviews (proving
cross-device sync works) → approved it → confirmed it left the pending
queue → logged back in as the general user → confirmed My Submissions now
shows "Approved" / "Locked" with no edit button.

**Known pre-existing UI hiccups noticed while testing** (not caused by this
work, not fixed): several older `Pending Reviews` list rows show `— · Invalid
Date` — those submissions have a blank/unparseable `timestamp` cell; and
the "Add VIN"/project dropdown interaction in `TravelCard.jsx` silently
no-ops if a project isn't selected first (by design — `if (!n.trim() ||
!curProj) return;` — but has no user-facing error message, worth a UX pass
if it comes up as a real complaint).

## KMC Travel Card Data Collector project — dead weight, not "wrong"

Correcting the framing directly below: `1Tll1te0Vd1ynakjvAry0LdGbdJOeNhWOobqadnSnEXIWfLFByrLgBZJa`
("KMC Travel Card Data Collector") is not bound to any sheet the app reads
from and its 2 deployments don't match the live URL — it's simply unused.
No action needed on it; don't waste time investigating it further.

## ✅ RESOLVED 2026-08-02: the real Apps Script problem (was never "wrong project")

Everything below in the two 🔴 sections was based on a wrong model. The
actual root cause, found by pulling the live script with `clasp` (Google's
Apps Script CLI, already installed + authenticated as `xcellencysehj@gmail.com`
on this machine) instead of guessing from URLs:

- **The project that's actually live** (serving `.../UePnesSQgnbJlfyIuiy7FkuAOH_q/exec`,
  the URL every hook/component posts to) is called **"Password masterdata"**
  (Script ID `1MdmeSsq6IE22UKxz5IV8__c8bvFArpW7oXGA72BeAmaffQ54wKirTBLD`),
  found via Extensions → Apps Script from *inside* the private
  `KMC Tracker — Access & Users (Private)` sheet — i.e. it's **container-bound
  to the private sheet**, not to `NI Travel Tool Data` and not a standalone
  project. "KMC Travel Card Data Collector" (`1Tll1te0Vd1ynakjvAry0LdGbdJOeNhWOobqadnSnEXIWfLFByrLgBZJa`)
  — the project every prior session assumed was correct — is a real project
  the account can edit, but its only two deployments (`...RUxEEtLvh3Rhw`
  @HEAD and `...X4I8nuqm5f0anh9JvLv8TjjsQtoWFf` @17) are **neither one** the
  URL the app calls. It's unused dead weight, not "the wrong one being
  redeployed by mistake" — nobody had been redeploying it at all recently;
  it just isn't relevant.
- **The actual bug**: because the live script is bound to the *private*
  sheet, every `SpreadsheetApp.getActiveSpreadsheet()` call in it (nearly
  every write function — `saveCatalog_`, `saveNCR_`, `saveMOC_`,
  `saveHandover_`, `saveMachine_`/rates, the default travel-card writer)
  was writing into the **private sheet's** `submissions`/`operators`/`ncrs`/
  etc. tabs — confirmed empirically (18 submissions, 27 users, etc. already
  sitting there). But **every read hook in the app** (`useNCRData.js`,
  `useMachineCostData.js`, `useHandoverData.js`, `useSheetData.js`,
  `useOverrunData.js`, `useCatalog.js`) reads via public gviz CSV from
  **`NI Travel Tool Data`** (`1npt7Tf2y...`) — a *different* spreadsheet.
  Writes and reads had been silently targeting two different sheets the
  whole time. That's the real reason NCR/Handover/tracker-access/Machine
  Cost writes "silently failed to persist" for weeks — not a stale
  deployment, a wrong write target.
- **Fix applied and deployed live** (via `clasp push` + `clasp deploy -i
  <existing deploymentId>`, same `/exec` URL, verified with a real
  write→gviz-read round trip before/after): every
  `SpreadsheetApp.getActiveSpreadsheet()` in `APPS_SCRIPT_CATALOG.md`
  changed to `SpreadsheetApp.openById(TRACKER_SHEET_ID)` (i.e. explicitly
  `NI Travel Tool Data`), **except** the `privateSs_()`-based
  AccessRequests/DynamicUsers functions, which correctly keep targeting the
  private sheet. Confirmed live: `listDynamicUsers` now returns
  `canAccessTracker`/`roles` on every user, and a test `saveMachine` write
  landed in `NI Travel Tool Data`'s `machines` tab and was immediately
  readable via the app's own gviz URL.
- **Password hashing added** at the same time (user request): `DynamicUsers`
  passwords are now stored as `salt$sha256hex` (see `hashPassword_`/
  `verifyPassword_`/`isHashedPassword_` in `APPS_SCRIPT_CATALOG.md`).
  Legacy plaintext rows keep working — `login_` falls back to a direct
  compare and migrates the row to a hash on next successful login, no bulk
  migration needed. `AccessRequests` passwords **intentionally stay
  plaintext** — the approval UI (`AccessRequests.jsx`'s `handleApprove`)
  reads that value once to relay the password to the applicant; hashing it
  there would break that flow.
- **Two minor cleanup items left**: (1) one empty phantom `submissions` row
  (id `bfe03995-d339-4436-8ffe-5f76b73e3e43`) in the **private** sheet's
  `submissions` tab, from an earlier malformed test call in this session —
  harmless (never read by the app), safe to delete by hand if it bothers
  you. (2) the private sheet also has 18/19/26/7/7 real rows already sitting
  in its own `submissions`/`activities`/`resources`/`operators`/`projects`
  tabs from however long the write-target bug was live — those are now
  orphaned (nothing reads them) but represent real historical submissions
  that never made it into `NI Travel Tool Data`. Worth deciding whether to
  migrate them across by hand if that history matters.

## ✅ RESOLVED 2026-08-02: Machine Cost module tabs

The 4 tabs (`machines`, `machine_rates`, `staff_rates`, `energy_rates`) were
added to a **copy of the DPN Scoreboard workbook** at the user's explicit
request (not `NI Travel Tool Data` as originally planned) — delivered back
as a file, `machines`/`machine_rates` populated with the real 205-machine/
120-rate seed data, `staff_rates`/`energy_rates` header-only. This is a
**static reference copy only** — the DPN Scoreboard sheet has no Apps
Script, so the CEE UI's add/edit actions still can't write there; live
reads/writes both go through `NI Travel Tool Data` per the fix above. If
`NI Travel Tool Data` doesn't yet have its own `machines`/`machine_rates`/
`staff_rates`/`energy_rates` tabs, add them there too (same seed data,
already in this repo's session scratchpad as `machine_cost_seed_tabs.xlsx`)
for the CEE screen to actually work end-to-end.

**Also worth a quick sanity check from the user**: the source costing
template's "Machine Rate (UGX)" column has no explicit "/hour" — I assumed
UGX/hour to match "Staff Hourly Rate"/"Energy Tariff Rate" framing. At that
assumption, the computed absorption-cost total for one period (480h) across
just the 120 machines with a real rate is **~1.06 billion UGX** — noticeably
larger than the existing Budget Total (704,000, in UGX '000, i.e. ~704
million) for the whole program. That's a genuinely new cost dimension
(machine costs were never one of the Cost tab's 3 categories), so a big
number isn't necessarily wrong — but it's large enough that it's worth
confirming the rate unit is really UGX/hour and not, say, UGX/day or a
one-time figure, before treating it as authoritative.

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

## ✅ Machine Cost Database + Cost Estimations Engineer module (2026-07-27)

User shared `Production Costing Template to Rodney (1).xlsx` — a real
machine registry (220 raw rows → 205 clean machines across every station,
120 with a real UGX rate) — and asked for a proper machine-cost system:
register machines per station, track hourly rates for machines/staff/energy
with a **time-bounded validity window** (a rate change shouldn't rewrite
past costing), a 3-tab UI for a new **Cost Estimations Engineer (CEE)**
role, a cost/uptime report, support for one person holding more than one
role (e.g. supervisor **and** CEE), and the existing cost calculation
updated to actually use it.

**Data model — 4 new tabs on the main sheet** (`1npt7Tf2y...`, write access
lives there via the same Apps Script NCR/Handover/Travel Card already use):
- `machines` — `record_id, station_code, activity, machine_name, active, created_at, created_by`. Soft-delete via `active` (archive, never hard-delete — a machine with rate history needs to keep resolving).
- `machine_rates` / `staff_rates` / `energy_rates` — append-only rate history, each row has `valid_from`/`valid_to` (blank `valid_to` = open-ended, "July to date"). Editing a rate means adding a new row, never overwriting an old one.

**Resolved design decision** (user confirmed, since Travel Card only tracks
station not individual machine, and the Downtime log's equipment list
doesn't cover real machine names): cost uses **absorption costing** —
`Machine Hourly Rate × Available Production Hours for the period`, same
hours for every machine at a station regardless of which one actually ran.
Not a true utilization measurement; documented as such in the Report tab
itself and in the footer note.

**Seed data**: `machines` + `machine_rates` tabs built from the real xlsx
(delivered separately as its own file) — forward-filled the source's merged
Station Line/Number/Process cells, cleaned obvious typos (duplicate
near-identical names, a stray backtick), dropped ~5 repeated header rows
the source re-prints periodically and a few non-standard "Transfer"/
"Buffer" pseudo-station rows with no real station code. **~43% of machines
(85 of 205) had no rate in the source** — mostly auxiliary equipment
(Power Grid, Elevated Trolley, Material Racks, Transfer Trolleys) rather
than core processing machines — imported anyway with no rate row, costing
0 until a real rate is set. Also found: **18 station codes** in the costing
template don't exist in `src/data/stations.js`'s `STATIONS` catalog (PDI,
"Washing Bay" as literal text vs the app's `WASHING` code, `Q01-07a`/`b`
where the app only has one combined `Q01-07`, several `C0x-xx-01`
sub-stations, `C01-06`/`C01-08`/`P02-06`/`P02-07`/`P04-03..05`) — the real
factory has more granular/complete station coverage than the app currently
models. Machines at those codes still cost correctly overall; only the
per-LINE rollup skips them (no line to attribute to). Worth reconciling the
station catalog separately via `CatalogAdmin.jsx` if per-line accuracy
matters here — out of scope for this session.

**Apps Script** (`APPS_SCRIPT_CATALOG.md`): new `data.action`-style handlers
`saveMachine`/`updateMachine`/`saveMachineRate`/`saveStaffRate`/
`saveEnergyRate`, following the exact `saveMOC_`/`updateNCR_` conventions
(`getOrCreate`, `Utilities.getUuid()`, `fieldMap`-driven patch). **Multi-role
support** added the same way: a new `roles` (plural) column on
`DynamicUsers`, JSON-array-stringified exactly like the existing
`assignedLines`/`assignedStations` fields — deliberately narrow in scope,
additive only. The primary `role` (singular) field is untouched and every
*existing* `role === 'x'` check elsewhere in the app still only looks at
that; only the new CEE-access check in `App.jsx` also consults `roles`.

**Frontend**: new `src/hooks/useMachineCostData.js` (mirrors
`useNCRData.js`) and `src/components/CostEstimation.jsx` — Machines /
Rates / Report tabs, gated behind `hasCeeAccess` in `App.jsx`
(`role === 'systemadmin' || role === 'cee' || roles.includes('cee')`), with
a new HomeScreen card. Test accounts: `kmc.cee` / `Cee1234!` (CEE only) and
`kmc.super` / `Super1234!` now also has `roles: ['cee']` — demonstrates one
person holding two roles at once (Supervisor section + Cost Estimations
Engineer section both show up on their home screen).

**Cost engine** (`useScoreboardData.js`): Production Operational Cost is
now Labour + Energy + **Machine** (was Labour + Energy only). Staff/Energy
rates now resolve "as of today" from the new time-bounded history tabs
instead of the old flat `Cost Inputs` value. Per-line `Operational Cost —
<line>` cards now include each line's machine cost too, mapped via the same
`STATIONS[code].line` → `LINE_ID_TO_WORKSHOP` lookup already built for
Labour Cost.

**Verification**: exported the real seed `machines.csv`/`machine_rates.csv`
and ran the new `parseMachines`/`parseRateHistory`/`resolveRateAsOf`
functions (now exported from `useScoreboardData.js`) against them via a
Node harness — 205 machines / 120 rate rows parsed correctly, rate
resolution correctly returns `null` for a date before the program started
and the correct rate within the valid window, and the computed absorption
total at 480h cross-checked by hand (sum of raw rates × 480) to the exact
UGX. Browser-verified in-app: `kmc.super` shows both Supervisor and Cost
Estimations Engineer sections; `kmc.cee` shows only Cost Estimation; a
plain `kmc` user shows neither; all 3 Cost Estimation tabs render and
degrade gracefully with no live data yet; DPN Scoreboard renders fine with
the reworked 3-component cost total. **Not verified**: an actual write
(add machine / rate) succeeding — blocked on the Apps Script redeploy, same
as NCR/Handover.

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

## ✅ RESOLVED 2026-08-02: Apps Script — see top-of-file section for the real story

This section originally claimed "two projects, wrong one keeps getting
redeployed." That model was wrong — see the "✅ RESOLVED 2026-08-02: the
real Apps Script problem" section at the top of this file for what was
actually going on (a write/read sheet mismatch, not a deployment mixup) and
what was fixed. Kept here only so old links to this heading don't 404.

**Verification snippet still valid** — run this any time to confirm the
live script is current (now checks for `canAccessTracker`+`roles`, same as
before):

```js
fetch('https://script.google.com/macros/s/AKfycbyHsyDOXkIURCTNrsxl4MbUVhqZxNco0qz1Bl95UePnesSQgnbJlfyIuiy7FkuAOH_q/exec', {
  method: 'POST', body: new URLSearchParams({ action: 'listDynamicUsers', token: 'kmcisgood' })
}).then(r => r.json()).then(j => console.log(j.users[0]));
```

NCR Register writes, Shift Handover writes, and the per-user Bus Tracker
access toggle are now expected to actually persist — re-verify in the app
if anything still looks stuck.

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
| Main tracker | `1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es` | Travel Card, Catalog, MOC, NCR, Handover, Machine Cost — every gviz read in the app targets this sheet, and (as of the 2026-08-02 fix) every write does too |
| Private (access control) | `1TS2xV3kDIOlQ9W1-j-P9DExvt5lNZhLX6xeeuLX9BNA` ("Password manager for Bus Tracker" / "KMC Tracker — Access & Users (Private)") | Access Requests + Dynamic Users (passwords) — never publicly shared. **This is also where the live Apps Script project is container-bound** (Script ID `1MdmeSsq6IE22UKxz5IV8__c8bvFArpW7oXGA72BeAmaffQ54wKirTBLD`, named "Password masterdata" — open it via Extensions → Apps Script from inside *this* sheet, not the main tracker) |
| DPN Scoreboard | `1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs` (`KMC_Department_Monthly_Scoreboard`) | Standalone — now wired up for real, see section above |

**To redeploy the live script in future**: `clasp` (Google's Apps Script
CLI) is installed on this machine and was authenticated as
`xcellencysehj@gmail.com` on 2026-08-02 (`clasp login`, token in
`~/.clasprc.json` — may need re-auth if expired). From a folder with
`.clasp.json` pointing at Script ID `1MdmeSsq6IE22UKxz5IV8__c8bvFArpW7oXGA72BeAmaffQ54wKirTBLD`
(`clasp clone-script <id>` to set one up fresh): edit `Code.js`, `clasp push`,
then `clasp deploy -i AKfycbyHsyDOXkIURCTNrsxl4MbUVhqZxNco0qz1Bl95UePnesSQgnbJlfyIuiy7FkuAOH_q`
to update the *existing* live deployment (same `/exec` URL) rather than
`clasp deploy` alone, which would create a brand-new URL nothing points to.
No more manual copy-paste into the browser editor needed.

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

1. Spot-check NCR, Handover, and tracker-access writes for real in the app
   (not just the machine-cost round-trip already verified) now that the
   write-target fix is live — should all persist to `NI Travel Tool Data`
   correctly.
2. Decide what to do with the ~18-26 orphaned rows sitting in the private
   sheet's `submissions`/`activities`/`resources`/`operators`/`projects`
   tabs (real historical data the write-target bug misdirected there) —
   migrate by hand or leave as an archived record.
3. Add `machines`/`machine_rates`/`staff_rates`/`energy_rates` tabs to
   `NI Travel Tool Data` itself (currently only exist as a static copy on
   the DPN Scoreboard workbook) so the CEE screen's writes have somewhere
   real to land.
