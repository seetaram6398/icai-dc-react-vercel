import { useEffect, useState } from 'react';
import api from '../api/client';
import { uploadFile } from '../api/upload';
import { usePopups } from '../components/Popup';
import './Reports.css';

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString('en-GB') : '—';
}

const PRESENCE_LABELS = { 0: 'Self', 1: 'Other' };

export default function CourtDecision() {
  const [cases, setCases] = useState([]);
  const [decisionOptions, setDecisionOptions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    causeListId: '',
    meetingNo: '',
    presence: '0',
    presenceDetails: '',
    direction: '',
    decision: '',
    attachment: '',
  });
  const popup = usePopups();

  const loadDecisions = () =>
    api.get('/decisions').then((r) => setDecisions(r.data)).catch(() => {});

  useEffect(() => {
    api.get('/masters/22').then((r) => setCases(r.data)).catch(() => {});
    api.get('/masters/23?option1=1').then((r) => setDecisionOptions(r.data)).catch(() => {});
    Promise.all([api.get('/decisions')])
      .then(([d]) => setDecisions(d.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onCaseChange = async (e) => {
    const id = e.target.value;
    setForm({ ...form, causeListId: id, decision: '' });
    if (!id) return;
    try {
      const { data } = await api.get(`/decisions/hearing-type/${id}`);
      const dtype = data.HearingType === 'Hearing' ? 1 : 2;
      const r = await api.get(`/masters/23?option1=${dtype}`);
      setDecisionOptions(r.data);
    } catch (_) {}
  };

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) { popup.warning('Please upload pdf file'); return; }
    if (f.size > 2 * 1024 * 1024) { popup.warning('File size should not be greater than 2mb'); return; }
    try {
      const data = await uploadFile(f, 'decision');
      setForm({ ...form, attachment: data.relativePath || data.path });
    } catch (_) {
      popup.error('Upload failed');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.causeListId) { popup.warning('Please select Case No'); return; }
    if (!form.presenceDetails) { popup.warning('Please enter Presence Details'); return; }
    if (!form.direction) { popup.warning('Please enter Direction'); return; }
    if (!form.decision) { popup.warning('Please select Decision'); return; }
    setSaving(true);
    try {
      await api.post('/decisions', form);
      popup.success('Decision marked successfully');
      setForm({ causeListId: '', meetingNo: '', presence: '0', presenceDetails: '', direction: '', decision: '', attachment: '' });
      loadDecisions();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to mark decision');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-purple">
            <i className="bi bi-balance-scale" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Court Decision</h2>
            <p className="page-subtitle">Mark decision on a hearing — case, direction, decision and attachment</p>
          </div>
        </div>
        <div className="page-header-actions">
          <span className="badge-soft badge-soft-neutral">
            <i className="bi bi-collection" /> {decisions.length} record{decisions.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-pencil-square" />
            Mark Decision
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={submit}>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Case No *</label>
                <select className="form-select" value={form.causeListId} onChange={onCaseChange}>
                  <option value="">-- Select --</option>
                  {cases.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Meeting No.</label>
                <input className="form-control" value={form.meetingNo} onChange={set('meetingNo')} placeholder="e.g. 1/2026" />
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Presence</label>
                <select className="form-select" value={form.presence} onChange={set('presence')}>
                  <option value="0">Self</option>
                  <option value="1">Other</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Presence Details *</label>
                <textarea className="form-control" rows="3" value={form.presenceDetails} onChange={set('presenceDetails')} />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Direction *</label>
                <textarea className="form-control" rows="3" value={form.direction} onChange={set('direction')} />
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Decision *</label>
                <select className="form-select" value={form.decision} onChange={set('decision')}>
                  <option value="">-- Select --</option>
                  {decisionOptions.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Attachment (PDF)</label>
                <input type="file" className="form-control" accept=".pdf" onChange={onUpload} />
                <small className="text-muted" style={{ fontSize: 11 }}>Max 2 MB</small>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle me-1" />Mark Decision
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card ds-card">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-clock-history" />
            Decision History
          </div>
          <span className="badge-soft badge-soft-primary">{decisions.length} shown</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : decisions.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-inbox" />
              <h6>No decisions recorded</h6>
              <p>Mark a decision using the form above.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    <th>Sr. No.</th>
                    <th>Case No</th>
                    <th>Meeting No.</th>
                    <th>Presence</th>
                    <th>Direction</th>
                    <th>Decision</th>
                    <th>Attachment</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d, i) => (
                    <tr key={d.DecisionID}>
                      <td className="text-muted col-num">{i + 1}</td>
                      <td className="fw-semibold" style={{ color: 'var(--ds-accent)' }}>{d.CompNo || `#${d.CauseListID}`}</td>
                      <td className="text-muted">{d.MeetingNo || '—'}</td>
                      <td className="text-muted">{PRESENCE_LABELS[d.Presence] ?? d.Presence}</td>
                      <td className="text-muted">{d.Direction || '—'}</td>
                      <td className="fw-semibold">{d.Decision || '—'}</td>
                      <td>
                        {d.Attachment ? (
                          <a className="btn btn-sm btn-outline-primary" href={`/documents/${d.Attachment}`} target="_blank" rel="noreferrer">
                            <i className="bi bi-paperclip me-1" />View
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
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