import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './admin.css';

const ROLE_LABELS = {
  1: 'Admin',
  2: 'ICAI Member',
  3: 'Non-Member',
  4: 'DD',
  5: 'SO',
  6: 'BOD',
  7: 'Officer',
  8: 'Regulator',
  10: 'RO',
  11: 'CAE',
  13: 'Working Officer',
};

const PAGE_LABELS = {
  '/dashboard': 'Dashboard',
  '/': 'Dashboard',
  '/bod-dashboard': 'BOD Dashboard',
  '/complaints': 'View Complaints',
  '/my-complaints': 'My Complaints',
  '/withdrawal/update': 'Withdrawal of Complaint',
  '/file-complaint': 'File Complaint',
  '/agenda': 'Agenda',
  '/agenda/generate': 'Generate Agenda',
  '/hearings': 'Hearings',
  '/hearings/new': 'New Hearing',
  '/boards': 'Board Formation',
  '/master-data': 'Master Data',
  '/reports/ageing': 'Ageing of Cases',
  '/reports/stage': 'Stage Wise Bifurcation',
  '/reports/complaint-status': 'MIS Reports',
  '/reports/payment-details': 'Payment Details',
  '/reports/member-complaint-status': 'My Complaint Status',
  '/reports/member-ageing': 'My Complaint Ageing',
  '/decision': 'Mark Decision',
  '/stay-on-cases': 'Mark Stay On Cases',
};

const DISPOSAL_STATUSES = {
  4: '5,10,17,24,25,31,49,55,66,68,69,70,84',
  5: '2,4,8,13,14,15,16,20,23,26,28,29,30,32,33,34,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,68,69,70,78,123,131,132',
  6: '79,80,81,82,84,95,96,97,98,99,100,111,112,113,114,115,116,117,118',
  7: '27,28,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,70,131,132',
  10: '27,49,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,131,132',
};

const FULL_UT = [1, 4];
const VIEW_UT = [1, 3, 4, 5, 6, 7, 8, 10, 11, 13];
const REPORTS_UT = [1, 4, 5, 6, 7, 8, 10];
const MGMT_UT = [1, 4]; // Master Data / Board Formation / Agenda Generate are withheld from BOD (legacy Role 6 has none)
const MY_COMPLAINTS_UT = [1, 2, 3, 4];
const MEMBER_REPORTS_UT = [1, 2, 4];
const FILE_UT = [1, 2, 3, 4];

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({ viewComplaints: true, fileComplaint: true });
  const ut = Number(user?.UserType);
  const roleLabel = ROLE_LABELS[ut] || `Role ${ut}`;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const link = (to, label, icon) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/' || to === '/dashboard'}
      className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
      onClick={() => setMenuOpen(false)}
    >
      <i className={`bi bi-${icon}`} />
      <span>{label}</span>
    </NavLink>
  );

  const toggleGroup = (id) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const navGroup = (id, label, icon, children) => {
    const isOpen = openGroups[id];
    return (
      <div key={id} className={`admin-nav-group${isOpen ? ' open' : ''}`}>
        <button type="button" className="admin-nav-toggle" onClick={() => toggleGroup(id)}>
          <i className={`bi bi-${icon}`} />
          <span>{label}</span>
          <i className="bi bi-chevron-down nav-caret" />
        </button>
        {isOpen && <div className="admin-nav-sub">{children}</div>}
      </div>
    );
  };

  const subLink = (to, label) => {
    const hasStatus = to.includes('statusIds=');
    const isActive =
      location.pathname === '/complaints' &&
      (hasStatus ? location.search.includes('statusIds=') : !location.search.includes('statusIds='));
    return (
      <button
        key={to}
        type="button"
        className={`admin-nav-subitem${isActive ? ' active' : ''}`}
        onClick={() => {
          navigate(to);
          setMenuOpen(false);
        }}
      >
        {label}
      </button>
    );
  };

  const fileFormSubLink = (type, label) => {
    const isActive = location.pathname === '/file-complaint' && new URLSearchParams(location.search).get('type') === type;
    return (
      <button
        key={type}
        type="button"
        className={`admin-nav-subitem${isActive ? ' active' : ''}`}
        onClick={() => {
          navigate(`/file-complaint?type=${type}`);
          setMenuOpen(false);
        }}
      >
        {label}
      </button>
    );
  };

  const pageTitle = Object.keys(PAGE_LABELS)
    .sort((a, b) => b.length - a.length)
    .find((k) => location.pathname === k || location.pathname.startsWith(k + '/'));
  const fileComplaintLabel = ut === 4 ? 'Suo Moto' : ut === 2 || ut === 3 ? 'Add New Complaint' : 'File Complaint';
  const currentLabel = pageTitle === '/file-complaint'
    ? fileComplaintLabel
    : (pageTitle ? PAGE_LABELS[pageTitle] : 'Home');

  return (
    <div className="admin-app">
      {/* Dark sidebar */}
      <aside className={`admin-sidebar${menuOpen ? ' open' : ''}`}>
        <div className="admin-brand">
          <span className="admin-brand-icon">
            <i className="bi bi-bank" />
          </span>
          <div>
            <strong>ICAI Disciplinary Directorate</strong>
            <small>Case Management</small>
          </div>
        </div>

        <nav className="admin-nav">
          <div className="admin-nav-section">Main Menu</div>
          {link('/dashboard', 'Dashboard', 'speedometer2')}

          {ut === 4 && (
            <>
              {navGroup(
                'ddViewComplaints',
                'View Complaints',
                'store',
                <>
                  {subLink('/complaints', 'All')}
                  {subLink(`/complaints?statusIds=${DISPOSAL_STATUSES[4]}`, 'Disposal')}
                </>
              )}

              {navGroup(
                'ddMasters',
                'Masters',
                'store',
                <>
                  {link('/master-data?type=13', 'Council Year', 'calendar3')}
                  {link('/boards', 'Board Formation', 'people')}
                  {link('/boards', 'Board Members', 'people-fill')}
                </>
              )}

              {navGroup(
                'ddReports',
                'Reports',
                'store',
                <>
                  {link('/reports/complaint-status', 'MIS Reports', 'list-check')}
                  {navGroup(
                    'ddStatistic',
                    'Statistic Report',
                    'bar-chart-line',
                    <>
                      {link('/reports/stage', 'Stage Wise Bifurcation', 'diagram-3')}
                      {link('/reports/ageing', 'Ageing of Cases', 'clock-history')}
                    </>
                  )}
                  {link('/reports/payment-details', 'Payment Details', 'credit-card')}
                </>
              )}

              {navGroup(
                'ddSuoMoto',
                'Suo Moto',
                'megaphone',
                <>
                  {fileFormSubLink('A', 'Form A')}
                </>
              )}
            </>
          )}

          {ut === 3 && link('/file-complaint?type=I', fileComplaintLabel, 'plus-square')}

          {ut !== 4 && (
            <>
              {VIEW_UT.includes(ut) &&
                navGroup(
                  'viewComplaints',
                  ut === 11 ? 'Complaints' : 'View Complaints',
                  'file-earmark-text',
                  <>
                    {subLink('/complaints', ut === 11 ? 'All Complaints' : 'All')}
                    {ut === 3 && subLink('/complaints?statusIds=3', 'Pending for Modification')}
                    {ut === 3 && subLink('/withdrawal/update', 'Withdrawal of Complaint')}
                    {DISPOSAL_STATUSES[ut] && subLink(`/complaints?statusIds=${DISPOSAL_STATUSES[ut]}`, 'Disposal')}
                  </>
                )}

              {ut === 5 && (
                <>
                  <div className="admin-nav-section">SO Actions</div>
                  {link('/decision', 'Mark Decision', 'balance-scale')}
                  {link('/stay-on-cases', 'Mark Stay On Cases', 'shield-lock')}
                </>
              )}

              {REPORTS_UT.includes(ut) && (
                <>
                  <div className="admin-nav-section">Reports</div>
                  {link('/reports/complaint-status', 'MIS Reports', 'list-check')}
                  {navGroup(
                    'statistics',
                    'Statistic Report',
                    'bar-chart-line',
                    <>
                      {link('/reports/stage', 'Stage Wise Bifurcation', 'diagram-3')}
                      {link('/reports/ageing', 'Ageing of Cases', 'clock-history')}
                    </>
                  )}
                  {link('/reports/payment-details', 'Payment Details', 'credit-card')}
                </>
              )}

              {ut === 8 && (
                <>
                  <div className="admin-nav-section">Hearing</div>
                  {link('/hearings', 'Hearing Details', 'camera-video')}
                  {link('/hearings/new', 'Hearing Generate', 'camera-reels')}
                </>
              )}

              {FULL_UT.concat(6).includes(ut) && link('/bod-dashboard', 'BOD Dashboard', 'person-badge')}

              {FILE_UT.includes(ut) && ut !== 3 &&
                (ut === 1
                  ? link('/file-complaint', fileComplaintLabel, 'plus-square')
                  : navGroup(
                        'fileComplaint',
                        fileComplaintLabel,
                        'plus-square',
                        <>
                          {fileFormSubLink('I', 'Form I')}
                        </>
                      ))}

              {MY_COMPLAINTS_UT.includes(ut) && ut !== 3 && link('/my-complaints', 'My Complaints', 'person-lines-fill')}

              {MEMBER_REPORTS_UT.includes(ut) && (
                <>
                  <div className="admin-nav-section">Member Reports</div>
                  {link('/reports/member-complaint-status', 'My Complaint Status', 'bar-chart-line')}
                  {link('/reports/member-ageing', 'My Complaint Ageing', 'clock-history')}
                </>
              )}

              {MGMT_UT.includes(ut) && (
                <>
                  <div className="admin-nav-section">Management</div>
                  {link('/agenda', 'Agenda', 'calendar3')}
                  {link('/agenda/generate', 'Generate Agenda', 'calendar-plus')}
                  {link('/hearings', 'Hearings', 'camera-video')}
                  {link('/boards', 'Board Formation', 'people')}
                </>
              )}

              {MGMT_UT.includes(ut) && (
                <>
                  <div className="admin-nav-section">Administration</div>
                  {link('/master-data', 'Master Data', 'database')}
                </>
              )}
            </>
          )}
        </nav>

        <div className="admin-sidebar-footer">
          <span>
            <i className="bi bi-lock me-1" />
            Secure Portal
          </span>
          <span>v1.0</span>
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={`admin-overlay${menuOpen ? ' show' : ''}`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Main area */}
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="menu-toggle d-lg-none"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <i className="bi bi-list fs-5" />
          </button>

          <div className="topbar-breadcrumb">
            <ol>
              <li>Home</li>
              <li>{currentLabel}</li>
            </ol>
          </div>

          <div className="topbar-user">
            <div className="user-chip">
              <span className="user-avatar">{initials(user?.NameOfTheUser)}</span>
              <div className="user-meta">
                <div className="user-name">{user?.NameOfTheUser}</div>
                <div className="user-role">{roleLabel}</div>
              </div>
            </div>
            <button type="button" className="topbar-logout" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right" />
              Logout
            </button>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}