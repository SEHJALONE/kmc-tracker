import { describe, it, expect } from 'vitest';
import { TC_LINES, ACTS } from '../data/travelCardSeed';
import { SEED_STATIONS, stationNameForModel } from '../data/stations';
import { EE_LINES, EE_LABELS, EE_ACTS, eeProcessOutdated, applyEeProcess } from '../data/eeTrimProcess';

describe('2026 EE Trim Line process', () => {
  it('the built-in Travel Card data already holds it', () => {
    expect(eeProcessOutdated({ tcLines: TC_LINES, acts: ACTS })).toBe(false);
    for (const [k, v] of Object.entries(EE_ACTS)) expect(ACTS[k]).toEqual(v);
  });

  it('EVS gets T01-01 EE and T01-09 EE right after their main stations', () => {
    const evs = TC_LINES[EE_LINES.EVS].map(l => l.split(':')[0]);
    expect(evs.indexOf('T01-01 EE')).toBe(evs.indexOf('T01-01') + 1);
    expect(evs.indexOf('T01-09 EE')).toBe(evs.indexOf('T01-09') + 1);
    expect(SEED_STATIONS['T01-01-EE'].models).toContain('EVS');
    expect(SEED_STATIONS['T01-09-EE'].models).toContain('EVS');
  });

  it('KDC has no T01-02 EE; the built-in KEC trim follows KDC as before', () => {
    expect(TC_LINES[EE_LINES.KDC].some(l => l.startsWith('T01-02 EE'))).toBe(false);
    expect(ACTS['KEC:T01-01 EE']).toEqual(EE_ACTS['KDC:T01-01 EE']);
  });

  it('applying to an old catalog replaces labels and activities and adds EVS to stations', () => {
    const old = {
      tcLines: {
        [EE_LINES.EVS]: ['T01-01: Floor', 'T01-02 EE: Old', 'T01-09: Doors', 'T01-09-01: Sub'],
        [EE_LINES.KDC]: ['T01-01: Floor', 'T01-01 EE: Old'],
        'Trim Line & Final Assembly — KEC': ['T01-01 EE: KEC'],
      },
      acts: { 'EVS:T01-02 EE': ['old'], 'KEC:T01-01 EE': ['kec'] },
      stations: { 'T01-09-EE': { name: 'x', models: ['KDC', 'KEC'] } },
    };
    const t = applyEeProcess(old);
    expect(t.tcLines[EE_LINES.EVS]).toEqual(['T01-01: Floor', EE_LABELS.EVS['T01-01 EE'], EE_LABELS.EVS['T01-02 EE'],
      'T01-09: Doors', EE_LABELS.EVS['T01-09 EE'], 'T01-09-01: Sub', ...Object.values(EE_LABELS.EVS).filter(l => !/^T01-0[129] EE/.test(l))]);
    expect(t.tcLines[EE_LINES.KDC][1]).toBe(EE_LABELS.KDC['T01-01 EE']);
    expect(t.tcLines['Trim Line & Final Assembly — KEC']).toEqual(['T01-01 EE: KEC']);
    expect(t.acts['EVS:T01-02 EE']).toEqual(EE_ACTS['EVS:T01-02 EE']);
    expect(t.acts['KEC:T01-01 EE']).toEqual(['kec']);
    expect(t.stations['T01-09-EE'].models).toEqual(['KDC', 'KEC', 'EVS']);
    expect(eeProcessOutdated(t)).toBe(false);
  });

  it('the Bus Tracker shows the per-model EE names', () => {
    const st = { code: 'T01-09-EE', ...SEED_STATIONS['T01-09-EE'] };
    expect(stationNameForModel(st, '12m EVS')).toMatch(/HV Insulation Resistance Tests/);
    expect(stationNameForModel(st, '12m KDC')).toBe('Installation and Termination of Ceiling Driver Cabin Components and Destination Signages');
  });
});
