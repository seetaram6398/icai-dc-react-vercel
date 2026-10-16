import { useEffect, useState } from 'react';
import api from '../api/client';

function formatTime(t) {
  if (!t) return '-';
  const parts = String(t).split(':');
  if (parts.length === 2) {
    const h = Number(parts[0]);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h % 12) || 12)}:${m} ${ampm}`;
  }
  return new Date(`1970-01-01T${t}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HearingList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/hearings')
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h4 className="mb-3">Hearings</h4>
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
          ) : (
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Complaint No</th>
                  <th>Respondent</th>
                  <th>Hearing Date</th>
                  <th>Time</th>
                  <th>Venue</th>
                  <th>Mode</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.CauseListID}>
                    <td className="fw-semibold">{h.CompNo}</td>
                    <td>{h.ResName || '-'}</td>
                    <td>{h.CauseDate ? new Date(h.CauseDate).toLocaleDateString() : '-'}</td>
                    <td>{formatTime(h.CauseTime)}</td>
                    <td>{h.Place || '-'}</td>
                    <td>
                      {h.IsOnline ? (
                        <span className="badge text-bg-info">Online</span>
                      ) : (
                        <span className="badge text-bg-secondary">Offline</span>
                      )}
                    </td>
                    <td>
                      {h.IsAdjour ? (
                        <span className="badge text-bg-warning">Adjourned</span>
                      ) : h.IsAccept ? (
                        <span className="badge text-bg-success">Complainant Accepted</span>
                      ) : h.IsAcceptResp ? (
                        <span className="badge text-bg-success">Respondent Accepted</span>
                      ) : (
                        <span className="badge text-bg-light text-dark border">Scheduled</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan="7" className="text-center text-muted py-4">No hearings scheduled</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}