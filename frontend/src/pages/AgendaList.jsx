import { useEffect, useState } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function AgendaList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [statusId, setStatusId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/agenda${statusId ? `?statusId=${statusId}` : ''}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusId]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Agenda</h4>
        <button className="btn btn-primary" onClick={() => navigate('/agenda/generate')}>
          <i className="bi bi-calendar-plus me-1"></i>Generate Agenda
        </button>
      </div>

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
                  <th>Meeting No</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Place</th>
                  <th>Status</th>
                  <th className="text-center">Days</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.AjendaID} className="clickable" onClick={() => navigate(`/complaints/${a.CompID}`)}>
                    <td className="fw-semibold">{a.CompNo}</td>
                    <td>{a.ResName || '-'}</td>
                    <td>{a.MeetingNo || '-'}</td>
                    <td>{a.ADate ? new Date(a.ADate).toLocaleDateString() : '-'}</td>
                    <td>{a.ATime || '-'}</td>
                    <td>{a.Place || '-'}</td>
                    <td>
                      {a.IsApproved === 1 ? (
                        <span className="badge text-bg-success">Approved</span>
                      ) : a.SecretaryApprove === 1 ? (
                        <span className="badge text-bg-primary">Secretary Approved</span>
                      ) : (
                        <span className="badge text-bg-warning">Pending</span>
                      )}
                    </td>
                    <td className="text-center">{a.DaysRemaining}d</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan="8" className="text-center text-muted py-4">No agenda items</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}