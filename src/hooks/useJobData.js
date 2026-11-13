import { useCallback, useEffect, useState } from 'react';
import { sendViaAppsScript } from '../data/mailer';
import { DEFAULT_CUT_LISTS, DEFAULT_MATERIALS, makeItem } from '../data/jobOrders';

// Machine Shop job orders, cut lists and materials from the Apps Script
// (listJobData_). Cut lists and materials fall back to the built-in defaults
// until a supervisor saves their own. Shared across pages in this tab.

let cache = null;
const listeners = new Set();
const publish = v => { cache = v; listeners.forEach(f => f(v)); };

function shape(r) {
  const saved = r.cutLists || {};
  const cutLists = {};
  for (const [m, items] of Object.entries(DEFAULT_CUT_LISTS)) cutLists[m] = { items, builtIn: true };
  for (const [m, v] of Object.entries(saved)) cutLists[m] = { items: (v.items || []).map(makeItem), updatedBy: v.updatedBy, updatedAt: v.updatedAt };
  return {
    jobOrders: (r.jobOrders || []).map(j => ({ ...j, items: (j.items || []).map(makeItem) })),
    cutLists,
    materials: Array.isArray(r.settings?.materials) && r.settings.materials.length ? r.settings.materials : DEFAULT_MATERIALS,
    specMachines: r.settings?.specMachines || {},
    canManage: !!r.canManage,
  };
}

export function useJobData() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!cache);

  useEffect(() => { listeners.add(setData); return () => listeners.delete(setData); }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { publish(shape(await sendViaAppsScript('listJobData', {}))); setError(''); }
    catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const call = useCallback(async (action, payload) => {
    const r = await sendViaAppsScript(action, payload);
    await refresh();
    return r;
  }, [refresh]);

  const empty = shape({});
  return {
    ...(data || empty),
    loading, error, refresh,
    saveJobOrder: job => call('saveJobOrder', job),
    saveCutList: (busModel, items) => call('saveCutList', { busModel, items }),
    saveMaterials: materials => call('saveJoMaterials', { materials }),
    assignMachines: (id, specMachines) => call('assignJobMachines', { id, specMachines }),
  };
}

export const JOB_ERRORS = {
  'not-machine-shop-supervisor': 'Only Machine Shop supervisors (and admins) can change job orders, cut lists and materials.',
  'missing-vins': 'Choose at least one VIN.',
  'missing-items': 'The job order has no parts. Add parts or load the cut list.',
  'missing-project-or-model': 'Choose the project and the bus model.',
  'too-many-items': 'Too many parts for one job order. Split it into two.',
  'job-order-not-found': 'That job order no longer exists. Refresh and try again.',
};
