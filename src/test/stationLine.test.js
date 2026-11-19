import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';
import { lineFamilyOf, lineBaseOf, lineMatchesStation, correctLineFor } from '../utils/stationLine';
import { resolveTcCatalog } from '../utils/tcCatalog';
import { misfiledStations } from '../utils/catalogGuard';
import { TC_LINES } from '../data/travelCardSeed';

// 2026-11-19: C01-02 cards (Chassis Line 01) were saved under "Trim Line &
// Final Assembly", and W01-12/13 welding cards under "Machine Shop". A user with
// stations on two lines closed a Start/End task, and the travel card reset the
// line to their first assigned station's line while keeping the task's station.

describe('station code decides the line', () => {
  it('knows each family', () => {
    expect(lineFamilyOf('C01-02: Installation of Air Tanks')).toBe('Chassis Line 01');
    expect(lineFamilyOf('C01-03 EE')).toBe('Chassis Line 01');
    expect(lineFamilyOf('CQ-02')).toBe('Chassis Line 02');
    expect(lineFamilyOf('T01-07')).toBe('Trim Line & Final Assembly');
    expect(lineFamilyOf('W01-13')).toBe('Frame & Body Welding');
    expect(lineFamilyOf('B02-03')).toBe('Machine Shop');
    expect(lineFamilyOf('B09-01')).toBe('Frame Parts Making');
    expect(lineFamilyOf('PQ-02')).toBe('Paint Shop');
    expect(lineFamilyOf('Washing Bay')).toBeNull();
  });

  it('strips the model suffix', () => {
    expect(lineBaseOf('Chassis Line 01 — EVS')).toBe('Chassis Line 01');
    expect(lineBaseOf('Paint Shop')).toBe('Paint Shop');
  });

  it('flags the cards that were misfiled', () => {
    expect(lineMatchesStation('Trim Line & Final Assembly — EVS', 'C01-02')).toBe(false);
    expect(lineMatchesStation('Machine Shop', 'W01-13')).toBe(false);
    expect(lineMatchesStation('Chassis Line 01 — EVS', 'C01-02')).toBe(true);
    expect(correctLineFor('Trim Line & Final Assembly — EVS', 'C01-02', '10.5m EVS')).toBe('Chassis Line 01 — EVS');
    expect(correctLineFor('Machine Shop', 'W01-13', '13m KEC')).toBe('Frame & Body Welding — KEC');
    expect(correctLineFor('Chassis Line 01 — KDC', 'C01-02', '12m KDC')).toBe('Chassis Line 01 — KDC');
    // CQ-02 is the Chassis Line 02 quality gate.
    expect(correctLineFor('Chassis Line 01 — KEC', 'CQ-02', '13m KEC')).toBe('Chassis Line 02 — KEC');
    // An EVS bus filed under the KDC version of its line.
    expect(correctLineFor('Frame & Body Welding — KDC', 'W01-01', '10.5m EVS')).toBe('Frame & Body Welding — EVS');
    expect(correctLineFor('Paint Shop', 'P01-01', '12m KDC')).toBe('Paint Shop');
  });
});

describe('catalog lineForStation', () => {
  const tc = resolveTcCatalog({});
  it('finds the station line for the model, ignoring a wrong preferred line', () => {
    expect(tc.lineForStation('C01-02', '10.5m EVS', 'Trim Line & Final Assembly — EVS')).toBe('Chassis Line 01 — EVS');
    expect(tc.lineForStation('W01-13', '13m KEC', 'Machine Shop')).toBe('Frame & Body Welding — KEC');
    expect(tc.lineForStation('C01-02', '12m KDC')).toBe('Chassis Line 01 — KDC');
  });
  it('never returns a line that contradicts the code, even if the catalog lists it there', () => {
    const bad = resolveTcCatalog({ tcLines: { 'Trim Line & Final Assembly — EVS': ['C01-02: Air tanks'] } });
    expect(bad.lineForStation('C01-02', '10.5m EVS', 'Trim Line & Final Assembly — EVS')).toBe('Chassis Line 01 — EVS');
  });
});

describe('catalog guard', () => {
  it('the built-in Travel Card lines have no misfiled stations', () => {
    expect(misfiledStations({ tcLines: TC_LINES })).toEqual([]);
  });
  it('catches a chassis station placed under Trim', () => {
    const draft = { tcLines: { ...TC_LINES, 'Trim Line & Final Assembly — EVS': [...TC_LINES['Trim Line & Final Assembly — EVS'], 'C01-02: Air tanks'] } };
    expect(misfiledStations(draft)).toEqual([{ line: 'Trim Line & Final Assembly — EVS', code: 'C01-02', belongs: 'Chassis Line 01' }]);
  });
});

describe('Apps Script files the station line', () => {
  const SOURCE = readFileSync(resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');
  it('repairs a card sent with the wrong line', async () => {
    const env = loadScripts([SOURCE]);
    const card = {
      timestamp: '2026-11-19T06:20:49.372Z', busModel: '10.5m EVS', project: '100 Bus Project', vin: 'VINX1',
      line: 'Trim Line & Final Assembly — EVS', station: 'C01-02: Installation of Air Tanks', stationCode: 'C01-02',
      clockIn: '2026-11-19 07:50', clockOut: '2026-11-19 09:17', actualTime: 87, designedTime: 120,
      activityStatuses: {}, resourcesUsed: {}, operators: ['A. Op'],
    };
    const r = await env.call({ payload: JSON.stringify(card) });
    expect(r.status).toBe('ok');
    const [head, row] = env.rows('submissions');
    expect(row[head.indexOf('production_line')]).toBe('Chassis Line 01 — EVS');
  });
  it('repairs a model suffix that contradicts the bus', async () => {
    const env = loadScripts([SOURCE]);
    const card = {
      timestamp: '2026-11-10T08:00:00.000Z', busModel: '10.5m EVS', project: 'P', vin: 'VINX3',
      line: 'Frame & Body Welding — KDC', station: 'W01-01: Six Parts', stationCode: 'W01-01', clockIn: '2026-11-10 08:00', clockOut: '2026-11-10 09:00',
      actualTime: 60, designedTime: 55, activityStatuses: {}, resourcesUsed: {}, operators: ['A. Op'],
    };
    await env.call({ payload: JSON.stringify(card) });
    const [head, row] = env.rows('submissions');
    expect(row[head.indexOf('production_line')]).toBe('Frame & Body Welding — EVS');
  });
  it('leaves a correct line alone', async () => {
    const env = loadScripts([SOURCE]);
    const card = {
      timestamp: '2026-10-14T08:00:00.000Z', busModel: '12m KDC', project: 'P', vin: 'VINX2',
      line: 'Paint Shop', station: 'Primer', stationCode: 'P01-01', clockIn: '2026-10-14 08:00', clockOut: '2026-10-14 09:00',
      actualTime: 60, designedTime: 55, activityStatuses: {}, resourcesUsed: {}, operators: ['A. Op'],
    };
    await env.call({ payload: JSON.stringify(card) });
    const [head, row] = env.rows('submissions');
    expect(row[head.indexOf('production_line')]).toBe('Paint Shop');
  });
});
