import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { buildDailyLog, averageActual, cardDate } from '../utils/dailyLogModel.js';
import { fillDailyLogDocx } from '../utils/dailyLogDocx.js';
import { ORG_UNITS } from '../data/orgStructure.js';

const TEMPLATE = readFileSync(resolve(__dirname, '../../public/templates/DPN_Operations_Daily_Log_Template.docx'));

const card = over => ({
  id: 'R1', clockIn: '2026-10-02 08:10', timestamp: '2026-10-02T12:00:00Z',
  stationCode: 'B01-02', line: 'Machine Shop', project: 'KDC-12', vin: 'VIN001',
  designedTime: 60, actualTime: 60, hasOverrun: false, approvalStatus: 'approved',
  activityStatuses: { a: 'complete', b: 'complete', c: 'incomplete', d: 'na' },
  operators: ['Okello J'], reviewer: 'Sup A', generalComments: '', downtime: null, unexpectedDelay: null,
  ...over,
});

const docText = async bytes => {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  return { xml, text: xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
};

describe('org structure', () => {
  it('has the 13 units of the chart, each with its division', () => {
    expect(ORG_UNITS).toHaveLength(13);
    expect(ORG_UNITS.find(u => u.id === 'PAINT').division).toBe('Electrophoresis and Paint Shops');
  });
});

describe('buildDailyLog', () => {
  it('prefills division, unit, tasks and status from the day\'s Travel Cards', () => {
    const log = buildDailyLog({
      date: '2026-10-02', unitId: 'MACHINE',
      submissions: [card(), card({ id: 'R2', clockIn: '2026-10-01 09:00' }), card({ id: 'R3', stationCode: 'P01-01', line: 'Paint Shop' })],
    });
    expect(log.division).toBe('Body Shop');
    expect(log.unit).toBe('Machine Shop');
    expect(log.tasks).toHaveLength(1);
    expect(log.tasks[0].task).toMatch(/Band Saw — KDC-12 VIN001/);
    expect(log.tasks[0].actual).toBe(67);
    expect(log.operator.name).toBe('Okello J');
    expect(log.supervisor.name).toBe('Sup A');
  });

  it('takes downtime and its D-code from the 6M causes, then the Downtime Log', () => {
    const log = buildDailyLog({
      date: '2026-10-02', unitId: 'MACHINE',
      submissions: [card({ downtime: { causeTimes: { Machine: 90, Man: 10 }, subCauses: { Machine: 'Machine breakdown' } } })],
      downtimeEvents: [{ workshop: 'Machine Shop', machineName: 'Laser cutter', reasonCode: 'D6-Quality Rework stoppage', startDate: new Date(2026, 9, 2), minutes: 30, description: 'Rework' }],
    });
    expect(log.tasks[0]).toMatchObject({ downtime: 1.67, reason: 'D1' });
    expect(log.tasks[1]).toMatchObject({ downtime: 0.5, reason: 'D6', actual: '' });
    expect(log.otherDowntimeReason).toBe('Laser cutter: Rework');
  });

  it('matches cards by line label when the station code is unknown, and plant-wide events everywhere', () => {
    const log = buildDailyLog({
      date: '2026-10-02', unitId: 'INTERIOR',
      submissions: [card({ stationCode: '', line: 'Trim' }), card({ stationCode: '', line: 'Trim Line & Final Assembly — EVS' })],
      downtimeEvents: [{ workshop: 'All workshops', reasonCode: 'D2-Power outage', startDate: new Date(2026, 9, 2), minutes: 20 }],
    });
    expect(log.tasks.map(t => t.source)).toEqual(['Travel Card', 'Travel Card', 'Downtime Log']);
    expect(log.tasks[2]).toMatchObject({ reason: 'D2', downtime: 0.33 });
  });

  it('uses local clock-in date, and averages only rows with a status', () => {
    expect(cardDate({ clockIn: '2026-10-02 23:30' })).toBe('2026-10-02');
    expect(averageActual([{ actual: 100 }, { actual: 50 }, { actual: '' }])).toBe(75);
  });
});

describe('fillDailyLogDocx', () => {
  const log = {
    division: 'Body Shop', unit: 'Machine Shop', date: '2026-10-02', startTime: '7:00 Hrs.', finishTime: '17:30 Hrs.',
    tasks: Array.from({ length: 8 }, (_, i) => ({ task: `Task ${i + 1} & co`, planned: 100, actual: i % 2 ? 50 : 100, downtime: i === 0 ? 1.5 : '', reason: i === 0 ? 'D1' : '', remarks: '' })),
    otherDowntimeReason: 'None', supervisorComment: 'Good shift',
    operator: { name: 'Okello J', designation: 'Operator', signature: '' },
    supervisor: { name: 'Sup A', designation: 'Supervisor', signature: '' },
  };

  it('writes every field into the template and keeps it a valid document', async () => {
    const out = await fillDailyLogDocx(TEMPLATE, log, 'uint8array');
    const { xml, text } = await docText(out);
    ['Body Shop', 'Machine Shop', '02/10/2026', 'Task 8 &amp; co', '1.5', 'D1', 'Good shift', '75%', 'Okello J', 'Supervisor']
      .forEach(s => expect(text).toContain(s));
    expect((xml.match(/<w:tr[ >]/g) || []).length).toBe(15 + 2);   // 2 rows cloned past the 6 blanks
    expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
    const zip = await JSZip.loadAsync(out);
    expect(zip.file('word/header1.xml')).toBeTruthy();               // header, logo and footer untouched
    expect(zip.file('word/media/image1.png')).toBeTruthy();
  });
});
