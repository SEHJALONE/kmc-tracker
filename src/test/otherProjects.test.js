import { describe, it, expect } from 'vitest';
import {
  lineScope, parseProjectsCsv, parseActivitiesCsv, makeActivity, activityLabel, workLabels, jobProgress,
  isOtherTask, specKey, cutListKey, catalogLineMatches, buildJobReport, stateLabel,
} from '../data/jobOrders';

describe('job-order line scope', () => {
  it('maps assigned stations and lines to Machine Shop, Parts Making and Paint Shop', () => {
    expect(lineScope(['B01-02'], [])).toEqual(['Machine Shop']);
    expect(lineScope(['B04-01'], null)).toEqual(['Parts Making']);
    expect(lineScope(['W01-01A', 'WQ-01'], [])).toEqual(['Parts Making']);
    expect(lineScope(['P01-01'], [])).toEqual(['Paint Shop']);
    expect(lineScope([], ['FRAME', 'PAINT', 'MACHINE'])).toEqual(['Machine Shop', 'Parts Making', 'Paint Shop']);
    expect(lineScope(['C01-02', 'T01-01'], ['TRIM'])).toEqual([]);
  });
  it('matches catalog line names to job-order lines', () => {
    expect(catalogLineMatches('Parts Making', 'Frame Parts Making')).toBe(true);
    expect(catalogLineMatches('Parts Making', 'Frame & Body Welding')).toBe(true);
    expect(catalogLineMatches('Paint Shop', 'Paint Shop')).toBe(true);
    expect(catalogLineMatches('Paint Shop', 'Electrophoresis')).toBe(false);
  });
});

describe('other-project CSVs', () => {
  it('reads the project register, with lines split on semicolons', () => {
    const { projects, errors } = parseProjectsCsv('PROJECT ID,PROJECT NAME,CLIENT,DESCRIPTION,LINES\nprj-1,Tank,Acme,,Machine Shop; paint shop\n,,,,x\nPRJ-2,,x,,\n');
    expect(projects).toEqual([{ id: 'PRJ-1', name: 'Tank', client: 'Acme', description: '', lines: ['Machine Shop', 'Paint Shop'] }]);
    expect(errors).toEqual(['Row 4: needs both a project ID and a name.']);
    expect(parseProjectsCsv('NAME\nx').errors[0]).toMatch(/PROJECT ID/);
  });
  it('reads an activity list', () => {
    const { activities } = parseActivitiesCsv('ACTIVITY,QUANTITY,UNIT,NOTES\nPrimer,2,coats,thin\n,,,\nTop coat,,,\n');
    expect(activities.map(a => [a.name, a.qty, a.unit, a.notes])).toEqual([['Primer', 2, 'coats', 'thin'], ['Top coat', '', '', '']]);
    expect(parseActivitiesCsv('X\n1').errors[0]).toMatch(/ACTIVITY/);
  });
});

describe('progress on activity job orders', () => {
  const job = { id: 'OP-1', kind: 'other', line: 'Paint Shop', projectId: 'PRJ-1', project: 'Tank', items: [], vins: [],
    activities: [makeActivity({ name: 'Primer', qty: 2, unit: 'coats' }), makeActivity({ name: 'Top coat' })] };
  it('counts ticked activities across runs', () => {
    expect(workLabels(job)).toEqual(['Primer · ×2 coats', 'Top coat']);
    expect(activityLabel({ name: 'x', qty: 0 })).toBe('x');
    const runs = [{ jobOrderId: 'OP-1', status: 'closed', startedAt: '2026-11-01T06:00:00Z', closedAt: '2026-11-01T08:00:00Z', activities: [{ name: 'Primer · ×2 coats', doneAt: '2026-11-01T08:00:00Z' }] }];
    const p = jobProgress(job, runs);
    expect([p.done, p.total, p.state]).toEqual([1, 2, 'started']);
    expect(stateLabel(job, 'running')).toBe('Working now');
    runs.push({ jobOrderId: 'OP-1', status: 'closed', startedAt: '2026-11-02T06:00:00Z', closedAt: '2026-11-02T07:00:00Z', activities: [{ name: 'Top coat', doneAt: '2026-11-02T07:00:00Z' }] });
    expect(jobProgress(job, runs).state).toBe('machined');
    expect(stateLabel(job, 'machined')).toBe('Done');
  });
  it('keeps Paint Shop / Parts Making and deleted orders out of the Machine Shop report', () => {
    const ms = { id: 'JO-1', project: 'P', busModel: '10.5m EVS', vins: ['V'], status: 'open', createdAt: '2026-11-01T00:00:00Z', items: [] };
    const deleted = { ...ms, id: 'JO-2', status: 'deleted' };
    const otherMs = { ...ms, id: 'OP-2', kind: 'other', line: 'Machine Shop', busModel: '', projectId: 'PRJ-1', vins: [] };
    const rep = buildJobReport([ms, deleted, job, otherMs], [], { from: '2026-10-31T00:00:00Z', to: '2026-11-30T00:00:00Z' });
    expect(rep.jobs.map(j => j.id)).toEqual(['JO-1', 'OP-2']);
    expect(rep.models.map(m => m.model).sort()).toEqual(['10.5m EVS', 'Other: PRJ-1']);
  });
  it('knows other-project tasks and keys', () => {
    expect(isOtherTask({ jobOrderId: 'OP-261120-ABCD' })).toBe(true);
    expect(isOtherTask({ jobOrderId: 'JO-261120-ABCD' })).toBe(false);
    expect(specKey({ busModel: '', projectId: 'prj-1' })).toBe('OP:PRJ-1');
    expect(specKey({ busModel: '7m EVS' })).toBe('7m EVS');
    expect(cutListKey('a')).toBe('OP:A');
  });
});
