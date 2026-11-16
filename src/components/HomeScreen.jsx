import ThemeSwitch from './ui/ThemeSwitch';
import Avatar from './ui/Avatar';

// Home: every module the signed-in person can open, as a plain list grouped by
// the job it belongs to. A count on a row is work waiting there (open Start/End
// tasks, cards to review); amber means someone is waiting on this person.
//
// `counts`: { openTasks, toReview, awaitingReview } - any may be missing.

function Row({ name, what, onClick, count = null, due = false }) {
  return (
    <button type="button" className="kmc-home-row" onClick={onClick}>
      <span className="txt">
        <span className="name" style={{ display: 'block' }}>{name}</span>
        <span className="what" style={{ display: 'block' }}>{what}</span>
      </span>
      {count && <span className={`count${due ? ' due' : ''}`}>{count}</span>}
      <svg className="go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function HomeScreen({
  onSelectTravelCard, onSelectTracker, onSelectHandover, onSelectScoreboard, onSelectPendingReviews,
  onSelectAccessRequests, onSelectUserManagement, onSelectDailyFleetLog, onSelectCostEstimation,
  onSelectMySubmissions, onSelectTypeApprovals = null, onSelectJobOrders = null, onSelectShopFloor = null,
  onSelectSettings = null, userName = '', username = '', userPhoto = '', onLogout, theme, toggleTheme,
  role, canAccessTracker = true, hasCeeAccess = false, counts = {},
}) {
  const logo = theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png';
  const isSystemAdmin = role === 'systemadmin';
  const isSupervisor = role === 'supervisor';
  const isGeneralUser = role === 'user';
  const { openTasks = 0, toReview = 0, awaitingReview = 0 } = counts;

  const groups = [
    {
      title: 'Daily work',
      rows: [
        { name: 'Travel Card', what: 'Start a station job, or file a card for work already done', onClick: onSelectTravelCard,
          count: openTasks ? plural(openTasks, 'open task') : null, due: true },
        canAccessTracker && { name: 'Bus Tracker', what: 'Line tracker, reports and dashboard', onClick: onSelectTracker },
        isGeneralUser && onSelectMySubmissions && { name: 'My Submissions', what: 'Cards you filed, their status, and edits before review', onClick: onSelectMySubmissions,
          count: awaitingReview ? `${awaitingReview} awaiting review` : null },
      ],
    },
    {
      title: 'Supervision',
      rows: [
        (isSupervisor || isSystemAdmin) && onSelectPendingReviews && { name: 'Pending Reviews', what: 'Cards waiting for your decision', onClick: onSelectPendingReviews,
          count: toReview ? `${toReview} to review` : null, due: true },
        (isSupervisor || isSystemAdmin) && onSelectDailyFleetLog && { name: 'Daily Fleet Log', what: 'Log where each bus is, as a check on the cards', onClick: onSelectDailyFleetLog },
        onSelectShopFloor && { name: 'Shop Floor', what: 'Who is working where: open tasks and running clocks', onClick: onSelectShopFloor },
        onSelectJobOrders && { name: 'Job Orders', what: 'Machine Shop cut lists and machines', onClick: onSelectJobOrders },
      ],
    },
    {
      title: 'Registers and costing',
      rows: [
        onSelectTypeApprovals && { name: 'VIN Register', what: "Upload a project's VINs from a CSV", onClick: onSelectTypeApprovals },
        hasCeeAccess && onSelectCostEstimation && { name: 'Cost Estimation', what: 'Machines, rates and the cost report', onClick: onSelectCostEstimation },
      ],
    },
    {
      title: 'Administration',
      rows: [
        isSystemAdmin && onSelectAccessRequests && { name: 'Access Requests', what: 'Grant system access to people who asked', onClick: onSelectAccessRequests },
        isSystemAdmin && onSelectUserManagement && { name: 'User Management', what: 'Roles, stations and access rights', onClick: onSelectUserManagement },
      ],
    },
    {
      title: 'In development (system admin only)',
      rows: [
        isSystemAdmin && { name: 'DPN Scoreboard', what: 'IMS objectives and live production KPIs', onClick: onSelectScoreboard },
        isSystemAdmin && { name: 'Shift Handover', what: 'Log, acknowledge, safety and quality flags', onClick: onSelectHandover },
      ],
    },
  ].map(g => ({ ...g, rows: g.rows.filter(Boolean) })).filter(g => g.rows.length);

  const firstName = String(userName || '').trim().split(/\s+/)[0];

  return (
    <div className="home-screen kmc-home">
      <div className="kmc-home-top">
        {toggleTheme && <ThemeSwitch theme={theme} onToggle={toggleTheme} />}
        {onSelectSettings && (
          <button type="button" className="kmc-btn" style={{ padding: '3px 12px 3px 4px' }} onClick={onSelectSettings}
            aria-label="Settings: my account" title={userName || username || 'My account'}>
            <Avatar photo={userPhoto} name={userName} username={username} size={26} />
            <span className="hide-xs">Settings</span>
          </button>
        )}
        {onLogout && <button type="button" className="kmc-btn" onClick={onLogout}>Sign out</button>}
      </div>

      <header style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <img src={logo} alt="Kiira Motors Corporation" style={{ height: 44, width: 'auto' }} />
        <div style={{ minWidth: 0 }}>
          <h1 className="kmc-title" style={{ margin: 0 }}>Bus Production Tracker</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {firstName ? `Signed in as ${firstName}.` : 'Choose where to go.'}
            {toReview > 0 && (isSupervisor || isSystemAdmin) ? ` ${plural(toReview, 'card')} waiting for review.` : ''}
            {openTasks > 0 ? ` ${plural(openTasks, 'task')} still open.` : ''}
          </div>
        </div>
      </header>

      {groups.map(g => (
        <section key={g.title} className="kmc-home-group">
          <h2>{g.title}</h2>
          <div className="kmc-panel kmc-home-list">
            {g.rows.map(r => <Row key={r.name} {...r} />)}
          </div>
        </section>
      ))}

      <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', marginTop: 28 }}>
        Kiira Motors Corporation, {new Date().getFullYear()}
      </div>
    </div>
  );
}
