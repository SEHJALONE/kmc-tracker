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
2. Token is set to **`kmcisgood`** in both `src/data/catalogConfig.js` and the
   script below — keep them identical.
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

// Must match CATALOG_ADMIN_TOKEN in src/data/catalogConfig.js
const CATALOG_ADMIN_TOKEN = "kmcisgood";

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
];

const DYNAMIC_USERS_TAB = "DynamicUsers";
const DYNAMIC_USERS_HEADERS = [
  "username", "password", "role", "domain", "landing", "full_name", "email",
  "department", "production_line", "production_lines", "position", "created_at",
  "assigned_station", "assigned_line", "assigned_lines", "assigned_stations",
];

function privateSs_() {
  return SpreadsheetApp.openById(PRIVATE_SHEET_ID);
}

function doPost(e) {
  try {
    // ── Login (public — the password itself is the credential) ────────────────
    if (e && e.parameter && e.parameter.action === "login") {
      return login_(e.parameter.username, e.parameter.password);
    }

    // ── Access requests ─────────────────────────────────────────────────────────
    if (e && e.parameter && e.parameter.action === "submitAccessRequest") {
      return submitAccessRequest_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "listAccessRequests") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) return response({ status: "error", message: "unauthorized" });
      return listAccessRequests_();
    }
    if (e && e.parameter && e.parameter.action === "updateAccessRequest") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) return response({ status: "error", message: "unauthorized" });
      return updateAccessRequest_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "deleteAccessRequest") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) return response({ status: "error", message: "unauthorized" });
      return deleteAccessRequest_(e.parameter.id);
    }

    // ── Dynamic users ────────────────────────────────────────────────────────────
    if (e && e.parameter && e.parameter.action === "listDynamicUsers") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) return response({ status: "error", message: "unauthorized" });
      return listDynamicUsers_();
    }
    if (e && e.parameter && e.parameter.action === "createDynamicUser") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) return response({ status: "error", message: "unauthorized" });
      return createDynamicUser_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "updateDynamicUser") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) return response({ status: "error", message: "unauthorized" });
      return updateDynamicUser_(e.parameter.payload);
    }
    if (e && e.parameter && e.parameter.action === "deleteDynamicUser") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) return response({ status: "error", message: "unauthorized" });
      return deleteDynamicUser_(e.parameter.username);
    }

    // ── Catalog save branch (admin only) ──────────────────────────────────────
    if (e && e.parameter && e.parameter.action === "saveCatalog") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) {
        return response({ status: "error", message: "unauthorized" });
      }
      return saveCatalog_(e.parameter.payload);
    }

    // ── Catalog backup admin: list / restore ──────────────────────────────────
    if (e && e.parameter && e.parameter.action === "listCatalogBackups") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) {
        return response({ status: "error", message: "unauthorized" });
      }
      return listCatalogBackups_();
    }
    if (e && e.parameter && e.parameter.action === "restoreCatalogBackup") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) {
        return response({ status: "error", message: "unauthorized" });
      }
      return restoreCatalogBackup_(e.parameter.backupId);
    }

    // Every other write (MOC, and future modules) sends its action *inside*
    // the payload JSON rather than as a top-level form param — parse once and
    // route on it before assuming this is a travel-card submission.
    const data = JSON.parse(e.parameter.payload);

    if (data && data.action === "saveMOC")   return saveMOC_(data);
    if (data && data.action === "updateMOC") return updateMOC_(data);

    // ── Travel-card submission (existing, default) ────────────────────────────
    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const trackerSs = SpreadsheetApp.openById(TRACKER_SHEET_ID);
    const id        = Utilities.getUuid();

    writeSubmission(ss, data, id);
    writeActivities(ss, data, id);
    writeResources(ss, data, id);
    if (data.hasOverrun) {
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

function writeSubmission(ss, d, id) {
  const sh = getOrCreate(ss, "submissions", [
    "record_id","timestamp","bus_model","project","vin",
    "production_line","station","station_code",
    "hse_resources","clock_in","clock_out",
    "actual_time_min","gross_time_min","break_min","designed_time_min",
    "overrun_min","has_overrun",
    "ohs_issue","waste_generated",
    "reviewer","approval_status","review_date","review_comments"
  ]);
  sh.appendRow([
    id, d.timestamp, d.busModel, d.project, d.vin,
    d.line, d.station, d.stationCode,
    d.hseResources || 0, d.clockIn, d.clockOut,
    d.actualTime, Number(d.grossTime) || "", Number(d.breakMinutes) || 0, d.designedTime,
    d.hasOverrun ? (d.actualTime - d.designedTime) : 0,
    d.hasOverrun ? "YES" : "NO",
    d.ohsIssue || "", d.wasteGenerated || "",
    d.reviewer, d.approvalStatus, d.reviewDate, d.reviewComments || ""
  ]);
}

function writeActivities(ss, d, id) {
  const sh = getOrCreate(ss, "activities", [
    "record_id","timestamp","station_code","vin","project","activity","status","is_added"
  ]);
  const statuses = d.activityStatuses || {};
  const added = d.addedActivities || [];
  const all = {};
  Object.keys(statuses).forEach(a => { all[a] = statuses[a]; });
  added.forEach(a => { if (!(a in all)) all[a] = ""; });
  Object.entries(all).forEach(([activity, status]) => {
    sh.appendRow([
      id, d.timestamp, d.stationCode, d.vin, d.project,
      activity, status || "not_set",
      added.indexOf(activity) > -1 ? "YES" : "NO"
    ]);
  });
}

function writeResources(ss, d, id) {
  const sh = getOrCreate(ss, "resources", [
    "record_id","timestamp","station_code","vin","project","resource_name","quantity","is_other"
  ]);
  Object.entries(d.resourcesUsed || {}).forEach(([name, qty]) => {
    if (qty > 0) sh.appendRow([id, d.timestamp, d.stationCode, d.vin, d.project, name, qty, "NO"]);
  });
  (d.otherResources || []).forEach(r => {
    sh.appendRow([id, d.timestamp, d.stationCode, d.vin, d.project, r.name, r.qty, "YES"]);
  });
}

function writeOverrun(ss, d, id) {
  const sh = getOrCreate(ss, "overruns", [
    "record_id","timestamp","station_code","vin","project",
    "designed_min","actual_min","overrun_min",
    "root_causes","sub_causes","cause_delays","custom_causes",
    "corrective_action","comments"
  ]);
  const or = d.overrun || {};
  sh.appendRow([
    id, d.timestamp, d.stationCode, d.vin, d.project,
    d.designedTime, d.actualTime, d.actualTime - d.designedTime,
    (or.selMs || []).join(", "),
    Object.entries(or.subCauses || {}).map(([m, s]) => `${m}: ${s}`).join(" | "),
    Object.entries(or.causeTimes || {}).map(([m, t]) => `${m}: ${t} min`).join(" | "),
    (or.customCauses || []).join(", "),
    or.correctiveAction || "", or.comments || ""
  ]);
}

// One row per cause — the analysis-friendly breakdown of where time was lost.
function writeOverrunCauses(ss, d, id) {
  const sh = getOrCreate(ss, "overrun_causes", [
    "record_id","timestamp","station_code","vin","project",
    "cause","is_custom","detail","delay_min"
  ]);
  const or = d.overrun || {};
  (or.selMs || []).forEach(cause => {
    const delay = (or.causeTimes || {})[cause];
    sh.appendRow([
      id, d.timestamp, d.stationCode, d.vin, d.project,
      cause,
      (or.customCauses || []).indexOf(cause) > -1 ? "YES" : "NO",
      (or.subCauses || {})[cause] || "",
      (delay === undefined || delay === null || delay === "") ? "" : Number(delay)
    ]);
  });
}

function writeOperators(ss, d, id) {
  const sh = getOrCreate(ss, "operators", [
    "record_id","timestamp","station_code","vin","project","operator_name"
  ]);
  (d.operators || []).forEach(op => {
    sh.appendRow([id, d.timestamp, d.stationCode, d.vin, d.project, op]);
  });
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

// ── Login — server-side credential check against the private sheet ──────────
// Never returns the password field, so no client ever receives it.
function login_(username, password) {
  if (!username || !password) return response({ status: "error", message: "missing-credentials" });
  const sh = getOrCreate(privateSs_(), DYNAMIC_USERS_TAB, DYNAMIC_USERS_HEADERS);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const col = name => headers.indexOf(name);
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[col("username")]).toLowerCase() === String(username).toLowerCase() && String(row[col("password")]) === password) {
      return response({ status: "ok", user: dynamicUserRowToObject_(headers, row) });
    }
  }
  return response({ status: "error", message: "invalid-credentials" });
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
    u.username, u.password, u.role || "user", u.domain || "", u.landing || "",
    u.fullName || "", u.email || "", u.department || "", u.productionLine || "",
    JSON.stringify(u.productionLines || []), u.position || "", u.createdAt || new Date().toISOString(),
    u.assignedStation || "", u.assignedLine || "",
    JSON.stringify(u.assignedLines || []), JSON.stringify(u.assignedStations || []),
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
    password: "password", role: "role", domain: "domain", landing: "landing",
    fullName: "full_name", email: "email", department: "department",
    productionLine: "production_line", position: "position",
    assignedStation: "assigned_station", assignedLine: "assigned_line",
  };
  const jsonFieldMap = { productionLines: "production_lines", assignedLines: "assigned_lines", assignedStations: "assigned_stations" };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][usernameCol]).toLowerCase() === d.username.toLowerCase()) {
      const rowNum = i + 1;
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

// Optional: test the catalog branch
function testSaveCatalog() {
  const result = doPost({ parameter: { action: "saveCatalog", token: CATALOG_ADMIN_TOKEN,
    payload: JSON.stringify({ projects: [{ id: "p1", name: "Demo", active: true }] }) } });
  Logger.log(result.getContent());
}
```
