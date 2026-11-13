import { useMemo, useRef, useState } from 'react';
import { sendViaAppsScript } from '../data/mailer';
import { downloadCsv } from '../utils/csv';
import { parseVinCsv, classifyVins, VIN_TEMPLATE_ROWS } from '../utils/vinUpload';

// Type Approvals: the VIN register for each bus project. Upload a CSV with the
// columns VIN and BUS PROJECT; new VINs are added to the project, VINs already
// there are left alone, and anything that doesn't fit is listed and skipped.
// Saved through uploadProjectVins_ (Apps Script), which merges into the shared
// catalog, so the VINs appear in every Travel Card's VIN list.

const ERRORS = {
  'not-type-approvals': 'Your account does not have the Type Approvals role. Ask a system admin to add it in User Management.',
  'unknown-project': 'That project is not in the catalog any more. Pick another project.',
  'catalog-unreadable': 'The catalog could not be read on the server. Try again in a minute.',
  'save-failed': 'The server could not save the catalog. Try again.',
};

const GROUPS = [
  ['added', 'New — will be added', 'lime'],
  ['updated', 'Already there — bus model updated', 'teal'],
  ['existing', 'Already there — no change', 'blue'],
  ['otherProject', 'On another project — skipped', 'amber'],
  ['wrongProject', 'BUS PROJECT is a different project — skipped', 'amber'],
  ['invalid', 'Not a valid VIN (17 characters, no I, O or Q) — skipped', 'red'],
  ['repeated', 'Repeated in the file — counted once', 'pink'],
];

export default function TypeApprovals({ catalog, refreshCatalog, onBack }) {
  const projects = useMemo(() => (catalog.projects || []).filter(p => p && p.name && p.active !== false).map(p => p.name), [catalog.projects]);
  const [project, setProject] = useState('');
  const [file, setFile] = useState(null);         // { name, rows, errors }
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);     // server reply
  const [error, setError] = useState('');
  const [showList, setShowList] = useState(false);
  const input = useRef(null);

  const current = (catalog.projectVins || {})[project] || [];
  const preview = file && project ? classifyVins(file.rows, project, catalog.projectVins) : null;
  const toSave = preview ? preview.added.length + preview.updated.length : 0;

  function pick(e) {
    const f = e.target.files?.[0];
    setResult(null); setError('');
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseVinCsv(String(reader.result || ''));
      setFile({ name: f.name, ...parsed });
      // Fill in the project from the file when none is chosen yet.
      if (!project) {
        const named = [...new Set(parsed.rows.map(r => r.project).filter(Boolean))];
        if (named.length === 1 && projects.includes(named[0])) setProject(named[0]);
      }
    };
    reader.readAsText(f);
  }

  async function save() {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await sendViaAppsScript('uploadProjectVins', { project, rows: file.rows });
      setResult(r);
      setFile(null);
      if (input.current) input.current.value = '';
      refreshCatalog?.();
    } catch (e) {
      setError(ERRORS[e.message] || e.message);
    }
    setBusy(false);
  }

  const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 };
  const input_ = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' };
  const shown = result?.result || preview;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 60px', color: 'var(--text-primary)' }}>
      <button className="kmc-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Home</button>
      <div className="kmc-label" style={{ color: 'var(--accent-text)' }}>Type Approvals</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 34, letterSpacing: '.04em', margin: '2px 0 6px', color: 'var(--text-heading)' }}>VIN register</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 18px', lineHeight: 1.55 }}>
        Upload the VINs for a bus project. The file needs two columns, <strong>VIN</strong> and <strong>BUS PROJECT</strong>.
        VINs already on the project are kept as they are and only new ones are added. Once saved, they show in every Travel Card's VIN list.
      </p>

      <div className="kmc-panel" style={{ padding: '18px 20px', display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={label} htmlFor="ta-project">Bus project</label>
            <select id="ta-project" style={input_} value={project} onChange={e => { setProject(e.target.value); setResult(null); }}>
              <option value="">Select project…</option>
              {projects.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <button className="kmc-btn" onClick={() => downloadCsv('VIN-upload-template.csv', project ? [VIN_TEMPLATE_ROWS[0], ['', project]] : VIN_TEMPLATE_ROWS)}>
            ⬇ Download template
          </button>
        </div>

        {project && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-heading)' }}>{current.length}</strong> VIN{current.length === 1 ? '' : 's'} on {project} now.{' '}
            {current.length > 0 && <button className="kmc-btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setShowList(s => !s)}>{showList ? 'Hide' : 'Show'}</button>}
            {showList && (
              <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12, columns: 2 }}>
                {current.map(v => <div key={v.vin}>{v.vin}{v.model ? ` · ${v.model}` : ''}</div>)}
              </div>
            )}
          </div>
        )}

        <div>
          <label style={label} htmlFor="ta-file">CSV file</label>
          <input id="ta-file" ref={input} type="file" accept=".csv,text/csv" onChange={pick} style={{ fontSize: 13 }} />
          {file && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{file.name}: {file.rows.length} VIN row{file.rows.length === 1 ? '' : 's'}</div>}
          {file?.errors?.map(e => <div key={e} style={{ fontSize: 12, color: 'var(--accent-text)', marginTop: 6 }}>⚠ {e}</div>)}
        </div>

        {file && !project && <div style={{ fontSize: 12, color: 'var(--warning-color)' }}>Choose the bus project the file is for.</div>}

        {shown && (
          <div>
            <div className="kmc-label" style={{ marginBottom: 8 }}>{result ? `Saved — ${result.project} now has ${result.total} VINs` : 'Before saving'}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {GROUPS.filter(([k]) => shown[k]?.length).map(([k, text, tone]) => (
                <details key={k} style={{ background: 'var(--socket-bg)', borderRadius: 10, padding: '8px 12px' }} open={k === 'otherProject' || k === 'invalid'}>
                  <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                    <span className="kmc-chip" style={{ marginRight: 8 }}><b style={{ background: `var(--g-${tone})` }}>{shown[k].length}</b></span>{text}
                  </summary>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6, maxHeight: 160, overflowY: 'auto', columns: 2 }}>
                    {shown[k].map(v => <div key={v}>{v}</div>)}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>⚠ {error}</div>}

        {preview && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="kmc-btn primary" disabled={busy || !toSave} onClick={save}>
              {busy ? 'Saving…' : toSave ? `Save ${toSave} VIN${toSave === 1 ? '' : 's'} to ${project}` : 'Nothing new to save'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Only the new VINs (and changed bus models) are written.</span>
          </div>
        )}
      </div>
    </div>
  );
}
