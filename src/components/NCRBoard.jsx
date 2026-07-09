import { useState } from 'react';
import { useNCRData, NCR_TYPES, NCR_SEVERITIES, NCR_DOMAINS } from '../hooks/useNCRData';
import { SEVERITY_COLOR, STATUS_COLOR, DaysBadge } from './NCRModal';

const COLS = [
  { id: 'Open',                label: 'Open' },
  { id: 'In Progress',         label: 'In Progress' },
  { id: 'Closed',              label: 'Closed' },
  { id: 'Concession Approved', label: 'Concession' },
];

function Badge({ color, children }) {
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}55`, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function NCRCard({ ncr, onOpen }) {
  const sColor = SEVERITY_COLOR[ncr.severity] || '#94a3b8';

  return (
    <div
      onClick={() => onOpen(ncr)}
      style={{ background: 'var(--bg-base)', border: `1px solid var(--border)`, borderLeft: `3px solid ${sColor}`, borderRadius: 6, padding: '10px 12px', cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{ncr.id}</div>
        {ncr.severity && <Badge color={sColor}>{ncr.severity}</Badge>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>
        {ncr.description ? (ncr.description.length > 90 ? ncr.description.slice(0, 90) + '…' : ncr.description) : '—'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {ncr.vin && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ncr.vin}</span>}
        {ncr.stationCode && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{ncr.stationCode}</span>}
        {ncr.ncrType && <Badge color="#64748b">{ncr.ncrType}</Badge>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
          {ncr.assignedTo ? `→ ${ncr.assignedTo}` : ''}
        </div>
        <DaysBadge dueDate={ncr.dueDate} status={ncr.status} />
      </div>
    </div>
  );
}

const DOMAIN_COLORS = {
  'Parts & Materials': '#f59e0b',
  'Process':           '#3b82f6',
  'Quality':           '#10b981',
  'Production':        '#dc2626',
};

export default function NCRBoard({ role = 'user', ncrDomain = null, onLogNCR, onOpenNCR }) {
  const { ncrs, summary, loading, error, refresh } = useNCRData();

  // Domain tab — admin sees ALL; domain users land on their domain by default
  const isAdmin = role === 'admin';
  const [activeDomain, setActiveDomain] = useState(ncrDomain || (isAdmin ? 'ALL' : null));

  // Sub-filters
  const [typeFilter,     setTypeFilter]     = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchTerm,     setSearchTerm]     = useState('');

  const filtered = ncrs.filter(r => {
    // Safety NCRs are cross-domain — visible to everyone regardless of active domain
    if (r.ncrType === 'Safety') {
      // still apply type/severity/search filters below, but skip domain filter
    } else {
      if (activeDomain && activeDomain !== 'ALL' && r.domain !== activeDomain) return false;
      if (!isAdmin && !activeDomain && ncrDomain && r.domain !== ncrDomain) return false;
    }
    if (typeFilter !== 'ALL'     && r.ncrType  !== typeFilter)     return false;
    if (severityFilter !== 'ALL' && r.severity !== severityFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (r.id + r.vin + r.stationCode + r.description + r.assignedTo).toLowerCase().includes(q);
    }
    return true;
  });

  const inputSx = { fontSize: 12, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: "'Inter', system-ui, sans-serif", outline: 'none' };

  return (
    <div>
      {/* ── Domain tab bar ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              onClick={() => setActiveDomain('ALL')}
              style={{
                fontSize: 11, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif",
                border: activeDomain === 'ALL' ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeDomain === 'ALL' ? 'var(--accent)' : 'transparent',
                color: activeDomain === 'ALL' ? '#fff' : 'var(--text-dim)',
                transition: 'all .15s',
              }}
            >All Domains</button>
          )}
          {(isAdmin ? NCR_DOMAINS : (ncrDomain ? [ncrDomain] : NCR_DOMAINS)).map(d => {
            const active = activeDomain === d;
            const color = DOMAIN_COLORS[d] || '#64748b';
            const count = ncrs.filter(r => r.domain === d).length;
            return (
              <button
                key={d}
                onClick={() => setActiveDomain(d)}
                style={{
                  fontSize: 11, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif",
                  border: active ? `1px solid ${color}` : '1px solid var(--border)',
                  background: active ? `${color}22` : 'transparent',
                  color: active ? color : 'var(--text-dim)',
                  fontWeight: active ? 700 : 400,
                  transition: 'all .15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {d}
                <span style={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.8 }}>{count}</span>
              </button>
            );
          })}
        </div>
        {onLogNCR && (
          <button
            onClick={onLogNCR}
            style={{ fontSize: 11, padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            + Log NCR
          </button>
        )}
      </div>

      {/* ── Summary bar ── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Total NCRs',   value: summary.total,           color: 'var(--text-heading)' },
          { label: 'Open',         value: summary.open.length,     color: STATUS_COLOR['Open'] },
          { label: 'Critical',     value: summary.critical.length, color: SEVERITY_COLOR.Critical },
          { label: 'Overdue',      value: summary.overdue.length,  color: '#dc2626' },
          { label: 'Closed',       value: summary.closed.length,   color: SEVERITY_COLOR.Minor },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 90 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}

        <div style={{ marginLeft: 'auto' }}>
          <button onClick={refresh} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <input
          style={{ ...inputSx, minWidth: 180 }}
          placeholder="Search NCR ID, VIN, description…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <select style={inputSx} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="ALL">All types</option>
          {NCR_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={inputSx} value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
          <option value="ALL">All severities</option>
          {NCR_SEVERITIES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Loading / error states ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, fontSize: 12, color: 'var(--text-dim)' }}>Loading NCR register…</div>
      )}
      {error && !loading && (
        <div style={{ padding: '12px 16px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 6, fontSize: 12, color: '#dc2626', marginBottom: 16 }}>
          {error} — <button onClick={refresh} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>retry</button>
        </div>
      )}

      {/* ── IMS reference ── */}
      {!loading && (
        <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 16 }}>
          KMC.DQHSE.02/26-PR009 — Control of Non-Conformities · {filtered.length} record{filtered.length !== 1 ? 's' : ''} shown
        </div>
      )}

      {/* ── Kanban board ── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {COLS.map(col => {
            const cards = filtered.filter(r => r.status === col.id);
            const colColor = STATUS_COLOR[col.id] || '#64748b';
            return (
              <div key={col.id}>
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${colColor}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{col.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{cards.length}</span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cards.length === 0 ? (
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', padding: '24px 0', borderRadius: 6, border: '1px dashed var(--border)' }}>
                      No {col.label.toLowerCase()} NCRs
                    </div>
                  ) : (
                    cards.map(ncr => (
                      <NCRCard key={ncr.id} ncr={ncr} onOpen={onOpenNCR || (() => {})} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
