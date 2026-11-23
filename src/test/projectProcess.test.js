import { describe, it, expect } from 'vitest';
import {
  cleanProjectProcess, normalizeProjectProcesses, projectProcessErrors, withProjectProcess, registerRow,
  fitWithin, projectTrack, processStationsFor, PROJECT_IMAGE_MAX, mergeProjectProcesses,
} from '../data/projectProcess';
import { normalizeCatalog } from '../data/catalogConfig';
import { activityLabel, makeActivity } from '../data/jobOrders';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const tank = {
  id: 'prj-001', name: 'Steel water tank', image: PNG,
  lines: [
    { line: 'Machine Shop', stations: [{ code: 'b01-03', name: 'Tube laser' }, { code: 'B02-01', name: 'Plate laser' }] },
    { line: 'Parts Making', stations: [{ code: 'W01', name: 'Welding bay' }] },
    { line: 'Paint Shop', stations: [{ code: 'P01', name: 'Primer' }, { code: 'P02', name: 'Top coat' }] },
  ],
};

describe('project process: shape and catalog', () => {
  it('tidies a process: upper-case IDs and codes, known lines only, no repeated line, only image data URLs', () => {
    const p = cleanProjectProcess({ ...tank, lines: [...tank.lines, { line: 'paint shop', stations: [] }, { line: 'Trim', stations: [{ code: 'T1' }] }] });
    expect(p.id).toBe('PRJ-001');
    expect(p.lines.map(l => l.line)).toEqual(['Machine Shop', 'Parts Making', 'Paint Shop']);
    expect(p.lines[0].stations[0]).toEqual({ code: 'B01-03', name: 'Tube laser' });
    expect(cleanProjectProcess({ image: 'https://example.com/x.png' }).image).toBe('');
  });

  it('reads a catalog without projectProcesses exactly as before, and keeps them when present', () => {
    const old = { projects: [{ id: 'p' }], stations: { A: {} }, projectVins: { P: [] } };
    const n = normalizeCatalog(old);
    expect(n.projects).toEqual(old.projects);
    expect(n.stations).toEqual(old.stations);
    expect(n.projectProcesses).toEqual({});
    expect(normalizeCatalog({ projectProcesses: { 'PRJ-001': tank } }).projectProcesses['PRJ-001']).toBe(tank);
    expect(normalizeCatalog({ projectProcesses: [1, 2] }).projectProcesses).toEqual({});
  });

  it('normalizes the saved processes by ID and drops junk', () => {
    const n = normalizeProjectProcesses({ a: tank, b: { id: 'bad id!' }, c: null, d: 'x' });
    expect(Object.keys(n)).toEqual(['PRJ-001']);
    expect(normalizeProjectProcesses(null)).toEqual({});
  });

  it('saves only this project into the live catalog and keeps everything else as it is live', () => {
    const live = { projects: [{ id: 'bus' }], stations: { X: { name: 'x' } }, projectVins: { P: [{ vin: 'V1' }] }, projectProcesses: { 'PRJ-009': { id: 'PRJ-009', name: 'Gate', lines: [] } } };
    const next = withProjectProcess(live, 'prj-001', tank);
    expect(next.projects).toBe(live.projects);
    expect(next.projectVins).toBe(live.projectVins);
    expect(Object.keys(next.projectProcesses).sort()).toEqual(['PRJ-001', 'PRJ-009']);
    expect(next.projectProcesses['PRJ-001'].lines).toHaveLength(3);
    expect(Object.keys(withProjectProcess(next, 'PRJ-009', null).projectProcesses)).toEqual(['PRJ-001']);
    expect(live.projectProcesses['PRJ-001']).toBeUndefined();   // the live copy is not changed
  });

  it('gives the register row the project lines in order', () => {
    expect(registerRow(cleanProjectProcess(tank))).toEqual({ id: 'PRJ-001', name: 'Steel water tank', client: '', description: '', lines: ['Machine Shop', 'Parts Making', 'Paint Shop'] });
  });
});

describe('project process: what blocks a save', () => {
  it('needs an ID, a name, a line and stations with codes, no repeats', () => {
    expect(projectProcessErrors({})).toEqual(expect.arrayContaining(['Give the project an ID.', 'Give the project a name.', 'Add at least one line.']));
    expect(projectProcessErrors({ id: 'A B', name: 'x', lines: [{ line: 'Paint Shop', stations: [] }] })).toEqual([
      'The project ID may use letters, digits and - _ . / only.', 'Paint Shop: add at least one station.',
    ]);
    expect(projectProcessErrors({ id: 'A', name: 'x', lines: [{ line: 'Paint Shop', stations: [{ code: 'P1' }, { code: 'p1' }, { name: 'no code' }] }] })).toEqual([
      'Paint Shop: every station needs a code.', 'Paint Shop: P1 is listed twice.',
    ]);
    expect(projectProcessErrors(tank)).toEqual([]);
  });

  it('refuses a new project whose ID is taken, and a picture that is not an image or too big', () => {
    const existing = normalizeProjectProcesses({ a: tank });
    expect(projectProcessErrors(tank, existing, true)).toEqual(['PRJ-001 is already set up. Edit it instead.']);
    expect(projectProcessErrors(tank, existing, false)).toEqual([]);
    expect(projectProcessErrors({ ...tank, image: 'data:text/html;base64,AAA' })).toEqual(['The picture must be a PNG.']);
    expect(projectProcessErrors({ ...tank, image: PNG + 'A'.repeat(PROJECT_IMAGE_MAX) })).toEqual(['The picture is too big. Use a smaller PNG.']);
  });

  it('fits a picture inside the card box without enlarging it', () => {
    expect(fitWithin(1800, 1100)).toEqual({ width: 360, height: 220 });
    expect(fitWithin(500, 1000)).toEqual({ width: 110, height: 220 });
    expect(fitWithin(200, 100)).toEqual({ width: 200, height: 100 });
  });
});

describe('project tracker', () => {
  const ms = { id: 'OP-1', kind: 'other', projectId: 'PRJ-001', line: 'Machine Shop', status: 'open', items: [], activities: [] };
  const paintActs = [makeActivity({ name: 'Primer coat' }), makeActivity({ name: 'Top coat' })];
  const paint = { id: 'OP-2', kind: 'other', projectId: 'PRJ-001', line: 'Paint Shop', status: 'open', items: [], activities: paintActs };
  const other = { id: 'OP-3', kind: 'other', projectId: 'PRJ-002', line: 'Paint Shop', status: 'open', items: [], activities: [] };
  const run = (id, jobOrderId, stationCode, status, startedAt, extra = {}) => ({ id, jobOrderId, stationCode, status, startedAt, closedAt: status === 'closed' ? startedAt : '', ...extra });

  it('a project with no runs waits at the start, with nothing done', () => {
    const t = projectTrack(tank, [ms, paint], []);
    expect(t.state).toBe('waiting');
    expect(t.at).toBeNull();
    expect(t.total).toBe(5);
    expect(t.stations.map(s => s.state)).toEqual(['waiting', 'waiting', 'waiting', 'waiting', 'waiting']);
  });

  it('moves along the stations like a bus: earlier stations count as done, the open run is where it is', () => {
    const runs = [
      run('r1', 'OP-1', 'B01-03', 'closed', '2026-11-20T08:00:00Z'),
      run('r2', 'OP-1', 'b02-01', 'open', '2026-11-21T08:00:00Z'),
      run('r3', 'OP-3', 'P01', 'open', '2026-11-21T08:00:00Z'),          // another project
      run('r4', 'OP-1', 'B02-01', 'discarded', '2026-11-21T09:00:00Z'),  // discarded
    ];
    const t = projectTrack(tank, [ms, paint, other], runs);
    expect(t.state).toBe('running');
    expect(t.at).toMatchObject({ line: 'Machine Shop', code: 'B02-01', index: 1 });
    expect(t.stations.map(s => s.state)).toEqual(['done', 'running', 'waiting', 'waiting', 'waiting']);
    expect(t.done).toBe(1);
    expect(t.pct).toBe(20);
    expect(t.runs.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('a later station worked at marks the ones before it done; a closed last run waits for the next station', () => {
    const t = projectTrack(tank, [ms, paint], [run('r1', 'OP-2', 'P01', 'closed', '2026-11-22T08:00:00Z')]);
    expect(t.state).toBe('between');
    expect(t.at).toMatchObject({ line: 'Paint Shop', code: 'P01' });
    expect(t.stations.map(s => s.state)).toEqual(['done', 'done', 'done', 'done', 'waiting']);
  });

  it('a line whose job orders are all done counts every station on it done; all done is done', () => {
    const acts = paintActs.map(a => ({ name: activityLabel(a), doneAt: '2026-11-22T09:00:00Z' }));
    const runs = [run('r1', 'OP-2', 'P02', 'closed', '2026-11-22T08:00:00Z', { activities: acts })];
    const t = projectTrack(tank, [ms, paint], runs);
    expect(t.lines.find(l => l.line === 'Paint Shop').state).toBe('done');
    expect(t.state).toBe('done');
    expect(t.pct).toBe(100);
  });

  it('lists runs at stations outside the process apart', () => {
    const t = projectTrack(tank, [paint], [run('r1', 'OP-2', 'P09', 'open', '2026-11-22T08:00:00Z')]);
    expect(t.elsewhere.map(r => r.stationCode)).toEqual(['P09']);
    expect(t.state).toBe('waiting');
  });

  it('offers the project stations of a job order line for a run', () => {
    const procs = normalizeProjectProcesses({ a: tank });
    expect(processStationsFor(procs, 'prj-001', 'Paint Shop').map(s => s.code)).toEqual(['P01', 'P02']);
    expect(processStationsFor(procs, 'PRJ-404', 'Paint Shop')).toEqual([]);
  });
});

describe('project process: a save right after another', () => {
  it('keeps a process this browser saved that the lagging live read does not have yet, or has older', () => {
    const a = { ...tank, updatedAt: '2026-11-23T10:00:00Z' };
    const b = { id: 'PRJ-002', name: 'Shelter', lines: [{ line: 'Paint Shop', stations: [{ code: 'P1' }] }], updatedAt: '2026-11-23T10:05:00Z' };
    const liveOld = { 'PRJ-001': { ...a, name: 'Old name', updatedAt: '2026-11-01T00:00:00Z' } };
    const merged = mergeProjectProcesses(liveOld, { 'PRJ-001': a, 'PRJ-002': b });
    expect(Object.keys(merged).sort()).toEqual(['PRJ-001', 'PRJ-002']);
    expect(merged['PRJ-001'].name).toBe('Steel water tank');
    // a newer live copy (edited in another browser) wins over an older local one
    expect(mergeProjectProcesses({ 'PRJ-001': { ...a, name: 'Newer', updatedAt: '2026-11-24T00:00:00Z' } }, { 'PRJ-001': a })['PRJ-001'].name).toBe('Newer');
    expect(Object.keys(withProjectProcess({ projectProcesses: {} }, 'PRJ-003', { ...b, id: 'PRJ-003' }, { 'PRJ-002': b }).projectProcesses).sort()).toEqual(['PRJ-002', 'PRJ-003']);
  });
});
