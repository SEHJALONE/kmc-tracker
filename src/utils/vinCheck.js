// Keeps a card's bus project, bus model and VIN consistent with the VIN
// register (catalog.projectVins, filled in from Type Approvals).
//
// Why: the model was picked from a fixed list and the VIN could be typed or
// taken from VINs remembered in the browser, so nothing tied the two together.
// On 2026-11-23 a run of 100 Bus Project cards (10.5m EVS buses) was filed as
// "12m EVS", some with a mistyped VIN. Every place that starts a task, files or
// corrects a card, or raises a job order now checks here first.
import { cleanVin } from './vinUpload';

// VIN -> { project, model } for every registered bus.
export function vinIndex(projectVins) {
  const out = new Map();
  for (const [project, list] of Object.entries(projectVins || {})) {
    for (const v of Array.isArray(list) ? list : []) {
      const vin = cleanVin(v?.vin);
      if (vin) out.set(vin, { project, model: String(v?.model || '').trim() });
    }
  }
  return out;
}

// The bus models a project's register lists. Empty when the project has no
// register (or its VINs carry no model): then every model is allowed.
export function registeredModels(projectVins, project) {
  const list = (projectVins || {})[project];
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(v => String(v?.model || '').trim()).filter(Boolean))];
}

// A card's VIN field may hold several VINs ("A, B") for a job covering two buses.
export const splitVins = vin => String(vin || '').split(/[,;\s]+/).map(cleanVin).filter(Boolean);

// null when project + model + VIN(s) agree with the register, else a message
// saying what is wrong and what the register says.
export function vinProblem(projectVins, { project, busModel, vin }) {
  const index = vinIndex(projectVins);
  const projectList = (projectVins || {})[project];
  const projectHasRegister = Array.isArray(projectList) && projectList.length > 0;
  const models = registeredModels(projectVins, project);
  if (project && busModel && models.length && !models.includes(busModel)) {
    return `${project} has no ${busModel} buses. Its buses are ${models.join(', ')}. Pick the right bus model.`;
  }
  for (const v of splitVins(vin)) {
    const reg = index.get(v);
    if (reg) {
      if (project && reg.project !== project) return `VIN ${v} belongs to ${reg.project}${reg.model ? ` (${reg.model})` : ''}, not ${project}.`;
      if (busModel && reg.model && reg.model !== busModel) return `VIN ${v} is a ${reg.model} in the VIN register, not a ${busModel}. Pick ${reg.model} as the bus model.`;
    } else if (projectHasRegister) {
      return `VIN ${v} is not in the ${project} VIN register. Check it for a typing mistake, or ask the VIN Register team to add it.`;
    }
  }
  return null;
}

// Remembered (browser) VINs worth offering: drop any the register files under
// another project or model, and unregistered ones on a project that has a register.
export function keepLocalVin(projectVins, project, busModel) {
  const index = vinIndex(projectVins);
  const hasRegister = Array.isArray((projectVins || {})[project]) && projectVins[project].length > 0;
  return v => {
    const reg = index.get(cleanVin(v));
    if (!reg) return !hasRegister;
    return reg.project === project && (!busModel || !reg.model || reg.model === busModel);
  };
}
