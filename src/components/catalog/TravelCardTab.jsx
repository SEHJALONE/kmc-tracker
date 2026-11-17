import { useEffect, useMemo, useState } from 'react';
import { resolveTcCatalog, BUS_MODELS, modelKindOf, codeOf, activityModelTag } from '../../utils/tcCatalog';
import { stationLabelForModel } from '../../data/travelCardSeed';
import { fetchStationTimes } from '../../hooks/useStationTimes';
import { canonicalStationCode } from '../../data/stations';
import { syncStationToTravelCard } from '../../utils/catalogGaps';
import { PAINT_LINE, PAINT_TC_LINE, applyPaintProcess } from '../../data/paintShopProcess';
import { eeProcessOutdated, applyEeProcess } from '../../data/eeTrimProcess';
import { chassisProcessOutdated, applyChassisProcess } from '../../data/chassisProcess';
import { trimProcessOutdated, applyTrimProcess } from '../../data/trimProcess';

// Catalog Admin → Travel Card. Laid out the way the card itself is filled:
// pick the bus model, the production line and the station exactly as an
// operator would, then edit what that card shows — the station list on the
// line, which models see it, its Activities and its Consumables & Materials.
// It reads through the same resolver as the card (src/utils/tcCatalog.js), so
// what is listed here is what the card will show for that model.

const KINDS = ['EVS', 'KDC', 'KEC'];
const box = { border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginBottom: 12 };
const hd = { fontSize: 13, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px', fontWeight: 700 };
const note = { fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 };

function ModelChecks({ value, onChange, label }) {
  // No entry (or all three ticked) = applies to every model.
  const on = Array.isArray(value) && value.length ? value : KINDS;
  const toggle = k => {
    const next = on.includes(k) ? on.filter(x => x !== k) : [...on, k];
    if (!next.length) return;   // at least one model
    onChange(next.length === KINDS.length ? null : KINDS.filter(x => next.includes(x)));
  };
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {KINDS.map(k => (
        <label key={k} style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={on.includes(k)} onChange={() => toggle(k)} /> {k}
        </label>
      ))}
    </div>
  );
}

export default function TravelCardTab({ draft, touch, inp, btn, ListEditor }) {
  const base = { tcLines: draft.tcLines, acts: draft.acts, res: draft.res, lineModels: draft.lineModels, stationModels: draft.stationModels };
  const tc = useMemo(() => resolveTcCatalog({}, base), [draft.tcLines, draft.acts, draft.res, draft.lineModels, draft.stationModels]);
  const [busModel, setBusModel] = useState('12m KDC');
  const [line, setLine] = useState('');
  const [code, setCode] = useState('');
  const [newLine, setNewLine] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [times, setTimes] = useState(null);
  useEffect(() => { fetchStationTimes().then(setTimes).catch(() => setTimes(null)); }, []);

  const kind = modelKindOf(busModel);
  const lines = tc.visibleLines(busModel);
  const hiddenLines = Object.keys(draft.tcLines).filter(l => !lines.includes(l));
  const lineStations = line ? (draft.tcLines[line] || []) : [];
  const shownStations = line ? tc.stationsFor(line, busModel) : [];
  const station = lineStations.find(s => codeOf(s) === code) || '';
  const name = station ? station.replace(/^[^:]+:\s*/, '') : '';
  const actsKey = code ? tc.actsKey(code, busModel) : '';
  const ownList = actsKey && actsKey !== code;
  const actsList = (actsKey && draft.acts[actsKey]) || [];
  const shown = tc.actsFor(code, busModel);
  const resList = tc.resFor(line, code);
  const designed = times && code ? (times.getMinutes(`${kind}:${code}`) ?? times.getMinutes(code)) : null;

  // ── edits ──
  const setStations = next => touch(d => { d.tcLines[line] = next; return d; });
  const moveStation = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= lineStations.length) return;
    const next = [...lineStations]; [next[i], next[j]] = [next[j], next[i]]; setStations(next);
  };
  const renameStation = v => setStations(lineStations.map(s => (codeOf(s) === code ? `${code}: ${v}` : s)));
  const removeStation = c => {
    if (!confirm(`Remove ${c} from "${line}"?\n\nIts activities and consumables are kept (other lines may use the same code).`)) return;
    setStations(lineStations.filter(s => codeOf(s) !== c));
    if (c === code) setCode('');
  };
  const addStation = () => {
    const c = newCode.trim().toUpperCase().replace(/\s+/g, '-');
    if (!c || !line) return;
    if (lineStations.some(s => codeOf(s) === c)) { setCode(c); return; }
    touch(d => { d.tcLines[line] = [...(d.tcLines[line] || []), `${c}: ${newName.trim() || c}`]; return d; });
    setCode(c); setNewCode(''); setNewName('');
  };
  const addLine = () => {
    const l = newLine.trim();
    if (!l) return;
    touch(d => { if (!d.tcLines[l]) d.tcLines[l] = []; if (!d.res[l]) d.res[l] = {}; return d; });
    setLine(l); setCode(''); setNewLine('');
  };
  // "All models" is stored as an explicit list. Deleting the entry instead let
  // the built-in restriction (e.g. "EVS only") come back on the next load.
  const setLineModels = v => touch(d => { d.lineModels[line] = v || [...KINDS]; return d; });
  // The station's ticks here and its models on the Bus Tracker are kept the same,
  // and a model it gains gets the station on its own line (utils/catalogGaps.js).
  const setStationModels = v => touch(d => {
    const fams = v || [...KINDS];
    d.stationModels[code] = fams;
    const key = Object.keys(d.stations || {}).find(k => canonicalStationCode(k) === canonicalStationCode(code));
    if (key) { d.stations[key].models = [...fams]; syncStationToTravelCard(d, key); }
    return d;
  });
  const setActs = next => touch(d => { d.acts[actsKey] = next; return d; });
  const splitActs = () => touch(d => { d.acts[`${kind}:${code}`] = [...(d.acts[code] || [])]; return d; });
  const mergeActs = () => {
    if (!confirm(`Delete the ${kind}-only activity list for ${code}? ${kind} buses will then show the shared list.`)) return;
    touch(d => { delete d.acts[`${kind}:${code}`]; return d; });
  };
  // The live catalog can still hold the old Paint Shop list (the Nov 2026
  // process was only half applied). One button puts the whole process in.
  const paintOutdated = JSON.stringify(draft.tcLines[PAINT_LINE] || []) !== JSON.stringify(PAINT_TC_LINE);
  const usePaintProcess = () => touch(d => {
    const t = applyPaintProcess({ tcLines: d.tcLines, acts: d.acts, res: d.res, stationModels: d.stationModels, stations: d.stations });
    return { ...d, tcLines: t.tcLines, acts: t.acts, res: t.res, stationModels: t.stationModels, stations: t.stations };
  });
  // EVS / KDC EE stations from the 2026 EE Trim Line travel card tools.
  const eeOutdated = eeProcessOutdated({ tcLines: draft.tcLines, acts: draft.acts });
  const useEeProcess = () => touch(d => {
    const t = applyEeProcess({ tcLines: d.tcLines, acts: d.acts, stations: d.stations });
    return { ...d, tcLines: t.tcLines, acts: t.acts, stations: t.stations };
  });
  // Chassis Lines 01 and 02 from "CHASSIS LINE STATIONS" (Nov 2026).
  const chassisOutdated = chassisProcessOutdated({ tcLines: draft.tcLines, acts: draft.acts });
  const useChassisProcess = () => touch(d => {
    const t = applyChassisProcess({ tcLines: d.tcLines, acts: d.acts, res: d.res, stations: d.stations });
    return { ...d, tcLines: t.tcLines, acts: t.acts, res: t.res, stations: t.stations };
  });
  // KDC main trim stations from the Trim Travel Card (FM004 Rev #01).
  const trimOutdated = trimProcessOutdated({ tcLines: draft.tcLines, acts: draft.acts });
  const useTrimProcess = () => touch(d => {
    const t = applyTrimProcess({ tcLines: d.tcLines, acts: d.acts });
    return { ...d, tcLines: t.tcLines, acts: t.acts };
  });
  const setRes = next => touch(d => { if (!d.res[line]) d.res[line] = {}; d.res[line][code] = next; return d; });

  return (
    <div>
      <div style={{ ...hd, marginBottom: 6 }}>Travel card - choose the bus and station the way the card does, then edit what it shows</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 14 }}>
        <label style={note}>Bus model
          <select style={inp} value={busModel} onChange={e => { setBusModel(e.target.value); setCode(''); }}>
            {BUS_MODELS.map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label style={note}>Production line
          <select style={inp} value={line} onChange={e => { setLine(e.target.value); setCode(''); }}>
            <option value="">Select line…</option>
            {lines.map(l => <option key={l}>{l}</option>)}
            {hiddenLines.length > 0 && <optgroup label={`Not shown for ${kind}`}>{hiddenLines.map(l => <option key={l}>{l}</option>)}</optgroup>}
          </select>
        </label>
        <label style={note}>Station
          <select style={inp} value={code} disabled={!line} onChange={e => setCode(e.target.value)}>
            <option value="">Select station…</option>
            {lineStations.map(s => (
              <option key={s} value={codeOf(s)}>{stationLabelForModel(s, kind)}{shownStations.includes(s) ? '' : ` (not shown for ${kind})`}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input style={{ ...inp, width: 220 }} value={newLine} onChange={e => setNewLine(e.target.value)} placeholder="New line, e.g. Trim Line 03 — EVS" />
        <button style={btn} onClick={addLine}>+ Add line</button>
      </div>

      {line && !code && (
        <div style={box}>
          <div style={hd}>Line · {line}</div>
          <ModelChecks label="Whole line shown for" value={draft.lineModels[line]} onChange={setLineModels} />
          <div style={{ ...note, marginTop: 6 }}>
            These ticks are for the <strong>whole line</strong>: unticking a model removes this line from every Travel Card for that model.
            To change one station, click its code below and use the ticks there.
          </div>
          <div style={{ ...note, margin: '10px 0 8px' }}>Stations in the order the card lists them. Click a code to edit its activities and consumables.</div>
          {lineStations.map((s, i) => {
            const c = codeOf(s);
            const m = draft.stationModels[c];
            return (
              <div key={s} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                <button style={{ ...btn, fontFamily: 'inherit', minWidth: 92, textAlign: 'left' }} onClick={() => setCode(c)}>{c}</button>
                <span style={{ flex: 1, fontSize: 13, color: shownStations.includes(s) ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                  {s.replace(/^[^:]+:\s*/, '')}{m && m.length < 3 && <em style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 6 }}>{m.join(' + ')} only</em>}
                </span>
                <button style={btn} title="Move up" onClick={() => moveStation(i, -1)}>↑</button>
                <button style={btn} title="Move down" onClick={() => moveStation(i, 1)}>↓</button>
                <button style={btn} title="Remove from this line" onClick={() => removeStation(c)}>×</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <input style={{ ...inp, width: 120, fontFamily: 'inherit' }} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code e.g. T03-07" />
            <input style={{ ...inp, flex: 1, minWidth: 160 }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Station name" onKeyDown={e => e.key === 'Enter' && addStation()} />
            <button style={btn} onClick={addStation}>+ Add station</button>
          </div>
        </div>
      )}

      {line && code && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <button style={btn} onClick={() => setCode('')}>← All stations on {line}</button>
            <span style={note}>
              For a <strong>{busModel}</strong> the card shows <strong>{shown.length}</strong> activit{shown.length === 1 ? 'y' : 'ies'} and <strong>{resList.length}</strong> preset consumable{resList.length === 1 ? '' : 's'} here.
            </span>
          </div>

          <div style={box}>
            <div style={hd}>Station</div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, marginBottom: 10 }}>
              <label style={note}>Code<input style={{ ...inp, fontFamily: 'inherit' }} value={code} disabled /></label>
              <label style={note}>Name on the card<input style={inp} value={name} onChange={e => renameStation(e.target.value)} /></label>
            </div>
            <ModelChecks label="This station shown for" value={draft.stationModels[code]} onChange={setStationModels} />
            <div style={{ ...note, marginTop: 10 }}>
              Designed time on the card: <strong>{designed ? `${designed} min` : 'not set'}</strong> - read from the Station Times sheet{designed ? '' : ' (operators are asked to type it)'}; change it there.
            </div>
          </div>

          <div style={box}>
            <div style={{ ...hd, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span>Activities - {code}</span>
              <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                {ownList ? `${kind}-only list` : `Shared list${KINDS.some(k => draft.acts[`${k}:${code}`]) ? ` (other models have their own)` : ' (all models)'}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {!ownList && <button style={btn} onClick={splitActs}>Give {kind} its own list</button>}
              {ownList && <button style={btn} onClick={mergeActs}>Use the shared list for {kind}</button>}
            </div>
            <ListEditor items={actsList} onChange={setActs} placeholder="Activity description" movable
              hint={a => { const t = activityModelTag(a); return t && t !== busModel ? `only shown for ${t}` : ''; }} />
            <div style={{ ...note, marginTop: 6 }}>End an activity with a model in brackets, e.g. “… (7m EVS)”, to show it for that model only.</div>
          </div>

          <div style={box}>
            <div style={hd}>Consumables &amp; Materials Used - {code}</div>
            <ListEditor items={resList} onChange={setRes} placeholder="Consumable or material name" movable />
            <div style={{ ...note, marginTop: 6 }}>Preset rows the operator enters quantities for. Items operators add themselves on the card are shared per station and are not edited here.</div>
          </div>
        </>
      )}
      {!line && <div style={note}>Pick a production line to see its stations.</div>}
      {trimOutdated && (
        <div style={{ ...box, borderColor: 'rgba(255,154,10,0.45)', background: 'rgba(255,154,10,0.08)' }}>
          <div style={hd}>KDC trim process</div>
          <div style={{ ...note, marginBottom: 10 }}>
            The KDC Trim Line main stations here are not the Trim Travel Card (KMC.DPD.04/26-FM004, Rev #01).
            Using it replaces the names and activities of T01-01 to T01-11 for KDC. EE stations, sub-assembly
            stations, consumables, EVS and KEC stay as they are. Nothing is saved until you press Save all.
          </div>
          <button style={btn} onClick={useTrimProcess}>Use the KDC Trim Travel Card</button>
        </div>
      )}
      {chassisOutdated && (
        <div style={{ ...box, borderColor: 'rgba(255,154,10,0.45)', background: 'rgba(255,154,10,0.08)' }}>
          <div style={hd}>Chassis lines process</div>
          <div style={{ ...note, marginBottom: 10 }}>
            The Chassis Line 01 and 02 lists here are not the Nov 2026 process (CHASSIS LINE STATIONS).
            Using it replaces the EVS, KDC and KEC chassis stations, activities and consumables (KEC follows EVS),
            moves the quality gates to the end of their lines (CQ-02 goes to Chassis Line 02) and archives
            stations no model uses any more. Some codes then mean different work (for example EVS C02-04 becomes
            Steering and Pneumatic), so do it between shifts. Nothing is saved until you press Save all.
          </div>
          <button style={btn} onClick={useChassisProcess}>Use the Nov 2026 chassis process</button>
        </div>
      )}
      {eeOutdated && (
        <div style={{ ...box, borderColor: 'rgba(255,154,10,0.45)', background: 'rgba(255,154,10,0.08)' }}>
          <div style={hd}>EE stations process</div>
          <div style={{ ...note, marginBottom: 10 }}>
            The EVS or KDC EE stations here are not the 2026 process (EVS and KDC EE Trim Line Production Travel Card Tool 2026).
            Using it replaces their station names and activities, and adds T01-01 EE and T01-09 EE for EVS.
            Consumables and KEC stay as they are. Nothing is saved until you press Save all.
          </div>
          <button style={btn} onClick={useEeProcess}>Use the 2026 EE process</button>
        </div>
      )}
      {paintOutdated && (
        <div style={{ ...box, borderColor: 'rgba(255,154,10,0.45)', background: 'rgba(255,154,10,0.08)' }}>
          <div style={hd}>Paint Shop process</div>
          <div style={{ ...note, marginBottom: 10 }}>
            The Paint Shop list here is not the Nov 2026 process (KVP 12 KDC Paint Shop Production Travel Tool Form).
            Using it gives every model the same {PAINT_TC_LINE.length} paint stations with their activities and consumables,
            and archives P02-05 and P03-03. Some codes then mean different work (for example P07-02 becomes Branding),
            so do it between shifts. Nothing is saved until you press Save all.
          </div>
          <button style={btn} onClick={usePaintProcess}>Use the Nov 2026 Paint Shop process</button>
        </div>
      )}
    </div>
  );
}
