import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { statusText } from '../utils/statusText';
import { usePopups } from '../components/Popup';
import './Reports.css';

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString('en-GB') : '—';
}

function fmtMoney(v) {
  return v != null && v !== ''
    ? `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
}

export default function PaymentDetails() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compTypes, setCompTypes] = useState([]);
  const [f, setF] = useState({ compNo: '', dateFrom: '', dateTo: '', transRefNo: '', compType: '', formType: '', instrumentNo: '' });
  const popup = usePopups();

  useEffect(() => {
    api
      .get('/reports/payment-details')
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get('/masters/2').then((r) => setCompTypes(r.data || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const run = async (e) => {
    e.preventDefault();
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    try {
      const res = await api.get(`/reports/payment-details?${params.toString()}`);
      setRows(res.data);
    } catch {
      popup.error('Failed to load payment details.');
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setF({ compNo: '', dateFrom: '', dateTo: '', transRefNo: '', compType: '', formType: '', instrumentNo: '' });
    api.get('/reports/payment-details').then((res) => setRows(res.data)).catch(() => {}).finally(() => setLoading(false));
  };

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-green">
            <i className="bi bi-credit-card-2-front" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Payment Details</h2>
            <p className="page-subtitle">Fee collected on complaints — search by complaint / instrument / date</p>
          </div>
        </div>
        <div className="page-header-actions">
          {!loading && rows.length > 0 && (
            <span className="badge-soft badge-soft-success">
              <i className="bi bi-cash-stack" /> ₹{rows.reduce((s, r) => s + (Number(r.TaxableAmount) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} collected
            </span>
          )}
          <span className="badge-soft badge-soft-neutral">
            <i className="bi bi-collection" /> {rows.length} record{rows.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="card ds-card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-funnel" />
            Search Payments
          </div>
        </div>
        <div className="card-body">
          <form className="row g-3 align-items-end" onSubmit={run}>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Complaint No</label>
              <input className="form-control" value={f.compNo} onChange={set('compNo')} placeholder="PR/000/2026" />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Date From</label>
              <input type="date" className="form-control" value={f.dateFrom} onChange={set('dateFrom')} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">To</label>
              <input type="date" className="form-control" value={f.dateTo} onChange={set('dateTo')} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Trans Ref No</label>
              <input className="form-control" value={f.transRefNo} onChange={set('transRefNo')} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Comp Type</label>
              <select className="form-select" value={f.compType} onChange={set('compType')}>
                <option value="">All</option>
                {compTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Form Type</label>
              <select className="form-select" value={f.formType} onChange={set('formType')}>
                <option value="">All</option>
                <option value="A">A</option>
                <option value="AA">AA</option>
                <option value="AAA">AAA</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Instrument No</label>
              <input className="form-control" value={f.instrumentNo} onChange={set('instrumentNo')} placeholder="e.g. 0123456789" />
            </div>
            <div className="col-md-2 d-flex gap-2">
              <button type="submit" className="btn btn-primary flex-fill" disabled={loading}>
                {loading ? (
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
              <button type="button" className="btn btn-outline-secondary" onClick={clear} title="Clear">
                <i className="bi bi-x-circle" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card ds-card">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-credit-card" />
            Payment Records
          </div>
          <span className="badge-soft badge-soft-primary">{rows.length} shown</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div className="text-muted mt-2" style={{ fontSize: '0.85rem' }}>Loading payment records...</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-inbox" />
              <h6>No payment records found</h6>
              <p>Try clearing the search filters.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    <th>Complaint No</th>
                    <th>Complainant</th>
                    <th>Form</th>
                    <th>Payment Mode</th>
                    <th>Trans Ref No</th>
                    <th>Instrument No</th>
                    <th>Instrument Date</th>
                    <th className="text-end">Taxable Amount</th>
                    <th className="text-end">Tax Rate (%)</th>
                    <th>GSTIN No</th>
                    <th>State</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.CompID} className="clickable" onClick={() => navigate(`/complaints/${r.CompID}`)}>
                      <td className="fw-semibold col-num" style={{ color: 'var(--ds-accent)' }}>{r.CompNo}</td>
                      <td className="fw-semibold">{r.ComplainantName || '—'}</td>
                      <td><span className="badge-soft badge-soft-neutral">{r.FormType || '—'}</span></td>
                      <td className="text-muted">{r.PaymentModeName || '—'}</td>
                      <td className="text-muted col-num">{r.TransRefNo || '—'}</td>
                      <td className="text-muted col-num">{r.InstrumentNo || '—'}</td>
                      <td className="text-muted col-num">{fmtDate(r.InstrumentDate)}</td>
                      <td className="text-end fw-semibold col-num">{fmtMoney(r.TaxableAmount)}</td>
                      <td className="text-end text-muted col-num">{r.TaxRate != null ? `${r.TaxRate}%` : '—'}</td>
                      <td className="text-muted">{r.GSTINNo || '—'}</td>
                      <td className="text-muted">{r.StateName || '—'}</td>
                      <td><span className="badge-soft badge-soft-primary">{statusText(r.StatusName) || '—'}</span></td>
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