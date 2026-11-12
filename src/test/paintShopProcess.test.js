import { describe, it, expect } from 'vitest';
import { resolveTcCatalog, BUS_MODELS, codeOf } from '../utils/tcCatalog';
import { SEED_STATIONS } from '../data/stations';
import { applyPaintProcess, PAINT_TC_LINE, RETIRED_PAINT_CODES } from '../data/paintShopProcess';

describe('Paint Shop process (Nov 2026 travel tool form)', () => {
  const tc = resolveTcCatalog({});

  it('every model sees the same 30 paint stations in the form order', () => {
    const per = BUS_MODELS.map(m => tc.stationsFor('Paint Shop', m).map(codeOf));
    for (const list of per) expect(list).toEqual(per[0]);
    expect(per[0]).toHaveLength(30);
    expect(per[0][0]).toBe('PQ-01');
    expect(per[0].at(-1)).toBe('PQ-02');
    expect(per[0]).toEqual(expect.arrayContaining(['P07-04', 'P08-05', 'P08-06']));
  });

  it('activities are the same for every model', () => {
    for (const m of BUS_MODELS) {
      expect(tc.actsFor('P07-02', m)).toEqual(['Branding']);
      expect(tc.actsFor('P07-03', m)).toEqual(['Clear coat painting']);
      expect(tc.actsFor('PQ-02', m)).toContain('Dry film thickness (DFT) check');
    }
  });

  it('the tracker uses the same stations and archives the retired ones', () => {
    for (const s of PAINT_TC_LINE) {
      const st = SEED_STATIONS[codeOf(s)];
      expect(st).toMatchObject({ line: 'PAINT', models: ['KDC', 'EVS', 'KEC'] });
      expect(st.active).not.toBe(false);
    }
    for (const code of Object.keys(RETIRED_PAINT_CODES)) expect(SEED_STATIONS[code].active).toBe(false);
  });

  it('replaces old model-specific paint entries in a catalog and leaves other lines alone', () => {
    const out = applyPaintProcess({
      tcLines: { 'Paint Shop': ['P07-02: old'], 'Machine Shop': ['B01-01: x'] },
      acts: { 'KDC:P07-02': ['Clear coat painting'], 'EVS:P07-02': ['old'], 'B01-01': ['cut'] },
      res: { 'Paint Shop': { 'P01-03': ['Anti-Corrosion Primer (L)'] }, 'Machine Shop': { 'B01-01': ['Blade'] } },
      stationModels: { 'P07-03': ['KDC'], 'B10-02': ['KDC', 'KEC'] },
      stations: { 'P07-03': { name: 'old', models: ['KDC'], line: 'PAINT' }, 'P02-05': { name: 'x', line: 'PAINT' } },
    });
    expect(out.tcLines['Machine Shop']).toEqual(['B01-01: x']);
    expect(out.tcLines['Paint Shop']).toEqual(PAINT_TC_LINE);
    expect(out.acts['KDC:P07-02']).toBeUndefined();
    expect(out.acts['EVS:P07-02']).toBeUndefined();
    expect(out.acts['B01-01']).toEqual(['cut']);
    expect(out.stationModels).toEqual({ 'B10-02': ['KDC', 'KEC'] });
    expect(out.stations['P07-03'].models).toEqual(['KDC', 'EVS', 'KEC']);
    expect(out.stations['P02-05'].active).toBe(false);
    expect(out.res['Machine Shop']).toEqual({ 'B01-01': ['Blade'] });
    expect(out.res['Paint Shop']['P08-05']).toContain('Underbody Anti-Corrosion Paint, Black (L)');
  });
});
