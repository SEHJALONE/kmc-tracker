import { describe, it, expect } from 'vitest';
import { catalogVisibilityChanges } from '../utils/catalogGuard';
import { resolveTcCatalog } from '../utils/tcCatalog';
import { TC_LINES, ACTS, RES, LINE_MODELS, STATION_MODELS } from '../data/travelCardSeed';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';

const EVS_TRIM = 'Trim Line & Final Assembly — EVS';
const draft = (over = {}) => structuredClone({
  tcLines: TC_LINES, acts: ACTS, res: RES, lineModels: LINE_MODELS, stationModels: STATION_MODELS,
  lines: SEED_LINES, stations: SEED_STATIONS, ...over,
});

describe('catalog save guard', () => {
  it('reports nothing when nothing changed', () => {
    expect(catalogVisibilityChanges(draft(), draft())).toEqual({ hidden: [], shown: [] });
  });

  // The 16 Nov 2026 incident: the EVS trim line was saved as "KDC only", so it
  // vanished from every EVS Travel Card.
  it('flags a Travel Card line that a model family loses', () => {
    const after = draft();
    after.lineModels[EVS_TRIM] = ['KDC'];
    const { hidden, shown } = catalogVisibilityChanges(draft(), after);
    expect(hidden).toEqual([`Travel Card line "${EVS_TRIM}" is hidden for EVS buses`]);
    expect(shown).toEqual([`Travel Card line "${EVS_TRIM}" becomes visible for KDC buses`]);
  });

  it('flags a bus tracker line narrowed to one model', () => {
    const after = draft();
    after.lines.find(l => l.id === 'TRIM').models = ['EVS'];
    expect(catalogVisibilityChanges(draft(), after).hidden)
      .toEqual(['Bus Tracker line "Trim Line & Final Assembly" is hidden for KDC, KEC']);
  });

  it('flags removed lines, hidden stations and archived tracker stations', () => {
    const after = draft();
    delete after.tcLines['Paint Shop'];
    after.stationModels['B01-01'] = ['KDC'];
    after.stations['Q01-01'].active = false;
    const { hidden } = catalogVisibilityChanges(draft(), after);
    expect(hidden).toContain('Travel Card line "Paint Shop" is removed for EVS, KDC, KEC buses');
    expect(hidden).toContain('Travel Card station B01-01 on "Machine Shop" is hidden for EVS, KEC buses');
    expect(hidden).toContain('Bus Tracker station Q01-01 is hidden for EVS, KDC, KEC');
  });

  it('showing something to more models is not a loss', () => {
    const after = draft();
    after.stationModels['B04-01'] = ['EVS', 'KDC', 'KEC'];
    expect(catalogVisibilityChanges(draft(), after).hidden).toEqual([]);
  });
});

describe('"all models" survives the merge over the built-in data', () => {
  // The editor used to delete the entry for "all models"; the built-in
  // restriction then came back on the next load, so the tick never stuck.
  it('an explicit all-models entry overrides a built-in restriction', () => {
    const tc = resolveTcCatalog({ lineModels: { [EVS_TRIM]: ['EVS', 'KDC', 'KEC'] }, stationModels: { 'B04-01': ['EVS', 'KDC', 'KEC'] } });
    expect(tc.visibleLines('12m KDC')).toContain(EVS_TRIM);
    expect(tc.stationsFor('Frame Parts Making', '12m KDC').some(s => s.startsWith('B04-01'))).toBe(true);
  });
});
