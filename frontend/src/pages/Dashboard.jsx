import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import './Reports.css';
import { statusText, SUB_STAGE_OPTIONS } from '../utils/statusText';

function statusClass(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('dispose') || n.includes('closed') || n.includes('punish')) return 'success';
  if (n.includes('expired') || n.includes('adjourn')) return 'warning';
  return 'primary';
}

function badgeTone(cls) {
  if (cls === 'success') return 'badge-soft-success';
  if (cls === 'warning') return 'badge-soft-warning';
  if (cls === 'danger') return 'badge-soft-danger';
  return 'badge-soft-primary';
}

const STATUS_STAGES = SUB_STAGE_OPTIONS;

const EMPTY_FILTERS = {
  dateFrom: '',
  dateTo: '',
  subStatus: '',
  compTypeId: '',
  isFirm: '',
  statusId: '',
  stayOnly: false,
  suoMoto: false,
};

function filterCount(f) {
  return Object.entries(f).filter(([, v]) =>
    typeof v === 'boolean' ? v : String(v).trim() !== ''
  ).length;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compTypes, setCompTypes] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const ut = Number(user?.UserType);

  const fetchDashboard = (f) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (f.dateFrom) p.set('dateFrom', f.dateFrom);
    if (f.dateTo) p.set('dateTo', f.dateTo);
    if (f.subStatus) p.set('subStatus', f.subStatus);
    if (f.compTypeId) p.set('compTypeId', f.compTypeId);
    if (f.isFirm !== '') p.set('isFirm', f.isFirm);
    if (f.statusId) p.set('statusId', f.statusId);
    if (f.stayOnly) p.set('stayOnly', '1');
    if (f.suoMoto) p.set('suoMoto', '1');
    const qs = p.toString();
    const endpoint = ut === 2 || ut === 3 ? '/dashboard/member' : '/dashboard';
    api
      .get(`${endpoint}${qs ? `?${qs}` : ''}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboard(filters);
    api.get('/masters/2').then((res) => setCompTypes(res.data || [])).catch(() => {});
    api.get('/masters/12').then((res) => setStatuses(res.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = rows.reduce((s, r) => s + (Number(r.Pending) || 0) + (Number(r.AboutToExpire) || 0) + (Number(r.Expired) || 0), 0);
  const totalPending = rows.reduce((s, r) => s + (Number(r.Pending) || 0), 0);
  const totalAbout = rows.reduce((s, r) => s + (Number(r.AboutToExpire) || 0), 0);
  const totalExpired = rows.reduce((s, r) => s + (Number(r.Expired) || 0), 0);

  useEffect(() => {
    if (ut === 6) navigate('/bod-dashboard', { replace: true });
  }, [ut, navigate]);

  const set = (k) => (e) => setFilters((prev) => ({ ...prev, [k]: e.target.value }));

  const handleClear = () => {
    setFilters(EMPTY_FILTERS);
    fetchDashboard(EMPTY_FILTERS);
  };

  const activeFilters = filterCount(filters);

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-blue">
            <i className="bi bi-speedometer2" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Complaint Dashboard</h2>
            <p className="page-subtitle">
              Welcome back, {user?.NameOfTheUser || 'User'}. Here is the current status of registered complaints.
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <span className="header-date">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          {activeFilters > 0 && (
            <span className="badge-soft badge-soft-primary">
              <i className="bi bi-funnel-fill" /> {activeFilters} filter{activeFilters > 1 ? 's' : ''} applied
            </span>
          )}
          <button
            type="button"
            className="admin-btn-icon"
            title="Refresh data"
            aria-label="Refresh data"
            onClick={() => fetchDashboard(filters)}
          >
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      </div>

      {/* Stat summary cards */}
      {!loading && rows.length > 0 && (
        <div className="stat-row">
          <div className="stat-box" style={{ borderLeft: '3px solid #1a4a8a' }}>
            <div className="stat-box-icon" style={{ background: '#e8effa', color: '#1a4a8a' }}>
              <i className="bi bi-folder2-open" />
            </div>
            <div>
              <div className="stat-box-value">{total.toLocaleString('en-IN')}</div>
              <div className="stat-box-label">Total Complaints</div>
            </div>
          </div>
          <div className="stat-box" style={{ borderLeft: '3px solid #16a34a' }}>
            <div className="stat-box-icon" style={{ background: '#e5f6ec', color: '#16a34a' }}>
              <i className="bi bi-clock-history" />
            </div>
            <div>
              <div className="stat-box-value">{totalPending.toLocaleString('en-IN')}</div>
              <div className="stat-box-label">In Progress</div>
            </div>
          </div>
          <div className="stat-box" style={{ borderLeft: '3px solid #d97706' }}>
            <div className="stat-box-icon" style={{ background: '#fdf3e0', color: '#d97706' }}>
              <i className="bi bi-exclamation-triangle" />
            </div>
            <div>
              <div className="stat-box-value">{totalAbout.toLocaleString('en-IN')}</div>
              <div className="stat-box-label">About To Expire</div>
            </div>
          </div>
          <div className="stat-box" style={{ borderLeft: '3px solid #dc2626' }}>
            <div className="stat-box-icon" style={{ background: '#fdecec', color: '#dc2626' }}>
              <i className="bi bi-x-octagon" />
            </div>
            <div>
              <div className="stat-box-value">{totalExpired.toLocaleString('en-IN')}</div>
              <div className="stat-box-label">No Action Taken</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter panel */}
      <div className="card ds-card mb-4">
        <div
          className="card-header"
          style={{ cursor: 'pointer' }}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <div className="card-title">
            <i className="bi bi-funnel" />
            Case Search &amp; Filters
            {activeFilters > 0 && (
              <span className="badge-soft badge-soft-primary ms-2" style={{ fontSize: '0.68rem' }}>
                {activeFilters} active
              </span>
            )}
          </div>
          <i className={`bi bi-chevron-${filtersOpen ? 'up' : 'down'}`} style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem' }} />
        </div>
        {filtersOpen && (
          <div className="card-body">
            <div className="filter-grid">
              <div className="filter-field">
                <label className="form-label">Date of Receipt of Complaint</label>
                <input type="date" className="form-control" value={filters.dateFrom} onChange={set('dateFrom')} />
              </div>
              <div className="filter-field">
                <label className="form-label">Complaint Date To</label>
                <input type="date" className="form-control" value={filters.dateTo} onChange={set('dateTo')} />
              </div>
              <div className="filter-field">
                <label className="form-label">Status</label>
                <select className="form-select" value={filters.subStatus} onChange={set('subStatus')}>
                  <option value="">All Stages</option>
                  {STATUS_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label className="form-label">Type of Complaint</label>
                <select className="form-select" value={filters.compTypeId} onChange={set('compTypeId')}>
                  <option value="">All Types</option>
                  {compTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label className="form-label">Complaint against</label>
                <select className="form-select" value={filters.isFirm} onChange={set('isFirm')}>
                  <option value="">All</option>
                  <option value="0">Individual</option>
                  <option value="1">Firm</option>
                </select>
              </div>
              <div className="filter-field">
                <label className="form-label">Complaint Status</label>
                <select className="form-select" value={filters.statusId} onChange={set('statusId')}>
                  <option value="">All Statuses</option>
                  {statuses.map((s) => (
                    <option key={s.value} value={s.value}>{statusText(s.label)}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field filter-checks">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="stayFilter"
                    checked={filters.stayOnly}
                    onChange={(e) => setFilters((prev) => ({ ...prev, stayOnly: e.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="stayFilter">
                    <i className="bi bi-pause-circle me-1" style={{ color: '#d97706' }} />Show Stay Complaints
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="suoMotoFilter"
                    checked={filters.suoMoto}
                    onChange={(e) => setFilters((prev) => ({ ...prev, suoMoto: e.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="suoMotoFilter">
                    <i className="bi bi-megaphone me-1" style={{ color: '#6d28d9' }} />Suo Moto Cases
                  </label>
                </div>
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2 flex-wrap mt-3 pt-3" style={{ borderTop: '1px solid var(--ds-border)' }}>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClear}>
                <i className="bi bi-x-circle me-1" />Clear All
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => fetchDashboard(filters)}
                disabled={loading}
              >
                <i className={`${loading ? 'spinner-border spinner-border-sm me-1' : 'bi bi-funnel me-1'}`} role="status" aria-hidden="true" />
                {loading ? 'Loading...' : 'Apply Filters'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary table */}
      {loading ? (
        <div className="card ds-card">
          <div className="card-body text-center p-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <div className="text-muted mt-2" style={{ fontSize: '0.85rem' }}>Loading complaint data...</div>
          </div>
        </div>
      ) : (
        <div className="card ds-card">
          <div className="card-header">
            <div className="card-title">
              <i className="bi bi-bar-chart-line" />
              Complaint Status Summary
            </div>
            <span className="badge-soft badge-soft-neutral">{rows.length} statuses</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    <th className="text-center" style={{ width: 56 }}>SR.No.</th>
                    <th>Status Name</th>
                    <th className="text-center">In Progress</th>
                    <th className="text-center">About To Expire</th>
                    <th className="text-center">No Action Taken</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                      <tr key={r.StatusID} onClick={() => navigate(`/complaints?statusIds=${r.StatusID}`)}>
                        <td className="text-center text-muted" style={{ fontSize: '0.8rem' }}>{idx + 1}</td>
                        <td>
                          <span className={`badge-soft ${badgeTone(statusClass(r.StatusName))}`}>{statusText(r.StatusName)}</span>
                        </td>
                        <td className="text-center col-num">{Number(r.Pending) || 0}</td>
                        <td className="text-center col-num">{Number(r.AboutToExpire) || 0}</td>
                        <td className="text-center col-num">{Number(r.Expired) || 0}</td>
                      </tr>
                    ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan="5">
                        <div className="empty-state">
                          <i className="bi bi-inbox" />
                          <h6>No data available</h6>
                          <p>Try clearing or adjusting the filters above.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan="2" style={{ fontWeight: 700, fontSize: '0.88rem' }}>Total</td>
                      <td className="text-center fw-bold">{totalPending}</td>
                      <td className="text-center fw-bold">{totalAbout}</td>
                      <td className="text-center fw-bold">{totalExpired}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
