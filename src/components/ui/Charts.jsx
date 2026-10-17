// Chart pieces in the benchmark style (Graphics/ folder): gradient pills sitting
// in recessed sockets, concentric target rings, numbered ribbons, Bebas Neue
// numerals. Plain SVG/CSS, no chart library. Colours come from one palette so
// every graph in the app reads the same.

export const TONES = {
  red:   ['#ff8a7a', '#dc2626'],
  amber: ['#ffd42a', '#ff8400'],
  lime:  ['#d6f53b', '#20c464'],
  teal:  ['#a9dccf', '#1c78a6'],
  pink:  ['#ffb4c9', '#e14fd6'],
  blue:  ['#8fd3ff', '#2563eb'],
  slate: ['#cbd5e1', '#64748b'],
};
export const TONE_ORDER = ['pink', 'lime', 'amber', 'teal', 'blue', 'red'];
export const toneAt = i => TONE_ORDER[i % TONE_ORDER.length];
export const grad = (tone, angle = 135) => { const [a, b] = TONES[tone] || TONES.slate; return `linear-gradient(${angle}deg, ${a}, ${b})`; };
export const solid = tone => (TONES[tone] || TONES.slate)[1];

// Statuses → tones, used everywhere a status is coloured.
export const STATUS_TONE = { ok: 'lime', warn: 'amber', bad: 'red', info: 'teal', neutral: 'slate' };

// <defs> with one vertical and one horizontal gradient per tone, ids "<p>-<tone>-v|h".
export function GradDefs({ prefix = 'kg' }) {
  return (
    <defs>
      {Object.entries(TONES).map(([t, [a, b]]) => (
        <g key={t}>
          <linearGradient id={`${prefix}-${t}-v`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={b} /><stop offset="1" stopColor={a} /></linearGradient>
          <linearGradient id={`${prefix}-${t}-h`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        </g>
      ))}
      <filter id={`${prefix}-glow`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

export function StatTile({ label, value, sub, tone = 'teal', valueColor, children }) {
  return (
    <div className="kmc-panel kmc-stat">
      <div className="bar" style={{ background: grad(tone, 180) }} />
      <div className="kmc-label">{label}</div>
      <div className="v" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      {sub && <div className="s">{sub}</div>}
      {children}
    </div>
  );
}

// Horizontal gradient pill in a socket, with label and value above it.
export function SocketBar({ label, value, max, tone = 'teal', right, height = 12, marker = null }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      {(label || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{right ?? value}</span>
        </div>
      )}
      <div className="kmc-track" style={{ height, position: 'relative' }}>
        <div className="kmc-fill" style={{ height: '100%', width: `${pct}%`, background: grad(tone, 90), transition: 'width .6s ease' }} />
        {marker != null && <div style={{ position: 'absolute', top: 1, bottom: 1, left: `${marker}%`, width: 2, background: 'var(--text-secondary)', borderRadius: 1 }} />}
      </div>
    </div>
  );
}

// Vertical pill columns (benchmark: "100% / 200% / 300%" bars), each sitting in
// a full-height recessed socket. data: [{ label, value, tone? }]
export function ColumnChart({ data, height = 150, format = v => v, prefix = 'cc', empty = 'Nothing to show yet' }) {
  const max = Math.max(1, ...data.map(d => d.value || 0));
  const n = data.length || 1;
  const W = 560, top = 24, H = height + top + 26;
  const slot = W / n, colW = Math.min(34, slot * 0.46), sock = colW + 10;
  const allZero = data.every(d => !d.value);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block', overflow: 'visible', maxHeight: H * 1.15 }}
      aria-label={data.map(d => `${d.label} ${format(d.value || 0)}`).join(', ')}>
      <GradDefs prefix={prefix} />
      {[0.5, 1].map(f => (
        <line key={f} x1="0" x2={W} y1={top + height * (1 - f)} y2={top + height * (1 - f)} stroke="var(--grid-line)" strokeDasharray="4 6" />
      ))}
      {data.map((d, i) => {
        const cx = slot * (i + 0.5);
        const v = d.value || 0;
        const h = v ? Math.max(colW, (v / max) * height) : 0;
        const y = top + height - h;
        const tone = d.tone || toneAt(i);
        return (
          <g key={d.label + i}>
            <rect x={cx - sock / 2} y={top - 5} width={sock} height={height + 10} rx={sock / 2} fill="var(--socket-bg)" />
            {v > 0 && <>
              <rect x={cx - colW / 2} y={y} width={colW} height={h} rx={colW / 2} fill={`url(#${prefix}-${tone}-v)`} />
              <rect x={cx - colW / 2 + 4} y={y + 4} width={colW * 0.3} height={Math.max(0, h - 8)} rx={colW * 0.15} fill="rgba(255,255,255,0.25)" />
              <text x={cx} y={Math.max(14, y - 9)} textAnchor="middle" fontFamily="var(--font-display)" fontSize="18" fill="var(--text-heading)">{format(v)}</text>
            </>}
            <text x={cx} y={H - 4} textAnchor="middle" fontFamily="var(--font-label)" fontSize="11" fontWeight="700" fill="var(--text-muted)">{d.label}</text>
          </g>
        );
      })}
      {allZero && <text x={W / 2} y={top + height / 2} textAnchor="middle" fontFamily="var(--font-label)" fontSize="13" fontWeight="600" fill="var(--text-muted)">{empty}</text>}
    </svg>
  );
}

// Concentric target rings (benchmark: the archery target). rings: [{ value, max, tone, label }]
export function RingGauge({ rings, size = 170, center, centerSub, prefix = 'rg' }) {
  const stroke = Math.max(8, size * 0.075), gap = stroke * 0.55;
  const c = size / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
      aria-label={rings.map(r => `${r.label}: ${r.value} of ${r.max}`).join(', ')}>
      <GradDefs prefix={prefix} />
      {rings.map((r, i) => {
        const rad = c - stroke / 2 - i * (stroke + gap) - 2;
        if (rad <= stroke) return null;
        const C = 2 * Math.PI * rad;
        const f = r.max > 0 ? Math.min(1, r.value / r.max) : 0;
        return (
          <g key={i}>
            <circle cx={c} cy={c} r={rad} fill="none" stroke="var(--socket-bg)" strokeWidth={stroke + 4} />
            <circle cx={c} cy={c} r={rad} fill="none" stroke={`url(#${prefix}-${r.tone}-h)`} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${f * C} ${C}`} transform={`rotate(-90 ${c} ${c})`} style={{ transition: 'stroke-dasharray .8s ease' }} />
          </g>
        );
      })}
      {center != null && <text x={c} y={c + size * 0.07} textAnchor="middle" fontFamily="var(--font-display)" fontSize={size * 0.22} fill="var(--text-heading)">{center}</text>}
      {centerSub && <text x={c} y={c + size * 0.17} textAnchor="middle" fontFamily="var(--font-label)" fontWeight="700" fontSize={size * 0.06} fill="var(--text-muted)" letterSpacing="1">{centerSub}</text>}
    </svg>
  );
}

export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: grad(it.tone) }} />{it.label}{it.value != null && <b style={{ color: 'var(--text-heading)' }}>{it.value}</b>}
        </span>
      ))}
    </div>
  );
}

export function Ribbon({ n, tone = 'amber', children, side, style, onClick }) {
  return (
    <div className="kmc-ribbon" style={style}>
      <div className="num" style={{ background: grad(tone, 160) }}>{String(n).padStart(2, '0')}</div>
      <div className="body" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>{children}</div>
      {side && <div className="side">{side}</div>}
    </div>
  );
}

export function SectionHead({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '0 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 22, height: 4, borderRadius: 2, background: 'var(--g-red)' }} />
        <span className="kmc-label" style={{ color: 'var(--text-secondary)' }}>{children}</span>
      </div>
      {right}
    </div>
  );
}
