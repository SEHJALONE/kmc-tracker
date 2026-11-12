import { describe, it, expect } from 'vitest';
import { manpowerFor, MANPOWER } from '../data/manpowerAllocation';
import { TC_LINES } from '../data/travelCardSeed';

const key = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');
const allCodes = new Set(Object.values(TC_LINES).flat().map(l => key(l.split(':')[0])));

describe('manpower allocation presets', () => {
  it('only names stations that exist on the Travel Card', () => {
    for (const k of Object.keys(MANPOWER)) {
      expect(allCodes.has(k.replace(/^(EVS|KDC|KEC):/, '')), k).toBe(true);
    }
  });

  it('carries no job titles in names', () => {
    for (const names of Object.values(MANPOWER)) {
      for (const n of names) expect(n).not.toMatch(/\(|\bSL\b|\bQIT\b/);
    }
  });

  it('matches EE sub-stations and model-specific codes', () => {
    expect(manpowerFor('T01-02 EE', 'EVS')).toEqual(['Gilbert Natusasiira']);
    expect(manpowerFor('C02-04', 'KDC')).toEqual(['Mathias Kasumba', 'Ivan Ssekide', 'Peter Ochom']);
    expect(manpowerFor('C02-04', 'EVS')).toEqual(['Isaac Wandwasi', 'Nasser Kato', 'Peter Ochom']);
    expect(manpowerFor('C02-04', 'KEC')).toEqual(['Isaac Wandwasi', 'Nasser Kato', 'Peter Ochom']);
    expect(manpowerFor('P07-02', 'EVS')).toEqual([]);   // Branding: nobody allocated
    expect(manpowerFor('P07-03', 'EVS')).toEqual(['Sam Mikataro', 'Steven Ssenkaayi', 'Mark Kimula Musaazi']);
    expect(manpowerFor('B01-01', 'EVS')).toEqual([]);
  });

  it('returns a copy, so editing the card does not change the preset', () => {
    manpowerFor('Q01-01').push('X');
    expect(manpowerFor('Q01-01')).toEqual(['Victor Bwanatai']);
  });
});

import { isTestVin } from '../utils/testData';
describe('test VIN filter', () => {
  it('catches the test VINs and leaves real ones', () => {
    for (const v of ['KMC TEST 001', 'KMC-TEST-001', 'TESTVIN-EDIT-001']) expect(isTestVin(v), v).toBe(true);
    for (const v of ['LA9C5ARY0NBJXK123', 'KEV-07', 'LATEST1', '', null]) expect(isTestVin(v), String(v)).toBe(false);
  });
});
