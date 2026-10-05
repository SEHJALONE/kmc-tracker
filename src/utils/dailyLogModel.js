import { ORG_UNITS, orgUnit } from '../data/orgStructure.js';
import { lookupStation, LINES } from '../data/stations.js';

// ── DPN Operations Daily Log (form KMC.DPN.07/26-FM013) ──────────────────
// Builds the prefilled content of one unit's log for one day, from the
// Travel Cards filed that day and the Production Downtime Log. Everything it
// returns is a starting point: the Daily Log dialog lets the person edit any
// field before the Word document is made.

export const FORM_NO = 'KMC.DPN.07/26-FM013';
export const DEFAULT_START = '7:00 Hrs.';
export const DEFAULT_FINISH = '17:30 Hrs.';
export const REASON_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];

const pad = n => String(n).padStart(2, '0');
export const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The working day a card belongs to. clock_in is written as local wall-clock
// time ("2026-10-02 08:15"); timestamp is UTC ISO, so it is converted.
export function cardDate(card) {
  const ci = String(card.clockIn || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(ci)) return ci.slice(0, 10);
  const t = new Date(card.timestamp);
  return isNaN(t) ? null : isoLocal(t);
}

function cardLineId(card) {
  const st = lookupStation(card.stationCode);
  if (st) return st.line;
  // Cards record the line label, often with the model after it
  // ("Chassis Line 01 — EVS"), and older ones a short form ("Trim").
  const raw = String(card.line || '').split(' — ')[0].trim().toLowerCase();
  if (!raw) return null;
  const line = LINES.find(l => l.id.toLowerCase() === raw || l.label.toLowerCase() === raw)
    || LINES.find(l => l.label.toLowerCase().startsWith(raw));
  return line ? line.id : null;
}

// Travel Card 6M cause → template reason code.
export function reasonFor6M(cause, detail = '') {
  if (/power/i.test(detail)) return 'D2';
  if (cause === 'Machine') return 'D1';
  if (cause === 'Material') return 'D3';
  return 'D6';
}

// "15–30" → 22.5, "120+" → 120: general users log delay as a range only.
function rangeMidpoint(range) {
  const nums = String(range || '').match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return 0;
  return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
}

// Minutes lost on a card and the dominant cause, best source first:
// supervisor's 6M minutes → general user's delay ranges → plain overrun.
function cardDowntime(card) {
  const dt = card.downtime;
  if (dt && Object.keys(dt.causeTimes || {}).length) {
    const entries = Object.entries(dt.causeTimes).filter(([, m]) => m > 0);
    const minutes = entries.reduce((s, [, m]) => s + m, 0);
    const [top] = entries.sort((a, b) => b[1] - a[1]);
    const cause = top?.[0];
    return {
      minutes,
      reason: cause ? reasonFor6M(cause, dt.subCauses?.[cause]) : '',
      note: cause ? [cause, dt.subCauses?.[cause]].filter(Boolean).join(': ') : '',
    };
  }
  const ud = card.unexpectedDelay;
  if (ud && Array.isArray(ud.types) && ud.types.length) {
    const entries = ud.types.map(t => [t, rangeMidpoint(ud.ranges?.[t])]);
    const minutes = entries.reduce((s, [, m]) => s + m, 0);
    const [top] = [...entries].sort((a, b) => b[1] - a[1]);
    return { minutes, reason: reasonFor6M(top[0]), note: `${ud.types.join(', ')} (approx.)` };
  }
  if (card.hasOverrun && card.designedTime > 0 && card.actualTime > card.designedTime) {
    return { minutes: card.actualTime - card.designedTime, reason: '', note: 'Over designed time' };
  }
  return { minutes: 0, reason: '', note: '' };
}

// Share of the card's activities marked complete. A card with no activity
// checklist was filed at clock-out, so the work counts as done.
function cardActual(card) {
  const vals = Object.values(card.activityStatuses || {}).filter(s => s !== 'na');
  if (!vals.length) return 100;
  return Math.round((vals.filter(s => s === 'complete').length / vals.length) * 100);
}

const hours = min => (min > 0 ? Math.round((min / 60) * 100) / 100 : '');

function cardTask(card) {
  const st = lookupStation(card.stationCode);
  const where = st?.name || card.station || card.stationCode || 'Station';
  const bus = [card.project, card.vin].filter(Boolean).join(' ');
  const dt = cardDowntime(card);
  return {
    task: bus ? `${where} — ${bus}` : where,
    planned: 100,
    actual: cardActual(card),
    downtime: hours(dt.minutes),
    reason: dt.minutes > 0 ? dt.reason : '',
    remarks: [card.generalComments, dt.note].filter(Boolean).join('; '),
    source: 'Travel Card',
  };
}

const codeOf = reasonCode => (String(reasonCode || '').match(/^D\d/i)?.[0] || '').toUpperCase();

// 07:00–17:30: no single day's log can lose more than the shift. An event
// that runs on for days shows the shift on its start day, its total in Remarks.
const SHIFT_MIN = 630;

function eventTask(ev) {
  const what = [ev.machineName || ev.workshop, ev.description].filter(Boolean).join(': ');
  const capped = ev.minutes > SHIFT_MIN;
  return {
    task: `Downtime — ${what}`,
    planned: '',
    actual: '',
    downtime: hours(Math.min(ev.minutes, SHIFT_MIN)),
    reason: codeOf(ev.reasonCode),
    remarks: [ev.workshop, ev.status, capped ? `${hours(ev.minutes)} h in total` : '', ev.remark].filter(Boolean).join('; '),
    source: 'Downtime Log',
  };
}

// Most frequent non-empty value.
function mostCommon(values) {
  const n = {};
  values.filter(Boolean).forEach(v => { n[v] = (n[v] || 0) + 1; });
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

export function averageActual(tasks) {
  const vals = tasks.map(t => t.actual).filter(v => v !== '' && v != null && !isNaN(Number(v))).map(Number);
  if (!vals.length) return '';
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

// → the full content of one log, in the template's own field order.
//   submissions:    fetchSubmissions({ withDowntime: true }) output
//   downtimeEvents: parseDowntimeLog() output
//   preparedBy:     { name, role } of whoever is making the document
export function buildDailyLog({ date, unitId, submissions = [], downtimeEvents = [], preparedBy = {} }) {
  const u = orgUnit(unitId) || ORG_UNITS[0];

  const unitCards = submissions.filter(c =>
    cardDate(c) === date && u.lines.includes(cardLineId(c)) && c.approvalStatus !== 'rejected');
  // An operator logs their own work: when they filed cards that day, only
  // theirs are used; otherwise the whole unit's, to pick from.
  const me = String(preparedBy.username || '').toLowerCase();
  const mine = me ? unitCards.filter(c => String(c.submittedBy || '').toLowerCase() === me) : [];
  const cards = mine.length ? mine : unitCards;
  const events = u.workshop
    ? downtimeEvents.filter(ev =>
      ev.startDate && isoLocal(ev.startDate) === date
      && (u.workshop.test(ev.workshop || '') || /^all workshops?$|^all$/i.test(ev.workshop || ''))
      && (!u.reasons || u.reasons.includes(codeOf(ev.reasonCode))))
    : [];

  const tasks = [...cards.map(cardTask), ...events.map(eventTask)];
  const otherReason = events
    .filter(ev => codeOf(ev.reasonCode) === 'D6')
    .map(ev => [ev.machineName || ev.workshop, ev.description].filter(Boolean).join(': '))
    .join('; ');

  const isOperator = preparedBy.role === 'user';
  const operatorName = isOperator ? preparedBy.name : mostCommon(cards.flatMap(c => c.operators || []));
  const supervisorName = !isOperator && preparedBy.name ? preparedBy.name : mostCommon(cards.map(c => c.reviewer));

  return {
    formNo: FORM_NO,
    division: u.division,
    unit: u.unit,
    unitId: u.id,
    date,
    startTime: DEFAULT_START,
    finishTime: DEFAULT_FINISH,
    tasks,
    otherDowntimeReason: otherReason,
    supervisorComment: '',
    operator: { name: operatorName || '', designation: operatorName ? 'Operator' : '', signature: '' },
    supervisor: { name: supervisorName || '', designation: supervisorName ? 'Supervisor' : '', signature: '' },
    sources: { cards: cards.length, events: events.length },
  };
}

// "2026-10-02" → "02/10/2026", the date style used on KMC forms.
export function formDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

// What must be filled before a log is submitted, as messages for the operator.
export function validateDailyLog(log) {
  const errs = [];
  const tasks = log.tasks.filter(t => String(t.task).trim());
  if (!tasks.length) errs.push('Add at least one task.');
  tasks.forEach((t, i) => {
    const n = `Task ${i + 1}`;
    if (t.planned === '' || t.planned == null) errs.push(`${n}: choose the planned status.`);
    if (t.actual === '' || t.actual == null) errs.push(`${n}: choose the actual status.`);
    if (Number(t.downtime) > 0 && !t.reason) errs.push(`${n}: it has downtime, so pick a reason code.`);
  });
  if (tasks.some(t => t.reason === 'D6') && !String(log.otherDowntimeReason).trim()) {
    errs.push('A task uses D6: describe it under "Other downtime reason".');
  }
  if (!String(log.operator.name).trim()) errs.push("Enter the operator's name.");
  return errs;
}
