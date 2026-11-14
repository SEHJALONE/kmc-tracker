import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';
import { buildDelay, delayFormState, delayLabel, delayMinutes } from '../utils/delay';
import { activityTimesFromTask, cleanActivityTimes } from '../utils/activityTimes';

const SOURCE = readFileSync(resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');
const ID = '0f8c2a6e-1b2c-4d3e-8f90-123456789abc';
const card = (over = {}) => ({
  recordId: ID, timestamp: '2026-11-14T08:00:00.000Z', busModel: '12m KDC', project: '45 Bus Project', vin: 'VIN123',
  line: 'Paint Shop', station: 'Primer', stationCode: 'P01-01', clockIn: '2026-11-14T08:00', clockOut: '2026-11-14T09:00',
  actualTime: 60, designedTime: 55, activityStatuses: { Sanding: 'complete', Masking: 'complete' },
  activityTimes: { Sanding: 25, Masking: '' }, resourcesUsed: {}, operators: ['A. Op'], approvalStatus: 'pending_review',
  ...over,
});
const col = (rows, name) => rows[0].indexOf(name);

describe('Travel Card record id and activity minutes (Apps Script)', () => {
  it('keeps the id the site made, records minutes per activity, and never files a resend twice', async () => {
    const env = loadScripts([SOURCE]);
    expect((await env.call({ payload: JSON.stringify(card()) })).id).toBe(ID);
    const again = await env.call({ payload: JSON.stringify(card()) });
    expect(again).toMatchObject({ status: 'ok', id: ID, duplicate: true });
    const subs = env.rows('submissions');
    expect(subs.length).toBe(2);
    expect(subs[1][col(subs, 'record_id')]).toBe(ID);
    const acts = env.rows('activities');
    const byName = Object.fromEntries(acts.slice(1).map(r => [r[col(acts, 'activity')], r[col(acts, 'time_min')]]));
    expect(byName).toEqual({ Sanding: 25, Masking: '' });
  });

  it('makes its own id when the site sends none or a bad one', async () => {
    const env = loadScripts([SOURCE]);
    const r = await env.call({ payload: JSON.stringify(card({ recordId: 'not-a-uuid' })) });
    expect(r.status).toBe('ok');
    expect(r.id).not.toBe('not-a-uuid');
  });

  it('a resubmission after rejection goes back to pending review with the corrected VIN everywhere', async () => {
    const env = loadScripts([SOURCE]);
    await env.call({ payload: JSON.stringify(card()) });
    await env.call({ payload: JSON.stringify({ action: 'updateSubmission', recordId: ID, reviewOnly: true, approvalStatus: 'rejected', reviewer: 'Sup', reviewComments: 'wrong VIN' }) });
    const r = await env.call({ payload: JSON.stringify({ action: 'updateSubmission', requireStillPending: true, _fullEdit: true, ...card({ vin: 'VIN999', activityTimes: { Sanding: 30 } }), approvalStatus: 'pending_review' }) });
    expect(r.status).toBe('ok');
    const subs = env.rows('submissions');
    expect(subs[1][col(subs, 'vin')]).toBe('VIN999');
    expect(subs[1][col(subs, 'approval_status')]).toBe('pending_review');
    const acts = env.rows('activities');
    expect(acts.slice(1).every(row => row[col(acts, 'vin')] === 'VIN999')).toBe(true);
    expect(acts.find(row => row[col(acts, 'activity')] === 'Sanding')[col(acts, 'time_min')]).toBe(30);
  });
});

describe('unexpected delay minutes', () => {
  it('keeps exact minutes and typed "other" reasons', () => {
    const d = buildDelay(['Machine', 'Waiting for crane'], { Machine: '20', 'Waiting for crane': '45' });
    expect(d).toEqual({ types: ['Machine', 'Waiting for crane'], minutes: { Machine: 20, 'Waiting for crane': 45 } });
    expect(delayLabel(d, 'Waiting for crane')).toBe('45 min');
    expect(buildDelay([], {})).toBeNull();
  });
  it('still reads cards filed with time ranges', () => {
    const old = { types: ['Man', 'Method'], ranges: { Man: '15-30' } };
    expect(delayMinutes(old, 'Man')).toBe(22.5);
    expect(delayLabel(old, 'Man')).toBe('15–30 min');
    expect(delayLabel(old, 'Method')).toBe('flagged');
    expect(delayFormState(old)).toEqual({ types: ['Man', 'Method'], minutes: { Man: '22.5' } });
  });
});

describe('activity minutes', () => {
  it('drops blanks, zeros and removed activities', () => {
    expect(cleanActivityTimes({ A: '12', B: '', C: '0', D: '5' }, ['A', 'B', 'C'])).toEqual({ A: 12 });
  });
  it('prefills from a Start/End task’s tick times', () => {
    const t = activityTimesFromTask('2026-11-14T08:00:00Z', [
      { name: 'B', doneAt: '2026-11-14T08:50:00Z' }, { name: 'A', doneAt: '2026-11-14T08:20:00Z' }, { name: 'C', doneAt: '' },
    ]);
    expect(t).toEqual({ A: 20, B: 30 });
  });
});
