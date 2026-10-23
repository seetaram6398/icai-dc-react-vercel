import { useState } from 'react';
import api from '../api/client';
import { uploadFile } from '../api/upload';
import RichEditor from '../components/RichEditor';
import { usePopups } from '../components/Popup';

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function fmtMoney(v) {
  return v != null && v !== '' ? `₹ ${Number(v).toLocaleString('en-IN')}` : '—';
}

/**
 * Complainant end - "Withdrawal of Complaint".
 *
 * The complainant enters the complaint number he wants to update. Once the
 * complaint is found every detail of the complaint is shown and the letter of
 * withdrawal (Rule 6) is attached at the end of the screen. A complaint that
 * has already been clubbed or closed cannot be withdrawn.
 */
export default function ComplaintWithdrawalUpdate() {
  const popup = usePopups();
  const [compNo, setCompNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [complaint, setComplaint] = useState(null);
  const [wdFile, setWdFile] = useState(null);
  const [wdRemarks, setWdRemarks] = useState('');
  const [wdBusy, setWdBusy] = useState(false);

  const searchComplaint = async (e) => {
    e.preventDefault();
    const no = compNo.trim();
    if (!no) {
      popup.warning('Enter the complaint number for which you want to update.');
      return;
    }
    setLoading(true);
    setComplaint(null);
    try {
      const res = await api.get('/complaints/lookup', { params: { compNo: no } });
      setComplaint(res.data);
      if (res.data?.isClubbedOrClosed) {
        popup.warning('Withdrawal is not available for a complaint that has already been clubbed or closed.');
      } else if (!res.data?.canWithdraw) {
        popup.warning('Withdrawal is not available at this stage of the complaint.');
      }
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Could not find the complaint. Please check the complaint number.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setComplaint(null);
    setWdFile(null);
    setWdRemarks('');
  };

  const submitWithdrawal = async (e) => {
    e.preventDefault();
    if (!complaint) return;
    if (!wdFile) {
      popup.warning('Please attach the letter of withdrawal.');
      return;
    }
    const ext = wdFile.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') {
      popup.warning('Only .pdf file format supported.');
      return;
    }
    if (wdFile.size > 20 * 1024 * 1024) {
      popup.warning('Total File Size should be less than 20 MB.');
      return;
    }
    if (!wdRemarks.trim()) {
      popup.warning('Please enter the reason for withdrawal.');
      return;
    }
    setWdBusy(true);
    try {
      const up = await uploadFile(wdFile, 'withdrawal');
      const attachment = up.path || up.filename || null;
      // `from=<status>` records the stage the complaint must return to if the
      // Board of Discipline / Committee declines the withdrawal.
      await api.post(`/complaints/${complaint.CompID}/status`, {
        statusId: 127,
        remarks: `${wdRemarks.trim()} - Letter of withdrawal received`,
        attachment,
        commonField: `Rule 6 | from=${Number(complaint.StatusID)}`,
      });
      popup.success(
        'Letter of withdrawal received. The Director Discipline will place it before the Board of Discipline / Committee.'
      );
      resetForm();
      setCompNo('');
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to submit the letter of withdrawal. Please try again.');
    } finally {
      setWdBusy(false);
    }
  };

  const canWithdraw = complaint && !complaint.isClubbedOrClosed && complaint.canWithdraw;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title mb-0">Withdrawal of Complaint</h2>
          <p className="page-subtitle">
            Enter the complaint number for which you want to update the withdrawal
          </p>
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-search" />
            Search Complaint
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={searchComplaint}>
            <div className="row g-2 align-items-end">
              <div className="col-md-9">
                <label className="form-label small fw-semibold">
                  Enter the complaint number for which you want to update <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  placeholder="e.g. PR/001/2026"
                  value={compNo}
                  onChange={(e) => setCompNo(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-search me-1" />Process
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {complaint && (
        <>
          <div className="card ds-card mb-4">
            <div className="card-header">
              <div className="card-title">
                <i className="bi bi-file-earmark-text" />
                Complaint Details
              </div>
              <span className="badge-soft badge-soft-neutral">{complaint.CompNo}</span>
            </div>
            <div className="card-body">
              <dl className="row mb-0">
                <dt className="col-sm-4">Complaint No</dt>
                <dd className="col-sm-8">
                  <span className="fw-semibold">{complaint.CompNo}</span>
                </dd>
                <dt className="col-sm-4">Complaint Type</dt>
                <dd className="col-sm-8">{complaint.CompTypeName || '—'}</dd>
                <dt className="col-sm-4">Complainant</dt>
                <dd className="col-sm-8">{complaint.ComplainantName || '—'}</dd>
                <dt className="col-sm-4">Respondent</dt>
                <dd className="col-sm-8">{complaint.ResName || '—'}</dd>
                <dt className="col-sm-4">Registration / Firm No</dt>
                <dd className="col-sm-8">{complaint.ResRegistrationNo || '—'}</dd>
                <dt className="col-sm-4">Current Status</dt>
                <dd className="col-sm-8">{complaint.StatusName || '—'}</dd>
                <dt className="col-sm-4">Date of Receipt</dt>
                <dd className="col-sm-8">{fmtDate(complaint.EntryDate)}</dd>
                <dt className="col-sm-4">Taxable Amount</dt>
                <dd className="col-sm-8">{fmtMoney(complaint.TaxableAmount)}</dd>
                <dt className="col-sm-4">Clubbed / Closed With</dt>
                <dd className="col-sm-8">{complaint.ClubbedWithCompNo || '—'}</dd>
              </dl>

              {complaint.isClubbedOrClosed && (
                <div className="alert alert-warning small mt-3 mb-0">
                  <i className="bi bi-exclamation-triangle me-1" />
                  This complaint has already been clubbed / closed. A withdrawal cannot be registered against it.
                </div>
              )}
              {!complaint.isClubbedOrClosed && !complaint.canWithdraw && (
                <div className="alert alert-warning small mt-3 mb-0">
                  <i className="bi bi-exclamation-triangle me-1" />
                  Withdrawal is not available at the present stage of this complaint.
                </div>
              )}
            </div>
          </div>

          <div className="card ds-card mb-4">
            <div className="card-header">
              <div className="card-title">
                <i className="bi bi-box-arrow-right" />
                Withdrawal of Complaint
              </div>
            </div>
            <div className="card-body">
              {!canWithdraw ? (
                <div className="text-muted small">
                  The withdrawal form is not available for this complaint. Please contact the Disciplinary Directorate
                  if a change is required.
                </div>
              ) : (
                <form onSubmit={submitWithdrawal}>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">
                      Letter of Withdrawal <span className="text-danger">*</span>{' '}
                      <span className="text-muted fw-normal">(PDF, max 20 MB)</span>
                    </label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf"
                      onChange={(e) => setWdFile(e.target.files[0] || null)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">
                      Reason for withdrawal <span className="text-danger">*</span>
                    </label>
                    <RichEditor value={wdRemarks} onChange={setWdRemarks} required />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={wdBusy}>
                    {wdBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-send me-1" />Submit Letter of Withdrawal
                  </button>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
