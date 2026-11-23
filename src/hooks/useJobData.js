import { useCallback, useEffect, useState } from 'react';
import { sendViaAppsScript } from '../data/mailer';
import { DEFAULT_CUT_LISTS, DEFAULT_MATERIALS, makeItem, makeActivity } from '../data/jobOrders';

// Machine Shop job orders, cut lists and materials from the Apps Script
// (listJobData_). Cut lists and materials fall back to the built-in defaults
// until a supervisor saves their own. Shared across pages in this tab.

let cache = null;
const LOAD_TIMEOUT_MS = 45000;
const LOAD_TIMEOUT_MSG = 'The job orders took too long to load. Press Refresh to try again.';
const listeners = new Set();
const publish = v => { cache = v; listeners.forEach(f => f(v)); };

function shape(r) {
  const all = (r.jobOrders || []).map(j => ({
    ...j, items: (j.items || []).map(makeItem), activities: (j.activities || []).map(makeActivity),
    comments: Array.isArray(j.comments) ? j.comments : [], vins: Array.isArray(j.vins) ? j.vins : [],
  }));
  const saved = r.cutLists || {};
  const cutLists = {};
  for (const [m, items] of Object.entries(DEFAULT_CUT_LISTS)) cutLists[m] = { items, builtIn: true };
  for (const [m, v] of Object.entries(saved)) cutLists[m] = { items: (v.items || []).map(makeItem), updatedBy: v.updatedBy, updatedAt: v.updatedAt };
  return {
    // Deleted job orders are kept apart: only supervisors look at them.
    jobOrders: all.filter(j => j.status !== 'deleted'),
    deletedJobs: all.filter(j => j.status === 'deleted'),
    otherProjects: Array.isArray(r.otherProjects) ? r.otherProjects : [],
    // Machine runs on these job orders (tracker, edit lock). Empty before the script redeploy.
    runs: Array.isArray(r.runs) ? r.runs : [],
    cutLists,
    materials: Array.isArray(r.settings?.materials) && r.settings.materials.length ? r.settings.materials : DEFAULT_MATERIALS,
    specMachines: r.settings?.specMachines || {},
    canManage: !!r.canManage,
    // Lines this person may manage (server's word) and the lines they work on.
    manageLines: Array.isArray(r.manageLines) ? r.manageLines : (r.canManage ? ['Machine Shop'] : []),
    scope: Array.isArray(r.scope) ? r.scope : [],
  };
}

export function useJobData() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!cache);

  useEffect(() => { listeners.add(setData); return () => listeners.delete(setData); }, []);

  // A request the script never answers must not leave the page on "Loading..."
  // for good: give up after a while and say so (Refresh tries again).
  const refresh = useCallback(async () => {
    setLoading(true);
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(LOAD_TIMEOUT_MSG)), LOAD_TIMEOUT_MS); });
    try { publish(shape(await Promise.race([sendViaAppsScript('listJobData', {}), late]))); setError(''); }
    catch (e) { setError(e.message); }
    finally { clearTimeout(timer); }
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
    // loaded: the server has answered at least once. Lists show "Loading..."
    // only before that; a refresh in the background keeps showing what is known.
    loaded: !!data, loading, error, refresh,
    saveJobOrder: job => call('saveJobOrder', job),
    setJobStatus: (job, status) => call('saveJobOrder', { ...job, status, statusOnly: true }),
    saveCutList: (busModel, items) => call('saveCutList', { busModel, items }),
    saveMaterials: materials => call('saveJoMaterials', { materials }),
    assignMachines: (id, specMachines) => call('assignJobMachines', { id, specMachines }),
    deleteJobOrder: (id, reason) => call('deleteJobOrder', { id, reason }),
    commentJobOrder: (id, text) => call('commentJobOrder', { id, text }),
    saveOtherProjects: projects => call('saveOtherProjects', { projects }),
    // A past run, filed closed (legacy). Same shape as a Start/End task.
    saveLegacyRun: task => call('saveTravelTask', { ...task, status: 'closed', source: 'legacy' }),
  };
}

export const JOB_ERRORS = {
  'not-machine-shop-supervisor': 'Only Machine Shop supervisors (and admins) can change job orders, cut lists and materials.',
  'missing-vins': 'Choose at least one VIN.',
  'missing-items': 'The job order has no parts. Add parts or load the cut list.',
  'missing-project-or-model': 'Choose the project and the bus model.',
  'too-many-items': 'Too many parts for one job order. Split it into two.',
  'job-order-started': 'A machine has already run on this job order, so it can no longer be edited. Close it and set up a new one instead.',
  'not-line-supervisor': 'Only supervisors of this line (and admins) can do that.',
  'unknown-other-project': 'That project ID is not in the register. Add it under Other Projects, Projects first.',
  'missing-activities': 'Add at least one activity.',
  'missing-reason': 'Give a reason for deleting the job order.',
  'missing-comment': 'Write the comment first.',
  'job-order-deleted': 'That job order was deleted.',
  'bad-line': 'Choose the line: Machine Shop, Paint Shop or Parts Making.',
  'bad-period': 'Choose a period whose start is before its end.',
  'job-order-not-found': 'That job order no longer exists. Refresh and try again.',
};

export { firstLoad } from '../data/jobOrders';
