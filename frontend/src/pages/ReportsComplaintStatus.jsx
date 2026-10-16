import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { statusText } from '../utils/statusText';
import { usePopups } from '../components/Popup';
import './Reports.css';

const TYPE_LABELS = { 1: 'Pending (Within Limits)', 2: 'About to Expire', 3: 'Expired' };
const TYPE_ICONS = { 1: 'bi-clock-history', 2: 'bi-exclamation-triangle', 3: 'bi-x-octagon' };

export default function ReportsComplaintStatus() {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState([]);
  const [sid, setSid] = useState('');
  const [type, setType] = useState('1');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const popup = usePopups();

  useEffect(() => {
    api.get('/masters/12').then((res) => setStatuses(res.data)).catch(() => {});
  }, []);

  const run = async () => {
    if (!sid) return;
    setLoading(true);
    try {
      const res = await api.get(`/reports/complaint-status?sid=${sid}&type=${type}`);
      setRows(res.data);
      setLoaded(true);
    } catch (e) {
      popup.error(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const activeStatus = statuses.find((s) => String(s.value) === sid);
  const sumDays = rows.reduce((s, r) => s + (Number(r.PendingSince) || 0), 0);
  const avgDays = rows.length ? Math.round(sumDays / rows.length) : 0;

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-blue">
            <i className="bi bi-clipboard-data" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">MIS Reports — Complaint Status</h2>
            <p className="page-subtitle">
              Monitor complaints under a status by their pending time bucket
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          {loaded && (
            <span className="badge-soft badge-soft-primary">
              <i className="bi bi-collection" /> {rows.length} complaints
            </span>
          )}
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-sliders" />
            Report Criteria
          </div>
        </div>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-5">
              <label className="form-label small fw-semibold">Complaint Status</label>
              <select className="form-select" value={sid} onChange={(e) => { setSid(e.target.value); setLoaded(false); }}>
                <option value="">Select status</option>
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>{statusText(s.label)}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Time Bucket</label>
              <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="1">Pending (within limits)</option>
                <option value="2">About to Expire</option>
                <option value="3">Expired</option>
              </select>
            </div>
            <div className="col-md-3 d-flex gap-2 justify-content-md-end">
              <button className="btn btn-primary flex-fill" onClick={run} disabled={loading || !sid}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                    Loading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-play-fill me-1" />Run Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loaded && (
        <>
          {rows.length > 0 && (
            <div className="stat-row">
              <div className="stat-box" style={{ borderLeft: '3px solid #1a4a8a' }}>
                <div className="stat-box-icon" style={{ background: '#e8effa', color: '#1a4a8a' }}>
                  <i className={TYPE_ICONS[type]} />
                </div>
                <div>
                  <div className="stat-box-value">{rows.length.toLocaleString('en-IN')}</div>
                  <div className="stat-box-label">{TYPE_LABELS[type]}</div>
                </div>
              </div>
              <div className="stat-box" style={{ borderLeft: '3px solid #d97706' }}>
                <div className="stat-box-icon" style={{ background: '#fdf3e0', color: '#d97706' }}>
                  <i className="bi bi-hourglass-split" />
                </div>
                <div>
                  <div className="stat-box-value">{avgDays.toLocaleString('en-IN')}<span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--ds-text-muted)' }}> days</span></div>
                  <div className="stat-box-label">Avg Pending</div>
                </div>
              </div>
              <div className="stat-box" style={{ borderLeft: '3px solid #16a34a' }}>
                <div className="stat-box-icon" style={{ background: '#e5f6ec', color: '#16a34a' }}>
                  <i className="bi bi-tag" />
                </div>
                <div>
                  <div className="stat-box-value" style={{ fontSize: '1.05rem', lineHeight: 1.3 }}>{activeStatus?.label || '-'}</div>
                  <div className="stat-box-label">Reported Status</div>
                </div>
              </div>
            </div>
          )}

          <div className="card ds-card">
            <div className="card-header">
              <div className="card-title">
                <i className={`bi ${TYPE_ICONS[type]}`} />
                {activeStatus ? `${statusText(activeStatus.label)} — ` : ''}{TYPE_LABELS[type]}
              </div>
              <span className={`badge-soft badge-soft-${type === '1' ? 'success' : type === '2' ? 'warning' : 'danger'}`}>
                {rows.length} complaints
              </span>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table data-table mb-0">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Complaint No</th>
                      <th>Respondent</th>
                      <th>Nature of Allegation</th>
                      <th>Nature Details</th>
                      <th>Entry Date</th>
                      <th className="text-center">Pending Since (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={r.CompID} className="clickable" onClick={() => navigate(`/complaints/${r.CompID}`)}>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{idx + 1}</td>
                        <td className="fw-semibold col-num" style={{ color: 'var(--ds-accent)' }}>{r.CompNo}</td>
                        <td className="fw-semibold">{r.ResName || '—'}</td>
                        <td>{r.NatureOfAllegation || '—'}</td>
                        <td className="text-muted">{r.NatureDatails || '—'}</td>
                        <td className="text-muted col-num">{r.EntryDate ? new Date(r.EntryDate).toLocaleDateString('en-GB') : '—'}</td>
                        <td className="text-center">
                          <span className={`badge-soft ${Number(r.PendingSince) > 60 ? 'badge-soft-danger' : Number(r.PendingSince) > 30 ? 'badge-soft-warning' : 'badge-soft-success'}`}>
                            {r.PendingSince}d
                          </span>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan="7">
                          <div className="empty-state">
                            <i className="bi bi-inbox" />
                            <h6>No complaints in this bucket</h6>
                            <p>Try a different time bucket or status.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan="6">Total</td>
                        <td className="text-center fw-bold">{rows.length}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}