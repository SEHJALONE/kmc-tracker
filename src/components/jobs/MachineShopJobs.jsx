import { useEffect, useMemo, useState } from 'react';
import { groupBySpec, partLabel } from '../../data/jobOrders';
import { machineShopMachines, machineOptionsFor } from '../../utils/machines';
import { JOB_ERRORS, useJobData } from '../../hooks/useJobData';
import CutListEditor from './CutListEditor';
import JobOrderSetup from './JobOrderSetup';

// Start/End when the line is Machine Shop. Machine Shop work runs from job
// orders, not from a station pick:
//   ask     a Machine Shop supervisor is asked whether to set up a job order
//   setup   …and if yes, sets one up here (JobOrderSetup)
//   list    the open job orders for this project and bus model
//   review  choose a machine for each material specification (only machines
//           that cut that material); the choice is saved and remembered
//   start   choose which machine starts, see its parts, press START. Each
//           machine is its own running task (parts = activities), so several
//           machines can run on one job order at once.

const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' };

// Machine chosen for a specification: this job order's choice, else the last
// one used for this bus model.
export function machineForSpec(job, spec, defaults) {
  return (job.specMachines || {})[spec] || (defaults || {})[`${job.busModel}|${spec}`] || '';
}

// Parts (to cut) per machine code, from the specification → machine choices.
export function partsByMachine(job, defaults) {
  const out = {};
  for (const it of job.items || []) {
    if (!it.cut) continue;
    const m = machineForSpec(job, it.spec, defaults);
    if (!m) continue;
    (out[m] ||= []).push(it);
  }
  return out;
}

export default function MachineShopJobs({ catalog, jobData, project, busModel, openTasks = [], lockedCodes = [], onStart }) {
  const [step, setStep] = useState(jobData.canManage ? 'ask' : 'list');
  const [jobId, setJobId] = useState('');
  const [choice, setChoice] = useState({});           // spec → machine code (unsaved edits)
  const [machine, setMachine] = useState('');
  const [designed, setDesigned] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The job data may arrive after this mounts: ask a supervisor once it does.
  const [asked, setAsked] = useState(jobData.canManage);
  useEffect(() => {
    if (jobData.canManage && !asked) { setAsked(true); if (step === 'list' && !jobId) setStep('ask'); }
  }, [jobData.canManage, asked, step, jobId]);

  const machines = useMemo(() => machineShopMachines(catalog, busModel), [catalog, busModel]);
  const jobs = jobData.jobOrders.filter(j => j.status === 'open' && j.project === project && j.busModel === busModel);
  const job = jobData.jobOrders.find(j => j.id === jobId) || null;
  const running = openTasks.filter(t => t.jobOrderId);

  if (step === 'ask') return (
    <div className="kmc-panel" style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>Set up a job order?</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Machine Shop work runs from job orders. Set up a new one for <strong>{project}</strong> · <strong>{busModel}</strong> from its cut list, or see the job orders already open.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="kmc-btn primary" onClick={() => setStep('setup')}>Yes — set up a job order</button>
        <button className="kmc-btn" onClick={() => setStep('list')}>No — show job orders ({jobs.length})</button>
      </div>
    </div>
  );

  if (step === 'setup') return (
    <JobOrderSetup catalog={catalog} jobData={jobData} project={project} busModel={busModel}
      onCancel={() => setStep('list')}
      onSaved={id => { setJobId(id); setChoice({}); setStep('review'); }} />
  );

  if (step === 'list' || !job) return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="kmc-label">Open job orders · {project} · {busModel}</div>
        <span style={{ flex: 1 }} />
        <button className="kmc-btn ghost" onClick={jobData.refresh}>↻ Refresh</button>
        {jobData.canManage && <button className="kmc-btn" onClick={() => setStep('setup')}>+ New job order</button>}
      </div>
      {jobData.loading && !jobs.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading job orders…</div>}
      {jobData.error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>⚠ {jobData.error}</div>}
      {!jobData.loading && !jobs.length && (
        <div className="kmc-panel" style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
          No open job order for {busModel} on {project}. Ask the Machine Shop supervisor to set one up.
        </div>
      )}
      {jobs.map(j => {
        const parts = j.items.filter(it => it.cut);
        const runs = running.filter(t => t.jobOrderId === j.id);
        return (
          <button key={j.id} className="kmc-panel" onClick={() => { setJobId(j.id); setChoice({}); setMachine(''); setStep('review'); }}
            style={{ textAlign: 'left', padding: '12px 16px', cursor: 'pointer', border: '1px solid var(--border-subtle)', color: 'inherit', font: 'inherit' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: 'monospace', color: 'var(--accent-text)' }}>{j.id}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{parts.length} parts · {groupBySpec(parts).length} specifications · by {j.createdByName || j.createdBy}</span>
              {runs.length > 0 && <span className="kmc-chip"><span>running</span><b style={{ background: 'var(--g-lime)' }}>{runs.length}</b></span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>{j.vins.join(' · ')}</div>
            {j.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{j.notes}</div>}
          </button>
        );
      })}
    </div>
  );

  // ── review + start ──
  const defaults = jobData.specMachines;
  const merged = { ...job, specMachines: { ...(job.specMachines || {}), ...choice } };
  const cutItems = job.items.filter(it => it.cut);
  const groups = groupBySpec(cutItems);
  const unassigned = groups.filter(g => !machineForSpec(merged, g.spec, defaults));
  const byMachine = partsByMachine(merged, defaults);
  const lockedMachine = lockedCodes.length ? new Set(lockedCodes.map(c => c.toUpperCase())) : null;
  const startable = Object.keys(byMachine).filter(c => !lockedMachine || lockedMachine.has(c.toUpperCase()));
  const dirty = Object.keys(choice).length > 0;
  const jobRuns = running.filter(t => t.jobOrderId === job.id);
  const machineName = code => machines.find(m => m.code === code)?.label || '';

  async function saveMachines() {
    // Save every specification's machine, including remembered defaults, so
    // the job order itself records them.
    const all = {};
    for (const g of groups) { const m = machineForSpec(merged, g.spec, defaults); if (m) all[g.spec] = m; }
    setSaving(true); setError('');
    try { await jobData.assignMachines(job.id, all); setChoice({}); }
    catch (e) { setError(JOB_ERRORS[e.message] || e.message); }
    setSaving(false);
  }

  async function start() {
    if (!machine) return;
    if (dirty) await saveMachines();
    const m = machines.find(x => x.code === machine);
    const parts = byMachine[machine] || [];
    const startedAt = new Date().toISOString();
    onStart({
      project, busModel, vin: job.vins[0] || '', vins: job.vins, line: 'Machine Shop',
      station: m?.station || machine, stationCode: machine, designedMin: Number(designed) || 0, startedAt,
      jobOrderId: job.id,
      // Parts are the activities; "added" so they carry over to the card as they are.
      activities: parts.map(it => ({ name: partLabel(it), doneAt: '', added: true })),
    });
  }

  const machineSelect = g => {
    const opts = machineOptionsFor(g.material, jobData.materials, machines);
    const value = machineForSpec(merged, g.spec, defaults);
    return (
      <select aria-label={`Machine for ${g.spec}`} value={value} onChange={e => setChoice(c => ({ ...c, [g.spec]: e.target.value }))}
        style={{ ...inp, width: 260, padding: '6px 8px', fontSize: 13, borderColor: value ? '#10b981' : 'var(--warning-color)' }}>
        <option value="">{opts.length ? 'Choose machine…' : `No machine cuts ${g.material || 'this material'}`}</option>
        {opts.map(o => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
      </select>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="kmc-panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <button className="kmc-btn ghost" onClick={() => setStep('list')}>← Job orders</button>
          <strong style={{ fontFamily: 'monospace', color: 'var(--accent-text)', fontSize: 15 }}>{job.id}</strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{job.project} · {job.busModel} · {cutItems.length} parts to cut</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'monospace' }}>VINs: {job.vins.join(' · ')}</div>
        {jobRuns.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            Running now: {jobRuns.map(t => <span key={t.id} className="kmc-chip" style={{ marginRight: 6 }}><span>{t.stationCode}</span><b style={{ background: 'var(--g-lime)' }}>●</b></span>)}
          </div>
        )}
      </div>

      <div>
        <div className="kmc-label" style={{ marginBottom: 6 }}>1 · Choose the machine for each specification</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          A machine set for a specification cuts every part under it. Only machines that cut that material are offered. The choices are saved for this job order and suggested next time for {busModel}.
        </div>
        <CutListEditor items={cutItems} onChange={() => {}} materials={jobData.materials} readOnly machineFor={machineSelect} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button className="kmc-btn" disabled={saving || (!dirty && !unassigned.length && Object.keys(job.specMachines || {}).length === groups.length)} onClick={saveMachines}>
            {saving ? 'Saving…' : 'Save machine choices'}
          </button>
          {unassigned.length > 0 && <span style={{ fontSize: 12, color: 'var(--warning-color)' }}>{unassigned.length} specification{unassigned.length === 1 ? '' : 's'} without a machine: {unassigned.map(g => g.spec).join(', ')}</span>}
        </div>
      </div>

      <div className="kmc-panel" style={{ padding: '14px 16px' }}>
        <div className="kmc-label" style={{ marginBottom: 10 }}>2 · Which machine starts?</div>
        {startable.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{lockedMachine && Object.keys(byMachine).length ? 'None of the chosen machines are stations assigned to you.' : 'Choose machines above first.'}</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
              <div>
                <label style={label} htmlFor="ms-machine">Machine</label>
                <select id="ms-machine" style={inp} value={machine} onChange={e => setMachine(e.target.value)}>
                  <option value="">Select machine…</option>
                  {startable.map(c => <option key={c} value={c}>{c} · {machineName(c)} — {byMachine[c].length} part{byMachine[c].length === 1 ? '' : 's'}{jobRuns.some(t => t.stationCode === c) ? ' (running)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="ms-designed">Designed time (min)</label>
                <input id="ms-designed" style={inp} type="number" min="0" value={designed} onChange={e => setDesigned(e.target.value)} placeholder="optional" />
              </div>
            </div>
          )}
        {machine && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Parts for {machine} — tick each one off as it is cut once the clock runs:</div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
              {(byMachine[machine] || []).map(it => <li key={it.id}>{partLabel(it)}{it.remarks ? <span style={{ color: 'var(--text-muted)' }}> — {it.remarks}</span> : null}</li>)}
            </ol>
            {jobRuns.some(t => t.stationCode === machine) && <div style={{ fontSize: 12, color: 'var(--warning-color)', marginTop: 8 }}>{machine} is already running on this job order. Starting it again opens a second clock.</div>}
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--accent-text)', marginTop: 10 }}>⚠ {error}</div>}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button className={`kmc-orb${machine ? ' live' : ''}`} style={{ '--orb': '150px' }} onClick={start} disabled={!machine} aria-label="Start this machine">
            <span className="face" style={{ background: 'linear-gradient(150deg, #8ff5b0, #20c464 45%, #0f8a52)' }}>
              <svg className="orb-icon" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" /></svg>
              <span className="orb-text">START</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Loads the job data only when the Machine Shop flow is actually shown.
export function MachineShopJobsLive(props) {
  const jobData = useJobData();
  return <MachineShopJobs {...props} jobData={jobData} />;
}
