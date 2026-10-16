import { useEffect, useState } from 'react';
import api from '../api/client';
import { statusText } from '../utils/statusText';

const BASES = [
  { value: 'registration', label: 'From Registration' },
  { value: 'actionable', label: 'From Written Statement Stage' },
  { value: 'nonactionable', label: 'From Closure Stage' },
  { value: 'referring', label: 'From Referring' },
];

export default function ReportsMemberAgeing() {
  const [base, setBase] = useState('registration');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/reports/member-ageing?base=${base}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [base]);

  return (
    <div>
      <h4 className="mb-1">My Complaint Ageing</h4>
      <p className="text-muted mb-3">Ageing analysis for your complaints only</p>
      <div className="mb-3">
        <select className="form-select w-auto" value={base} onChange={(e) => setBase(e.target.value)}>
          {BASES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
          ) : (
            <table className="table table-bordered mb-0">
              <thead className="table-light">
                <tr>
                  <th>Status</th>
                  <th className="text-center">0-6 months</th>
                  <th className="text-center">6-12 months</th>
                  <th className="text-center">1-2 years</th>
                  <th className="text-center">2-3 years</th>
                  <th className="text-center">&gt;3 years</th>
                  <th className="text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.StatusName}>
                    <td>{statusText(r.StatusName)}</td>
                    <td className="text-center">{Number(r['0_6_months']) || 0}</td>
                    <td className="text-center">{Number(r['6_12_months']) || 0}</td>
                    <td className="text-center">{Number(r['1_2_years']) || 0}</td>
                    <td className="text-center">{Number(r['2_3_years']) || 0}</td>
                    <td className="text-center">{Number(r.over_3_years) || 0}</td>
                    <td className="text-center fw-bold">
                      {[r['0_6_months'], r['6_12_months'], r['1_2_years'], r['2_3_years'], r.over_3_years].reduce(
                        (s, v) => s + (Number(v) || 0),
                        0
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan="7" className="text-center text-muted py-4">No data</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
