import { describe, it, expect } from 'vitest';
import { TC_LINES, ACTS, RES } from '../data/travelCardSeed';
import { SEED_STATIONS, stationNameForModel } from '../data/stations';
import { manpowerFor } from '../data/manpowerAllocation';
import {
  CHASSIS_TC_LINES, CHASSIS_ACTS, chassisProcessOutdated, applyChassisProcess, RETIRED_CHASSIS_CODES,
} from '../data/chassisProcess';

const codes = line => TC_LINES[line].map(l => l.split(':')[0]);

describe('Nov 2026 chassis process', () => {
  it('the built-in Travel Card data already holds it', () => {
    expect(chassisProcessOutdated({ tcLines: TC_LINES, acts: ACTS })).toBe(false);
  });

  it('follows the document order, with each quality gate closing its line', () => {
    expect(codes('Chassis Line 01 — EVS')).toEqual(['C01-01', 'C01-02', 'C01-03', 'C01-04', 'CQ-01']);
    expect(codes('Chassis Line 02 — EVS')).toEqual(['C02-01', 'C02-02-01', 'C02-02', 'C02-03-01', 'C02-03', 'C02-04', 'C02-05', 'CQ-02']);
    expect(codes('Chassis Line 01 — KDC')).toEqual(['C01-01', 'C01-02-01', 'C01-02', 'C01-03-01', 'C01-03', 'C01-04', 'CQ-01']);
    expect(codes('Chassis Line 02 — KDC')).toEqual(['C02-01', 'C02-02-01', 'C02-02', 'C02-03', 'C02-04-01', 'C02-04', 'C02-05', 'C02-06', 'C02-07', 'CQ-02']);
  });

  it('KEC shares the EVS chassis', () => {
    for (const n of ['01', '02']) {
      expect(TC_LINES[`Chassis Line ${n} — KEC`]).toEqual(TC_LINES[`Chassis Line ${n} — EVS`]);
      expect(RES[`Chassis Line ${n} — KEC`]).toEqual(RES[`Chassis Line ${n} — EVS`]);
    }
    expect(ACTS['KEC:C02-04']).toEqual(ACTS['EVS:C02-04']);
    expect(SEED_STATIONS['C02-03-01'].models).toEqual(['EVS', 'KEC']);
    expect(SEED_STATIONS['C02-06'].models).toEqual(['KDC']);
    expect(manpowerFor('C02-05', 'KEC')).toEqual(manpowerFor('C02-05', 'EVS'));
  });

  it('moves CQ-02 to Chassis Line 02 on the Bus Tracker and archives unused stations', () => {
    expect(SEED_STATIONS['CQ-02'].line).toBe('CHASSIS2');
    expect(SEED_STATIONS['CQ-01'].line).toBe('CHASSIS1');
    const line1 = Object.entries(SEED_STATIONS).filter(([, s]) => s.line === 'CHASSIS1' && s.active !== false);
    expect(Math.max(...line1.map(([, s]) => s.order))).toBe(SEED_STATIONS['CQ-01'].order);
    for (const code of Object.keys(RETIRED_CHASSIS_CODES)) expect(SEED_STATIONS[code].active, code).toBe(false);
  });

  it('names each station per model on the Bus Tracker', () => {
    const st = { code: 'C02-04', ...SEED_STATIONS['C02-04'] };
    expect(stationNameForModel(st, '12m EVS')).toBe('Steering and Pneumatic System Installation');
    expect(stationNameForModel(st, '13m KEC')).toBe('Steering and Pneumatic System Installation');
    expect(stationNameForModel(st, '12m KDC')).toBe('Integration of Front and Rear Axles');
  });

  it('applying to an old catalog replaces chassis rows and leaves the rest', () => {
    const old = {
      tcLines: { 'Chassis Line 02 — KEC': ['C02-01a: HV'], 'Paint Shop': ['P'] },
      acts: { 'KEC:C02-01a': ['x'], 'EVS:C02-06': ['y'], 'EVS:T01-01': ['keep'] },
      res: { 'Chassis Line 02 — KEC': { 'C02-01a': ['z'] }, 'Paint Shop': { P: ['keep'] } },
      stations: { 'C02-01A': { name: 'HV', line: 'CHASSIS2', order: 1, models: ['KEC'] }, 'CQ-02': { name: 'QG', line: 'CHASSIS1', order: 9, models: ['KDC'], active: false } },
    };
    const t = applyChassisProcess(old);
    expect(t.tcLines['Chassis Line 02 — KEC']).toEqual(CHASSIS_TC_LINES['Chassis Line 02 — KEC']);
    expect(t.tcLines['Paint Shop']).toEqual(['P']);
    expect(t.acts['KEC:C02-01a']).toBeUndefined();
    expect(t.acts['EVS:C02-06']).toBeUndefined();
    expect(t.acts['EVS:T01-01']).toEqual(['keep']);
    expect(t.acts['KDC:C02-06']).toEqual(CHASSIS_ACTS['KDC:C02-06']);
    expect(t.res['Paint Shop']).toEqual({ P: ['keep'] });
    expect(t.stations['C02-01A'].active).toBe(false);
    expect(t.stations['CQ-02']).toMatchObject({ line: 'CHASSIS2', models: ['KDC', 'EVS', 'KEC'] });
    expect(t.stations['CQ-02'].active).toBeUndefined();
    expect(chassisProcessOutdated(t)).toBe(false);
  });
});
