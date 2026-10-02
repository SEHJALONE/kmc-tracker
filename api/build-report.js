/**
 * GET /api/build-report?part=slide|dashboard|workbook
 *
 * Builds one scheduled-report file from the live Google Sheet and returns it as
 * a download. It sends no email and needs no key: the data is the same public
 * sheet the site reads. The daily email is sent by the Apps Script
 * (tools/mail-relay/Mail.gs → runScheduledReport), which fetches the three
 * parts from here and mails them from its Gmail account on a time trigger.
 */

import * as XLSX from 'xlsx';
import { buildPDF } from '../src/export/buildPDF.js';
import { buildSlidePDF } from '../src/export/buildSlidePDF.js';
import { buildWorkbook } from '../src/export/buildWorkbook.js';
import { LINES, STATIONS, isMajorStation, lookupStation } from '../src/data/stations.js';
import { isKDC, isEVS } from '../src/export/exportHelpers.js';
import { parseStationTimes, STATION_TIMES_URL } from '../src/hooks/useStationTimes.js';
import { LOGO_WHITE, LOGO_DARK } from '../src/data/logoData.js';

// ── Google Sheets data URL ──────────────────────────────────────────────────────
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es/gviz/tq?tqx=out:csv&sheet=Travel%20Card%20Data';

// ── CSV parser (mirrors useSheetData.js) ────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const col = names => {
    const n = names.map(x => x.toLowerCase());
    return headers.findIndex(h => n.some(name => h.toLowerCase().includes(name)));
  };

  const vinIdx            = col(['vin']);
  const modelIdx          = col(['bus model', 'model']);
  const stationIdx        = col(['station code', 'station_code', 'stationcode', 'station']);
  const timestampIdx      = col(['timestamp', 'time', 'date']);
  const approvalIdx       = col(['approval status', 'approval_status', 'approvalstatus']);
  const ohsIdx            = col(['ohs issue', 'ohs_issue', 'ohsissue', 'ohs']);
  const overrunIdx        = col(['overrun min', 'overrun_min', 'overrunmin', 'overrun']);
  const downtimeMinIdx    = col(['downtime min', 'downtime_min', 'downtimemin', 'downtime minutes']);
  const downtimeReasonIdx = col(['downtime reason', 'downtime_reason', 'downtimere']);
  const reworkFlagIdx     = col(['rework flag', 'rework_flag', 'reworkflag', 'rework']);
  const reworkHrsIdx      = col(['rework hours', 'rework_hours', 'reworkhours', 'rework hrs']);

  if (vinIdx === -1 || modelIdx === -1 || stationIdx === -1) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = [];
    let current = '', inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
      current += char;
    }
    cells.push(current.trim());

    const vin    = cells[vinIdx]?.trim();
    const model  = cells[modelIdx]?.trim() ?? '';
    const stCode = cells[stationIdx]?.trim().toUpperCase().replace(/\s+/g, '-');
    const ts     = timestampIdx >= 0 ? cells[timestampIdx]?.trim() : '';

    if (!vin || !stCode) continue;

    const downtimeRaw = reworkFlagIdx >= 0 ? cells[reworkFlagIdx]?.trim() : null;
    rows.push({
      vin, model, stationCode: stCode,
      timestamp: ts, rawTimestamp: ts,
      approvalStatus:  approvalIdx       >= 0 ? (cells[approvalIdx]?.trim()  || null) : null,
      ohsIssue:        ohsIdx            >= 0 ? (cells[ohsIdx]?.trim()       || null) : null,
      overrunMin:      overrunIdx        >= 0 ? (parseFloat(cells[overrunIdx]) || null) : null,
      downtimeMin:     downtimeMinIdx    >= 0 ? (parseFloat(cells[downtimeMinIdx]) || null) : null,
      downtimeReason:  downtimeReasonIdx >= 0 ? (cells[downtimeReasonIdx]?.trim() || null) : null,
      reworkFlag:      downtimeRaw !== null ? /^(yes|true|1|y)$/i.test(downtimeRaw) : null,
      reworkHrs:       reworkHrsIdx      >= 0 ? (parseFloat(cells[reworkHrsIdx]) || null) : null,
    });
  }
  return rows;
}

// ── Latest bus positions (mirrors useSheetData.js getLatestPositions) ───────────
function getLatestPositions(rows) {
  const map = {};
  for (const row of rows) {
    const ts = new Date(row.rawTimestamp || 0).getTime() || 0;
    if (!map[row.vin] || ts >= map[row.vin].ts) map[row.vin] = { ...row, ts };
  }
  return Object.values(map)
    .map(e => ({ ...e, station: lookupStation(e.stationCode) }))
    .filter(e => e.station);
}

// ── Metrics computation (mirrors Dashboard.jsx useMemo) ──────────────────────────
function computeMetrics(buses, allRows, stationTimes) {
  const total    = buses.length;
  const kdcCount = buses.filter(b => isKDC(b.model)).length;
  const evsCount = buses.filter(b => isEVS(b.model)).length;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const completedVins = new Set(
    allRows.filter(r => r.stationCode?.startsWith('Q') &&
      new Date(r.rawTimestamp || 0).getTime() > sevenDaysAgo).map(r => r.vin)
  );
  const prodRate = (completedVins.size / 7).toFixed(1);

  const dwellByStation = {}, countByStation = {}, vinRows = {};
  for (const row of allRows) {
    if (!vinRows[row.vin]) vinRows[row.vin] = [];
    vinRows[row.vin].push(row);
  }
  for (const rws of Object.values(vinRows)) {
    const sorted = [...rws].sort((a, b) => new Date(a.rawTimestamp || 0) - new Date(b.rawTimestamp || 0));
    for (let i = 0; i < sorted.length - 1; i++) {
      const code  = sorted[i].stationCode;
      const t1    = new Date(sorted[i].rawTimestamp   || 0).getTime();
      const t2    = new Date(sorted[i+1].rawTimestamp || 0).getTime();
      const dwell = (t2 - t1) / 3600000;
      if (dwell > 0 && dwell < 72) {
        dwellByStation[code]  = (dwellByStation[code]  || 0) + dwell;
        countByStation[code]  = (countByStation[code]  || 0) + 1;
      }
    }
  }
  const avgDwell = {};
  for (const code of Object.keys(dwellByStation)) avgDwell[code] = dwellByStation[code] / countByStation[code];

  const stationPerf = Object.entries(avgDwell)
    .filter(([code]) => isMajorStation(code))
    .map(([code, hours]) => {
      const estimated     = stationTimes[code];
      const estimatedHours = estimated ? estimated / 60 : null;
      const variancePct   = estimatedHours ? Math.round(((hours - estimatedHours) / estimatedHours) * 100) : null;
      const efficiency    = estimatedHours ? Math.round((estimatedHours / hours) * 100) : null;
      return { code, hours, name: STATIONS[code]?.name, line: STATIONS[code]?.line, estimatedHours, variancePct, efficiency, sortKey: variancePct !== null ? variancePct : hours };
    });

  const sorted = [...stationPerf].sort((a, b) => a.sortKey - b.sortKey);
  const bestStation  = sorted[0]  || null;
  const worstStation = sorted[sorted.length - 1] || null;

  const lineDwell = {}, lineCount2 = {}, lineVarianceSum = {}, lineVarianceCount = {};
  for (const { code, hours, variancePct } of stationPerf) {
    const st = STATIONS[code];
    if (!st) continue;
    lineDwell[st.line]  = (lineDwell[st.line]  || 0) + hours;
    lineCount2[st.line] = (lineCount2[st.line] || 0) + 1;
    if (variancePct !== null) {
      lineVarianceSum[st.line]   = (lineVarianceSum[st.line]   || 0) + variancePct;
      lineVarianceCount[st.line] = (lineVarianceCount[st.line] || 0) + 1;
    }
  }
  const linePerf = Object.keys(lineDwell).map(lid => {
    const hours       = lineDwell[lid] / lineCount2[lid];
    const variancePct = lineVarianceCount[lid] ? Math.round(lineVarianceSum[lid] / lineVarianceCount[lid]) : null;
    return { id: lid, hours, variancePct, label: LINES.find(l => l.id === lid)?.label || lid, sortKey: variancePct !== null ? variancePct : hours };
  }).sort((a, b) => a.sortKey - b.sortKey);
  const bestLine  = linePerf[0]                   || null;
  const worstLine = linePerf[linePerf.length - 1] || null;

  const busesByLine = {}, byModel = {};
  for (const bus of buses) {
    const lid = bus.station?.line;
    if (lid) busesByLine[lid] = (busesByLine[lid] || 0) + 1;
    byModel[bus.model] = (byModel[bus.model] || 0) + 1;
  }

  const overrunByStation = {}, overrunCountByStation = {};
  for (const row of allRows) {
    if (!row.overrunMin || row.overrunMin <= 0) continue;
    const code = row.stationCode;
    overrunByStation[code]      = (overrunByStation[code]      || 0) + row.overrunMin;
    overrunCountByStation[code] = (overrunCountByStation[code] || 0) + 1;
  }
  const overrunPareto = Object.entries(overrunByStation)
    .filter(([code]) => isMajorStation(code))
    .map(([code, totalMin]) => ({ code, name: STATIONS[code]?.name || code, line: STATIONS[code]?.line, lineName: LINES.find(l => l.id === STATIONS[code]?.line)?.label || '—', totalMin, count: overrunCountByStation[code], avgMin: Math.round(totalMin / overrunCountByStation[code]) }))
    .sort((a, b) => b.totalMin - a.totalMin)
    .slice(0, 8);

  const downtimeByReason = {};
  let totalDowntimeMin = 0;
  for (const row of allRows) {
    if (!row.downtimeMin || row.downtimeMin <= 0) continue;
    totalDowntimeMin += row.downtimeMin;
    const reason = row.downtimeReason || 'Unspecified';
    downtimeByReason[reason] = (downtimeByReason[reason] || 0) + row.downtimeMin;
  }
  const downtimePareto = Object.entries(downtimeByReason)
    .map(([reason, mins]) => ({ reason, mins, pct: totalDowntimeMin > 0 ? Math.round((mins / totalDowntimeMin) * 100) : 0 }))
    .sort((a, b) => b.mins - a.mins);
  let cumPct = 0;
  for (const d of downtimePareto) { cumPct += d.pct; d.cumPct = Math.min(cumPct, 100); }

  const reworkByStation = {};
  const reworkVins = new Set(), completedVinsAll = new Set();
  for (const row of allRows) {
    if (row.stationCode?.startsWith('Q')) completedVinsAll.add(row.vin);
    if (row.reworkFlag === true) {
      reworkVins.add(row.vin);
      if (row.stationCode && isMajorStation(row.stationCode))
        reworkByStation[row.stationCode] = (reworkByStation[row.stationCode] || 0) + (row.reworkHrs || 0);
    }
  }
  const hasReworkData   = allRows.some(r => r.reworkFlag !== null);
  const hasDowntimeData = totalDowntimeMin > 0;
  const firstPassYield  = hasReworkData && completedVinsAll.size > 0
    ? Math.round(((completedVinsAll.size - reworkVins.size) / completedVinsAll.size) * 100) : null;
  const reworkByStationList = Object.entries(reworkByStation)
    .map(([code, hrs]) => ({ code, name: STATIONS[code]?.name || code, line: STATIONS[code]?.line, hrs }))
    .sort((a, b) => b.hrs - a.hrs);

  const stationEfficiency = [...stationPerf].sort((a, b) => {
    if (a.efficiency !== null && b.efficiency !== null) return a.efficiency - b.efficiency;
    if (a.efficiency !== null) return -1;
    if (b.efficiency !== null) return 1;
    return b.hours - a.hours;
  });

  return {
    total, kdcCount, evsCount, prodRate,
    bestStation, worstStation, bestLine, worstLine,
    busesByLine, avgDwell, byModel,
    overrunPareto, stationEfficiency,
    downtimePareto, totalDowntimeMin, hasDowntimeData,
    firstPassYield, hasReworkData, reworkByStationList,
  };
}


// ── Main handler ──────────────────────────────────────────────────────────────────
const PARTS = {
  slide:     { name: d => `KMC_Presentation_${d}.pdf`, type: 'application/pdf' },
  dashboard: { name: d => `KMC_Dashboard_${d}.pdf`,    type: 'application/pdf' },
  workbook:  { name: d => `KMC_Dashboard_${d}.xlsx`,   type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const part = PARTS[req.query?.part];
  if (!part) return res.status(400).json({ error: 'part must be slide, dashboard or workbook' });

  try {
    const [sheetRes, stTimesRes] = await Promise.all([
      fetch(SHEET_URL + '&t=' + Date.now()),
      fetch(STATION_TIMES_URL + '&t=' + Date.now()),
    ]);
    const [sheetText, stTimesText] = await Promise.all([sheetRes.text(), stTimesRes.text()]);

    const allRows = parseCSV(sheetText);
    const buses   = getLatestPositions(allRows);
    const stationTimesRaw = parseStationTimes(stTimesText);
    const stationTimes    = Object.fromEntries(Object.entries(stationTimesRaw).map(([k, v]) => [k, v.minutes]));
    const metrics = computeMetrics(buses, allRows, stationTimes);

    const date = new Date().toISOString().slice(0, 10);
    let body;
    if (req.query.part === 'slide') {
      body = Buffer.from((await buildSlidePDF(buses, allRows, metrics, LOGO_DARK)).output('arraybuffer'));
    } else if (req.query.part === 'dashboard') {
      body = Buffer.from((await buildPDF(buses, allRows, metrics, LOGO_WHITE)).output('arraybuffer'));
    } else {
      body = Buffer.from(XLSX.write(buildWorkbook(buses, allRows, metrics), { bookType: 'xlsx', type: 'buffer' }));
    }

    res.setHeader('Content-Type', part.type);
    res.setHeader('Content-Disposition', `attachment; filename="${part.name(date)}"`);
    res.setHeader('X-Bus-Count', String(buses.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(body);
  } catch (err) {
    console.error('[build-report]', err);
    return res.status(500).json({ error: 'Could not build the report.' });
  }
}
