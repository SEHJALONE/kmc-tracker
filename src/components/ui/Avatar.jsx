import { initialsOf } from '../../data/profile';

// A person's photo, or their initials when they have not set one.
export default function Avatar({ photo, name, username, size = 28 }) {
  const common = { width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'block' };
  if (photo) return <img src={photo} alt="" style={{ ...common, objectFit: 'cover', border: '1px solid var(--border-medium)' }} />;
  return (
    <span aria-hidden="true" style={{
      ...common, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--socket-bg)', boxShadow: 'var(--socket-shadow)', color: 'var(--text-secondary)',
      fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: Math.round(size * 0.38), letterSpacing: '0.02em',
    }}>{initialsOf(name, username)}</span>
  );
}
