import { useEffect, useState } from 'react';
import { fetchSubmissions } from './useSubmissionsData';
import { modelFamilyOf } from '../data/stations';

// Presets for a Travel Card come from what has already been filed at that
// station: the most recent card's consumables and quantities, operators and
// designed time. A device's own remembered values still win; presets only fill
// in what is empty. Cards for the same model family are preferred, so a KEC
// card is preset from a KEC card when one exists.

const key = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');

// [{ stationCode, busModel, timestamp, … }] -> { [code]: { KEC?, EVS?, KDC?, any } }
export function buildPresets(submissions) {
  const out = {};
  const ts = s => new Date(s.timestamp || 0).getTime() || 0;
  for (const s of submissions || []) {
    const code = key(s.stationCode);
    if (!code) continue;
    const fam = modelFamilyOf(s.busModel) || 'any';
    const slot = (out[code] ||= {});
    for (const f of [fam, 'any']) {
      if (!slot[f] || ts(s) >= ts(slot[f])) slot[f] = s;
    }
  }
  return out;
}

export function presetFor(presets, code, model) {
  const slot = presets?.[key(code)];
  if (!slot) return null;
  const s = slot[modelFamilyOf(model)] || slot.any;
  if (!s) return null;
  const qtys = {};
  for (const [name, qty] of Object.entries(s.resourcesUsed || {})) if (Number(qty) > 0) qtys[name] = String(qty);
  return {
    qtys,
    other: (s.otherResources || []).filter(r => r && r.name).map(r => ({ name: r.name, qty: r.qty || '' })),
    operators: [...new Set((s.operators || []).filter(Boolean))],
    designedTime: Number(s.designedTime) || 0,
  };
}

let cache = null;
export function useStationPresets() {
  const [presets, setPresets] = useState(cache);
  useEffect(() => {
    let live = true;
    if (cache) return undefined;
    fetchSubmissions()
      .then(subs => { cache = buildPresets(subs); if (live) setPresets(cache); })
      .catch(() => { /* presets are a convenience; the card works without them */ });
    return () => { live = false; };
  }, []);
  return presets;
}
