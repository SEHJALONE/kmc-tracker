import { describe, it, expect } from 'vitest';
import { normalizeDepartments, departmentsFrom, DEFAULT_DEPARTMENTS } from '../data/departments';
import { normalizeCatalog } from '../data/catalogConfig';

describe('departments', () => {
  it('includes Quality, Health, Safety and Environment by default', () => {
    expect(DEFAULT_DEPARTMENTS.map(d => d.name)).toContain('Quality, Health, Safety and Environment');
  });

  it('uses the saved list, tidied, and falls back to the defaults', () => {
    expect(departmentsFrom({})).toBe(DEFAULT_DEPARTMENTS);
    expect(normalizeDepartments([])).toBe(DEFAULT_DEPARTMENTS);
    expect(normalizeDepartments([
      { name: '  Stores ', units: ['Main', ' main ', '', 'Spares'] },
      { name: 'stores', units: [] },
      { name: '', units: ['x'] },
      { name: 'Finance' },
    ])).toEqual([{ name: 'Stores', units: ['Main', 'Spares'] }, { name: 'Finance', units: [] }]);
  });

  it('keeps departments when the catalog is normalised, so a save does not drop them', () => {
    const list = [{ name: 'Stores', units: [] }];
    expect(normalizeCatalog({ departments: list }).departments).toBe(list);
    expect(normalizeCatalog({}).departments).toBeNull();
  });
});
