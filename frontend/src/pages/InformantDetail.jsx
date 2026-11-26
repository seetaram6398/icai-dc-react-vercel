import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePopups } from '../components/Popup';
import './Reports.css';

const INFORMATION_UNDER_SCRUTINY_STATUS = 136;
const INFORMATION_DISPOSED_STATUS = 137;

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB');
}

function Field({ label, value }) {
  return (
    <div className="col-md-4 mb-3">
      <div className="small text-muted">{label}</div>
      <div className="fw-semibold">{value || '—'}</div>
    </div>
  );
}

export default function InformantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const popup = usePopups();
  const [data, setData] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [clubTarget, setClubTarget] = useState('');
  const [clubRule, setClubRule] = useState('a');
  const canReview = [1, 16].includes(Number(user?.UserType));

  const load = async () => {
    try {
      const res = await api.get(`/complaints/${id}`);
      setData(res.data);
      setClubTarget(res.data.ClubbedWithCompID ? String(res.data.ClubbedWithCompID) : '');
    } catch (e) {
      popup.error(e?.response?.data?.error || 'Unable to load information record');
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!canReview) return;
    api
      .get('/complaints?informationScope=information')
      .then((res) => setCandidates((res.data || []).filter((c) => String(c.CompID) !== String(id))))
      .catch(() => setCandidates([]));
  }, [canReview, id]);

  const updateStatus = async (statusId, extra = {}, successMessage) => {
    setBusy(true);
    try {
      await api.post(`/complaints/${id}/status`, {
        statusId,
        remarks: successMessage,
        ...extra,
      });
      popup.success(successMessage);
      await load();
    } catch (e) {
      popup.error(e?.response?.data?.error || 'Unable to update information record');
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/complaints/${id}/form/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Information_${data?.CompNo || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      popup.error(e?.response?.data?.error || 'Unable to download information PDF');
    }
  };

  if (!data) {
    return <div className="text-center p-5 text-muted">Loading information record...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <button className="btn btn-outline-secondary btn-sm me-3" onClick={() => navigate('/informant-register')}>
            <i className="bi bi-arrow-left" />
          </button>
          <div className="report-page-icon tone-blue">
            <i className="bi bi-file-earmark-text" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Information {data.CompNo}</h2>
            <p className="page-subtitle">
              Status: <span className="fw-semibold">{data.StatusName || '—'}</span> · Received {formatDate(data.EntryDate)}
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-outline-primary" onClick={downloadPdf}>
            <i className="bi bi-download me-1" />Download Information
          </button>
        </div>
      </div>

      {data.ClubbedWithCompNo && (
        <div className="alert alert-info">
          Clubbed with information {data.ClubbedWithCompNo}
          {data.ClubRule ? ` under Rule 5(4)(${data.ClubRule})` : ''}.
        </div>
      )}

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title"><i className="bi bi-person" />Particulars of Information</div>
        </div>
        <div className="card-body">
          <div className="row">
            <Field label="Informant" value={data.Name} />
            <Field label="Email" value={data.EmailID} />
            <Field label="Mobile" value={data.MobileNo} />
            <Field label="Respondent" value={data.ResName} />
            <Field label="Respondent Registration No" value={data.ResRegistrationNo || data.FirmNo} />
            <Field label="Type of Respondent" value={data.CompTypeName} />
          </div>
          <hr />
          <div className="row">
            <div className="col-md-6 mb-3">
              <div className="small text-muted">Brief Statement of Facts</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.BriefStatement || '—'}</div>
            </div>
            <div className="col-md-6 mb-3">
              <div className="small text-muted">Particulars of Misconduct</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.ParticularMisconduct || '—'}</div>
            </div>
          </div>
          <div className="alert alert-secondary mb-0">Fee Not Applicable for information records.</div>
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title"><i className="bi bi-paperclip" />Documents</div>
        </div>
        <div className="card-body">
          {!(data.documents || []).length ? (
            <p className="text-muted mb-0">No documents recorded.</p>
          ) : (
            <ul className="mb-0">
              {data.documents.map((doc) => (
                <li key={doc.CompAttachID || doc.DocumentID}>{doc.DocumentID || 'Document'}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title"><i className="bi bi-clock-history" />Status History</div>
        </div>
        <div className="card-body p-0">
          <table className="table data-table mb-0">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {(data.statusHistory || []).map((s) => (
                <tr key={s.CompStatusID}>
                  <td>{formatDate(s.StatusDate)}</td>
                  <td>{s.StatusName}</td>
                  <td>{s.Remarks || '—'}</td>
                  <td>{s.ByUserName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canReview && (
        <div className="card ds-card mb-5">
          <div className="card-header">
            <div className="card-title"><i className="bi bi-check2-square" />Info SO Actions</div>
          </div>
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => updateStatus(
                  INFORMATION_UNDER_SCRUTINY_STATUS,
                  {},
                  'Information marked under scrutiny by Info SO'
                )}
              >
                Mark Under Scrutiny
              </button>
              <button
                type="button"
                className="btn btn-success"
                disabled={busy}
                onClick={() => updateStatus(
                  INFORMATION_DISPOSED_STATUS,
                  {},
                  'Information disposed by Info SO'
                )}
              >
                Mark Disposed
              </button>
            </div>
            <hr />
            <h6 className="fw-semibold">Rule 5(4) Clubbing</h6>
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label small fw-semibold">Club with information</label>
                <select className="form-select" value={clubTarget} onChange={(e) => setClubTarget(e.target.value)}>
                  <option value="">--Select--</option>
                  {candidates.map((c) => (
                    <option key={c.CompID} value={c.CompID}>{c.CompNo}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold">Clause</label>
                <select className="form-select" value={clubRule} onChange={(e) => setClubRule(e.target.value)}>
                  <option value="a">a</option>
                  <option value="b">b</option>
                  <option value="c">c</option>
                </select>
              </div>
              <div className="col-md-5 d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={busy || !clubTarget}
                  onClick={() => updateStatus(
                    INFORMATION_UNDER_SCRUTINY_STATUS,
                    { clubbedWithCompId: Number(clubTarget), clubRule },
                    `Information clubbed under Rule 5(4)(${clubRule})`
                  )}
                >
                  Link Information
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy || !data.ClubbedWithCompID}
                  onClick={() => updateStatus(
                    INFORMATION_UNDER_SCRUTINY_STATUS,
                    { clubbedWithCompId: null, clubRule: null },
                    'Information unlinked'
                  )}
                >
                  Unlink
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
