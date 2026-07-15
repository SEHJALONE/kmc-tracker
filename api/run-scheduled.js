/**
 * Vercel Cron endpoint — generates PDFs + Excel server-side and sends via Resend.
 * Triggered by vercel.json cron config (daily at 07:00 UTC).
 *
 * Required env vars (set in Vercel dashboard):
 *   RESEND_API_KEY         — from resend.com
 *   SCHEDULED_EMAIL_TO     — comma-separated list of recipient addresses
 *   EMAIL_FROM             — sender, e.g. "KMC Tracker <onboarding@resend.dev>"
 *   CRON_SECRET            — a random string to protect this endpoint
 *
 * Optional env vars:
 *   SCHEDULED_SUBJECT      — email subject line
 */

import { Resend } from 'resend';
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

// ── Email body ────────────────────────────────────────────────────────────────────
function buildEmailBody(busCount, date) {
  return `
    <div style="font-family:Arial,sans-serif;background:#07090f;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto;border-radius:8px;">
      <div style="border-top:3px solid #dc2626;padding-top:20px;margin-bottom:24px;">
        <h1 style="color:#fff;font-size:20px;margin:0 0 4px;letter-spacing:.1em;text-transform:uppercase;">KMC Bus Production Tracker</h1>
        <p style="color:#475569;font-size:12px;margin:0;font-family:monospace;">Scheduled Report · ${date}</p>
      </div>
      <div style="background:rgba(13,21,38,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;margin-bottom:20px;">
        <p style="color:#94a3b8;font-size:13px;margin:0 0 12px;">Please find attached the latest KMC Bus Production Dashboard report.</p>
        <p style="color:#64748b;font-size:12px;margin:0;font-family:monospace;">Buses on floor: <strong style="color:#f1f5f9;">${busCount}</strong></p>
        <p style="color:#64748b;font-size:12px;margin:8px 0 0;font-family:monospace;">Attachments: Slide PDF · Dashboard PDF · Excel Workbook</p>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:16px;font-size:10px;color:#1e2d40;font-family:monospace;letter-spacing:.06em;">
        KIIRA MOTORS CORPORATION — CONFIDENTIAL · Auto-generated by KMC Bus Tracker
      </div>
    </div>
  `;
}

// ── Main handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Allow GET and POST so Vercel Cron (GET) and manual tests (POST) both work
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Protect with CRON_SECRET — Vercel automatically sets Authorization header for crons
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not set' });
  }

  const toRaw = process.env.SCHEDULED_EMAIL_TO;
  if (!toRaw) {
    return res.status(500).json({ error: 'SCHEDULED_EMAIL_TO env var not set. Add comma-separated recipient addresses in Vercel dashboard.' });
  }

  console.log('[run-scheduled] Starting scheduled report generation…');

  try {
    // ── 1. Fetch data ─────────────────────────────────────────────────────────
    const [sheetRes, stTimesRes] = await Promise.all([
      fetch(SHEET_URL + '&t=' + Date.now()),
      fetch(STATION_TIMES_URL + '&t=' + Date.now()),
    ]);

    const [sheetText, stTimesText] = await Promise.all([
      sheetRes.text(),
      stTimesRes.text(),
    ]);

    const allRows = parseCSV(sheetText);
    const buses   = getLatestPositions(allRows);
    console.log(`[run-scheduled] Fetched ${allRows.length} rows, ${buses.length} buses on floor`);

    const stationTimesRaw = parseStationTimes(stTimesText);
    const stationTimes    = Object.fromEntries(Object.entries(stationTimesRaw).map(([k, v]) => [k, v.minutes]));

    // ── 2. Compute metrics ────────────────────────────────────────────────────
    const metrics = computeMetrics(buses, allRows, stationTimes);
    console.log(`[run-scheduled] Metrics computed. Delayed: ${buses.filter(b => {
      const ts = new Date(b.rawTimestamp || 0).getTime();
      return ts && (Date.now() - ts) > 48 * 3600000;
    }).length}`);

    // ── 3. Build attachments ──────────────────────────────────────────────────
    // Logos are pre-encoded as data URIs in src/data/logoData.js — no FileReader needed.
    const [slidePdfDoc, dashPdfDoc] = await Promise.all([
      buildSlidePDF(buses, allRows, metrics, LOGO_DARK),
      buildPDF(buses, allRows, metrics, LOGO_WHITE),
    ]);
    const wb = buildWorkbook(buses, allRows, metrics);

    const date      = new Date().toISOString().slice(0, 10);
    const slideB64  = slidePdfDoc.output('datauristring').split(',')[1];
    const dashB64   = dashPdfDoc.output('datauristring').split(',')[1];
    const xlsxB64   = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

    console.log('[run-scheduled] Attachments built. Sending via Resend…');

    // ── 4. Send via Resend ────────────────────────────────────────────────────
    const resend  = new Resend(process.env.RESEND_API_KEY);
    const toList  = toRaw.split(',').map(e => e.trim()).filter(Boolean);
    const from    = process.env.EMAIL_FROM || 'KMC Tracker <onboarding@resend.dev>';
    const subject = process.env.SCHEDULED_SUBJECT || `KMC Bus Production Report — ${date}`;

    const result = await resend.emails.send({
      from, to: toList, subject,
      html: buildEmailBody(buses.length, new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })),
      attachments: [
        { filename: `KMC_Presentation_${date}.pdf`,  content: slideB64 },
        { filename: `KMC_Dashboard_${date}.pdf`,     content: dashB64  },
        { filename: `KMC_Dashboard_${date}.xlsx`,    content: xlsxB64  },
      ],
    });

    console.log(`[run-scheduled] Email sent. ID: ${result.data?.id}`);
    return res.json({ ok: true, sent: true, id: result.data?.id, buses: buses.length, to: toList });
  } catch (err) {
    console.error('[run-scheduled] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
