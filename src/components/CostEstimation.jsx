import { useState, useMemo } from 'react';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';
import { useMachineCostData, resolveRateAsOf } from '../hooks/useMachineCostData';

const fm = "'Inter', system-ui, sans-serif";
const today = () => new Date().toISOString().slice(0, 10);

function fmtUGX(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

// Grouped "LINE — station" options, e.g. AccessRequests.jsx's station picker.
function buildStationOptions() {
  const byLine = {};
  SEED_LINES.forEach(l => { byLine[l.id] = []; });
  Object.entries(SEED_STATIONS).forEach(([code, st]) => {
    if (!byLine[st.line]) byLine[st.line] = [];
    byLine[st.line].push({ code, ...st });
  });
  Object.values(byLine).forEach(arr => arr.sort((a, b) => (a.order || 0) - (b.order || 0)));
  return SEED_LINES.map(l => ({ line: l, stations: byLine[l.id] || [] })).filter(g => g.stations.length);
}

export default function CostEstimation({ theme = 'dark', onBack }) {
  const isDark = theme === 'dark';
  const bg     = isDark ? 'rgba(7,9,15,0.92)'     : 'rgba(255,255,255,0.97)';
  const card   = isDark ? 'rgba(13,21,38,0.90)'    : '#fff';
  const text   = isDark ? '#e2e8f0'                : '#1e293b';
  const muted  = isDark ? '#94a3b8'                : '#475569';
  const dim    = isDark ? '#64748b'                : '#94a3b8';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
  const inpBg  = isDark ? '#0d1526'                : '#f8fafc';
  const inpBor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  const R = '#dc2626', GR = '#10b981', AM = '#f59e0b', BL = '#3498db';
  const C = { bg, card, text, muted, dim, border, inpBg, inpBor, R, GR, AM, BL };

  const username = (typeof localStorage !== 'undefined' && localStorage.getItem('kmc_username')) || 'unknown';
  const [tab, setTab] = useState('machines');
  const data = useMachineCostData();

  const stationGroups = useMemo(buildStationOptions, []);

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>
      {/* Banner */}
      <div style={{
        width: '100%', maxWidth: 1100, height: 140, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('/Machine Shop.jpg')`,
        backgroundSize: 'cover', backgroundPosition: 'center 40%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.82) 0%, rgba(7,9,15,0.35) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: fm, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>Cost Estimation</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Machine registry · rate history · cost report — Cost Estimations Engineer</div>
          </div>
          {data.error && (
            <div style={{ marginLeft: 'auto', background: 'rgba(245,158,11,0.2)', color: AM, border: `1px solid ${AM}55`, borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
              ⚠ {data.error}
            </div>
          )}
          {!data.error && data.loading && (
            <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
              Syncing…
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, maxWidth: 1100, borderBottom: `1px solid ${border}` }}>
        {[['machines', 'Machines'], ['rates', 'Rates'], ['report', 'Report']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', background: 'none', border: 'none',
            borderBottom: tab === t ? `2px solid ${R}` : '2px solid transparent',
            color: tab === t ? text : dim, cursor: 'pointer',
            fontSize: 12, fontWeight: tab === t ? 700 : 400,
            fontFamily: fm, letterSpacing: '0.04em', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 1100 }}>
        {tab === 'machines' && <MachinesTab C={C} data={data} stationGroups={stationGroups} username={username} />}
        {tab === 'rates' && <RatesTab C={C} data={data} username={username} />}
        {tab === 'report' && <ReportTab C={C} data={data} />}
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────
function Panel({ C, title, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, marginBottom: 12 }}>{title}</div>}
      {children}
    </div>
  );
}
function inputStyle(C) {
  return { background: C.inpBg, border: `1px solid ${C.inpBor}`, color: C.text, borderRadius: 5, padding: '7px 9px', fontSize: 12, fontFamily: fm, outline: 'none' };
}
function btnStyle(C, color) {
  return { background: color, border: 'none', color: '#fff', borderRadius: 5, padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: fm };
}
function Table({ C, headers, children }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: C.dim, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ── Machines tab ─────────────────────────────────────────────────────────
function MachinesTab({ C, data, stationGroups, username }) {
  const [stationCode, setStationCode] = useState('');
  const [activity, setActivity] = useState('');
  const [machineName, setMachineName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // machine id being edited

  const stationMachines = useMemo(
    () => data.machines.filter(m => m.stationCode === stationCode && m.active),
    [data.machines, stationCode]
  );
  const activitySuggestions = useMemo(
    () => [...new Set(data.machines.filter(m => m.stationCode === stationCode).map(m => m.activity).filter(Boolean))],
    [data.machines, stationCode]
  );

  async function addMachine() {
    if (!stationCode) return alert('Select a station.');
    if (!machineName.trim()) return alert('Enter a machine name.');
    setBusy(true);
    try {
      await data.postMachine({ stationCode, activity: activity.trim(), machineName: machineName.trim(), createdBy: username });
      setMachineName('');
    } finally { setBusy(false); }
  }

  async function saveEdit(m, fields) {
    setBusy(true);
    try { await data.updateMachine({ id: m.id, ...fields }); }
    finally { setBusy(false); setEditing(null); }
  }

  async function archive(m) {
    if (!window.confirm(`Archive "${m.machineName}"? It stays in cost history, just hidden from new entry.`)) return;
    setBusy(true);
    try { await data.archiveMachine(m.id); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Panel C={C} title="Register a machine">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Station</div>
            <select value={stationCode} onChange={e => { setStationCode(e.target.value); setActivity(''); }} style={{ ...inputStyle(C), minWidth: 260 }}>
              <option value="">Select a station…</option>
              {stationGroups.map(g => (
                <optgroup key={g.line.id} label={g.line.label}>
                  {g.stations.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Activity / Process</div>
            <input list="activity-suggestions" value={activity} onChange={e => setActivity(e.target.value)} placeholder="e.g. Rectangular Tubes Cutting" style={{ ...inputStyle(C), width: 260 }} />
            <datalist id="activity-suggestions">
              {activitySuggestions.map(a => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Machine Name</div>
            <input value={machineName} onChange={e => setMachineName(e.target.value)} placeholder="e.g. Band Saw" style={{ ...inputStyle(C), width: 220 }} />
          </div>
          <button onClick={addMachine} disabled={busy} style={btnStyle(C, C.GR)}>+ Add Machine</button>
        </div>
      </Panel>

      <Panel C={C} title={stationCode ? `Machines at ${stationCode}` : 'Select a station above to see its machines'}>
        {!stationCode ? null : stationMachines.length === 0 ? (
          <div style={{ fontSize: 12, color: C.dim, fontStyle: 'italic' }}>No machines registered at this station yet.</div>
        ) : (
          <Table C={C} headers={['Activity', 'Machine', 'Current Rate (UGX/hr)', '']}>
            {stationMachines.map(m => {
              const rate = resolveRateAsOf(data.machineRates, today(), m.id);
              const isEditing = editing === m.id;
              return (
                <tr key={m.id}>
                  {isEditing ? (
                    <MachineEditRow C={C} m={m} onSave={fields => saveEdit(m, fields)} onCancel={() => setEditing(null)} />
                  ) : (
                    <>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{m.activity || '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{m.machineName}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{rate != null ? fmtUGX(rate) : <span style={{ color: C.AM }}>not set</span>}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setEditing(m.id)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, padding: '3px 9px', fontSize: 10, cursor: 'pointer', marginRight: 6 }}>Edit</button>
                        <button onClick={() => archive(m)} style={{ background: 'none', border: `1px solid ${C.R}55`, color: C.R, borderRadius: 4, padding: '3px 9px', fontSize: 10, cursor: 'pointer' }}>Archive</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}

function MachineEditRow({ C, m, onSave, onCancel }) {
  const [activity, setActivity] = useState(m.activity || '');
  const [machineName, setMachineName] = useState(m.machineName || '');
  return (
    <>
      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
        <input value={activity} onChange={e => setActivity(e.target.value)} style={{ ...inputStyle(C), width: '100%' }} />
      </td>
      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
        <input value={machineName} onChange={e => setMachineName(e.target.value)} style={{ ...inputStyle(C), width: '100%' }} />
      </td>
      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }} colSpan={1} />
      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button onClick={() => onSave({ activity, machineName })} style={{ background: C.GR, border: 'none', color: '#fff', borderRadius: 4, padding: '3px 9px', fontSize: 10, cursor: 'pointer', marginRight: 6 }}>Save</button>
        <button onClick={onCancel} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, padding: '3px 9px', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
      </td>
    </>
  );
}

// ── Rates tab ────────────────────────────────────────────────────────────
function RatesTab({ C, data, username }) {
  return (
    <>
      <MachineRateForm C={C} data={data} username={username} />
      <GlobalRateForm C={C} title="Staff Hourly Rate" unit="UGX/hour" history={data.staffRates} onSave={fields => data.postStaffRate({ ...fields, createdBy: username })} />
      <GlobalRateForm C={C} title="Energy Tariff Rate" unit="UGX/kWh" history={data.energyRates} onSave={fields => data.postEnergyRate({ ...fields, createdBy: username })} />
    </>
  );
}

function MachineRateForm({ C, data, username }) {
  const [machineId, setMachineId] = useState('');
  const [rate, setRate] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [validTo, setValidTo] = useState('');
  const [busy, setBusy] = useState(false);

  const machine = data.activeMachines.find(m => m.id === machineId);
  const history = useMemo(
    () => data.machineRates.filter(r => r.machineId === machineId).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1)),
    [data.machineRates, machineId]
  );

  async function save() {
    if (!machineId) return alert('Select a machine.');
    if (!rate || Number(rate) <= 0) return alert('Enter a rate greater than 0.');
    setBusy(true);
    try {
      await data.postMachineRate({ machineId, rate: Number(rate), validFrom, validTo: validTo || '', createdBy: username });
      setRate('');
    } finally { setBusy(false); }
  }

  return (
    <Panel C={C} title="Machine Hourly Rate">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Machine</div>
          <select value={machineId} onChange={e => setMachineId(e.target.value)} style={{ ...inputStyle(C), minWidth: 300 }}>
            <option value="">Select a machine…</option>
            {data.activeMachines.map(m => (
              <option key={m.id} value={m.id}>{m.stationCode} — {m.machineName}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Rate (UGX/hour)</div>
          <input type="number" min="0" value={rate} onChange={e => setRate(e.target.value)} style={{ ...inputStyle(C), width: 140 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Valid From</div>
          <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} style={{ ...inputStyle(C), width: 150 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Valid To <span style={{ color: C.dim }}>(blank = to date)</span></div>
          <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} style={{ ...inputStyle(C), width: 150 }} />
        </div>
        <button onClick={save} disabled={busy} style={btnStyle(C, C.GR)}>Save Rate</button>
      </div>
      {machine && (
        history.length === 0 ? (
          <div style={{ fontSize: 12, color: C.dim, fontStyle: 'italic' }}>No rate history for {machine.machineName} yet.</div>
        ) : (
          <Table C={C} headers={['Rate (UGX/hr)', 'Valid From', 'Valid To']}>
            {history.map(r => (
              <tr key={r.id}>
                <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{fmtUGX(r.rate)}</td>
                <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{r.validFrom}</td>
                <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{r.validTo || 'to date'}</td>
              </tr>
            ))}
          </Table>
        )
      )}
    </Panel>
  );
}

function GlobalRateForm({ C, title, unit, history, onSave }) {
  const [rate, setRate] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [validTo, setValidTo] = useState('');
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...history].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1)), [history]);

  async function save() {
    if (!rate || Number(rate) <= 0) return alert('Enter a rate greater than 0.');
    setBusy(true);
    try {
      await onSave({ rate: Number(rate), validFrom, validTo: validTo || '' });
      setRate('');
    } finally { setBusy(false); }
  }

  return (
    <Panel C={C} title={`${title} (${unit})`}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Rate ({unit})</div>
          <input type="number" min="0" value={rate} onChange={e => setRate(e.target.value)} style={{ ...inputStyle(C), width: 160 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Valid From</div>
          <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} style={{ ...inputStyle(C), width: 150 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>Valid To <span style={{ color: C.dim }}>(blank = to date)</span></div>
          <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} style={{ ...inputStyle(C), width: 150 }} />
        </div>
        <button onClick={save} disabled={busy} style={btnStyle(C, C.GR)}>Save Rate</button>
      </div>
      {sorted.length === 0 ? (
        <div style={{ fontSize: 12, color: C.dim, fontStyle: 'italic' }}>No {title.toLowerCase()} logged yet.</div>
      ) : (
        <Table C={C} headers={[`Rate (${unit})`, 'Valid From', 'Valid To']}>
          {sorted.map(r => (
            <tr key={r.id}>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{fmtUGX(r.rate)}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{r.validFrom}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{r.validTo || 'to date'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

// ── Report tab ───────────────────────────────────────────────────────────
function ReportTab({ C, data }) {
  const [hours, setHours] = useState(480);
  const asOf = today();
  const staffRate = resolveRateAsOf(data.staffRates, asOf);
  const energyRate = resolveRateAsOf(data.energyRates, asOf);

  const rows = useMemo(() => {
    return data.activeMachines
      .map(m => {
        const rate = resolveRateAsOf(data.machineRates, asOf, m.id);
        const cost = rate != null ? rate * hours : 0;
        return { ...m, rate, cost };
      })
      .sort((a, b) => b.cost - a.cost);
  }, [data.activeMachines, data.machineRates, hours, asOf]);

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <>
      <Panel C={C}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Hours in Period</div>
            <input type="number" min="0" value={hours} onChange={e => setHours(Number(e.target.value) || 0)} style={{ ...inputStyle(C), width: 100, marginTop: 4 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staff Hourly Rate</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{staffRate != null ? `${fmtUGX(staffRate)} UGX/hr` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Energy Tariff Rate</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{energyRate != null ? `${fmtUGX(energyRate)} UGX/kWh` : '—'}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Machine Cost (period)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.GR, marginTop: 4 }}>{fmtUGX(totalCost)} UGX</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 12, lineHeight: 1.5 }}>
          Cost = Machine Hourly Rate × Available Hours in Period (absorption costing). Every machine at
          a station is costed the same period hours regardless of which one actually ran — Travel Card
          only tracks station, not individual machine, so true per-machine utilization can't be measured
          yet. Set "Available Hours" to match the current Scoreboard period for consistency.
        </div>
      </Panel>

      <Panel C={C} title={`Machine Cost Ranking (${rows.length} active machines)`}>
        <Table C={C} headers={['#', 'Station', 'Activity', 'Machine', 'Rate (UGX/hr)', 'Hours', 'Cost Accumulated (UGX)']}>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, color: C.dim }}>{i + 1}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{r.stationCode}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{r.activity || '—'}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{r.machineName}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{r.rate != null ? fmtUGX(r.rate) : <span style={{ color: C.AM }}>not set</span>}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{hours}</td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: i === 0 ? C.R : C.text }}>{fmtUGX(r.cost)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
