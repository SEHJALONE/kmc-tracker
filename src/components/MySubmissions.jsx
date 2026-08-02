import { useSubmissionsData } from '../hooks/useSubmissionsData';
import { SEED_STATIONS } from '../data/stations';

const LINE_IMAGE = {
  MACHINE:  '/Machine Shop.jpg',
  BODY:     '/Frame Parts Making.jpg',
  ELECTRO:  '/Electrophoresis.png',
  FRAME:    '/Frame & Body Welding.png',
  CHASSIS1: '/Chassis Line 02.jpg',
  CHASSIS2: '/Chassis Line 02.jpg',
  PAINT:    '/Paint Shop.png',
  TRIM:     '/Trim Line & Final Assembly.jpg',
  QA:       '/Quality Inspection & Testing.png',
};

const STATUS_LABEL = {
  pending_review: 'Pending review',
  pending: 'Needs further review',
  rejected: 'Rejected — rework needed',
  approved: 'Approved',
};

export default function MySubmissions({ onBack, onEdit, theme = 'dark', currentUserName = null }) {
  const isDark = theme === 'dark';
  const bg      = isDark ? 'rgba(7,9,15,0.92)'     : 'rgba(255,255,255,0.97)';
  const text    = isDark ? '#e2e8f0'                : '#1e293b';
  const muted   = isDark ? '#94a3b8'                : '#475569';
  const dim     = isDark ? '#64748b'                : '#94a3b8';
  const border  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
  const R       = '#dc2626';
  const GR      = '#10b981';
  const AM      = '#f59e0b';
  const fm      = "'Inter', system-ui, sans-serif";
  const mono    = "'Inter', system-ui, sans-serif";

  const { submissions, loading } = useSubmissionsData();

  const mine = currentUserName
    ? submissions.filter(s => s.submittedBy === currentUserName).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    : [];

  const statusColor = (status) => status === 'approved' ? GR : status === 'rejected' ? R : AM;

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: fm, color: text, padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,32px)' }}>
      <div style={{
        width: '100%', maxWidth: 860, height: 130, borderRadius: 10, overflow: 'hidden',
        marginBottom: 28, position: 'relative',
        backgroundImage: `url('${isDark ? '/img 2.png' : '/img 1.png'}')`,
        backgroundSize: 'cover', backgroundPosition: 'center 40%',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.82) 0%, rgba(7,9,15,0.35) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>My Submissions</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 2 }}>Your travel card history — edit while a card is still awaiting approval</div>
          </div>
        </div>
      </div>

      {loading && mine.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>Loading…</div>
      )}

      {!loading && mine.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: dim }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>No submissions yet</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Travel cards you submit will show up here.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 800 }}>
        {mine.map(item => {
          const lineId = SEED_STATIONS[item.stationCode]?.line;
          const img = lineId ? LINE_IMAGE[lineId] : null;
          const canEdit = item.approvalStatus !== 'approved';
          return (
            <div key={item.id} style={{
              borderRadius: 10, overflow: 'hidden', position: 'relative',
              border: `1px solid ${border}`,
              backgroundImage: img ? `url('${img}')` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
              minHeight: 88,
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,9,15,0.88) 0%, rgba(7,9,15,0.55) 60%, rgba(7,9,15,0.30) 100%)' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(item.approvalStatus), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>{item.vin} — {item.stationCode}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{item.project} · {item.line}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: mono, marginTop: 2 }}>{new Date(item.timestamp).toLocaleString()}</div>
                  <div style={{ fontSize: 10, fontFamily: mono, marginTop: 4, color: statusColor(item.approvalStatus), fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {STATUS_LABEL[item.approvalStatus] || item.approvalStatus}
                  </div>
                  {item.reviewComments && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 4, maxWidth: 420 }}>"{item.reviewComments}"</div>
                  )}
                </div>
                {canEdit ? (
                  <button onClick={() => onEdit(item)} style={{ fontSize: 11, color: AM, fontFamily: mono, letterSpacing: '0.06em', flexShrink: 0, fontWeight: 700, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}>
                    Edit →
                  </button>
                ) : (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: mono, flexShrink: 0 }}>Locked</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
