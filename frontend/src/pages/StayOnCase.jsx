import { useEffect, useState } from 'react';
import api from '../api/client';
import { uploadFile } from '../api/upload';
import { statusText } from '../utils/statusText';
import RichEditor from '../components/RichEditor';
import { sanitizeHtml } from '../utils/sanitize';
import { usePopups } from '../components/Popup';
import './Reports.css';

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString('en-GB') : '—';
}

export default function StayOnCase() {
  const [caseOptions, setCaseOptions] = useState([]);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState({ caseNo: '', dateFrom: '', dateTo: '', search: '' });
  const [selected, setSelected] = useState(null);
  const [stayForm, setStayForm] = useState({ stayDate: '', attachment: '', remarks: '' });
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const popup = usePopups();

  useEffect(() => {
    api.get('/masters/24').then((r) => setCaseOptions(r.data)).catch(() => {});
  }, []);

  const setQv = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  const setStay = (k) => (e) => setStayForm({ ...stayForm, [k]: e.target.value });

  const runSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    try {
      const { data } = await api.get(`/stay/search?${params.toString()}`);
      setRows(data);
    } catch (_) {
      popup.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const select = async (compId) => {
    try {
      const { data } = await api.get(`/stay/${compId}`);
      setSelected(data);
      setStayForm({ stayDate: '', attachment: '', remarks: '' });
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to load case');
    }
  };

  const refreshSelected = async () => {
    const { data } = await api.get(`/stay/${selected.CompID}`);
    setSelected(data);
    setStayForm({ stayDate: '', attachment: '', remarks: '' });
  };

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) { popup.warning('Please upload pdf file'); return; }
    if (f.size > 2 * 1024 * 1024) { popup.warning('File size should not be greater than 2mb'); return; }
    try {
      const data = await uploadFile(f, 'stay');
      setStayForm({ ...stayForm, attachment: data.relativePath || data.path });
    } catch (_) {
      popup.error('Upload failed');
    }
  };

  const save = async (action) => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/stay/${selected.CompID}`, { action, ...stayForm });
      popup.success(action === 'remove' ? 'Stay removed from case successfully' : 'Stay marked on case successfully');
      await refreshSelected();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to update stay');
    } finally {
      setSaving(false);
    }
  };

  const isStayed = Number(selected?.IsStay) === 1;

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-amber">
            <i className="bi bi-shield-lock" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Mark Stay on Case</h2>
            <p className="page-subtitle">Search a complaint and put / remove a stay order with remarks and attachment</p>
          </div>
        </div>
        <div className="page-header-actions">
          <span className="badge-soft badge-soft-neutral">
            <i className="bi bi-collection" /> {rows.length} result{rows.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-funnel" />
            Search Cases
          </div>
        </div>
        <div className="card-body">
          <form className="row g-3 align-items-end" onSubmit={runSearch}>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Case No</label>
              <select className="form-select" value={q.caseNo} onChange={setQv('caseNo')}>
                <option value="">All</option>
                {caseOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Date From</label>
              <input type="date" className="form-control" value={q.dateFrom} onChange={setQv('dateFrom')} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">To</label>
              <input type="date" className="form-control" value={q.dateTo} onChange={setQv('dateTo')} />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Search</label>
              <input className="form-control" value={q.search} onChange={setQv('search')} placeholder="Complaint no, complainant, respondent..." />
            </div>
            <div className="col-md-2 d-flex gap-2">
              <button type="submit" className="btn btn-primary flex-fill" disabled={searching}>
                {searching ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                    Searching...
                  </>
                ) : (
                  <>
                    <i className="bi bi-search me-1" />Search
                  </>
                )}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => { setQ({ caseNo: '', dateFrom: '', dateTo: '', search: '' }); setRows([]); setSelected(null); }} title="Clear">
                <i className="bi bi-x-circle" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-people" />
            Search Results
          </div>
          <span className="badge-soft badge-soft-primary">{rows.length} shown</span>
        </div>
        <div className="card-body p-0">
          {rows.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-inbox" />
              <h6>No cases found</h6>
              <p>Use the search filters above to find a case.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Complaint No</th>
                    <th>Complainant Name</th>
                    <th>Type of Respondent</th>
                    <th>Respondent Name / Firm Name</th>
                    <th>Membership / Firm No.</th>
                    <th>Date of Receipt</th>
                    <th>Current Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.CompID}>
                      <td><span className="badge-soft badge-soft-neutral">{r.FormType || '—'}</span></td>
                      <td className="fw-semibold col-num" style={{ color: 'var(--ds-accent)' }}>{r.CompNo}</td>
                      <td className="fw-semibold">{r.Name || '—'}</td>
                      <td className="text-muted">{r.CompTypeName || '—'}</td>
                      <td className="text-muted">{r.ResName || '—'}</td>
                      <td className="text-muted col-num">{r.ResRegistrationNo || '—'}</td>
                      <td className="text-muted col-num">{fmtDate(r.EntryDate)}</td>
                      <td><span className="badge-soft badge-soft-primary">{statusText(r.StatusName) || '—'}</span></td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => select(r.CompID)}>
                          <i className="bi bi-eye me-1" />Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="card ds-card">
          <div className="card-header">
            <div className="card-title">
              <i className="bi bi-info-circle" />
              Stay Details — {selected.CompNo}
            </div>
            {isStayed ? (
              <span className="badge-soft badge-soft-danger">
                <i className="bi bi-shield-lock me-1" />Stay Active
              </span>
            ) : (
              <span className="badge-soft badge-soft-success">
                <i className="bi bi-shield-check me-1" />No Stay
              </span>
            )}
          </div>
          <div className="card-body">
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Complainant Name</label>
                <div className="text-muted">{selected.Name || '—'}</div>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Respondent Name / Firm Name</label>
                <div className="text-muted">{selected.NameofFirm || selected.ResName || '—'}</div>
              </div>
            </div>

            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Date</label>
                <input type="date" className="form-control" value={stayForm.stayDate} onChange={setStay('stayDate')} />
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Attachment (PDF)</label>
                <input type="file" className="form-control" accept=".pdf" onChange={onUpload} />
                <small className="text-muted" style={{ fontSize: 11 }}>Max 2 MB</small>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => save('put')} disabled={saving || isStayed}>
                    {saving ? 'Saving...' : <><i className="bi bi-lock me-1" />Put Stay</>}
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => save('remove')} disabled={saving || !isStayed}>
                    <i className="bi bi-unlock me-1" />Remove Stay
                  </button>
                </div>
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold">Remarks</label>
                <RichEditor value={stayForm.remarks} onChange={(v) => setStay('remarks')({ target: { value: v } })} />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 fw-semibold small text-uppercase" style={{ color: 'var(--ds-accent)' }}>
                <i className="bi bi-clock-history me-1" />Stay History
              </div>
              <div className="table-responsive">
                <table className="table data-table mb-0">
                  <thead>
                    <tr>
                      <th>Sr. No.</th>
                      <th>Case No</th>
                      <th>Stay Date</th>
                      <th>Remarks</th>
                      <th>Attachment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.history.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center text-muted py-3">No stay details recorded for this case.</td>
                      </tr>
                    ) : (
                      selected.history.map((h, i) => (
                        <tr key={h.SDID}>
                          <td className="text-muted col-num">{i + 1}</td>
                          <td className="fw-semibold col-num">{h.CaseNo || '—'}</td>
                          <td className="text-muted col-num">{fmtDate(h.StayDate)}</td>
                          <td className="text-muted rich-remark" dangerouslySetInnerHTML={{ __html: sanitizeHtml(h.Remarks) || '—' }} />
                          <td>
                            {h.FilePath ? (
                              <a className="btn btn-sm btn-outline-primary" href={`/documents/${h.FilePath}`} target="_blank" rel="noreferrer">
                                <i className="bi bi-download me-1" />Download
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}