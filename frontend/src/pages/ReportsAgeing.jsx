import { useEffect, useState } from 'react';
import api from '../api/client';
import { statusText } from '../utils/statusText';
import './Reports.css';

const BASES = [
  { value: 'registration', label: 'From Registration', icon: 'bi-calendar-check' },
  { value: 'actionable', label: 'From Written Statement Stage', icon: 'bi-play-circle' },
  { value: 'nonactionable', label: 'From Closure Stage', icon: 'bi-pause-circle' },
  { value: 'referring', label: 'From Referring', icon: 'bi-send' },
];

const BUCKETS = [
  ['0_6_months', '0–6 Months'],
  ['6_12_months', '6–12 Months'],
  ['1_2_years', '1–2 Years'],
  ['2_3_years', '2–3 Years'],
  ['over_3_years', '>3 Years'],
];

export default function ReportsAgeing() {
  const [base, setBase] = useState('registration');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/reports/ageing?base=${base}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [base]);

  const rowTotal = (r) => BUCKETS.reduce((s, [k]) => s + (Number(r[k]) || 0), 0);
  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-amber">
            <i className="bi bi-hourglass-split" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Statistic Report — Ageing of Cases</h2>
            <p className="page-subtitle">
              Age of complaints by stage, measured from the selected base date
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          {!loading && rows.length > 0 && (
            <span className="badge-soft badge-soft-primary">
              <i className="bi bi-collection" /> {grandTotal.toLocaleString('en-IN')} complaints
            </span>
          )}
        </div>
      </div>

      <div className="view-toggle mb-4">
        {BASES.map((b) => (
          <button
            key={b.value}
            type="button"
            className={base === b.value ? 'active' : ''}
            onClick={() => setBase(b.value)}
          >
            <i className={b.icon} /> {b.label}
          </button>
        ))}
      </div>

      <div className="card ds-card">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-calendar-range" />
            {BASES.find((b) => b.value === base)?.label}
          </div>
          <span className="badge-soft badge-soft-neutral">Age buckets</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div className="text-muted mt-2" style={{ fontSize: '0.85rem' }}>Loading report...</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-inbox" />
              <h6>No data available</h6>
              <p>There are no complaints matching this report.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    {BUCKETS.map(([k, label]) => (
                      <th key={k} className="text-center">{label}</th>
                    ))}
                    <th className="text-center" style={{ background: '#e8effa', color: '#1a4a8a', fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.StatusName}>
                      <td className="text-muted" style={{ fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td className="fw-semibold">{statusText(r.StatusName)}</td>
                      {BUCKETS.map(([k]) => (
                        <td key={k} className="text-center col-num">
                          {Number(r[k]) || 0}
                        </td>
                      ))}
                      <td className="text-center col-num fw-semibold" style={{ background: '#f6f9fd' }}>
                        {rowTotal(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="grand-total">
                    <td colSpan={BUCKETS.length + 1}>Grand Total</td>
                    {BUCKETS.map(([k]) => (
                      <td key={k} className="text-center col-num">
                        {rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)}
                      </td>
                    ))}
                    <td className="text-center col-num" style={{ fontSize: '1rem' }}>{grandTotal}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}