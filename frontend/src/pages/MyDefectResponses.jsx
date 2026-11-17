import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { statusText } from '../utils/statusText';

function fileIcon(url = '') {
  const ext = (url.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'bi-file-image';
  if (['pdf'].includes(ext)) return 'bi-file-earmark-pdf';
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'bi-film';
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'bi-music-note';
  return 'bi-file-earmark';
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function MyDefectResponses() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/complaints/my-defect-responses')
      .then((res) => setRows(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">My Defect Responses</h4>
          <small className="text-muted">The value you submitted against each defect, per complaint</small>
        </div>
        <span className="badge-soft badge-soft-neutral">
          {rows.length} response{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="card ds-card">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-inbox" />
              <h6 className="fw-semibold mt-2 mb-1">No defect responses yet</h6>
              <p className="mb-0">Responses you submit against a communicated defect will appear here.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    <th>Complaint No</th>
                    <th>Defect</th>
                    <th>Your response</th>
                    <th>Document</th>
                    <th>Responded on</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ComplaintDefectID}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 fw-semibold"
                          onClick={() => navigate(`/complaints/${r.CompID}`)}
                        >
                          {r.CompNo}
                        </button>
                        <div className="small text-muted">{statusText(r.StatusName)}</div>
                      </td>
                      <td>
                        <div className="small">{r.DefectText}</div>
                        {r.RelevantColumn ? <div className="small text-muted">{r.RelevantColumn}</div> : null}
                      </td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{r.ResponseRemark || '—'}</td>
                      <td>
                        {r.ResponseAttachment ? (
                          <a
                            href={`/documents/${r.ResponseAttachment}`}
                            target="_blank"
                            rel="noreferrer"
                            className="doc-chip"
                          >
                            <i className={`bi ${fileIcon(r.ResponseAttachment)}`} />
                            <span className="doc-name">View</span>
                          </a>
                        ) : '—'}
                      </td>
                      <td className="text-muted col-num">{fmtDate(r.RespondedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyDefectResponses;
