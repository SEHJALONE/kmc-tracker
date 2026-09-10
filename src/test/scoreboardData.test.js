import { describe, it, expect } from 'vitest';
import {
  parseGrid, parseCalc, parseLineCompletion, parseDowntimeMonthly, parseTargetsKv,
  computeLineCard,
} from '../hooks/useScoreboardData.js';

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

describe('parseDowntimeMonthly', () => {
  it('reads events past the reporting period, banner-glued header and all', () => {
    const csv = [
      '"PRODUCTION DOWNTIME LOG — one row per event (drives OEE / MTBF / MTTR) Date","Workshop","Equipment","Reason Code","Downtime (min)","Description"',
      '"02-Jul-2026","Frame & Body Welding","Welding Robot","M1 - Machine breakdown","42","x"',
      '"02-Sep-2026","","foaming machine","M1 - Machine breakdown","1200","y"',
    ].join('\n');
    expect(parseDowntimeMonthly(parseGrid(csv))).toEqual([
      { label: 'Jul 26', value: 0.7 },
      { label: 'Sep 26', value: 20 },
    ]);
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
