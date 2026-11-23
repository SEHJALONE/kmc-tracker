import { describe, it, expect } from 'vitest';
import { stationDisplayNames, stationNameForModel } from '../data/stations';

const st = (over = {}) => ({ code: 'T09-99-EE', name: 'Base name', line: 'TRIM', models: ['EVS', 'KDC', 'KEC'], ...over });

describe('Bus Tracker names per model', () => {
  it('without names set, reads as before (KEC trim follows KDC)', () => {
    const n = stationDisplayNames(st());
    expect([n.evs, n.kdc, n.kec]).toEqual(['Base name', 'Base name', 'Base name']);
    expect(n.differs).toBe(false);
  });

  it('a name set for one model is shown for that model only', () => {
    const s = st({ names: { kec: 'KEC wording' } });
    expect(stationNameForModel(s, '13m KEC')).toBe('KEC wording');
    expect(stationNameForModel(s, '12m EVS')).toBe('Base name');
    expect(stationNameForModel(s, '12m KDC')).toBe('Base name');
    expect(stationDisplayNames(s).differs).toBe(true);
  });

  it('wins over the built-in per-model names', () => {
    const s = { code: 'T01-09-EE', name: 'x', line: 'TRIM', models: ['KDC', 'KEC'] };
    const builtIn = stationDisplayNames(s).kec;
    expect(builtIn).toBe(stationDisplayNames(s).kdc);
    expect(stationDisplayNames({ ...s, names: { kec: 'Own' } }).kec).toBe('Own');
    expect(stationDisplayNames({ ...s, names: { kec: 'Own' } }).kdc).toBe(builtIn);
  });
});
