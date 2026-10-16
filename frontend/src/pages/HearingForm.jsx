import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { usePopups } from '../components/Popup';

export default function HearingForm() {
  const navigate = useNavigate();
  const popup = usePopups();
  const [complaints, setComplaints] = useState([]);
  const [form, setForm] = useState({
    compId: '',
    causeDate: '',
    causeTime: '',
    place: '',
    hearingDetails: '',
    hearingUrl: '',
    hearingType: '1',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/complaints?statusIds=25,36')
      .then((res) => setComplaints(res.data))
      .catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/hearings', form);
      popup.success('Hearing scheduled');
      navigate('/hearings');
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to schedule hearing');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center mb-3">
        <button className="btn btn-outline-secondary me-3 btn-sm" onClick={() => navigate('/hearings')}>
          <i className="bi bi-arrow-left"></i>
        </button>
        <h4 className="mb-0">Schedule Hearing</h4>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 700 }}>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Complaint *</label>
              <select className="form-select" value={form.compId} onChange={set('compId')} required>
                <option value="">Select complaint</option>
                {complaints.map((c) => (
                  <option key={c.CompID} value={c.CompID}>{c.CompNo} - {c.ResName || ''}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Hearing Date *</label>
              <input type="date" className="form-control" value={form.causeDate} onChange={set('causeDate')} required />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hearing Time *</label>
              <input type="time" className="form-control" value={form.causeTime} onChange={set('causeTime')} required />
            </div>
            <div className="col-md-6">
              <label className="form-label">Venue</label>
              <input className="form-control" value={form.place} onChange={set('place')} placeholder="ICAI Bhawan" />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hearing URL (if online)</label>
              <input className="form-control" value={form.hearingUrl} onChange={set('hearingUrl')} />
            </div>
            <div className="col-12">
              <label className="form-label">Hearing Details / Notes</label>
              <textarea className="form-control" rows="3" value={form.hearingDetails} onChange={set('hearingDetails')} />
            </div>
          </div>

          <button className="btn btn-primary mt-3" disabled={busy}>
            {busy ? 'Scheduling...' : 'Schedule Hearing'}
          </button>
        </div>
      </form>
    </div>
  );
}