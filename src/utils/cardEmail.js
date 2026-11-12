// After a Travel Card is filed and needs approval, the Apps Script emails the
// card's approvers (chosen server-side from the accounts sheet — see
// notifyCardSubmitted_ in Mail.gs). busCardsFor also feeds the bus report download.
import { fetchSubmissions } from '../hooks/useSubmissionsData';
import { SEED_STATIONS } from '../data/stations';
import { sendViaAppsScript } from '../data/mailer';

const LS_GET = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

// Every card filed for this VIN from ANY device (the sheet), plus this device's
// own recent cards the sheet hasn't caught up with yet (one submitted seconds
// ago), de-duplicated by station + submit time.
export async function busCardsFor(vin) {
  const vinKey = String(vin).trim().toUpperCase();
  let fromSheet = [];
  try {
    fromSheet = (await fetchSubmissions({ withDowntime: true })).filter(c => String(c.vin).trim().toUpperCase() === vinKey);
  } catch (e) { console.warn('Bus report: sheet unavailable, using this device\'s cards only.', e); }
  const local = LS_GET(`kmc_bus_log_${vin}`, []);
  const seen = new Set(fromSheet.map(c => `${c.stationCode}|${c.timestamp}`));
  return [...fromSheet, ...local.filter(c => !seen.has(`${c.stationCode}|${c.timestamp}`))];
}

const when = iso => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function cardEmailSummary(sub) {
  const statuses = Object.values(sub.activityStatuses || {});
  return {
    project: sub.project, busModel: sub.busModel, vin: sub.vin,
    line: sub.line, lineId: SEED_STATIONS[sub.stationCode]?.line || '',
    station: sub.station, stationCode: sub.stationCode, operators: sub.operators || [],
    clockInText: when(sub.clockIn), clockOutText: when(sub.clockOut),
    actualTime: sub.actualTime, designedTime: sub.designedTime,
    approvalStatus: sub.approvalStatus || '', submittedBy: sub.submittedBy || '',
    activities: {
      total: new Set([...Object.keys(sub.activityStatuses || {}), ...(sub.addedActivities || [])]).size,
      complete: statuses.filter(s => s === 'complete').length,
      issues: statuses.filter(s => s === 'issue' || s === 'rework').length,
    },
  };
}

// Cards that still need a supervisor's or manager's decision. Only these send
// an email, and only to the approvers: no confirmation to the submitter and no
// station or bus report attached.
export const CARD_NEEDS_APPROVAL = ['pending_review', 'pending', 'rejected', ''];
export const needsApproval = sub => CARD_NEEDS_APPROVAL.includes(String(sub?.approvalStatus ?? ''));

// Resolves with the server's reply ({ approvers }), or null when the card needs
// no approval; rejects with a message fit to show.
export async function notifyApprovers(sub) {
  if (!needsApproval(sub)) return null;
  return sendViaAppsScript('notifyCardSubmitted', cardEmailSummary(sub));
}

// One line for the Done page.
export function describeCardEmail(reply) {
  if (reply?.approvers) return `📧 ${reply.approvers} approver${reply.approvers === 1 ? '' : 's'} asked to review this card`;
  return '';
}
