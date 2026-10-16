import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { statusText } from '../utils/statusText';
import { usePopups } from '../components/Popup';

const TYPE_LABELS = { 1: 'Pending (within limits)', 2: 'About to Expire', 3: 'Expired' };

export default function ReportsMemberStatus() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
      const res = await api.get(`/reports/member-complaint-status?sid=${sid}&type=${type}`);
      setRows(res.data);
      setLoaded(true);
    } catch (e) {
      popup.error(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h4 className="mb-1">My Complaint Status</h4>
      <p className="text-muted mb-3">Status monitoring for your complaints only</p>
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <label className="form-label small fw-semibold">Status</label>
          <select className="form-select" value={sid} onChange={(e) => setSid(e.target.value)}>
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
        <div className="col-md-2 d-flex align-items-end">
          <button className="btn btn-primary w-100" onClick={run} disabled={loading || !sid}>
            {loading ? 'Loading...' : 'Run Report'}
          </button>
        </div>
      </div>

      {loaded && (
        <div className="card">
          <div className="card-header fw-semibold">{TYPE_LABELS[type]}</div>
          <div className="card-body p-0">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Complaint No</th>
                  <th>Respondent</th>
                  <th>Status</th>
                  <th>Entry Date</th>
                  <th className="text-center">Pending Since (days)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.CompID} className="clickable" onClick={() => navigate(`/complaints/${r.CompID}`)}>
                    <td className="fw-semibold">{r.CompNo}</td>
                    <td>{r.ResName || '-'}</td>
                    <td><span className="badge text-bg-primary">{statusText(r.StatusName)}</span></td>
                    <td>{r.EntryDate ? new Date(r.EntryDate).toLocaleDateString() : '-'}</td>
                    <td className="text-center">{r.PendingSince}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan="5" className="text-center text-muted py-4">No complaints found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
