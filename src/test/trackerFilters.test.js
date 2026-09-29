import { describe, it, expect } from 'vitest';
import { mergeRows, submissionToRow, normVin } from '../hooks/useSheetData.js';
import { matchesStatus, matchesProject } from '../utils/trackerFilters.js';

const sub = (o = {}) => ({
  vin: 'BUKBHY6A1TJ000013', busModel: '13m KEC', project: '5+5 Project', stationCode: 'C02-03',
  timestamp: '2026-09-29T08:00:00Z', clockOut: '2026-09-29T09:00:00Z', designedTime: 240, actualTime: 300,
  approvalStatus: 'approved', ohsIssue: null, activityStatuses: { a: 'complete' }, ...o,
});

describe('tracker rows from submissions', () => {
  it('carries the fields the Project and Status filters need', () => {
    const r = submissionToRow(sub({ ohsIssue: 'Slip', activityStatuses: { a: 'rework' } }));
    expect(r).toMatchObject({ project: '5+5 Project', approvalStatus: 'approved', ohsIssue: 'Slip', overrunMin: 60, reworkFlag: true, model: '13m KEC' });
    expect(r.rawTimestamp).toBe('2026-09-29T09:00:00Z');   // clock-out, like the Travel Card Data tab
  });
  it('no overrun when within designed time; no rework flag by default', () => {
    const r = submissionToRow(sub({ actualTime: 200 }));
    expect(r.overrunMin).toBeNull();
    expect(r.reworkFlag).toBe(false);
  });
  it('strips a stray "VIN " prefix typed into the VIN box', () => {
    expect(normVin('VIN BUKBHY5M1SJ000006')).toBe('BUKBHY5M1SJ000006');
    expect(normVin(' BUKBHY5M1SJ000006 ')).toBe('BUKBHY5M1SJ000006');
  });
  it('keeps old Travel Card Data rows that have no submission, without double counting', () => {
    const legacy = [
      { vin: 'BUKBHY6A1TJ000013', stationCode: 'C02-03', model: '13m KEC', rawTimestamp: 'x', project: null },   // covered by the submission
      { vin: 'OLD-BUS', stationCode: 'B09-01', model: '12m KDC', rawTimestamp: 'y', project: null },              // legacy only
    ];
    const rows = mergeRows([sub()], legacy);
    expect(rows.map(r => r.vin)).toEqual(['BUKBHY6A1TJ000013', 'OLD-BUS']);
  });
});

describe('status filter', () => {
  const rows = [
    { id: 1, approvalStatus: 'approved' }, { id: 2, approvalStatus: 'pending_review' }, { id: 3, approvalStatus: null },
    { id: 4, approvalStatus: 'rejected' }, { id: 5, approvalStatus: 'approved', ohsIssue: 'x', overrunMin: 10, reworkFlag: true },
  ];
  const ids = (s) => rows.filter(r => matchesStatus(r, s)).map(r => r.id);
  it('works for every option', () => {
    expect(ids('ALL')).toEqual([1, 2, 3, 4, 5]);
    expect(ids('APPROVED')).toEqual([1, 5]);
    expect(ids('PENDING')).toEqual([2, 3]);
    expect(ids('OHS')).toEqual([5]);
    expect(ids('OVERRUN')).toEqual([5]);
    expect(ids('REWORK')).toEqual([5]);
  });
});

describe('project filter', () => {
  const fleet = [{ vin: 'BUKBHY6A1TJ000013', model: '13m KEC' }, { vin: 'BUKBHY5M8TJ000036', model: '12m KDC' }];
  it('matches by the card\'s project name', () => {
    expect(matchesProject({ project: '5+5 Project', vin: 'ANY' }, '5+5 Project', [], normVin)).toBe(true);
    expect(matchesProject({ project: '45 Bus Project', vin: 'ANY' }, '5+5 Project', fleet, normVin)).toBe(false);
  });
  it('matches by registered VIN even when the card has no project', () => {
    expect(matchesProject({ project: null, vin: 'bukbhy6a1tj000013' }, '5+5 Project', fleet, normVin)).toBe(true);
    expect(matchesProject({ project: null, vin: 'VIN BUKBHY5M8TJ000036' }, '5+5 Project', fleet, normVin)).toBe(true);
    expect(matchesProject({ project: null, vin: 'OTHER' }, '5+5 Project', fleet, normVin)).toBe(false);
  });
  it('no project selected = everything', () => {
    expect(matchesProject({ project: null, vin: 'x' }, '', [], normVin)).toBe(true);
  });
});
