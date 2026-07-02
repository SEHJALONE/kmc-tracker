import { useState, useMemo } from 'react';
import { STATUS_COLOR } from './HandoverModal';
import { SHIFTS, LINES } from '../hooks/useHandoverData';

const shiftColors = { Morning: '#f59e0b', Afternoon: '#f97316', Night: '#6366f1' };

function ShiftBadge({ shift }) {
  const c = shiftColors[shift] || '#64748b';
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: `${c}18`, color: c, border: `1px solid ${c}44`, whiteSpace: 'nowrap', fontWeight: 700 }}>
      {shift}
    </span>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || '#64748b';
  return (
    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 8, background: `${c}20`, color: c, border: `1px solid ${c}44`, whiteSpace: 'nowrap', fontWeight: 700 }}>
      {status}
    </span>
  );
}

function IssueDot({ value, label }) {
  const has = value && value.trim();
  if (!has) return null;
  return (
    <span title={`${label}: ${value}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#dc2626', marginRight: 3 }} />
  );
}

export default function HandoverLog({ handovers = [], loading, onOpen }) {
  const [search,  setSearch]  = useState('');
  const [shiftF,  setShiftF]  = useState('');
  const [lineF,   setLineF]   = useState('');
  const [statusF, setStatusF] = useState('');

  const filtered = useMemo(() => {
    let rows = [...handovers].sort((a, b) => {
      const da = a.shiftDate || a.timestamp || '';
      const db = b.shiftDate || b.timestamp || '';
      return db.localeCompare(da);
    });
    if (search)  rows = rows.filter(r => [r.outgoingSupervisor, r.incomingSupervisor, r.line, r.id, r.shiftDate].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (shiftF)  rows = rows.filter(r => r.shift  === shiftF);
    if (lineF)   rows = rows.filter(r => r.line   === lineF);
    if (statusF) rows = rows.filter(r => r.status === statusF);
    return rows;
  }, [handovers, search, shiftF, lineF, statusF]);

  const selSx = {
    padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 11,
    fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', outline: 'none',
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 12 }}>Loading handover log…</div>;
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search supervisor / date / line…"
          style={{ ...selSx, flex: '1 1 180px', minWidth: 160 }}
        />
        <select value={shiftF} onChange={e => setShiftF(e.target.value)} style={selSx}>
          <option value="">All shifts</option>
          {SHIFTS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={lineF} onChange={e => setLineF(e.target.value)} style={selSx}>
          <option value="">All lines</option>
          {LINES.map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={selSx}>
          <option value="">All statuses</option>
          <option>Open</option>
          <option>Acknowledged</option>
        </select>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', marginLeft: 4 }}>
          {filtered.length} / {handovers.length} records
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)', fontSize: 12 }}>
          {handovers.length === 0 ? 'No handovers logged yet.' : 'No records match the current filters.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Date', 'Shift', 'Line', 'Outgoing', 'Incoming', 'Issues', 'Status', 'Acknowledged By'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => (
                <tr
                  key={h.id}
                  onClick={() => onOpen && onOpen(h)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, rgba(99,102,241,0.07))'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-surface)'}
                >
                  <td style={{ padding: '9px 10px', color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: 10, whiteSpace: 'nowrap' }}>{h.shiftDate || h.timestamp?.slice(0, 10) || '—'}</td>
                  <td style={{ padding: '9px 10px' }}><ShiftBadge shift={h.shift} /></td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{h.line || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h.outgoingSupervisor || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{h.incomingSupervisor || '—'}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <IssueDot value={h.safetyIssues}  label="Safety" />
                    <IssueDot value={h.qualityIssues} label="Quality" />
                    {!h.safetyIssues && !h.qualityIssues && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 10px' }}><StatusBadge status={h.status} /></td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-dim)', fontSize: 10, whiteSpace: 'nowrap' }}>{h.acknowledgedBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
