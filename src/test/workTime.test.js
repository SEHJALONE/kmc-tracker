import { describe, it, expect } from 'vitest';
import { workingMinutes, recomputeActual, defaultWorkDays, mergeWorkDays } from '../utils/workTime';

const d = s => new Date(s.replace(' ', 'T'));

describe('working time', () => {
  it('within one day everything counts except the scheduled breaks', () => {
    // Tue 2026-09-29 08:00 → 12:00 includes the 10:00–10:30 tea break
    expect(workingMinutes(d('2026-09-29 08:00'), d('2026-09-29 12:00'))).toMatchObject({ gross: 240, counted: 240, breaks: 30, net: 210 });
    // Before 07:00 and after 18:00 count too
    expect(workingMinutes(d('2026-09-29 05:30'), d('2026-09-29 07:00')).net).toBe(90);
    expect(workingMinutes(d('2026-09-29 17:00'), d('2026-09-29 20:00')).net).toBe(180);
    // Saturday and Sunday work on the day it happened counts in full
    expect(workingMinutes(d('2026-09-26 14:00'), d('2026-09-26 17:00')).net).toBe(180);
    expect(workingMinutes(d('2026-09-27 08:00'), d('2026-09-27 09:00')).net).toBe(60);
  });

  it('prefills each day of a multi-day card with the usual hours', () => {
    // Fri 15:00 → Mon 09:00
    const days = defaultWorkDays(d('2026-09-25 15:00'), d('2026-09-28 09:00'));
    expect(days.map(x => [x.date, x.worked, x.start, x.end])).toEqual([
      ['2026-09-25', true, '15:00', '18:00'],   // clock-in day, usual end
      ['2026-09-26', true, '08:00', '14:00'],   // Saturday
      ['2026-09-27', false, '08:00', '14:00'],  // Sunday: not worked unless said
      ['2026-09-28', true, '07:00', '09:00'],   // clock-out day, usual start
    ]);
  });

  it('a multi-day card counts the prefilled hours, or what was entered', () => {
    const start = d('2026-09-25 15:00'), end = d('2026-09-28 09:00');
    // Fri 15–18 (180) + Sat 08–14 (360 − 30 tea − 60 lunch = 270) + Sun 0 + Mon 07–09 (120)
    expect(workingMinutes(start, end).net).toBe(180 + 270 + 120);
    const entered = [
      { date: '2026-09-25', worked: true, start: '15:00', end: '20:00' },  // stayed late Friday
      { date: '2026-09-26', worked: true, start: '08:00', end: '16:00' },  // worked after 2 pm Saturday
      { date: '2026-09-27', worked: true, start: '09:00', end: '12:00' },  // came in Sunday
    ];
    // Fri 300 + Sat (480 − 90 = 390) + Sun (180 − 30 = 150) + Mon 120
    expect(workingMinutes(start, end, entered).net).toBe(300 + 390 + 150 + 120);
  });

  it('keeps the clock-in and clock-out ends fixed whatever was entered', () => {
    const days = mergeWorkDays(defaultWorkDays(d('2026-09-29 16:00'), d('2026-09-30 09:00')),
      [{ date: '2026-09-29', worked: false, start: '01:00', end: '19:00' }]);
    expect(days[0]).toMatchObject({ worked: true, start: '16:00', end: '19:00' });
  });

  it('work that starts after the usual end runs to midnight by default', () => {
    const days = defaultWorkDays(d('2026-09-29 19:00'), d('2026-09-30 02:00'));
    expect(days.map(x => [x.start, x.end])).toEqual([['19:00', '23:59'], ['00:00', '02:00']]);
    expect(workingMinutes(d('2026-09-29 19:00'), d('2026-09-30 02:00')).net).toBe(420);
  });

  it('recomputes a stored card from clock-in + recorded elapsed minutes (+ its days)', () => {
    expect(recomputeActual('2026-09-25 15:00', 3960).net).toBe(570);
    expect(recomputeActual('2026-09-25 15:00', 3960, [{ date: '2026-09-27', worked: true, start: '09:00', end: '12:00' }]).net).toBe(720);
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

describe('addWorkingMinutes', () => {
  it('skips breaks, nights and Sundays', async () => {
    const { addWorkingMinutes } = await import('../utils/workTime');
    const hhmm = d => `${d.getDay()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    // Monday 2026-10-12 09:30 + 60 working min → tea 10:00–10:30 skipped → 11:00
    expect(hhmm(addWorkingMinutes(new Date(2026, 9, 12, 9, 30), 60))).toBe('1 11:00');
    // Monday 17:30 + 60 → 30 today, 30 Tuesday from 07:00 → Tue 07:30
    expect(hhmm(addWorkingMinutes(new Date(2026, 9, 12, 17, 30), 60))).toBe('2 07:30');
    // Saturday 12:30 + 60 → 30 Saturday, Sunday skipped → Monday 07:30
    expect(hhmm(addWorkingMinutes(new Date(2026, 9, 17, 12, 30), 60))).toBe('1 07:30');
    expect(addWorkingMinutes(new Date(), 0)).toBeNull();
  });
});
