import { describe, it, expect } from 'vitest';
import { TC_LINES, ACTS } from '../data/travelCardSeed';
import { SEED_STATIONS, stationNameForModel } from '../data/stations';
import { EE_ACTS } from '../data/eeTrimProcess';
import { TRIM_LINE, TRIM_ACTS, TRIM_LABELS, LEFT_TO_EE, LEFT_TO_SUB_ASSEMBLY, trimProcessOutdated, applyTrimProcess } from '../data/trimProcess';
import { TRAVEL_CARD_DOC } from '../data/travelCardRef';

describe('KDC Trim Travel Card', () => {
  it('the built-in data already holds it', () => {
    expect(trimProcessOutdated({ tcLines: TC_LINES, acts: ACTS })).toBe(false);
  });

  it('keeps EE and sub-assembly stations as they were', () => {
    const codes = TC_LINES[TRIM_LINE].map(l => l.split(':')[0]);
    expect(codes).toEqual(expect.arrayContaining(['T01-01 EE', 'T01-11 EE', 'T01-01-01', 'T01-09-01', 'T01-10-01', 'T01-11-01']));
    for (const [k, v] of Object.entries(EE_ACTS)) if (k.startsWith('KDC:')) expect(ACTS[k]).toEqual(v);
    expect(ACTS['KDC:T01-09-01']).toEqual(['Passenger doors sub-assembly']);
  });

  it('leaves EE and sub-assembly work out of the main stations', () => {
    const main = Object.entries(TRIM_ACTS).filter(([k]) => /^KDC:T01-\d\d$/.test(k)).flatMap(([, v]) => v);
    for (const rows of [...Object.values(LEFT_TO_EE), ...Object.values(LEFT_TO_SUB_ASSEMBLY)]) for (const r of rows) expect(main).not.toContain(r);
    expect(main.some(a => /debugging/i.test(a))).toBe(false);
    expect(ACTS['KDC:T01-04-01']).toContain('Cargo rack sub-assembly');
  });

  it('EVS trim is unchanged and KEC follows KDC', () => {
    expect(ACTS['EVS:T01-06'][0]).toBe('Installation of dashboard');
    expect(ACTS['KEC:T01-08']).toEqual(TRIM_ACTS['KDC:T01-08']);
    const st = { code: 'T01-06', ...SEED_STATIONS['T01-06'] };
    expect(stationNameForModel(st, '12m KDC')).toBe('Aluminium Floor Profiles, Rear Side Panels and Windshields');
    expect(stationNameForModel(st, '12m EVS')).toMatch(/^Dashboard, Windshields/);
  });

  it('applying relabels only the main KDC stations', () => {
    const old = { tcLines: { [TRIM_LINE]: ['T01-01: Old', 'T01-01 EE: EE', 'T01-01-01: Sub'] }, acts: { 'KDC:T01-01': ['old'], 'KDC:T01-01 EE': ['ee'] } };
    const t = applyTrimProcess(old);
    expect(t.tcLines[TRIM_LINE]).toEqual([TRIM_LABELS['T01-01'], 'T01-01 EE: EE', 'T01-01-01: Sub']);
    expect(t.acts['KDC:T01-01 EE']).toEqual(['ee']);
    expect(t.acts['KDC:T01-01']).toEqual(TRIM_ACTS['KDC:T01-01']);
  });

  it('every travel card carries the FM004 reference from the Trim card', () => {
    expect(TRAVEL_CARD_DOC).toBe('KMC.DPD.04/26-FM004 · Rev #01 · Issued 17.04.2026');
  });
});
