# Apps Script — complete script (catalog + submissions + analysis fields + access/users)

This is the full, ready-to-paste Apps Script. It merges:
- your existing travel-card submission logic,
- the **catalog save** branch (token-protected, chunked so large catalogs don't
  hit Google's 50,000-char single-cell limit),
- **automatic catalog backups** — every `saveCatalog` snapshots whatever was in
  the `Catalog` tab into `Catalog_Backups` *before* overwriting it,
- **MOC Register** create/update (`saveMOC`/`updateMOC`), writing to a new
  `moc` tab,
- the **new analysis fields** (break/gross time, per-cause delay minutes, custom
  causes, added activities) written into the submission sheets, and
- **Access Requests + Dynamic Users** (`login`, `submitAccessRequest`,
  `listAccessRequests`, `updateAccessRequest`, `deleteAccessRequest`,
  `listDynamicUsers`, `createDynamicUser`, `updateDynamicUser`,
  `deleteDynamicUser`) — this is what makes sign-up requests and granted
  accounts visible across every device instead of being stuck in one browser's
  localStorage.

## Steps
1. The **`Catalog`** tab already exists (key | value). ✅
2. Admin actions are authorised by a signed **session** issued at login — there
   is no shared token to keep in sync any more (see "Sign-in hardening" below).
3. **Create a new, separate Google Sheet** for access requests and dynamic
   users — call it e.g. "KMC Tracker — Access & Users (Private)". **Do not
   change its sharing settings** (leave it owner-only / private). This is
   deliberate: unlike the main tracker sheet (shared "anyone with the link can
   view", fine for catalog data), access requests and user records contain
   plaintext passwords, so they must live somewhere nobody can open by just
   having a link. Apps Script can still read/write it — script access doesn't
   depend on the sheet's sharing settings, only on the deploying account
   owning/editing it.
4. Copy that new sheet's ID out of its URL
   (`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`) and paste
   it into `PRIVATE_SHEET_ID` near the top of the script below.
5. Replace your entire Apps Script with the code below.
6. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.**
   This keeps the same `/exec` URL so nothing else changes.
7. The **`Catalog_Backups`**, **`AccessRequests`**, and **`DynamicUsers`** tabs
   are all created automatically on first use — nothing to set up by hand
   beyond the private sheet itself.

**Passwords never leave the server.** `listDynamicUsers` and `login` both
strip the password field before responding — the browser never receives it,
even for an authenticated admin session. Editing a user's other fields
(role, stations, etc.) without setting a new password leaves the stored
password untouched server-side.

> Reads use the public gviz CSV of the `Catalog` tab; the front-end reassembles
> the chunked rows. Writes are token-checked here.

## Sign-in hardening (2026-09-29)
The repository is public, and it used to contain every login password
(`Login.jsx`) and the shared admin token. Both are gone from the code:
- **Every** account, including the ten that used to be built in, is checked by
  this script against the private sheet (passwords hashed). Login returns a
  signed session (12 h, or 30 days with "Keep me signed in").
- Catalog / user / access-request actions need a session whose account is
  `systemadmin` or `useradmin`. The role is re-checked on every call, so
  deleting or demoting an account ends its sessions immediately.
- 5 wrong passwords lock that username for 10 minutes.

**Switch-over order (do not skip steps):**
1. Paste the new script and deploy a **new version** (the old site keeps working:
   the old shared token is still accepted for now).
2. In the editor pick `seedBuiltInAccounts` → Run → open **Execution log** and copy
   the 10 new passwords (shown once). Give them to the right people.
3. Deploy the new site (push to `main`). Sign in as `systemadmin` to check.
4. Pick `disableLegacyToken` → Run. The old shared token stops working.

## 2026-09-29 update — downtime was not being saved
- The app sends `hasDowntime` / `downtime`, but the script only read
  `hasOverrun` / `overrun`, so from 2026-06-25 every downtime analysis was
  dropped and `has_overrun` was written `NO`. The script now accepts both, and
  also stores the RCA method, 5 whys, preventive action and evidence file name.
- Travel-card rows are now written **by column name**, not position. Older
  script versions had left the live tabs with data under blank headings
  (`activities` column H, `overruns` M/N). `repairLegacyColumns()` fixes those
  once — it runs automatically on the first submission after deploying (or run
  it by hand from the editor).
- Removed preset consumables fill the existing `resources.is_removed` column.
- Shared station consumables: `addStationConsumable` / `deleteStationConsumable`.

## Recovering a bad catalog save
Every `saveCatalog` call backs up the *previous* catalog first, so a bad write
is always one restore away — no need to dig through Sheets Version History.
- **From the Catalog Admin UI**: open the *Backups* tab, pick a snapshot, click
  Restore.
- **Manually, from Apps Script**: run `restoreCatalogBackup_("<ISO timestamp>")`
  from the editor, or POST `action=restoreCatalogBackup&token=...&backupId=...`
  to the `/exec` URL. Use `listCatalogBackups_()` (or `action=listCatalogBackups`)
  to see available snapshot ids first.
- Restoring itself snapshots the current (bad) state first, so a restore can
  always be undone by restoring again.

```javascript
const TRACKER_SHEET_ID = "1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es";
const TRACKER_TAB_NAME = "Travel Card Data";

// ── Authentication ────────────────────────────────────────────────────────────
// Admin actions (catalog, users, access requests) require a signed SESSION issued
// by login_ to an account whose role is in ADMIN_ROLES — the browser never holds
// a shared secret any more. One-time switch-over steps are in this document
// under "Sign-in hardening".
const ADMIN_ROLES = ["systemadmin", "useradmin"];
// The old shared token, kept ONLY so the currently-deployed site keeps working
// until the new site is live. Run disableLegacyToken() once after that.
const LEGACY_ADMIN_TOKEN = "kmcisgood";

// Every saveCatalog snapshots the outgoing (about-to-be-overwritten) catalog
// into this tab first, so a bad write is always recoverable without relying
// on Sheets' Version History. Snapshots are pruned to the most recent N.
const CATALOG_BACKUP_TAB = "Catalog_Backups";
const CATALOG_BACKUP_MAX = 20;

// ── Access Requests / Dynamic Users — PRIVATE spreadsheet ────────────────────
// These carry plaintext applicant/user passwords, so they live in a SEPARATE
// spreadsheet that is NOT shared "anyone with the link" (unlike the main
// tracker sheet). Apps Script can read/write it regardless of its own sharing
// settings because the script runs under the deploying account's authority.
// Create a new blank Google Sheet, leave its sharing at the default
// (owner-only), and paste its ID here.
const PRIVATE_SHEET_ID = "1TS2xV3kDIOlQ9W1-j-P9DExvt5lNZhLX6xeeuLX9BNA";

const ACCESS_REQUESTS_TAB = "AccessRequests";
const ACCESS_REQUESTS_HEADERS = [
  "id", "full_name", "email", "username", "department", "production_lines",
  "position", "password", "reason", "status", "submitted_at",
  "assigned_username", "assigned_role", "processed_at",
  // Applicant's own station picks (optional, JSON array of codes) — the
  // admin's Access Requests screen preselects these on open, and can still
  // add/remove before approving. Appended at the end, existing rows unaffected.
  "preferred_stations",
  // Applicant flagged interest in CEE (Cost Estimations Engineer) access —
  // a supplementary role granted independent of the primary role, same as
  // "preferred_stations" this is a hint the admin can act on or ignore.
  "cee_interest",
];

const DYNAMIC_USERS_TAB = "DynamicUsers";
const DYNAMIC_USERS_HEADERS = [
  "username", "password", "role", "domain", "landing", "full_name", "email",
  "department", "production_line", "production_lines", "position", "created_at",
  "assigned_station", "assigned_line", "assigned_lines", "assigned_stations",
  "can_access_tracker",
  // "roles" (plural) is a SUPPLEMENTARY list layered on top of "role" (the
  // primary/legacy field every existing role check still uses) — lets one
  // person hold more than one role, e.g. a supervisor who's also a Cost
  // Estimations Engineer, without touching any existing role === 'x' check
  // elsewhere in the app. Appended at the end so column positions for every
  // existing field stay unchanged for already-live user rows.
  "roles",
];

function privateSs_() {
  return SpreadsheetApp.openById(PRIVATE_SHEET_ID);
}

function doPost(e) {
  try {
    // ── Login (public — the password itself is the credential) ────────────────
    if (e && e.parameter && e.parameter.action === "login") {
      return login_(e.parameter.username, e.parameter.password, e.parameter.remember === "1");
    }

    // ── Access requests ─────────────────────────────────────────────────────────
    if (e && e.parameter && e.parameter.action === "submitAccessRequest") {
      return submitAccessRequest_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "listAccessRequests") {
      if (!isAdminRequest_(e.parameter)) return response({ status: "error", message: "unauthorized" });
      return listAccessRequests_();
    }
    if (e && e.parameter && e.parameter.action === "updateAccessRequest") {
      if (!isAdminRequest_(e.parameter)) return response({ status: "error", message: "unauthorized" });
      return updateAccessRequest_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "deleteAccessRequest") {
      if (!isAdminRequest_(e.parameter)) return response({ status: "error", message: "unauthorized" });
      return deleteAccessRequest_(e.parameter.id);
    }

    // ── Dynamic users ────────────────────────────────────────────────────────────
    if (e && e.parameter && e.parameter.action === "listDynamicUsers") {
      if (!isAdminRequest_(e.parameter)) return response({ status: "error", message: "unauthorized" });
      return listDynamicUsers_();
    }
    if (e && e.parameter && e.parameter.action === "createDynamicUser") {
      if (!isAdminRequest_(e.parameter)) return response({ status: "error", message: "unauthorized" });
      return createDynamicUser_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "updateDynamicUser") {
      if (!isAdminRequest_(e.parameter)) return response({ status: "error", message: "unauthorized" });
      return updateDynamicUser_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "deleteDynamicUser") {
      if (!isAdminRequest_(e.parameter)) return response({ status: "error", message: "unauthorized" });
      return deleteDynamicUser_(e.parameter.username);
    }

    // ── Catalog save branch (admin only) ──────────────────────────────────────
    if (e && e.parameter && e.parameter.action === "saveCatalog") {
      if (!isAdminRequest_(e.parameter)) {
        return response({ status: "error", message: "unauthorized" });
      }
      return saveCatalog_(e.parameter.payload);
    }

    // ── Catalog backup admin: list / restore ──────────────────────────────────
    if (e && e.parameter && e.parameter.action === "listCatalogBackups") {
      if (!isAdminRequest_(e.parameter)) {
        return response({ status: "error", message: "unauthorized" });
      }
      return listCatalogBackups_();
    }
    if (e && e.parameter && e.parameter.action === "restoreCatalogBackup") {
      if (!isAdminRequest_(e.parameter)) {
        return response({ status: "error", message: "unauthorized" });
      }
      return restoreCatalogBackup_(e.parameter.backupId);
    }

    // ── NCR Register (src/hooks/useNCRData.js sends action as a top-level
    // form param, same style as catalog/access actions) ───────────────────────
    if (e && e.parameter && e.parameter.action === "saveNCR") {
      return saveNCR_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "updateNCR") {
      return updateNCR_(e.parameter.payload);
    }

    // ── Station consumables (src/hooks/useStationConsumables.js) — plain form
    // params, no payload, so an older deployment rejects them harmlessly ────
    if (e && e.parameter && e.parameter.action === "addStationConsumable") {
      return addStationConsumable_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === "deleteStationConsumable") {
      return deleteStationConsumable_(e.parameter);
    }

    // Every other write (MOC, Handover, and future modules) sends its action
    // *inside* the payload JSON rather than as a top-level form param — parse
    // once and route on it before assuming this is a travel-card submission.
    const data = JSON.parse(e.parameter.payload);

    if (data && data.action === "saveMOC")        return saveMOC_(data);
    if (data && data.action === "updateMOC")      return updateMOC_(data);
    if (data && data.action === "saveHandover")   return saveHandover_(data);
    if (data && data.action === "updateHandover") return updateHandover_(data);

    // ── Machine Cost Database (Cost Estimation module) ──────────────────────
    if (data && data.action === "saveMachine")      return saveMachine_(data);
    if (data && data.action === "updateMachine")    return updateMachine_(data);
    if (data && data.action === "saveMachineRate")  return saveMachineRate_(data);
    if (data && data.action === "saveStaffRate")    return saveStaffRate_(data);
    if (data && data.action === "saveEnergyRate")   return saveEnergyRate_(data);

    // ── Submission edits — both a general user editing their own pending
    // card (requireStillPending + _fullEdit, rewrites activities/resources/
    // operators too) and a supervisor's review decision (reviewOnly, just
    // patches reviewer/approvalStatus/reviewDate/reviewComments) go through
    // the same action. See updateSubmission_ below.
    if (data && data.action === "updateSubmission") return updateSubmission_(data);

    // ── Daily Activities Log (Bus Sightings) — supervisor's own independent
    // record of "bus X was at station Y on day Z", deliberately NOT derived
    // from Travel Card data, so it can be used to cross-check it.
    if (data && data.action === "saveBusSighting")   return saveBusSighting_(data);
    if (data && data.action === "deleteBusSighting") return deleteBusSighting_(data);

    // ── Travel-card submission (existing, default) ────────────────────────────
    const ss        = SpreadsheetApp.openById(TRACKER_SHEET_ID);
    const trackerSs = SpreadsheetApp.openById(TRACKER_SHEET_ID);
    const id        = Utilities.getUuid();

    ensureLegacyRepair_(); // one-time: label/move columns older versions left unlabelled
    writeSubmission(ss, data, id);
    writeActivities(ss, data, id);
    writeResources(ss, data, id);
    if (downtimeOf_(data).has) {
      writeOverrun(ss, data, id);
      writeOverrunCauses(ss, data, id);
    }
    writeOperators(ss, data, id);
    writeProjects(ss, data);
    writeTrackerLog(trackerSs, data, id);

    return response({ status: "ok", id });
  } catch (err) {
    return response({ status: "error", message: err.message });
  }
}

function doGet() {
  return response({ status: "ok", message: "KMC Travel Card endpoint is live." });
}

// ── Catalog: store JSON across chunked rows (50k char/cell limit) ────────────
function saveCatalog_(payload) {
  try { JSON.parse(payload); }
  catch (err) { return response({ status: "error", message: "bad-json" }); }

  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  let sh = ss.getSheetByName("Catalog");
  if (!sh) sh = ss.insertSheet("Catalog");

  backupCatalog_(ss, sh); // snapshot whatever is there NOW before it's overwritten

  sh.clear();
  sh.getRange("A1:B1").setValues([["key", "value"]]);

  const CHUNK = 45000;
  const rows = [];
  for (let i = 0, n = 0; i < payload.length; i += CHUNK, n++) {
    rows.push([n === 0 ? "catalog" : "catalog." + n, payload.slice(i, i + CHUNK)]);
  }
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
  return response({ status: "ok", chunks: rows.length });
}

// Copy the Catalog tab's current key/value rows into Catalog_Backups, tagged
// with an ISO timestamp backup_id, before they get overwritten. Skips empty/
// blank catalogs (nothing worth backing up) and prunes to the most recent
// CATALOG_BACKUP_MAX snapshots so the tab doesn't grow unbounded.
function backupCatalog_(ss, catalogSh) {
  const data = catalogSh.getDataRange().getValues(); // [[key,value], ...] incl. header
  const body = data.slice(1).filter(r => String(r[0]).trim() !== "" || String(r[1]).trim() !== "");
  if (!body.length) return; // nothing to back up (new/empty catalog)

  let bsh = ss.getSheetByName(CATALOG_BACKUP_TAB);
  if (!bsh) {
    bsh = ss.insertSheet(CATALOG_BACKUP_TAB);
    bsh.appendRow(["backup_id", "key", "value"]);
    const hdr = bsh.getRange(1, 1, 1, 3);
    hdr.setBackground("#1D9E75");
    hdr.setFontColor("#ffffff");
    hdr.setFontWeight("bold");
    bsh.setFrozenRows(1);
  }

  const backupId = new Date().toISOString();
  const rows = body.map(r => [backupId, r[0], r[1]]);
  bsh.getRange(bsh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);

  pruneCatalogBackups_(bsh);
}

// Keep only the most recent CATALOG_BACKUP_MAX snapshots (grouped by backup_id).
function pruneCatalogBackups_(bsh) {
  const data = bsh.getDataRange().getValues();
  const ids = [...new Set(data.slice(1).map(r => r[0]))].sort(); // oldest → newest
  if (ids.length <= CATALOG_BACKUP_MAX) return;
  const drop = new Set(ids.slice(0, ids.length - CATALOG_BACKUP_MAX));
  const kept = [data[0]].concat(data.slice(1).filter(r => !drop.has(r[0])));
  bsh.clearContents();
  bsh.getRange(1, 1, kept.length, 3).setValues(kept);
}

// List available backup_ids, newest first — lets the admin UI show a picker.
function listCatalogBackups_() {
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const bsh = ss.getSheetByName(CATALOG_BACKUP_TAB);
  if (!bsh) return response({ status: "ok", backups: [] });
  const data = bsh.getDataRange().getValues();
  const ids = [...new Set(data.slice(1).map(r => r[0]))].sort().reverse();
  return response({ status: "ok", backups: ids });
}

// Restore the Catalog tab from a given backup_id snapshot. Does NOT delete
// the backup itself, so a bad restore can be undone by restoring again.
function restoreCatalogBackup_(backupId) {
  if (!backupId) return response({ status: "error", message: "missing-backup-id" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const bsh = ss.getSheetByName(CATALOG_BACKUP_TAB);
  if (!bsh) return response({ status: "error", message: "no-backups" });

  const data = bsh.getDataRange().getValues();
  const rows = data.slice(1).filter(r => r[0] === backupId).map(r => [r[1], r[2]]);
  if (!rows.length) return response({ status: "error", message: "backup-not-found" });

  let sh = ss.getSheetByName("Catalog");
  if (!sh) sh = ss.insertSheet("Catalog");
  backupCatalog_(ss, sh); // snapshot current state too, in case the restore itself needs undoing

  sh.clear();
  sh.getRange("A1:B1").setValues([["key", "value"]]);
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  return response({ status: "ok", restored: backupId, rows: rows.length });
}

// ── MOC Register — create + update ────────────────────────────────────────────
// Mirrors the shape src/hooks/useMOCData.js expects back out of the "moc" tab.
function saveMOC_(d) {
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "moc", [
    "moc_id", "timestamp", "requested_by", "department", "change_title",
    "change_type", "change_status", "expiry_date", "tier", "description",
    "justification", "potential_hazards", "safeguards_compromised",
    "associated_actions", "supervisor_name", "supervisor_date", "hod_name",
    "hod_date", "exec_name", "exec_date", "training_required",
    "procedures_update", "drawings_update", "pssr_completed", "pssr_date",
    "closure_comments", "closure_date", "status",
  ]);
  const id = Utilities.getUuid();
  sh.appendRow([
    id, d.timestamp || new Date().toISOString(), d.requestedBy || "", d.department || "",
    d.changeTitle || "", d.changeType || "", d.changeStatus || "", d.expiryDate || "",
    d.tier || "", d.description || "", d.justification || "", d.potentialHazards || "",
    d.safeguardsCompromised || "", d.associatedActions || "", d.supervisorName || "",
    d.supervisorDate || "", d.hodName || "", d.hodDate || "", d.execName || "",
    d.execDate || "", d.trainingRequired || "", d.proceduresUpdate || "",
    d.drawingsUpdate || "", d.pssrCompleted || "", d.pssrDate || "",
    d.closureComments || "", d.closureDate || "", d.status || "Pending Supervisor",
  ]);
  return response({ status: "ok", id });
}

// Patches only the fields present on the incoming payload — e.g. each
// approval stage sends just that stage's name/date + the new status.
function updateMOC_(d) {
  if (!d.id) return response({ status: "error", message: "missing-id" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = ss.getSheetByName("moc");
  if (!sh) return response({ status: "error", message: "no-moc-sheet" });

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const idCol = headers.indexOf("moc_id");
  if (idCol === -1) return response({ status: "error", message: "bad-sheet-shape" });

  const fieldMap = {
    status: "status", supervisorName: "supervisor_name", supervisorDate: "supervisor_date",
    hodName: "hod_name", hodDate: "hod_date", execName: "exec_name", execDate: "exec_date",
    trainingRequired: "training_required", proceduresUpdate: "procedures_update",
    drawingsUpdate: "drawings_update", pssrCompleted: "pssr_completed", pssrDate: "pssr_date",
    closureComments: "closure_comments", closureDate: "closure_date",
  };

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === d.id) {
      const rowNum = i + 1;
      Object.entries(fieldMap).forEach(([key, col]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(col);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
        }
      });
      return response({ status: "ok", id: d.id });
    }
  }
  return response({ status: "error", message: "moc-not-found" });
}

// ── NCR Register — create + update ────────────────────────────────────────────
// Column order matches the LIVE "ncrs" tab exactly (verified against real
// data) — do not reorder without also updating src/hooks/useNCRData.js's
// column-name matching.
const NCR_HEADERS = [
  "record_id", "ncr_id", "date", "domain", "type", "severity", "vin",
  "project", "station", "description", "root_cause", "corrective_action",
  "raised_by", "status", "due_date", "closed_date", "timestamp",
];

function saveNCR_(payload) {
  let d;
  try { d = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "ncrs", NCR_HEADERS);

  // Human-readable sequential ID: NCR-YYYY-NNN
  const year = new Date().getFullYear();
  const existingRows = Math.max(sh.getLastRow() - 1, 0);
  const ncrId = "NCR-" + year + "-" + String(existingRows + 1).padStart(3, "0");
  const recordId = Utilities.getUuid();
  const now = new Date().toISOString();

  sh.appendRow([
    recordId, ncrId, (now.slice(0, 10)), d.domain || "", d.ncrType || "",
    d.severity || "", d.vin || "", d.project || "", d.stationCode || "",
    d.description || "", d.rootCause || "", d.correctiveAction || "",
    d.raisedBy || "", d.status || "Open", d.dueDate || "", d.closedDate || "", now,
  ]);
  return response({ status: "ok", ncrId });
}

// Patches only the fields present on the payload, matched by ncr_id.
function updateNCR_(payload) {
  let d;
  try { d = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  if (!d.ncrId) return response({ status: "error", message: "missing-ncr-id" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = ss.getSheetByName("ncrs");
  if (!sh) return response({ status: "error", message: "no-ncrs-sheet" });

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const idCol = headers.indexOf("ncr_id");
  const fieldMap = {
    status: "status", correctiveAction: "corrective_action",
    dueDate: "due_date", closedDate: "closed_date",
  };

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === d.ncrId) {
      const rowNum = i + 1;
      Object.entries(fieldMap).forEach(([key, colName]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(colName);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
        }
      });
      return response({ status: "ok", ncrId: d.ncrId });
    }
  }
  return response({ status: "error", message: "ncr-not-found" });
}

// ── Machine Cost Database — machines + time-bounded rate history ─────────────
// Machines are soft-deleted (active:false) via updateMachine_, never removed,
// since a machine with rate history in "machine_rates" would otherwise be
// orphaned. Rates (machine/staff/energy) are append-only — editing a rate
// means adding a new row with a new valid_from, not overwriting the old one,
// so a rate change never retroactively rewrites past costing.
const MACHINE_HEADERS = [
  "record_id", "station_code", "activity", "machine_name", "active",
  "created_at", "created_by",
];
const MACHINE_RATE_HEADERS = [
  "record_id", "machine_id", "rate_ugx_per_hour", "valid_from", "valid_to",
  "created_at", "created_by",
];
const STAFF_RATE_HEADERS = [
  "record_id", "rate_ugx_per_hour", "valid_from", "valid_to", "created_at", "created_by",
];
const ENERGY_RATE_HEADERS = [
  "record_id", "rate_ugx_per_kwh", "valid_from", "valid_to", "created_at", "created_by",
];

function saveMachine_(d) {
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "machines", MACHINE_HEADERS);
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  sh.appendRow([
    id, d.stationCode || "", d.activity || "", d.machineName || "",
    "TRUE", now, d.createdBy || "",
  ]);
  return response({ status: "ok", id });
}

// Patches name/activity, or archives (active:false) — never a hard delete,
// so existing machine_rates rows always still resolve to a real machine.
function updateMachine_(d) {
  if (!d.id) return response({ status: "error", message: "missing-id" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = ss.getSheetByName("machines");
  if (!sh) return response({ status: "error", message: "no-machines-sheet" });
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const idCol = headers.indexOf("record_id");
  const fieldMap = { activity: "activity", machineName: "machine_name" };
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === d.id) {
      const rowNum = i + 1;
      Object.entries(fieldMap).forEach(([key, col]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(col);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
        }
      });
      if (d.active !== undefined) {
        const colIdx = headers.indexOf("active");
        if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d.active ? "TRUE" : "FALSE");
      }
      return response({ status: "ok", id: d.id });
    }
  }
  return response({ status: "error", message: "machine-not-found" });
}

function saveMachineRate_(d) {
  if (!d.machineId) return response({ status: "error", message: "missing-machine-id" });
  if (d.rate === undefined || d.rate === null || d.rate === "") {
    return response({ status: "error", message: "missing-rate" });
  }
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "machine_rates", MACHINE_RATE_HEADERS);
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  sh.appendRow([
    id, d.machineId, Number(d.rate), d.validFrom || now.slice(0, 10), d.validTo || "",
    now, d.createdBy || "",
  ]);
  return response({ status: "ok", id });
}

function saveStaffRate_(d) {
  if (d.rate === undefined || d.rate === null || d.rate === "") {
    return response({ status: "error", message: "missing-rate" });
  }
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "staff_rates", STAFF_RATE_HEADERS);
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  sh.appendRow([id, Number(d.rate), d.validFrom || now.slice(0, 10), d.validTo || "", now, d.createdBy || ""]);
  return response({ status: "ok", id });
}

function saveEnergyRate_(d) {
  if (d.rate === undefined || d.rate === null || d.rate === "") {
    return response({ status: "error", message: "missing-rate" });
  }
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "energy_rates", ENERGY_RATE_HEADERS);
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  sh.appendRow([id, Number(d.rate), d.validFrom || now.slice(0, 10), d.validTo || "", now, d.createdBy || ""]);
  return response({ status: "ok", id });
}

// ── Shift Handover — create + acknowledge ─────────────────────────────────────
// Column order matches src/hooks/useHandoverData.js's parseHandoverCSV column
// matching exactly. The "handovers" tab doesn't exist yet in the tracker
// sheet — it's created fresh here on first submission.
const HANDOVER_HEADERS = [
  "handover_id", "timestamp", "shift_date", "shift", "line",
  "outgoing_supervisor", "incoming_supervisor", "work_completed",
  "outstanding_work", "buses_in_progress", "safety_issues", "quality_issues",
  "equipment_status", "housekeeping", "actions_next_shift", "notes",
  "acknowledged_by", "acknowledged_date", "status",
];

function saveHandover_(d) {
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "handovers", HANDOVER_HEADERS);
  const id = Utilities.getUuid();
  sh.appendRow([
    id, d.timestamp || new Date().toISOString(), d.shiftDate || "", d.shift || "",
    d.line || "", d.outgoingSupervisor || "", d.incomingSupervisor || "",
    d.workCompleted || "", d.outstandingWork || "", d.busesInProgress || "",
    d.safetyIssues || "", d.qualityIssues || "", d.equipmentStatus || "",
    d.housekeeping || "", d.actionsNextShift || "", d.notes || "",
    "", "", d.status || "Open",
  ]);
  return response({ status: "ok", id });
}

// Patches only the fields present on the payload, matched by handover_id.
function updateHandover_(d) {
  if (!d.handoverId) return response({ status: "error", message: "missing-handover-id" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = ss.getSheetByName("handovers");
  if (!sh) return response({ status: "error", message: "no-handovers-sheet" });

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const idCol = headers.indexOf("handover_id");
  const fieldMap = {
    acknowledgedBy: "acknowledged_by", acknowledgedDate: "acknowledged_date",
    status: "status",
  };

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === d.handoverId) {
      const rowNum = i + 1;
      Object.entries(fieldMap).forEach(([key, colName]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(colName);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
        }
      });
      return response({ status: "ok", id: d.handoverId });
    }
  }
  return response({ status: "error", message: "handover-not-found" });
}

function writeTrackerLog(trackerSs, d, id) {
  const sh = trackerSs.getSheetByName(TRACKER_TAB_NAME);
  if (!sh) throw new Error('Tab "' + TRACKER_TAB_NAME + '" not found in tracker sheet.');

  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headerValues = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = headerValues.map(h => String(h).toLowerCase().trim());

  function colIdx(candidates) {
    return headers.findIndex(h => candidates.some(c => h.includes(c)));
  }

  let vinCol       = colIdx(['vin']);
  let modelCol     = colIdx(['bus model', 'model']);
  let stationCol   = colIdx(['station code', 'station_code', 'stationcode']);
  let timestampCol = colIdx(['timestamp', 'time', 'date']);
  let designedCol  = colIdx(['designed time', 'designed_time', 'cycle time']);

  if ([vinCol, modelCol, stationCol, timestampCol].includes(-1)) {
    sh.getRange(1, 1, 1, 5).setValues([['Timestamp', 'VIN', 'Bus Model', 'Station Code', 'Designed Time (min)']]);
    const hdr = sh.getRange(1, 1, 1, 5);
    hdr.setBackground('#1D9E75');
    hdr.setFontColor('#ffffff');
    hdr.setFontWeight('bold');
    sh.setFrozenRows(1);
    timestampCol = 0; vinCol = 1; modelCol = 2; stationCol = 3; designedCol = 4;
  }

  if (designedCol === -1) {
    designedCol = sh.getLastColumn();
    sh.getRange(1, designedCol + 1).setValue('Designed Time (min)');
  }

  const rowWidth = Math.max(sh.getLastColumn(), designedCol + 1);
  const row = new Array(rowWidth).fill('');
  row[timestampCol] = d.clockOut || d.timestamp;
  row[vinCol]       = d.vin;
  row[modelCol]     = d.busModel;
  row[stationCol]   = d.stationCode;
  row[designedCol]  = Number(d.designedTime) || '';
  sh.appendRow(row);
}

// ── Header-aware writes ───────────────────────────────────────────────────────
// Rows are written by COLUMN NAME, not position. The live tabs were created by
// several script versions over time and their columns don't all match (e.g.
// "overruns" has no cause_delays/custom_causes, "activities" had no is_added),
// so positional appendRow() was landing values under the wrong headings. Any
// column a writer needs that the tab lacks is added to the end of row 1;
// columns the tab has but the writer doesn't fill are left blank.
function headerIndex_(sh, wanted) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toLowerCase());
  const missing = wanted.filter(w => headers.indexOf(w) === -1);
  if (missing.length) {
    // Never put a heading on an unlabelled column that already holds data —
    // that data came from an older layout and would be mislabelled (see
    // repairLegacyColumns). New columns go after the last used column instead.
    const lastRow = sh.getLastRow();
    let start = lastCol + 1;
    const firstBlank = headers.findIndex(h => h === "");
    if (firstBlank > -1) {
      const tail = lastRow > 1 ? sh.getRange(2, firstBlank + 1, lastRow - 1, lastCol - firstBlank).getValues() : [];
      const tailHasData = tail.some(r => r.some(v => v !== "" && v !== null));
      if (!tailHasData) start = firstBlank + 1;
    }
    sh.getRange(1, start, 1, missing.length).setValues([missing])
      .setBackground("#1D9E75").setFontColor("#ffffff").setFontWeight("bold");
    missing.forEach((m, i) => { headers[start - 1 + i] = m; });
  }
  return headers;
}

// One-time fix-up of columns earlier script versions wrote without headings.
// Runs automatically on the first submission after deploying (guarded by a
// script property) and is safe to run again by hand from the editor.
//  - activities: column H holds the is_added flag (8-column layout) under a
//    blank heading -> label it.
//  - overruns: the 14-column layout wrote corrective_action / comments into
//    unlabelled M / N while K / L are headed corrective_action / comments ->
//    move them under their headings (only where K / L are empty).
function repairLegacyColumns() {
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const log = [];

  const act = ss.getSheetByName("activities");
  if (act && act.getLastColumn() >= 8 && String(act.getRange(1, 8).getValue()).trim() === ""
      && String(act.getRange(1, 7).getValue()).trim().toLowerCase() === "status") {
    act.getRange(1, 8).setValue("is_added").setBackground("#1D9E75").setFontColor("#ffffff").setFontWeight("bold");
    log.push("activities: labelled column H is_added");
  }

  const ov = ss.getSheetByName("overruns");
  if (ov && ov.getLastColumn() >= 14 && ov.getLastRow() > 1) {
    const hdr = ov.getRange(1, 1, 1, 14).getValues()[0].map(h => String(h).trim().toLowerCase());
    if (hdr[10] === "corrective_action" && hdr[11] === "comments" && hdr[12] === "" && hdr[13] === "") {
      const rng = ov.getRange(2, 11, ov.getLastRow() - 1, 4);
      const vals = rng.getValues();
      let moved = 0;
      vals.forEach(r => {
        if (r[0] === "" && r[1] === "" && (r[2] !== "" || r[3] !== "")) { r[0] = r[2]; r[1] = r[3]; moved++; }
        r[2] = ""; r[3] = "";
      });
      rng.setValues(vals);
      log.push("overruns: moved corrective_action/comments into K/L on " + moved + " row(s)");
    }
  }
  PropertiesService.getScriptProperties().setProperty("legacy_columns_repaired_v1", new Date().toISOString());
  Logger.log(log.join("\n") || "nothing to repair");
  return log;
}
function ensureLegacyRepair_() {
  if (PropertiesService.getScriptProperties().getProperty("legacy_columns_repaired_v1")) return;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (!PropertiesService.getScriptProperties().getProperty("legacy_columns_repaired_v1")) repairLegacyColumns();
  } finally { lock.releaseLock(); }
}
function appendRecords_(sh, headerList, records) {
  if (!records.length) return;
  const headers = headerIndex_(sh, headerList);
  const rows = records.map(rec => headers.map(h => (h in rec && rec[h] !== undefined && rec[h] !== null) ? rec[h] : ""));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

// The app renamed "overrun" to "downtime" (hasDowntime / downtime) in June
// 2026 while this script still only read hasOverrun / overrun, so from
// 2026-06-25 every downtime analysis was silently dropped and has_overrun was
// written "NO". Accept both names.
function downtimeOf_(d) {
  const has = d.hasDowntime !== undefined ? !!d.hasDowntime : !!d.hasOverrun;
  return { has: has, dt: d.downtime || d.overrun || {} };
}

const SUBMISSION_HEADERS = [
  "record_id","timestamp","bus_model","project","vin",
  "production_line","station","station_code",
  "hse_resources","clock_in","clock_out",
  "actual_time_min","gross_time_min","break_min","designed_time_min",
  "overrun_min","has_overrun",
  "ohs_issue","waste_generated",
  "reviewer","approval_status","review_date","review_comments",
  // Optional general-user pre-submit fields (comments + a rough delay-time
  // range) — see the "Additional notes" card in TravelCard.jsx page 1.
  "general_comments","unexpected_delay",
  // Who submitted it — lets "My Submissions"/edit find a user's own cards.
  "submitted_by",
];
function writeSubmission(ss, d, id) {
  const sh = getOrCreate(ss, "submissions", SUBMISSION_HEADERS);
  const down = downtimeOf_(d);
  appendRecords_(sh, SUBMISSION_HEADERS, [{
    record_id: id, timestamp: d.timestamp, bus_model: d.busModel, project: d.project, vin: d.vin,
    production_line: d.line, station: d.station, station_code: d.stationCode,
    hse_resources: d.hseResources || 0, clock_in: d.clockIn, clock_out: d.clockOut,
    actual_time_min: d.actualTime, gross_time_min: Number(d.grossTime) || "", break_min: Number(d.breakMinutes) || 0,
    designed_time_min: d.designedTime,
    overrun_min: down.has ? (d.actualTime - d.designedTime) : 0,
    has_overrun: down.has ? "YES" : "NO",
    ohs_issue: d.ohsIssue || "", waste_generated: d.wasteGenerated || "",
    reviewer: d.reviewer, approval_status: d.approvalStatus, review_date: d.reviewDate, review_comments: d.reviewComments || "",
    general_comments: d.generalComments || "",
    unexpected_delay: d.unexpectedDelay ? JSON.stringify(d.unexpectedDelay) : "",
    submitted_by: d.submittedBy || "",
  }]);
}

const ACTIVITY_HEADERS = ["record_id","timestamp","station_code","vin","project","activity","status","is_added"];
function writeActivities(ss, d, id) {
  const sh = getOrCreate(ss, "activities", ACTIVITY_HEADERS);
  const statuses = d.activityStatuses || {};
  const added = d.addedActivities || [];
  const all = {};
  Object.keys(statuses).forEach(a => { all[a] = statuses[a]; });
  added.forEach(a => { if (!(a in all)) all[a] = ""; });
  appendRecords_(sh, ACTIVITY_HEADERS, Object.entries(all).map(([activity, status]) => ({
    record_id: id, timestamp: d.timestamp, station_code: d.stationCode, vin: d.vin, project: d.project,
    activity: activity, status: status || "not_set", is_added: added.indexOf(activity) > -1 ? "YES" : "NO",
  })));
}

// is_removed: preset consumables the operator deliberately removed from the
// card (the live tab already had this column; nothing was filling it).
const RESOURCE_HEADERS = ["record_id","timestamp","station_code","vin","project","resource_name","quantity","is_other","is_removed"];
function writeResources(ss, d, id) {
  const sh = getOrCreate(ss, "resources", RESOURCE_HEADERS);
  const base = { record_id: id, timestamp: d.timestamp, station_code: d.stationCode, vin: d.vin, project: d.project };
  const recs = [];
  Object.entries(d.resourcesUsed || {}).forEach(([name, qty]) => {
    if (qty > 0) recs.push(Object.assign({}, base, { resource_name: name, quantity: qty, is_other: "NO", is_removed: "NO" }));
  });
  (d.otherResources || []).forEach(r => {
    recs.push(Object.assign({}, base, { resource_name: r.name, quantity: r.qty, is_other: "YES", is_removed: "NO" }));
  });
  (d.removedResources || []).forEach(name => {
    recs.push(Object.assign({}, base, { resource_name: name, quantity: 0, is_other: "NO", is_removed: "YES" }));
  });
  appendRecords_(sh, RESOURCE_HEADERS, recs);
}

// Root-cause analysis fields (RCA method, 5 whys, preventive action, evidence
// file name) are kept too — the evidence file itself is not: base64 photos
// exceed the 50,000-character cell limit.
const OVERRUN_HEADERS = [
  "record_id","timestamp","station_code","vin","project",
  "designed_min","actual_min","overrun_min",
  "root_causes","sub_causes","cause_delays","custom_causes",
  "corrective_action","comments",
  "rca_method","category","why_1","why_2","why_3","why_4","why_5","preventive_action","evidence_file",
];
function writeOverrun(ss, d, id) {
  const sh = getOrCreate(ss, "overruns", OVERRUN_HEADERS);
  const or = downtimeOf_(d).dt;
  appendRecords_(sh, OVERRUN_HEADERS, [{
    record_id: id, timestamp: d.timestamp, station_code: d.stationCode, vin: d.vin, project: d.project,
    designed_min: d.designedTime, actual_min: d.actualTime, overrun_min: d.actualTime - d.designedTime,
    root_causes: (or.selMs || []).join(", "),
    sub_causes: Object.entries(or.subCauses || {}).map(([m, s]) => `${m}: ${s}`).join(" | "),
    cause_delays: Object.entries(or.causeTimes || {}).map(([m, t]) => `${m}: ${t} min`).join(" | "),
    custom_causes: (or.customCauses || []).join(", "),
    corrective_action: or.correctiveAction || "", comments: or.comments || "",
    rca_method: or.rcaMethod || "", category: or.category || "",
    why_1: or.why1 || "", why_2: or.why2 || "", why_3: or.why3 || "", why_4: or.why4 || "", why_5: or.why5 || "",
    preventive_action: or.preventiveAction || "", evidence_file: or.attachmentName || "",
  }]);
}

// One row per cause — the analysis-friendly breakdown of where time was lost.
const OVERRUN_CAUSE_HEADERS = ["record_id","timestamp","station_code","vin","project","cause","is_custom","detail","delay_min"];
function writeOverrunCauses(ss, d, id) {
  const sh = getOrCreate(ss, "overrun_causes", OVERRUN_CAUSE_HEADERS);
  const or = downtimeOf_(d).dt;
  appendRecords_(sh, OVERRUN_CAUSE_HEADERS, (or.selMs || []).map(cause => {
    const delay = (or.causeTimes || {})[cause];
    return {
      record_id: id, timestamp: d.timestamp, station_code: d.stationCode, vin: d.vin, project: d.project,
      cause: cause,
      is_custom: (or.customCauses || []).indexOf(cause) > -1 ? "YES" : "NO",
      detail: (or.subCauses || {})[cause] || "",
      delay_min: (delay === undefined || delay === null || delay === "") ? "" : Number(delay),
    };
  }));
}

const OPERATOR_HEADERS = ["record_id","timestamp","station_code","vin","project","operator_name"];
function writeOperators(ss, d, id) {
  const sh = getOrCreate(ss, "operators", OPERATOR_HEADERS);
  appendRecords_(sh, OPERATOR_HEADERS, (d.operators || []).map(op => ({
    record_id: id, timestamp: d.timestamp, station_code: d.stationCode, vin: d.vin, project: d.project, operator_name: op,
  })));
}

function writeProjects(ss, d) {
  const sh = getOrCreate(ss, "projects", ["project","vin","bus_model","last_seen"]);
  const data = sh.getDataRange().getValues();
  const exists = data.some(r => r[0] === d.project && r[1] === d.vin);
  if (!exists) {
    sh.appendRow([d.project, d.vin, d.busModel, d.timestamp]);
  } else {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === d.project && data[i][1] === d.vin) {
        sh.getRange(i + 1, 4).setValue(d.timestamp); break;
      }
    }
  }
}

// Patches an existing submission by record_id. Two callers, distinguished
// by which fields they send:
//  - PendingReviews.jsx (supervisor decision): reviewer/approvalStatus/
//    reviewDate/reviewComments only, no restriction on current status.
//  - TravelCard.jsx edit mode (general user correcting their own card):
//    sends `requireStillPending: true` (rejected once approval_status is
//    "approved" — pending_review/pending/rejected all still allow editing)
//    and `_fullEdit: true` (also rewrites this record's
//    activities/resources/operators rows — delete-then-rewrite, since those
//    are one-row-per-item tables with no stable per-item id to patch).
function updateSubmission_(d) {
  if (!d.recordId) return response({ status: "error", message: "missing-record-id" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = ss.getSheetByName("submissions");
  if (!sh) return response({ status: "error", message: "no-sheet" });
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const idCol = headers.indexOf("record_id");
  const statusCol = headers.indexOf("approval_status");

  const fieldMap = {
    busModel: "bus_model", project: "project", vin: "vin",
    line: "production_line", station: "station", stationCode: "station_code",
    hseResources: "hse_resources", clockIn: "clock_in", clockOut: "clock_out",
    actualTime: "actual_time_min", grossTime: "gross_time_min", breakMinutes: "break_min",
    designedTime: "designed_time_min",
    ohsIssue: "ohs_issue", wasteGenerated: "waste_generated",
    generalComments: "general_comments",
    reviewer: "reviewer", approvalStatus: "approval_status",
    reviewDate: "review_date", reviewComments: "review_comments",
  };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) !== String(d.recordId)) continue;
    const rowNum = i + 1;

    // Edit stays open through every pre-approval state (pending_review,
    // and "pending"/needs-further-review or "rejected" from a first pass) —
    // it's specifically "approved" that locks it, per the requirement.
    if (d.requireStillPending) {
      const current = String(data[i][statusCol] || "").toLowerCase();
      if (current === "approved") {
        return response({ status: "error", message: "already-approved" });
      }
    }

    Object.entries(fieldMap).forEach(([key, colName]) => {
      if (d[key] !== undefined) {
        const colIdx = headers.indexOf(colName);
        if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
      }
    });
    if (d.unexpectedDelay !== undefined) {
      const udCol = headers.indexOf("unexpected_delay");
      if (udCol > -1) sh.getRange(rowNum, udCol + 1).setValue(d.unexpectedDelay ? JSON.stringify(d.unexpectedDelay) : "");
    }

    if (d._fullEdit) {
      ["activities", "resources", "operators"].forEach(tabName => {
        const tsh = ss.getSheetByName(tabName);
        if (!tsh) return;
        const tdata = tsh.getDataRange().getValues();
        for (let j = tdata.length - 1; j >= 1; j--) {
          if (String(tdata[j][0]) === String(d.recordId)) tsh.deleteRow(j + 1);
        }
      });
      writeActivities(ss, d, d.recordId);
      writeResources(ss, d, d.recordId);
      writeOperators(ss, d, d.recordId);
    }

    return response({ status: "ok", recordId: d.recordId });
  }
  return response({ status: "error", message: "not-found" });
}

// ── Daily Activities Log (Bus Sightings) ──────────────────────────────────
// A supervisor's own, independently-entered record of "bus X was at station
// Y on day Z, roughly at time T" — deliberately separate from the
// submissions tab (which records completed station WORK, not sightings) so
// it can be used as an honest cross-check against Travel Card entries
// rather than just echoing them back. Multiple sightings per bus per day
// are expected as it moves through stations — this is a log, not a
// single "current position" record.
const BUS_SIGHTINGS_HEADERS = [
  "record_id", "date", "project", "vin", "bus_model",
  "line", "station", "station_code", "time",
  "logged_by", "created_at",
];
function saveBusSighting_(d) {
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = getOrCreate(ss, "bus_sightings", BUS_SIGHTINGS_HEADERS);
  const id = Utilities.getUuid();
  sh.appendRow([
    id, d.date || today_(), d.project || "", d.vin || "", d.busModel || "",
    d.line || "", d.station || "", d.stationCode || "", d.time || "",
    d.loggedBy || "", new Date().toISOString(),
  ]);
  return response({ status: "ok", id });
}
function deleteBusSighting_(d) {
  if (!d.id) return response({ status: "error", message: "missing-id" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const sh = ss.getSheetByName("bus_sightings");
  if (!sh) return response({ status: "error", message: "no-sheet" });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.deleteRow(i + 1);
      return response({ status: "ok" });
    }
  }
  return response({ status: "error", message: "not-found" });
}
function today_() { return new Date().toISOString().slice(0, 10); }

// ── Station consumables ────────────────────────────────────────────────────
// Custom consumables added on a travel card stay on that station for every
// later fill-in, on any device, until someone deletes them. One row per
// station + name; adding an existing name is a no-op.
const STATION_CONSUMABLES_HEADERS = ["station_code", "name", "added_by", "added_at"];
function normStationCode_(c) { return String(c || "").trim().toUpperCase().replace(/\s+/g, "-"); }
function addStationConsumable_(p) {
  const code = normStationCode_(p.code), name = String(p.name || "").trim();
  if (!code || !name) return response({ status: "error", message: "missing-code-or-name" });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = getOrCreate(SpreadsheetApp.openById(TRACKER_SHEET_ID), "station_consumables", STATION_CONSUMABLES_HEADERS);
    const data = sh.getDataRange().getValues();
    const exists = data.slice(1).some(r => normStationCode_(r[0]) === code && String(r[1]).trim().toLowerCase() === name.toLowerCase());
    if (!exists) sh.appendRow([code, name, String(p.by || ""), new Date().toISOString()]);
    return response({ status: "ok", added: !exists });
  } finally { lock.releaseLock(); }
}
function deleteStationConsumable_(p) {
  const code = normStationCode_(p.code), name = String(p.name || "").trim().toLowerCase();
  if (!code || !name) return response({ status: "error", message: "missing-code-or-name" });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.openById(TRACKER_SHEET_ID).getSheetByName("station_consumables");
    if (!sh) return response({ status: "ok", removed: 0 });
    const data = sh.getDataRange().getValues();
    let removed = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (normStationCode_(data[i][0]) === code && String(data[i][1]).trim().toLowerCase() === name) { sh.deleteRow(i + 1); removed++; }
    }
    return response({ status: "ok", removed });
  } finally { lock.releaseLock(); }
}

// ── Password hashing (DynamicUsers only — AccessRequests intentionally stays
// plaintext, since the approval UI reads it once to relay the password to
// the applicant; see handleApprove() in src/components/AccessRequests.jsx).
// Format: "<salt>$<sha256 hex of salt+password>". Legacy rows created before
// this existed are still plain text; verifyPassword_ falls back to a direct
// compare for those and login_ migrates the row to a hash on next successful
// login, so no bulk migration pass is needed.
function hashPassword_(plain, salt) {
  salt = salt || Utilities.getUuid();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + plain, Utilities.Charset.UTF_8);
  const hex = bytes.map(b => ("0" + (b & 0xFF).toString(16)).slice(-2)).join("");
  return salt + "$" + hex;
}
function isHashedPassword_(stored) {
  return typeof stored === "string" && /^[0-9a-f-]{36}\$[0-9a-f]{64}$/i.test(stored);
}
function verifyPassword_(plain, stored) {
  if (!stored) return false;
  if (isHashedPassword_(stored)) {
    return hashPassword_(plain, stored.split("$")[0]) === stored;
  }
  return stored === plain;
}

// ── Login — server-side credential check against the private sheet ──────────
// Never returns the password field, so no client ever receives it.
const LOGIN_MAX_FAILS = 5;          // wrong passwords allowed per username...
const LOGIN_LOCK_SECONDS = 600;     // ...before it is locked for this long
function login_(username, password, remember) {
  if (!username || !password) return response({ status: "error", message: "missing-credentials" });
  const cache = CacheService.getScriptCache();
  const failKey = "loginfail_" + String(username).toLowerCase().trim().slice(0, 60);
  if (Number(cache.get(failKey) || 0) >= LOGIN_MAX_FAILS) {
    return response({ status: "error", message: "too-many-attempts" });
  }
  const sh = getOrCreate(privateSs_(), DYNAMIC_USERS_TAB, DYNAMIC_USERS_HEADERS);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const col = name => headers.indexOf(name);
  const passwordCol = col("password");
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const stored = row[passwordCol];
    if (String(row[col("username")]).toLowerCase() === String(username).toLowerCase() && verifyPassword_(password, String(stored))) {
      if (!isHashedPassword_(String(stored))) {
        sh.getRange(i + 1, passwordCol + 1).setValue(hashPassword_(password));
      }
      cache.remove(failKey);
      const user = dynamicUserRowToObject_(headers, row);
      // 30 days when "keep me signed in" is ticked, otherwise 12 hours.
      return response({ status: "ok", user, session: issueSession_(user.username, user.role, remember ? 30 * 24 : 12) });
    }
  }
  cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), LOGIN_LOCK_SECONDS);
  return response({ status: "error", message: "invalid-credentials" });
}

// ── Sessions ──────────────────────────────────────────────────────────────────
// Stateless signed token:  base64url(JSON{u,r,e}) + "." + base64url(HMAC-SHA256).
// The signing secret lives in Script Properties (created on first use) and never
// leaves the server. Every use re-checks that the user still exists with the same
// role, so deleting or demoting an account ends its sessions immediately.
function sessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("session_secret");
  if (!secret) {
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      secret = props.getProperty("session_secret");
      if (!secret) {
        secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
        props.setProperty("session_secret", secret);
      }
    } finally { lock.releaseLock(); }
  }
  return secret;
}
function sign_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, sessionSecret_()));
}
function issueSession_(username, role, hours) {
  const payload = Utilities.base64EncodeWebSafe(
    JSON.stringify({ u: username, r: role, e: Date.now() + hours * 3600 * 1000 }), Utilities.Charset.UTF_8);
  return payload + "." + sign_(payload);
}
function verifySession_(token) {
  try {
    if (!token || typeof token !== "string" || token.indexOf(".") < 1) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const good = sign_(parts[0]);
    if (good.length !== parts[1].length) return null;
    let diff = 0;
    for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ parts[1].charCodeAt(i);
    if (diff !== 0) return null;
    const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!p || !p.u || Number(p.e) < Date.now()) return null;
    // The account must still exist and still hold the role the token claims.
    const sh = privateSs_().getSheetByName(DYNAMIC_USERS_TAB);
    if (!sh) return null;
    const data = sh.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toLowerCase().trim());
    const uCol = headers.indexOf("username"), rCol = headers.indexOf("role");
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][uCol]).toLowerCase() === String(p.u).toLowerCase()) {
        return String(data[i][rCol] || "user") === p.r ? { username: data[i][uCol], role: p.r } : null;
      }
    }
    return null;
  } catch (err) { return null; }
}
function legacyTokenEnabled_() {
  return PropertiesService.getScriptProperties().getProperty("legacy_token_off") !== "1";
}
// True when the request carries a valid admin session (or, until you run
// disableLegacyToken(), the old shared token).
function isAdminRequest_(p) {
  const s = verifySession_(p && p.session);
  if (s && ADMIN_ROLES.indexOf(s.role) > -1) return true;
  return !!(p && p.token && legacyTokenEnabled_() && p.token === LEGACY_ADMIN_TOKEN);
}
// Run ONCE from the editor after the new site is live: the shared token stops working.
function disableLegacyToken() {
  PropertiesService.getScriptProperties().setProperty("legacy_token_off", "1");
  Logger.log("Legacy shared admin token is now DISABLED.");
}

// Run ONCE from the editor. The old site had these accounts hard-coded with
// passwords published on GitHub. This creates them in the private sheet with NEW
// random passwords (stored hashed) and prints each password ONCE in the execution
// log — copy them out and hand them to the right people. Existing usernames are
// skipped, so it is safe to run again.
function seedBuiltInAccounts() {
  const accounts = [
    { username: "systemadmin", role: "systemadmin", fullName: "System Admin" },
    { username: "kmcadmin",    role: "useradmin",   fullName: "KMC Admin" },
    { username: "kmc",         role: "user" },
    { username: "kmc.super",   role: "supervisor",  roles: ["cee"] },
    { username: "kmc.parts",   role: "user", domain: "Parts & Materials" },
    { username: "kmc.process", role: "user", domain: "Process" },
    { username: "kmc.quality", role: "user", domain: "Quality" },
    { username: "kmc.prod",    role: "user", domain: "Production" },
    { username: "dpn.kmc",     role: "user", landing: "scoreboard" },
    { username: "kmc.cee",     role: "cee" },
  ];
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const lines = [];
  accounts.forEach(a => {
    let pw = "";
    while (pw.length < 16) {
      Utilities.getUuid().replace(/-/g, "").match(/../g).forEach(h => {
        const n = parseInt(h, 16);
        if (pw.length < 16 && n < alphabet.length * 4) pw += alphabet[n % alphabet.length];
      });
    }
    pw = pw.match(/.{4}/g).join("-");
    const res = JSON.parse(createDynamicUser_(JSON.stringify(Object.assign({}, a, { password: pw }))).getContent());
    lines.push(res.status === "ok" ? a.username + "  /  " + pw + "   (" + a.role + ")" : a.username + "  -> skipped (" + res.message + ")");
  });
  Logger.log("Copy these NOW — passwords are not stored anywhere readable:\n" + lines.join("\n"));
}

function dynamicUserRowToObject_(headers, row) {
  const col = name => row[headers.indexOf(name)];
  const jsonArr = v => { try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p : []; } catch (e) { return []; } };
  return {
    username: col("username") || "",
    role: col("role") || "user",
    domain: col("domain") || null,
    landing: col("landing") || null,
    fullName: col("full_name") || "",
    email: col("email") || "",
    department: col("department") || "",
    productionLine: col("production_line") || "",
    productionLines: jsonArr(col("production_lines")),
    position: col("position") || "",
    createdAt: col("created_at") || "",
    assignedStation: col("assigned_station") || "",
    assignedLine: col("assigned_line") || null,
    assignedLines: jsonArr(col("assigned_lines")),
    assignedStations: jsonArr(col("assigned_stations")),
    // Missing/blank column = true (backward-compatible default for every
    // user created before this field existed) — only an explicit "NO" revokes.
    canAccessTracker: String(col("can_access_tracker") || "").toUpperCase() !== "NO",
    // Supplementary roles on top of the primary "role" field — see the
    // DYNAMIC_USERS_HEADERS comment.
    roles: jsonArr(col("roles")),
  };
}

// ── Access requests (private sheet, one row per applicant) ───────────────────
function submitAccessRequest_(payload) {
  let d;
  try { d = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  const sh = getOrCreate(privateSs_(), ACCESS_REQUESTS_TAB, ACCESS_REQUESTS_HEADERS);
  const id = d.id || Utilities.getUuid();
  sh.appendRow([
    id, d.fullName || "", d.email || "", d.username || "", d.department || "",
    JSON.stringify(d.productionLines || []), d.position || "", d.password || "",
    d.reason || "", d.status || "pending", d.submittedAt || new Date().toISOString(),
    "", "", "",
    JSON.stringify(d.preferredStations || []),
    d.ceeInterest ? "YES" : "NO",
  ]);
  return response({ status: "ok", id });
}

function listAccessRequests_() {
  const sh = getOrCreate(privateSs_(), ACCESS_REQUESTS_TAB, ACCESS_REQUESTS_HEADERS);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const col = (row, name) => row[headers.indexOf(name)];
  const jsonArr = v => { try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p : []; } catch (e) { return []; } };
  const requests = data.slice(1).filter(r => col(r, "id")).map(r => {
    const productionLines = jsonArr(col(r, "production_lines"));
    return {
      id: col(r, "id"),
      fullName: col(r, "full_name") || "",
      email: col(r, "email") || "",
      username: col(r, "username") || "",
      department: col(r, "department") || "",
      productionLines,
      productionLine: productionLines[0] || "",
      position: col(r, "position") || "",
      password: col(r, "password") || "",
      preferredStations: jsonArr(col(r, "preferred_stations")),
      ceeInterest: col(r, "cee_interest") === "YES",
      reason: col(r, "reason") || "",
      status: col(r, "status") || "pending",
      submittedAt: col(r, "submitted_at") || "",
      assignedUsername: col(r, "assigned_username") || "",
      assignedRole: col(r, "assigned_role") || "",
      processedAt: col(r, "processed_at") || "",
    };
  });
  return response({ status: "ok", requests });
}

function updateAccessRequest_(payload) {
  let d;
  try { d = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  if (!d.id) return response({ status: "error", message: "missing-id" });
  const sh = privateSs_().getSheetByName(ACCESS_REQUESTS_TAB);
  if (!sh) return response({ status: "error", message: "no-sheet" });
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const idCol = headers.indexOf("id");
  const fieldMap = { status: "status", assignedUsername: "assigned_username", assignedRole: "assigned_role", processedAt: "processed_at" };
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(d.id)) {
      const rowNum = i + 1;
      Object.entries(fieldMap).forEach(([key, colName]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(colName);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
        }
      });
      return response({ status: "ok", id: d.id });
    }
  }
  return response({ status: "error", message: "request-not-found" });
}

function deleteAccessRequest_(id) {
  if (!id) return response({ status: "error", message: "missing-id" });
  const sh = privateSs_().getSheetByName(ACCESS_REQUESTS_TAB);
  if (!sh) return response({ status: "error", message: "no-sheet" });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return response({ status: "ok", id });
    }
  }
  return response({ status: "error", message: "request-not-found" });
}

// ── Dynamic users (private sheet, one row per user) ───────────────────────────
function listDynamicUsers_() {
  const sh = getOrCreate(privateSs_(), DYNAMIC_USERS_TAB, DYNAMIC_USERS_HEADERS);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const users = data.slice(1)
    .filter(r => r[headers.indexOf("username")])
    .map(r => dynamicUserRowToObject_(headers, r)); // never includes password
  return response({ status: "ok", users });
}

function createDynamicUser_(payload) {
  let u;
  try { u = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  if (!u.username || !u.password) return response({ status: "error", message: "missing-username-or-password" });
  const sh = getOrCreate(privateSs_(), DYNAMIC_USERS_TAB, DYNAMIC_USERS_HEADERS);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const usernameCol = headers.indexOf("username");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][usernameCol]).toLowerCase() === u.username.toLowerCase()) {
      return response({ status: "error", message: "username-taken" });
    }
  }
  sh.appendRow([
    u.username, hashPassword_(u.password), u.role || "user", u.domain || "", u.landing || "",
    u.fullName || "", u.email || "", u.department || "", u.productionLine || "",
    JSON.stringify(u.productionLines || []), u.position || "", u.createdAt || new Date().toISOString(),
    u.assignedStation || "", u.assignedLine || "",
    JSON.stringify(u.assignedLines || []), JSON.stringify(u.assignedStations || []),
    u.canAccessTracker === false ? "NO" : "YES",
    JSON.stringify(u.roles || []),
  ]);
  return response({ status: "ok", username: u.username });
}

// Patches only the fields present on the payload. `password` is only ever
// overwritten when explicitly included (a non-empty new password) — omitting
// it (the normal case) leaves the stored password untouched, since reads
// never send it back to any client.
function updateDynamicUser_(payload) {
  let d;
  try { d = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  if (!d.username) return response({ status: "error", message: "missing-username" });
  const sh = privateSs_().getSheetByName(DYNAMIC_USERS_TAB);
  if (!sh) return response({ status: "error", message: "no-sheet" });
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const usernameCol = headers.indexOf("username");

  const fieldMap = {
    role: "role", domain: "domain", landing: "landing",
    fullName: "full_name", email: "email", department: "department",
    productionLine: "production_line", position: "position",
    assignedStation: "assigned_station", assignedLine: "assigned_line",
  };
  const jsonFieldMap = { productionLines: "production_lines", assignedLines: "assigned_lines", assignedStations: "assigned_stations", roles: "roles" };
  const boolFieldMap = { canAccessTracker: "can_access_tracker" };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][usernameCol]).toLowerCase() === d.username.toLowerCase()) {
      const rowNum = i + 1;
      if (d.password !== undefined && d.password !== "") {
        const colIdx = headers.indexOf("password");
        if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(hashPassword_(d.password));
      }
      Object.entries(fieldMap).forEach(([key, colName]) => {
        if (d[key] !== undefined && d[key] !== "") {
          const colIdx = headers.indexOf(colName);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
        }
      });
      Object.entries(jsonFieldMap).forEach(([key, colName]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(colName);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(JSON.stringify(d[key]));
        }
      });
      Object.entries(boolFieldMap).forEach(([key, colName]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(colName);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key] === false ? "NO" : "YES");
        }
      });
      return response({ status: "ok", username: d.username });
    }
  }
  return response({ status: "error", message: "user-not-found" });
}

function deleteDynamicUser_(username) {
  if (!username) return response({ status: "error", message: "missing-username" });
  const sh = privateSs_().getSheetByName(DYNAMIC_USERS_TAB);
  if (!sh) return response({ status: "error", message: "no-sheet" });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase()) {
      sh.deleteRow(i + 1);
      return response({ status: "ok", username });
    }
  }
  return response({ status: "error", message: "user-not-found" });
}

function getOrCreate(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    const hdr = sh.getRange(1, 1, 1, headers.length);
    hdr.setBackground("#1D9E75");
    hdr.setFontColor("#ffffff");
    hdr.setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, headers.length);
  }
  return sh;
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Test function (matches production: payload as a parameter) ────────────────
function testDoPost() {
  const fakeData = {
    timestamp: new Date().toISOString(),
    busModel: "12m KDC", project: "45 Bus Project", vin: "KMC TEST 001",
    line: "Frame & Body Welding", station: "W01-01: Six Parts Merging", stationCode: "W01-01",
    hseResources: 2, clockIn: new Date().toISOString(), clockOut: new Date().toISOString(),
    actualTime: 150, grossTime: 180, breakMinutes: 30, designedTime: 90, hasOverrun: true,
    activityStatuses: { "Six parts merging & initial alignment": "complete" },
    addedActivities: ["Extra re-alignment check"],
    resourcesUsed: { "Welding Wire ER70S-6 (kg)": "2" },
    otherResources: [], ohsIssue: null, wasteGenerated: "Metal offcuts",
    overrun: {
      selMs: ["Man", "Power outage"],
      subCauses: { "Man": "Skill gap / lack of training", "Power outage": "Grid failure" },
      causeTimes: { "Man": 30, "Power outage": 30 },
      customCauses: ["Power outage"],
      correctiveAction: "Reassigned senior welder", comments: "Test"
    },
    reviewer: "Test Reviewer", approvalStatus: "approved",
    reviewDate: new Date().toISOString().slice(0,10), reviewComments: ""
  };
  const result = doPost({ parameter: { payload: JSON.stringify(fakeData) } });
  Logger.log(result.getContent());
}

```
