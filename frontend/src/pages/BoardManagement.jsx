import { useEffect, useState } from 'react';
import api from '../api/client';
import { usePopups } from '../components/Popup';

export default function BoardManagement() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ councilYear: '', boardName: '', region: '', boardType: '', email: '' });
  const [busy, setBusy] = useState(false);
  const popup = usePopups();

  const load = () => {
    api.get('/master-data/boards').then((res) => setBoards(res.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/master-data/boards', form);
      popup.success('Board formation created');
      setForm({ councilYear: '', boardName: '', region: '', boardType: '', email: '' });
      load();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to create board');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h4 className="mb-3">Board Formation</h4>
      <div className="row g-4">
        <div className="col-md-5">
          <div className="card">
            <div className="card-header fw-semibold">Create Board</div>
            <div className="card-body">
              <form onSubmit={submit}>
                <div className="mb-2">
                  <label className="form-label small">Council Year *</label>
                  <input className="form-control" value={form.councilYear} onChange={set('councilYear')} required />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Board Name *</label>
                  <input className="form-control" value={form.boardName} onChange={set('boardName')} required />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Region</label>
                  <input className="form-control" value={form.region} onChange={set('region')} />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Board Type</label>
                  <select className="form-select" value={form.boardType} onChange={set('boardType')}>
                    <option value="">Select type</option>
                    <option value="1">DD Board</option>
                    <option value="2">Regulator</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label small">Contact Email</label>
                  <input type="email" className="form-control" value={form.email} onChange={set('email')} />
                </div>
                <button className="btn btn-primary w-100" disabled={busy}>
                  {busy ? 'Creating...' : 'Create Board'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="col-md-7">
          <div className="card">
            <div className="card-header fw-semibold">Existing Boards</div>
            <div className="card-body p-0">
              {loading ? (
                <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
              ) : (
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Board Name</th>
                      <th>Region</th>
                      <th>Council Year</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boards.map((b) => (
                      <tr key={b.BFID}>
                        <td className="fw-semibold">{b.BoardName}</td>
                        <td>{b.Region || '-'}</td>
                        <td>{b.CouncilYear || '-'}</td>
                        <td>{Number(b.BoardType) === 1 ? 'DD Board' : 'Regulator'}</td>
                      </tr>
                    ))}
                    {boards.length === 0 && (
                      <tr><td colSpan="4" className="text-center text-muted py-4">No boards found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}