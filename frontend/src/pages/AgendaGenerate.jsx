import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { statusText } from '../utils/statusText';
import { usePopups } from '../components/Popup';

const AGENDA_TYPE_LABELS = {
  '2': 'SO / Scrutiny',
  '68': 'Closure before Committee',
  '69': 'Clubbing before Committee (Rec. to Committee)',
};

export default function AgendaGenerate() {
  const navigate = useNavigate();
  const [agendaType, setAgendaType] = useState('2');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const popup = usePopups();

  const isCommitteeType = agendaType === '68' || agendaType === '69';

  useEffect(() => {
    setRows([]);
    setSelected([]);
    setLoading(true);
    // SO / Scrutiny agenda historically pulls statuses 2,3,4 and schedules them
    // under status 2. The committee clubbing/closure agenda (status 68/69) pulls
    // only that status and schedules it under the same status.
    const statusIds = agendaType === '2' ? '2,3,4' : agendaType;
    api
      .get(`/complaints?statusIds=${statusIds}`)
      .then((res) => setRows(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agendaType]);

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const handleGenerate = async () => {
    if (!date || selected.length === 0) {
      popup.warning('Select at least one complaint and a date');
      return;
    }
    setBusy(true);
    try {
      const items = selected.map((compId) => ({
        compId,
        statusId: agendaType === '2' ? 2 : Number(agendaType),
        date,
        time: time || '10:00',
        place: place || 'ICAI Bhawan',
      }));
      const res = await api.post('/agenda', { items });
      popup.success(`Agenda generated for ${res.data.created.length} item(s)`);
      navigate('/agenda');
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to generate agenda');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center mb-3">
        <button className="btn btn-outline-secondary me-3 btn-sm" onClick={() => navigate('/agenda')}>
          <i className="bi bi-arrow-left"></i>
        </button>
        <h4 className="mb-0">Generate Agenda</h4>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <label className="form-label small fw-semibold">Agenda Type</label>
          <select className="form-select" value={agendaType} onChange={(e) => setAgendaType(e.target.value)}>
            {Object.entries(AGENDA_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label small fw-semibold">Meeting Date *</label>
          <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="col-md-2">
          <label className="form-label small fw-semibold">Meeting Time</label>
          <input type="time" className="form-control" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="col-md-2">
          <label className="form-label small fw-semibold">Venue</label>
          <input className="form-control" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="ICAI Bhawan" />
        </div>
      </div>

      {isCommitteeType && (
        <div className="alert alert-info py-2 small">
          <i className="bi bi-diagram-3 me-1" />
          This schedules the clubbing / closure case before the committee. After the meeting, open the complaint and
          mark the committee decision (Agree / Disagree).
        </div>
      )}

      <div className="card">
        <div className="card-header fw-semibold d-flex justify-content-between">
          <span>Select Complaints</span>
          <span className="badge text-bg-primary">{selected.length} selected</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
          ) : (
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.CompID) : [])}
                      checked={selected.length === rows.length && rows.length > 0}
                    />
                  </th>
                  <th>Complaint No</th>
                  <th>Respondent</th>
                  <th>Status</th>
                  <th className="text-center">Days</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.CompID} className="clickable" onClick={() => toggle(r.CompID)}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selected.includes(r.CompID)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(r.CompID)}
                      />
                    </td>
                    <td className="fw-semibold">{r.CompNo}</td>
                    <td>{r.ResName || '-'}</td>
                    <td><span className="badge text-bg-secondary">{statusText(r.StatusName)}</span></td>
                    <td className="text-center">{r.DaysSinceEntry}d</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan="5" className="text-center text-muted py-4">No eligible complaints</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <button className="btn btn-primary mt-3" onClick={handleGenerate} disabled={busy}>
        {busy ? 'Generating...' : 'Generate Agenda'}
      </button>
    </div>
  );
}