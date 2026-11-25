import { describe, it, expect } from 'vitest';
import { buildStationReport, busImage, fmtMin } from '../data/stationReport';
import { partLabel } from '../data/jobOrders';

const card = (x) => ({ stationCode: 'P01-01', line: 'Paint Shop', busModel: '12m EVS', vin: 'V1', actualTime: 60, designedTime: 50, operators: ['Ann', 'Ben'], timestamp: '2026-11-20T10:00:00Z', ...x });

describe('station reports', () => {
  it('adds up cards per station and per bus model', () => {
    const { lines, totals } = buildStationReport({ cards: [
      card(),
      card({ vin: 'V2', actualTime: 120, operators: ['Ann'] }),
      card({ busModel: '12m KDC', vin: 'V3', actualTime: 30, operators: ['Cy'] }),
      card({ timestamp: '2026-01-01T00:00:00Z', vin: 'OLD' }),
    ], from: '2026-11-01T00:00:00Z' });
    const st = lines.flatMap(l => l.stations).find(s => s.code === 'P01-01');
    expect(st.cards).toBe(3);
    expect(st.staff).toBe(3);
    expect(st.buses).toBe(3);
    expect(st.avgMin).toBe(70);
    expect(st.overDesigned).toBe(2);
    const evs = st.models.find(m => m.model === '12m EVS');
    expect(evs).toMatchObject({ cards: 2, buses: 2, staff: 2, avgMin: 90, avgDesigned: 50 });
    expect(totals).toMatchObject({ cards: 3, staff: 3, buses: 3 });
  });

  it('keeps only stations in scope', () => {
    const { totals } = buildStationReport({ cards: [card(), card({ stationCode: 'T01-01' })], keep: c => c.startsWith('P') });
    expect(totals.cards).toBe(1);
  });

  it('counts job order runs: pieces, metres, waste and other projects', () => {
    const item = { balloon: '1', name: 'Rail', qty: 4, spec: 'RHS 40x40', length: '1500', cut: true };
    const jobOrders = [
      { id: 'JO-1', busModel: '12m EVS', items: [item] },
      { id: 'OP-7', kind: 'other', line: 'Paint Shop', projectId: 'PRJ-1', activities: [{ name: 'Primer', qty: 2, unit: 'm2' }] },
    ];
    const runs = [
      { id: 'r1', jobOrderId: 'JO-1', stationCode: 'B01-02', status: 'closed', ownerName: 'Dee', startedAt: '2026-11-20T08:00:00Z', closedAt: '2026-11-20T09:00:00Z',
        activities: [{ name: partLabel(item), doneAt: '2026-11-20T08:30:00Z' }], waste: [{ spec: 'RHS 40x40', amount: 300, unit: 'mm' }] },
      { id: 'r2', jobOrderId: 'OP-7', stationCode: 'P01-01', status: 'closed', ownerName: 'Eve', startedAt: '2026-11-20T08:00:00Z', closedAt: '2026-11-20T08:30:00Z',
        activities: [{ name: 'Primer · ×2 m2', doneAt: '2026-11-20T08:10:00Z' }] },
    ];
    const { lines, totals } = buildStationReport({ jobOrders, runs });
    const all = lines.flatMap(l => l.stations);
    const saw = all.find(s => s.code === 'B01-02').jobs;
    expect(saw).toMatchObject({ runs: 1, jobs: 1, busJobs: 1, pieces: 4, metres: 6, avgRun: 60 });
    expect(saw.waste).toEqual({ m: 0.3 });
    const paint = all.find(s => s.code === 'P01-01').jobs;
    expect(paint.projects).toEqual(['PRJ-1']);
    expect(paint.steps[0]).toMatchObject({ name: 'Primer', times: 1, qty: 2, unit: 'm2' });
    expect(totals.runs).toBe(2);
  });

  it('finds bus pictures and formats minutes', () => {
    expect(busImage('12M EVS')).toBe('/12m EVS.png');
    expect(busImage('10.5 m KDC')).toBe('/10.5m KDC.png');
    expect(busImage('Tank')).toBeNull();
    expect(fmtMin(0)).toBe('-');
    expect(fmtMin(45)).toBe('45 min');
    expect(fmtMin(130)).toBe('2 h 10 min');
  });
});
