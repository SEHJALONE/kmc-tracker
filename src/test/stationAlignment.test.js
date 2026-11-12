import { describe, it, expect } from 'vitest';
import { SEED_STATIONS, sameStationCode, canonicalStationCode, stationLineOf } from '../data/stations';
import { resolveTcCatalog, BUS_MODELS, codeOf } from '../utils/tcCatalog';

// Admins assign people to stations from the station list (SEED_STATIONS); the
// Travel Card, Start/End and approvals look those codes up on the card's lines.
// If the two drift apart, people stop seeing their stations.
const tc = resolveTcCatalog({});
const cardCodes = [];
for (const m of BUS_MODELS) for (const ln of tc.visibleLines(m)) for (const s of tc.stationsFor(ln, m)) cardCodes.push({ code: codeOf(s), model: m, line: ln });

describe('station list and Travel Card stay aligned', () => {
  it('every active station people can be assigned to exists on a Travel Card line', () => {
    const missing = Object.entries(SEED_STATIONS)
      .filter(([, s]) => s.active !== false)
      .filter(([code]) => !cardCodes.some(c => sameStationCode(c.code, code)))
      .map(([code]) => code);
    expect(missing).toEqual([]);
  });

  it('every Travel Card station can be assigned to someone', () => {
    const unassignable = [...new Set(cardCodes.map(c => c.code))].filter(code => !SEED_STATIONS[canonicalStationCode(code)]);
    expect(unassignable).toEqual([]);
  });

  it('an assigned station shows for every model it is used on', () => {
    const gaps = [];
    for (const [code, s] of Object.entries(SEED_STATIONS)) {
      if (s.active === false) continue;
      for (const fam of s.models || []) {
        const model = BUS_MODELS.find(m => m.endsWith(fam));
        if (!cardCodes.some(c => c.model === model && sameStationCode(c.code, code))) gaps.push(`${code} on ${fam}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('matches the codes that are written differently', () => {
    expect(sameStationCode('B10-01A', 'B10-01a')).toBe(true);
    expect(sameStationCode('T01-02-EE', 'T01-02 EE')).toBe(true);
    expect(sameStationCode('WASHING', 'Washing Bay')).toBe(true);
    expect(sameStationCode('T01-02', 'T01-02 EE')).toBe(false);
    expect(stationLineOf('T01-02 EE')).toBe(SEED_STATIONS['T01-02-EE'].line);
    expect(stationLineOf('B10-01a')).toBe('BODY');
  });
});
