import { useState, useCallback } from 'react';
import { useNCRData, NCR_TYPES, NCR_SEVERITIES, NCR_STATUSES, NCR_DOMAINS } from '../hooks/useNCRData';
import { SEVERITY_COLOR, STATUS_COLOR, DaysBadge } from './NCRModal';
import { buildNCRPDF, buildNCRRegisterPDF } from '../export/buildNCRPDF.js';

const COLS = [
  { id: 'Open',                label: 'Open' },
  { id: 'In Progress',         label: 'In Progress' },
  { id: 'Closed',              label: 'Closed' },
  { id: 'Concession Approved', label: 'Concession' },
];

const DOMAIN_COLORS = {
  'Parts & Materials': '#f59e0b',
  'Process':           '#3b82f6',
  'Quality':           '#10b981',
  'Production':        '#dc2626',
};

function Badge({ color, children }) {
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}55`, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function NCRCard({ ncr, onOpen, onExport }) {
  const sColor = SEVERITY_COLOR[ncr.severity] || '#94a3b8';
  return (
    <div
      style={{ background: 'var(--bg-base)', border: `1px solid var(--border)`, borderLeft: `3px solid ${sColor}`, borderRadius: 6, padding: '10px 12px', cursor: 'pointer', transition: 'box-shadow .15s', position: 'relative' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
    >
      <div onClick={() => onOpen(ncr)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{ncr.id}</div>
          {ncr.severity && <Badge color={sColor}>{ncr.severity}</Badge>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>
          {ncr.description ? (ncr.description.length > 90 ? ncr.description.slice(0, 90) + '…' : ncr.description) : '—'}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {ncr.vin        && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ncr.vin}</span>}
          {ncr.stationCode && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{ncr.stationCode}</span>}
          {ncr.ncrType    && <Badge color="#64748b">{ncr.ncrType}</Badge>}
          {ncr.domain     && <Badge color={DOMAIN_COLORS[ncr.domain] || '#64748b'}>{ncr.domain}</Badge>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{ncr.assignedTo ? `→ ${ncr.assignedTo}` : ''}</div>
          <DaysBadge dueDate={ncr.dueDate} status={ncr.status} />
        </div>
      </div>

      {/* Export icon */}
      <button
        onClick={e => { e.stopPropagation(); onExport(ncr); }}
        title="Export NCR report"
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'none', border: '1px solid var(--border-subtle)',
          borderRadius: 4, cursor: 'pointer', padding: '2px 5px',
          fontSize: 10, color: 'var(--text-dim)', lineHeight: 1,
          opacity: 0.6, transition: 'opacity .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
      >
        ↓ PDF
      </button>
    </div>
  );
}

export default function NCRBoard({ role = 'user', ncrDomain = null, glass, glassBorder, onLogNCR, onOpenNCR }) {
  const glassStyle = {
    background: glass || 'var(--bg-surface)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${glassBorder || 'var(--border)'}`,
    borderRadius: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
  };

  const { ncrs, summary, loading, error, refresh } = useNCRData();
  const isAdmin = role === 'systemadmin' || role === 'useradmin';

  const [activeDomain,   setActiveDomain]   = useState(ncrDomain || (isAdmin ? 'ALL' : null));
  const [typeFilter,     setTypeFilter]     = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter,   setStatusFilter]   = useState('ALL');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [searchTerm,     setSearchTerm]     = useState('');
  const [exporting,      setExporting]      = useState(false);

  const filtered = ncrs.filter(r => {
    if (r.ncrType !== 'Safety') {
      if (activeDomain && activeDomain !== 'ALL' && r.domain !== activeDomain) return false;
      if (!isAdmin && !activeDomain && ncrDomain && r.domain !== ncrDomain) return false;
    }
    if (typeFilter     !== 'ALL' && r.ncrType  !== typeFilter)     return false;
    if (severityFilter !== 'ALL' && r.severity !== severityFilter) return false;
    if (statusFilter   !== 'ALL' && r.status   !== statusFilter)   return false;
    if (dateFrom && r.date && r.date < dateFrom) return false;
    if (dateTo   && r.date && r.date > dateTo)   return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return [r.id, r.vin, r.stationCode, r.description, r.assignedTo, r.raisedBy]
        .join(' ').toLowerCase().includes(q);
    }
    return true;
  });

  const handleExportSingle = useCallback(async (ncr) => {
    setExporting(true);
    try { await buildNCRPDF(ncr); } finally { setExporting(false); }
  }, []);

  const handleExportRegister = useCallback(async () => {
    setExporting(true);
    const label = [
      activeDomain !== 'ALL' ? activeDomain : 'All Domains',
      statusFilter !== 'ALL' ? statusFilter : '',
      dateFrom ? `from ${dateFrom}` : '',
      dateTo   ? `to ${dateTo}`     : '',
    ].filter(Boolean).join(' · ') || 'All NCRs';
    try { await buildNCRRegisterPDF(filtered, label); } finally { setExporting(false); }
  }, [filtered, activeDomain, statusFilter, dateFrom, dateTo]);

  const resetFilters = () => {
    setTypeFilter('ALL'); setSeverityFilter('ALL'); setStatusFilter('ALL');
    setDateFrom(''); setDateTo(''); setSearchTerm('');
  };

  const hasFilters = typeFilter !== 'ALL' || severityFilter !== 'ALL' || statusFilter !== 'ALL' || dateFrom || dateTo || searchTerm;

  const inputSx = {
    fontSize: 11, padding: '6px 10px',
    border: '1px solid var(--border)', borderRadius: 4,
    background: 'transparent', color: 'var(--text-primary)',
    fontFamily: "'Inter', system-ui, sans-serif", outline: 'none',
  };

  return (
    <div>
      {/* ── Domain tab bar ── */}
      <div style={{ ...glassStyle, display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button onClick={() => setActiveDomain('ALL')} style={{
              fontSize: 11, padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
              fontFamily: "'Inter', system-ui, sans-serif",
              border: activeDomain === 'ALL' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: activeDomain === 'ALL' ? 'var(--accent)' : 'transparent',
              color: activeDomain === 'ALL' ? '#fff' : 'var(--text-dim)',
              transition: 'all .15s',
            }}>All Domains</button>
          )}
          {(isAdmin ? NCR_DOMAINS : (ncrDomain ? [ncrDomain] : NCR_DOMAINS)).map(d => {
            const active = activeDomain === d;
            const color  = DOMAIN_COLORS[d] || '#64748b';
            const count  = ncrs.filter(r => r.domain === d).length;
            return (
              <button key={d} onClick={() => setActiveDomain(d)} style={{
                fontSize: 11, padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                fontFamily: "'Inter', system-ui, sans-serif",
                border: active ? `1px solid ${color}` : '1px solid var(--border)',
                background: active ? `${color}22` : 'transparent',
                color: active ? color : 'var(--text-dim)',
                fontWeight: active ? 700 : 400,
                transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {d}
                <span style={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.8 }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleExportRegister}
            disabled={exporting || !filtered.length}
            style={{
              fontSize: 11, padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif",
              letterSpacing: '0.05em', opacity: exporting ? 0.5 : 1,
            }}
          >
            {exporting ? '…' : '↓ Export Register'}
          </button>
          {onLogNCR && (
            <button onClick={onLogNCR} style={{
              fontSize: 11, padding: '7px 16px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}>+ Log NCR</button>
          )}
        </div>
      </div>

      {/* ── Summary scorecards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {[
          { label: 'Total NCRs', value: summary.total,           color: 'var(--text-heading)' },
          { label: 'Open',       value: summary.open.length,     color: STATUS_COLOR['Open'] },
          { label: 'Critical',   value: summary.critical.length, color: SEVERITY_COLOR.Critical },
          { label: 'Overdue',    value: summary.overdue.length,  color: '#dc2626' },
          { label: 'Closed',     value: summary.closed.length,   color: SEVERITY_COLOR.Minor },
        ].map(s => (
          <div key={s.label} style={{ ...glassStyle, padding: '10px 18px', minWidth: 88 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={refresh} style={{
            padding: '8px 12px', background: 'transparent',
            border: `1px solid ${glassBorder || 'var(--border)'}`,
            borderRadius: 6, fontSize: 11, color: 'var(--text-muted)',
            cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif",
          }}>↻ Refresh</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ ...glassStyle, marginBottom: 16, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...inputSx, minWidth: 190, flex: 1 }}
            placeholder="Search NCR ID, VIN, description, raised by…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <select style={inputSx} value={typeFilter}     onChange={e => setTypeFilter(e.target.value)}>
            <option value="ALL">All types</option>
            {NCR_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select style={inputSx} value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
            <option value="ALL">All severities</option>
            {NCR_SEVERITIES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select style={inputSx} value={statusFilter}   onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            {NCR_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>DATE RAISED</span>
          <input type="date" style={inputSx} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>—</span>
          <input type="date" style={inputSx} value={dateTo}   onChange={e => setDateTo(e.target.value)} />
          {hasFilters && (
            <button onClick={resetFilters} style={{
              fontSize: 10, padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontFamily: "'Inter', system-ui, sans-serif",
            }}>✕ Clear</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
            KMC.DQHSE.02/26-PR009 · {filtered.length} record{filtered.length !== 1 ? 's' : ''} shown
          </span>
        </div>
      </div>

      {/* ── Loading / error ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, fontSize: 12, color: 'var(--text-dim)' }}>Loading NCR register…</div>
      )}
      {error && !loading && (
        <div style={{ padding: '12px 16px', background: '#dc262622', border: '1px solid #dc262655', borderRadius: 6, fontSize: 12, color: '#dc2626', marginBottom: 16 }}>
          {error} — <button onClick={refresh} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>retry</button>
        </div>
      )}

      {/* ── Kanban board ── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {COLS.map(col => {
            const cards    = filtered.filter(r => r.status === col.id);
            const colColor = STATUS_COLOR[col.id] || '#64748b';
            return (
              <div key={col.id} style={{ ...glassStyle, padding: '14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${colColor}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{col.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{cards.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cards.length === 0 ? (
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', padding: '24px 0', borderRadius: 6, border: `1px dashed ${glassBorder || 'var(--border)'}` }}>
                      No {col.label.toLowerCase()} NCRs
                    </div>
                  ) : (
                    cards.map(ncr => (
                      <NCRCard key={ncr.id} ncr={ncr} onOpen={onOpenNCR || (() => {})} onExport={handleExportSingle} />
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
