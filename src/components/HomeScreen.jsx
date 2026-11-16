import ThemeSwitch from './ui/ThemeSwitch';
import Avatar from './ui/Avatar';

// Home: one picture card per module the signed-in person can open. A badge on a
// card is work waiting there (open Start/End tasks, cards to review).
//
// `counts`: { openTasks, toReview, awaitingReview } - any may be missing.

const BUS = n => (n === 1 ? '/Bus background.png' : `/Bus background ${n}.png`);

function Card({ name, what, onClick, img, tint, count = null, tag = null, theme }) {
  const picture = Array.isArray(img) ? img[theme === 'dark' ? 0 : 1] : img;
  return (
    <button type="button" className="kmc-home-card" onClick={onClick}
      style={{ backgroundImage: `url('${picture}'), linear-gradient(135deg, ${tint} 0%, #101623 100%)` }}>
      {count && <span className="count">{count}</span>}
      {tag && <span className="tag">{tag}</span>}
      <span className="shade">
        <span className="name">{name}</span>
        <span className="what">{what}</span>
      </span>
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

  const cards = [
    { name: 'Travel Card', what: 'Start a station job or file a card', onClick: onSelectTravelCard, img: [BUS(1), BUS(3)], tint: '#d6177a',
      count: openTasks ? plural(openTasks, 'open task') : null },
    canAccessTracker && { name: 'Bus Tracker', what: 'Line tracker, reports, dashboard', onClick: onSelectTracker, img: [BUS(2), BUS(4)], tint: '#6b1fb0' },
    isGeneralUser && onSelectMySubmissions && { name: 'My Submissions', what: 'Status of the cards you filed', onClick: onSelectMySubmissions, img: [BUS(4), BUS(2)], tint: '#0e7490',
      count: awaitingReview ? `${awaitingReview} awaiting review` : null },
    (isSupervisor || isSystemAdmin) && onSelectPendingReviews && { name: 'Pending Reviews', what: 'Cards waiting for your decision', onClick: onSelectPendingReviews, img: [BUS(3), BUS(1)], tint: '#92400e',
      count: toReview ? `${toReview} to review` : null },
    (isSupervisor || isSystemAdmin) && onSelectDailyFleetLog && { name: 'Daily Fleet Log', what: 'Log where each bus is', onClick: onSelectDailyFleetLog, img: [BUS(3), BUS(1)], tint: '#10b981' },
    onSelectShopFloor && { name: 'Shop Floor', what: 'Open tasks and running clocks', onClick: onSelectShopFloor, img: [BUS(1), BUS(2)], tint: '#16a34a' },
    onSelectJobOrders && { name: 'Job Orders', what: 'Machine Shop cut lists and machines', onClick: onSelectJobOrders, img: '/Job order bg.webp', tint: '#b45309' },
    onSelectTypeApprovals && { name: 'VIN Register', what: "Upload a project's VINs", onClick: onSelectTypeApprovals, img: [BUS(4), BUS(3)], tint: '#4338ca' },
    hasCeeAccess && onSelectCostEstimation && { name: 'Cost Estimation', what: 'Machines, rates, cost report', onClick: onSelectCostEstimation, img: [BUS(4), BUS(2)], tint: '#0f766e' },
    isSystemAdmin && onSelectAccessRequests && { name: 'Access Requests', what: 'Grant access to new people', onClick: onSelectAccessRequests, img: [BUS(4), BUS(2)], tint: '#1e3a5f' },
    isSystemAdmin && onSelectUserManagement && { name: 'User Management', what: 'Roles, stations, access rights', onClick: onSelectUserManagement, img: [BUS(1), BUS(3)], tint: '#7c3aed' },
    isSystemAdmin && { name: 'DPN Scoreboard', what: 'IMS objectives and KPIs', onClick: onSelectScoreboard, img: [BUS(2), BUS(4)], tint: '#7a1417', tag: 'In development' },
    isSystemAdmin && { name: 'Shift Handover', what: 'Log, acknowledge, flags', onClick: onSelectHandover, img: [BUS(3), BUS(1)], tint: '#b8860b', tag: 'In development' },
  ].filter(Boolean);

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

      <header style={{ textAlign: 'center' }}>
        <img src={logo} alt="Kiira Motors Corporation" style={{ height: 48, width: 'auto' }} />
        <h1 className="kmc-title" style={{ margin: '10px 0 0' }}>Bus Production Tracker</h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {firstName ? `Signed in as ${firstName}.` : 'Choose where to go.'}
        </div>
      </header>

      <div className="kmc-home-cards">
        {cards.map(c => <Card key={c.name} theme={theme} {...c} />)}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', marginTop: 28 }}>
        Kiira Motors Corporation, {new Date().getFullYear()}
      </div>
    </div>
  );
}
