import * as XLSX from 'xlsx';
import { LINES, STATIONS } from '../data/stations';
import { isKDC, isEVS, fmt, fmtDate, getStatus } from './exportHelpers';

export function buildWorkbook(buses, rows, metrics) {
  const wb    = XLSX.utils.book_new();
  const stamp = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Sheet 1: Summary ─────────────────────────────────────────
  const summaryData = [
    ['KMC Bus Production Tracker — Dashboard Export'],
    [`Generated: ${stamp}`],
    [],
    ['Metric', 'Value'],
    ['Total buses on floor',         metrics.total],
    ['KDC units',                    metrics.kdcCount],
    ['EVS units',                    metrics.evsCount],
    ['Production rate (7-day avg)',  `${metrics.prodRate} buses/day`],
  ];
  if (metrics.firstPassYield !== null && metrics.firstPassYield !== undefined) {
    summaryData.push(['First Pass Yield', `${metrics.firstPassYield}%`]);
  }
  if (metrics.hasDowntimeData) {
    const dh = Math.floor(metrics.totalDowntimeMin / 60);
    const dm = Math.round(metrics.totalDowntimeMin % 60);
    summaryData.push(['Total downtime recorded', `${dh}h ${dm}m`]);
  }
  summaryData.push(
    [],
    ['Best station',               metrics.bestStation?.name  || '—'],
    ['Best station avg dwell',     metrics.bestStation  ? `${metrics.bestStation.hours.toFixed(1)}h`  : '—'],
    ['Best station efficiency',    metrics.bestStation?.efficiency  != null ? `${metrics.bestStation.efficiency}%`  : '—'],
    ['Slowest station',            metrics.worstStation?.name || '—'],
    ['Slowest station avg dwell',  metrics.worstStation ? `${metrics.worstStation.hours.toFixed(1)}h` : '—'],
    ['Slowest station efficiency', metrics.worstStation?.efficiency != null ? `${metrics.worstStation.efficiency}%` : '—'],
    [],
    ['Best line',                  metrics.bestLine?.label  || '—'],
    ['Best line avg dwell/station',  metrics.bestLine  ? `${metrics.bestLine.hours.toFixed(1)}h`  : '—'],
    ['Slowest line',               metrics.worstLine?.label || '—'],
    ['Slowest line avg dwell/station', metrics.worstLine ? `${metrics.worstLine.hours.toFixed(1)}h` : '—'],
  );
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 36 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  // ── Sheet 2: Buses on Floor ───────────────────────────────────
  const byVin = {};
  for (const row of rows) { if (!byVin[row.vin]) byVin[row.vin] = []; byVin[row.vin].push(row); }
  const busRows = buses.map(bus => {
    const history  = (byVin[bus.vin] || []).filter(r => r.rawTimestamp).sort((a, b) => new Date(a.rawTimestamp) - new Date(b.rawTimestamp));
    const firstTs  = history[0]                  ? new Date(history[0].rawTimestamp).getTime()                  : null;
    const latestTs = history[history.length - 1] ? new Date(history[history.length - 1].rawTimestamp).getTime() : null;
    const now2     = Date.now();
    const totalMs  = firstTs  ? now2 - firstTs  : null;
    const curMs    = latestTs ? now2 - latestTs : null;
    const visited  = new Set(history.map(r => r.stationCode)).size;
    const lineId   = bus.station?.line;
    const lineTot  = lineId ? Object.values(STATIONS).filter(s => s.line === lineId).length : 0;
    return {
      VIN: bus.vin, Model: bus.model || '—',
      Line: LINES.find(l => l.id === lineId)?.label || lineId || '—',
      'Station Code': bus.stationCode, 'Station Name': bus.station?.name || bus.stationCode || '—',
      Status: getStatus(curMs), 'Time at Station': fmt(curMs), 'Total on Floor': fmt(totalMs),
      'First Entry': fmtDate(firstTs), 'Stations Visited': visited, 'Line Stations': lineTot,
      'Progress (%)': lineTot > 0 ? Math.min(Math.round((visited / lineTot) * 100), 100) : 0,
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(busRows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 42 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Buses on Floor');

  // ── Sheet 3: By Model ─────────────────────────────────────────
  const ws3 = XLSX.utils.json_to_sheet(
    Object.entries(metrics.byModel || {}).sort((a, b) => b[1] - a[1])
      .map(([model, count]) => ({ Model: model, Count: count, Family: isKDC(model) ? 'KDC' : isEVS(model) ? 'EVS' : 'Other' }))
  );
  ws3['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'By Model');

  // ── Sheet 4: By Line ──────────────────────────────────────────
  const ws4 = XLSX.utils.json_to_sheet(
    LINES.map(l => ({ Line: l.label, ID: l.id, Count: metrics.busesByLine?.[l.id] || 0 }))
      .sort((a, b) => b.Count - a.Count)
  );
  ws4['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'By Line');

  // ── Sheet 5: Station Efficiency ───────────────────────────────
  if ((metrics.stationEfficiency || []).length > 0) {
    const effRows = (metrics.stationEfficiency || []).map(s => ({
      'Station Code': s.code,
      'Station Name': s.name || s.code,
      Line: LINES.find(l => l.id === s.line)?.label || s.line || '—',
      'Avg Actual (h)': s.hours != null ? +s.hours.toFixed(2) : '—',
      'Planned (h)':    s.estimatedHours != null ? +s.estimatedHours.toFixed(2) : '—',
      'Efficiency (%)': s.efficiency != null ? s.efficiency : '—',
      'Variance (%)':   s.variancePct != null ? s.variancePct : '—',
      Rating: s.efficiency == null ? '—' : s.efficiency >= 95 ? 'On Plan' : s.efficiency >= 80 ? 'Slight Delay' : 'Bottleneck',
    }));
    const ws5 = XLSX.utils.json_to_sheet(effRows);
    ws5['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws5, 'Station Efficiency');
  }

  // ── Sheet 6: Downtime Analysis ────────────────────────────────
  if (metrics.hasDowntimeData && (metrics.downtimePareto || []).length > 0) {
    const dtRows = (metrics.downtimePareto || []).map(d => ({
      'Downtime Reason':  d.reason,
      'Total (min)':      Math.round(d.mins),
      'Total (h)':        +(d.mins / 60).toFixed(2),
      'Share (%)':        d.pct,
      'Cumulative (%)':   d.cumPct,
    }));
    const wsD = XLSX.utils.json_to_sheet(dtRows);
    wsD['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsD, 'Downtime Analysis');
  }

  // ── Sheet 7: Rework by Station ────────────────────────────────
  if (metrics.hasReworkData && (metrics.reworkByStationList || []).length > 0) {
    const rwRows = (metrics.reworkByStationList || []).map((r, i) => ({
      Rank:             i + 1,
      'Station Code':   r.code,
      'Station Name':   r.name,
      Line:             LINES.find(l => l.id === r.line)?.label || r.line || '—',
      'Rework Hours':   +r.hrs.toFixed(2),
    }));
    const wsR = XLSX.utils.json_to_sheet(rwRows);
    wsR['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 40 }, { wch: 28 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Rework by Station');
  }

  // ── Sheet 8: Full History ─────────────────────────────────────
  const histRows = rows.map(r => {
    const row = {
      VIN: r.vin, Model: r.model || '—',
      'Station Code': r.stationCode,
      'Station Name': STATIONS[r.stationCode]?.name || '—',
      Line: STATIONS[r.stationCode] ? LINES.find(l => l.id === STATIONS[r.stationCode].line)?.label || '—' : '—',
      Timestamp: r.rawTimestamp || '—',
      'Approval Status': r.approvalStatus || '—',
      'OHS Issue': r.ohsIssue || '—',
      'Overrun (min)': r.overrunMin ?? '—',
    };
    if (r.downtimeMin  !== undefined) row['Downtime (min)']  = r.downtimeMin  ?? '—';
    if (r.downtimeReason !== undefined) row['Downtime Reason'] = r.downtimeReason || '—';
    if (r.reworkFlag   !== undefined) row['Rework Flag']     = r.reworkFlag === true ? 'Yes' : r.reworkFlag === false ? 'No' : '—';
    if (r.reworkHrs    !== undefined) row['Rework Hours']    = r.reworkHrs   ?? '—';
    return row;
  });
  const ws8 = XLSX.utils.json_to_sheet(histRows);
  ws8['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 42 }, { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws8, 'Full History');

  return wb;
}
