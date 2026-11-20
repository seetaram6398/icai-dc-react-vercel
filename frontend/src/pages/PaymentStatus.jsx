import { Link, useSearchParams } from 'react-router-dom';
import './Reports.css';

export default function PaymentStatus() {
  const [params] = useSearchParams();
  const status = params.get('status') || 'unknown';
  const verified = params.get('verified') === '1';
  const orderId = params.get('orderId') || '';
  const txnid = params.get('txnid') || orderId;
  const amount = params.get('amount') || '';
  const gatewayRef = params.get('gatewayRef') || '';
  const error = params.get('error') || '';

  const success = verified && status.toLowerCase() === 'success';
  const tone = success ? 'green' : (status === 'hash_mismatch' || status === 'amount_mismatch' ? 'red' : 'amber');
  const title = success
    ? 'Payment successful'
    : status === 'hash_mismatch' || status === 'amount_mismatch'
      ? 'Payment verification failed'
      : status.toLowerCase() === 'failure'
        ? 'Payment failed'
        : 'Payment status could not be confirmed';

  const rows = [
    ['Order / Transaction ID', txnid],
    ['Amount', amount ? `₹ ${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'],
    ['Gateway Reference', gatewayRef || '—'],
    ['Gateway Status', status],
  ];

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className={`report-page-icon tone-${tone}`}>
            <i className={`bi ${success ? 'bi-check-circle' : 'bi-exclamation-triangle'}`} />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">{title}</h2>
            <p className="page-subtitle">Disciplinary form fee payment</p>
          </div>
        </div>
      </div>

      <div className="card ds-card">
        <div className="card-body">
          {!verified && (
            <div className="alert alert-danger">
              <i className="bi bi-shield-exclamation me-2" />
              The gateway response could not be verified against the order. Do not treat this payment as confirmed.
              Contact the disciplinary directorate with the order ID if you were charged.
            </div>
          )}
          {verified && !success && status.toLowerCase() === 'failure' && (
            <div className="alert alert-warning">
              <i className="bi bi-x-circle me-2" />
              {error || 'The payment was not completed. You can try again.'}
            </div>
          )}
          <div className="table-responsive">
            <table className="table data-table mb-0">
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label}>
                    <th style={{ width: '240px' }}>{label}</th>
                    <td className="col-num">{value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-flex gap-2 mt-4">
            <Link className="btn btn-primary" to="/payment"><i className="bi bi-arrow-repeat me-1" />Make another payment</Link>
            <Link className="btn btn-outline-secondary" to="/my-complaints">My Complaints</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
