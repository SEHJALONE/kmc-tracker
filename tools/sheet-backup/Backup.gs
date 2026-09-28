// KMC Tracker — nightly Google Sheets backup (space-saving).
//
// Paste into a NEW, standalone Apps Script project (script.google.com → New
// project), NOT the live Travel Card endpoint, so a mistake here can never
// break the /exec URL the app posts to. Then run installDailyTrigger() once.
// See README.md in this folder for restore steps.
//
// Why this exists: every tracker module lives in a handful of spreadsheets on
// one personal Google account. The Catalog_Backups tab only protects against a
// bad catalog save — it lives INSIDE the tracker sheet, so it disappears with
// it. On 2026-09-28 the scoreboard sheet (1Rzd023…) was lost (HTTP 410, not in
// the trash) and the newest copy was a hand-downloaded .xlsx from 10 days
// earlier.
//
// How it saves space:
//  1. Change-only — a sheet that hasn't been edited since its last backup is
//     skipped entirely. Quiet days cost nothing.
//  2. Zipped .xlsx — each night's changed sheets go into ONE .zip (spreadsheet
//     XML compresses ~5–10×), instead of full native Google Sheets copies,
//     which count against Drive storage at full size.
//  3. Native copies weekly only — a ready-to-open Google Sheets copy (formulas,
//     formatting, sharing-free) is made on Sundays, for fast restores.
//  4. Tiered retention — keep every nightly for 14 days, Sunday backups for 8
//     weeks, 1st-of-month backups for 12 months. Everything else is trashed.

const BACKUP_FOLDER_NAME = 'KMC Tracker Backups';
const KEEP_DAILY_DAYS = 14;
const KEEP_WEEKLY_WEEKS = 8;
const KEEP_MONTHLY_MONTHS = 12;

// xlsx:false keeps a sheet OUT of the zip. The password sheet holds plaintext
// applicant passwords (AccessRequests tab) — it gets native copies only, which
// stay private inside Drive, never a downloadable .xlsx that Drive for desktop
// would sync to every PC.
// alwaysNative:true makes a native copy on every change, not just Sundays —
// used for the password sheet since it has no zipped fallback.
const SOURCES = [
  { name: 'NI Travel Tool Data',               id: '1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es', xlsx: true },
  { name: 'Password manager for Bus Tracker',  id: '1TS2xV3kDIOlQ9W1-j-P9DExvt5lNZhLX6xeeuLX9BNA', xlsx: false, alwaysNative: true },
  // TODO(after rebuild): replace with the rebuilt scoreboard sheet's ID.
  { name: 'KMC Department Monthly Scoreboard', id: '1Rzd023TymG_l159Urake3eiBST9SkuKKm8EyH8U3Xcs', xlsx: true },
  { name: 'KMC DPN SCOREBOARD (old)',          id: '1Z338nnUHTxelGTUtXwbVQPdFi0czu_4us39070i3axM', xlsx: true },
  // External view-only sheets the scoreboard reads — we don't own them, but a
  // copy still protects us if their owner deletes or unshares them.
  { name: 'Production Downtime Log (external)', id: '13r7mWWeQl1KEgPQh0QUOQsWsUON4RjC4', xlsx: true },
  { name: 'Kaizen Ideas (external)',            id: '1MYyIqRxpFu6wGrdvFUXk4VwacmJmsuJ2', xlsx: true },
];

function backupAll() {
  const props = PropertiesService.getScriptProperties();
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const stamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const isSunday = Utilities.formatDate(now, tz, 'u') === '7';
  const failures = [];
  const blobs = [];
  const nativeCopies = [];
  const done = [];

  SOURCES.forEach(src => {
    try {
      const file = DriveApp.getFileById(src.id);
      if (file.isTrashed()) throw new Error('source is in the Drive trash');
      const updated = file.getLastUpdated().getTime();
      const lastBacked = Number(props.getProperty('last_' + src.id) || 0);
      if (updated <= lastBacked) return; // unchanged since last backup — skip

      if (src.xlsx) blobs.push(exportBlob_(file, src.name, stamp));
      if (isSunday || src.alwaysNative || !src.xlsx) nativeCopies.push({ file, src });
      done.push({ id: src.id, updated });
    } catch (err) {
      failures.push(`${src.name} (${src.id}): ${err.message}`);
    }
  });

  if (blobs.length || nativeCopies.length) {
    const root = getOrCreateFolder_(DriveApp.getRootFolder(), BACKUP_FOLDER_NAME);
    const day = getOrCreateFolder_(root, stamp);
    if (blobs.length) day.createFile(Utilities.zip(blobs, `KMC Tracker ${stamp}.zip`));
    nativeCopies.forEach(({ file, src }) => file.makeCopy(`${src.name} — ${stamp}`, day));
    // Only mark as backed up once the files actually exist in Drive.
    done.forEach(d => props.setProperty('last_' + d.id, String(d.updated)));
    pruneOldBackups_(root, now);
  }

  // A missing source is exactly the event this whole script exists to catch,
  // so say so loudly instead of leaving it in the execution log.
  if (failures.length) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      `KMC Tracker backup: ${failures.length} source(s) failed on ${stamp}`,
      failures.join('\n') + '\n\nCheck Drive → Trash for any source reported missing.');
  }
}

// Google Sheets → .xlsx via the export endpoint; any other file (an uploaded
// .xlsx, e.g. the external logs) is already a spreadsheet file, take as-is.
function exportBlob_(file, name, stamp) {
  let blob;
  if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
    const url = `https://docs.google.com/spreadsheets/d/${file.getId()}/export?format=xlsx`;
    blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob();
  } else {
    blob = file.getBlob();
  }
  return blob.setName(`${name} — ${stamp}.xlsx`);
}

// Dated folders are kept if they fall in ANY retention tier. Trashed, not
// permanently deleted, so a pruning mistake stays recoverable for 30 days.
function pruneOldBackups_(root, now) {
  const DAY = 24 * 60 * 60 * 1000;
  const it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.getName());
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const ageDays = (now - d) / DAY;
    const keep =
      ageDays <= KEEP_DAILY_DAYS ||
      (d.getDay() === 0 && ageDays <= KEEP_WEEKLY_WEEKS * 7) ||
      (d.getDate() === 1 && ageDays <= KEEP_MONTHLY_MONTHS * 31);
    if (!keep) f.setTrashed(true);
  }
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// Run once from the editor. Safe to re-run — clears any existing backupAll
// trigger first so you never end up with duplicate nightly runs. Also takes a
// first full backup immediately rather than waiting for 2am.
function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backupAll')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupAll').timeBased().everyDays(1).atHour(2).create();
  backupAll();
}

// Force the next run to back up everything (e.g. after changing SOURCES).
function resetChangeTracking() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}
