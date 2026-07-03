import { useState, useMemo } from 'react';
import { STATUS_COLOR, TIER_COLOR } from './MOCModal';
import { CHANGE_TYPES, CHANGE_TIERS, MOC_STATUSES } from '../hooks/useMOCData';

function DaysToExpiry({ expiryDate }) {
  if (!expiryDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(expiryDate);
  const diff  = Math.ceil((exp - today) / 86400000);
  const color = diff < 0 ? '#dc2626' : diff <= 7 ? '#f59e0b' : '#64748b';
  return (
    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, border: `1px solid ${color}44`, color, background: `${color}11`, whiteSpace: 'nowrap' }}>
      {diff < 0 ? `exp. ${Math.abs(diff)}d ago` : `exp. in ${diff}d`}
    </span>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || '#64748b';
  return (
    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 8, background: `${c}20`, color: c, border: `1px solid ${c}44`, whiteSpace: 'nowrap', fontWeight: 700, letterSpacing: '0.04em' }}>
      {status}
    </span>
  );
}

function TierBadge({ tier }) {
  if (!tier) return null;
  const c = TIER_COLOR[tier] || '#64748b';
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: `${c}18`, color: c, border: `1px solid ${c}44`, whiteSpace: 'nowrap', fontWeight: 700 }}>
      {tier}
    </span>
  );
}

export default function MOCRegister({ mocs = [], loading, onOpen }) {
  const [search,   setSearch]   = useState('');
  const [typeF,    setTypeF]    = useState('');
  const [tierF,    setTierF]    = useState('');
  const [statusF,  setStatusF]  = useState('');

  const filtered = useMemo(() => {
    let rows = mocs;
    if (search)  rows = rows.filter(r => [r.changeTitle, r.requestedBy, r.department, r.id].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (typeF)   rows = rows.filter(r => r.changeType === typeF);
    if (tierF)   rows = rows.filter(r => r.tier        === tierF);
    if (statusF) rows = rows.filter(r => r.status      === statusF);
    return rows;
  }, [mocs, search, typeF, tierF, statusF]);

  const selSx = {
    padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 11,
    fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', outline: 'none',
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 12 }}>Loading MOC register…</div>;
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search title / requester / dept…"
          style={{ ...selSx, flex: '1 1 180px', minWidth: 160 }}
        />
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={selSx}>
          <option value="">All types</option>
          {CHANGE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={tierF} onChange={e => setTierF(e.target.value)} style={selSx}>
          <option value="">All tiers</option>
          {CHANGE_TIERS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={selSx}>
          <option value="">All statuses</option>
          {MOC_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', marginLeft: 4 }}>
          {filtered.length} / {mocs.length} records
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)', fontSize: 12 }}>
          {mocs.length === 0 ? 'No MOCs submitted yet.' : 'No records match the current filters.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['ID', 'Date', 'Title', 'Requested By', 'Type', 'Tier', 'Status', 'Expiry'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((moc, i) => (
                <tr
                  key={moc.id}
                  onClick={() => onOpen && onOpen(moc)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, rgba(99,102,241,0.07))'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-surface)'}
                >
                  <td style={{ padding: '9px 10px', color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: 10, whiteSpace: 'nowrap' }}>{moc.id}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{moc.timestamp?.slice(0, 10) || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {moc.changeTitle || '—'}
                  </td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{moc.requestedBy || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{moc.changeType || '—'}</td>
                  <td style={{ padding: '9px 10px' }}><TierBadge tier={moc.tier} /></td>
                  <td style={{ padding: '9px 10px' }}><StatusBadge status={moc.status} /></td>
                  <td style={{ padding: '9px 10px' }}>
                    {moc.changeStatus === 'Temporary' ? <DaysToExpiry expiryDate={moc.expiryDate} /> : <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Permanent</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
