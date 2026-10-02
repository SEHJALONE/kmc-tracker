/**
 * Tracker email, sent by the Apps Script itself (MailApp) from the Gmail account
 * the web app runs as. No email password, App Password or API key exists
 * anywhere — not in the repo, not in Vercel, not in the browser.
 *
 * INSTALL (once)
 * 1. Open the tracker's Apps Script project (the one with doPost / login_).
 * 2. File → New → Script, name it "Mail", and paste this whole file.
 * 3. In doPost(), add the three lines under "WIRE INTO doPost" below, next to the
 *    other `e.parameter.action ===` branches.
 * 4. Add kmcproductionemail@gmail.com as a "Send mail as" address (see MAIL_FROM below).
 *    Run runScheduledReport once from the editor and accept the "Send email as you"
 *    permission prompt (only needed the first time; adds the gmail.send scope).
 *    (Also needs the "connect to an external service" permission — it fetches the
 *    daily report from the site. Run runScheduledReport once to grant it.)
 * 5. Deploy → Manage deployments → pencil → Version: New version → Deploy.
 *    The web-app URL does not change, so the site needs no new setting.
 *
 * WIRE INTO doPost  (e.parameter carries the form fields the site posts)
 *
 *   if (e && e.parameter && e.parameter.action === "sendReportEmail") return sendReportEmail_(e.parameter);
 *   if (e && e.parameter && e.parameter.action === "notifyApproved")  return notifyApproved_(e.parameter);
 *   if (e && e.parameter && e.parameter.action === "notifyAdminNew")  return notifyAdminNew_(e.parameter);
 *
 * Who may send what
 *   sendReportEmail  any signed-in tracker user (valid session)
 *   notifyApproved   administrators only (ADMIN_ROLES, from the main script)
 *   notifyAdminNew   anyone (an applicant has no account yet) — but it can only
 *                    ever email ADMIN_NOTIFICATION_EMAILS, never an address the
 *                    caller chooses, and is rate-limited.
 *
 * Daily 07:00 report: see "Scheduled daily report" at the bottom of this file.
 *
 * Limits: MailApp allows ~100 recipients/day on a consumer Gmail account and
 * ~1,500/day on Google Workspace; 25 MB per message.
 */

// The system mailbox every tracker email is sent as (From and Reply-To). It must be
// one of the script owner's "Send mail as" addresses: in the owner's Gmail go to
// Settings → Accounts → Send mail as → Add another email address, then confirm
// from the kmcproductionemail inbox. Until it is added, mail goes out from the
// owner's own address instead (nothing breaks).
const MAIL_FROM = "kmcproductionemail@gmail.com";
// Who hears about new access requests.
const ADMIN_NOTIFICATION_EMAILS = "kmcproductionemail@gmail.com, xcellencysehj@gmail.com";
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
  if (MailApp.getRemainingDailyQuota() < opts.to.length) {
    throw new Error("The daily email limit for the sending Gmail account is used up. Try again tomorrow.");
  }
  const msg = {
    htmlBody: opts.html,
    name: MAIL_SENDER_NAME,
    replyTo: MAIL_FROM,
    attachments: opts.attachments || [],
  };
  if (GmailApp.getAliases().indexOf(MAIL_FROM) > -1) {
    msg.from = MAIL_FROM;
    GmailApp.sendEmail(opts.to.join(","), opts.subject, "Open this email in an HTML-capable mail app.", msg);
  } else {
    // Alias not added yet: still deliver, from the script owner's own address.
    delete msg.from;
    MailApp.sendEmail({ to: opts.to.join(","), subject: opts.subject, htmlBody: opts.html, name: MAIL_SENDER_NAME, replyTo: MAIL_FROM, attachments: msg.attachments });
  }
}

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

  const attachments = (d.attachments || []).slice(0, MAIL_MAX_ATTACHMENTS).map(function (a) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(String((a && a.dataUrl) || ""));
    if (!m || MAIL_ATTACHMENT_TYPES.indexOf(m[1]) < 0) return null;
    const name = String(a.filename || "attachment").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 120);
    return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
  }).filter(Boolean);

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

// ── Access granted → applicant (administrators only) ──────────────────────────
function notifyApproved_(params) {
  const user = verifySession_(params.session);
  if (!user || ADMIN_ROLES.indexOf(user.role) < 0) return mailError_("unauthorized");

  const d = mailPayload_(params);
  if (!d.fullName || !d.email || !d.username) return mailError_("Missing required fields.");
  const r = mailRecipients_(d.email);
  if (r.valid.length !== 1 || r.invalid.length) return mailError_("Not a valid email address: " + d.email);

  const roleLabel = {
    user: "General User", supervisor: "Supervisor", manager: "Manager",
    director: "Director", useradmin: "User Admin",
  }[d.role] || "User";
  const html =
    '<div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">' +
      '<div style="border-top:3px solid #10b981;padding-top:20px;margin-bottom:24px;">' +
        '<h1 style="color:#fff;font-size:18px;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">Access Approved</h1>' +
        '<p style="color:#475569;font-size:11px;margin:0;font-family:monospace;">KMC Bus Tracker</p>' +
      "</div>" +
      '<div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:16px;">' +
        '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Hi ' + mailEsc_(d.fullName) + ", your access request has been approved. You can now sign in.</p>" +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
          '<tr><td style="color:#64748b;padding:8px 0;font-family:monospace;width:40%;">Username</td><td style="color:#f1f5f9;font-weight:700;font-family:monospace;padding:8px 0;">' + mailEsc_(d.username) + "</td></tr>" +
          '<tr><td style="color:#64748b;padding:8px 0;font-family:monospace;">Access Level</td><td style="color:#f1f5f9;font-weight:700;padding:8px 0;">' + roleLabel + "</td></tr>" +
        "</table>" +
        '<p style="color:#64748b;font-size:11px;margin:14px 0 0;">Sign in with the password you chose when you submitted your request.</p>' +
      "</div>" +
      '<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:14px 16px;text-align:center;">' +
        '<a href="' + mailEsc_(MAIL_APP_URL) + '" style="color:#10b981;font-size:13px;font-weight:700;text-decoration:none;">Open KMC Bus Production Tracker →</a>' +
      "</div>" +
    "</div>";

  try {
    mailSend_({ to: r.valid, subject: "[KMC Tracker] Your access has been approved", html: html });
  } catch (err) {
    return mailError_(String(err && err.message || err).slice(0, 300));
  }
  return response({ status: "ok", sent: true, accepted: r.valid, rejected: [] });
}

// ── New access request → administrators (public, fixed recipients) ────────────
function notifyAdminNew_(params) {
  // Anyone can call this, so cap it: at most 20 notifications an hour overall.
  const cache = CacheService.getScriptCache();
  const sent = Number(cache.get("notifyAdminNew_count") || 0);
  if (sent >= 20) return mailError_("Too many requests right now. The request itself was saved.");
  cache.put("notifyAdminNew_count", String(sent + 1), 3600);

  const d = mailPayload_(params);
  if (!d.fullName || !d.email) return mailError_("Missing required fields.");

  const admins = mailRecipients_(ADMIN_NOTIFICATION_EMAILS || MAIL_FROM).valid;
  if (!admins.length) return mailError_("No administrator address is set.");

  const e = function (s) { return mailEsc_(String(s == null ? "" : s).slice(0, 500)); };
  const badge = d.accessLevel === "admin" ? "Admin" : d.accessLevel === "supervisor" ? "Supervisor" : "General User";
  const row = function (label, value, style) {
    return '<tr style="border-bottom:1px solid rgba(255,255,255,.06);"><td style="color:#64748b;padding:8px 0;font-family:monospace;width:40%;">' + label +
      '</td><td style="color:#f1f5f9;padding:8px 0;' + (style || "") + '">' + value + "</td></tr>";
  };
  const html =
    '<div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">' +
      '<div style="border-top:3px solid #dc2626;padding-top:20px;margin-bottom:24px;">' +
        '<h1 style="color:#fff;font-size:18px;margin:0 0 4px;letter-spacing:.08em;text-transform:uppercase;">New Access Request</h1>' +
        '<p style="color:#475569;font-size:11px;margin:0;font-family:monospace;">KMC Bus Tracker · ' + mailEsc_(mailKampalaNow_()) + "</p>" +
      "</div>" +
      '<div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:16px;">' +
        '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">A user has submitted an access request and is waiting for your approval.</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
          row("Full Name", e(d.fullName), "font-weight:700;") +
          row("Email", e(d.email)) +
          row("Requested Username", e(d.username || "—"), "font-family:monospace;") +
          row("Department", e(d.department || "—")) +
          row("Position", e(d.position || "—")) +
          row("Requested Access", badge, "font-weight:700;") +
        "</table>" +
        (d.reason ? '<p style="color:#94a3b8;font-size:12px;margin:14px 0 0;">Reason: ' + e(d.reason) + "</p>" : "") +
      "</div>" +
      '<p style="color:#a5b4fc;font-size:12px;">Sign in as an administrator and open <strong>Access Requests</strong> to approve or deny.</p>' +
    "</div>";

  try {
    mailSend_({ to: admins, subject: "[KMC Tracker] Access Request — " + String(d.fullName).slice(0, 80) + " (" + badge + ")", html: html });
  } catch (err) {
    return mailError_(String(err && err.message || err).slice(0, 300));
  }
  return response({ status: "ok", sent: true });
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
