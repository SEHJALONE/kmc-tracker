// Daily / weekly report schedules, stored and sent by the tracker's Apps Script
// (saveReportSchedule_ / runReportSchedules in tools/mail-relay/Mail.gs). The
// site only saves, lists and cancels them; nothing is kept in the browser.
import { sendViaAppsScript } from './mailer.js';

// Schedules this account may see: its own, or every one for an admin.
export async function listReportSchedules() {
  const r = await sendViaAppsScript('listReportSchedules', {});
  return r.schedules || [];
}

// { kind: 'dashboard'|'scoreboard', to, subject, schedule: 'daily'|'weekly',
//   scheduledTime: 'HH:MM', weekday?, dataStartDate?, dataEndDate?, filterSummary? }
export async function saveReportSchedule(payload) {
  const r = await sendViaAppsScript('saveReportSchedule', payload);
  return r.schedule;
}

// id of one schedule, or 'all' for every schedule this account may cancel.
export async function cancelReportSchedule(id) {
  return sendViaAppsScript('cancelReportSchedule', { id });
}

// The old browser-only list never sent anything; drop it.
export function forgetLocalSchedules() {
  try { localStorage.removeItem('kmc_email_schedules'); } catch { /* storage blocked */ }
}

export const describeSchedule = s =>
  s.schedule === 'daily' ? `Daily at ${s.scheduledTime}` : `Every ${s.weekday} at ${s.scheduledTime}`;
