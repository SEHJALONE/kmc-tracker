import { useEffect, useRef, useState } from 'react';
import PageShell from './ui/PageShell';
import Avatar from './ui/Avatar';
import { MoreAccessRequest } from './MoreAccess';
import { emailProblem } from '../utils/emailCheck';
import {
  cachedProfile, cacheProfile, fetchMyProfile, saveMyProfile, resizePhoto,
  profileErrorText, isOldServer, PASSWORD_MIN,
} from '../data/profile';

// Settings → My account. A person changes their own name, phone, email, photo
// and password here. What they are allowed to do in the system (role, lines,
// stations) is shown for reference only: administrators set that in User
// Management.

const ROLE_LABELS = {
  user: 'General user', supervisor: 'Supervisor', manager: 'Manager', director: 'Director',
  useradmin: 'User admin', systemadmin: 'System admin', cee: 'Cost Estimations Engineer',
};

const field = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 };
const input = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10,
  color: 'var(--text-primary)', fontSize: 14, padding: '10px 12px', width: '100%', boxSizing: 'border-box',
  fontFamily: "'Inter', system-ui, sans-serif", minHeight: 44,
};
const hint = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 };
const sectionTitle = { fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: '-0.01em', color: 'var(--text-heading)', margin: '0 0 14px', fontWeight: 700 };

export default function AccountSettings({ theme, onToggleTheme, onBack, username = '', role = 'user', onSaved = null }) {
  const [base, setBase] = useState(() => cachedProfile());   // what the server has
  const [form, setForm] = useState(() => ({ ...cachedProfile(), currentPassword: '', newPassword: '', confirmPassword: '' }));
  const [account, setAccount] = useState(null);               // full record, for the read-only access summary
  const [loadNote, setLoadNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);                       // { ok, text }
  const fileRef = useRef(null);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchMyProfile().then(r => {
      if (!alive) return;
      if (!r.ok) {
        setLoadNote(isOldServer(r.error)
          ? 'Account settings are not switched on at the server yet, so changes cannot be saved. The system admin needs to update the live script.'
          : ['unauthorized', 'network'].includes(r.error) ? profileErrorText(r)
          : `Your account details could not be loaded from the server (${r.error}).`);
        return;
      }
      const u = r.user;
      const fresh = { fullName: u.fullName || '', email: u.email || '', phone: u.phone || '', photo: u.photo || '' };
      setAccount(u);
      setBase(fresh);
      cacheProfile(fresh);
      // Do not overwrite what the person has already started typing.
      if (!touched.current) setForm(f => ({ ...f, ...fresh }));
    });
    return () => { alive = false; };
  }, []);

  const set = (k, v) => { touched.current = true; setMsg(null); setForm(f => ({ ...f, [k]: v })); };

  const emailChanged = form.email.trim().toLowerCase() !== (base.email || '').trim().toLowerCase();
  const wantsPassword = form.newPassword !== '';
  const needsCurrent = emailChanged || wantsPassword;
  const dirty = form.fullName.trim() !== (base.fullName || '') || form.phone.trim() !== (base.phone || '')
    || emailChanged || form.photo !== (base.photo || '') || wantsPassword;

  async function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { set('photo', await resizePhoto(file)); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  }

  async function save(e) {
    e.preventDefault();
    if (busy || !dirty) return;
    const name = form.fullName.replace(/\s+/g, ' ').trim();
    if (name.length < 2) { setMsg({ ok: false, text: 'Enter your full name.' }); return; }
    if (emailChanged) {
      const issue = emailProblem(form.email);
      if (issue) { setMsg({ ok: false, text: issue.message }); return; }
    }
    if (wantsPassword) {
      if (form.newPassword.length < PASSWORD_MIN) { setMsg({ ok: false, text: `The new password needs at least ${PASSWORD_MIN} characters.` }); return; }
      if (form.newPassword !== form.confirmPassword) { setMsg({ ok: false, text: 'The two new passwords do not match.' }); return; }
    }
    if (needsCurrent && !form.currentPassword) {
      setMsg({ ok: false, text: 'Enter your current password to change the email or password.' });
      return;
    }

    const patch = {};
    if (name !== (base.fullName || '')) patch.fullName = name;
    if (form.phone.trim() !== (base.phone || '')) patch.phone = form.phone.trim();
    if (emailChanged) patch.email = form.email.trim().toLowerCase();
    if (form.photo !== (base.photo || '')) patch.photo = form.photo;
    if (wantsPassword) patch.newPassword = form.newPassword;
    if (needsCurrent) patch.currentPassword = form.currentPassword;

    setBusy(true);
    const r = await saveMyProfile(patch);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: profileErrorText(r) }); return; }

    const u = r.user;
    const fresh = { fullName: u.fullName || '', email: u.email || '', phone: u.phone || '', photo: u.photo || '' };
    setAccount(u);
    setBase(fresh);
    cacheProfile(fresh);
    touched.current = false;
    setForm({ ...fresh, currentPassword: '', newPassword: '', confirmPassword: '' });
    setMsg(r.nameShared
      ? { ok: false, text: 'Saved, but another account has your old name, so the cards you filed earlier still carry it. Ask the system admin to sort them out.' }
      : { ok: true, text: r.passwordChanged ? 'Saved. Use the new password next time you sign in.' : 'Saved.' });
    if (onSaved) onSaved(fresh);
  }

  const stations = account ? (account.assignedStations?.length ? account.assignedStations : (account.assignedStation ? [account.assignedStation] : [])) : [];
  const lines = account ? (account.assignedLines?.length ? account.assignedLines : (account.assignedLine ? [account.assignedLine] : [])) : [];
  const extraRoles = (account?.roles || []).map(r => ROLE_LABELS[r] || r);

  return (
    <PageShell title="Settings" subtitle="My account" onBack={onBack} theme={theme} onToggleTheme={onToggleTheme}>
      <style>{`
        .acct-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px 16px; }
        .acct-input:focus { outline: none; border-color: var(--accent-border); }
        .acct-input:disabled { opacity: .7; }
        @media (max-width: 640px) { .acct-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
      <form onSubmit={save} style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loadNote && (
          <div role="alert" className="kmc-panel" style={{ padding: '12px 16px', borderLeft: '4px solid var(--c-amber)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{loadNote}</div>
        )}

        <section className="kmc-panel" style={{ padding: 20 }}>
          <h2 style={sectionTitle}>Profile</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
            <Avatar photo={form.photo} name={form.fullName} username={username} size={84} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="kmc-btn" onClick={() => fileRef.current && fileRef.current.click()}>{form.photo ? 'Change photo' : 'Add photo'}</button>
                {form.photo && <button type="button" className="kmc-btn ghost" onClick={() => set('photo', '')}>Remove</button>}
              </div>
              <div style={hint}>A square crop of the picture is stored. JPG or PNG.</div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} style={{ display: 'none' }} aria-label="Profile photo" />
            </div>
          </div>
          <div className="acct-grid">
            <label style={field}><span className="kmc-label">Full name</span>
              <input className="acct-input" style={input} value={form.fullName} maxLength={80} autoComplete="name" onChange={e => set('fullName', e.target.value)} />
            </label>
            <label style={field}><span className="kmc-label">Phone</span>
              <input className="acct-input" style={input} value={form.phone} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="+256 700 123456" onChange={e => set('phone', e.target.value)} />
            </label>
          </div>
          <div style={{ ...hint, marginTop: 10 }}>Travel Cards are filed under this name. Changing it also renames the cards you have already filed, so they stay in your list.</div>
        </section>

        <section className="kmc-panel" style={{ padding: 20 }}>
          <h2 style={sectionTitle}>Sign-in</h2>
          <div className="acct-grid">
            <label style={field}><span className="kmc-label">Username</span>
              <input className="acct-input" style={{ ...input, fontFamily: 'inherit' }} value={username} disabled readOnly />
            </label>
            <label style={field}><span className="kmc-label">Email</span>
              <input className="acct-input" style={input} type="email" value={form.email} autoComplete="email" onChange={e => set('email', e.target.value)} />
            </label>
            <label style={field}><span className="kmc-label">New password</span>
              <input className="acct-input" style={input} type="password" value={form.newPassword} autoComplete="new-password" placeholder="Leave empty to keep the current one" onChange={e => set('newPassword', e.target.value)} />
            </label>
            <label style={field}><span className="kmc-label">Repeat new password</span>
              <input className="acct-input" style={input} type="password" value={form.confirmPassword} autoComplete="new-password" disabled={!wantsPassword} onChange={e => set('confirmPassword', e.target.value)} />
            </label>
            {needsCurrent && (
              <label style={{ ...field, gridColumn: '1 / -1' }}><span className="kmc-label">Current password</span>
                <input className="acct-input" style={{ ...input, maxWidth: 360 }} type="password" value={form.currentPassword} autoComplete="current-password" onChange={e => set('currentPassword', e.target.value)} />
                <span style={hint}>Needed to change the email or the password.</span>
              </label>
            )}
          </div>
          <div style={{ ...hint, marginTop: 10 }}>
            Notifications and password-reset codes go to this email. The username can only be changed by the system admin.
          </div>
        </section>

        <section className="kmc-panel" style={{ padding: 20 }}>
          <h2 style={sectionTitle}>Access</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) minmax(0, 1fr)', gap: '8px 14px', margin: 0, fontSize: 13 }}>
            <dt className="kmc-label" style={{ alignSelf: 'center' }}>Role</dt>
            <dd style={{ margin: 0, color: 'var(--text-primary)' }}>{[ROLE_LABELS[account?.role || role] || account?.role || role, ...extraRoles].join(', ')}</dd>
            {account?.department && (<><dt className="kmc-label" style={{ alignSelf: 'center' }}>Department</dt><dd style={{ margin: 0, color: 'var(--text-primary)' }}>{account.department}</dd></>)}
            {lines.length > 0 && (<><dt className="kmc-label" style={{ alignSelf: 'center' }}>Lines</dt><dd style={{ margin: 0, color: 'var(--text-primary)' }}>{lines.join(', ')}</dd></>)}
            {stations.length > 0 && (<><dt className="kmc-label" style={{ alignSelf: 'start', paddingTop: 2 }}>Stations</dt><dd style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'inherit', lineHeight: 1.6 }}>{stations.join(', ')}</dd></>)}
          </dl>
          <div style={{ ...hint, marginTop: 12 }}>Set by the administrators. Ask them if any of this is wrong.</div>
        </section>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="kmc-btn primary" disabled={busy || !dirty} style={{ minHeight: 44, padding: '10px 22px' }}>{busy ? 'Saving…' : 'Save changes'}</button>
          {msg && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? 'var(--c-lime)' : 'var(--c-red)' }}>{msg.text}</span>}
        </div>
      </form>
      <div style={{ maxWidth: 760, margin: '20px auto 0' }}>
        <MoreAccessRequest assignedStations={stations} />
      </div>
    </PageShell>
  );
}
