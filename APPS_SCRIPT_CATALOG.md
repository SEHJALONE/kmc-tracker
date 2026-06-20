# Apps Script — complete script (catalog + submissions + analysis fields)

This is the full, ready-to-paste Apps Script. It merges:
- your existing travel-card submission logic,
- the **catalog save** branch (token-protected, chunked so large catalogs don't
  hit Google's 50,000-char single-cell limit), and
- the **new analysis fields** (break/gross time, per-cause delay minutes, custom
  causes, added activities) written into the submission sheets.

## Steps
1. The **`Catalog`** tab already exists (key | value). ✅
2. Token is set to **`kmcisgood`** in both `src/data/catalogConfig.js` and the
   script below — keep them identical.
3. Replace your entire Apps Script with the code below.
4. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.**
   This keeps the same `/exec` URL so nothing else changes.

> Reads use the public gviz CSV of the `Catalog` tab; the front-end reassembles
> the chunked rows. Writes are token-checked here.

```javascript
const TRACKER_SHEET_ID = "1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es";
const TRACKER_TAB_NAME = "Travel Card Data";

// Must match CATALOG_ADMIN_TOKEN in src/data/catalogConfig.js
const CATALOG_ADMIN_TOKEN = "kmcisgood";

function doPost(e) {
  try {
    // ── Catalog save branch (admin only) ──────────────────────────────────────
    if (e && e.parameter && e.parameter.action === "saveCatalog") {
      if (e.parameter.token !== CATALOG_ADMIN_TOKEN) {
        return response({ status: "error", message: "unauthorized" });
      }
      return saveCatalog_(e.parameter.payload);
    }

    // ── Travel-card submission (existing) ─────────────────────────────────────
    const data      = JSON.parse(e.parameter.payload);
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
