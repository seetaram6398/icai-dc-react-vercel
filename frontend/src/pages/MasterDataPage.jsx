import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';

const MASTER_TYPES = [
  { id: 1, name: 'Academic Sessions' },
  { id: 3, name: 'States' },
  { id: 4, name: 'Payment Modes' },
  { id: 5, name: 'Documents' },
  { id: 8, name: 'Schedules' },
  { id: 13, name: 'Council Years' },
  { id: 14, name: 'Board Formations' },
  { id: 20, name: 'Adjournment Reasons' },
];

export default function MasterDataPage() {
  const [searchParams] = useSearchParams();
  const [type, setType] = useState(searchParams.get('type') || '1');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/masters/${type}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type]);

  const active = MASTER_TYPES.find((t) => String(t.id) === type);

  return (
    <div>
      <h4 className="mb-3">Master Data</h4>
      <div className="mb-3 d-flex gap-2 flex-wrap">
        {MASTER_TYPES.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${String(t.id) === type ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setType(String(t.id))}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header fw-semibold">{active?.name || 'Master'}</div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
          ) : (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Value</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-muted">{r.value}</td>
                    <td>{r.label}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan="2" className="text-center text-muted py-4">No master records</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}