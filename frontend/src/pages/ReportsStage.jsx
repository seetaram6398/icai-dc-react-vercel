import { useEffect, useState } from 'react';
import api from '../api/client';
import { statusText } from '../utils/statusText';
import './Reports.css';

const VIEWS = [
  { value: 'stages', label: 'By Stages', icon: 'bi-diagram-3' },
  { value: 'formType', label: 'By Form Type (A)', icon: 'bi-file-earmark' },
];

function totalCount(view, r) {
  if (view === 'formType') {
    if (r.Total != null) return Number(r.Total) || 0;
    return (Number(r.A) || 0) + (Number(r.NonA) || 0);
  }
  return Number(r.TotalCount) || 0;
}

export default function ReportsStage() {
  const [view, setView] = useState('stages');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/reports/stage-bifurcation?view=${view}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [view]);

  const dataRows = rows.filter((r) => r.StatusName !== 'Grand Total');
  const grand = rows.find((r) => r.StatusName === 'Grand Total');
  const grandTotal = grand ? totalCount(view, grand) : dataRows.reduce((s, r) => s + totalCount(view, r), 0);
  const nonAGrand = grand && view === 'formType' ? Number(grand.NonA) || 0 : null;

  return (
    <div>
      <div className="page-header">
        <div className="report-header-row">
          <div className="report-page-icon tone-purple">
            <i className="bi bi-diagram-3" />
          </div>
          <div className="report-header-text">
            <h2 className="page-title">Statistic Report — Stage Wise Bifurcation</h2>
            <p className="page-subtitle">
              Distribution of registered complaints across processing stages
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          {!loading && rows.length > 0 && (
            <span className="badge-soft badge-soft-primary">
              <i className="bi bi-collection" /> {grandTotal.toLocaleString('en-IN')} total
            </span>
          )}
        </div>
      </div>

      <div className="view-toggle mb-4">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            className={view === v.value ? 'active' : ''}
            onClick={() => setView(v.value)}
          >
            <i className={v.icon} /> {v.label}
          </button>
        ))}
      </div>

      <div className="card ds-card">
        <div className="card-header">
          <div className="card-title">
            <i className="bi bi-bar-chart-steps" />
            {view === 'stages' ? 'Complaints By Stage' : 'Complaints By Form Type (A)'}
          </div>
          <span className="badge-soft badge-soft-neutral">{dataRows.length} stages</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div className="text-muted mt-2" style={{ fontSize: '0.85rem' }}>Loading report...</div>
            </div>
          ) : dataRows.length === 0 ? (
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
                    <th>Status / Stage</th>
                    {view === 'stages' ? (
                      <th className="text-center">Complaints</th>
                    ) : (
                      <>
                        <th className="text-center">Type A</th>
                        <th className="text-center">Non Type A</th>
                        <th className="text-center">Total</th>
                      </>
                    )}
                    {view === 'stages' && <th className="text-end" style={{ width: 160 }}>Share</th>}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((r, idx) => {
                    const t = totalCount(view, r);
                    const pct = grandTotal ? Math.round((t / grandTotal) * 1000) / 10 : 0;
                    return (
                      <tr key={r.StatusName}>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{idx + 1}</td>
                        <td className="fw-semibold">{statusText(r.StatusName)}</td>
                        {view === 'stages' ? (
                          <td className="text-center col-num">{t}</td>
                        ) : (
                          <>
                            <td className="text-center col-num">{Number(r.A) || 0}</td>
                            <td className="text-center col-num">{Number(r.NonA) || 0}</td>
                            <td className="text-center col-num fw-semibold">{t}</td>
                          </>
                        )}
                        {view === 'stages' && (
                          <td className="text-end">
                            <span className="d-inline-flex align-items-center gap-2 justify-content-end" style={{ minWidth: 120 }}>
                              <span className="badge-soft badge-soft-primary col-num">{pct}%</span>
                              <span className="progress" style={{ width: 56, height: 6 }}>
                                <span className="progress-bar" style={{ width: `${Math.min(pct, 100)}%`, background: '#1a4a8a' }} />
                              </span>
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {grand && (
                  <tfoot>
                    <tr className="grand-total">
                      <td colSpan={view === 'stages' ? 2 : 1}>Grand Total</td>
                      {view === 'stages' ? (
                        <>
                          <td className="text-center col-num" style={{ fontSize: '1rem' }}>{grandTotal}</td>
                          <td className="text-end col-num" style={{ fontSize: '0.85rem' }}>100%</td>
                        </>
                      ) : (
                        <>
                          <td className="text-center col-num">{Number(grand.A) || 0}</td>
                          <td className="text-center col-num">{nonAGrand}</td>
                          <td className="text-center col-num" style={{ fontSize: '1rem' }}>{grandTotal}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}