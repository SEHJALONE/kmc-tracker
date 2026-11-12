// Departments and their lines/divisions, used by the Request Access form and by
// User Management. They live in the shared catalog (catalog.departments), so a
// system admin can add, rename or remove them in Catalog Admin → Departments;
// until one has been saved there, DEFAULT_DEPARTMENTS is used.
import { useEffect, useState } from 'react';
import { CATALOG_READ_URL } from './catalogConfig';
import { extractCatalog } from '../hooks/useCatalog';

export const DEFAULT_DEPARTMENTS = [
  {
    name: 'Production',
    units: [
      'Machine Shop', 'Frame Parts Making', 'Electrophoresis', 'Frame & Body Welding',
      'Chassis Line 01', 'Chassis Line 02', 'Paint Shop', 'Trim Line & Final Assembly',
      'Quality Inspection & Testing',
    ],
  },
  {
    name: 'Product Development',
    units: [
      'Vehicle Integration Division', 'Design and Engineering Division', 'EE and HV Division',
      'Battery and Energy Storage System', 'Information Systems Division', 'Charger Systems Network',
    ],
  },
  {
    name: 'Quality, Health, Safety and Environment',
    units: ['Quality', 'Health and Safety', 'Environment'],
  },
];

const clean = s => String(s || '').trim().replace(/\s+/g, ' ');

// A saved list, tidied: names trimmed, blanks and repeats dropped. Falls back
// to the defaults when nothing usable was saved.
export function normalizeDepartments(list) {
  if (!Array.isArray(list)) return DEFAULT_DEPARTMENTS;
  const seen = new Set();
  const out = [];
  for (const d of list) {
    const name = clean(d?.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const unitSeen = new Set();
    const units = (Array.isArray(d.units) ? d.units : []).map(clean)
      .filter(u => u && !unitSeen.has(u.toLowerCase()) && unitSeen.add(u.toLowerCase()));
    out.push({ name, units });
  }
  return out.length ? out : DEFAULT_DEPARTMENTS;
}

export const departmentsFrom = catalog => normalizeDepartments(catalog?.departments);

// The current list for pages that don't load the whole catalog (the sign-in
// screen's Request Access form, User Management). Starts with the defaults
// and switches to the saved list once it has loaded.
let cache = null;
export function useDepartments() {
  const [list, setList] = useState(cache || DEFAULT_DEPARTMENTS);
  useEffect(() => {
    let live = true;
    fetch(CATALOG_READ_URL + '&t=' + Date.now())
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(text => { cache = departmentsFrom(extractCatalog(text)); if (live) setList(cache); })
      .catch(() => { /* keep the defaults */ });
    return () => { live = false; };
  }, []);
  return list;
}
