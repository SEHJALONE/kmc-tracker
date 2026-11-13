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
  // Applicant asked for Type Approvals (VIN register) access — another
  // supplementary role hint, written by name so older sheets gain the column.
  "type_approval_interest",
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
    // Forgot password (public: the emailed code is the proof).
    if (e && e.parameter && e.parameter.action === "requestPasswordReset") return requestPasswordReset_(e.parameter);
    if (e && e.parameter && e.parameter.action === "resetPassword")        return resetPassword_(e.parameter);
    if (e && e.parameter && e.parameter.action === "submitPasswordHelp")   return submitPasswordHelp_(e.parameter);

    // ── Email (functions live in the separate Mail file — tools/mail-relay/Mail.gs) ──
    if (e && e.parameter && e.parameter.action === "sendReportEmail") return sendReportEmail_(e.parameter);
    // Daily/weekly report schedules saved from the site's email boxes (Mail.gs).
    // Nightly off-Google backup (SEHJALONE/kmc-data-backup) reads what this
    // script keeps outside the sheets. Needs the backup key, nothing else.
    if (e && e.parameter && e.parameter.action === "exportBackup") return exportBackup_(e.parameter);
    if (e && e.parameter && e.parameter.action === "saveReportSchedule")   return saveReportSchedule_(e.parameter);
    if (e && e.parameter && e.parameter.action === "listReportSchedules")  return listReportSchedules_(e.parameter);
    if (e && e.parameter && e.parameter.action === "cancelReportSchedule") return cancelReportSchedule_(e.parameter);
    if (e && e.parameter && e.parameter.action === "notifyApproved")  return notifyApproved_(e.parameter);
    // Approval request to the supervisors/managers who can review a Travel Card
    // that needs approval (no reports attached). Admin alerts for new access requests and the "access granted"
    // email are sent by submitAccessRequest_/updateAccessRequest_ themselves.
    if (e && e.parameter && e.parameter.action === "notifyCardSubmitted") return notifyCardSubmitted_(e.parameter);

    // ── Start/End Travel Card tasks (signed-in; see "Open tasks" below) ─────────
    if (e && e.parameter && e.parameter.action === "saveTravelTask")  return saveTravelTask_(e.parameter);
    if (e && e.parameter && e.parameter.action === "listTravelTasks") return listTravelTasks_(e.parameter);
    // Supervisors watching their shops' open tasks (see listShopTasks_).
    if (e && e.parameter && e.parameter.action === "listShopTasks")   return listShopTasks_(e.parameter);

    // ── VIN register (Type Approvals) and Machine Shop job orders ───────────────
    if (e && e.parameter && e.parameter.action === "uploadProjectVins")  return uploadProjectVins_(e.parameter);
    if (e && e.parameter && e.parameter.action === "listJobData")        return listJobData_(e.parameter);
    if (e && e.parameter && e.parameter.action === "saveJobOrder")       return saveJobOrder_(e.parameter);
    if (e && e.parameter && e.parameter.action === "assignJobMachines")  return assignJobMachines_(e.parameter);
    if (e && e.parameter && e.parameter.action === "saveCutList")        return saveCutList_(e.parameter);
    if (e && e.parameter && e.parameter.action === "saveJoMaterials")    return saveJoMaterials_(e.parameter);

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
      return updateDynamicUser_(e.parameter.payload, verifySession_(e.parameter.session));
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

    // Only a real Travel Card may reach the writer below. Anything else (an
    // action this script does not know, such as an email action sent to an
    // older deployment, or an empty body) is refused. It used to be filed as a
    // blank Travel Card row, which polluted the submissions tab.
    if (!data || typeof data !== "object" || data.action) {
      return response({ status: "error", message: "unknown-action" });
    }
    if (!data.stationCode && !data.vin) {
      return response({ status: "error", message: "empty-submission" });
    }

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

function doGet(e) {
  // The "Stop receiving this report" link in the daily report email (Mail.gs).
  if (e && e.parameter && e.parameter.action === "stopReport") return stopScheduledReport_(e.parameter);
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
  "work_days",
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
    work_days: Array.isArray(d.workDays) && d.workDays.length ? JSON.stringify(d.workDays) : "",
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
    if (d.workDays !== undefined) {
      // Adds the column on sheets created before per-day hours existed.
      const wdCol = headerIndex_(sh, ["work_days"]).indexOf("work_days");
      if (wdCol > -1) sh.getRange(rowNum, wdCol + 1).setValue(Array.isArray(d.workDays) && d.workDays.length ? JSON.stringify(d.workDays) : "");
    }
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
  // People may sign in with their username or with the email on their account.
  const id = String(username).toLowerCase().trim();
  const byEmail = id.indexOf("@") > -1;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const stored = row[passwordCol];
    const matches = byEmail
      ? String(row[col("email")] || "").toLowerCase().trim() === id
      : String(row[col("username")]).toLowerCase() === id;
    if (matches && verifyPassword_(password, String(stored))) {
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

// ── Forgot password ───────────────────────────────────────────────────────────
// 1. requestPasswordReset (username or email) emails a 6-digit code to the email
//    on the account and answers { delivery: "email" }. When there is no
//    account or no email on it, it answers { delivery: "admin" } and the site
//    offers the help request (submitPasswordHelp) that goes to the system admin.
// 2. resetPassword (same username or email + code + new password) sets it.
// Codes last 15 minutes and allow 5 tries; 3 code emails per account per hour.
const RESET_TTL_SECONDS = 900;
const RESET_MAX_TRIES = 5;
const PASSWORD_MIN_LENGTH = 8;

// Accounts a username or email points at (an email can be on several accounts).
function accountsFor_(identifier) {
  const id = String(identifier || "").toLowerCase().trim();
  if (!id) return [];
  return allUsers_().filter(function (u) {
    return id.indexOf("@") > -1
      ? String(u.email || "").toLowerCase().trim() === id
      : String(u.username).toLowerCase() === id;
  });
}
function resetKey_(username) { return "pwreset_" + String(username).toLowerCase(); }

function requestPasswordReset_(params) {
  const toAdmin = function (reason) { return response({ status: "ok", sent: false, delivery: "admin", reason: reason || "" }); };
  const accounts = accountsFor_(params.identifier);
  if (!accounts.length) return toAdmin("no-account");
  const email = String(accounts[0].email || "").trim();
  if (!email || !MAIL_EMAIL_RE.test(email)) return toAdmin("no-email");
  // A code sent in the last hour still works; don't send more than 3 an hour.
  // Its own key: "pwreset_<username>" holds the code itself (resetKey_).
  if (!mailRateOk_("pwresetrate_" + String(params.identifier).toLowerCase().trim(), 3)) {
    return response({ status: "ok", sent: false, delivery: "email", note: "recent", from: MAIL_FROM });
  }

  // One code per account. When an email is on several accounts (shared admin
  // mailboxes), each account gets its own code in the same email, so whichever
  // account the person means can be reset with the email address alone.
  const cache = CacheService.getScriptCache();
  const lines = accounts.map(function (u) {
    const n = parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 8), 16) % 1000000;
    const code = ("000000" + n).slice(-6);
    cache.put(resetKey_(u.username), JSON.stringify({ h: sign_(u.username + "|" + code), t: 0 }), RESET_TTL_SECONDS);
    return { u: u, code: code };
  });
  const codeBlock = function (x) {
    return (lines.length > 1 ? '<p style="color:#94a3b8;font-size:12px;margin:12px 0 2px;">Account <strong>' + mailEsc_(x.u.username) + "</strong>" + (x.u.fullName ? " (" + mailEsc_(x.u.fullName) + ")" : "") + "</p>" : "") +
      '<p style="font-family:monospace;font-size:28px;letter-spacing:.3em;color:#fff;margin:0;">' + x.code + "</p>";
  };
  const who = lines.length > 1
    ? "This email is on " + lines.length + " accounts. Use the code of the account you want to reset; each works only for its own account."
    : "use this code to set a new password for <strong>" + mailEsc_(lines[0].u.username) + "</strong>.";
  try {
    mailSend_({
      to: [email], subject: "[KMC Tracker] Your password reset code",
      html: mailCard_("#dc2626", "Password Reset", "KMC Bus Tracker · " + mailEsc_(mailKampalaNow_()),
        mailBox_('<p style="color:#94a3b8;font-size:13px;margin:0 0 12px;">Hi ' + mailEsc_(lines.length > 1 ? "there" : (lines[0].u.fullName || lines[0].u.username)) +
          ", " + who + " Codes expire in 15 minutes.</p>" + lines.map(codeBlock).join("") +
          '<p style="color:#64748b;font-size:11px;margin:12px 0 0;">If you did not ask for this, ignore this email; your password stays the same.</p>')),
    });
  } catch (err) {
    lines.forEach(function (x) { cache.remove(resetKey_(x.u.username)); });
    Logger.log("Password reset email failed: " + (err && err.message || err));
    return toAdmin("mail-failed");
  }
  return response({ status: "ok", sent: true, delivery: "email", from: MAIL_FROM, accounts: lines.length });
}

// Help request from the sign-in page when a reset code cannot be emailed: sent
// to the production mailbox (MAIL_FROM) with a link that opens the account in
// User Management, where a system admin can set a new password.
function submitPasswordHelp_(params) {
  const d = (function () { try { return JSON.parse(params.payload || "{}"); } catch (err) { return {}; } })();
  const clip = function (v, n) { return String(v == null ? "" : v).trim().slice(0, n); };
  const name = clip(d.fullName, 100), id = clip(d.identifier, 100), contact = clip(d.contact, 120), message = clip(d.message, 1000);
  if (!name || !id || !contact) return response({ status: "error", message: "missing-fields" });
  if (!mailRateOk_("pwhelp_" + id.toLowerCase(), 3) || !mailRateOk_("pwhelp_all", 30)) {
    return response({ status: "error", message: "too-many-requests" });
  }
  const accounts = accountsFor_(id);
  const e = function (v) { return mailEsc_(v || "—"); };
  const rows = [
    ["Name given", e(name)],
    ["Username / email given", e(id), "font-family:monospace;"],
    ["How to reach them", e(contact)],
    ["Matching account", accounts.length
      ? accounts.map(function (a) { return mailEsc_(a.username) + " (" + mailEsc_(a.fullName || "no name") + ", " + mailEsc_(a.role) + (a.email ? ", " + mailEsc_(a.email) : ", no email") + ")"; }).join("<br>")
      : "None found — check the spelling with them"],
  ];
  if (message) rows.push(["Message", e(message)]);
  const link = MAIL_APP_URL + (accounts.length === 1 ? "/?manage=" + encodeURIComponent(accounts[0].username) : "/?manage=");
  try {
    mailSend_({
      to: [MAIL_FROM], subject: "[KMC Tracker] Password help request — " + id,
      html: mailCard_("#dc2626", "Password Help Request", "KMC Bus Tracker · " + mailEsc_(mailKampalaNow_()),
        mailBox_('<p style="color:#94a3b8;font-size:13px;margin:0 0 14px;">Someone could not reset their password by email and asked the system admin for help.</p>' + mailTable_(rows)) +
        '<p style="color:#94a3b8;font-size:12px;">Confirm who they are, then set a new password for the account in User Management and tell them.</p>' +
        '<div style="text-align:center;margin:14px 0;"><a href="' + mailEsc_(link) + '" style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;font-size:13px;text-decoration:none;padding:11px 20px;border-radius:6px;">Open this account in User Management →</a></div>'),
    });
  } catch (err) {
    return response({ status: "error", message: String(err && err.message || err).slice(0, 200) });
  }
  return response({ status: "ok" });
}

function resetPassword_(params) {
  const bad = response({ status: "error", message: "invalid-code" });
  const accounts = accountsFor_(params.identifier);
  if (!accounts.length) return bad;
  const pw = String(params.password || "");
  if (pw.length < PASSWORD_MIN_LENGTH) return response({ status: "error", message: "weak-password" });
  const cache = CacheService.getScriptCache();
  const code = String(params.code || "").trim();
  // The account whose code this is (an email can be on several accounts).
  let u = null;
  accounts.forEach(function (a) {
    if (u) return;
    let entry = null;
    try { entry = JSON.parse(cache.get(resetKey_(a.username)) || "null"); } catch (err) { entry = null; }
    if (entry && entry.h === sign_(a.username + "|" + code)) u = a;
  });
  if (!u) {
    accounts.forEach(function (a) {
      let entry = null;
      try { entry = JSON.parse(cache.get(resetKey_(a.username)) || "null"); } catch (err) { entry = null; }
      if (!entry) return;
      entry.t = (entry.t || 0) + 1;
      if (entry.t >= RESET_MAX_TRIES) cache.remove(resetKey_(a.username));
      else cache.put(resetKey_(a.username), JSON.stringify(entry), RESET_TTL_SECONDS);
    });
    return bad;
  }
  cache.remove(resetKey_(u.username));
  const sh = privateSs_().getSheetByName(DYNAMIC_USERS_TAB);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const uCol = headers.indexOf("username"), pCol = headers.indexOf("password");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][uCol]).toLowerCase() === String(u.username).toLowerCase()) {
      sh.getRange(i + 1, pCol + 1).setValue(hashPassword_(pw));
      break;
    }
  }
  // A forgotten password often comes after a lock-out: clear it.
  cache.remove("loginfail_" + String(u.username).toLowerCase().slice(0, 60));
  if (u.email) cache.remove("loginfail_" + String(u.email).toLowerCase().trim().slice(0, 60));
  return response({ status: "ok", username: u.username });
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
// ── Backup export ─────────────────────────────────────────────────────────────
// The nightly backup job copies the sheets itself (read-only service account);
// this hands it the data that lives only in this script's properties: the
// daily/weekly report schedules and the 07:00 report settings. Secrets
// (session and link-signing keys) are never exported: a restored script makes
// new ones, which only means people sign in again.
// SET UP: run setBackupKey() once from the editor and copy the key it logs into
// the backup repository's TRACKER_BACKUP_KEY secret.
const BACKUP_EXPORT_KEYS = ["report_schedules", "scheduled_report_to", "scheduled_report_active", "scheduled_report_subject"];

function setBackupKey() {
  const key = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("backup_key", key);
  Logger.log("Backup key (copy into the GitHub secret TRACKER_BACKUP_KEY): " + key);
}

function exportBackup_(params) {
  const props = PropertiesService.getScriptProperties();
  const want = props.getProperty("backup_key") || "";
  const got = String(params.key || "");
  let diff = want.length === got.length && want.length >= 32 ? 0 : 1;
  for (let i = 0; i < Math.min(want.length, got.length); i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return response({ status: "error", message: "unauthorized" });
  const out = {};
  BACKUP_EXPORT_KEYS.forEach(function (k) {
    const v = props.getProperty(k);
    if (v === null) return;
    try { out[k] = JSON.parse(v); } catch (err) { out[k] = v; }
  });
  return response({ status: "ok", exportedAt: new Date().toISOString(), properties: out });
}

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
// Public endpoint (an applicant has no account yet), so it checks what it
// stores and says why when it refuses. The password is stored HASHED from the
// start: the admin never sees it, and the account is created from the hash.
function submitAccessRequest_(payload) {
  let d;
  try { d = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }

  const username = String(d.username || "").trim().toLowerCase();
  if (!username || !String(d.fullName || "").trim() || String(d.email || "").indexOf("@") < 1 ||
      String(d.password || "").length < 8) {
    return response({ status: "error", message: "missing-fields" });
  }

  // A form anyone can reach: cap how fast it can be filled.
  const cache = CacheService.getScriptCache();
  const hits = Number(cache.get("access_request_hits") || 0);
  if (hits >= 30) return response({ status: "error", message: "rate-limited" });
  cache.put("access_request_hits", String(hits + 1), 3600);

  const ss = privateSs_();
  const users = getOrCreate(ss, DYNAMIC_USERS_TAB, DYNAMIC_USERS_HEADERS).getDataRange().getValues();
  const userCol = users[0].map(h => String(h).toLowerCase().trim()).indexOf("username");
  for (let i = 1; i < users.length; i++) {
    if (String(users[i][userCol]).toLowerCase() === username) return response({ status: "error", message: "username-taken" });
  }

  const sh = getOrCreate(ss, ACCESS_REQUESTS_TAB, ACCESS_REQUESTS_HEADERS);
  const rows = sh.getDataRange().getValues();
  const head = rows[0].map(h => String(h).toLowerCase().trim());
  const nameCol = head.indexOf("username"), statusCol = head.indexOf("status");
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][nameCol]).toLowerCase() === username && String(rows[i][statusCol] || "pending") === "pending") {
      return response({ status: "error", message: "request-already-pending" });
    }
  }

  const id = Utilities.getUuid();
  appendRecords_(sh, ACCESS_REQUESTS_HEADERS, [{
    id: id, full_name: String(d.fullName).trim(), email: String(d.email).trim().toLowerCase(),
    username: username, department: d.department || "",
    production_lines: JSON.stringify(d.productionLines || []), position: d.position || "",
    password: hashPassword_(String(d.password)),
    reason: d.reason || "", status: "pending", submitted_at: new Date().toISOString(),
    preferred_stations: JSON.stringify(d.preferredStations || []),
    cee_interest: d.ceeInterest ? "YES" : "NO",
    type_approval_interest: d.typeApprovalInterest ? "YES" : "NO",
  }]);
  // Tell the administrators. The request is already stored, so a mail failure
  // (quota, no alias) never loses it; the reply says whether the alert went.
  let adminNotified = false;
  try { adminNotified = notifyAdminsOfRequest_(Object.assign({}, d, { username: username })); } catch (err) { adminNotified = false; }
  return response({ status: "ok", id, adminNotified: adminNotified });
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
      typeApprovalInterest: col(r, "type_approval_interest") === "YES",
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
      const was = String(data[i][headers.indexOf("status")] || "pending");
      Object.entries(fieldMap).forEach(([key, colName]) => {
        if (d[key] !== undefined) {
          const colIdx = headers.indexOf(colName);
          if (colIdx > -1) sh.getRange(rowNum, colIdx + 1).setValue(d[key]);
        }
      });
      // First time it is marked approved: tell the applicant they can sign in.
      if (d.status === "approved" && was !== "approved") {
        const row = data[i], at = name => row[headers.indexOf(name)];
        let emailed = false, emailError = "";
        try {
          notifyApplicantApproved_({
            fullName: at("full_name"), email: at("email"),
            username: d.assignedUsername || at("username"), role: d.assignedRole || at("assigned_role"),
          });
          emailed = true;
        } catch (err) { emailError = String(err && err.message || err).slice(0, 300); }
        return response({ status: "ok", id: d.id, emailed: emailed, emailError: emailError, email: at("email") });
      }
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
    // A request already carries its password hashed; hash only a plain one.
    u.username, (isHashedPassword_(String(u.password)) ? String(u.password) : hashPassword_(u.password)), u.role || "user", u.domain || "", u.landing || "",
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
// `newUsername` renames the account (system admin only); the old name is also
// replaced on that person's travel cards, open tasks and report schedules.
function updateDynamicUser_(payload, actor) {
  let d;
  try { d = JSON.parse(payload); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  if (!d.username) return response({ status: "error", message: "missing-username" });
  if (d.email !== undefined && d.email !== "" && !/^[^@\s<>(),;:"]+@[^@\s<>(),;:"]+\.[^@\s<>(),;:"]{2,}$/.test(String(d.email).trim())) {
    return response({ status: "error", message: "invalid-email" });
  }
  let newName = d.newUsername !== undefined ? String(d.newUsername).trim().toLowerCase() : "";
  if (newName === String(d.username).toLowerCase()) newName = "";
  if (newName) {
    if (!actor || actor.role !== "systemadmin") return response({ status: "error", message: "only-systemadmin-can-rename" });
    if (!/^[a-z0-9._-]{3,40}$/.test(newName)) return response({ status: "error", message: "invalid-username" });
  }
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

  if (newName && data.some(function (r, i) { return i > 0 && String(r[usernameCol]).toLowerCase() === newName; })) {
    return response({ status: "error", message: "username-taken" });
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][usernameCol]).toLowerCase() === d.username.toLowerCase()) {
      const rowNum = i + 1;
      if (newName) {
        sh.getRange(rowNum, usernameCol + 1).setValue(newName);
        renameUserEverywhere_(String(data[i][usernameCol]), newName);
      }
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
      return response({ status: "ok", username: newName || d.username });
    }
  }
  return response({ status: "error", message: "user-not-found" });
}

// Replaces a renamed account's old username in the tracker sheet (travel cards'
// submitted_by, open tasks' owner) and in report schedules (createdBy).
function renameUserEverywhere_(oldName, newName) {
  const lower = String(oldName).toLowerCase();
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  [["submissions", "submitted_by"], [TRAVEL_TASKS_TAB, "owner"]].forEach(function (pair) {
    const sh = ss.getSheetByName(pair[0]);
    if (!sh) return;
    const data = sh.getDataRange().getValues();
    const c = data[0].map(function (h) { return String(h).toLowerCase().trim(); }).indexOf(pair[1]);
    if (c < 0) return;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][c]).toLowerCase() === lower) sh.getRange(i + 1, c + 1).setValue(newName);
    }
  });
  if (typeof reportSchedules_ === "function") {
    const list = reportSchedules_();
    let changed = false;
    list.forEach(function (x) { if (String(x.createdBy).toLowerCase() === lower) { x.createdBy = newName; changed = true; } });
    if (changed) saveReportSchedules_(list);
  }
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

// One account by username (never includes the password), or null.
function userRecord_(username) {
  const sh = privateSs_().getSheetByName(DYNAMIC_USERS_TAB);
  if (!sh || !username) return null;
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const uCol = headers.indexOf("username");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][uCol]).toLowerCase() === String(username).toLowerCase()) return dynamicUserRowToObject_(headers, data[i]);
  }
  return null;
}
function allUsers_() {
  const sh = privateSs_().getSheetByName(DYNAMIC_USERS_TAB);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  return data.slice(1).filter(r => r[headers.indexOf("username")]).map(r => dynamicUserRowToObject_(headers, r));
}

// ── Open tasks (Start/End Travel Card) ────────────────────────────────────────
// A task is a station job someone has STARTED and not yet closed. It lives here
// (not only in the browser) so it follows the person to another device and so
// runTravelTaskReminders (Mail file) can email them to close it: once at the
// expected end of the station time, then every 6 hours until it is closed.
const TRAVEL_TASKS_TAB = "travel_tasks";
const TRAVEL_TASK_HEADERS = [
  "task_id", "owner", "owner_name", "status", "started_at", "expected_end", "closed_at",
  "project", "bus_model", "vin", "production_line", "station", "station_code", "designed_min",
  "activities", "record_id", "reminder_count", "last_reminder_at", "updated_at",
  "job_order_id", "vins",
];
const TRAVEL_TASK_STATUSES = ["open", "closed", "discarded"];

function travelTaskRow_(headers, row) {
  const at = name => row[headers.indexOf(name)];
  let activities = [];
  try { activities = JSON.parse(at("activities") || "[]"); } catch (err) { activities = []; }
  const iso = v => (v instanceof Date ? v.toISOString() : String(v || ""));
  return {
    id: String(at("task_id")), owner: String(at("owner") || ""), ownerName: String(at("owner_name") || ""),
    status: String(at("status") || "open"), startedAt: iso(at("started_at")), expectedEnd: iso(at("expected_end")),
    closedAt: iso(at("closed_at")), project: String(at("project") || ""), busModel: String(at("bus_model") || ""),
    vin: String(at("vin") || ""), line: String(at("production_line") || ""), station: String(at("station") || ""),
    stationCode: String(at("station_code") || ""), designedMin: Number(at("designed_min")) || 0,
    activities: Array.isArray(activities) ? activities : [], recordId: String(at("record_id") || ""),
    reminderCount: Number(at("reminder_count")) || 0, lastReminderAt: iso(at("last_reminder_at")),
    updatedAt: iso(at("updated_at")),
    jobOrderId: String(at("job_order_id") || ""), vins: (function () { try { const v = JSON.parse(at("vins") || "[]"); return Array.isArray(v) ? v : []; } catch (err) { return []; } })(),
  };
}

// Create or update one task (matched on task_id). Only its owner (or an
// administrator) may change it.
function saveTravelTask_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  let d;
  try { d = JSON.parse(params.payload || "{}"); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  if (!d.id || !/^[\w-]{6,64}$/.test(String(d.id))) return response({ status: "error", message: "missing-id" });
  if (d.status && TRAVEL_TASK_STATUSES.indexOf(d.status) < 0) return response({ status: "error", message: "bad-status" });

  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = getOrCreate(SpreadsheetApp.openById(TRACKER_SHEET_ID), TRAVEL_TASKS_TAB, TRAVEL_TASK_HEADERS);
    const data = sh.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toLowerCase().trim());
    const idCol = headers.indexOf("task_id");
    const now = new Date().toISOString();
    const clip = (v, n) => String(v == null ? "" : v).slice(0, n || 300);
    const acts = JSON.stringify((Array.isArray(d.activities) ? d.activities : []).slice(0, 200).map(a => ({
      name: clip(a && a.name, 500), doneAt: clip(a && a.doneAt, 40), added: !!(a && a.added),
    })));

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) !== String(d.id)) continue;
      const cur = travelTaskRow_(headers, data[i]);
      if (cur.owner.toLowerCase() !== String(user.username).toLowerCase() && ADMIN_ROLES.indexOf(user.role) < 0) {
        return response({ status: "error", message: "not-your-task" });
      }
      const set = (name, v) => { const c = headers.indexOf(name); if (c > -1) sh.getRange(i + 1, c + 1).setValue(v); };
      if (d.status) set("status", d.status);
      if (d.status && d.status !== "open" && cur.status === "open") set("closed_at", clip(d.closedAt || now, 40));
      if (d.startedAt) set("started_at", clip(d.startedAt, 40));
      if (d.expectedEnd) set("expected_end", clip(d.expectedEnd, 40));
      if (d.activities) set("activities", acts);
      if (d.recordId) set("record_id", clip(d.recordId, 80));
      set("updated_at", now);
      return response({ status: "ok", id: d.id });
    }

    // New task. A person may have several open at once.
    if (!d.stationCode || !d.startedAt) return response({ status: "error", message: "missing-fields" });
    const me = userRecord_(user.username);
    appendRecords_(sh, TRAVEL_TASK_HEADERS, [{
      task_id: clip(d.id, 64), owner: user.username, owner_name: clip((me && me.fullName) || d.ownerName || user.username, 120),
      status: d.status || "open", started_at: clip(d.startedAt, 40), expected_end: clip(d.expectedEnd, 40),
      closed_at: d.status && d.status !== "open" ? clip(d.closedAt || now, 40) : "", project: clip(d.project), bus_model: clip(d.busModel, 40), vin: clip(d.vin, 80),
      production_line: clip(d.line), station: clip(d.station), station_code: clip(d.stationCode, 40),
      designed_min: Number(d.designedMin) || 0, activities: acts, record_id: "",
      reminder_count: 0, last_reminder_at: "", updated_at: now,
      job_order_id: clip(d.jobOrderId, 40), vins: JSON.stringify((Array.isArray(d.vins) ? d.vins : []).slice(0, 200).map(v => clip(v, 20))),
    }]);
    return response({ status: "ok", id: d.id, created: true });
  } finally { lock.releaseLock(); }
}

// The caller's own tasks: every open one plus those closed in the last 30 days.
function listTravelTasks_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  const sh = SpreadsheetApp.openById(TRACKER_SHEET_ID).getSheetByName(TRAVEL_TASKS_TAB);
  if (!sh) return response({ status: "ok", tasks: [] });
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const since = Date.now() - 30 * 24 * 3600 * 1000;
  const tasks = data.slice(1).map(r => travelTaskRow_(headers, r)).filter(t =>
    t.id && t.owner.toLowerCase() === String(user.username).toLowerCase() &&
    (t.status === "open" || new Date(t.closedAt || t.updatedAt).getTime() > since));
  return response({ status: "ok", tasks: tasks });
}

// ── Project VIN register (Type Approvals) ─────────────────────────────────────
// People with the "typeapproval" additional role (or an admin) upload a CSV of
// VINs for a bus project. The server merges it into the shared catalog's
// projectVins: VINs already on the project are left as they are (their bus
// model is filled in or corrected if the upload gives one), new ones are added,
// and VINs that belong to another project or are not valid are refused.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function readCatalogJson_() {
  const sh = SpreadsheetApp.openById(TRACKER_SHEET_ID).getSheetByName("Catalog");
  if (!sh) return {};
  const rows = sh.getDataRange().getValues().slice(1)
    .filter(function (r) { return /^catalog(\.\d+)?$/.test(String(r[0]).trim()); })
    .map(function (r) { const k = String(r[0]).trim(); return { i: k === "catalog" ? 0 : Number(k.split(".")[1]), v: String(r[1]) }; })
    .sort(function (a, b) { return a.i - b.i; });
  if (!rows.length) return {};
  try { return JSON.parse(rows.map(function (r) { return r.v; }).join("")) || {}; } catch (err) { return null; }
}

function hasExtraRole_(username, role) {
  const me = userRecord_(username);
  return !!(me && Array.isArray(me.roles) && me.roles.indexOf(role) > -1);
}

function uploadProjectVins_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  if (ADMIN_ROLES.indexOf(user.role) < 0 && !hasExtraRole_(user.username, "typeapproval")) {
    return response({ status: "error", message: "not-type-approvals" });
  }
  let d;
  try { d = JSON.parse(params.payload || "{}"); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  const project = String(d.project || "").trim();
  if (!project) return response({ status: "error", message: "missing-project" });
  const rows = Array.isArray(d.rows) ? d.rows.slice(0, 2000) : [];

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const cat = readCatalogJson_();
    if (cat === null) return response({ status: "error", message: "catalog-unreadable" });
    const known = (cat.projects || []).some(function (p) { return p && String(p.name).trim() === project; });
    if (!known) return response({ status: "error", message: "unknown-project" });
    cat.projectVins = cat.projectVins || {};
    const list = (cat.projectVins[project] || []).map(function (v) { return { vin: String(v.vin || "").toUpperCase(), model: v.model || "" }; });
    const elsewhere = {};
    Object.keys(cat.projectVins).forEach(function (p) {
      if (p === project) return;
      (cat.projectVins[p] || []).forEach(function (v) { elsewhere[String(v.vin || "").toUpperCase()] = p; });
    });
    const out = { added: [], existing: [], updated: [], otherProject: [], wrongProject: [], invalid: [], repeated: [] };
    const seen = {};
    rows.forEach(function (r) {
      const vin = String(r && r.vin || "").trim().toUpperCase().replace(/\s+/g, "");
      const rowProject = String(r && r.project || "").trim();
      const model = String(r && r.model || "").trim().slice(0, 40);
      if (!vin) return;
      if (rowProject && rowProject.toLowerCase() !== project.toLowerCase()) { out.wrongProject.push(vin); return; }
      if (!VIN_RE.test(vin)) { out.invalid.push(vin); return; }
      if (seen[vin]) { out.repeated.push(vin); return; }
      seen[vin] = true;
      if (elsewhere[vin]) { out.otherProject.push(vin + " (" + elsewhere[vin] + ")"); return; }
      const cur = list.filter(function (v) { return v.vin === vin; })[0];
      if (cur) {
        if (model && cur.model !== model) { cur.model = model; out.updated.push(vin); }
        else out.existing.push(vin);
        return;
      }
      list.push({ vin: vin, model: model });
      out.added.push(vin);
    });
    if (out.added.length || out.updated.length) {
      cat.projectVins[project] = list;
      const saved = JSON.parse(saveCatalog_(JSON.stringify(cat)).getContent());
      if (saved.status !== "ok") return response({ status: "error", message: "save-failed" });
    }
    return response({ status: "ok", project: project, total: list.length, result: out });
  } finally { lock.releaseLock(); }
}

// ── Machine Shop job orders ───────────────────────────────────────────────────
// A Machine Shop supervisor sets up a job order: project, bus model, VINs and
// the parts to cut (copied from that model's cut list, then edited). Operators
// pick a machine for each material specification (remembered for next time),
// then run each machine as a Start/End task whose activities are its parts.
const JOB_ORDERS_TAB = "job_orders";
const JOB_ORDER_HEADERS = ["id", "project", "bus_model", "vins", "status", "items", "spec_machines", "notes",
  "created_by", "created_by_name", "created_at", "updated_at"];
const CUT_LISTS_TAB = "cut_lists";
const CUT_LIST_HEADERS = ["bus_model", "items", "updated_by", "updated_at"];
const JO_SETTINGS_TAB = "jo_settings";
const JO_CELL_MAX = 45000;

function canManageJobs_(user) {
  if (!user) return false;
  if (ADMIN_ROLES.indexOf(user.role) > -1) return true;
  if (["supervisor", "manager", "director"].indexOf(user.role) < 0) return false;
  const me = userRecord_(user.username) || {};
  const stations = me.assignedStations || [], lines = me.assignedLines || [];
  return stations.some(function (c) { return /^B0[1-3]-/i.test(String(c)); }) || lines.indexOf("MACHINE") > -1;
}

function joJson_(v, fallback) { try { const x = JSON.parse(v || ""); return x == null ? fallback : x; } catch (err) { return fallback; } }
const joClip_ = function (v, n) { return String(v == null ? "" : v).trim().slice(0, n || 200); };

// One cut-list / job-order line, tidied.
function joItem_(x, i) {
  x = x || {};
  return {
    id: joClip_(x.id || ("i" + i), 40), balloon: joClip_(x.balloon, 20), code: joClip_(x.code, 60), name: joClip_(x.name, 120),
    qty: Math.max(0, Math.min(100000, Number(x.qty) || 0)), spec: joClip_(x.spec, 60), remarks: joClip_(x.remarks, 300),
    length: joClip_(x.length, 30), mitre: joClip_(x.mitre, 60), material: joClip_(x.material, 60),
    groupNote: joClip_(x.groupNote, 200), vin: joClip_(x.vin, 20), cut: x.cut !== false,
  };
}

function joSettingsGet_() {
  const sh = SpreadsheetApp.openById(TRACKER_SHEET_ID).getSheetByName(JO_SETTINGS_TAB);
  const out = {};
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function (r) { if (r[0]) out[String(r[0])] = joJson_(r[1], null); });
  return out;
}
function joSettingsSet_(key, value) {
  const sh = getOrCreate(SpreadsheetApp.openById(TRACKER_SHEET_ID), JO_SETTINGS_TAB, ["key", "value", "updated_at"]);
  const text = JSON.stringify(value);
  if (text.length > JO_CELL_MAX) throw new Error("too-big");
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) { sh.getRange(i + 1, 2, 1, 2).setValues([[text, new Date().toISOString()]]); return; }
  }
  sh.appendRow([key, text, new Date().toISOString()]);
}

function jobOrderRow_(h, r) {
  const at = function (n) { return r[h.indexOf(n)]; };
  const iso = function (v) { return v instanceof Date ? v.toISOString() : String(v || ""); };
  return {
    id: String(at("id") || ""), project: String(at("project") || ""), busModel: String(at("bus_model") || ""),
    vins: joJson_(at("vins"), []), status: String(at("status") || "open"), items: joJson_(at("items"), []),
    specMachines: joJson_(at("spec_machines"), {}), notes: String(at("notes") || ""),
    createdBy: String(at("created_by") || ""), createdByName: String(at("created_by_name") || ""),
    createdAt: iso(at("created_at")), updatedAt: iso(at("updated_at")),
  };
}

function listJobData_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  const ss = SpreadsheetApp.openById(TRACKER_SHEET_ID);
  const since = Date.now() - 60 * 24 * 3600 * 1000;
  let jobOrders = [];
  const jsh = ss.getSheetByName(JOB_ORDERS_TAB);
  if (jsh) {
    const data = jsh.getDataRange().getValues();
    const h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
    jobOrders = data.slice(1).map(function (r) { return jobOrderRow_(h, r); })
      .filter(function (j) { return j.id && (j.status === "open" || new Date(j.updatedAt).getTime() > since); });
  }
  const cutLists = {};
  const csh = ss.getSheetByName(CUT_LISTS_TAB);
  if (csh) {
    const data = csh.getDataRange().getValues();
    const h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
    data.slice(1).forEach(function (r) {
      const m = String(r[h.indexOf("bus_model")] || "");
      if (m) cutLists[m] = { items: joJson_(r[h.indexOf("items")], []), updatedBy: String(r[h.indexOf("updated_by")] || ""), updatedAt: String(r[h.indexOf("updated_at")] || "") };
    });
  }
  const s = joSettingsGet_();
  return response({ status: "ok", jobOrders: jobOrders, cutLists: cutLists,
    settings: { materials: s.materials || null, specMachines: s.specMachines || {} }, canManage: canManageJobs_(user) });
}

function saveJobOrder_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  if (!canManageJobs_(user)) return response({ status: "error", message: "not-machine-shop-supervisor" });
  let d;
  try { d = JSON.parse(params.payload || "{}"); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  const project = joClip_(d.project, 120), busModel = joClip_(d.busModel, 40);
  const vins = (Array.isArray(d.vins) ? d.vins : []).map(function (v) { return joClip_(v, 20).toUpperCase(); }).filter(Boolean).slice(0, 200);
  const items = (Array.isArray(d.items) ? d.items : []).slice(0, 400).map(joItem_);
  if (!project || !busModel) return response({ status: "error", message: "missing-project-or-model" });
  if (!vins.length) return response({ status: "error", message: "missing-vins" });
  if (!items.length) return response({ status: "error", message: "missing-items" });
  const status = ["open", "closed"].indexOf(d.status) > -1 ? d.status : "open";
  const itemsText = JSON.stringify(items);
  if (itemsText.length > JO_CELL_MAX) return response({ status: "error", message: "too-many-items" });
  const now = new Date().toISOString();

  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = getOrCreate(SpreadsheetApp.openById(TRACKER_SHEET_ID), JOB_ORDERS_TAB, JOB_ORDER_HEADERS);
    const data = sh.getDataRange().getValues();
    const h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
    if (d.id) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][h.indexOf("id")]) !== String(d.id)) continue;
        const set = function (n, v) { const c = h.indexOf(n); if (c > -1) sh.getRange(i + 1, c + 1).setValue(v); };
        set("project", project); set("bus_model", busModel); set("vins", JSON.stringify(vins)); set("status", status);
        set("items", itemsText); set("notes", joClip_(d.notes, 500)); set("updated_at", now);
        if (d.specMachines && typeof d.specMachines === "object") set("spec_machines", JSON.stringify(d.specMachines));
        return response({ status: "ok", id: String(d.id) });
      }
      return response({ status: "error", message: "job-order-not-found" });
    }
    const stamp = new Date(Date.now() + 3 * 3600000).toISOString().slice(2, 10).replace(/-/g, "");   // yyMMdd, Kampala (UTC+3)
    const id = "JO-" + stamp + "-" + Utilities.getUuid().replace(/-/g, "").slice(0, 4).toUpperCase();
    const me = userRecord_(user.username) || {};
    appendRecords_(sh, JOB_ORDER_HEADERS, [{
      id: id, project: project, bus_model: busModel, vins: JSON.stringify(vins), status: status, items: itemsText,
      spec_machines: JSON.stringify(d.specMachines && typeof d.specMachines === "object" ? d.specMachines : {}),
      notes: joClip_(d.notes, 500), created_by: user.username, created_by_name: joClip_(me.fullName || user.username, 120),
      created_at: now, updated_at: now,
    }]);
    return response({ status: "ok", id: id });
  } finally { lock.releaseLock(); }
}

// Operators choose which machine cuts each material specification. Saved on
// the job order and as the default for that bus model next time.
function assignJobMachines_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  let d;
  try { d = JSON.parse(params.payload || "{}"); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  const map = {};
  Object.keys(d.specMachines || {}).slice(0, 100).forEach(function (k) {
    const v = joClip_(d.specMachines[k], 40);
    if (v) map[joClip_(k, 60)] = v;
  });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.openById(TRACKER_SHEET_ID).getSheetByName(JOB_ORDERS_TAB);
    if (!sh) return response({ status: "error", message: "job-order-not-found" });
    const data = sh.getDataRange().getValues();
    const h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][h.indexOf("id")]) !== String(d.id)) continue;
      const job = jobOrderRow_(h, data[i]);
      const merged = Object.assign({}, job.specMachines, map);
      sh.getRange(i + 1, h.indexOf("spec_machines") + 1).setValue(JSON.stringify(merged));
      sh.getRange(i + 1, h.indexOf("updated_at") + 1).setValue(new Date().toISOString());
      const s = joSettingsGet_();
      const defaults = s.specMachines || {};
      Object.keys(map).forEach(function (spec) { defaults[job.busModel + "|" + spec] = map[spec]; });
      joSettingsSet_("specMachines", defaults);
      return response({ status: "ok", specMachines: merged });
    }
    return response({ status: "error", message: "job-order-not-found" });
  } finally { lock.releaseLock(); }
}

function saveCutList_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  if (!canManageJobs_(user)) return response({ status: "error", message: "not-machine-shop-supervisor" });
  let d;
  try { d = JSON.parse(params.payload || "{}"); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  const busModel = joClip_(d.busModel, 40);
  if (!busModel) return response({ status: "error", message: "missing-model" });
  const items = (Array.isArray(d.items) ? d.items : []).slice(0, 400).map(joItem_);
  const text = JSON.stringify(items);
  if (text.length > JO_CELL_MAX) return response({ status: "error", message: "too-many-items" });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = getOrCreate(SpreadsheetApp.openById(TRACKER_SHEET_ID), CUT_LISTS_TAB, CUT_LIST_HEADERS);
    const data = sh.getDataRange().getValues();
    const now = new Date().toISOString();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === busModel) { sh.getRange(i + 1, 1, 1, 4).setValues([[busModel, text, user.username, now]]); return response({ status: "ok", items: items.length }); }
    }
    sh.appendRow([busModel, text, user.username, now]);
    return response({ status: "ok", items: items.length });
  } finally { lock.releaseLock(); }
}

function saveJoMaterials_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  if (!canManageJobs_(user)) return response({ status: "error", message: "not-machine-shop-supervisor" });
  let d;
  try { d = JSON.parse(params.payload || "{}"); } catch (err) { return response({ status: "error", message: "bad-json" }); }
  const seen = {};
  const materials = (Array.isArray(d.materials) ? d.materials : []).slice(0, 60).map(function (m) {
    return { name: joClip_(m && m.name, 60), machines: (Array.isArray(m && m.machines) ? m.machines : []).map(function (c) { return joClip_(c, 40); }).filter(Boolean).slice(0, 40) };
  }).filter(function (m) { const k = m.name.toLowerCase(); if (!m.name || seen[k]) return false; seen[k] = true; return true; });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { joSettingsSet_("materials", materials); } finally { lock.releaseLock(); }
  return response({ status: "ok", materials: materials });
}

// Supervisors, managers, directors and admins: every open Start/End task (and
// those closed in the last 12 hours), to watch the shop floor. The site shows
// each person the lines and stations they look after.
function listShopTasks_(params) {
  const user = verifySession_(params.session);
  if (!user) return response({ status: "error", message: "unauthorized" });
  if (["supervisor", "manager", "director"].indexOf(user.role) < 0 && ADMIN_ROLES.indexOf(user.role) < 0) {
    return response({ status: "error", message: "not-a-supervisor" });
  }
  const sh = SpreadsheetApp.openById(TRACKER_SHEET_ID).getSheetByName(TRAVEL_TASKS_TAB);
  if (!sh) return response({ status: "ok", tasks: [] });
  const data = sh.getDataRange().getValues();
  const h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
  const since = Date.now() - 12 * 3600 * 1000;
  const tasks = data.slice(1).map(function (r) { return travelTaskRow_(h, r); }).filter(function (t) {
    return t.id && (t.status === "open" || (t.status === "closed" && new Date(t.closedAt).getTime() > since));
  });
  return response({ status: "ok", tasks: tasks });
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

