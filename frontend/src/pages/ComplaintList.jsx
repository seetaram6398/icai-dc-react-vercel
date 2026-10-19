import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { uploadFile } from '../api/upload';
import { useAuth } from '../context/AuthContext';
import { statusText } from '../utils/statusText';
import RichEditor from '../components/RichEditor';
import { usePopups } from '../components/Popup';
import './Reports.css';

function statusTone(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('dispose') || n.includes('closed') || n.includes('punish')) return 'badge-soft-success';
  if (n.includes('expired') || n.includes('adjourn')) return 'badge-soft-warning';
  if (n.includes('non-actionable') || n.includes('clos')) return 'badge-soft-neutral';
  return 'badge-soft-primary';
}

function daysTone(days) {
  if (days > 60) return 'badge-soft-danger';
  if (days > 30) return 'badge-soft-warning';
  return 'badge-soft-success';
}

const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
const MAX_SIZE = 512000;

function ComplaintList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState([]);
  const ut = Number(user?.UserType);
  const aspxView = ut === 3;
  const statusIds = searchParams.get('statusIds') || '';
  const [draft, setDraft] = useState(statusIds);
  const [q, setQ] = useState({ search: '', dateFrom: '', dateTo: '' });

  const [assignComp, setAssignComp] = useState(null);
  const [assignRemarks, setAssignRemarks] = useState('');
  const [assignFile, setAssignFile] = useState(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignSOId, setAssignSOId] = useState('');
  const [soMembers, setSoMembers] = useState([]);
  const popup = usePopups();

  useEffect(() => setDraft(statusIds), [statusIds]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusIds) params.set('statusIds', statusIds);
    if (ut === 3) params.set('complainantId', user.UserID);
    if (ut === 2) params.set('respondentFor', user.Email);
    if (q.search) params.set('search', q.search);
    if (q.dateFrom) params.set('dateFrom', q.dateFrom);
    if (q.dateTo) params.set('dateTo', q.dateTo);
    setLoading(true);
    api
      .get(`/complaints?${params.toString()}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusIds, q.search, q.dateFrom, q.dateTo, ut, user?.UserID]);

  useEffect(() => {
    api.get('/masters/12').then((res) => setStatuses(res.data || [])).catch(() => {});
    api.get('/masters/6?option1=5').then((res) => setSoMembers(res.data || [])).catch(() => {});
  }, []);

  const applyFilter = (ids = draft) => {
    const params = new URLSearchParams();
    if (ids) params.set('statusIds', ids);
    setSearchParams(params);
  };

  const handleClear = () => {
    setDraft('');
    setQ({ search: '', dateFrom: '', dateTo: '' });
    applyFilter('');
  };

  const viewComplaint = (c) => {
    if (String(c.IsStay) === '1') {
      popup.warning('Complaint is on Stay...');
      return;
    }
    navigate(`/complaints/${c.CompID}`);
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (statusIds) params.set('statusIds', statusIds);
    if (q.search) params.set('search', q.search);
    if (q.dateFrom) params.set('dateFrom', q.dateFrom);
    if (q.dateTo) params.set('dateTo', q.dateTo);
    try {
      const res = await api.get(`/complaints/export?${params.toString()}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Complaint_Data_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      popup.error('Export failed. Please try again.');
    }
  };

  const openAssign = (c) => {
    setAssignComp(c);
    setAssignRemarks('');
    setAssignFile(null);
    setAssignSOId('');
    setAssignMsg('');
  };

  const closeAssign = () => {
    if (!assignBusy) setAssignComp(null);
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    if (!assignComp) return;
    if (ut === 4 && !assignSOId) {
      setAssignMsg('Please select an SO member.');
      return;
    }
    if (assignFile) {
      const ext = assignFile.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        setAssignMsg('Please upload PDF or Word or Excel file...');
        return;
      }
      if (assignFile.size > MAX_SIZE) {
        setAssignMsg('File size should not be greater than 500kb...');
        return;
      }
    }
    setAssignBusy(true);
    setAssignMsg('');
    try {
      let attachment = null;
      if (assignFile) {
        const up = await uploadFile(assignFile, 'ddtoSO');
        attachment = up.path || up.filename || null;
      }
      await api.post(`/complaints/${assignComp.CompID}/status`, {
        statusId: 2,
        userToId: ut === 4 ? Number(assignSOId) : undefined,
        remarks: assignRemarks || null,
        attachment,
      });
      popup.success('Assigned To SO Successfully...');
      setAssignComp(null);
      applyFilter(statusIds);
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed To Assign. Please try again.');
    } finally {
      setAssignBusy(false);
    }
  };

  const activeStatusName = statuses.find((s) => String(s.value) === statusIds);

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-blue">
            <i className="bi bi-file-earmark-text" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Complaint Register</h2>
            <p className="page-subtitle">
              Browse all registered complaints and their current stage of processing
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <span className="header-date">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <span className="badge-soft badge-soft-neutral">
            <i className="bi bi-collection" /> {rows.length} complaint{rows.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="admin-btn-icon"
            title="Refresh data"
            aria-label="Refresh data"
            onClick={() => applyFilter(statusIds)}
          >
            <i className="bi bi-arrow-clockwise" />
          </button>
          {ut === 10 && (
            <button type="button" className="btn btn-outline-primary" onClick={exportCsv}>
              <i className="bi bi-file-earmark-excel me-1" />Export CSV
            </button>
          )}
          {ut === 1 && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/file-complaint')}>
              <i className="bi bi-plus-circle me-1" />File New Complaint
            </button>
          )}
        </div>
      </div>

      {/* Stat summary strip */}
      {!loading && rows.length > 0 && (
        <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="stat-box" style={{ borderLeft: '3px solid #1a4a8a' }}>
            <div className="stat-box-icon" style={{ background: '#e8effa', color: '#1a4a8a' }}>
              <i className="bi bi-file-earmark-text" />
            </div>
            <div>
              <div className="stat-box-value">{rows.length.toLocaleString('en-IN')}</div>
              <div className="stat-box-label">Total Shown</div>
            </div>
          </div>
          <div className="stat-box" style={{ borderLeft: '3px solid #16a34a' }}>
            <div className="stat-box-icon" style={{ background: '#e5f6ec', color: '#16a34a' }}>
              <i className="bi bi-person-check" />
            </div>
            <div>
              <div className="stat-box-value">{rows.filter((r) => String(r.IsStay) !== '1').length.toLocaleString('en-IN')}</div>
              <div className="stat-box-label">Live Cases</div>
            </div>
          </div>
          <div className="stat-box" style={{ borderLeft: '3px solid #d97706' }}>
            <div className="stat-box-icon" style={{ background: '#fdf3e0', color: '#d97706' }}>
              <i className="bi bi-pause-circle" />
            </div>
            <div>
              <div className="stat-box-value">{rows.filter((r) => String(r.IsStay) === '1').length.toLocaleString('en-IN')}</div>
              <div className="stat-box-label">On Stay</div>
            </div>
          </div>
          <div className="stat-box" style={{ borderLeft: '3px solid #6d28d9' }}>
            <div className="stat-box-icon" style={{ background: '#ede9fe', color: '#6d28d9' }}>
              <i className="bi bi-cash-stack" />
            </div>
            <div>
              <div className="stat-box-value" style={{ fontSize: '1.15rem' }}>
                ₹{rows.reduce((s, r) => s + (Number(r.TaxableAmount) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div className="stat-box-label">Fee Collected</div>
            </div>
          </div>
        </div>
      )}

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-funnel" />
            Filter Complaints
          </div>
          <span className="badge-soft badge-soft-neutral">
            {statusIds && activeStatusName ? `Showing: ${statusText(activeStatusName.label)}` : 'All stages'}
          </span>
        </div>
        <div className="card-body">
          <form className="row g-3 align-items-end" onSubmit={(e) => { e.preventDefault(); applyFilter(draft.replace(/\s/g, '')); }}>
            <div className="col-md-3">
              <label className="form-label small fw-semibold">Search</label>
              <input
                className="form-control"
                placeholder="Complainant / Respondent / Comp No / Email / Reg..."
                value={q.search}
                onChange={(e) => setQ((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Date From</label>
              <input
                type="date"
                className="form-control"
                value={q.dateFrom}
                onChange={(e) => setQ((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">To</label>
              <input
                type="date"
                className="form-control"
                value={q.dateTo}
                onChange={(e) => setQ((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Status</label>
              <select
                className="form-select"
                value={activeStatusName ? statusIds : ''}
                onChange={(e) => { setDraft(e.target.value); applyFilter(e.target.value); }}
              >
                <option value="">All Statuses</option>
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>{statusText(s.label)}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3 d-flex gap-2 justify-content-md-end">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <i className={`${loading ? 'spinner-border spinner-border-sm me-1' : 'bi bi-search me-1'}`} role="status" aria-hidden="true" />
                {loading ? 'Loading...' : 'Apply'}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={handleClear}>
                <i className="bi bi-x-circle me-1" />Clear
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card ds-card">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-file-earmark-text" />
            {activeStatusName ? statusText(activeStatusName.label) : 'All Complaints'}
          </div>
          <span className="badge-soft badge-soft-primary">{rows.length} shown</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div className="text-muted mt-2" style={{ fontSize: '0.85rem' }}>Loading complaints...</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-inbox" />
              <h6 className="fw-semibold mt-2 mb-1">No complaints found</h6>
              <p className="mb-0">Try a different status or clear the filters.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    {aspxView ? (
                      <>
                        <th>#</th>
                        <th>Type</th>
                        <th>Complaint No</th>
                        <th>Type of Respondant</th>
                        <th>Respondent Name/Firm Name</th>
                        <th>Membership No./Firm No.</th>
                        <th>Date of Receipt of Complaint (dd/MM/yyyy)</th>
                        <th>Fee Paid</th>
                        <th>Action</th>
                      </>
                    ) : (
                      <>
                        <th>Complaint No</th>
                        <th>Complainant</th>
                        <th>Respondent</th>
                        <th>Type of Respondent</th>
                        <th>Date of Receipt</th>
                        <th className="text-center">Days Since Receipt</th>
                        <th className="text-end">Fee Paid</th>
                        <th>Current Status</th>
                        <th className="text-end" style={{ width: 140 }}>Action</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {aspxView ? (
                    rows.map((c, i) => (
                      <tr key={c.CompID} onClick={() => viewComplaint(c)} style={{ cursor: 'pointer' }}>
                        <td className="text-muted">{i + 1}</td>
                        <td className="text-muted">{c.FormType || '—'}</td>
                        <td className="fw-semibold col-num">{c.CompNo}</td>
                        <td className="text-muted">{c.CompTypeName || '—'}</td>
                        <td className="fw-semibold">
                          {c.ResName || '—'}
                          {c.IsFirm ? <div className="small text-muted">{c.NameofFirm || ''}</div> : null}
                        </td>
                        <td className="text-muted">{c.ResRegistrationNo || c.FirmNo || '—'}</td>
                        <td className="text-muted col-num">{c.EntryDate ? new Date(c.EntryDate).toLocaleDateString('en-GB') : '—'}</td>
                        <td className="text-end col-num">
                          {c.TaxableAmount != null
                            ? `₹${Number(c.TaxableAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="text-end" onClick={(e) => e.stopPropagation()}>
                          <div className="d-flex justify-content-end gap-1">
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => viewComplaint(c)}>
                              <i className="bi bi-eye" /> View
                            </button>
                            {Number(c.StatusID) === 3 && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => navigate(`/file-complaint?edit=${c.CompID}`)}
                                title="Defect communicated to you - edit your complaint"
                              >
                                <i className="bi bi-pencil" /> Rectify
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    rows.map((c) => (
                    <tr key={c.CompID} onClick={() => viewComplaint(c)} style={{ cursor: 'pointer' }}>
                      <td className="fw-semibold text-muted col-num">{c.CompNo}</td>
                      <td>
                        <div className="fw-semibold">{c.ComplainantName || '—'}</div>
                        {c.MobileNo ? <div className="small text-muted">{c.MobileNo}</div> : null}
                      </td>
                      <td>
                        <div className="fw-semibold">{c.ResName || '—'}</div>
                        {c.IsFirm ? <div className="small text-muted">{c.FirmNo}</div> : null}
                      </td>
                      <td className="text-muted">{c.CompTypeName || '—'}</td>
                      <td className="text-muted col-num">{c.EntryDate ? new Date(c.EntryDate).toLocaleDateString('en-GB') : '—'}</td>
                      <td className="text-center">
                        <span className={`badge-soft ${daysTone(Number(c.DaysSinceEntry))}`}>{c.DaysSinceEntry ? `${c.DaysSinceEntry}d` : '—'}</span>
                      </td>
                      <td className="text-end col-num">
                        {c.TaxableAmount != null
                          ? `₹${Number(c.TaxableAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td>
                        <span className={`badge-soft ${statusTone(c.StatusName)}`}>
                          {c.StatusName}
                          {String(c.IsStay) === '1' && <i className="bi bi-pause-circle ms-1" title="Stay" />}
                        </span>
                      </td>
                      <td className="text-end" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => viewComplaint(c)}>
                          <i className="bi bi-eye" /> View
                        </button>
                        {[4, 10].includes(ut) && (
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openAssign(c)}>
                            <i className="bi bi-send" /> Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
                {!aspxView && (
                <tfoot>
                  <tr>
                    <td colSpan="7">Total</td>
                    <td />
                    <td className="text-center fw-bold" style={{ fontSize: '1rem' }}>{rows.length}</td>
                  </tr>
                </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>

      {assignComp && (
        <>
          <div className="modal-backdrop show" onClick={closeAssign} />
          <div className="modal show d-block" role="dialog" tabIndex="-1" onMouseDown={(e) => { if (e.target === e.currentTarget) closeAssign(); }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <form onSubmit={submitAssign}>
                  <div className="modal-header">
                    <h5 className="modal-title">Assign To SO</h5>
                    <button type="button" className="btn-close" onClick={closeAssign} aria-label="Close" />
                  </div>
                  <div className="modal-body">
                    <p className="mb-3 text-muted">
                      Complaint: <strong>{assignComp.CompNo}</strong> — {assignComp.ResName || assignComp.ComplainantName}
                    </p>
                    {ut === 4 && (
                      <div className="mb-3">
                        <label className="form-label small fw-semibold">Select SO Member</label>
                        <select className="form-select" value={assignSOId} onChange={(e) => setAssignSOId(e.target.value)} required>
                          <option value="">--Select SO--</option>
                          {soMembers.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">Remarks</label>
                      <RichEditor value={assignRemarks} onChange={setAssignRemarks} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">Attachment (PDF / Word / Excel, max 500kb)</label>
                      <input
                        type="file"
                        className="form-control"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => setAssignFile(e.target.files[0] || null)}
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-light" onClick={closeAssign}>Close</button>
                    <button type="submit" className="btn btn-primary" disabled={assignBusy}>
                      {assignBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                      Assign To SO
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ComplaintList;