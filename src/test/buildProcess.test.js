import { describe, it, expect } from 'vitest';
import {
  TC_LINES, ACTS, LINE_MODELS, STATION_MODELS,
  stationLabelForModel, mergeConsumables, usedOtherRes,
} from '../components/TravelCard.jsx';
import { SEED_STATIONS, stationDisplayNames, stationNameForModel, modelFamilyOf } from '../data/stations.js';
import { parseStationConsumables } from '../hooks/useStationConsumables.js';

// Mirrors TravelCard's own filtering: which stations (and their activities) a
// given bus model sees on the travel card.
function visible(model) {
  const kind = model.includes('KDC') ? 'KDC' : model.includes('KEC') ? 'KEC' : 'EVS';
  const out = [];
  for (const [line, stations] of Object.entries(TC_LINES)) {
    if (LINE_MODELS[line] && !LINE_MODELS[line].includes(kind)) continue;
    for (const s of stations) {
      const code = s.split(':')[0].trim();
      if (STATION_MODELS[code] && !STATION_MODELS[code].includes(kind)) continue;
      out.push({ line, label: s, code, acts: ACTS[kind + ':' + code] || ACTS[code] || [] });
    }
  }
  return out;
}

describe('build process per model', () => {
  const MODELS = ['7m EVS', '8.5m EVS', '10.5m EVS', '12m EVS', '10.5m KDC', '12m KDC', '13m KEC'];

  it.each(MODELS)('%s: every visible station has activities', (model) => {
    const empty = visible(model).filter(s => !s.acts.length).map(s => s.label);
    expect(empty).toEqual([]);
  });

  it('an EV never sees U-hoop / diesel stations', () => {
    const labels = visible('12m EVS').map(s => s.label).join('\n');
    expect(labels).not.toMatch(/u-?hoop/i);
    expect(labels).not.toMatch(/diesel|clutch/i);
  });

  it('a coach never sees six-parts merging or roof/side-wall framework', () => {
    for (const model of ['12m KDC', '13m KEC']) {
      const v = visible(model);
      expect(v.map(s => s.label).join('\n')).not.toMatch(/six parts/i);
      expect(v.some(s => /^B0[456]-0[1-4]$/.test(s.code) || s.code === 'B04-06' || s.code === 'B04-07')).toBe(false);
      expect(v.some(s => s.code === 'B10-01a')).toBe(true);   // inverted U-hoop cell instead
      expect(v.some(s => s.code === 'B04-05')).toBe(true);    // top panel stretcher is shared
    }
  });

  it('13m KEC gets its own electric lines, not the diesel or city-bus ones', () => {
    const lines = [...new Set(visible('13m KEC').map(s => s.line))];
    expect(lines).toContain('Frame & Body Welding — KEC');
    expect(lines).toContain('Chassis Line 02 — KEC');
    expect(lines.some(l => /— (EVS|KDC)$/.test(l))).toBe(false);
    const kec = visible('13m KEC');
    expect(kec.find(s => s.code === 'C02-03').acts.join()).toMatch(/motor/i);
    expect(kec.find(s => s.code === 'Q01-02').acts.join()).not.toMatch(/exhaust/i);
    expect(kec.some(s => s.code === 'P07-03')).toBe(false); // KDC-only clear-coat drying
  });

  it('KDC radiator-fan sub-assembly uses the drawing code C01-03-01', () => {
    const codes = visible('12m KDC').map(s => s.code);
    expect(codes).toContain('C01-03-01');
    expect(codes).not.toContain('C01-01-01');
    expect(codes).toEqual(expect.arrayContaining(['C02-02-01', 'C02-05-01', 'T01-11-01']));
  });
});

describe('stationLabelForModel', () => {
  const q = 'Q01-02: Speed Test (EVS) / Vehicle Exhaust & Speed Test (KDC)';
  it('shows only the selected family’s wording', () => {
    expect(stationLabelForModel(q, 'KDC')).toBe('Q01-02: Vehicle Exhaust & Speed Test');
    expect(stationLabelForModel(q, 'EVS')).toBe('Q01-02: Speed Test');
    expect(stationLabelForModel(q, 'KEC')).toBe('Q01-02: Speed Test');
  });
  it('leaves ordinary labels alone', () => {
    expect(stationLabelForModel('P01-01: Bus Body Panel Masking', 'KDC')).toBe('P01-01: Bus Body Panel Masking');
  });
});

describe('station consumables', () => {
  it('parses the shared tab and ignores a feed without its header', () => {
    const csv = '"station_code","name","added_by","added_at"\n"t01-03","Rivets 4mm","amos",""\n"T01-03","rivets 4mm","x",""\n"W01-02","Flux","",""';
    expect(parseStationConsumables(csv)).toEqual({ 'T01-03': ['Rivets 4mm'], 'W01-02': ['Flux'] });
    expect(parseStationConsumables('"record_id","timestamp"\n"a","b"')).toEqual({});
  });
  it('merges shared names into local memory without duplicates', () => {
    const merged = mergeConsumables([{ name: 'Rivets 4mm', qty: '20' }], ['rivets 4mm', 'Flux']);
    expect(merged).toEqual([{ name: 'Rivets 4mm', qty: '20' }, { name: 'Flux', qty: '' }]);
  });
  it('only submits consumables actually used', () => {
    expect(usedOtherRes([{ name: 'A', qty: '' }, { name: 'B', qty: '0' }, { name: 'C', qty: '3' }])).toEqual([{ name: 'C', qty: '3' }]);
  });
});

describe('tracker station names by family', () => {
  it('resolves KEC names and families', () => {
    expect(modelFamilyOf('13m KEC')).toBe('KEC');
    const st = { code: 'C02-03', ...SEED_STATIONS['C02-03'] };
    expect(stationNameForModel(st, '13m KEC')).toBe('Installation of Motor and Batteries');
    expect(stationNameForModel(st, '12m KDC')).toBe('Engine Cooling & Fuel System');
    expect(stationDisplayNames(st).differs).toBe(true);
  });
  it('U-hoop web frame cell is coach-only in the tracker too', () => {
    expect(SEED_STATIONS['B10-01A'].models).toEqual(['KDC', 'KEC']);
    expect(SEED_STATIONS['B05-01'].models).toEqual(['EVS']);
  });
});
