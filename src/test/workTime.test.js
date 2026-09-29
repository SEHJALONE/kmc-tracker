import { describe, it, expect } from 'vitest';
import { workingMinutes, recomputeActual } from '../utils/workTime';

const d = s => new Date(s.replace(' ', 'T'));

describe('working time', () => {
  it('weekday daytime is elapsed minus breaks', () => {
    // Tue 2026-09-29 08:00 → 12:00 includes the 10:00–10:30 tea break
    expect(workingMinutes(d('2026-09-29 08:00'), d('2026-09-29 12:00'))).toMatchObject({ gross: 240, counted: 240, breaks: 30, net: 210 });
  });
  it('weekday nights count nothing', () => {
    expect(workingMinutes(d('2026-09-29 18:00'), d('2026-09-30 08:00')).net).toBe(0);
    expect(workingMinutes(d('2026-09-29 16:00'), d('2026-09-30 09:00'))).toMatchObject({ gross: 1020, counted: 180, net: 180 });
  });
  it('Sunday counts nothing', () => {
    expect(workingMinutes(d('2026-09-27 08:00'), d('2026-09-27 17:00')).net).toBe(0);
  });
  it('Saturday counts 08:00–13:00 only (tea break removed)', () => {
    expect(workingMinutes(d('2026-09-26 07:00'), d('2026-09-26 18:00'))).toMatchObject({ counted: 300, breaks: 30, net: 270 });
    expect(workingMinutes(d('2026-09-26 14:00'), d('2026-09-26 17:00')).net).toBe(0);
  });
  it('a Fri→Mon span skips Sunday and trims Saturday', () => {
    const w = workingMinutes(d('2026-09-25 10:15'), d('2026-09-28 17:45'));
    // Fri 10:15–18:00 (465 − 15 tea − 60 lunch = 390) + Sat 270 + Sun 0 + Mon 08:00–17:45 (585 − 90 = 495)
    expect(w.net).toBe(390 + 270 + 495);
    expect(w.gross).toBe(4770);
  });
  it('recomputes a stored card from clock-in + recorded elapsed minutes', () => {
    expect(recomputeActual('2026-09-25 10:15', 4770).net).toBe(1155);
    expect(recomputeActual('', 30)).toBeNull();
    expect(recomputeActual('2026-09-25 10:15', 0)).toBeNull();
  });
});

import { buildPresets, presetFor } from '../hooks/useStationPresets';
describe('station presets', () => {
  const subs = [
    { stationCode: 'C01-02', busModel: '13m KEC', timestamp: '2026-09-29T07:23:00Z', resourcesUsed: { 'Air Tanks': '2', 'Air Pipes (m)': '0' }, otherResources: [{ name: 'Tape', qty: '1' }], operators: ['A', 'B'], designedTime: 120 },
    { stationCode: 'C01-02', busModel: '13m KEC', timestamp: '2026-09-29T08:07:00Z', resourcesUsed: { 'Air Tanks': '3' }, otherResources: [], operators: ['C'], designedTime: 120 },
    { stationCode: 'C01-02', busModel: '12m KDC', timestamp: '2026-09-30T08:00:00Z', resourcesUsed: { 'Air Tanks': '9' }, operators: [] },
  ];
  it('uses the latest card of the same model family', () => {
    const p = buildPresets(subs);
    expect(presetFor(p, 'c01-02', '13m KEC')).toMatchObject({ qtys: { 'Air Tanks': '3' }, operators: ['C'], designedTime: 120 });
    expect(presetFor(p, 'C01-02', '12m KDC').qtys).toEqual({ 'Air Tanks': '9' });
  });
  it('falls back to any family, and to null for unknown stations', () => {
    const p = buildPresets(subs);
    expect(presetFor(p, 'C01-02', '12m EVS').qtys).toEqual({ 'Air Tanks': '9' });
    expect(presetFor(p, 'C09-99', '13m KEC')).toBeNull();
  });
});

import { buildFleetOptions } from '../components/DailyFleetLog';
describe('daily fleet log options', () => {
  it('fills projects, VINs and models from catalog, cards and sightings', () => {
    const o = buildFleetOptions({
      catalog: { projects: [{ name: '5+5 Project', active: true }, { name: 'Old', active: false }], projectVins: { '5+5 Project': [{ vin: 'bukbhy6a1tj000013', model: '13m KEC' }] } },
      submissions: [{ project: '5+5 Project', vin: 'BUKBHY6A1TJ000013', busModel: '13m KEC', submittedBy: 'Edmond' }, { project: '45 units', vin: 'V2', busModel: '12m EVS' }],
      sightings: [{ project: '45 units', vin: 'V3', busModel: '', loggedBy: 'Sam' }],
    });
    expect(o.projects).toEqual(['45 units', '5+5 Project']);
    expect(o.vinsByProject['5+5 Project']).toEqual([{ vin: 'BUKBHY6A1TJ000013', model: '13m KEC' }]);
    expect(o.vinsByProject['45 units'].map(v => v.vin)).toEqual(['V2', 'V3']);
    expect(o.models).toContain('13m KEC');
    expect(o.people).toEqual(['Edmond', 'Sam']);
  });
});

import { lineProgress } from '../data/stations';
describe('line progress', () => {
  it('counts only this line and this model’s critical-path stations', () => {
    const p = lineProgress(['C01-01', 'C01-02', 'C01-02-01', 'B01-01', 'CQ-01'], 'CHASSIS1', '13m KEC');
    expect(p.visited).toBe(3);           // subassembly + other line ignored
    expect(p.total).toBe(6);             // CQ-01, C01-01..04, CQ-02
    expect(lineProgress(['C01-03-01'], 'CHASSIS1', '12m KDC').visited).toBe(0);
  });
});

import { trackerStationCode } from '../data/stations';
describe('tracker placement', () => {
  it('shows a bus filed at a sub-assembly at its parent station, and aliases Washing Bay', () => {
    expect(trackerStationCode('C01-02-01')).toBe('C01-02');
    expect(trackerStationCode('c01-02')).toBe('C01-02');
    expect(trackerStationCode('T01-02 EE')).toBe('T01-02-EE');
    expect(trackerStationCode('Washing Bay')).toBe('WASHING');
  });
});

import { SEED_STATIONS as SS, isSubassembly } from '../data/stations';
describe('every station can show a bus on the line tracker', () => {
  it.each(['EVS', 'KDC', 'KEC'])('%s: each active station maps to a drawn (critical-path) station of the same family', (fam) => {
    const bad = Object.entries(SS)
      .filter(([, st]) => st.active !== false && st.models.includes(fam))
      .filter(([code]) => {
        const shown = SS[trackerStationCode(code)];
        return !shown || isSubassembly(trackerStationCode(code)) || shown.active === false || !shown.models.includes(fam);
      }).map(([code]) => code);
    expect(bad).toEqual([]);
  });
});
