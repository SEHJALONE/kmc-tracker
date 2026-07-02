import { useState } from 'react';
import { useIncidentData, INCIDENT_TYPES, INCIDENT_CLASSES } from '../hooks/useIncidentData';
import { CLASS_COLOR, STATUS_COLOR, InvDeadlineBadge } from './IncidentModal';

function ClassBadge({ classification }) {
  if (!classification) return null;
  const letter = classification.includes('Class A') ? 'A' : classification.includes('Class B') ? 'B' : 'C';
  const color  = CLASS_COLOR[classification] || '#64748b';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: `${color}22`, color, border: `1px solid ${color}66`, fontSize: 9, fontWeight: 800, fontFamily: 'monospace' }}>
      {letter}
    </span>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || '#64748b';
  return (
    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}55`, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

export default function IncidentRegister({ role = 'user', onOpen }) {
  const { incidents, summary, loading, error, refresh } = useIncidentData();

  const [typeFilter,   setTypeFilter]   = useState('ALL');
  const [classFilter,  setClassFilter]  = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm,   setSearchTerm]   = useState('');

  const filtered = incidents.filter(r => {
    if (typeFilter !== 'ALL'   && r.incidentType   !== typeFilter)   return false;
    if (classFilter !== 'ALL') {
      const letter = classFilter;
      if (!r.classification?.includes(`Class ${letter}`)) return false;
    }
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (r.id + r.reportedBy + r.description + r.locationLine + r.locationStation).toLowerCase().includes(q);
    }
    return true;
  });

  const inputSx = { fontSize: 12, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: "'Inter', system-ui, sans-serif", outline: 'none' };

  return (
    <div>
      {/* ── Summary bar ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Total',      value: summary.total,                    color: 'var(--text-heading)' },
          { label: 'Class A',    value: summary.byClass.A.length,         color: CLASS_COLOR['Class A — Critical'] },
          { label: 'Class B',    value: summary.byClass.B.length,         color: CLASS_COLOR['Class B — Major'] },
          { label: 'Class C',    value: summary.byClass.C.length,         color: CLASS_COLOR['Class C — Minor'] },
          { label: 'Open',       value: summary.open.length,              color: '#f59e0b' },
          { label: 'Inv. Overdue', value: summary.overdueInvestigation.length, color: summary.overdueInvestigation.length > 0 ? '#dc2626' : 'var(--text-dim)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 80 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{loading ? '…' : s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <button onClick={refresh} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <input style={{ ...inputSx, minWidth: 200 }} placeholder="Search ID, reporter, description…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <select style={inputSx} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="ALL">All types</option>
          {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={inputSx} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="ALL">All classes</option>
          <option value="A">Class A — Critical</option>
          <option value="B">Class B — Major</option>
          <option value="C">Class C — Minor</option>
        </select>
        <select style={inputSx} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">All statuses</option>
          {['Reported','Under Investigation','CAPA Pending','Closed','Escalated'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── States ── */}
      {loading && <div style={{ textAlign: 'center', padding: 40, fontSize: 12, color: 'var(--text-dim)' }}>Loading incident register…</div>}
      {error && !loading && (
        <div style={{ padding: '12px 16px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 6, fontSize: 12, color: '#dc2626', marginBottom: 16 }}>
          {error} — <button onClick={refresh} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>retry</button>
        </div>
      )}

      {/* ── IMS ref ── */}
      {!loading && (
        <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 14 }}>
          KMC.DQHSE.01/26-PR003 — Incident Reporting & Investigation · {filtered.length} record{filtered.length !== 1 ? 's' : ''} shown
        </div>
      )}

      {/* ── Table ── */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-dim)', fontSize: 12 }}>No incidents match the current filters.</div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 120px 1fr 130px 140px 110px', gap: 12, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
            {['ID', 'Class', 'Type', 'Description', 'Location', 'Status', 'Investigation'].map(h => (
              <div key={h} style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
            ))}
          </div>

          {filtered.map(inc => (
            <div
              key={inc.id}
              onClick={() => onOpen(inc)}
              style={{ display: 'grid', gridTemplateColumns: '100px 80px 120px 1fr 130px 140px 110px', gap: 12, padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${CLASS_COLOR[inc.classification] || 'var(--border)'}`, borderRadius: 6, cursor: 'pointer', alignItems: 'center', transition: 'box-shadow .15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.14)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
            >
              <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{inc.id}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <ClassBadge classification={inc.classification} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{inc.incidentType || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inc.description || '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                {[inc.locationLine, inc.locationStation].filter(Boolean).join(' · ') || '—'}
              </div>
              <StatusBadge status={inc.status} />
              <div>
                <InvDeadlineBadge investigationDue={inc.investigationDue} investigationSubmitted={inc.investigationSubmitted} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
