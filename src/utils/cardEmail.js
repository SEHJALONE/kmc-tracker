// After a Travel Card is filed: build the station report and the full bus report
// as PDFs and hand them to the Apps Script, which emails the submitter a
// confirmation and asks the card's approvers to review it (recipients are chosen
// server-side from the accounts sheet — see notifyCardSubmitted_ in Mail.gs).
import { downloadStationReport, downloadBusReport, stationReportFileName, busReportFileName } from '../export/travelCardReport';
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

const pdfDataUrl = pdf => 'data:application/pdf;base64,' + btoa(pdf.output());
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

// Resolves with the server's reply ({ confirmedTo, approvers, note? }); rejects
// with a message fit to show. A report that fails to render is left out rather
// than stopping the email.
export async function emailCardReports(sub) {
  const attachments = [];
  try {
    attachments.push({ filename: stationReportFileName(sub), dataUrl: pdfDataUrl(await downloadStationReport(sub, { save: false })) });
  } catch (e) { console.warn('Card email: station report failed', e); }
  try {
    const cards = await busCardsFor(sub.vin);
    attachments.push({ filename: busReportFileName(sub.vin), dataUrl: pdfDataUrl(await downloadBusReport(cards.length ? cards : [sub], { vin: sub.vin, save: false })) });
  } catch (e) { console.warn('Card email: bus report failed', e); }
  return sendViaAppsScript('notifyCardSubmitted', { ...cardEmailSummary(sub), attachments });
}

// One line for the Done page.
export function describeCardEmail(reply) {
  const parts = [];
  if (reply.confirmedTo) parts.push(`confirmation sent to ${reply.confirmedTo}`);
  else if (reply.note === 'no-email-on-account') parts.push('no confirmation sent (your account has no email address — ask an admin to add one)');
  if (reply.approvers) parts.push(`${reply.approvers} approver${reply.approvers === 1 ? '' : 's'} notified`);
  return parts.length ? `📧 ${parts.join(' · ')}` : '📧 Nothing to send.';
}
