import { describe, it, expect } from 'vitest';
import { travelCardGaps, fixGap, syncStationToTravelCard } from '../utils/catalogGaps';
import { resolveTcCatalog, codeOf } from '../utils/tcCatalog';
import { TC_LINES, ACTS, RES, LINE_MODELS, STATION_MODELS } from '../data/travelCardSeed';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';

const EVS_TRIM = 'Trim Line & Final Assembly — EVS';
const draft = () => structuredClone({
  tcLines: TC_LINES, acts: ACTS, res: RES, lineModels: LINE_MODELS, stationModels: STATION_MODELS,
  lines: SEED_LINES, stations: SEED_STATIONS,
});
const startList = (d, line, model) => resolveTcCatalog({}, d).stationsFor(line, model).map(codeOf);

describe('Bus Tracker stations vs Travel Card lines', () => {
  it('the built-in data has no gaps', () => {
    expect(travelCardGaps(draft())).toEqual([]);
  });

  // 16 Nov 2026: T01-01-EE ticked for all models on the tracker, but the EVS
  // Trim line on the Travel Card never got it.
  it('finds and fixes a station missing from one model\'s line', () => {
    const d = draft();
    d.stations['T01-01-EE'].models = ['KDC', 'EVS', 'KEC'];
    const gaps = travelCardGaps(d);
    expect(gaps).toEqual([expect.objectContaining({ code: 'T01-01-EE', fam: 'EVS', target: EVS_TRIM, reason: 'missing' })]);
    expect(fixGap(d, gaps[0])).toBe(true);
    expect(travelCardGaps(d)).toEqual([]);
    const evs = startList(d, EVS_TRIM, '12m EVS');
    expect(evs.slice(0, 3)).toEqual(['T01-01', 'T01-01 EE', 'T01-01-01']);
    // Same code spelling and name as the KDC line, KDC's activities to start from, no copied consumables.
    expect(d.tcLines[EVS_TRIM][1]).toBe(d.tcLines['Trim Line & Final Assembly — KDC'].find(s => s.startsWith('T01-01 EE')));
    expect(resolveTcCatalog({}, d).actsFor('T01-01 EE', '12m EVS')).toEqual(ACTS['KDC:T01-01 EE']);
    expect(resolveTcCatalog({}, d).resFor(EVS_TRIM, 'T01-01 EE')).toEqual([]);
    // KDC is untouched.
    expect(startList(d, 'Trim Line & Final Assembly — KDC', '12m KDC')).toEqual(startList(draft(), 'Trim Line & Final Assembly — KDC', '12m KDC'));
  });

  it('shows a whole line again when it was hidden from its own model', () => {
    const d = draft();
    d.lineModels[EVS_TRIM] = ['KDC'];
    const gaps = travelCardGaps(d);
    expect(gaps.length).toBeGreaterThan(20);
    expect(new Set(gaps.map(g => g.reason))).toEqual(new Set(['line-hidden']));
    fixGap(d, gaps[0]);
    expect(d.lineModels[EVS_TRIM]).toEqual(['EVS', 'KDC']);
    expect(resolveTcCatalog({}, d).visibleLines('12m EVS')).toContain(EVS_TRIM);
  });

  it('lifts a Travel Card filter that leaves a model out', () => {
    const d = draft();
    d.stations['B04-01'].models = ['KDC', 'EVS', 'KEC'];
    const gaps = travelCardGaps(d);
    expect(gaps.map(g => [g.fam, g.reason])).toEqual([['KDC', 'filtered'], ['KEC', 'filtered']]);
    gaps.forEach(g => fixGap(d, g));
    expect(startList(d, 'Frame Parts Making', '12m KDC')).toContain('B04-01');
  });

  it('syncs one station after its models change, and ignores archived stations', () => {
    const d = draft();
    d.stations['T01-01-EE'].models = ['KDC', 'EVS', 'KEC'];
    d.stations['Q01-05'].active = false;
    expect(syncStationToTravelCard(d, 'T01-01-EE')).toBe(1);
    expect(syncStationToTravelCard(d, 'T01-01-EE')).toBe(0);
    expect(travelCardGaps(d)).toEqual([]);
  });

  it('reports a tracker station with no matching Travel Card line', () => {
    const d = draft();
    d.lines = [...d.lines, { id: 'NEWLINE', label: 'New Line', models: ['EVS'] }];
    d.stations['N01-01'] = { name: 'New station', line: 'NEWLINE', order: 1, models: ['EVS'] };
    const [g] = travelCardGaps(d);
    expect(g).toMatchObject({ code: 'N01-01', reason: 'no-line', target: null });
    expect(fixGap(d, g)).toBe(false);
  });
});
