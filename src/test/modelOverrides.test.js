import { describe, it, expect } from 'vitest';
import { resolveTcCatalog, codeOf } from '../utils/tcCatalog';
import { TC_LINES, ACTS, RES, LINE_MODELS, STATION_MODELS } from '../data/travelCardSeed';
import {
  applyModelEdit, applyListChange, splitStation, shareStation, renameForModels, sharingOf, editTargets,
} from '../utils/modelOverrides';

// A small made-up catalog in the editor's draft shape: one trim line per model
// and one line (Machine Shop) every model uses.
const TRIM = k => `Trim Line & Final Assembly — ${k}`;
const MS = 'Machine Shop';
const draft = (over = {}) => structuredClone({
  tcLines: {
    [MS]: ['B01-01: Saw'],
    [TRIM('EVS')]: ['T01-03 EE: Harness'],
    [TRIM('KDC')]: ['T01-03 EE: Harness'],
    [TRIM('KEC')]: ['T01-03 EE: Harness'],
  },
  lineModels: { [TRIM('EVS')]: ['EVS'], [TRIM('KDC')]: ['KDC'], [TRIM('KEC')]: ['KEC'] },
  stationModels: {},
  acts: { 'T01-03 EE': ['a', 'b'], 'B01-01': ['cut'] },
  res: { [MS]: { 'B01-01': ['blade'] }, [TRIM('EVS')]: { 'T01-03 EE': ['tape'] }, [TRIM('KDC')]: { 'T01-03 EE': ['tape'] }, [TRIM('KEC')]: { 'T01-03 EE': ['tape'] } },
  ...over,
});
const tcOf = d => resolveTcCatalog({}, d);
const acts = (d, k, code = 'T01-03 EE') => tcOf(d).actsFor(code, k);
const res = (d, k, code = 'T01-03 EE', line = TRIM(k)) => tcOf(d).resFor(line, code, k);
const view = d => Object.fromEntries(['EVS', 'KDC', 'KEC'].map(k => [k, {
  acts: acts(d, k), msActs: acts(d, k, 'B01-01'), res: res(d, k), msRes: res(d, k, 'B01-01', MS),
}]));

describe('per-model override resolution', () => {
  it('old catalogs read exactly as before', () => {
    const tc = tcOf(draft());
    expect(tc.actsFor('T01-03 EE', 'KEC')).toEqual(['a', 'b']);
    expect(tc.resFor(MS, 'B01-01')).toEqual(['blade']);
    expect(tc.resFor(MS, 'B01-01', '13m KEC')).toEqual(['blade']);
  });

  it('a model list wins over the shared one, for activities and consumables', () => {
    const d = draft();
    d.acts['KEC:T01-03 EE'] = ['k'];
    d.res[MS]['KEC:B01-01'] = ['kec blade'];
    const tc = tcOf(d);
    expect(tc.actsFor('T01-03 EE', '13m KEC')).toEqual(['k']);
    expect(tc.actsFor('T01-03 EE', '12m EVS')).toEqual(['a', 'b']);
    expect(tc.resFor(MS, 'B01-01', '13m KEC')).toEqual(['kec blade']);
    expect(tc.resFor(MS, 'B01-01', '12m KDC')).toEqual(['blade']);
  });
});

describe('editing one model leaves the others alone', () => {
  it('a KEC activity edit with nothing ticked keeps EVS and KDC as they were', () => {
    const d = draft();
    const before = view(d);
    applyModelEdit(d, { field: 'acts', code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), next: ['a', 'b', 'kec only'] });
    const after = view(d);
    expect(after.KEC.acts).toEqual(['a', 'b', 'kec only']);
    expect(after.EVS).toEqual(before.EVS);
    expect(after.KDC).toEqual(before.KDC);
  });

  it('a ticked model gets the same change, an unticked one does not', () => {
    const d = draft();
    applyModelEdit(d, { field: 'acts', code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), next: ['a', 'B'], also: ['EVS'] });
    expect(acts(d, 'KEC')).toEqual(['a', 'B']);
    expect(acts(d, 'EVS')).toEqual(['a', 'B']);
    expect(acts(d, 'KDC')).toEqual(['a', 'b']);
  });

  it('a ticked model with a different list gets the one change, not a copy', () => {
    const d = draft();
    d.acts['EVS:T01-03 EE'] = ['a', 'evs step'];
    applyModelEdit(d, { field: 'acts', code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), next: ['a', 'b', 'new'], also: ['EVS'] });
    expect(acts(d, 'EVS')).toEqual(['a', 'evs step', 'new']);
    applyModelEdit(d, { field: 'acts', code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), next: ['A', 'b', 'new'], also: ['EVS'] });
    expect(acts(d, 'EVS')).toEqual(['A', 'evs step', 'new']);
    applyModelEdit(d, { field: 'acts', code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), next: ['A', 'b'], also: ['EVS'] });
    expect(acts(d, 'EVS')).toEqual(['A', 'evs step']);
    expect(acts(d, 'KDC')).toEqual(['a', 'b']);
  });

  it('consumables on a line every model uses stay per model', () => {
    const d = draft();
    const before = view(d);
    applyModelEdit(d, { field: 'res', code: 'B01-01', kind: 'KEC', line: MS, next: ['blade', 'coolant'] });
    const after = view(d);
    expect(after.KEC.msRes).toEqual(['blade', 'coolant']);
    expect(after.EVS).toEqual(before.EVS);
    expect(after.KDC).toEqual(before.KDC);
  });

  it('consumables on model lines reach a ticked model on its own line', () => {
    const d = draft();
    applyModelEdit(d, { field: 'res', code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), next: ['tape', 'ties'], also: ['EVS'] });
    expect(res(d, 'KEC')).toEqual(['tape', 'ties']);
    expect(res(d, 'EVS')).toEqual(['tape', 'ties']);
    expect(res(d, 'KDC')).toEqual(['tape']);
  });

  it('renaming on a model line only renames the ticked lines', () => {
    const d = draft();
    renameForModels(d, { code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), name: 'KEC harness' });
    expect(d.tcLines[TRIM('KEC')]).toEqual(['T01-03 EE: KEC harness']);
    expect(d.tcLines[TRIM('EVS')]).toEqual(['T01-03 EE: Harness']);
    renameForModels(d, { code: 'T01-03 EE', kind: 'KEC', line: TRIM('KEC'), name: 'Both', also: ['EVS'] });
    expect(d.tcLines[TRIM('EVS')]).toEqual(['T01-03 EE: Both']);
    expect(d.tcLines[TRIM('KDC')]).toEqual(['T01-03 EE: Harness']);
  });
});

describe('shared and split stations', () => {
  it('split gives every model its own copy and changes nothing it shows', () => {
    const d = draft();
    const before = view(d);
    splitStation(d, 'B01-01', MS);
    expect(view(d)).toEqual(before);
    expect(d.acts['KEC:B01-01']).toEqual(['cut']);
    expect(d.res[MS]['EVS:B01-01']).toEqual(['blade']);
    expect(sharingOf(d, 'B01-01', MS).every(r => !r.with.length && !r.resWith.length)).toBe(true);
  });

  it('share copies one model\'s data to the group and keeps the rest', () => {
    const d = draft();
    d.acts['KEC:T01-03 EE'] = ['kec'];
    d.res[TRIM('KEC')]['T01-03 EE'] = ['kec tape'];
    shareStation(d, 'T01-03 EE', ['EVS'], 'KEC', TRIM('KEC'));
    expect(d.sharedStations).toEqual({ 'T01-03 EE': ['EVS', 'KEC'] });
    expect(acts(d, 'EVS')).toEqual(['kec']);
    expect(res(d, 'EVS')).toEqual(['kec tape']);
    expect(acts(d, 'KDC')).toEqual(['a', 'b']);
    expect(res(d, 'KDC')).toEqual(['tape']);
  });

  it('an edit to one shared model reaches the group and nothing else', () => {
    const d = draft();
    shareStation(d, 'T01-03 EE', ['EVS'], 'KEC', TRIM('KEC'));
    expect(editTargets(d, 'T01-03 EE', 'EVS')).toEqual(['EVS', 'KEC']);
    applyModelEdit(d, { field: 'acts', code: 'T01-03 EE', kind: 'EVS', line: TRIM('EVS'), next: ['x'] });
    applyModelEdit(d, { field: 'res', code: 'T01-03 EE', kind: 'EVS', line: TRIM('EVS'), next: ['glue'] });
    expect(acts(d, 'KEC')).toEqual(['x']);
    expect(res(d, 'KEC')).toEqual(['glue']);
    expect(acts(d, 'KDC')).toEqual(['a', 'b']);
    expect(res(d, 'KDC')).toEqual(['tape']);
    splitStation(d, 'T01-03 EE', TRIM('EVS'));
    applyModelEdit(d, { field: 'acts', code: 'T01-03 EE', kind: 'EVS', line: TRIM('EVS'), next: ['y'] });
    expect(acts(d, 'KEC')).toEqual(['x']);
    expect(d.sharedStations).toEqual({});
  });
});

describe('on the built-in catalog', () => {
  it('editing every KEC trim station changes nothing EVS or KDC show', () => {
    const d = structuredClone({ tcLines: TC_LINES, acts: ACTS, res: RES, lineModels: LINE_MODELS, stationModels: STATION_MODELS });
    const snapshot = () => {
      const tc = tcOf(d);
      return ['12m EVS', '7m EVS', '12m KDC'].map(m => tc.visibleLines(m).map(l => tc.stationsFor(l, m).map(s => {
        const c = codeOf(s);
        return [l, s, tc.actsFor(c, m), tc.resFor(l, c, m)];
      })));
    };
    const before = snapshot();
    const kecLine = TRIM('KEC');
    for (const s of d.tcLines[kecLine]) {
      const c = codeOf(s);
      applyModelEdit(d, { field: 'acts', code: c, kind: 'KEC', line: kecLine, next: ['changed for KEC'] });
      applyModelEdit(d, { field: 'res', code: c, kind: 'KEC', line: kecLine, next: ['kec item'] });
      renameForModels(d, { code: c, kind: 'KEC', line: kecLine, name: 'renamed' });
      expect(tcOf(d).actsFor(c, '13m KEC')).toEqual(['changed for KEC']);
    }
    expect(snapshot()).toEqual(before);
  });
});

describe('applyListChange', () => {
  it('copies when the other list matches, else repeats the one change', () => {
    expect(applyListChange(['a'], ['a', 'b'], ['a'])).toEqual(['a', 'b']);
    expect(applyListChange(['a'], ['a', 'b'], ['z'])).toEqual(['z', 'b']);
    expect(applyListChange(['a', 'b'], ['b'], ['z', 'a'])).toEqual(['z']);
    expect(applyListChange(['a', 'b'], ['a', 'c'], ['b', 'z'])).toEqual(['c', 'z']);
    expect(applyListChange(['a', 'b'], ['b', 'a'], ['z', 'a', 'b'])).toEqual(['z', 'a', 'b']);
  });
});
