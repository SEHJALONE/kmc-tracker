import { describe, it, expect } from 'vitest';
import {
  parseGrid, parseCalc, parseLineCompletion, parseDowntimeLog, downtimeMonthlyTrend,
  summarizeDowntimeLog, activeDowntimeEvents, parseTargetsKv, computeLineCard,
  parseProjects, parseMonthlyPlan, parseLineMonthly,
} from '../hooks/useScoreboardData.js';
import { buildReportModel } from '../utils/productionReportModel.js';

// gviz folds a tab's leading instruction banner into the SAME cell as the
// first column heading, and omits fully-blank rows. Both shapes are
// reproduced here exactly as the live sheet serves them, because both have
// silently broken this parser before.
const CALC_CSV = [
  '"CALCULATION ENGINE — feeds Dashboard + web scoreboard. Do not edit. Workshop","Done","Active","Not Started","N/A","Due by Today","% Complete","Line Status","Constraint","(rank)"',
  '"Machine Shop","10","0","0","35","10","100%","ON TRACK","None","100%"',
  '"Frame & Body Welding","42","3","0","0","45","93%","ON TRACK","None","93%"',
  '"Trim & Final Assembly","32","3","10","0","45","71%","AT RISK","None","71%"',
  '"OVERALL / OBJECTIVE 1"',
  '"Completed","32"',
  '"Achievement %","71%"',
  '"Critical Activity"',
  '"OEE","10%"',
].join('\n');

describe('parseCalc', () => {
  const { kv, workshops } = parseCalc(parseGrid(CALC_CSV));

  it('finds the workshop table even when the banner is glued to the header', () => {
    expect(workshops.map(w => w.name)).toEqual([
      'Machine Shop', 'Frame & Body Welding', 'Trim & Final Assembly',
    ]);
    expect(workshops[1]).toMatchObject({ done: 42, active: 3, due: 45, status: 'ON TRACK' });
  });

  it('stops the workshop table at the KPI dump, with no blank spacer row to rely on', () => {
    expect(kv['Completed']).toMatchObject({ num: 32 });
    expect(kv['OEE']).toMatchObject({ num: 0.1 });
    expect(kv['OVERALL / OBJECTIVE 1']).toBeUndefined();
  });

  it('recovers Critical Activity, which gviz blanks as a string in a numeric column', () => {
    expect(kv['Critical Activity'].raw).toBe('Trim & Final Assembly');
  });
});

// One workshop block: | Plan Start | Plan End | Actual Start | Actual End |
// Status | Delay |, Trim & Final Assembly starting at column 40.
function trackerCsv(rows) {
  const head = Array(56).fill('');
  head[1] = 'Full VIN'; head[2] = 'Unit'; head[3] = 'Batch';
  const line = r => r.map(c => `"${c}"`).join(',');
  return [line(head), ...rows.map(line)].join('\n');
}
function unit(no, vin, ws) {
  const r = Array(56).fill('');
  r[0] = String(no); r[1] = vin; r[2] = `Unit ${no}`;
  const [ps, pe, as, ae, st] = ws;
  r[40] = ps; r[41] = pe; r[42] = as; r[43] = ae; r[44] = st;
  return r;
}

describe('parseLineCompletion', () => {
  const grid = parseGrid(trackerCsv([
    unit(1, 'VIN1', ['13-Jun', '18-Jun', '19-Aug', '04-Sep', 'Done']),
    unit(2, 'VIN2', ['17-Jun', '22-Jun', '01-Sep', '', 'Active']),
    unit(3, 'VIN3', ['01-Jun', '05-Jun', '01-Jun', '05-Jun', 'Done']),
  ]));
  const line = parseLineCompletion(grid)['Trim & Final Assembly'];

  it('carries actualStart as well as actualEnd', () => {
    expect(line.tasks[1]).toMatchObject({ actualStart: '2026-09-01', actualEnd: null, done: false });
  });

  it('still reports cumulative done/target', () => {
    expect(line).toMatchObject({ done: 2, target: 3 });
  });
});

describe('parseDowntimeLog / downtimeMonthlyTrend / summarizeDowntimeLog', () => {
  // Mirrors the external Production Downtime Log sheet's real column layout:
  // blank A, Workshop=B, blank C/D, Start Date=E, Start Time=F, End Date=G,
  // End Time=H, Status=I, Downtime (min)=J, Description=K, Remark=L, Month=M.
  // Rows are filled in manually below the header with no fixed end row, so
  // the fixture includes the header itself, a blank line marking the end of
  // real entries, and — past that — a day-of-week helper row from the
  // sheet's own calculation engine, to prove both stop the read.
  function downtimeLogCsv(rows) {
    const header = Array(13).fill('');
    header[0] = '#'; header[1] = 'Workshop'; header[2] = 'Machine Name';
    header[3] = 'Reason Code'; header[4] = 'Start Date';
    const line = r => r.map(c => `"${c}"`).join(',');
    return [line(header), ...rows.map(line)].join('\n');
  }
  // `no` is the sheet's own auto-numbered # column; the template's worked
  // example row carries "ex" there instead, and gviz hands that back blank.
  function event(no, workshop, startDate, status, minutes, reasonCode = 'D1-Equipment Breakdown') {
    const r = Array(13).fill('');
    r[0] = no; r[1] = workshop; r[2] = 'Some Machine'; r[3] = reasonCode;
    r[4] = startDate; r[8] = status; r[9] = String(minutes);
    return r;
  }

  const grid = parseGrid(downtimeLogCsv([
    event('', 'Paint Shop', '09-Sep-2026', 'Closed', 210),   // the "ex" example row
    event('1', 'Frame & Body Welding', '02-Jul-2026', 'Closed', 42),
    event('2', 'Paint Shop', '02-Sep-2026', 'Closed', 1200),
    event('3', 'Machine Shop', '05-Sep-2026', 'Open', 300),
    event('4', 'All workshops', '06-Sep-2026', 'Closed', 60, 'D2-Power outage'),
    event('', 'Trim & Final Assembly', '', 'Open', 0),       // unfilled row
  ]));
  const events = parseDowntimeLog(grid);

  it('skips the template example row and unfilled rows, keyed on the sheet-numbered # column', () => {
    expect(events).toHaveLength(4);
    expect(events.some(e => e.minutes === 210)).toBe(false);
    expect(events[0]).toMatchObject({
      workshop: 'Frame & Body Welding', status: 'Closed', minutes: 42,
      reasonCode: 'D1-Equipment Breakdown', machineName: 'Some Machine',
    });
  });

  it('trends by month across full history regardless of any period', () => {
    expect(downtimeMonthlyTrend(events)).toEqual([
      { label: 'Jul 26', value: 0.7 },
      { label: 'Sep 26', value: 26 }, // (1200 + 300 + 60) / 60
    ]);
  });

  it('scopes Unplanned Downtime + event count to the given period, and MTTR to CLOSED events only', () => {
    const summary = summarizeDowntimeLog(events, '2026-09-01', '2026-09-30');
    expect(summary.eventCount).toBe(3);
    expect(summary.hours).toBe(26);
    expect(summary.mttrHours).toBe(10.5); // the two Closed events: (1200 + 60) / 60 / 2
  });

  it('splits the period by Reason Code so the breakdown rows add up to the total', () => {
    const summary = summarizeDowntimeLog(events, '2026-09-01', '2026-09-30');
    expect(summary.byReason['D1-Equipment Breakdown']).toBe(25);
    expect(summary.byReason['D2-Power outage']).toBe(1);
    expect(summary.byReason['D4-Safety Incident']).toBe(0);
    expect(summary.uncategorisedHours).toBe(0);
    const summed = Object.values(summary.byReason).reduce((a, b) => a + b, 0);
    expect(summed + summary.uncategorisedHours).toBe(summary.hours);
  });

  it('parks hours with a blank or off-dropdown Reason Code in uncategorised rather than losing them', () => {
    const odd = parseDowntimeLog(parseGrid(downtimeLogCsv([
      event('1', 'Paint Shop', '02-Sep-2026', 'Closed', 120, ''),
    ])));
    const summary = summarizeDowntimeLog(odd, '2026-09-01', '2026-09-30');
    expect(summary.uncategorisedHours).toBe(2);
    expect(summary.hours).toBe(2);
  });

  it('activeDowntimeEvents lists only OPEN events, oldest-start first, regardless of any period', () => {
    const multi = parseDowntimeLog(parseGrid(downtimeLogCsv([
      event('1', 'Paint Shop', '05-Sep-2026', 'Open', 100),
      event('2', 'Machine Shop', '01-Sep-2026', 'Open', 200),   // earlier start — should sort first
      event('3', 'Body Shop', '01-Jan-2026', 'Closed', 999),    // closed — excluded even though oldest
    ])));
    const active = activeDowntimeEvents(multi);
    expect(active.map(e => e.workshop)).toEqual(['Machine Shop', 'Paint Shop']);
    expect(active[0]).toMatchObject({ hours: 200 / 60 });
    expect(active[0].startedLabel).toMatch(/2026/);
  });
});

describe('parseTargetsKv', () => {
  // gviz types a column from its majority value and blanks everything else, so
  // the text settings in the otherwise-numeric column B arrive empty. The
  // workbook mirrors them into a text-only column C; this is the read side.
  const csv = [
    '"TARGETS, BASELINES & LISTS","",""',
    '"Period Start Override","11-May-2026","(text copy — do not edit)"',
    '"Program Target (vehicles)","45",""',
    '"Planned Downtime Hours (period)","",""',
    '"Program / Project Name","","45-BUS PRODUCTION PROJECT"',
    '"Shift Label","","DAY SHIFT"',
  ].join('\n');
  const kv = parseTargetsKv(parseGrid(csv));

  it('reads normal label/value pairs from column B', () => {
    expect(kv['Program Target (vehicles)']).toMatchObject({ num: 45 });
    expect(kv['Period Start Override'].raw).toBe('11-May-2026');
  });

  it('falls back to the text-mirror column when B came back blank', () => {
    expect(kv['Shift Label'].raw).toBe('DAY SHIFT');
    expect(kv['Program / Project Name'].raw).toBe('45-BUS PRODUCTION PROJECT');
  });

  it('skips rows that are empty in both columns', () => {
    expect(kv['Planned Downtime Hours (period)']).toBeUndefined();
    expect(kv['TARGETS, BASELINES & LISTS']).toBeUndefined();
  });
});

describe('computeLineCard — range filter', () => {
  const range = { start: '2026-09-01', end: '2026-09-30' };
  // Paint Shop, mirroring the live Tracker on 2026-09-10: three units the line
  // touched in September. One (bus completed 07-Sep) is Done inside the range;
  // two are still on the line (actual start in Sept, no actual end yet). Every
  // plan window closed back in June — exactly the shape that made the old
  // plan-only cohort match nothing.
  const comp = {
    done: 37, target: 45,
    tasks: [
      { planStart: '2026-06-16', planEnd: '2026-06-22', actualStart: '2026-08-24', actualEnd: '2026-09-07', done: true },
      { planStart: '2026-06-20', planEnd: '2026-06-26', actualStart: '2026-09-03', actualEnd: null, done: false },
      { planStart: '2026-06-22', planEnd: '2026-06-27', actualStart: '2026-09-09', actualEnd: null, done: false },
      { planStart: '2026-05-10', planEnd: '2026-05-15', actualStart: '2026-05-10', actualEnd: '2026-06-01', done: true },
    ],
  };

  it('shows the bus completed 07-Sep when the board is filtered to September', () => {
    const card = computeLineCard(comp, undefined, range, undefined);
    expect(card.done).toBe(1);          // was 0 on the old plan-only cohort
    expect(card.target).toBe(3);        // the 3 units the line worked on in Sept
  });

  it('honours a manual per-line target as the denominator', () => {
    const card = computeLineCard(comp, undefined, range, 5);
    expect(card.done).toBe(1);
    expect(card.target).toBe(5);
    expect(card.status).toBe('DELAYED');
  });

  it('never counts a bus finished before the range', () => {
    // The 01-Jun completion must not leak into a September card.
    const card = computeLineCard(comp, undefined, range, undefined);
    expect(card.done).toBe(1);
  });

  it('never exceeds 100% — done and target come from one cohort', () => {
    const card = computeLineCard(comp, undefined, range, undefined);
    expect(card.pct).toBeLessThanOrEqual(1);
  });

  it('falls back to cumulative totals when the parse yielded no task dates', () => {
    const card = computeLineCard({ done: 37, target: 45, tasks: [] }, undefined, range, undefined);
    expect(card).toMatchObject({ done: 37, target: 45 });
  });
});

// ── Targets sheet, the two new tables ────────────────────────────────────
// Both live out at columns Z and AJ, past the workbook's dropdown lists, and
// are anchored on their all-text first column because gviz types a column
// from its data and blanks a text header sitting over numbers or dates.
describe('parseProjects / parseMonthlyPlan', () => {
  const Z = 25, AD = 29;
  const row = (cells) => {
    const r = Array(40).fill('');
    Object.entries(cells).forEach(([k, v]) => { r[Number(k)] = v; });
    return r;
  };
  const reg = (name, model, vin) => row({ [Z]: name, [Z + 1]: model, [Z + 2]: vin });
  const plan = (month, units) => {
    const cells = { [AD]: month };
    units.forEach((u, i) => { cells[AD + 1 + i] = String(u); });
    return row(cells);
  };
  const merge = (a, b) => a.map((v, i) => v || b[i]);

  const grid = [
    ['TARGETS, BASELINES & LISTS'],
    [],
    merge(row({ 0: 'Period Start Override', [Z]: 'Project Name', [Z + 1]: 'Model', [Z + 2]: 'Full VIN' }),
          row({ [AD]: 'Month' })),
    // the workshop header names sit in otherwise-numeric columns, so gviz
    // blanks them - left empty here on purpose, to prove the fallback order
    merge(reg('45-Bus Project', '7m KEV', 'VIN-A'), plan('May-2026', [4, 5, 6, 7, 8, 9, 10, 11])),
    merge(reg('45-Bus Project', '7m KEV', 'VIN-B'), plan('Jun-2026', [0, 0, 0, 3, 0, 0, 12, 0])),
    merge(reg('45-Bus Project', '12m KDC', 'VIN-C'), Array(40).fill('')),
    reg('Depot Retrofit', '10m KEV', 'VIN-D'),
    // blank row, then the usage note - neither may be read as data
    Array(40).fill(''),
    row({ [Z]: 'BUS PROJECTS: one row per bus - Project Name, Model, Full VIN...' }),
  ];

  it('groups the one-row-per-bus registry into projects, and stops at the blank row', () => {
    const projects = parseProjects(grid);
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      name: '45-Bus Project', model: '7m KEV, 12m KDC', units: 3,
    });
    expect(projects[0].vins).toEqual(['VIN-A', 'VIN-B', 'VIN-C']);
    expect(projects[1]).toMatchObject({ name: 'Depot Retrofit', model: '10m KEV', units: 1 });
  });

  it('takes more units on a project from nothing more than extra rows', () => {
    const more = parseProjects([...grid.slice(0, 7), reg('Depot Retrofit', '10m KEV', 'VIN-E'), ...grid.slice(7)]);
    expect(more.find(p => p.name === 'Depot Retrofit')).toMatchObject({ units: 2 });
  });

  it('reads the monthly plan per workshop, falling back to the Tracker column order', () => {
    const p = parseMonthlyPlan(grid);
    const may = [...p.values()].find(v => v.label === 'May 26');
    expect(may.units['Machine Shop']).toBe(4);
    expect(may.units['Trim & Final Assembly']).toBe(10);
    const jun = [...p.values()].find(v => v.label === 'Jun 26');
    expect(jun.units['Trim & Final Assembly']).toBe(12);
    expect(jun.units['Frame & Body Welding']).toBe(3);
  });

  it('makes the Monthly Plan the source of Planned, not the Tracker plan dates', () => {
    const tracker = parseGrid(trackerCsv([
      unit(1, 'VIN1', ['01-Jun', '05-Jun', '01-Jun', '05-Jun', 'Done']),
      unit(2, 'VIN2', ['02-Jun', '06-Jun', '02-Jun', '06-Jun', 'Done']),
    ]));
    // Tracker alone would call June's plan 2; the plan table says 12
    const withoutPlan = parseLineMonthly(tracker);
    expect(withoutPlan.byLine['Trim & Final Assembly'][0]).toMatchObject({ planned: 2, actual: 2 });

    const withPlan = parseLineMonthly(tracker, parseMonthlyPlan(grid));
    const june = withPlan.byLine['Trim & Final Assembly'].find(x => x.label === 'Jun 26');
    expect(june).toMatchObject({ planned: 12, actual: 2 });
  });
});

// ── Annex A's cohort ─────────────────────────────────────────────────────
// The annex is a record of what MOVED in the reporting month. A unit that
// started on a line in an earlier month and simply sat there, with nothing
// dated inside the month, has no progress to report and is left off.
describe('buildReportModel — Annex A only lists units worked on in the month', () => {
  const bus = (no, ws) => ({ no, unit: `Unit ${no}`, vin: `VIN${no}`, done: false, ws });
  const TF = 'Trim & Final Assembly';
  const PAINT = 'Paint Shop';

  const buses = [
    // started in August, still on the line, nothing dated in September
    bus(1, { [PAINT]: { actualStart: '2026-08-10', actualEnd: null } }),
    // started in August but finished that line in September - real progress
    bus(2, { [PAINT]: { actualStart: '2026-08-28', actualEnd: '2026-09-04' } }),
    // started fresh in September
    bus(3, { [TF]: { actualStart: '2026-09-09', actualEnd: null } }),
    // touched neither month
    bus(4, { [TF]: { actualStart: '2026-07-01', actualEnd: '2026-07-20' } }),
  ];
  const model = buildReportModel({ buses, month: '2026-09' });
  const listed = model.inProgress.map(b => b.no);

  it('drops the carry-over unit that made no progress in the month', () => {
    expect(listed).not.toContain(1);
  });

  it('keeps units that started or finished a workshop inside the month', () => {
    expect(listed).toContain(2);
    expect(listed).toContain(3);
  });

  it('ignores units whose work sits entirely in other months', () => {
    expect(listed).not.toContain(4);
  });

  it('orders by the earliest input that actually falls in the month', () => {
    expect(listed).toEqual([2, 3]);
    expect(model.inProgressCount).toBe(2);
  });
});
