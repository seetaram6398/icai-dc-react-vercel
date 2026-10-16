import { useEffect, useState } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';
import { statusText } from '../utils/statusText';

export default function BODDashboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/dashboard/bod')
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner-border" />;

  return (
    <div>
      <h4 className="mb-3">BOD Dashboard</h4>
      <div className="card">
        <div className="card-header fw-semibold">Agenda Status Tracking</div>
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Status</th>
                <th className="text-center">Pending</th>
                <th className="text-center">Scheduled</th>
                <th className="text-center">To Be Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.StatusID}
                  className="clickable"
                  onClick={() => navigate(`/complaints?statusIds=${r.StatusID}`)}
                >
                  <td>{statusText(r.StatusName)}</td>
                  <td className="text-center">{Number(r.Pending) || 0}</td>
                  <td className="text-center">{Number(r.Scheduled) || 0}</td>
                  <td className="text-center">{Number(r.ToBeScheduled) || 0}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center text-muted py-3">No data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}