/**
 * Tracker email, sent by the Apps Script itself (MailApp) from the Gmail account
 * the web app runs as. No email password, App Password or API key exists
 * anywhere — not in the repo, not in Vercel, not in the browser.
 *
 * INSTALL (once)
 * 1. Open the tracker's Apps Script project (the one with doPost / login_).
 * 2. File → New → Script, name it "Mail", and paste this whole file. The main
 *    file must be Code-with-email.gs (its doPost already routes to this one).
 * 3. Add kmcproductiondept@gmail.com as a "Send mail as" address (see MAIL_FROM below).
 *    Run checkSender once from the editor and accept the "Send email as you"
 *    permission prompt (only needed the first time; adds the gmail.send scope).
 *    The daily report stays off until installDailyReportTrigger is run (see
 *    "Scheduled daily report"); a trigger left from an older version removes itself.
 * 4. Run installTravelTaskReminderTrigger once (reminders to close open
 *    Start/End travel cards; see the bottom of this file).
 * 5. Deploy → Manage deployments → pencil → Version: New version → Deploy.
 *    The web-app URL does not change, so the site needs no new setting.
 *
 * What is emailed, and to whom (recipients always come from this script or the
 * accounts sheet, never from the request)
 *   New access request   → ADMIN_NOTIFICATION_EMAILS + every systemadmin account
 *                          (sent by submitAccessRequest_ once the request is stored)
 *   Access approved      → the applicant (sent by updateAccessRequest_ when an
 *                          administrator first marks the request approved)
 *   Travel card filed    → only when it needs approval: its approvers, with a
 *                          short summary and no reports attached
 *                          (notifyCardSubmitted_). The submitter gets nothing.
 *   Open task reminder   → the task's owner, at the expected end of the station
 *                          time and every 6 hours after (runTravelTaskReminders)
 *   Report buttons       → whoever the signed-in sender types (sendReportEmail_)
 *   Daily 07:00 report   → the saved list, only while switched on, each with a
 *                          stop link (see "Scheduled daily report")
 *   Daily/weekly reports → the recipients saved with each schedule from the
 *                          site's email boxes, each with a stop link (see
 *                          "Daily / weekly report schedules")
 *
 * Limits: MailApp allows ~100 recipients/day on a consumer Gmail account and
 * ~1,500/day on Google Workspace; 25 MB per message.
 */

// The system mailbox every tracker email is sent as (From and Reply-To). It must be
// one of the script owner's "Send mail as" addresses: in the owner's Gmail go to
// Settings → Accounts → Send mail as → Add another email address, then confirm
// from the kmcproductionemail inbox. Until it is added, mail goes out from the
// owner's own address instead (nothing breaks).
const MAIL_FROM = "kmcproductiondept@gmail.com";
// Who hears about new access requests (with every systemadmin account that has
// an email), and who reviews a travel card when no supervisor/manager matches.
const ADMIN_NOTIFICATION_EMAILS = "kmcproductiondept@gmail.com, xcellencysehj@gmail.com";
const MAIL_APP_URL = "https://kmc-tracker.vercel.app";
const MAIL_SENDER_NAME = "KMC Tracker";
const MAIL_MAX_RECIPIENTS = 50;
const MAIL_MAX_ATTACHMENTS = 6;
const MAIL_ATTACHMENT_TYPES = [
  "application/pdf", "image/png", "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAIL_EMAIL_RE = /^[^@\s<>(),;:"]+@[^@\s<>(),;:"]+\.[^@\s<>(),;:"]{2,}$/;

function mailEsc_(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function mailPayload_(p) {
  try { return JSON.parse((p && p.payload) || "{}") || {}; } catch (err) { return {}; }
}
function mailRecipients_(input) {
  const seen = {}, valid = [], invalid = [];
  String(input || "").split(/[,;\s]+/).forEach(function (a) {
    a = a.trim();
    if (!a || seen[a.toLowerCase()]) return;
    seen[a.toLowerCase()] = true;
    (MAIL_EMAIL_RE.test(a) ? valid : invalid).push(a);
  });
  return { valid: valid, invalid: invalid };
}
function mailKampalaNow_() {
  return Utilities.formatDate(new Date(), "Africa/Kampala", "d MMMM yyyy, HH:mm");
}
function mailError_(message) { return response({ status: "error", message: message }); }

function mailSend_(opts) {
  const all = opts.to.length + (opts.bcc || []).length;
  if (MailApp.getRemainingDailyQuota() < all) {
    throw new Error("The daily email limit for the sending Gmail account is used up. Try again tomorrow.");
  }
  const msg = {
    htmlBody: opts.html,
    name: MAIL_SENDER_NAME,
    replyTo: MAIL_FROM,
    attachments: opts.attachments || [],
  };
  if (opts.bcc && opts.bcc.length) msg.bcc = opts.bcc.join(",");
  if (GmailApp.getAliases().indexOf(MAIL_FROM) > -1) {
    msg.from = MAIL_FROM;
    GmailApp.sendEmail(opts.to.join(","), opts.subject, "Open this email in an HTML-capable mail app.", msg);
  } else {
    // Alias not added yet: still deliver, from the script owner's own address.
    const plain = { to: opts.to.join(","), subject: opts.subject, htmlBody: opts.html, name: MAIL_SENDER_NAME, replyTo: MAIL_FROM, attachments: msg.attachments };
    if (msg.bcc) plain.bcc = msg.bcc;
    MailApp.sendEmail(plain);
  }
}

// The dark card every tracker email uses. `accent` is the top rule colour.
function mailCard_(accent, title, subtitle, inner) {
  return '<div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">' +
      '<div style="border-top:3px solid ' + accent + ';padding-top:20px;margin-bottom:24px;">' +
        '<h1 style="color:#fff;font-size:18px;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">' + title + "</h1>" +
        '<p style="color:#475569;font-size:11px;margin:0;font-family:monospace;">' + subtitle + "</p>" +
      "</div>" + inner +
      '<div style="border-top:1px solid rgba(255,255,255,.06);padding-top:16px;margin-top:16px;font-size:10px;color:#475569;font-family:monospace;letter-spacing:.06em;">KIIRA MOTORS CORPORATION · Sent automatically by the KMC Bus Tracker</div>' +
    "</div>";
}
function mailBox_(inner) {
  return '<div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:16px;">' + inner + "</div>";
}
function mailTable_(rows) {
  return '<table style="width:100%;border-collapse:collapse;font-size:12px;">' + rows.map(function (r) {
    return '<tr style="border-bottom:1px solid rgba(255,255,255,.06);"><td style="color:#64748b;padding:7px 0;font-family:monospace;width:40%;vertical-align:top;">' + r[0] +
      '</td><td style="color:#f1f5f9;padding:7px 0;' + (r[2] || "") + '">' + r[1] + "</td></tr>";
  }).join("") + "</table>";
}
function mailButton_(label, color) {
  return '<div style="background:rgba(16,185,129,.08);border:1px solid ' + color + ';border-radius:8px;padding:14px 16px;text-align:center;">' +
    '<a href="' + mailEsc_(MAIL_APP_URL) + '" style="color:' + color + ';font-size:13px;font-weight:700;text-decoration:none;">' + label + " →</a></div>";
}
// PDFs / images / workbooks the site attached as data: URLs → blobs.
function mailAttachments_(list) {
  return (list || []).slice(0, MAIL_MAX_ATTACHMENTS).map(function (a) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(String((a && a.dataUrl) || ""));
    if (!m || MAIL_ATTACHMENT_TYPES.indexOf(m[1]) < 0) return null;
    const name = String(a.filename || "attachment").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 120);
    return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
  }).filter(Boolean);
}
// Per-key hourly cap for anything a signed-in user can trigger repeatedly.
function mailRateOk_(key, perHour) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key) || 0);
  if (n >= perHour) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}
const MAIL_ROLE_LABEL = {
  user: "General User", supervisor: "Supervisor", manager: "Manager",
  director: "Director", useradmin: "User Admin", systemadmin: "System Admin", cee: "Cost Estimations Engineer",
};

// ── Dashboard / scoreboard report ─────────────────────────────────────────────
function sendReportEmail_(params) {
  const user = verifySession_(params.session);
  if (!user) return mailError_("unauthorized");

  const d = mailPayload_(params);
  const r = mailRecipients_(d.to);
  if (r.invalid.length) return mailError_("Not a valid email address: " + r.invalid.join(", "));
  if (!r.valid.length) return mailError_("Enter at least one recipient.");
  if (r.valid.length > MAIL_MAX_RECIPIENTS) {
    return mailError_("Too many recipients (" + r.valid.length + "); the limit is " + MAIL_MAX_RECIPIENTS + " per email.");
  }

  const attachments = mailAttachments_(d.attachments);

  const filters = d.filterSummary
    ? '<p style="color:#64748b;font-size:12px;margin:8px 0 0;font-family:monospace;">Filters: <strong style="color:#f1f5f9;">' + mailEsc_(d.filterSummary) + "</strong></p>"
    : "";
  const html =
    '<div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">' +
      '<div style="border-top:3px solid #dc2626;padding-top:20px;margin-bottom:24px;">' +
        '<h1 style="color:#fff;font-size:20px;margin:0 0 4px;letter-spacing:.1em;text-transform:uppercase;">KMC Bus Production Tracker</h1>' +
        '<p style="color:#475569;font-size:12px;margin:0;font-family:monospace;">Dashboard Report · ' + mailEsc_(mailKampalaNow_()) + "</p>" +
      "</div>" +
      '<div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:20px;">' +
        '<p style="color:#94a3b8;font-size:13px;margin:0 0 12px;">Please find attached the latest KMC Bus Production Dashboard report.</p>' +
        '<p style="color:#64748b;font-size:12px;margin:0;font-family:monospace;">Buses on floor: <strong style="color:#f1f5f9;">' + mailEsc_(d.busCount == null ? "—" : d.busCount) + "</strong></p>" +
        filters +
        '<p style="color:#64748b;font-size:12px;margin:8px 0 0;font-family:monospace;">Sent by: <strong style="color:#f1f5f9;">' + mailEsc_(user.username) + "</strong></p>" +
      "</div>" +
      '<div style="border-top:1px solid rgba(255,255,255,.06);padding-top:16px;font-size:10px;color:#475569;font-family:monospace;letter-spacing:.06em;">KIIRA MOTORS CORPORATION — CONFIDENTIAL · Auto-generated by KMC Bus Tracker</div>' +
    "</div>";

  try {
    mailSend_({
      to: r.valid,
      subject: String(d.subject || "KMC Bus Production Dashboard Report").slice(0, 200),
      html: html,
      attachments: attachments,
    });
  } catch (err) {
    return mailError_(String(err && err.message || err).slice(0, 300));
  }
  return response({ status: "ok", sent: true, accepted: r.valid, rejected: [] });
}

// ── Access granted → applicant ────────────────────────────────────────────────
// Sent by updateAccessRequest_ the moment a request is first marked approved
// (the admin's Approve button), so it cannot be skipped. Throws on failure.
function notifyApplicantApproved_(d) {
  const r = mailRecipients_(d.email);
  if (r.valid.length !== 1 || r.invalid.length) throw new Error("Not a valid email address: " + d.email);
  const inner = mailBox_(
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Hi ' + mailEsc_(d.fullName || "there") + ", your access request has been approved. You can now sign in.</p>" +
      mailTable_([
        ["Username", mailEsc_(d.username), "font-weight:700;font-family:monospace;"],
        ["Access Level", mailEsc_(MAIL_ROLE_LABEL[d.role] || "User"), "font-weight:700;"],
      ]) +
      '<p style="color:#64748b;font-size:11px;margin:14px 0 0;">Sign in with the password you chose when you submitted your request.</p>') +
    mailButton_("Open KMC Bus Production Tracker", "#10b981");
  mailSend_({ to: r.valid, subject: "[KMC Tracker] Your access has been approved", html: mailCard_("#10b981", "Access Approved", "KMC Bus Tracker", inner) });
}

// Older sites call this after approving. Administrators only.
function notifyApproved_(params) {
  const user = verifySession_(params.session);
  if (!user || ADMIN_ROLES.indexOf(user.role) < 0) return mailError_("unauthorized");
  const d = mailPayload_(params);
  if (!d.fullName || !d.email || !d.username) return mailError_("Missing required fields.");
  try { notifyApplicantApproved_(d); } catch (err) { return mailError_(String(err && err.message || err).slice(0, 300)); }
  return response({ status: "ok", sent: true, accepted: [d.email], rejected: [] });
}

// ── New access request → administrators ───────────────────────────────────────
// Called by submitAccessRequest_ after the request is stored. Goes to
// ADMIN_NOTIFICATION_EMAILS plus every system administrator account that has an
// email address. Returns true when sent. Capped at 20 an hour overall.
function adminEmails_() {
  const list = mailRecipients_(ADMIN_NOTIFICATION_EMAILS || MAIL_FROM).valid;
  allUsers_().forEach(function (u) {
    if (u.role === "systemadmin" && u.email && MAIL_EMAIL_RE.test(u.email) &&
        list.map(function (x) { return x.toLowerCase(); }).indexOf(String(u.email).toLowerCase()) < 0) list.push(u.email);
  });
  return list;
}
function notifyAdminsOfRequest_(d) {
  if (!mailRateOk_("notifyAdmins_count", 20)) return false;
  const admins = adminEmails_();
  if (!admins.length) return false;
  const e = function (s) { return mailEsc_(String(s == null ? "" : s).slice(0, 500)); };
  const badge = d.accessLevel === "admin" ? "Admin" : d.accessLevel === "supervisor" ? "Supervisor" : "General User";
  const lines = (d.productionLines || []).join(", ");
  const inner = mailBox_(
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">A new access request is waiting for your approval.</p>' +
      mailTable_([
        ["Full Name", e(d.fullName), "font-weight:700;"],
        ["Email", e(d.email)],
        ["Requested Username", e(d.username || "—"), "font-family:monospace;"],
        ["Department", e(d.department || "—")],
        ["Production lines", e(lines || "—")],
        ["Position", e(d.position || "—")],
        ["Requested Access", badge + (d.ceeInterest ? " · CEE interest" : ""), "font-weight:700;"],
      ]) +
      (d.reason ? '<p style="color:#94a3b8;font-size:12px;margin:14px 0 0;">Reason: ' + e(d.reason) + "</p>" : "")) +
    '<p style="color:#a5b4fc;font-size:12px;">Sign in as an administrator and open <strong>Access Requests</strong> to approve or deny.</p>' +
    mailButton_("Open Access Requests", "#a5b4fc");
  mailSend_({
    to: [admins[0]], bcc: admins.slice(1),
    subject: "[KMC Tracker] Access Request — " + String(d.fullName).slice(0, 80) + " (" + badge + ")",
    html: mailCard_("#dc2626", "New Access Request", "KMC Bus Tracker · " + mailEsc_(mailKampalaNow_()), inner),
  });
  return true;
}

// ── Travel Card filed → the person who filed it, and its approvers ────────────
// The site calls this right after a card is submitted, attaching the station
// report and the full bus report as PDFs. Recipients are decided HERE, from the
// accounts sheet, never taken from the request:
//   • the signed-in submitter (their account email) gets a confirmation;
//   • while the card still needs review, the people who can approve it get a
//     request to review it: supervisors assigned to that station (or to no
//     station, who review everything) and managers assigned to its line (or to
//     none). If nobody matches, the administrators (ADMIN_NOTIFICATION_EMAILS).
const CARD_PENDING_STATUSES = ["pending_review", "pending", "rejected", ""];

// Station codes are written differently in places ("B10-01a" / "B10-01A",
// "T01-02 EE" / "T01-02-EE", "Washing Bay" / "WASHING"); compare them like this.
function stationKey_(code) {
  const k = String(code || "").trim().toUpperCase().replace(/\s+/g, "-");
  return k === "WASHING-BAY" ? "WASHING" : k;
}

function cardApproverEmails_(stationCode, lineId, submitter) {
  const seen = {}, out = [];
  const want = stationKey_(stationCode);
  allUsers_().forEach(function (u) {
    if (!u.email || !MAIL_EMAIL_RE.test(u.email)) return;
    if (String(u.username).toLowerCase() === String(submitter || "").toLowerCase()) return;
    const stations = u.assignedStations || [], lines = u.assignedLines || [];
    const ok = (u.role === "supervisor" && (!stations.length || stations.some(function (s) { return stationKey_(s) === want; }))) ||
               (u.role === "manager" && (!lines.length || (lineId && lines.indexOf(lineId) > -1)));
    if (ok && !seen[u.email.toLowerCase()]) { seen[u.email.toLowerCase()] = true; out.push(u.email); }
  });
  return out.length ? out : mailRecipients_(ADMIN_NOTIFICATION_EMAILS || MAIL_FROM).valid;
}

function notifyCardSubmitted_(params) {
  const user = verifySession_(params.session);
  if (!user) return mailError_("unauthorized");
  const d = mailPayload_(params);
  if (!d.stationCode && !d.vin) return mailError_("Missing required fields.");
  const status = String(d.approvalStatus || "");
  // Only cards that need a decision send anything; nothing goes to the submitter.
  if (CARD_PENDING_STATUSES.indexOf(status) === -1) return response({ status: "ok", approvers: 0 });
  if (!mailRateOk_("cardmail_" + String(user.username).toLowerCase(), 40)) return mailError_("Too many emails from this account in the last hour.");

  const me = userRecord_(user.username) || {};
  const e = function (s) { return mailEsc_(String(s == null || s === "" ? "—" : s).slice(0, 300)); };
  const acts = d.activities || {};
  const statusLabel = { pending_review: "Pending review", pending: "Needs further review", rejected: "Rejected / rework" }[status] || "Pending review";
  const timeRow = d.designedTime ? e(d.actualTime) + " min of " + e(d.designedTime) + " min designed" : e(d.actualTime) + " min";
  const summary = mailTable_([
    ["Project", e(d.project)],
    ["Bus", e(d.busModel) + " · " + e(d.vin), "font-family:monospace;"],
    ["Line", e(d.line)],
    ["Station", e(d.station || d.stationCode)],
    ["Operators", e((d.operators || []).join(", "))],
    ["Clock in → out", e(d.clockInText) + " → " + e(d.clockOutText)],
    ["Time used", timeRow, Number(d.actualTime) > Number(d.designedTime) && d.designedTime ? "color:#f59e0b;font-weight:700;" : ""],
    ["Activities", e(acts.complete || 0) + " complete of " + e(acts.total || 0) + (acts.issues ? " · " + e(acts.issues) + " with issues" : "")],
    ["Status", e(statusLabel), "font-weight:700;"],
    ["Filed by", e(me.fullName || d.submittedBy || user.username)],
  ]);
  const subjectTail = String(d.stationCode || "") + " · " + String(d.vin || "").slice(0, 40);

  const approvers = cardApproverEmails_(d.stationCode, d.lineId, user.username);
  if (!approvers.length) return response({ status: "ok", approvers: 0 });
  try {
    mailSend_({
      to: [approvers[0]], bcc: approvers.slice(1),
      subject: "[KMC Tracker] Approval needed — " + subjectTail,
      html: mailCard_("#f59e0b", "Travel Card Awaiting Approval", "KMC Bus Tracker · " + mailEsc_(mailKampalaNow_()),
        mailBox_('<p style="color:#94a3b8;font-size:13px;margin:0 0 14px;">A travel card is waiting for your review.</p>' + summary) +
        '<p style="color:#fcd34d;font-size:12px;">Sign in and open <strong>Pending Reviews</strong> to approve it or send it back.</p>' +
        mailButton_("Open Pending Reviews", "#f59e0b")),
    });
  } catch (err) {
    return mailError_(String(err && err.message || err).slice(0, 300));
  }
  return response({ status: "ok", approvers: approvers.length });
}

// ── Reminders to close open Start/End tasks ───────────────────────────────────
// SET UP (run once from the editor): installTravelTaskReminderTrigger()
// Every 15 minutes it looks at each open task in the "travel_tasks" tab and
// emails its owner when the expected end of the station time has passed, then
// again every 6 hours until the task is closed or discarded.
const TASK_REMINDER_EVERY_HOURS = 6;

function installTravelTaskReminderTrigger() {
  removeTravelTaskReminderTrigger();
  ScriptApp.newTrigger("runTravelTaskReminders").timeBased().everyMinutes(15).create();
  Logger.log("Open-task reminders will be checked every 15 minutes.");
}
function removeTravelTaskReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "runTravelTaskReminders") ScriptApp.deleteTrigger(t);
  });
}

// When the next reminder for this task is due (ms), or null if none is.
function taskReminderDue_(task) {
  if (task.status !== "open") return null;
  const started = new Date(task.startedAt).getTime();
  let firstAt = new Date(task.expectedEnd).getTime();
  if (isNaN(firstAt)) firstAt = started + (task.designedMin > 0 ? task.designedMin : 480) * 60000;
  if (isNaN(firstAt)) return null;
  if (!task.reminderCount) return firstAt;
  const last = new Date(task.lastReminderAt).getTime();
  return (isNaN(last) ? firstAt : last) + TASK_REMINDER_EVERY_HOURS * 3600000;
}

function runTravelTaskReminders(nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const sh = SpreadsheetApp.openById(TRACKER_SHEET_ID).getSheetByName(TRAVEL_TASKS_TAB);
  if (!sh) return 0;
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).toLowerCase().trim(); });
  const users = {};
  allUsers_().forEach(function (u) { users[String(u.username).toLowerCase()] = u; });
  let sent = 0;
  for (let i = 1; i < data.length; i++) {
    const t = travelTaskRow_(headers, data[i]);
    const due = taskReminderDue_(t);
    if (due === null || now < due) continue;
    const u = users[t.owner.toLowerCase()];
    if (!u || !u.email || !MAIL_EMAIL_RE.test(u.email)) continue;
    const mins = Math.max(0, Math.round((now - new Date(t.startedAt).getTime()) / 60000));
    const open = Math.floor(mins / 60) + " h " + (mins % 60) + " min";
    const done = (t.activities || []).filter(function (a) { return a.doneAt; }).length;
    try {
      mailSend_({
        to: [u.email],
        subject: "[KMC Tracker] Close your travel card — " + t.stationCode + " · " + t.vin,
        html: mailCard_("#f59e0b", "Travel Card Still Open", "KMC Bus Tracker · " + mailEsc_(mailKampalaNow_()),
          mailBox_('<p style="color:#94a3b8;font-size:13px;margin:0 0 14px;">Hi ' + mailEsc_(u.fullName || u.username) +
            ", this station job was started but has not been closed. If the work is finished, open the Travel Card, press <strong>Close</strong> on it and submit the card.</p>" +
            mailTable_([
              ["Station", mailEsc_(t.station || t.stationCode)],
              ["Bus", mailEsc_(t.busModel) + " · " + mailEsc_(t.vin), "font-family:monospace;"],
              ["Started", mailEsc_(Utilities.formatDate(new Date(t.startedAt), "Africa/Kampala", "d MMM yyyy, HH:mm"))],
              ["Open for", open, "font-weight:700;color:#f59e0b;"],
              ["Designed time", t.designedMin ? t.designedMin + " min" : "—"],
              ["Activities ticked", done + " of " + (t.activities || []).length],
            ])) +
          '<p style="color:#64748b;font-size:11px;">You will be reminded every ' + TASK_REMINDER_EVERY_HOURS + " hours until it is closed.</p>" +
          mailButton_("Open the Travel Card", "#f59e0b")),
      });
    } catch (err) { Logger.log("Reminder for " + t.id + " failed: " + err); break; }
    const set = function (name, v) { const c = headers.indexOf(name); if (c > -1) sh.getRange(i + 1, c + 1).setValue(v); };
    set("reminder_count", t.reminderCount + 1);
    set("last_reminder_at", new Date(now).toISOString());
    sent++;
  }
  return sent;
}

// ── Scheduled daily report ────────────────────────────────────────────────────
// The reports (2 PDFs + Excel) are built by the site's /api/build-report from the
// live sheet; this script fetches them on a time trigger and emails them. Neither
// side holds a key: the site endpoint sends nothing, and the recipients live in
// this project's Script Properties.
//
// SET UP (run each once from the editor, in this order):
//   1. setScheduledReportRecipients("a@kmc.com, b@kmc.com")
//   2. installDailyReportTrigger()        — every day at 07:00 Kampala time
//   3. runScheduledReport()               — optional test: sends one right now
// Change the list later by running step 1 again.
//
// SWITCHING IT OFF
//   • deactivateScheduledReports() stops the daily email for everyone. The
//     recipient list is kept, so installDailyReportTrigger() turns it back on.
//   • Every report email carries a "Stop receiving this report" link. It takes
//     that one recipient off the list, and switches the report off when nobody
//     is left.
//   • A daily trigger left over from before Nov 2026 switches itself off: the
//     report only sends while installDailyReportTrigger() has marked it active,
//     and a trigger without that mark removes itself the next time it fires.
const REPORT_PARTS = ["slide", "dashboard", "workbook"];
const REPORT_ACTIVE_KEY = "scheduled_report_active";

function setScheduledReportRecipients(list) {
  const r = mailRecipients_(list);
  if (r.invalid.length) throw new Error("Not a valid email address: " + r.invalid.join(", "));
  if (!r.valid.length) throw new Error("Give at least one recipient.");
  if (r.valid.length > MAIL_MAX_RECIPIENTS) throw new Error("At most " + MAIL_MAX_RECIPIENTS + " recipients.");
  PropertiesService.getScriptProperties().setProperty("scheduled_report_to", r.valid.join(","));
  Logger.log("Daily report recipients: " + r.valid.join(", "));
}

function installDailyReportTrigger() {
  removeDailyReportTrigger();
  ScriptApp.newTrigger("runScheduledReport").timeBased().everyDays(1).atHour(7).inTimezone("Africa/Kampala").create();
  PropertiesService.getScriptProperties().setProperty(REPORT_ACTIVE_KEY, "1");
  Logger.log("Daily report scheduled for 07:00 Kampala time.");
}

function removeDailyReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "runScheduledReport") ScriptApp.deleteTrigger(t);
  });
}

// Stops the daily email for everyone. The recipient list is kept.
function deactivateScheduledReports() {
  removeDailyReportTrigger();
  PropertiesService.getScriptProperties().deleteProperty(REPORT_ACTIVE_KEY);
  Logger.log("Daily report switched off. Run installDailyReportTrigger() to switch it back on.");
}

// Stop-link token for one recipient of the 07:00 report (sid empty) or of one
// site schedule (sid = its id), so nobody can take someone else off.
function reportStopToken_(email, sid) {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("report_stop_secret");
  if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("report_stop_secret", secret); }
  const msg = (sid ? String(sid) + "|" : "") + String(email).trim().toLowerCase();
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(msg, secret)).replace(/=+$/, "");
}

function reportStopUrl_(email, sid) {
  let base = "";
  try { base = ScriptApp.getService().getUrl() || ""; } catch (err) { base = ""; }
  if (!base) return "";
  return base + "?action=stopReport&email=" + encodeURIComponent(email) +
    (sid ? "&sid=" + encodeURIComponent(sid) : "") + "&token=" + reportStopToken_(email, sid);
}

// GET ?action=stopReport&email=…[&sid=…]&token=… (the link in the email). Returns a page.
function stopScheduledReport_(params) {
  const email = String(params.email || "").trim().toLowerCase();
  const sid = String(params.sid || "");
  const ok = !!email && !!params.token && params.token === reportStopToken_(email, sid);
  let msg;
  if (!ok) {
    msg = "This link is not valid. Ask an administrator to take you off this report.";
  } else if (sid) {
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const list = reportSchedules_();
      const out = [];
      list.forEach(function (s) {
        if (s.id === sid) s.to = s.to.filter(function (a) { return a.toLowerCase() !== email; });
        if (s.to.length) out.push(s);
      });
      saveReportSchedules_(out);
    } finally { lock.releaseLock(); }
    msg = mailEsc_(email) + " will no longer receive this scheduled KMC report.";
  } else {
    const props = PropertiesService.getScriptProperties();
    const left = mailRecipients_(props.getProperty("scheduled_report_to")).valid
      .filter(function (a) { return a.toLowerCase() !== email; });
    if (left.length) props.setProperty("scheduled_report_to", left.join(","));
    else { props.deleteProperty("scheduled_report_to"); deactivateScheduledReports(); }
    msg = mailEsc_(email) + " will no longer receive the KMC daily production report.";
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:24px;border-top:3px solid #dc2626;">' +
    '<h2 style="margin:0 0 12px;">KMC Bus Production Tracker</h2><p>' + msg + "</p></div>"
  ).setTitle("KMC scheduled report");
}

function runScheduledReport() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(REPORT_ACTIVE_KEY) !== "1") {
    // A trigger from before the on/off switch existed, or one left behind after
    // switching off: remove it instead of sending.
    removeDailyReportTrigger();
    Logger.log("Daily report is switched off; removed its trigger. Run installDailyReportTrigger() to switch it on.");
    return;
  }
  const to = mailRecipients_(props.getProperty("scheduled_report_to")).valid;
  if (!to.length) throw new Error("No recipients: run setScheduledReportRecipients(\"a@kmc.com, b@kmc.com\") first.");

  let busCount = "—";
  const attachments = REPORT_PARTS.map(function (part) {
    const res = UrlFetchApp.fetch(MAIL_APP_URL + "/api/build-report?part=" + part, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error("The report service answered " + res.getResponseCode() + " for " + part + ".");
    busCount = res.getHeaders()["X-Bus-Count"] || busCount;
    const m = /filename="([^"]+)"/.exec(res.getHeaders()["Content-Disposition"] || "");
    return res.getBlob().setName(m ? m[1] : "KMC_" + part);
  });

  const date = Utilities.formatDate(new Date(), "Africa/Kampala", "yyyy-MM-dd");
  const subject = props.getProperty("scheduled_report_subject") || "KMC Bus Production Report — " + date;
  // One email per recipient, so each stop link only removes that person.
  to.forEach(function (addr) {
    const stopUrl = reportStopUrl_(addr);
    const stop = stopUrl
      ? '<p style="color:#475569;font-size:11px;margin:16px 0 0;font-family:monospace;">You get this report every day at 07:00. ' +
        '<a href="' + mailEsc_(stopUrl) + '" style="color:#f87171;">Stop receiving this report</a></p>'
      : "";
    const html =
      '<div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">' +
        '<div style="border-top:3px solid #dc2626;padding-top:20px;margin-bottom:24px;">' +
          '<h1 style="color:#fff;font-size:20px;margin:0 0 4px;letter-spacing:.1em;text-transform:uppercase;">KMC Bus Production Tracker</h1>' +
          '<p style="color:#475569;font-size:12px;margin:0;font-family:monospace;">Scheduled Report · ' + mailEsc_(mailKampalaNow_()) + "</p>" +
        "</div>" +
        '<div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;">' +
          '<p style="color:#94a3b8;font-size:13px;margin:0 0 12px;">Please find attached the latest KMC Bus Production Dashboard report.</p>' +
          '<p style="color:#64748b;font-size:12px;margin:0;font-family:monospace;">Buses on floor: <strong style="color:#f1f5f9;">' + mailEsc_(busCount) + "</strong></p>" +
          '<p style="color:#64748b;font-size:12px;margin:8px 0 0;font-family:monospace;">Attachments: Slide PDF · Dashboard PDF · Excel Workbook</p>' +
        "</div>" + stop +
      "</div>";
    mailSend_({ to: [addr], subject: subject, html: html, attachments: attachments });
  });
  Logger.log("Scheduled report sent to " + to.join(", "));
}

// ── Daily / weekly report schedules (set up from the site) ───────────────────
// The Daily and Weekly options in the site's email boxes save a schedule here
// (saveReportSchedule_). A 15-minute trigger (runReportSchedules) sends each
// schedule once on its day, at or just after its time (Kampala), with the
// report built from live data by the site's /api/build-report. The trigger is
// installed by the first saved schedule, so no editor step is needed.
//
// Switching them off: the creator (or an admin) cancels one in the site's
// email box; each recipient can stop it with the link in the email; and
// deactivateAllReportSchedules() switches every schedule off from the editor.
const REPORT_SCHEDULES_KEY = "report_schedules";
const REPORT_SCHEDULE_FN = "runReportSchedules";
const REPORT_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const REPORT_MAX_PER_USER = 10;
const KAMPALA_OFFSET_MS = 3 * 3600000; // Uganda is UTC+3 all year

function reportSchedules_() {
  try { const v = JSON.parse(PropertiesService.getScriptProperties().getProperty(REPORT_SCHEDULES_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch (err) { return []; }
}
function saveReportSchedules_(list) {
  PropertiesService.getScriptProperties().setProperty(REPORT_SCHEDULES_KEY, JSON.stringify(list));
}
function ensureReportScheduleTrigger_() {
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === REPORT_SCHEDULE_FN; });
  if (!has) ScriptApp.newTrigger(REPORT_SCHEDULE_FN).timeBased().everyMinutes(15).create();
}
function isReportAdmin_(user) { return ADMIN_ROLES.indexOf(user.role) > -1; }

// What the site shows: no internal fields.
function publicSchedule_(s) {
  return { id: s.id, kind: s.kind, to: s.to.join(", "), subject: s.subject, schedule: s.schedule,
    scheduledTime: s.time, weekday: s.weekday || null, startDate: s.from || null, endDate: s.to_date || null,
    filterSummary: s.filterSummary || "", createdBy: s.createdBy, createdAt: s.createdAt, lastSent: s.lastSent || "" };
}

function saveReportSchedule_(params) {
  const user = verifySession_(params.session);
  if (!user) return mailError_("unauthorized");
  const d = mailPayload_(params);
  const r = mailRecipients_(d.to);
  if (r.invalid.length) return mailError_("Not a valid email address: " + r.invalid.join(", "));
  if (!r.valid.length) return mailError_("Enter at least one recipient.");
  if (r.valid.length > MAIL_MAX_RECIPIENTS) return mailError_("At most " + MAIL_MAX_RECIPIENTS + " recipients.");
  const schedule = String(d.schedule || "");
  if (schedule !== "daily" && schedule !== "weekly") return mailError_("Choose Daily or Weekly.");
  const time = String(d.scheduledTime || "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return mailError_("Choose a send time.");
  const weekday = schedule === "weekly" ? String(d.weekday || "").toUpperCase() : "";
  if (schedule === "weekly" && REPORT_DAYS.indexOf(weekday) === -1) return mailError_("Choose a day of the week.");
  const isDate = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); };

  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const list = reportSchedules_();
    const mine = list.filter(function (s) { return String(s.createdBy).toLowerCase() === String(user.username).toLowerCase(); });
    if (mine.length >= REPORT_MAX_PER_USER) return mailError_("You already have " + REPORT_MAX_PER_USER + " schedules. Cancel one first.");
    const s = {
      id: Utilities.getUuid(), kind: d.kind === "scoreboard" ? "scoreboard" : "dashboard",
      to: r.valid, subject: String(d.subject || "KMC Bus Production Report").slice(0, 200),
      schedule: schedule, time: time, weekday: weekday,
      from: isDate(d.dataStartDate) ? d.dataStartDate : "", to_date: isDate(d.dataEndDate) ? d.dataEndDate : "",
      filterSummary: String(d.filterSummary || "").slice(0, 300),
      createdBy: String(user.username), createdAt: new Date().toISOString(), lastSent: "",
    };
    list.push(s);
    saveReportSchedules_(list);
    ensureReportScheduleTrigger_();
    return response({ status: "ok", schedule: publicSchedule_(s) });
  } finally { lock.releaseLock(); }
}

function listReportSchedules_(params) {
  const user = verifySession_(params.session);
  if (!user) return mailError_("unauthorized");
  const all = isReportAdmin_(user);
  const list = reportSchedules_().filter(function (s) {
    return all || String(s.createdBy).toLowerCase() === String(user.username).toLowerCase();
  });
  return response({ status: "ok", schedules: list.map(publicSchedule_) });
}

// id = one schedule; id "all" = every schedule this user may cancel.
function cancelReportSchedule_(params) {
  const user = verifySession_(params.session);
  if (!user) return mailError_("unauthorized");
  const id = String(mailPayload_(params).id || params.id || "");
  if (!id) return mailError_("Missing schedule.");
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const mayCancel = function (s) { return isReportAdmin_(user) || String(s.createdBy).toLowerCase() === String(user.username).toLowerCase(); };
    const list = reportSchedules_();
    const keep = list.filter(function (s) { return !(mayCancel(s) && (id === "all" || s.id === id)); });
    if (keep.length === list.length) return mailError_("Schedule not found, or not yours to cancel.");
    saveReportSchedules_(keep);
    return response({ status: "ok", removed: list.length - keep.length });
  } finally { lock.releaseLock(); }
}

// Run from the editor to switch every site schedule off (the list is cleared).
function deactivateAllReportSchedules() {
  saveReportSchedules_([]);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === REPORT_SCHEDULE_FN) ScriptApp.deleteTrigger(t);
  });
  Logger.log("Every daily/weekly report schedule is switched off.");
}

function kampalaParts_(ms) {
  const k = new Date(ms + KAMPALA_OFFSET_MS);
  const pad = function (n) { return (n < 10 ? "0" : "") + n; };
  return { date: k.toISOString().slice(0, 10), hhmm: pad(k.getUTCHours()) + ":" + pad(k.getUTCMinutes()), day: REPORT_DAYS[k.getUTCDay()] };
}

// The report files for a date range, fetched once per run and shared.
function reportAttachments_(from, to, cache) {
  const key = (from || "") + "|" + (to || "");
  if (cache[key]) return cache[key];
  let busCount = "—";
  const range = (from ? "&from=" + from : "") + (to ? "&to=" + to : "");
  const files = REPORT_PARTS.map(function (part) {
    const res = UrlFetchApp.fetch(MAIL_APP_URL + "/api/build-report?part=" + part + range, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error("The report service answered " + res.getResponseCode() + " for " + part + ".");
    busCount = res.getHeaders()["X-Bus-Count"] || busCount;
    const m = /filename="([^"]+)"/.exec(res.getHeaders()["Content-Disposition"] || "");
    return res.getBlob().setName(m ? m[1] : "KMC_" + part);
  });
  cache[key] = { files: files, busCount: busCount };
  return cache[key];
}

function scheduledReportHtml_(s, busCount, stopUrl) {
  const when = s.schedule === "daily" ? "every day at " + s.time : "every " + s.weekday + " at " + s.time;
  const range = s.from || s.to_date ? (s.from || "start") + " → " + (s.to_date || "today") : "";
  return '<div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">' +
    '<div style="border-top:3px solid #dc2626;padding-top:20px;margin-bottom:24px;">' +
      '<h1 style="color:#fff;font-size:20px;margin:0 0 4px;letter-spacing:.1em;text-transform:uppercase;">KMC Bus Production Tracker</h1>' +
      '<p style="color:#475569;font-size:12px;margin:0;font-family:monospace;">Scheduled Report · ' + mailEsc_(mailKampalaNow_()) + "</p>" +
    "</div>" +
    '<div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;">' +
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 12px;">Please find attached the latest KMC Bus Production report, built from live data.</p>' +
      '<p style="color:#64748b;font-size:12px;margin:0;font-family:monospace;">Buses on floor: <strong style="color:#f1f5f9;">' + mailEsc_(busCount) + "</strong></p>" +
      (range ? '<p style="color:#64748b;font-size:12px;margin:8px 0 0;font-family:monospace;">Data range: <strong style="color:#f1f5f9;">' + mailEsc_(range) + "</strong></p>" : "") +
      '<p style="color:#64748b;font-size:12px;margin:8px 0 0;font-family:monospace;">Attachments: Slide PDF · Dashboard PDF · Excel Workbook</p>' +
      (s.kind === "scoreboard" ? '<p style="margin:14px 0 0;">' + mailButton_("Open the live scoreboard", "#dc2626") + "</p>" : "") +
    "</div>" +
    '<p style="color:#475569;font-size:11px;margin:16px 0 0;font-family:monospace;">Scheduled by ' + mailEsc_(s.createdBy) + ", sent " + mailEsc_(when) + " (Kampala)." +
      (stopUrl ? ' <a href="' + mailEsc_(stopUrl) + '" style="color:#f87171;">Stop receiving this report</a>' : "") + "</p>" +
  "</div>";
}

// Time trigger, every 15 minutes. nowMs is for tests.
function runReportSchedules(nowMs) {
  const k = kampalaParts_(typeof nowMs === "number" ? nowMs : Date.now());
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let sent = 0;
  try {
    const list = reportSchedules_();
    const cache = {};
    list.forEach(function (s) {
      if (s.lastSent === k.date) return;
      if (s.schedule === "weekly" && s.weekday !== k.day) return;
      if (k.hhmm < s.time) return;
      try {
        const rep = reportAttachments_(s.from, s.to_date, cache);
        s.to.forEach(function (addr) {
          mailSend_({ to: [addr], subject: s.subject, html: scheduledReportHtml_(s, rep.busCount, reportStopUrl_(addr, s.id)), attachments: rep.files });
          sent++;
        });
        s.lastSent = k.date; s.lastError = "";
      } catch (err) {
        s.lastError = String(err && err.message || err).slice(0, 200);
        Logger.log("Schedule " + s.id + " failed: " + s.lastError);
      }
    });
    saveReportSchedules_(list);
  } finally { lock.releaseLock(); }
  return sent;
}

// Run from the editor to see who the emails will come from. "Send mail as" must
// list MAIL_FROM below, in the Gmail of the account that runs this script.
function checkSender() {
  Logger.log("Script runs as:        " + Session.getEffectiveUser().getEmail());
  Logger.log("Verified Send-as list: " + (GmailApp.getAliases().join(", ") || "(none)"));
  Logger.log("MAIL_FROM is set to:   " + MAIL_FROM);
  Logger.log(GmailApp.getAliases().indexOf(MAIL_FROM) > -1
    ? "OK: emails will be sent as " + MAIL_FROM
    : "NOT FOUND: emails go out from the script owner's own address. Make MAIL_FROM exactly match one address in the list above.");
}
