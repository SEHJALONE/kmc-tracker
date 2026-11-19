import { describe, it, expect } from 'vitest';
import {
  makeItem, partLabel, jobProgress, jobStarted, wasteTotals, wasteText, defaultWasteUnit, buildJobReport, jobReportRows,
} from '../data/jobOrders';
import { machineChoicesFor } from '../utils/machines';
import { wasteRowsFor } from '../components/jobs/JobWaste';
import { jobReportHTML } from '../export/jobOrderReport';

// Job tracker, edit lock, waste and the Machine Shop period report. Made-up parts.
const SAMPLE = [
  ['16', 'Column', 2, '□40x40x3.0', '34'],
  ['104', 'Beam', 1, '□40x40x3.0', '552'],
  ['109', 'Beam', 1, '□40x40x3.0', '511'],
  ['23', 'Longitudinal beam', 2, '□40x40x2.0', '153'],
  ['118', 'Beam', 12, '□40x40x2.5', '88'],
  ['86', 'Longitudinal beam', 5, '□30x30x2.0', ''],
].map(([balloon, name, qty, spec, length], i) => makeItem({ id: `s${i}`, balloon, name, qty, spec, length, cut: balloon !== '86' }));

const job = { id: 'JO-1', project: 'P', busModel: '10.5m EVS', vins: ['V1', 'V2'], status: 'open', createdAt: '2026-11-02T08:00:00.000Z', items: SAMPLE };
const L = i => partLabel(SAMPLE[i]);
const runs = [
  { id: 'r1', jobOrderId: 'JO-1', status: 'closed', stationCode: 'B01-02', ownerName: 'Op', startedAt: '2026-11-03T06:00:00.000Z', closedAt: '2026-11-03T08:00:00.000Z',
    activities: [{ name: L(0), doneAt: '2026-11-03T07:00:00.000Z' }, { name: L(1), doneAt: '2026-11-03T07:30:00.000Z' }],
    waste: [{ spec: '□40x40x3.0', material: 'Hollow section', amount: 300, unit: 'mm' }, { spec: 'Sheet 2mm', amount: 4.5, unit: 'kg' }] },
  { id: 'r2', jobOrderId: 'JO-1', status: 'open', stationCode: 'B01-03', ownerName: 'Op2', startedAt: '2026-11-04T06:00:00.000Z', closedAt: '',
    activities: [{ name: L(3), doneAt: '2026-12-01T07:00:00.000Z' }, { name: L(4), doneAt: '' }], waste: [{ spec: '□40x40x2.0', amount: 1.2, unit: 'm' }] },
  { id: 'r3', jobOrderId: 'JO-1', status: 'discarded', stationCode: 'B01-04', startedAt: '2026-11-04T06:00:00.000Z', activities: [{ name: L(2), doneAt: '2026-11-04T07:00:00.000Z' }] },
];

describe('job progress and the edit lock', () => {
  it('counts parts ticked on any live run and ignores discarded runs', () => {
    expect(jobProgress(job, runs)).toMatchObject({ total: 5, done: 3, state: 'running' });
    expect(jobProgress(job, []).state).toBe('waiting');
    expect(jobProgress(job, [runs[0]]).state).toBe('started');
    expect(jobProgress({ ...job, status: 'closed' }, [runs[0]]).state).toBe('closed');
  });
  it('a job order is editable until a machine has run on it', () => {
    expect(jobStarted(job, [])).toBe(false);
    expect(jobStarted(job, [runs[2]])).toBe(false);
    expect(jobStarted(job, runs)).toBe(true);
  });
});

describe('waste', () => {
  it('presets length for sections and kg for sheets, and adds lengths up in metres', () => {
    expect(defaultWasteUnit('Hollow section')).toBe('mm');
    expect(defaultWasteUnit('Sheet')).toBe('kg');
    expect(wasteTotals([{ spec: 'a', amount: 300, unit: 'mm' }, { spec: 'b', amount: 1.2, unit: 'm' }, { spec: 'c', amount: 2, unit: 'kg' }, { spec: 'd', amount: 3, unit: 'bags' }]))
      .toEqual({ m: 1.5, kg: 2, bags: 3 });
    expect(wasteText(runs[0].waste)).toBe('□40x40x3.0: 300 mm; Sheet 2mm: 4.5 kg');
  });
  it('lists one line per specification the run cuts, keeping what was entered', () => {
    const task = { activities: [{ name: L(0), doneAt: 'x' }, { name: L(1), doneAt: '' }, { name: L(3), doneAt: '' }], waste: [{ spec: '□40x40x3.0', amount: 2, unit: 'm' }, { spec: 'Offcut bin', amount: 1, unit: 'kg' }] };
    const rows = wasteRowsFor(task, job);
    expect(rows.map(r => [r.spec, r.amount, r.unit])).toEqual([['□40x40x3.0', 2, 'm'], ['□40x40x2.0', '', 'mm'], ['Offcut bin', 1, 'kg']]);
    expect(rows[0]).toMatchObject({ parts: 2, cut: 1 });
  });
});

describe('period report', () => {
  const nov = { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z', minutes: () => 60 };
  it('adds up the parts cut and the waste recorded in the period', () => {
    const rep = buildJobReport([job], runs, nov);
    expect(rep.totals).toMatchObject({ jobs: 1, finished: 0, buses: 2, parts: 2, pieces: 3, minutes: 120 });
    expect(rep.totals.metres).toBe(0.6);   // 2 × 34 mm + 552 mm
    expect(rep.specs).toEqual([expect.objectContaining({ spec: '□40x40x3.0', parts: 2, pieces: 3 })]);
    expect(rep.waste.map(w => [w.spec, w.amount, w.unit])).toEqual([['□40x40x2.0', 1.2, 'm'], ['□40x40x3.0', 300, 'mm'], ['Sheet 2mm', 4.5, 'kg']]);
    expect(rep.wasteTotal).toEqual({ m: 1.5, kg: 4.5 });
    expect(rep.models).toEqual([expect.objectContaining({ model: '10.5m EVS', jobs: 1, vins: 2 })]);
    expect(rep.machines.map(m => m.code)).toEqual(['B01-02', 'B01-03']);
    expect(jobReportRows(rep).some(r => r[0] === 'JO-1')).toBe(true);
    expect(jobReportHTML(rep)).toContain('November 2026');
  });
  it('leaves out job orders with nothing in the period', () => {
    expect(buildJobReport([job], runs, { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }).jobs).toHaveLength(0);
  });
  it('marks a job finished in the month its last part was cut', () => {
    const all = SAMPLE.filter(it => it.cut).map((it, i) => ({ name: partLabel(it), doneAt: `2026-11-1${i}T07:00:00.000Z` }));
    const rep = buildJobReport([job], [{ ...runs[0], activities: all }], nov);
    expect(rep.totals.finished).toBe(1);
    expect(rep.jobs[0]).toMatchObject({ state: 'machined', finished: true, done: 5 });
  });
});

describe('machine choice', () => {
  it('offers every machine for a specification, the ones set for its material first', () => {
    const machines = [{ code: 'B01-02' }, { code: 'B01-03' }, { code: 'B02-01' }];
    const r = machineChoicesFor('Sheet', [{ name: 'Sheet', machines: ['B02-01'] }], machines);
    expect(r.preferred.map(m => m.code)).toEqual(['B02-01']);
    expect(r.others.map(m => m.code)).toEqual(['B01-02', 'B01-03']);
    expect(machineChoicesFor('Unknown', [], machines).others).toHaveLength(3);
  });
});
