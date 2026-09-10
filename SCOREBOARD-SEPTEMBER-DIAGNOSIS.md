# Why September didn't show on the DPN Scoreboard

**Date:** 2026-09-08 · **Sheet:** `KMC Department Monthly Scoreboard`
(`1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs`) · **Code:**
`src/hooks/useScoreboardData.js`, `src/components/Scoreboard.jsx`

The September entries **are in the sheet.** Verified against the live gviz feed:
the Tracker carries `01-Sep`, `02-Sep`, `03-Sep` and `04-Sep` actuals, and the
Downtime tab carries the 02-Sep foaming-machine event (1200 min). Nothing was
lost on the way in. Two independent faults hid it on the way out — one in the
web app, one in the workbook's own formulas.

---

## A. App faults (fixed in this change)

### A1 — Production Line Status read 0 / 0 for every line from August onward

**The headline symptom.** The four line cards are scoped to the selected range,
and the range defaults to the current month. The cohort behind each card was
"units whose **plan** window overlaps the range". The Tracker's plan schedule
ends **15-Jul-2026** while the lines are still running, so from 01-Aug onward
*no* unit matched, every card printed `0 / 0 · 0%`, and the September work was
invisible.

Cohort is now "planned for the range **or** actually worked on in it"
(`actualStart … actualEnd`, open-ended while a unit is still on the line), with
`done` counted from that same cohort and gated on `actualEnd` falling inside the
range — so the card still cannot exceed 100%, which was the reason the plan-only
rule existed. `parseLineCompletion` now carries `actualStart` for this.

| Range | Body Shop | Paint | Chassis 02 | Trim & Final |
|---|---|---|---|---|
| Sep 1–8 (before) | 0/0 | 0/0 | 0/0 | 0/0 |
| Sep 1–8 (after) | 1/4 | 0/5 | 1/2 | 1/4 |
| Aug (after) | 4/7 | 11/15 | 9/10 | 6/10 |
| Jul (after) | 10/14 | 8/19 | 9/11 | 13/30 |

### A2 — The Calc tab's workshop table never parsed at all

`parseCalc` tested `cell === 'Workshop'`, but gviz glues a tab's instruction
banner into the same cell as its first heading, so cell A arrives as
`"CALCULATION ENGINE — feeds Dashboard + web scoreboard. Do not edit. Workshop"`.
`workshops` came back **empty**, which is why every line card showed a
constraint of `—`. It now uses the same `headerCellIs` helper the other tabs use.

Second half of the same fix: the table's end was detected by "column A is
blank", but **gviz omits fully-empty rows**, so the blank spacer row the sheet
relies on does not exist in the feed — once the header matched, the loop ran
through the entire KPI dump and left `kv` empty (whole board blank). It now
stops on the first row that isn't shaped like a workshop row.

### A3 — "Critical Activity" always showed `—`

gviz types each column from its majority value and returns anything else blank.
Calc's value column is overwhelmingly numeric, so the one text KPI in it was
never delivered. It is now derived from the workshop table (the same thing the
sheet's own `INDEX/MATCH(MIN(rank))` computes) — reads **Trim & Final Assembly**,
matching the sheet.

### A4 — The default range started a day early (UTC shift)

`defaultRange()` built the month start locally then serialised with
`toISOString()`, which converts to UTC first — in Kampala (UTC+3) that reads
back as the previous day. The board opened on **2026-08-31 → 2026-09-08**,
pulling a day of August into every September figure. Same bug in the rate
`asOf` date and in export filenames. All now use a local-parts formatter.
(The hook already carried this warning in a comment for `parseLineCompletion`;
it just hadn't been applied to these.)

### A5 — Line status colour disagreed with the number shown

Once A2 was fixed, `d.workshops` became non-empty, so the donut colour would
have come from Calc's **program-to-date** `Line Status` while the number beside
it is range-scoped. Status is now derived from the same range figure it labels;
the Calc row still supplies the free-form constraint note.

### A6 — `npm test` ran a stale second copy of the suite

Vitest's default include picked up the full checkout under `.claude/worktrees`,
so the run reported 8 files / 24 tests instead of 3 / 18, failing on code not in
the working tree. `vite.config.js` now excludes `.claude/**` and `tests/**`
(Playwright).

**Regression tests added:** `src/test/scoreboardData.test.js` — 6 tests pinning
the banner-glued header, the missing-spacer-row table end, the Critical Activity
recovery, `actualStart` capture, and Downtime months past the reporting period.

---

## B. Workbook faults — these need fixing in the sheet (no Apps Script involved)

Ordered by impact. Every cell reference below is on the live sheet.

### B1 — The reporting period still ends 31-Jul-2026 · `Targets!B4`

Every period-filtered figure in `Calc` is `SUMIFS/COUNTIFS … >=Targets!B3,
<=Targets!B4`. With B4 at **31-Jul-2026**, all of August and September are
excluded by definition: Downtime, Quality, Safety, Cost, Waste. The 02-Sep
foaming-machine event (**20 hours**, by far the largest downtime on record) does
not reach OEE, MTTR, MTBF or "Unplanned Downtime", and the 12-Aug unsafe
condition shows only in the YTD column.

**Fix:** set `Targets!B4` to the real period end (e.g. `30-Sep-2026`), and keep
it moving each month.

### B2 — Daily Output stops at 10-Jun-2026

The date column is a fill-down chain (`=IF(OR(A33="",A33+1>Targets!$B$4),"",A33+1)`)
that was **only filled to row 34**. The tab therefore covers 11-May → 10-Jun and
nothing since, even though its own note says "automatic, no data entry needed".

Everything downstream is bounded to that 31-row window:

| Cell | KPI | Currently reads |
|---|---|---|
| `Calc!B21` | Buses per Day (period) | **0.014** → board shows *Rate (Takt) 0.0/day* |
| `Calc!B52` | Performance (OEE factor) | **11%** → drags OEE down to 10% |
| `Calc!B81` | Waste per Unit | divides by 1 |
| `Dashboard!F24/F25/F26` | This Week Output | permanently 0 |

**Fix:** select `A34:F34`, fill down to **row 85** for the current period
(11-May → 31-Jul = 82 days), or **row 146** if B4 moves to 30-Sep. Then widen
the ranges that read it — `Calc!B21`, `B52`, `B81` and `Dashboard!F24:F26` all
hard-code `$4:$34`; make them `$4:$400`.

### B3 — Downtime totals skip rows 4–7 · `Calc!B37:B44`, `B47`

Every downtime formula reads `Downtime!$E$8:$E$120` / `$A$8:$A$120`, but the
Downtime tab's data starts at **row 4**. The 25-Jun Compressor event (20 min,
Quality Inspection & Testing) is outside the range and invisible.

**Fix:** change `$8` to `$4` in `Calc!B37`, `B38:B44` and `B47`.

### B4 — `Downtime!A4` is text, not a date

`25/06/2026` was typed as text while the rest of the column holds real dates.
gviz returns it as **blank** (so the app's downtime trend misses it too) and
`SUMIFS` cannot compare it. **Fix:** retype A4 as a real date. Combined with B3
this moves Unplanned Downtime from 2.53 h to 2.87 h.

### B5 — `Downtime!B16` (the 02-Sep event) has no Workshop

The 1200-minute foaming-machine entry has an empty Workshop cell, so it can
never be attributed to a line. **Fix:** fill it in.

### B6 — Three `LOOKUP(2,1/(range<>""))` cells return 0 despite live data

`Calc!B79` (Energy per Unit) returns **0** while `Environment!F5` holds
**2040**; `Calc!B83` and `Dashboard!F26` (Cumulative Gap) do the same. The idiom
is not resolving in this workbook.

**Fix:** replace with the last-numeric form, e.g.
`=IFERROR(LOOKUP(9.99E+307,Environment!$F$4:$F$40),0)`.

### B7 — Formula columns that were overwritten with typed constants

These cells hold static values that currently *happen* to look right and will
silently freeze as the data changes:

- `Calc!H5:H11` — **Line Status**. Only `H4` still has the formula.
- `Calc!J5:J11` — **(rank)**, which `Calc!B32` (Critical Activity) ranks on.
  Only `J4` still has the formula.
- `Environment!F5` — **Energy per Unit (auto)**. Only `F4` still has the formula.

**Fix:** fill `H4`, `J4` and `Environment!F4` down over their columns.

### B8 — Tabs that are not doing their job

- **Quality** — completely empty. First Pass Yield, Rework Hrs/Unit, Critical
  Defects, Defects per Vehicle and Open Defects all read 0 because *nothing has
  ever been logged*, not because quality is perfect. The board's FPY trend says
  "not enough monthly history". QIT needs one row per inspection.
- **Cost** — `E13:E21` (Jul, Aug, Sep Actuals) are all 0 against real budgets.
  Once B1 extends the period, Variance will read ≈ −100% for those months.
- **Bottlenecks**, **ECR**, **Waste** — empty. Fine if genuinely nil, but note
  Open Bottlenecks = 0 is what makes every line's Constraint read "None".
- **Environment** — both logged months are flagged PARTIAL in their own Notes
  (one week each), so Energy per Unit is not comparable month to month.
- **Cost Inputs** — superseded by the Machine Cost module's rate history on the
  main sheet; its three rates are all 0 and nothing reads them any more.

Tabs verified as working correctly: **README**, **Dashboard** (fully
formula-driven off Calc), **Targets**, **Tracker**, **Safety**, **Kaizen**.

---

## C. Unrelated, noticed while assessing

1. **A live Gmail app password is committed to git.** `.env` is listed in
   `.gitignore` but was added to the index before that, so it is still tracked
   and `EMAIL_PASS` sits in the history. Rotate the app password, then
   `git rm --cached .env`.
2. **`src/test/Login.test.jsx` — 5 failing tests, pre-existing.** They assert
   hard-coded credentials; `Login.jsx` now resolves users through
   `useDynamicUsers`, so the tests need that hook mocked. Not touched here.
3. **Operational Cost per Line looks lopsided** — Paint Shop 453,271 against
   6–54k elsewhere. That is the Machine Cost absorption model (rate × Available
   Hours for every registered machine at the station), not a scoreboard parsing
   bug, but worth a look at the machine registry.
4. **Untracked clutter in the repo** — `public.rar`,
   `KMC_Department_Monthly_Scoreboard.xlsx`, and two
   `DPN_July_2026_Scoreboard_LOGO_UPDATED*.html` copies under `src/components/`
   that are stale forks of the board.
