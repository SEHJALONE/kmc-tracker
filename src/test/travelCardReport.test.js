import { describe, it, expect } from 'vitest';
import { planPageCuts, summariseBus, stationReportHTML, busReportHTML, fmtDur } from '../export/travelCardReport.js';

const card = (over = {}) => ({
  timestamp: '2026-09-28T10:00:00Z', busModel: '12m KDC', project: '45 Bus Project', vin: 'KMC0012',
  line: 'Chassis Line 01 — KDC', station: 'C01-01: VIN Engraving', stationCode: 'C01-01',
  operators: ['Amos'], actualTime: 50, designedTime: 45, approvalStatus: 'approved',
  activityStatuses: { 'VIN engraving': 'complete' }, resourcesUsed: { 'Tool Tip': '1' }, otherResources: [],
  ...over,
});

describe('planPageCuts', () => {
  it('cuts only at safe row/card edges and covers the whole height', () => {
    const pages = planPageCuts(2500, [300, 700, 950, 1100, 1900, 2050, 2400], 1000);
    expect(pages).toEqual([[0, 950], [950, 1900], [1900, 2500]]);
  });
  it('falls back to a hard cut only when no safe edge fills 40% of a page', () => {
    expect(planPageCuts(2200, [100, 2100], 1000)).toEqual([[0, 1000], [1000, 2000], [2000, 2200]]);
  });
  it('a short report is one page', () => {
    expect(planPageCuts(800, [200, 500], 1000)).toEqual([[0, 800]]);
  });
});

describe('summariseBus', () => {
  it('keeps the latest card per station and totals time / downtime', () => {
    const S = summariseBus([
      card({ timestamp: '2026-09-20T10:00:00Z', actualTime: 90 }),                 // superseded
      card({ timestamp: '2026-09-21T10:00:00Z', actualTime: 50 }),                 // latest C01-01
      card({ stationCode: 'C01-03', station: 'C01-03: Steering', actualTime: 100, designedTime: 120,
        activityStatuses: { 'Installation of clutch': 'issue' },
        hasDowntime: false, otherResources: [{ name: 'Tool Tip', qty: '2' }] }),
    ]);
    expect(S.cards).toHaveLength(2);
    expect(S.actual).toBe(150);
    expect(S.designed).toBe(165);
    expect(S.downtimeCards.map(c => c.stationCode)).toEqual(['C01-01']);
    expect(S.exceptions).toEqual([{ code: 'C01-03', activity: 'Installation of clutch', status: 'issue' }]);
    // 1 (C01-01 latest card, from the station list) + 1 (C01-03 station list) + 2 (C01-03 added)
    expect(S.consumables.find(c => c.name === 'Tool Tip').qty).toBe(4);
  });
});

describe('report HTML', () => {
  it('escapes user-entered text', () => {
    const html = stationReportHTML(card({ generalComments: '<img src=x onerror=alert(1)>', ohsIssue: 'x' }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
  it('switches the logo lockup with the theme', () => {
    expect(stationReportHTML(card(), { theme: 'light' })).toContain('/kmc%20logo.png');
    expect(stationReportHTML(card(), { theme: 'dark' })).toContain('/kmc%20logo%202.png');
    expect(busReportHTML([card()], { theme: 'dark' })).toContain('/kmc%20logo%202.png');
  });
  it('uses the bus model render as the hero image', () => {
    expect(stationReportHTML(card({ busModel: '8.5m EVS' }))).toContain('/8.5m%20EVS.png');
  });
  it('formats durations', () => {
    expect(fmtDur(45)).toBe('45 min');
    expect(fmtDur(125)).toBe('2h 05m');
    expect(fmtDur(-3)).toBe('—');
  });
});
