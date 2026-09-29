// Bus Tracker filter predicates, shared by the bus list and the Dashboard rows.

// Status filter (Approved / Pending / OHS / Downtime / Rework) on a tracker row.
export function matchesStatus(r, status) {
  if (status === 'APPROVED') return !!r.approvalStatus?.toLowerCase().includes('approved');
  if (status === 'PENDING')  return !r.approvalStatus || r.approvalStatus.toLowerCase().includes('pending');
  if (status === 'OHS')      return !!r.ohsIssue;
  if (status === 'OVERRUN')  return (r.overrunMin || 0) > 0;
  if (status === 'REWORK')   return r.reworkFlag === true;
  return true;
}

// Project filter: the card names the project, OR the VIN is on the project's
// registered fleet ({ vin, model }[] from the catalog).
export function matchesProject(r, project, fleet = [], normVin = (v) => v) {
  if (!project) return true;
  if (r.project === project) return true;
  const key = String(normVin(r.vin)).toUpperCase();
  return fleet.some(v => String(normVin(v.vin)).toUpperCase() === key);
}
