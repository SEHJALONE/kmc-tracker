import { describe, it, expect } from 'vitest';
import {
  parseRegisterDate, parseEcrRegister, parseIncidentRegister, parseKaizenRegister,
  summarizeEcr, summarizeIncidents, summarizeKaizen, displayDate,
} from '../utils/registers.js';
import { parseGrid, availableHoursForRange, deriveRangeKpis } from '../hooks/useScoreboardData.js';
import { describeRange, quarterPeriod, monthLabelsIn } from '../utils/reportPeriod.js';

const today = new Date(2026, 9, 22);

describe('parseRegisterDate — house format is dd.mm.yyyy', () => {
  it('reads dd.mm.yyyy with no flag', () => {
    expect(parseRegisterDate('19.05.2026', { today })).toEqual({ iso: '2026-05-19', raw: '19.05.2026', flag: null });
  });
  it('reads but flags single-digit day/month, two-digit years and spelled-out dates', () => {
    expect(parseRegisterDate('4.8.2026', { today })).toMatchObject({ iso: '2026-08-04', flag: 'format' });
    expect(parseRegisterDate('05.10.26', { today })).toMatchObject({ iso: '2026-10-05', flag: 'format' });
    expect(parseRegisterDate('5th June 2026', { today })).toMatchObject({ iso: '2026-06-05', flag: 'format' });
    expect(parseRegisterDate('15-Sept-2026', { today })).toMatchObject({ iso: '2026-09-15', flag: 'format' });
  });
  it('does not count a date range, a month span or a bare year', () => {
    for (const s of ['29.05–03.06.2026', 'Aug-Sep 2026', '2026']) {
      expect(parseRegisterDate(s, { today })).toMatchObject({ iso: null, flag: 'unreadable' });
    }
  });
  it('does not count a future date (a typed 2027 for 2026)', () => {
    expect(parseRegisterDate('6.8.2027', { today })).toMatchObject({ iso: null, flag: 'future' });
  });
  it('treats blanks and NA as no date, not as an error', () => {
    expect(parseRegisterDate('NA', { today })).toEqual({ iso: null, raw: 'NA', flag: null });
    expect(parseRegisterDate('', { today }).flag).toBe(null);
  });
  it('rejects an impossible day rather than rolling it over', () => {
    expect(parseRegisterDate('31.02.2026', { today }).flag).toBe('unreadable');
  });
  it('can relax the style check for a sheet with its own convention', () => {
    expect(parseRegisterDate('23-Jul-2026', { today, strict: false })).toMatchObject({ iso: '2026-07-23', flag: null });
  });
  it('displays any date back in dd.mm.yyyy', () => {
    expect(displayDate('2026-06-05')).toBe('05.06.2026');
  });
});

const ECR_CSV = [
  'CHANGE MANAGEMENT REGISTER,,,,,,,,,,,,,,,,,,,',
  'TOTAL CHANGES,,,OPEN,,,,,,,,,,,,,,,,',
  'Change ID,Date Raised,Change Requester,Project ,Vehicle Model,Change Title,Change Description & Justification,Change Category,Change Type,Scope / Area Affected,Risk Level,Change Owner,Approver / Change Control Authority,Approval Decision,Decision Date,Implementation Actions / Plan,Target Implementation Date,Actual Implementation Date,Status,Closure Date',
  '626002,15th June 2026 ,S.L.O,45 Units,12m KDC,SIDE GLASS,desc,Design,Minor,Trim,Critical,SFM- TRIM,DPN,Approved,15th June 2026,Install,16th June 2026,17.09.2026,Implemented,',
  'CHG-023,21.09.2026,G.Z,45 Units,7m EVS,MIRROR,,Design,,Body Shop,Low,SPE,DPN,Approved,,,,,,',
  'CHG-026,14.10.2026,RGT,45 Units,7M EVS,ANCHORING,,Design,Major,Body,Medium,SFM,DPN,Pending Assessment,,,,,,',
].join('\n');

describe('ECR register', () => {
  const rows = parseEcrRegister(parseGrid(ECR_CSV), { today });
  it('finds the header below the summary block and reads every change', () => {
    expect(rows.map(r => r.id)).toEqual(['626002', 'CHG-023', 'CHG-026']);
    expect(rows[0]).toMatchObject({ title: 'SIDE GLASS', decision: 'Approved', status: 'Implemented', risk: 'Critical' });
  });
  it('counts a change in a period when it was raised OR implemented in it', () => {
    const sep = summarizeEcr(rows, { start: '2026-09-01', end: '2026-09-30' });
    expect(sep.rows.map(r => r.id)).toEqual(['626002', 'CHG-023']);
    expect(sep.raisedCount).toBe(1);
    expect(sep.implementedCount).toBe(1);
    const q3 = summarizeEcr(rows, quarterPeriod(2026, 1));
    expect(q3.total).toBe(2);
  });
  it('lists every date not written dd.mm.yyyy', () => {
    const { flagged } = summarizeEcr(rows, { start: '2026-01-01', end: '2026-12-31' });
    expect(flagged.map(f => `${f.name}/${f.field}`)).toEqual([
      '626002/Date Raised', '626002/Decision Date',
    ]);
  });
});

const INCIDENT_CSV = [
  'KIIRA MOTORS CORPORATION – PRODUCTION INCIDENT REGISTER,,,,,,,',
  '"Incident\nNo",Date,Time,Location,Involves,Classification,Severity,Description Summary',
  '1,19.05.2026,1400 Hrs,Bodyshop,Product(s),Power Outage,Major,outage',
  '10,29.05–03.06.2026,1100 Hrs,Paint Shop,Product(s),Breakdown,Major,recall',
  '11,10.06.2026,1215 Hrs,Bodyshop,Product(s),Breakdown,Catastrophic,stretcher',
  '33,6.8.2027,17:25 Hrs,Welding,Fire,Fire incident,Major,fire',
].join('\n');

describe('Incident register', () => {
  const rows = parseIncidentRegister(parseGrid(INCIDENT_CSV), { today });
  it('reads the multi-line "Incident No" header', () => {
    expect(rows.map(r => r.no)).toEqual(['1', '10', '11', '33']);
  });
  it('counts by severity within the range, and leaves out rows it cannot date', () => {
    const q2 = summarizeIncidents(rows, quarterPeriod(2025, 4));
    expect(q2.total).toBe(2);
    expect(q2.bySeverity).toMatchObject({ Major: 1, Catastrophic: 1 });
    expect(q2.flagged.map(f => f.name)).toEqual(['#10', '#33']);
  });
});

describe('Kaizen register', () => {
  const csv = [
    'KAIZEN / IMPROVEMENT IDEAS,,,,,,',
    'Date,Kaizen Idea,Workshop,Proposed By,Status,Impact,Notes',
    '23-Jul-2026,Trolley,Paint Shop,,Proposed,,',
    '11-Aug-2026,Fixture,Chassis,,Implemented,,',
    '2026,Light Bulb,Machine Shop,,Implemented,,',
  ].join('\n');
  const rows = parseKaizenRegister(parseGrid(csv), { today });
  it('filters to the month and flags only undatable rows, not the sheet\'s own style', () => {
    const aug = summarizeKaizen(rows, { start: '2026-08-01', end: '2026-08-31' });
    expect(aug.rows.map(k => k.idea)).toEqual(['Fixture']);
    expect(aug.implemented).toBe(1);
    expect(aug.flagged.map(f => f.name)).toEqual(['Light Bulb']);
  });
});

describe('periods', () => {
  it('names a hand-picked range by the month / quarter / year it covers', () => {
    expect(describeRange({ start: '2026-07-01', end: '2026-09-30' }).short).toBe('Q1 FY 2026/27');
    expect(describeRange({ start: '2026-09-01', end: '2026-09-30' }).short).toBe('Sep 2026');
    expect(describeRange({ start: '2026-07-01', end: '2027-06-30' }).short).toBe('FY 2026/27');
    expect(describeRange({ start: '2027-01-01', end: '2027-03-31' }).short).toBe('Q3 FY 2026/27');
    expect(describeRange({ start: '2026-01-01', end: '2026-12-31' }).kind).toBe('range');
    expect(describeRange({ start: '2026-09-03', end: '2026-09-10' }).kind).toBe('range');
  });
  it('lists the month labels a range touches', () => {
    expect([...monthLabelsIn({ start: '2026-11-15', end: '2027-01-02' })]).toEqual(['Nov 26', 'Dec 26', 'Jan 27']);
  });
});

describe('deriveRangeKpis', () => {
  it('works out Available Hours past the end of the Daily Output tab from Working Days / Week', () => {
    // Mon 5 Oct – Sun 11 Oct 2026, 6-day week, 8.5 h shifts
    expect(availableHoursForRange([], 8.5, '2026-10-05', '2026-10-11', 6)).toBe(51);
  });
  it('scopes downtime and prorates Planned Downtime by Available Hours', () => {
    const ev = (iso, minutes, status = 'Closed') => {
      const [y, m, dd] = iso.split('-').map(Number);
      return { workshop: 'Paint Shop', reasonCode: 'D1-Equipment Breakdown', startDate: new Date(y, m - 1, dd), status, minutes };
    };
    const d = {
      daily: [], shiftHoursPerDay: 8.5, workingDaysPerWeek: 6,
      sheetAvailableHours: 1020, plannedDowntimeSheet: 40,
      downtimeAll: [ev('2026-09-02', 120), ev('2026-10-02', 600)],
    };
    const { kv, downtimeEvents } = deriveRangeKpis(d, { start: '2026-09-01', end: '2026-09-30' });
    expect(downtimeEvents).toHaveLength(1);
    expect(kv['Unplanned Downtime (hrs)'].num).toBe(2);
    expect(kv['Available Hours'].num).toBe(26 * 8.5);
    expect(kv['Planned Downtime (hrs)'].num).toBeCloseTo(40 * (26 * 8.5) / 1020);
  });
});
