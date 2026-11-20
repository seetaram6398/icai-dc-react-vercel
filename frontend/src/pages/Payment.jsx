import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePopups } from '../components/Popup';
import { isValidEmail, isValidMobile } from '../utils/validators';
import './Reports.css';

export default function Payment() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const popup = usePopups();
  const formRef = useRef(null);

  const [form, setForm] = useState({
    complaintNo: searchParams.get('compNo') || '',
    amount: searchParams.get('amount') || '2950',
    name: user?.NameOfTheUser || '',
    email: user?.Email || '',
    phone: user?.Mob || '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || user?.NameOfTheUser || '',
      email: prev.email || user?.Email || '',
      phone: prev.phone || user?.Mob || '',
    }));
  }, [user]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const pay = async (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      popup.warning('Please enter a valid fee amount');
      return;
    }
    if (!form.name.trim()) {
      popup.warning('Please enter the payer name');
      return;
    }
    if (!isValidEmail(form.email)) {
      popup.warning('Please enter a valid email ID');
      return;
    }
    if (!isValidMobile(form.phone, '91')) {
      popup.warning('Please enter a valid 10-digit mobile number');
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post('/payment/initiate', {
        amount,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone,
        complaintNo: form.complaintNo.trim(),
        productInfo: 'ICAI Disciplinary Form Fee',
      });

      const gatewayForm = formRef.current;
      gatewayForm.action = data.actionUrl;
      gatewayForm.innerHTML = '';
      Object.entries(data.fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        gatewayForm.appendChild(input);
      });
      gatewayForm.submit();
    } catch (err) {
      popup.error(err?.response?.data?.error || 'Unable to start the payment. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-green">
            <i className="bi bi-credit-card" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Pay Complaint Fee</h2>
            <p className="page-subtitle">Secure online payment for disciplinary forms</p>
          </div>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-outline-secondary" to="/my-complaints">
            <i className="bi bi-arrow-left me-1" />Back
          </Link>
        </div>
      </div>

      <div className="card ds-card mb-3">
        <div className="card-body">
          <div className="alert alert-info mb-0" style={{ fontSize: '0.9rem' }}>
            <i className="bi bi-info-circle me-2" />
            Disciplinary-form payments use a dedicated <strong>DCFORM</strong> order-ID prefix (eForms use EFORMAS),
            so gateway receipts can be reconciled separately. The same merchant account is used for both.
          </div>
        </div>
      </div>

      <div className="card ds-card">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-cash-coin" />
            Payment Details
          </div>
        </div>
        <div className="card-body">
          <form className="row g-3" onSubmit={pay}>
            <div className="col-md-6">
              <label className="form-label small fw-semibold">Complaint Number (optional)</label>
              <input className="form-control" value={form.complaintNo} onChange={set('complaintNo')} placeholder="e.g. PR/000/2026" />
              <div className="form-text">Included with the payment record for reconciliation.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold">Fee Amount (₹) *</label>
              <input type="number" min="1" step="0.01" className="form-control" value={form.amount} onChange={set('amount')} required />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Payer Name *</label>
              <input className="form-control" value={form.name} onChange={set('name')} required />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Email ID *</label>
              <input type="email" className="form-control" value={form.email} onChange={set('email')} required />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Mobile Number *</label>
              <input className="form-control" value={form.phone} onChange={set('phone')} required />
            </div>
            <div className="col-12">
              <button type="submit" className="btn btn-success" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Redirecting to payment gateway...
                  </>
                ) : (
                  <><i className="bi bi-lock-fill me-2" />Pay Now</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <form ref={formRef} method="POST" style={{ display: 'none' }} />
    </div>
  );
}
