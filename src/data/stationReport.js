// Station reports (Shop Floor > Station reports): key figures per station for a
// period, split by bus model, plus what non-bus job orders did there.
//
// Bus work comes from the filed travel cards (one card = one station job on one
// bus). Job-order work comes from the Start/End runs on job orders: Machine Shop
// cut lists (pieces and metres cut), Paint Shop / Parts Making steps, and
// non-bus "Other Projects" (job order ids starting OP-), with the waste logged
// on each run.

import { stationLineOf, lookupStation, LINES } from './stations';
import { partLabel, activityLabel, isActivityJob, cleanWaste, wasteTotals } from './jobOrders';

export const LINE_IMAGE = {
  MACHINE:  '/Machine Shop.jpg',
  BODY:     '/Frame Parts Making.jpg',
  ELECTRO:  '/Electrophoresis.png',
  FRAME:    '/Frame & Body Welding.png',
  CHASSIS1: '/Chassis Line 02.jpg',
  CHASSIS2: '/Chassis Line 02.jpg',
  PAINT:    '/Paint Shop.png',
  TRIM:     '/Trim Line & Final Assembly.jpg',
  QA:       '/Quality Inspection & Testing.png',
};

const BUS_IMAGES = {
  '7m evs': '/7m EVS.png', '8.5m evs': '/8.5m EVS.png', '10.5m evs': '/10.5m EVS.png', '12m evs': '/12m EVS.png',
  '10.5m kdc': '/10.5m KDC.png', '12m kdc': '/12m KDC.png', '13m kec': '/13m KEC.png',
};
const modelKey = m => String(m || '').toLowerCase().replace(/\s+/g, ' ').replace(/(\d)\s+m\b/, '$1m').trim();
export const busImage = model => BUS_IMAGES[modelKey(model)] || null;
export const familyTone = m => (/KDC/i.test(m) ? '#dc2626' : /KEC/i.test(m) ? '#f59e0b' : '#0ea5e9');

export const PERIODS = [
  { id: '7', label: '7 days', days: 7 },
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];
export const periodStart = (id, now = Date.now()) => {
  const p = PERIODS.find(x => x.id === id);
  return p?.days ? new Date(now - p.days * 86400000).toISOString() : '';
};

const iso = v => { const d = new Date(v); return isNaN(d) ? '' : d.toISOString(); };
const lengthMm = it => { const v = parseFloat(String(it.length || '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const runMinutes = r => Math.max(0, Math.round((new Date(r.closedAt || Date.now()) - new Date(r.startedAt)) / 60000)) || 0;
const people = list => (list || []).map(s => String(s || '').trim()).filter(Boolean);

function blankStation(code, lineId, name) {
  return {
    code, lineId, name,
    cards: 0, minutes: 0, timed: 0, designed: 0, designedN: 0, overDesigned: 0,
    staff: new Set(), vins: new Set(), models: new Map(),
    jobs: null,
  };
}
function blankJobs() {
  return {
    runs: 0, minutes: 0, staff: new Set(), jobIds: new Set(), busJobIds: new Set(), projects: new Set(),
    pieces: 0, metres: 0, specs: new Map(), steps: new Map(), waste: [],
  };
}

// cards: travel card submissions; jobOrders + runs: from listJobData.
// keep(code): the person's station scope. Returns { lines, totals }: lines in tracker order, each
// with its stations in line order.
export function buildStationReport({ cards = [], jobOrders = [], runs = [], from = '', keep = () => true } = {}) {
  const stations = new Map();
  const lineSets = new Map(); // lineId -> people and buses, each counted once per line
  const lineSet = id => { if (!lineSets.has(id)) lineSets.set(id, { staff: new Set(), vins: new Set(), minutes: 0, timed: 0 }); return lineSets.get(id); };
  const stationFor = (code, line, name) => {
    const k = String(code || '').trim().toUpperCase() || '?';
    if (!stations.has(k)) {
      const lineId = stationLineOf(code) || `?${line || 'Other'}`;
      stations.set(k, blankStation(code || '?', lineId, lookupStation(code)?.name || String(name || '').replace(/^[^:]+:\s*/, '')));
    }
    return stations.get(k);
  };

  // ── Travel cards, by bus model ──
  for (const c of cards) {
    const at = iso(c.clockOut) || iso(c.timestamp);
    if (from && at && at < from) continue;
    if (!keep(c.stationCode)) continue;
    const s = stationFor(c.stationCode, c.line, c.station);
    const crew = people(c.operators).length ? people(c.operators) : people([c.submittedBy]);
    const model = String(c.busModel || '').trim() || 'No model';
    const m = s.models.get(model) || { model, cards: 0, minutes: 0, timed: 0, designed: 0, designedN: 0, staff: new Set(), vins: new Set() };
    const mins = Number(c.actualTime) || 0;
    const des = Number(c.designedTime) || 0;
    for (const x of [s, m]) {
      x.cards += 1;
      if (mins > 0) { x.minutes += mins; x.timed += 1; }
      if (des > 0) { x.designed += des; x.designedN += 1; }
      crew.forEach(p => x.staff.add(p));
      if (c.vin) x.vins.add(String(c.vin).trim().toUpperCase());
    }
    if (des > 0 && mins > des) s.overDesigned += 1;
    s.models.set(model, m);
    const ls = lineSet(s.lineId);
    crew.forEach(p => ls.staff.add(p));
    if (c.vin) ls.vins.add(String(c.vin).trim().toUpperCase());
    if (mins > 0) { ls.minutes += mins; ls.timed += 1; }
  }

  // ── Job-order runs (Machine Shop cut lists, Paint / Parts Making steps, Other Projects) ──
  const jobsById = new Map((jobOrders || []).map(j => [j.id, j]));
  for (const r of runs || []) {
    if (r.status === 'discarded' || !r.jobOrderId) continue;
    const at = iso(r.closedAt) || iso(r.updatedAt) || iso(r.startedAt);
    if (from && at && at < from && r.status !== 'open') continue;
    if (!keep(r.stationCode)) continue;
    const job = jobsById.get(r.jobOrderId);
    const s = stationFor(r.stationCode, r.line, r.station);
    const j = (s.jobs ||= blankJobs());
    const other = /^OP-/.test(String(r.jobOrderId)) || job?.kind === 'other';
    j.runs += 1;
    j.minutes += runMinutes(r);
    people([r.ownerName || r.owner]).forEach(p => { j.staff.add(p); lineSet(s.lineId).staff.add(p); });
    j.jobIds.add(r.jobOrderId);
    if (other) j.projects.add(job?.projectId || job?.project || r.project || r.jobOrderId);
    else j.busJobIds.add(r.jobOrderId);
    j.waste.push(...cleanWaste(r.waste));

    const done = (r.activities || []).filter(a => a.doneAt && (!from || a.doneAt >= from));
    if (!job || !done.length) continue;
    if (isActivityJob(job)) {
      const byLabel = new Map((job.activities || []).filter(a => a?.name).map(a => [activityLabel(a), a]));
      for (const d of done) {
        const a = byLabel.get(d.name);
        const name = a?.name || d.name;
        const unit = a?.unit || '';
        const st = j.steps.get(`${name}|${unit}`) || { name, unit, times: 0, qty: 0 };
        st.times += 1;
        st.qty += Number(a?.qty) || 0;
        j.steps.set(`${name}|${unit}`, st);
      }
    } else {
      const byLabel = new Map((job.items || []).filter(it => it.cut).map(it => [partLabel(it), it]));
      for (const d of done) {
        const it = byLabel.get(d.name);
        if (!it) continue;
        const pcs = Number(it.qty) || 0;
        const metres = (pcs * lengthMm(it)) / 1000;
        const k = it.spec || it.material || '(no specification)';
        const sp = j.specs.get(k) || { spec: k, material: it.material || '', pieces: 0, metres: 0 };
        sp.pieces += pcs; sp.metres += metres;
        j.specs.set(k, sp);
        j.pieces += pcs; j.metres += metres;
      }
    }
  }

  // ── Shape for the page ──
  const avg = (sum, n) => (n ? Math.round(sum / n) : 0);
  const out = new Map();
  for (const s of stations.values()) {
    const jobs = s.jobs && {
      runs: s.jobs.runs, avgRun: avg(s.jobs.minutes, s.jobs.runs), minutes: s.jobs.minutes,
      staff: [...s.jobs.staff], jobs: s.jobs.jobIds.size, busJobs: s.jobs.busJobIds.size, projects: [...s.jobs.projects],
      pieces: s.jobs.pieces, metres: Math.round(s.jobs.metres * 10) / 10,
      specs: [...s.jobs.specs.values()].map(x => ({ ...x, metres: Math.round(x.metres * 10) / 10 })).sort((a, b) => b.metres - a.metres || b.pieces - a.pieces),
      steps: [...s.jobs.steps.values()].sort((a, b) => b.times - a.times),
      waste: wasteTotals(s.jobs.waste),
    };
    const staff = new Set([...s.staff, ...(jobs?.staff || [])]);
    const station = {
      code: s.code, name: s.name, lineId: s.lineId, order: lookupStation(s.code)?.order ?? 999,
      cards: s.cards, staff: staff.size, buses: s.vins.size,
      avgMin: avg(s.minutes, s.timed), avgDesigned: avg(s.designed, s.designedN), overDesigned: s.overDesigned,
      models: [...s.models.values()].map(m => ({
        model: m.model, cards: m.cards, buses: m.vins.size, staff: m.staff.size,
        avgMin: avg(m.minutes, m.timed), avgDesigned: avg(m.designed, m.designedN),
      })).sort((a, b) => b.cards - a.cards),
      jobs,
    };
    if (!out.has(s.lineId)) out.set(s.lineId, []);
    out.get(s.lineId).push(station);
  }

  const order = [...LINES.map(l => l.id), ...[...out.keys()].filter(k => !LINES.some(l => l.id === k))];
  const lines = order.filter(id => out.has(id)).map(id => {
    const list = out.get(id).sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
    const line = LINES.find(l => l.id === id);
    const ls = lineSets.get(id) || { staff: new Set(), vins: new Set(), minutes: 0, timed: 0 };
    return {
      id, label: line?.label || id.replace(/^\?/, '') || 'Other',
      stations: list,
      cards: list.reduce((n, s) => n + s.cards, 0),
      runs: list.reduce((n, s) => n + (s.jobs?.runs || 0), 0),
      staff: ls.staff.size, buses: ls.vins.size, avgMin: avg(ls.minutes, ls.timed),
    };
  });
  // Whole-report totals: a person or bus seen on two lines counts once.
  const all = { staff: new Set(), vins: new Set(), minutes: 0, timed: 0 };
  for (const ls of lineSets.values()) {
    ls.staff.forEach(p => all.staff.add(p)); ls.vins.forEach(v => all.vins.add(v));
    all.minutes += ls.minutes; all.timed += ls.timed;
  }
  return {
    lines,
    totals: {
      stations: lines.reduce((n, l) => n + l.stations.length, 0),
      cards: lines.reduce((n, l) => n + l.cards, 0), runs: lines.reduce((n, l) => n + l.runs, 0),
      staff: all.staff.size, buses: all.vins.size, avgMin: avg(all.minutes, all.timed),
    },
  };
}

export const fmtMin = m => {
  if (!m) return '-';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
