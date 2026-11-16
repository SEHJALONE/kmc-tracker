// A Start/End task copies its station's activity list when Start is pressed.
// When an admin later edits that list in Edit Catalog, open tasks follow it:
// the catalog's activities in the catalog's order, each keeping its tick, plus
// anything the operator already ticked or added by hand (that work happened, so
// it is never dropped). Machine Shop job-order tasks list cut-list parts, not
// catalog activities, and are left alone.
//
// Returns the new activities array, or null when nothing changes.
export function syncTaskActivities(task, catalogActs) {
  if (!task || task.status !== 'open' || task.jobOrderId) return null;
  const old = Array.isArray(task.activities) ? task.activities : [];
  const list = Array.isArray(catalogActs) ? catalogActs : [];
  const byName = new Map(old.map(a => [a.name, a]));
  const inCatalog = new Set(list);

  // An activity the operator added by hand that the catalog now lists is a
  // catalog activity from here on, so it loses its "added" mark.
  const next = list.map(name => {
    const prev = byName.get(name);
    if (!prev) return { name, doneAt: '' };
    const { added: _added, ...rest } = prev; // eslint-disable-line no-unused-vars
    return rest;
  });
  for (const a of old) {
    if (!inCatalog.has(a.name) && (a.doneAt || a.added)) next.push(a);
  }

  const same = next.length === old.length && next.every((a, i) =>
    a.name === old[i].name && (a.doneAt || '') === (old[i].doneAt || '') && !!a.added === !!old[i].added);
  return same ? null : next;
}
