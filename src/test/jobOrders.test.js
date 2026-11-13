import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_MATERIALS, groupBySpec, parseCutListCsv, cutListToRows, inferMaterial, partLabel,
  isMachineShopLead, isMachineShopLine, makeItem,
} from '../data/jobOrders';
import { toCsv } from '../utils/csv';
import { machineShopMachines, machineOptionsFor } from '../utils/machines';
import { machineForSpec, partsByMachine } from '../components/jobs/MachineShopJobs';
import { parseVinCsv, classifyVins, isValidVin } from '../utils/vinUpload';
import { scopeFor, inScope } from '../components/ShopFloor';

// Company cut lists are not in the public code. A small made-up list stands in.
const SAMPLE = [
  ['16', 'ABC-0016', 'Column', 2, '□40x40x3.0', '34', '', 'one end is cut', ''],
  ['104', 'ABC-0104', 'Beam', 1, '□40x40x3.0', '552', '45°/40', '40/40', ''],
  ['109', 'ABC-0109', 'Beam', 1, '□40x40x3.0', '511', '62°/40', '74/40', ''],
  ['23', 'ABC-0023', 'Longitudinal beam', 2, '□40x40x2.0', '153', '9°/40', '6/40', ''],
  ['118', 'ABC-0118', 'Beam', 12, '□40x40x2.5', '88', '', '', 'Confirm before cutting'],
  ['86', 'ABC-0086', 'Longitudinal beam', 5, '□30x30x2.0', '', '', 'First check if it exists', ''],
].map(([balloon, code, name, qty, spec, length, mitre, remarks, groupNote], i) => makeItem({ id: `s${i}`, balloon, code, name, qty, spec, length, mitre, remarks, groupNote }));

// The real 10m EVS list is kept off GitHub in private-data/ (see .gitignore);
// on the office PC this checks it still reads as the document lists it.
const PRIVATE = resolve(__dirname, '../../private-data/cut-list-10.5m-EVS.csv');
describe('private 10m EVS floor-frame cut list (only where the file exists)', () => {
  it.skipIf(!existsSync(PRIVATE))('reads all 50 parts in 16 specifications, with lengths, mitres and notes', () => {
    const { items, errors } = parseCutListCsv(readFileSync(PRIVATE, 'utf8'));
    expect(errors).toEqual([]);
    expect(items).toHaveLength(50);
    expect(groupBySpec(items)).toHaveLength(16);
    expect(items.every(it => it.material === 'Hollow section' && it.cut)).toBe(true);
    expect(items.filter(it => it.mitre).length).toBe(6);
    expect(items.filter(it => it.groupNote).length).toBe(18);   // 7 + 5 + 1 + 3 + 2 under the 5 noted specs
  });
});

describe('cut list CSV', () => {
  it('reads the template columns in any order, with a BOM or semicolons', () => {
    const csv = '﻿SPECIFICATION;QUANTITY;BALLOON NUMBER;LENGTH (mm);MITRE ANGLE;SUPPLIER CODE;NAME\n□40x40x3.0;2;16;34 mm;;ABC-0016;Column\n';
    const { items, errors } = parseCutListCsv(csv);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ spec: '□40x40x3.0', qty: 2, balloon: '16', length: '34', code: 'ABC-0016', material: 'Hollow section', cut: true });
  });
  it('round-trips through its own download', () => {
    const list = SAMPLE;
    const back = parseCutListCsv(toCsv(cutListToRows(list))).items;
    expect(back.map(({ id, ...x }) => x)).toEqual(list.map(({ id, ...x }) => x));
  });
  it('says what is wrong with a file without the headings', () => {
    expect(parseCutListCsv('a,b\n1,2').errors[0]).toMatch(/SPECIFICATION/);
    expect(parseCutListCsv('').errors).toEqual(['The file is empty.']);
  });
  it('guesses the material from the specification', () => {
    expect(inferMaterial('□60x40x2.5')).toBe('Hollow section');
    expect(inferMaterial('40x40x3')).toBe('Hollow section');
    expect(inferMaterial('Ø25 shaft')).toBe('Shaft');
    expect(inferMaterial('Sheet 2mm')).toBe('Sheet');
    expect(inferMaterial('')).toBe('');
  });
});

describe('machines for each specification', () => {
  const machines = machineShopMachines({}, '10.5m EVS');
  it('the machines are the Machine Shop stations', () => {
    expect(machines.map(m => m.code)).toContain('B01-02');
    expect(machines.every(m => /^B0[1-3]-/.test(m.code))).toBe(true);
  });
  it('only machines that cut a material are offered for it', () => {
    expect(machineOptionsFor('Hollow section', DEFAULT_MATERIALS, machines).map(m => m.code)).toEqual(['B01-02', 'B01-03', 'B01-04']);
    expect(machineOptionsFor('Sheet', DEFAULT_MATERIALS, machines).map(m => m.code)).toEqual(['B02-01', 'B02-02', 'B02-03', 'B02-04']);
    expect(machineOptionsFor('Unknown', DEFAULT_MATERIALS, machines)).toEqual([]);
  });
  it('a machine set for a specification takes every part under it; the job\'s choice beats the remembered one', () => {
    const items = [makeItem({ spec: 'A', balloon: '1' }), makeItem({ spec: 'A', balloon: '2' }), makeItem({ spec: 'B', balloon: '3' }), makeItem({ spec: 'B', balloon: '4', cut: false }), makeItem({ spec: 'C', balloon: '5' })];
    const job = { busModel: '10.5m EVS', items, specMachines: { A: 'B01-03' } };
    const defaults = { '10.5m EVS|A': 'B01-02', '10.5m EVS|B': 'B01-04' };
    expect(machineForSpec(job, 'A', defaults)).toBe('B01-03');
    expect(machineForSpec(job, 'B', defaults)).toBe('B01-04');
    expect(machineForSpec(job, 'C', defaults)).toBe('');
    const by = partsByMachine(job, defaults);
    expect(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.map(it => it.balloon)]))).toEqual({ 'B01-03': ['1', '2'], 'B01-04': ['3'] });
  });
  it('each part becomes a unique, readable activity', () => {
    const labels = SAMPLE.map(partLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[2]).toBe('#109 · ABC-0109 · Beam · ×1 · □40x40x3.0 · L=511mm · mitre 62°/40');
  });
});

describe('who sees what', () => {
  it('Machine Shop leads: admins, and supervisors/managers of the Machine Shop', () => {
    expect(isMachineShopLead('systemadmin')).toBe(true);
    expect(isMachineShopLead('supervisor', ['B02-05'])).toBe(true);
    expect(isMachineShopLead('manager', [], ['MACHINE'])).toBe(true);
    expect(isMachineShopLead('supervisor', ['P01-01'])).toBe(false);
    expect(isMachineShopLead('user', ['B01-02'])).toBe(false);
    expect(isMachineShopLine('Machine Shop')).toBe(true);
    expect(isMachineShopLine('Paint Shop')).toBe(false);
  });
  it('shop floor: supervisors see their stations, managers their lines, others everything', () => {
    const t = code => ({ stationCode: code });
    const sup = scopeFor('supervisor', ['T01-02-EE', 'B10-01A'], null);
    expect(inScope(t('T01-02 EE'), sup)).toBe(true);
    expect(inScope(t('B10-01a'), sup)).toBe(true);
    expect(inScope(t('P01-01'), sup)).toBe(false);
    const mgr = scopeFor('manager', null, ['PAINT']);
    expect(inScope(t('P05-02'), mgr)).toBe(true);
    expect(inScope(t('B01-02'), mgr)).toBe(false);
    expect(scopeFor('director')).toBeNull();
    expect(scopeFor('supervisor', [], null)).toBeNull();
  });
});

describe('VIN register CSV', () => {
  it('reads VIN and BUS PROJECT (and an optional BUS MODEL)', () => {
    const { rows } = parseVinCsv('VIN,BUS PROJECT,BUS MODEL\n zzzbus00000000064 ,100 Bus Project,10.5m EVS\n,\nZZZBUS00000000114,100 Bus Project,\n');
    expect(rows).toEqual([{ vin: 'ZZZBUS00000000064', project: '100 Bus Project', model: '10.5m EVS' }, { vin: 'ZZZBUS00000000114', project: '100 Bus Project', model: '' }]);
    expect(parseVinCsv('NUMBER\n123').errors[0]).toMatch(/No VIN column/);
  });
  it('sorts a file into new, existing, other project and invalid, as the server will', () => {
    const pv = { P: [{ vin: 'ZZZBUS00000000064', model: '' }], Q: [{ vin: 'ZZZBUS00000000059', model: '' }] };
    const out = classifyVins([
      { vin: 'ZZZBUS00000000064', project: 'P' }, { vin: 'ZZZBUS00000000065', project: 'P' }, { vin: 'ZZZBUS00000000065', project: 'P' },
      { vin: 'ZZZBUS00000000059', project: 'P' }, { vin: 'SHORT', project: 'P' }, { vin: 'ZZZBUS00000000066', project: 'Q' },
    ], 'P', pv);
    expect(out).toMatchObject({ existing: ['ZZZBUS00000000064'], added: ['ZZZBUS00000000065'], repeated: ['ZZZBUS00000000065'], invalid: ['SHORT'] });
    expect(out.otherProject).toEqual(['ZZZBUS00000000059 (Q)']);
    expect(out.wrongProject).toEqual(['ZZZBUS00000000066 (Q)']);
    expect(isValidVin('ZZZBUSI0000000064')).toBe(false);   // I is never used in a VIN
  });
});
