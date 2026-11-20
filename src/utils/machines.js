// Machine Shop machines = the Machine Shop's Travel Card stations (catalog
// edits included), so a machine run is filed against the right station.
import { resolveTcCatalog, BUS_MODELS, codeOf } from './tcCatalog';
import { MACHINE_SHOP_LINE, machinesForMaterial, catalogLineMatches } from '../data/jobOrders';

// [{ code, label, station }] for one bus model, or every model when none given.
export function machineShopMachines(catalog, busModel) {
  const tc = resolveTcCatalog(catalog || {});
  const models = busModel ? [busModel] : BUS_MODELS;
  const seen = new Map();
  for (const m of models) {
    for (const s of tc.stationsFor(MACHINE_SHOP_LINE, m)) {
      const code = codeOf(s);
      if (!seen.has(code)) seen.set(code, { code, label: s.replace(/^[^:]+:\s*/, ''), station: s });
    }
  }
  return [...seen.values()];
}

// Stations that do a job-order line's work (Machine Shop machines, Paint Shop
// stations, Frame Parts Making and welding stations), every bus model's, as
// [{ code, label, station, line }]. Used for other-project and legacy runs.
export function lineStations(catalog, joLine) {
  if (joLine === MACHINE_SHOP_LINE) return machineShopMachines(catalog).map(m => ({ ...m, line: MACHINE_SHOP_LINE }));
  const tc = resolveTcCatalog(catalog || {});
  const seen = new Map();
  for (const m of BUS_MODELS) {
    for (const ln of tc.visibleLines(m)) {
      if (!catalogLineMatches(joLine, ln)) continue;
      for (const s of tc.stationsFor(ln, m)) {
        const code = codeOf(s);
        if (!seen.has(code)) seen.set(code, { code, label: s.replace(/^[^:]+:\s*/, ''), station: s, line: ln });
      }
    }
  }
  return [...seen.values()];
}

// Every machine for a specification: those ticked for its material first, then
// all the other Machine Shop machines (any machine may be chosen).
export function machineChoicesFor(material, materials, machines) {
  const preferred = machineOptionsFor(material, materials, machines);
  const set = new Set(preferred.map(m => m.code));
  return { preferred, others: machines.filter(m => !set.has(m.code)) };
}

// Machines that can cut a material, in Machine Shop order, as {code,label,station}.
export function machineOptionsFor(material, materials, machines) {
  const allowed = machinesForMaterial(material, materials).map(c => c.toUpperCase());
  return machines.filter(m => allowed.includes(m.code.toUpperCase()));
}
