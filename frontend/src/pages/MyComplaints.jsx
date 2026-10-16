import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { statusText } from '../utils/statusText';

function MyComplaints() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusIds, setStatusIds] = useState(searchParams.get('statusIds') || '');

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusIds) params.set('statusIds', statusIds);
    params.set('complainantId', user.UserID);
    api
      .get(`/complaints?${params.toString()}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusIds, user?.UserID]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">My Complaints</h4>
          <small className="text-muted">Complaints filed by you</small>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/file-complaint')}>
          <i className="bi bi-plus-circle me-1"></i>{Number(user?.UserType) === 3 ? 'Add New Complaint' : 'File New Complaint'}
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
                  <th>Type</th>
                  <th>Status</th>
                  <th>Entry Date</th>
                  <th className="text-center">Days</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.CompID} className="clickable" onClick={() => navigate(`/complaints/${c.CompID}`)}>
                    <td className="fw-semibold">{c.CompNo}</td>
                    <td>{c.ResName} {c.IsFirm ? `(${c.FirmNo})` : ''}</td>
                    <td>{c.CompTypeName || '-'}</td>
                    <td><span className="badge text-bg-primary">{statusText(c.StatusName)}</span></td>
                    <td>{c.EntryDate ? new Date(c.EntryDate).toLocaleDateString() : '-'}</td>
                    <td className="text-center">
                      <span className={`badge ${Number(c.DaysSinceEntry) > 30 ? 'text-bg-danger' : 'text-bg-success'}`}>
                        {c.DaysSinceEntry}d
                      </span>
                    </td>
                    <td className="text-end" onClick={(e) => e.stopPropagation()}>
                      {Number(c.StatusID) === 3 && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => navigate(`/file-complaint?edit=${c.CompID}`)}
                          title="Defect communicated to you - edit your complaint"
                        >
                          <i className="bi bi-pencil me-1"></i>Rectify
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan="7" className="text-center text-muted py-4">
                      <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2rem' }} />
                      No complaints filed yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyComplaints;
