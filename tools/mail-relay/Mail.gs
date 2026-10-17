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
 *    Run runScheduledReport once from the editor and accept the "Send email as you"
 *    permission prompt (only needed the first time; adds the gmail.send scope).
 *    (Also needs the "connect to an external service" permission — it fetches the
 *    daily report from the site. Run runScheduledReport once to grant it.)
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
 *   Travel card filed    → the signed-in submitter, with the station report and
 *                          the full bus report attached; and, while it awaits
 *                          review, its approvers (notifyCardSubmitted_)
 *   Open task reminder   → the task's owner, at the expected end of the station
 *                          time and every 6 hours after (runTravelTaskReminders)
 *   Report buttons       → whoever the signed-in sender types (sendReportEmail_)
 *   Daily 07:00 report   → the saved list (see "Scheduled daily report")
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

function cardApproverEmails_(stationCode, lineId, submitter) {
  const seen = {}, out = [];
  allUsers_().forEach(function (u) {
    if (!u.email || !MAIL_EMAIL_RE.test(u.email)) return;
    if (String(u.username).toLowerCase() === String(submitter || "").toLowerCase()) return;
    const stations = u.assignedStations || [], lines = u.assignedLines || [];
    const ok = (u.role === "supervisor" && (!stations.length || stations.indexOf(stationCode) > -1)) ||
               (u.role === "manager" && (!lines.length || (lineId && lines.indexOf(lineId) > -1)));
    if (ok && !seen[u.email.toLowerCase()]) { seen[u.email.toLowerCase()] = true; out.push(u.email); }
  });
  return out.length ? out : mailRecipients_(ADMIN_NOTIFICATION_EMAILS || MAIL_FROM).valid;
}

function notifyCardSubmitted_(params) {
  const user = verifySession_(params.session);
  if (!user) return mailError_("unauthorized");
  if (!mailRateOk_("cardmail_" + String(user.username).toLowerCase(), 40)) return mailError_("Too many emails from this account in the last hour.");
  const d = mailPayload_(params);
  if (!d.stationCode && !d.vin) return mailError_("Missing required fields.");

  const me = userRecord_(user.username) || {};
  const e = function (s) { return mailEsc_(String(s == null || s === "" ? "—" : s).slice(0, 300)); };
  const attachments = mailAttachments_(d.attachments);
  const acts = d.activities || {};
  const status = String(d.approvalStatus || "");
  const statusLabel = { pending_review: "Pending review", pending: "Needs further review", rejected: "Rejected / rework", approved: "Approved" }[status] || status || "Pending review";
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
  const files = attachments.length
    ? '<p style="color:#64748b;font-size:11px;margin:12px 0 0;font-family:monospace;">Attached: ' + attachments.map(function (b) { return mailEsc_(b.getName()); }).join(" · ") + "</p>"
    : "";
  const subjectTail = String(d.stationCode || "") + " · " + String(d.vin || "").slice(0, 40);

  const result = { status: "ok", confirmedTo: "", approvers: 0 };
  const errors = [];
  if (me.email && MAIL_EMAIL_RE.test(me.email)) {
    try {
      mailSend_({
        to: [me.email], attachments: attachments,
        subject: "[KMC Tracker] Travel card received — " + subjectTail,
        html: mailCard_("#10b981", "Travel Card Received", "KMC Bus Tracker · " + mailEsc_(mailKampalaNow_()),
          mailBox_('<p style="color:#94a3b8;font-size:13px;margin:0 0 14px;">Hi ' + mailEsc_(me.fullName || user.username) +
            ", your travel card has been saved. The station report and the full bus report are attached." +
            (CARD_PENDING_STATUSES.indexOf(status) > -1 ? " Your supervisor has been asked to review it." : "") + "</p>" + summary + files)),
      });
      result.confirmedTo = me.email;
    } catch (err) { errors.push(String(err && err.message || err)); }
  }
  if (CARD_PENDING_STATUSES.indexOf(status) > -1) {
    const approvers = cardApproverEmails_(d.stationCode, d.lineId, user.username);
    if (approvers.length) {
      try {
        mailSend_({
          to: [approvers[0]], bcc: approvers.slice(1), attachments: attachments,
          subject: "[KMC Tracker] Approval needed — " + subjectTail,
          html: mailCard_("#f59e0b", "Travel Card Awaiting Approval", "KMC Bus Tracker · " + mailEsc_(mailKampalaNow_()),
            mailBox_('<p style="color:#94a3b8;font-size:13px;margin:0 0 14px;">A travel card is waiting for your review.</p>' + summary + files) +
            '<p style="color:#fcd34d;font-size:12px;">Sign in and open <strong>Pending Reviews</strong> to approve it or send it back.</p>' +
            mailButton_("Open Pending Reviews", "#f59e0b")),
        });
        result.approvers = approvers.length;
      } catch (err) { errors.push(String(err && err.message || err)); }
    }
  }
  if (errors.length && !result.confirmedTo && !result.approvers) return mailError_(errors[0].slice(0, 300));
  if (!me.email) result.note = "no-email-on-account";
  return response(result);
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
// Change the list later by running step 1 again. To stop the daily email, run
// removeDailyReportTrigger().
const REPORT_PARTS = ["slide", "dashboard", "workbook"];

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
  Logger.log("Daily report scheduled for 07:00 Kampala time.");
}

function removeDailyReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "runScheduledReport") ScriptApp.deleteTrigger(t);
  });
}

function runScheduledReport() {
  const props = PropertiesService.getScriptProperties();
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
      "</div>" +
    "</div>";

  mailSend_({
    to: to,
    subject: props.getProperty("scheduled_report_subject") || "KMC Bus Production Report — " + date,
    html: html,
    attachments: attachments,
  });
  Logger.log("Scheduled report sent to " + to.join(", "));
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
