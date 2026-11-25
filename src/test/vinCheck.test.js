import { describe, it, expect } from 'vitest';
import { vinProblem, registeredModels, keepLocalVin, splitVins } from '../utils/vinCheck';

// Made-up VINs: real ones stay out of this public repo.
const REG = {
  'City Project': [{ vin: 'TESTA000000000001', model: '10.5m EVS' }, { vin: 'TESTA000000000002', model: '7m EVS' }],
  'Coach Project': [{ vin: 'TESTB000000000001', model: '12m KDC' }],
};

describe('VIN register check', () => {
  it('accepts a matching project, model and VIN', () => {
    expect(vinProblem(REG, { project: 'City Project', busModel: '10.5m EVS', vin: 'testa000000000001' })).toBeNull();
  });
  it('refuses a model the project does not build', () => {
    expect(vinProblem(REG, { project: 'City Project', busModel: '12m EVS', vin: 'TESTA000000000001' })).toMatch(/no 12m EVS buses/);
  });
  it('refuses a VIN registered as another model', () => {
    expect(vinProblem(REG, { project: 'City Project', busModel: '7m EVS', vin: 'TESTA000000000001' })).toMatch(/is a 10.5m EVS/);
  });
  it('refuses a VIN from another project', () => {
    expect(vinProblem(REG, { project: 'City Project', busModel: '10.5m EVS', vin: 'TESTB000000000001' })).toMatch(/belongs to Coach Project/);
  });
  it('refuses a mistyped VIN on a registered project', () => {
    expect(vinProblem(REG, { project: 'City Project', busModel: '10.5m EVS', vin: 'TESTA00000000001X' })).toMatch(/not in the City Project VIN register/);
  });
  it('checks every VIN of a two-bus job', () => {
    expect(splitVins('TESTA000000000001, TESTA000000000002')).toHaveLength(2);
    expect(vinProblem(REG, { project: 'City Project', busModel: '10.5m EVS', vin: 'TESTA000000000001, TESTA000000000002' })).toMatch(/is a 7m EVS/);
  });
  it('leaves projects without a register alone', () => {
    expect(vinProblem(REG, { project: 'Old Project', busModel: '12m EVS', vin: 'ANYTHING' })).toBeNull();
    expect(registeredModels(REG, 'Old Project')).toEqual([]);
    expect(registeredModels(REG, 'City Project').sort()).toEqual(['10.5m EVS', '7m EVS']);
  });
  it('hides remembered VINs that belong elsewhere', () => {
    const keep = keepLocalVin(REG, 'City Project', '7m EVS');
    expect(keep('TESTA000000000002')).toBe(true);
    expect(keep('TESTA000000000001')).toBe(false);
    expect(keep('TYPO')).toBe(false);
    expect(keepLocalVin(REG, 'Old Project', '12m EVS')('TYPO')).toBe(true);
  });
});
