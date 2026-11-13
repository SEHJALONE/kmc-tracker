// Machine Shop machines = the Machine Shop's Travel Card stations (catalog
// edits included), so a machine run is filed against the right station.
import { resolveTcCatalog, BUS_MODELS, codeOf } from './tcCatalog';
import { MACHINE_SHOP_LINE, machinesForMaterial } from '../data/jobOrders';

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

// Machines that can cut a material, in Machine Shop order, as {code,label,station}.
export function machineOptionsFor(material, materials, machines) {
  const allowed = machinesForMaterial(material, materials).map(c => c.toUpperCase());
  return machines.filter(m => allowed.includes(m.code.toUpperCase()));
}
