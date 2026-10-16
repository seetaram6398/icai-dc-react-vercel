import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import ScrutinySheetForm from '../components/ScrutinySheetForm';
import RichEditor from '../components/RichEditor';
import { statusText } from '../utils/statusText';
import { sanitizeHtml } from '../utils/sanitize';
import { usePopups } from '../components/Popup';
import {
  RULE_54, RULE_54_PROVISO, RULE_6_TEXT, RULE_6_PROVISO,
  hasPrimaFacie, canWithdraw, rule6ReturnStatus,
} from '../utils/rule54';

function badgeTone(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('dispose') || n.includes('closed') || n.includes('punish')) return 'badge-soft-success';
  if (n.includes('expired') || n.includes('adjourn')) return 'badge-soft-warning';
  if (n.includes('non-actionable') || n.includes('clos')) return 'badge-soft-neutral';
  return 'badge-soft-primary';
}

function fileIcon(url = '') {
  const ext = (url.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'bi-file-image';
  if (['pdf'].includes(ext)) return 'bi-file-earmark-pdf';
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'bi-film';
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'bi-music-note';
  return 'bi-file-earmark';
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function fmtMoney(v) {
  return v != null && v !== '' ? `₹ ${Number(v).toLocaleString('en-IN')}` : '—';
}

function daysSince(v) {
  if (!v) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86400000));
}

const PAY_MODE_LABELS = { 3: 'Net Banking', 4: 'DD' };

function DetailRow({ label, value }) {
  return (
    <>
      <dt className="col-sm-4">{label}</dt>
      <dd className="col-sm-8">{value ?? '—'}</dd>
    </>
  );
}

function Section({ icon, title, right, children }) {
  return (
    <div className="card ds-card mb-4">
      <div className="card-header">
        <div className="card-title">
          <i className={`bi ${icon}`} />
          {title}
        </div>
        {right}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

const USER_KIND_LABELS = { so: 'SO Member', officer: 'Officer', ro: 'Reporting Officer', bod: 'BOD Member' };

const WORKFLOW_PANELS = [
  {
    roles: [5],
    statuses: [50],
    icon: 'bi-envelope-paper',
    title: 'Seek Written Statement from the Respondent',
    caption: 'After the DD agrees to the Registration recommendation, send the query to the Respondent to obtain their written statement.',
    controls: [
      { label: 'Send Query to take Written Statement from the Respondent', statusId: 15, attach: true },
    ],
  },
  {
    roles: [5],
    statuses: [16],
    icon: 'bi-file-earmark-text',
    title: 'Written Statement Submitted by the Respondent',
    caption: 'The respondent has submitted the written statement. Seek a rejoinder or assign an officer.',
    controls: [
      { label: 'Call for Rejoinder', statusId: 22, attach: true },
      { label: 'Assign To Officer', statusId: 27, user: 'officer' },
    ],
  },
  {
    roles: [5],
    statuses: [23],
    icon: 'bi-reply-fill',
    title: 'Rejoinder Submitted by the Complainant',
    caption: 'The complainant has replied to the written statement. Examine the rejoinder documents and assign an officer (UserType 7) for examination.',
    controls: [{ label: 'Examine Documents and Assign Officer for Examination', statusId: 53, user: 'officer' }],
  },
  {
    roles: [5],
    statuses: [17],
    icon: 'bi-briefcase',
    title: 'Recommendation to Director Discipline',
    caption: 'Send the complaint forward to the Board of Discipline, or recommend closure.',
    controls: [
      { label: 'Send to Board of Discipline', statusId: 18, user: 'bod' },
      { label: 'Close Recommendation to Board of Discipline', statusId: 10 },
    ],
  },
  {
    roles: [5],
    statuses: [59],
    icon: 'bi-clipboard-check',
    title: 'Assigned to SO After Additional Documents',
    caption: 'The Complainant has furnished the additional document. Assign an officer (UserType 7) to draft the Preliminary Examination Report (PER).',
    controls: [{ label: 'Assign To Officer for Drafting PER', statusId: 27, user: 'officer' }],
  },
  {
    roles: [5],
    statuses: [62],
    icon: 'bi-hourglass-split',
    title: 'Pending for Formation of PER',
    caption: 'Assign an officer to draft the Preliminary Examination Report (PER).',
    controls: [{ label: 'Assign To Officer', statusId: 27, user: 'officer' }],
  },
  {
    roles: [7],
    statuses: [53],
    icon: 'bi-search',
    title: 'Complaint under Examination',
    caption: 'Examine the rejoinder and the complaint documents. Select whether an additional document is required from the complainant, then assign the case to the Reporting Officer.',
    controls: [
      { label: 'Additional Document Required (Yes)', statusId: 54, user: 'ro', attach: true, commonField: 'Additional Document Required' },
      { label: 'Additional Document Not Required (No)', statusId: 54, user: 'ro', commonField: 'Additional Document Not Required' },
    ],
  },
  {
    roles: [7],
    statuses: [27, 28, 70],
    icon: 'bi-file-earmark-richtext',
    title: 'Draft Preliminary Fact Finding Report (PFO)',
    caption: 'Upload the draft PFO/PER. Send it to the Reporting Officer for review.',
    controls: [
      { label: 'Upload PFO/PER and Send to Reporting Officer', statusId: 49, user: 'ro', attach: true },
    ],
  },
  {
    roles: [10],
    statuses: [54],
    icon: 'bi-clipboard-data',
    title: 'Recommend Additional Document - Review by RO',
    caption: 'Recommend the additional document required from the Complainant to the DD, or send it back to the Officer.',
    controls: [
      { label: 'Agree', statusId: 55 },
      { label: 'Disagree', statusId: 53, commonField: 'Review for Additional Document' },
    ],
  },
  {
    roles: [4],
    statuses: [55],
    icon: 'bi-patch-check',
    title: 'Approval of Additional Document Required from the Complainant',
    caption: 'The Reporting Officer has recommended that an additional document be called for from the Complainant. Approve it and send it to the SO to obtain the document.',
    controls: [
      { label: 'Agree - Send to SO to call for Additional Document', statusId: 56, user: 'so' },
      { label: 'Disagree - Send back to the Reporting Officer', statusId: 54, commonField: 'Review for Additional Document' },
    ],
  },
  {
    roles: [5],
    statuses: [56],
    icon: 'bi-envelope-paper',
    title: 'Call for Additional Document from Complainant',
    caption: 'The DD has approved calling for an additional document from the Complainant. Send the request/query to the Complainant to furnish the additional document.',
    controls: [
      { label: 'Send Query to Complainant for Additional Document', statusId: 51, attach: true },
    ],
  },
  {
    roles: [10],
    statuses: [57],
    icon: 'bi-inboxes',
    title: 'Review of Additional Document by RO',
    caption: 'Accept the additional document submitted by the Complainant, or send it back to the Officer.',
    controls: [
      { label: 'Agree', statusId: 58 },
      { label: 'Disagree', statusId: 53 },
    ],
  },
  {
    roles: [10],
    statuses: [49],
    icon: 'bi-clipboard-check',
    title: 'Draft PFO/PER Submitted to Reporting Officer',
    caption: 'Forward the draft PFO/PER to the Director Discipline, or resend for modification.',
    controls: [
      { label: 'Send PFO/PER to Director Discpline', statusId: 24 },
      { label: 'Resend for Modification', statusId: 27, user: 'officer' },
    ],
  },
  {
    roles: [4],
    statuses: [18],
    icon: 'bi-bank',
    title: 'Placed before Board of Discipline',
    caption: 'Mark your decision before the Board of Discipline.',
    controls: [
      { label: 'Mark Decision As Agree', statusId: 19 },
      { label: 'Mark Decision As Disagree', statusId: 20 },
    ],
  },
  {
    roles: [4],
    statuses: [31],
    icon: 'bi-patch-check',
    title: 'Send for Approval to Director Discipline',
    caption: 'Approve the recommendation, or reject it back to the SO.',
    controls: [
      { label: 'Approved - Send to SO', statusId: 50, user: 'so' },
      { label: 'Rejected - Send Back to SO', statusId: 59 },
    ],
  },
  {
    roles: [4],
    statuses: [10],
    icon: 'bi-x-circle',
    title: 'Close Recommendation to Director Discipline',
    caption: 'Forward the closure recommendation to the BOD, or ask for modification.',
    controls: [
      { label: 'Close Recommendation to BOD', statusId: 11, user: 'bod' },
      { label: 'Modification Required', statusId: 59 },
    ],
  },
  {
    roles: [6],
    statuses: [11],
    icon: 'bi-shield-check',
    title: 'Closure Recommendation with the Board of Discipline',
    caption: 'Accept or reject the closure recommendation. The decision is communicated to the Complainant.',
    controls: [
      { label: 'Accept Closure', statusId: 13, decisionValue: 'ACCEPTED' },
      { label: 'Reject Closure', statusId: 13, decisionValue: 'REJECTED' },
    ],
  },
  {
    roles: [6],
    statuses: [7],
    icon: 'bi-check-square',
    title: 'Faulty + BOD Decision Communicated to DD',
    caption: 'Decide the closure matter referred by the DD.',
    controls: [
      { label: 'Closed', statusId: 9 },
      { label: 'Proceed Further', statusId: 15 },
      { label: 'Close the Case', statusId: 14 },
      { label: 'Assign To SO', statusId: 8, user: 'so' },
    ],
  },
  // Rule 5(4)(b): the Director brings the new complaint before the Board of
  // Discipline / Committee, which clubs it, closes it, or sends it back to the
  // Director to deal with it as a separate complaint.
  {
    roles: [6, 8],
    statuses: [125],
    icon: 'bi-diagram-3',
    title: 'Rule 5(4)(b) - Decision of the Board of Discipline / Committee',
    caption:
      'The Director has placed a new complaint with substantially the same subject matter as a previous complaint before this forum. Club it with the previous complaint, close it, or ask the Director to deal with it as a separate complaint.',
    controls: [
      { label: 'Club with the previous complaint - Rule 5(4)(b)', statusId: 66, user: 'so', commonField: 'Rule 5(4)(b)' },
      { label: 'Close this complaint - Rule 5(4)(b)', statusId: 13, user: 'so', commonField: 'Rule 5(4)(b)' },
      { label: 'Ask the Director to deal with it as a separate complaint - Rule 5(4)(b)', statusId: 5, clearClubbing: true },
    ],
  },
  // Rule 5(4)(c): orders already passed on the previous complaint - the
  // Director presents the new complaint before the Board of Discipline for
  // its closure.
  {
    roles: [6],
    statuses: [126],
    icon: 'bi-x-octagon',
    title: 'Rule 5(4)(c) - Closure before the Board of Discipline',
    caption:
      'Orders have already been passed by the Board of Discipline or the Committee on the previous complaint, and the Director has presented this new complaint for its closure.',
    controls: [
      { label: 'Close this complaint - Rule 5(4)(c)', statusId: 13, user: 'so', commonField: 'Rule 5(4)(c)' },
      { label: 'Not agreed - return it to the Director to deal with as a separate complaint', statusId: 5, clearClubbing: true },
    ],
  },
  // SO conveys a closure decision (status 11/13) to the complainant.
  {
    roles: [5],
    statuses: [13],
    icon: 'bi-envelope-paper',
    title: 'Communicate Closure Decision',
    caption: 'Attach the letter conveying the closure decision to the Complainant.',
    controls: [{ label: 'Communicate Closure to the Complainant', statusId: 14, attach: true }],
  },
  // Rule 6: the Board of Discipline permits or declines the withdrawal.
  {
    roles: [6],
    statuses: [128],
    icon: 'bi-box-arrow-right',
    title: 'Withdrawal placed before the Board of Discipline',
    caption:
      "The Director has placed the complainant's letter of withdrawal before the Board of Discipline. Permit the withdrawal if the circumstances so warrant, or decline it and continue the complaint.",
    controls: [
      { label: 'Permit the withdrawal of the complaint', statusId: 130, decisionValue: 'WITHDRAWAL_PERMITTED' },
      { label: 'Decline the withdrawal - continue the complaint', statusId: 'RETURN_TO_PREV', decisionValue: 'WITHDRAWAL_DECLINED' },
    ],
  },
  // Rule 6: the Committee permits or declines the withdrawal.
  {
    roles: [6, 8],
    statuses: [129],
    icon: 'bi-people',
    title: 'Withdrawal placed before the Committee',
    caption:
      "The Director has placed the complainant's letter of withdrawal before the Committee. Permit the withdrawal if the circumstances so warrant, or decline it and continue the complaint.",
    controls: [
      { label: 'Permit the withdrawal of the complaint', statusId: 130, decisionValue: 'WITHDRAWAL_PERMITTED' },
      { label: 'Decline the withdrawal - continue the complaint', statusId: 'RETURN_TO_PREV', decisionValue: 'WITHDRAWAL_DECLINED' },
    ],
  },
];

function RoleActionCard({ panel, members, onTransition }) {
  const popup = usePopups();
  const [choice, setChoice] = useState('');
  const [userId, setUserId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const choiceConf = panel.controls.find((c) => c.label === choice) || null;
  const needUser = choiceConf?.user || null;
  const userList = needUser ? members[needUser] || [] : [];

  const submit = async (e) => {
    e.preventDefault();
    if (!choice) {
      popup.warning('Please select one of the option.');
      return;
    }
    if (needUser && !userId) {
      popup.warning(`Please select ${USER_KIND_LABELS[needUser] || 'a member'}.`);
      return;
    }
    if (choiceConf.attach && !file) {
      popup.warning('Please upload documents.');
      return;
    }
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext !== 'pdf') {
        popup.warning('Only .pdf file format supported.');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        popup.warning('Total File Size should be less than 20 MB.');
        return;
      }
    }
    setBusy(true);
    try {
      await onTransition({
        statusId: choiceConf.statusId,
        userToId: needUser ? Number(userId) : null,
        remarks: remarks.trim() || null,
        file,
        commonField: choiceConf.commonField,
        decisionValue: choiceConf.decisionValue,
        // Rule 5(4)(b)/(c): "deal with it as a separate complaint" drops the
        // link to the previous complaint.
        clubbedWithCompId: choiceConf.clearClubbing ? null : undefined,
      });
      popup.success('Action taken successfully...');
      setChoice('');
      setUserId('');
      setRemarks('');
      setFile(null);
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to take action. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card ds-card mb-4">
      <div className="card-header">
        <div className="card-title">
          <i className={`bi ${panel.icon}`} />
          {panel.title}
        </div>
      </div>
      <div className="card-body">
        {panel.caption && <p className="small text-muted mb-3">{panel.caption}</p>}
        <form onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Please select one of the option</label>
            {panel.controls.map((ctrl) => (
              <div className="form-check" key={ctrl.label}>
                <input
                  className="form-check-input"
                  type="radio"
                  name={`wf_${panel.title}`}
                  id={`wf_${panel.title}_${ctrl.label}`}
                  value={ctrl.label}
                  checked={choice === ctrl.label}
                  onChange={(e) => {
                    setChoice(e.target.value);
                    setUserId('');
                  }}
                />
                <label className="form-check-label small" htmlFor={`wf_${panel.title}_${ctrl.label}`}>
                  {ctrl.label}
                </label>
              </div>
            ))}
          </div>
          {needUser && (
            <div className="mb-3">
              <label className="form-label small fw-semibold">Select {USER_KIND_LABELS[needUser]}</label>
              <select className="form-select" value={userId} onChange={(e) => setUserId(e.target.value)} required>
                <option value="">--Select {USER_KIND_LABELS[needUser]}--</option>
                {userList.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}
          {choiceConf?.attach && (
            <div className="mb-3">
              <label className="form-label small fw-semibold">Attachment (PDF, max 20 MB)</label>
              <input
                type="file"
                className="form-control"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
            </div>
          )}
          <div className="mb-3">
            <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
            <RichEditor value={remarks} onChange={setRemarks} required />
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
            <i className="bi bi-send me-1" />Submit
          </button>
        </form>
      </div>
    </div>
  );
}

const INIT_MEMBER = {
  memName: '',
  memRegistrationNo: '',
  memCountryCode: '91',
  memMobileNo: '',
  memSTDCode: '',
  memLandlineNo: '',
  memProAddress: '',
  memCommAddress: '',
  memProState: '',
  memProCity: '',
  memCommStateId: '',
  memCommCityId: '',
  memProRegion: '',
  memCommRegion: '',
  memEmailID: '',
};

// Respondent's reply to the SO's "Written Statement sought" query (Status 15).
// Mirrors ViewDetailedComplaint.aspx (WSDiv / AnsDiv) + AnswerableMembers.aspx:
//   - Individual respondents file the Written Statement (Status 16) or an
//     Application under Rule 12 (Status 63) directly.
//   - Firm respondents first add the members answerable for the complaint, then
//     each answerable member files their Written Statement; the case travels to
//     Status 16 only after every answerable member has filed.
// Both replies are routed back to the SO who sought the statement.
function RespondentStatementCard({ compId, c, onRefresh }) {
  const popup = usePopups();
  const [mode, setMode] = useState(''); // '' | 'yes' | 'no'
  const [mapOpen, setMapOpen] = useState(false);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [lookupNo, setLookupNo] = useState('');
  const [lookupDob, setLookupDob] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [member, setMember] = useState(INIT_MEMBER);
  const [ansBusy, setAnsBusy] = useState(false);
  const [choice, setChoice] = useState('');
  const [respFile, setRespFile] = useState(null);
  const [respRemarks, setRespRemarks] = useState('');
  const [respBusy, setRespBusy] = useState(false);

  const isFirm = Number(c.IsFirm) === 1;
  const answerable = c.answerable || [];
  const ask = isFirm && answerable.length === 0 && mode === '';
  const showForm = isFirm && (mode === 'yes' || mapOpen);
  const canFile = !isFirm || answerable.length > 0 || mode === 'no';
  const queryLetters = (c.statusHistory || []).filter((h) => Number(h.StatusID) === 15 && h.Attachment);

  const patchMember = (updates) => setMember((m) => ({ ...m, ...updates }));

  useEffect(() => {
    api.get('/masters/3').then((res) => setStates(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (member.memCommStateId) {
      api
        .get(`/masters/7?option1=${member.memCommStateId}`)
        .then((res) => setCities(res.data || []))
        .catch(() => setCities([]));
    } else {
      setCities([]);
    }
  }, [member.memCommStateId]);

  const lookupMemberDetails = async () => {
    if (!lookupNo.trim()) {
      popup.warning('Please enter the Membership No.');
      return;
    }
    if (!/^\d+$/.test(lookupNo.trim())) {
      popup.warning('Please enter a valid Membership No.');
      return;
    }
    setLookupBusy(true);
    try {
      const rec = await api.post('/auth/member-lookup', {
        membershipNo: lookupNo.trim(),
        dob: lookupDob || undefined,
      });
      const st =
        (rec.professionalState &&
          states.find(
            (s) =>
              s.label === String(rec.professionalState).trim().toUpperCase() ||
              String(rec.professionalState).trim().toUpperCase().includes(s.label) ||
              s.label.includes(String(rec.professionalState).trim().toUpperCase())
          )) ||
        null;
      const region = st?.Region || '';
      patchMember({
        memRegistrationNo: lookupNo.trim(),
        memName: rec.name || '',
        memEmailID: rec.email || '',
        memMobileNo: rec.mobile || '',
        memProAddress: rec.professionalAddress || '',
        memProState: rec.professionalState || '',
        memProCity: rec.city || '',
        memProRegion: region,
        memCommRegion: member.memCommRegion || region,
        memCommStateId: st ? String(st.value) : member.memCommStateId,
      });
      if (!rec.name) popup.warning('Member details not found.');
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Unable to fetch member details. Please try again.');
    } finally {
      setLookupBusy(false);
    }
  };

  const saveAnswerable = async (e) => {
    e.preventDefault();
    if (!member.memName.trim()) {
      popup.warning('Please enter Member Name.');
      return;
    }
    if (!member.memRegistrationNo.trim()) {
      popup.warning('Please enter Member Registration No.');
      return;
    }
    if (!/^\d+$/.test(member.memRegistrationNo.trim())) {
      popup.warning('Please enter a valid Answerable Membership No.');
      return;
    }
    if (!member.memCommStateId) {
      popup.warning('Please Select Communication State.');
      return;
    }
    if (!member.memCommCityId) {
      popup.warning('Please Select Communication City.');
      return;
    }
    setAnsBusy(true);
    try {
      await api.post(`/complaints/${id}/answerable`, {
        ...member,
      });
      popup.success('Answerable member added successfully');
      setMode('');
      setMember(INIT_MEMBER);
      setLookupNo('');
      setLookupDob('');
      api.get(`/complaints/${id}`).then((res) => setC(res.data));
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to add answerable member.');
    } finally {
      setAnsBusy(false);
    }
  };

  const deleteAnswerable = async (m) => {
    if (!window.confirm(`Remove ${m.MemName} from the answerable members?`)) return;
    try {
      await api.delete(`/complaints/${compId}/answerable/${m.AMemID}`);
      onRefresh();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to remove the member.');
    }
  };

  const setSeniorAnswerable = async (m) => {
    if (Number(m.IsSenior) === 1) return;
    try {
      await api.put(`/complaints/${compId}/answerable/${m.AMemID}/senior`, { senior: 1 });
      onRefresh();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to mark as signatory.');
    }
  };

  const submitResponse = async (e) => {
    e.preventDefault();
    if (choice === '') {
      popup.warning('Please select one of the option.');
      return;
    }
    if (!respRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    if (!respFile) {
      popup.warning('Please upload the document.');
      return;
    }
    const ext = respFile.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') {
      popup.warning('Only .pdf file format supported.');
      return;
    }
    if (respFile.size > 20 * 1024 * 1024) {
      popup.warning('Total File Size should be less than 20 MB.');
      return;
    }
    setRespBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', respFile);
      fd.append('type', 'respondent');
      const up = await api.post('/upload', fd);
      const res = await api.post(`/complaints/${compId}/respondent-response`, {
        kind: choice,
        remarks: respRemarks.trim(),
        attachment: up.data.path || up.data.filename || null,
      });
      popup.success(res.data.message || 'Action taken successfully.');
      setChoice('');
      setRespRemarks('');
      setRespFile(null);
      onRefresh();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to submit. Please try again.');
    } finally {
      setRespBusy(false);
    }
  };

  return (
    <div className="card ds-card mb-4">
      <div className="card-header">
        <div className="card-title">
          <i className="bi bi-envelope-paper" />
          Written Statement / Rule 12
        </div>
      </div>
      <div className="card-body">
        <p className="small text-muted mb-3">
          The SO has sought your written statement. Submit your written statement, or file an application under
          Rule 12 of the scheme, along with the supporting document.
        </p>
        {queryLetters.length > 0 && (
          <div className="mb-3">
            <div className="small fw-semibold mb-2">
              <i className="bi bi-file-earmark-pdf me-1" />
              Query letter issued with this written-statement request
            </div>
            {queryLetters.map((h, i) => (
              <div className="d-flex flex-wrap gap-2 align-items-center" key={`ql-${h.CompStatusID || i}`}>
                <span className="small text-muted rich-remark" dangerouslySetInnerHTML={{ __html: sanitizeHtml(h.Remarks) || 'Query letter' }} />
                <a
                  className="btn btn-sm btn-outline-primary"
                  href={`/documents/${h.Attachment}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="bi bi-eye me-1" />View
                </a>
                <a
                  className="btn btn-sm btn-outline-secondary"
                  href={`/documents/${h.Attachment}`}
                  download
                >
                  <i className="bi bi-download me-1" />Download
                </a>
              </div>
            ))}
          </div>
        )}

        {isFirm && (
          <div className="small text-muted mb-3">
            <i className="bi bi-info-circle me-1" />
            Registered as a firm with {answerable.length} answerable member(s). Each answerable member must file
            their written statement separately.
          </div>
        )}

        {ask && (
          <div className="mb-4">
            <label className="form-label small fw-semibold">Do you want to add Answerable members?</label>
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="ansQuestion"
                id="ansYes"
                checked={mode === 'yes'}
                onChange={() => setMode('yes')}
              />
              <label className="form-check-label small" htmlFor="ansYes">Yes</label>
            </div>
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="ansQuestion"
                id="ansNo"
                checked={mode === 'no'}
                onChange={() => setMode('no')}
              />
              <label className="form-check-label small" htmlFor="ansNo">No</label>
            </div>
          </div>
        )}

        {isFirm && (answerable.length > 0 || mode === 'yes' || mapOpen) && (
          <div className="mb-4">
            {answerable.length > 0 && (
              <div className="table-responsive mb-2">
                <table className="table data-table mb-0">
                  <thead>
                    <tr>
                      <th>Answerable Member</th>
                      <th>Registration</th>
                      <th>Signatory</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {answerable.map((m) => (
                      <tr key={m.AMemID}>
                        <td>{m.MemName}</td>
                        <td className="text-muted">{m.MemRegistrationNo || '—'}</td>
                        <td>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={Number(m.IsSenior) === 1}
                            onChange={() => setSeniorAnswerable(m)}
                            title="Mark as signatory"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => deleteAnswerable(m)}
                          >
                            <i className="bi bi-trash3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!mapOpen ? (
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setMapOpen(true)}>
                {answerable.length > 0 ? <><i className="bi bi-plus-circle me-1" />Add another member</> : <><i className="bi bi-person-plus me-1" />Add members answerable</>}
              </button>
            ) : (
              <form onSubmit={saveAnswerable}>

                <div className="row g-2 mb-2">
                  <div className="col-8">
                    <label className="form-label small fw-semibold">Membership No <span className="text-danger">*</span></label>
                    <input
                      className="form-control"
                      value={lookupNo}
                      maxLength={6}
                      onChange={(e) => {
                        setLookupNo(e.target.value.replace(/\D/g, ''));
                        patchMember({ memRegistrationNo: e.target.value.replace(/\D/g, '') });
                      }}
                    />
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold">DOB</label>
                    <input type="date" className="form-control" value={lookupDob} onChange={(e) => setLookupDob(e.target.value)} />
                  </div>
                  <div className="col-12">
                    <button type="button" className="btn btn-sm btn-outline-secondary w-100" disabled={lookupBusy} onClick={lookupMemberDetails}>
                      {lookupBusy ? <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" /> : <i className="bi bi-search me-1" />}
                      Get Member Details
                    </button>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold">Member Name <span className="text-danger">*</span></label>
                  <input className="form-control" value={member.memName} onChange={(e) => patchMember({ memName: e.target.value })} required />
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-4">
                    <label className="form-label small fw-semibold">Country Code</label>
                    <input className="form-control" value={member.memCountryCode} maxLength={3} onChange={(e) => patchMember({ memCountryCode: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold">Mobile</label>
                    <input className="form-control" value={member.memMobileNo} maxLength={10} onChange={(e) => patchMember({ memMobileNo: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold">STD Code</label>
                    <input className="form-control" value={member.memSTDCode} maxLength={4} onChange={(e) => patchMember({ memSTDCode: e.target.value.replace(/\D/g, '') })} />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold">Landline No</label>
                  <input className="form-control" value={member.memLandlineNo} maxLength={10} onChange={(e) => patchMember({ memLandlineNo: e.target.value.replace(/\D/g, '') })} />
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold">Professional Address</label>
                  <input className="form-control" value={member.memProAddress} onChange={(e) => patchMember({ memProAddress: e.target.value })} />
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold">Professional State</label>
                  <input className="form-control" value={member.memProState} readOnly />
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold">Professional City</label>
                  <input className="form-control" value={member.memProCity} readOnly />
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label small fw-semibold">Communication State <span className="text-danger">*</span></label>
                    <select
                      className="form-select"
                      value={member.memCommStateId}
                      onChange={(e) => {
                        const st = states.find((s) => String(s.value) === e.target.value);
                        patchMember({
                          memCommStateId: e.target.value,
                          memCommCityId: '',
                          memCommRegion: st?.Region || member.memCommRegion,
                        });
                      }}
                      required
                    >
                      <option value="">--Select State--</option>
                      {states.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold">Communication City <span className="text-danger">*</span></label>
                    <select
                      className="form-select"
                      value={member.memCommCityId}
                      onChange={(e) => patchMember({ memCommCityId: e.target.value })}
                      required
                      disabled={!member.memCommStateId}
                    >
                      <option value="">--Select City--</option>
                      {cities.map((ci) => (
                        <option key={ci.value} value={ci.value}>{ci.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold">Communication Address</label>
                  <input className="form-control" value={member.memCommAddress} onChange={(e) => patchMember({ memCommAddress: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Email ID</label>
                  <input type="email" className="form-control" value={member.memEmailID} onChange={(e) => patchMember({ memEmailID: e.target.value })} />
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary flex-fill" disabled={ansBusy}>
                    {ansBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-person-plus me-1" />Save
                  </button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setMapOpen(false)}>
                    <i className="bi bi-x-lg" />
                  </button>
                </div>
              </form>
            )}

            {ask && answerable.length === 0 && (
              <div className="mt-2">
                <button type="button" className="btn btn-link btn-sm p-0 small" onClick={() => setMode('no')}>
                  No, I do not want to add answerable members
                </button>
              </div>
            )}
          </div>
        )}

        {canFile && (
          <form onSubmit={submitResponse} className="mb-0">
            <div className="mb-3">
              <label className="form-label small fw-semibold">Please select one of the option</label>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="respChoice"
                  id="respWritten"
                  value="written"
                  checked={choice === 'written'}
                  onChange={(e) => setChoice(e.target.value)}
                />
                <label className="form-check-label small" htmlFor="respWritten">
                  Submit Written Statement
                </label>
              </div>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="respChoice"
                  id="respRule12"
                  value="rule12"
                  checked={choice === 'rule12'}
                  onChange={(e) => setChoice(e.target.value)}
                />
                <label className="form-check-label small" htmlFor="respRule12">
                  Application Under Rule 12
                </label>
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Attachment (PDF, max 20 MB)</label>
              <input
                type="file"
                className="form-control"
                accept=".pdf"
                onChange={(e) => setRespFile(e.target.files[0] || null)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
              <RichEditor value={respRemarks} onChange={setRespRemarks} required />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={respBusy}>
              {respBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
              <i className="bi bi-send me-1" />Submit
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ComplainantRejoinderCard({ compId, c, onRefresh }) {
  const popup = usePopups();
  const [rejFile, setRejFile] = useState(null);
  const [rejRemarks, setRejRemarks] = useState('');
  const [rejBusy, setRejBusy] = useState(false);

  const issuedDocs = (c.statusHistory || []).filter(
    (h) => h.Attachment && [15, 22].includes(Number(h.StatusID))
  );

  const submitRejoinder = async (e) => {
    e.preventDefault();
    if (!rejRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    if (!rejFile) {
      popup.warning('Please upload the rejoinder document.');
      return;
    }
    const ext = rejFile.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') {
      popup.warning('Only .pdf file format supported.');
      return;
    }
    if (rejFile.size > 20 * 1024 * 1024) {
      popup.warning('Total File Size should be less than 20 MB.');
      return;
    }
    setRejBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', rejFile);
      fd.append('type', 'respondent');
      const up = await api.post('/upload', fd);
      const res = await api.post(`/complaints/${compId}/complainant-rejoinder`, {
        remarks: rejRemarks.trim(),
        attachment: up.data.path || up.data.filename || null,
      });
      popup.success(res.data.message || 'Action taken successfully.');
      setRejRemarks('');
      setRejFile(null);
      onRefresh();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to submit. Please try again.');
    } finally {
      setRejBusy(false);
    }
  };

  return (
    <div className="card ds-card mb-4">
      <div className="card-header">
        <div className="card-title">
          <i className="bi bi-reply" />
          Rejoinder to the Written Statement
        </div>
      </div>
      <div className="card-body">
        <p className="small text-muted mb-3">
          The respondent has submitted their written statement. Submit your rejoinder, with the supporting document,
          to reply to the statement of defence.
        </p>


        {issuedDocs.length > 0 && (
          <div className="mb-3">
            <div className="small fw-semibold mb-2">
              <i className="bi bi-file-earmark-pdf me-1" />
              Letters / documents issued in this matter
            </div>
            {issuedDocs.map((h, i) => (
              <div className="d-flex flex-wrap gap-2 align-items-center" key={`rj-doc-${h.CompStatusID || i}`}>
                <span className="small text-muted">
                  {statusText(h.StatusName) || 'Document'} — <span className="rich-remark" dangerouslySetInnerHTML={{ __html: sanitizeHtml(h.Remarks) || 'Document' }} />
                </span>
                <a className="btn btn-sm btn-outline-primary" href={`/documents/${h.Attachment}`} target="_blank" rel="noreferrer">
                  <i className="bi bi-eye me-1" />View
                </a>
                <a className="btn btn-sm btn-outline-secondary" href={`/documents/${h.Attachment}`} download>
                  <i className="bi bi-download me-1" />Download
                </a>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submitRejoinder} className="mb-0">
          <div className="mb-3">
            <label className="form-label small fw-semibold">Rejoinder Document <span className="text-danger">*</span></label>
            <input
              type="file"
              className="form-control"
              accept=".pdf"
              onChange={(e) => setRejFile(e.target.files[0] || null)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
            <RichEditor value={rejRemarks} onChange={setRejRemarks} required />
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={rejBusy}>
            {rejBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
            <i className="bi bi-send me-1" />Submit Rejoinder
          </button>
        </form>
      </div>
    </div>
  );
}

// The Complainant's reply to the SO's "Additional Document" query (Status 51).
// The SO calls for an additional document (status 56 -> 51); the Complainant
// uploads it here (recorded at Status 52) and the case is routed back to the SO who
// called for it (Status 59 - Assigned to SO After Additional Documents).
function AdditionalDocumentCard({ compId, c, onRefresh }) {
  const popup = usePopups();
  const [admFile, setAdmFile] = useState(null);
  const [admRemarks, setAdmRemarks] = useState('');
  const [admBusy, setAdmBusy] = useState(false);

  const queryLetters = (c.statusHistory || []).filter((h) => Number(h.StatusID) === 51 && h.Attachment);

  const submitAdditionalDocument = async (e) => {
    e.preventDefault();
    if (!admRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    if (!admFile) {
      popup.warning('Please upload the additional document.');
      return;
    }
    const ext = admFile.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') {
      popup.warning('Only .pdf file format supported.');
      return;
    }
    if (admFile.size > 20 * 1024 * 1024) {
      popup.warning('Total File Size should be less than 20 MB.');
      return;
    }
    setAdmBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', admFile);
      fd.append('type', 'respondent');
      const up = await api.post('/upload', fd);
      await api.post(`/complaints/${compId}/additional-document`, {
        remarks: admRemarks.trim(),
        attachment: up.data.path || up.data.filename || null,
      });
      popup.success('Additional document submitted. The case has been routed to the SO.');
      setAdmRemarks('');
      setAdmFile(null);
      onRefresh();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to submit. Please try again.');
    } finally {
      setAdmBusy(false);
    }
  };

  return (
    <div className="card ds-card mb-4">
      <div className="card-header">
        <div className="card-title">
          <i className="bi bi-file-earmark-plus" />
          Additional Document Submitted by the Complainant
        </div>
      </div>
      <div className="card-body">
        <p className="small text-muted mb-3">
          The SO has called for an additional document in this matter. Upload the additional document required,
          along with the supporting document.
        </p>
        {queryLetters.length > 0 && (
          <div className="mb-3">
            <div className="small fw-semibold mb-2">
              <i className="bi bi-file-earmark-pdf me-1" />
              Query letter issued with this additional-document request
            </div>
            {queryLetters.map((h, i) => (
              <div className="d-flex flex-wrap gap-2 align-items-center" key={`ad-q-${h.CompStatusID || i}`}>
                <span
                  className="small text-muted rich-remark"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(h.Remarks) || 'Query letter' }}
                />
                <a className="btn btn-sm btn-outline-primary" href={`/documents/${h.Attachment}`} target="_blank" rel="noreferrer">
                  <i className="bi bi-eye me-1" />View
                </a>
                <a className="btn btn-sm btn-outline-secondary" href={`/documents/${h.Attachment}`} download>
                  <i className="bi bi-download me-1" />Download
                </a>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={submitAdditionalDocument} className="mb-0">
          <div className="mb-3">
            <label className="form-label small fw-semibold">Additional Document <span className="text-danger">*</span></label>
            <input
              type="file"
              className="form-control"
              accept=".pdf"
              onChange={(e) => setAdmFile(e.target.files[0] || null)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
            <RichEditor value={admRemarks} onChange={setAdmRemarks} required />
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={admBusy}>
            {admBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
            <i className="bi bi-send me-1" />Submit Additional Document
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ComplaintDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [soMembers, setSoMembers] = useState([]);
  const [soId, setSoId] = useState('');
  const [ddRemarks, setDdRemarks] = useState('');
  const [ddFile, setDdFile] = useState(null);
  const [ddBusy, setDdBusy] = useState(false);
  const [officers, setOfficers] = useState([]);
  const [soEntity, setSoEntity] = useState('');
  const [soNatureOption, setSoNatureOption] = useState('');
  const [soNatureOther, setSoNatureOther] = useState('');
  const [soClubbing, setSoClubbing] = useState('Registration');
  const [soRemarks, setSoRemarks] = useState('');
  const [soFile, setSoFile] = useState(null);
  const [soAction, setSoAction] = useState('');
  const [soOfficer, setSoOfficer] = useState('');
  const [soBusy, setSoBusy] = useState(false);
  const [soSimilarCandidates, setSoSimilarCandidates] = useState([]);
  const [soSimilarLinked, setSoSimilarLinked] = useState([]);
  const [soPrimarySimilar, setSoPrimarySimilar] = useState('');
  const [soSimilarLoading, setSoSimilarLoading] = useState(false);
  const [ddClubbingDecision, setDdClubbingDecision] = useState('');
  const [ddClubbingRemarks, setDdClubbingRemarks] = useState('');
  const [ddClubbingBusy, setDdClubbingBusy] = useState(false);
  const [cmDecision, setCmDecision] = useState('');
  const [cmRemarks, setCmRemarks] = useState('');
  const [cmBusy, setCmBusy] = useState(false);
  const [soComFile, setSoComFile] = useState(null);
  const [soComRemarks, setSoComRemarks] = useState('');
  const [soComBusy, setSoComBusy] = useState(false);
  const [roMembers, setRoMembers] = useState([]);
  const [bodMembers, setBodMembers] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [wfCommittee, setWfCommittee] = useState('');
  // Rule 5(4) - the Director's decision on a new complaint against a previous one.
  const [dd54Choice, setDd54Choice] = useState('');
  // Rule 6 - withdrawal of a complaint.
  const [wdRemarks, setWdRemarks] = useState('');
  const [wdFile, setWdFile] = useState(null);
  const [wdBusy, setWdBusy] = useState(false);
  const [placeChoice, setPlaceChoice] = useState('');
  const [primaFacie, setPrimaFacie] = useState('');
  const [placeRemarks, setPlaceRemarks] = useState('');
  const [placeBusy, setPlaceBusy] = useState(false);
  const [ddMembers, setDdMembers] = useState([]);
  const [woMembers, setWoMembers] = useState([]);
  const [scSheet, setScSheet] = useState({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scBusy, setScBusy] = useState(false);
  const [woDecision, setWoDecision] = useState('');
  const [woDdId, setWoDdId] = useState('');
  const [woRemarks, setWoRemarks] = useState('');
  const [woBusy, setWoBusy] = useState(false);
  const popup = usePopups();

  useEffect(() => {
    api
      .get(`/complaints/${id}`)
      .then((res) => setC(res.data))
      .catch(() => navigate('/complaints'))
      .finally(() => setLoading(false));
    api
      .get('/masters/6?option1=5')
      .then((res) => setSoMembers(res.data || []))
      .catch(() => {});
    api
      .get('/masters/6?option1=7')
      .then((res) => setOfficers(res.data || []))
      .catch(() => {});
    api
      .get('/masters/6?option1=10')
      .then((res) => setRoMembers(res.data || []))
      .catch(() => {});
    api
      .get('/masters/6?option1=6')
      .then((res) => setBodMembers(res.data || []))
      .catch(() => {});
    api
      .get('/masters/6?option1=4')
      .then((res) => setDdMembers(res.data || []))
      .catch(() => {});
    api
      .get('/masters/6?option1=13')
      .then((res) => setWoMembers(res.data || []))
      .catch(() => {});
    api
      .get('/masters/14')
      .then((res) => setCommittees(res.data || []))
      .catch(() => {});
  }, [id, navigate]);

  useEffect(() => {
    if (c) {
      setSoEntity(c.EntityMisconduct || '');
      setSoNatureOption(c.NatureOfAllegation || '');
      setSoNatureOther(c.NatureDatails || '');
      if (c.ScrutinySheet) {
        try {
          setScSheet(JSON.parse(c.ScrutinySheet));
        } catch {
          setScSheet({});
        }
      } else {
        // Nothing saved yet - pull the auto-filled sheet so every factual cell
        // is already populated before the Scrutiny Officer starts.
        setScSheet({});
        api
          .get(`/complaints/${id}/scrutiny/prefill`)
          .then((res) => setScSheet(res.data || {}))
          .catch(() => {});
      }
    }
  }, [c]);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/complaints');
    }
  };

  const reload = () => api.get(`/complaints/${id}`).then((res) => setC(res.data)).catch(() => {});

  const wfMembers = { so: soMembers, officer: officers, ro: roMembers, bod: bodMembers };

  const workflowTransition = async ({ statusId, userToId, remarks, file, commonField, decisionValue, clubbedWithCompId }) => {
    let attachment = null;
    if (file) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'workflow');
      const up = await api.post('/upload', fd);
      attachment = up.data.path || up.data.filename || null;
    }
    let targetStatus = statusId;
    if (targetStatus === 'RETURN_TO_PREV') {
      // Rule 6: declining the withdrawal returns the complaint to the stage it
      // was at when the letter of withdrawal was received.
      targetStatus = rule6ReturnStatus(c?.statusHistory);
    }
    await api.post(`/complaints/${id}/status`, {
      statusId: targetStatus,
      userToId: userToId || undefined,
      remarks,
      attachment,
      commonField,
      decisionValue,
      clubbedWithCompId,
    });
    reload();
  };

  const scSheetSaved = !!(c?.ScrutinySheet && c.ScrutinySheet.trim());

  const saveScrutinySheet = async () => {
    if (!scSheet || !Object.keys(scSheet).some((k) => String(scSheet[k] || '').trim() !== '')) {
      popup.warning('Please fill the Scrutiny Sheet before submitting.');
      return;
    }
    setScBusy(true);
    try {
      await api.put(`/complaints/${id}/scrutiny`, {
        entityMisconduct: soEntity.trim(),
        natureOfAllegation: soNatureOption,
        natureDetails: soNatureOther.trim(),
        scrutinySheet: scSheet,
      });
      popup.success('Scrutiny Sheet submitted successfully');
      setSheetOpen(false);
      reload();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to save Scrutiny Sheet. Please try again.');
    } finally {
      setScBusy(false);
    }
  };

  const clearScrutinySheet = () => {
    if (!window.confirm('Clear every entry on this sheet?')) return;
    setScSheet({});
  };

  // DC Flow #104/#123: the Working Officer (WO) reviews the SO's recommendation.
  //   Agree    -> Status 5 (Recommendation to DD) - the DD decides Agree/Disagree.
  //   Disagree -> Status 2 (Scrutiny) back to the SO for further action.
  const submitWO = async (e) => {
    e.preventDefault();
    if (!woDecision) {
      popup.warning('Please select one of the option.');
      return;
    }
    if (woDecision === 'agree' && !woDdId) {
      popup.warning('Please select the Director Discipline (DD).');
      return;
    }
    if (!woRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    setWoBusy(true);
    try {
      const rec = (c.statusHistory || []).find((h) => Number(h.StatusID) === 124) || null;
      const targetId = woDecision === 'agree' ? 5 : 2;
      const userToId = woDecision === 'agree' ? Number(woDdId) : null;
      await api.post(`/complaints/${id}/status`, {
        statusId: targetId,
        userToId,
        remarks: woRemarks.trim(),
        commonField: rec ? rec.CommonField : undefined,
      });
      popup.success('Action taken successfully');
      setWoDecision('');
      setWoDdId('');
      setWoRemarks('');
      reload();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to take action. Please try again.');
    } finally {
      setWoBusy(false);
    }
  };

  const assignToSO = async (e) => {
    e.preventDefault();
    if (!soId) {
      popup.warning('Please select an SO member.');
      return;
    }
    if (ddFile) {
      const ext = ddFile.name.split('.').pop().toLowerCase();
      if (ext !== 'pdf') {
        popup.warning('Only .pdf file format supported.');
        return;
      }
      if (ddFile.size > 20 * 1024 * 1024) {
        popup.warning('Total File Size should be less than 20 MB.');
        return;
      }
    }
    setDdBusy(true);
    try {
      let attachment = null;
      if (ddFile) {
        const fd = new FormData();
        fd.append('file', ddFile);
        fd.append('type', 'ddtoSO');
        const up = await api.post('/upload', fd);
        attachment = up.data.path || up.data.filename || null;
      }
      await api.post(`/complaints/${id}/status`, {
        statusId: 2,
        userToId: Number(soId),
        remarks: ddRemarks || null,
        attachment,
      });
      popup.success('Assigned To SO Successfully...');
      setDdRemarks('');
      setDdFile(null);
      setSoId('');
      reload();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed To Assign. Please try again.');
    } finally {
      setDdBusy(false);
    }
  };

  const loadSimilarCandidates = async () => {
    setSoSimilarLoading(true);
    try {
      const res = await api.get(`/complaints/${id}/similar-candidates`);
      setSoSimilarCandidates(res.data);
      const linked = res.data.filter((x) => Number(x.IsLinked) === 1).map((x) => Number(x.CompID));
      setSoSimilarLinked(linked);
      setSoPrimarySimilar(linked.length ? String(linked[0]) : '');
    } catch {
      setSoSimilarCandidates([]);
    } finally {
      setSoSimilarLoading(false);
    }
  };

  const toggleSimilar = (cid) => {
    const next = soSimilarLinked.includes(cid) ? soSimilarLinked.filter((x) => x !== cid) : [...soSimilarLinked, cid];
    setSoSimilarLinked(next);
    if (!next.includes(Number(soPrimarySimilar))) setSoPrimarySimilar(next.length ? String(next[0]) : '');
  };

  const submitSoAction = async (e) => {
    e.preventDefault();
    if (!soEntity.trim()) {
      popup.warning('Please enter Entity in respect of which misconduct alleged.');
      return;
    }
    if (!soRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    if (!soAction) {
      popup.warning('Please select one of the option.');
      return;
    }
    if (soAction === 'similar' && soSimilarLinked.length === 0) {
      popup.warning('Please select at least one similar complaint.');
      return;
    }
    if (soAction === 'similar' && !soPrimarySimilar) {
      popup.warning('Please select the previous complaint whose stage this complaint should follow.');
      return;
    }
    if (soAction === 'defect' && !soFile) {
      popup.warning('Please upload documents.');
      return;
    }
    if (soAction === 'recommendDD' && !soClubbing) {
      popup.warning('Please select Recommendation Clubbing/Closure.');
      return;
    }
    if (soAction === 'assignOfficer' && !soOfficer) {
      popup.warning('Please select a Officer.');
      return;
    }
    if (soAction === 'recommendDD' && woMembers.length === 0) {
      popup.warning('No Working Officer (WO) account found. Please create a WO user (UserType 13).');
      return;
    }
    if (soFile) {
      const ext = soFile.name.split('.').pop().toLowerCase();
      if (ext !== 'pdf') {
        popup.warning('Only .pdf file format supported.');
        return;
      }
      if (soFile.size > 20 * 1024 * 1024) {
        popup.warning('Total File Size should be less than 20 MB.');
        return;
      }
    }
    setSoBusy(true);
    try {
      if (soAction === 'similar') {
        await api.put(`/complaints/${id}/similar`, {
          compIds: soSimilarLinked,
          primaryCompId: Number(soPrimarySimilar),
        });
        popup.success('Marked as similar; complaint moved to the same stage as the previous complaint.');
        setSoRemarks('');
        setSoAction('');
        setSoSimilarCandidates([]);
        setSoSimilarLinked([]);
        setSoPrimarySimilar('');
        reload();
        return;
      }
      await api.put(`/complaints/${id}/scrutiny`, {
        entityMisconduct: soEntity.trim(),
        natureOfAllegation: soNatureOption,
        natureDetails: soNatureOther.trim(),
      });
      let attachment = null;
      if (soFile) {
        const fd = new FormData();
        fd.append('file', soFile);
        fd.append('type', 'soaction');
        const up = await api.post('/upload', fd);
        attachment = up.data.path || up.data.filename || null;
      }
      let statusId;
      let userToId = null;
      if (soAction === 'defect') {
        statusId = 3;
        userToId = c.UserID;
      } else if (soAction === 'recommendDD') {
        // DC Flow #103: NO DEFECT -> Recommend to WO (Status 124). The Working
        // Officer then reviews and forwards the recommendation to the DD (Status 5)
        // or sends it back to the SO. The recommendation type (CommonField) is
        // carried for the DD decision.
        statusId = 124;
        userToId = woMembers.length ? Number(woMembers[0].value) : null;
      } else {
        statusId = 53;
        userToId = Number(soOfficer);
      }
      await api.post(`/complaints/${id}/status`, {
        statusId,
        userToId,
        remarks: soRemarks.trim(),
        attachment,
        commonField: soAction === 'recommendDD' ? soClubbing : undefined,
      });
      popup.success('Action taken successfully...');
      setSoRemarks('');
      setSoFile(null);
      setSoAction('');
      setSoOfficer('');
      setSoNatureOption('');
      setSoNatureOther('');
      setSoClubbing('Registration');
      setSoSimilarCandidates([]);
      setSoSimilarLinked([]);
      setSoPrimarySimilar('');
      reload();
    } catch (ex) {
      popup.error(ex?.response?.data?.error || 'Failed to take action. Please try again.');
    } finally {
      setSoBusy(false);
    }
  };

  // Status 5 - the Director Discipline decides on the recommendation forwarded
  // by the Working Officer (DC Flow #103/#104/#123). The decision is driven by
  // the recommendation type chosen by the SO/WO:
  //   Registration              -> Agree registration (status 50) or send it back
  //                                to the SO (status 2).
  //   Clubbing before Director  -> Agree clubs it (status 66, the SO communicates
  //                                the decision) or Disagree returns it to the SO
  //                                (status 4).
  //   Clubbing before Committee -> Agree places it before the selected Committee /
  //                                Board of Discipline (status 69) or Disagree
  //                                returns it to the SO (status 4).
  //   Closure before Committee  -> Agree places it before the Committee for
  //                                closure (status 68) or Disagree returns it to
  //                                the SO (status 4).
  const submitDDDecision = async (e) => {
    e.preventDefault();
    if (!dd54Choice) {
      popup.warning('Please select one of the option.');
      return;
    }
    if (soRecType === 'Clubbing before Committee' && dd54Choice === 'agree' && !wfCommittee) {
      popup.warning('Please select the Committee / Board of Discipline.');
      return;
    }
    if (!ddClubbingRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    // The SO who made the recommendation receives the case back. The status-124
    // row records UserID = the SO; the status-5 row falls back to the same.
    const history = c.statusHistory || [];
    const soUserRow =
      history.find((h) => Number(h.StatusID) === 124) ||
      history.find((h) => Number(h.StatusID) === 5) ||
      null;
    const soUserId = soUserRow?.UserID || null;
    const remarks = ddClubbingRemarks.trim();
    const agree = dd54Choice === 'agree';

    let target;
    let msg;
    let commonField;
    let userToId;
    if (soRecType === 'Registration') {
      if (agree) {
        target = 50;
        userToId = soUserId || undefined;
        msg = 'Recommendation agreed. The SO will send the query for the Respondent\'s written statement.';
      } else {
        target = 2;
        userToId = soUserId || undefined;
        msg = 'Sent back to the SO for further action.';
      }
    } else if (soRecType === 'Clubbing before Director') {
      if (agree) {
        target = 66;
        userToId = soUserId || undefined;
        msg = 'Clubbing agreed. The SO will communicate the decision to the complainant and the respondent.';
      } else {
        target = 4;
        userToId = soUserId || undefined;
        msg = 'Not agreed. Sent back to the SO for further action.';
      }
    } else if (soRecType === 'Clubbing before Committee') {
      if (agree) {
        target = 69;
        commonField = `Clubbing before Committee | placed before ${wfCommittee}`;
        msg = `Placed before ${wfCommittee} for the clubbing decision.`;
      } else {
        target = 4;
        userToId = soUserId || undefined;
        msg = 'Not agreed. Sent back to the SO for further action.';
      }
    } else {
      // Closure before Committee
      if (agree) {
        target = 68;
        msg = 'Placed before the Committee for closure.';
      } else {
        target = 4;
        userToId = soUserId || undefined;
        msg = 'Not agreed. Sent back to the SO for further action.';
      }
    }
    setDdClubbingBusy(true);
    try {
      await api.post(`/complaints/${id}/status`, {
        statusId: target,
        userToId,
        remarks: `${remarks} - DD ${agree ? 'Agreed to' : 'Disagreed with'} ${soRecType}`,
        commonField,
      });
      popup.success(msg);
      setDd54Choice('');
      setWfCommittee('');
      setDdClubbingRemarks('');
      reload();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to submit decision. Please try again.');
    } finally {
      setDdClubbingBusy(false);
    }
  };

  // Rule 6 - the complainant e-mails a letter of withdrawal. The Director then
  // places it before the Board of Discipline / Committee, which may permit the
  // withdrawal at any stage. Proviso: while the Director has not yet formed his
  // prima facie opinion it must be placed before the Board of Discipline.
  const submitWithdrawal = async (e) => {
    e.preventDefault();
    if (!wdFile) {
      popup.warning('Please attach the letter of withdrawal.');
      return;
    }
    const ext = wdFile.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') {
      popup.warning('Only .pdf file format supported.');
      return;
    }
    if (wdFile.size > 20 * 1024 * 1024) {
      popup.warning('Total File Size should be less than 20 MB.');
      return;
    }
    if (!wdRemarks.trim()) {
      popup.warning('Please enter the reason for withdrawal.');
      return;
    }
    setWdBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', wdFile);
      fd.append('type', 'withdrawal');
      const up = await api.post('/upload', fd);
      const attachment = up.data.path || up.data.filename || null;
      // `from=<status>` records the stage the complaint must return to if the
      // Board of Discipline / Committee declines the withdrawal.
      await api.post(`/complaints/${id}/status`, {
        statusId: 127,
        remarks: `${wdRemarks.trim()} - Letter of withdrawal received`,
        attachment,
        commonField: `Rule 6 | from=${Number(c.StatusID)}`,
      });
      popup.success('Letter of withdrawal received. The Director Discipline will place it before the Board of Discipline / Committee.');
      setWdRemarks('');
      setWdFile(null);
      reload();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to submit the letter of withdrawal. Please try again.');
    } finally {
      setWdBusy(false);
    }
  };

  const submitRule6Placement = async (e) => {
    e.preventDefault();
    if (!placeRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    const pf = primaFacie || primaFacieDefault;
    if (pf === 'no' && placeChoice === 'committee') {
      popup.warning('Until the prima facie opinion is formed the complaint must be placed before the Board of Discipline.');
      return;
    }
    const target = placeEffective === 'committee' ? 129 : 128;
    setPlaceBusy(true);
    try {
      await api.post(`/complaints/${id}/status`, {
        statusId: target,
        remarks: `${placeRemarks.trim()} - Letter of withdrawal placed before the ${
          target === 129 ? 'Committee' : 'Board of Discipline'
        } (prima facie opinion ${pf})`,
        commonField: `Rule 6 | from=${rule6From}`,
      });
      popup.success(`Letter of withdrawal placed before the ${target === 129 ? 'Committee' : 'Board of Discipline'}.`);
      setPlaceRemarks('');
      setPlaceChoice('');
      setPrimaFacie('');
      reload();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to place the withdrawal. Please try again.');
    } finally {
      setPlaceBusy(false);
    }
  };

  // Clubbing / closure referred to a Committee (status 68 'Recommended to
  // Committee for Closure' and 69 'Recommendation to Committee from DD').
  //   Agree    -> status 66 (Clubbing Decision Communication) back to the SO,
  //               who attaches the letter and communicates it (status 123).
  //   Disagree -> status 2 (Scrutiny) back to the SO for further action.
  const submitCommitteeClubbing = async (e) => {
    e.preventDefault();
    if (!cmDecision) {
      popup.warning('Please select Agree or Disagree.');
      return;
    }
    if (!cmRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    // Who must receive the clubbing decision. A status-2 (Scrutiny) row records
    // UserID = the officer who sent it back (usually the DD) and UserToID = the
    // SO it was returned to, so the SO is the assignee. When the case has not
    // yet come back, fall back to the recommending SO on the status-124 row
    // (UserID = SO, UserToID = Working Officer).
    const history = c.statusHistory || [];
    const latestScrutiny = history
      .filter((h) => Number(h.StatusID) === 2 && h.UserToID)
      .sort((a, b) => new Date(b.StatusDate) - new Date(a.StatusDate))[0];
    const recommendingSo = [...history].reverse().find((h) => Number(h.StatusID) === 124);
    const soUserId =
      (latestScrutiny && Number(latestScrutiny.UserToID)) ||
      (recommendingSo && Number(recommendingSo.UserID)) ||
      null;
    if (!soUserId) {
      popup.warning('Could not work out which SO holds this case. Please contact the administrator.');
      setCmBusy(false);
      return;
    }
    const agree = cmDecision === 'agree';
    const target = agree ? 66 : 2;
    setCmBusy(true);
    try {
      await api.post(`/complaints/${id}/status`, {
        statusId: target,
        userToId: soUserId || undefined,
        remarks: `${cmRemarks.trim()} - Committee ${agree ? 'Agreed' : 'Disagreed'} to ${soRecType}`,
      });
      popup.success(
        agree
          ? 'Agreed successfully. Complaint sent to the SO to communicate the decision to the Respondent & Complainant.'
          : 'Disagreed successfully. Complaint sent back to the SO for further action.'
      );
      setCmDecision('');
      setCmRemarks('');
      reload();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to submit decision. Please try again.');
    } finally {
      setCmBusy(false);
    }
  };

  // SO communicates the clubbing decision (status 66) by attaching a letter
  // and sending it to the respondent and the complainant -> status 123.
  const submitSoCommunication = async (e) => {
    e.preventDefault();
    if (!soComRemarks.trim()) {
      popup.warning('Please enter remarks.');
      return;
    }
    if (!soComFile) {
      popup.warning('Please attach the letter.');
      return;
    }
    const ext = soComFile.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') {
      popup.warning('Only .pdf file format supported.');
      return;
    }
    if (soComFile.size > 20 * 1024 * 1024) {
      popup.warning('Total File Size should be less than 20 MB.');
      return;
    }
    setSoComBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', soComFile);
      fd.append('type', 'soaction');
      const up = await api.post('/upload', fd);
      const attachment = up.data.path || up.data.filename || null;
      const ddUserId = (c.statusHistory || []).find((h) => Number(h.StatusID) === 5)?.UserToID || null;
      await api.post(`/complaints/${id}/status`, {
        statusId: 123,
        userToId: ddUserId || undefined,
        remarks: soComRemarks.trim(),
        attachment,
      });
      popup.success('Letter sent to Respondent & Complainant successfully...');
      setSoComRemarks('');
      setSoComFile(null);
      reload();
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to send letter. Please try again.');
    } finally {
      setSoComBusy(false);
    }
  };

  const downloadPdf = async (kind) => {
    try {
      const res = await api.get(`/complaints/${id}/${kind}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      const baseName = String((c && c.CompNo) || id).replace(/[\\/]/g, '_');
      const names = {
        compilation: `Compilation_${baseName}.pdf`,
        scrutiny: `ScrutinySheet_${baseName}.pdf`,
      };
      a.download = names[kind] || `${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      popup.error('PDF download failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '40vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }
  if (!c) return <div className="alert alert-warning">Complaint not found</div>;

  const days = daysSince(c.EntryDate);
  const ut = Number(user?.UserType);
  const isComplainantOnly = ut === 3;
  // Only Admin (1) and DD (4) may view the complete communication/status history.
  // Every other user sees only the entries they themselves created/performed.
  const canViewAllHistory = ut === 1 || ut === 4;
  const visibleHistory = canViewAllHistory
    ? (c.statusHistory || [])
    : (c.statusHistory || []).filter((h) => Number(h.UserID) === Number(user?.UserID));
  const perDays = c.perDetails?.PERSignDate ? daysSince(c.perDetails.PERSignDate) : null;
  const statusLabel = (name, sid) => (Number(sid) === 82 ? 'Hearing Decision' : statusText(name));
  const isComplainant = Number(c.UserID) === Number(user?.UserID);
  const isRespondent = !!(user?.Email && c.ResEmailID && String(c.ResEmailID).trim().toLowerCase() === String(user.Email).trim().toLowerCase());
  const isAnswerableMember = !!((c.answerable || []).find(
    (m) => m.MemEmailID && String(m.MemEmailID).trim().toLowerCase() === String(user?.Email || '').trim().toLowerCase()
  ));
  const isParty = isComplainant || isRespondent || isAnswerableMember;
  const clubbingRec = (c.statusHistory || []).find((h) => Number(h.StatusID) === 123) || null;
  const clubbingDocs = (c.statusHistory || []).filter(
    (h) => h.Attachment && [66, 68, 69, 123].includes(Number(h.StatusID))
  );
  const soRec =
    (c.statusHistory || []).find((h) => Number(h.StatusID) === 5) ||
    (c.statusHistory || []).find((h) => Number(h.StatusID) === 124) ||
    null;
  const soRecType = (() => {
    const t = (soRec?.CommonField || '').trim().toUpperCase();
    if (t === 'REGISTRATION') return 'Registration';
    if (t === 'CLUBBING BEFORE COMMITTEE') return 'Clubbing before Committee';
    if (t === 'CLOSURE BEFORE COMMITTEE') return 'Closure before Committee';
    if (t === 'CLUBBING BEFORE DIRECTOR') return 'Clubbing before Director';
    return 'Registration';
  })();
  const isCommitteeRecommendation = soRecType === 'Clubbing before Committee' || soRecType === 'Closure before Committee';
  // 68 = Recommended to Committee for Closure, 69 = Recommendation to Committee from DD.
  // The committee marks its decision here, which is the last missing leg of the clubbing flow.
  const isCommitteeStage = [68, 69].includes(Number(c.StatusID));
  const isCommitteeActor = [6, 8].includes(ut);
  const ddActionStatuses = [5, 10, 18, 24, 31, 125, 126, 127, 128, 129, 130];
  const activePanels = WORKFLOW_PANELS.filter((p) => p.roles.includes(ut) && p.statuses.includes(Number(c.StatusID)));

  // An "action taken" window is valid only until the current user has actually
  // acted at the current status level. After that it stays hidden until the case
  // advances to the next reply stage. The newest history row decides who "acted".
  const latestHistory = (c.statusHistory || [])[0] || null;
  const iActedAtCurrent =
    !!latestHistory &&
    Number(latestHistory.StatusID) === Number(c.StatusID) &&
    Number(latestHistory.UserID) === Number(user?.UserID);

  // Rule 6 - where the letter of withdrawal stands and where it must be placed.
  const withdrawalRow = (c.statusHistory || []).find((h) => Number(h.StatusID) === 127) || null;
  const rule6From = rule6ReturnStatus(c.statusHistory);
  const primaFacieDefault = hasPrimaFacie(rule6From) ? 'yes' : 'no';
  const primaFacieEffective = primaFacie || primaFacieDefault;
  const placeDefault = primaFacieEffective === 'yes' && [68, 69].includes(rule6From) ? 'committee' : 'bod';
  const placeEffective = placeChoice || placeDefault;
  const rule54Clause = c.ClubRule ? String(c.ClubRule).toLowerCase() : '';

  return (
    <div>
      <div className="page-header">
        <div className="d-flex align-items-center gap-3">
          <button type="button" className="admin-btn-icon" onClick={goBack} aria-label="Go back">
            <i className="bi bi-arrow-left" />
          </button>
          <div>
            <h2 className="page-title mb-0">{c.CompNo}</h2>
            <p className="page-subtitle">
              {c.CompTypeName || 'Complaint'} · filed by {c.ComplainantName || '—'}
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <span className="header-date">Filed on {fmtDate(c.EntryDate)}</span>
          {perDays != null && (
            <span className="badge-soft badge-soft-warning" title={c.perDetails?.PERPlace || ''}>
              {perDays}d since PER
            </span>
          )}
          {days != null && (
            <span className={`badge-soft ${days > 30 ? 'badge-soft-danger' : days > 15 ? 'badge-soft-warning' : 'badge-soft-success'}`}>
              {days}d in system
            </span>
          )}
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => downloadPdf('form')}>
            <i className="bi bi-download me-1" />Download Form
          </button>
          {!isComplainantOnly && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => downloadPdf('scrutiny')}
              title="Download the Scrutiny Sheet with every value entered on the form"
            >
              <i className="bi bi-file-earmark-arrow-down me-1" />Download Scrutiny Sheet
            </button>
          )}
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => downloadPdf('compilation')}>
            <i className="bi bi-download me-1" />Download Compilation
          </button>
          <button
            type="button"
            className="admin-btn-icon"
            title="Refresh data"
            aria-label="Refresh data"
            onClick={reload}
          >
            <i className="bi bi-arrow-clockwise" />
          </button>
          {Number(c.UserID) === Number(user?.UserID) && Number(c.StatusID) === 3 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/file-complaint?edit=${id}`)}
            >
              <i className="bi bi-pencil me-1" />Edit Complaint
            </button>
          )}
        </div>
      </div>

      {c.ClubbedWithCompID && (
        <div className="alert alert-info d-flex align-items-start gap-2">
          <i className="bi bi-diagram-3 fs-5" />
          <div className="small">
            <strong>
              Clubbed under Rule 5(4){rule54Clause} with complaint {c.ClubbedWithCompNo || c.ClubbedWithCompID}
            </strong>
            <div className="mt-1">{RULE_54[rule54Clause] || RULE_54.a}</div>
            <div className="mt-1">
              <em>{RULE_54_PROVISO}</em>
            </div>
            <div className="mt-1">
              First complainant: <strong>{c.ClubbedWithComplainant || '—'}</strong> · Previous complaint status:{' '}
              {c.ClubbedWithStatusName || '—'}
            </div>
          </div>
        </div>
      )}

      {c.similarCases && c.similarCases.length > 0 && (
        <div className="alert alert-light border d-flex align-items-start gap-2 mb-4">
          <i className="bi bi-link-45deg fs-5" />
          <div className="small">
            <div className="fw-semibold mb-1">Marked as similar to</div>
            <ul className="mb-0">
              {c.similarCases.map((sc) => (
                <li key={sc.SimilarCompID}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/complaints/${sc.SimilarCompID}`);
                    }}
                  >
                    {sc.CompNo}
                  </a>{' '}
                  - {sc.ResName || '—'} · <em>{sc.StatusName || '—'}</em>{' '}
                  <span className="text-muted">· filed {sc.EntryDate ? fmtDate(sc.EntryDate) : '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {Number(c.StatusID) === 130 && (
        <div className="alert alert-success small mb-4">
          <strong>Withdrawal permitted.</strong> The complaint stands withdrawn.
        </div>
      )}

      {[127, 128, 129].includes(Number(c.StatusID)) && (
        <div className="alert alert-warning small mb-4">
          <strong>Withdrawal of the complaint pending.</strong>{' '}
          {Number(c.StatusID) === 127 && 'A letter of withdrawal has been received and awaits placement by the Director Discipline.'}
          {Number(c.StatusID) === 128 && 'The letter of withdrawal is pending before the Board of Discipline.'}
          {Number(c.StatusID) === 129 && 'The letter of withdrawal is pending before the Committee.'}
        </div>
      )}

      {isComplainant && canWithdraw(c.StatusID) && (
        <div className="card ds-card mb-4">
          <div className="card-header">
            <div className="card-title">
              <i className="bi bi-box-arrow-right" />
              Withdrawal of Complaint
            </div>
          </div>
          <div className="card-body">
            <p className="small text-muted mb-2">{RULE_6_TEXT}</p>
            <p className="small text-muted mb-3">{RULE_6_PROVISO}</p>
            <form onSubmit={submitWithdrawal}>
              <div className="mb-3">
                <label className="form-label small fw-semibold">
                  Letter of Withdrawal <span className="text-danger">*</span>{' '}
                  <span className="text-muted fw-normal">(PDF, max 20 MB)</span>
                </label>
                <input type="file" className="form-control" accept=".pdf" onChange={(e) => setWdFile(e.target.files[0] || null)} />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold">
                  Reason for withdrawal <span className="text-danger">*</span>
                </label>
                <RichEditor value={wdRemarks} onChange={setWdRemarks} required />
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={wdBusy}>
                {wdBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                <i className="bi bi-send me-1" />Submit Letter of Withdrawal
              </button>
            </form>
          </div>
        </div>
      )}

      {ut === 4 && !iActedAtCurrent && Number(c.StatusID) === 127 && (
        <div className="card ds-card mb-4">
          <div className="card-header">
            <div className="card-title">
              <i className="bi bi-box-arrow-right" />
              Place Withdrawal before the Board of Discipline / Committee
            </div>
          </div>
          <div className="card-body">
            <p className="small text-muted mb-2">{RULE_6_TEXT}</p>
            <p className="small text-muted mb-3">{RULE_6_PROVISO}</p>
            {withdrawalRow?.Attachment && (
              <p className="small">
                <a href={`/documents/${withdrawalRow.Attachment}`} target="_blank" rel="noreferrer">
                  <i className="bi bi-file-earmark-pdf me-1" />Letter of withdrawal
                </a>{' '}
                · {withdrawalRow.ByUserName ? `received from ${withdrawalRow.ByUserName}` : ''}
              </p>
            )}
            <form onSubmit={submitRule6Placement}>
              <div className="mb-3">
                <label className="form-label small fw-semibold">
                  Has the Director formed his prima facie opinion on this complaint? <span className="text-danger">*</span>
                </label>
                <div className="form-check mt-1">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="primaFacie"
                    id="pfYes"
                    value="yes"
                    checked={primaFacieEffective === 'yes'}
                    onChange={() => setPrimaFacie('yes')}
                  />
                  <label className="form-check-label small" htmlFor="pfYes">
                    Prima facie opinion formed
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="primaFacie"
                    id="pfNo"
                    value="no"
                    checked={primaFacieEffective === 'no'}
                    onChange={() => setPrimaFacie('no')}
                  />
                  <label className="form-check-label small" htmlFor="pfNo">
                    Prima facie opinion not yet formed
                  </label>
                </div>
                <div className="form-text">
                  {primaFacieDefault === 'no'
                    ? 'Derived from the stage of this complaint: the Director has not yet formed a prima facie opinion.'
                    : 'Derived from the stage of this complaint: the Director has already formed a prima facie opinion.'}
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Place the letter of withdrawal before <span className="text-danger">*</span></label>
                <div className="form-check mt-1">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="placeBefore"
                    id="placeBod"
                    value="bod"
                    checked={placeEffective === 'bod'}
                    onChange={() => setPlaceChoice('bod')}
                  />
                  <label className="form-check-label small" htmlFor="placeBod">
                    The Board of Discipline
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="placeBefore"
                    id="placeCm"
                    value="committee"
                    disabled={primaFacieEffective === 'no'}
                    checked={placeEffective === 'committee'}
                    onChange={() => setPlaceChoice('committee')}
                  />
                  <label className="form-check-label small" htmlFor="placeCm">
                    The Committee
                  </label>
                </div>
                {primaFacieEffective === 'no' && (
                  <div className="form-text text-danger">
                    Until the prima facie opinion is formed the complaint must be placed before the Board of Discipline.
                  </div>
                )}
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold">
                  Remarks <span className="text-danger">*</span>
                </label>
                <RichEditor value={placeRemarks} onChange={setPlaceRemarks} required />
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={placeBusy}>
                {placeBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                <i className="bi bi-send me-1" />Place before the {placeEffective === 'committee' ? 'Committee' : 'Board of Discipline'}
              </button>
            </form>
          </div>
        </div>
      )}

      {ut === 5 && [2, 4].includes(Number(c.StatusID)) && (
        <div className="card ds-card mb-4">
          <div className="card-header">
            <div className="card-title">
              <i className="bi bi-clipboard-check" />
              Scrutiny Sheet
            </div>
            {scSheetSaved && !sheetOpen && (
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSheetOpen(true)}>
                <i className="bi bi-eye me-1" />View / Edit
              </button>
            )}
          </div>
          <div className="card-body">
            {(!scSheetSaved || sheetOpen) ? (
              <ScrutinySheetForm
                value={scSheet}
                onChange={setScSheet}
                complaintNo={c.CompNo}
                onSave={saveScrutinySheet}
                saved={scSheetSaved}
                busy={scBusy}
                onClear={clearScrutinySheet}
                onDownload={() => downloadPdf('scrutiny')}
              />
            ) : (
              <div>
                <div className="alert alert-success py-2 small mb-3">
                  <i className="bi bi-check-circle me-1" />Scrutiny Sheet has been submitted. Further action can now be taken on this complaint.
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setSheetOpen(true)}>
                    <i className="bi bi-pencil me-1" />Edit Scrutiny Sheet
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setSheetOpen(true)}>
                    <i className="bi bi-eyeglasses me-1" />Re-open
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="row g-4">
        {/* ======================= LEFT COLUMN ======================= */}
        <div className="col-lg-8">
          <Section icon="bi-clipboard2-data" title="Complaint Details">
            <dl className="row mb-0">
              <DetailRow label="Complaint No" value={<span className="fw-semibold">{c.CompNo}</span>} />
              <DetailRow label="Complaint Type" value={c.CompTypeName} />
              <DetailRow label="Form Type" value={c.FormType} />
              {c.RegulatorName ? <DetailRow label="Regulator / Authority" value={c.RegulatorName} /> : null}
              <DetailRow
                label="Status"
                value={<span className={`badge-soft ${badgeTone(c.StatusName)}`}>{statusLabel(c.StatusName, c.StatusID)}</span>}
              />
              <DetailRow label="Entry Date" value={fmtDate(c.EntryDate)} />
              <DetailRow label="Payment Mode" value={PAY_MODE_LABELS[c.PaymentMode] || c.PaymentMode} />
              <DetailRow label="Payment Date" value={fmtDate(c.PaymentDate)} />
              <DetailRow label="Taxable Amount" value={fmtMoney(c.TaxableAmount)} />
              <DetailRow label="Reference No" value={c.TransRefNo} />
            </dl>
          </Section>

          <Section icon="bi-person-badge" title="Respondent & Parties">
            <dl className="row mb-3">
              <DetailRow
                label="Respondent"
                value={
                  <span className="fw-semibold">
                    {c.ResName}
                    {c.IsFirm ? ` · ${c.NameofFirm || c.FirmNo || ''}` : ''}
                  </span>
                }
              />
              <DetailRow label="Registration / Firm No" value={c.ResRegistrationNo || c.FirmNo} />
              <DetailRow label="Email" value={c.ResEmailID} />
              <DetailRow label="Mobile" value={c.ResMobileNo} />
              <DetailRow label="Professional Address" value={c.ResProfAddress} />
              <DetailRow label="Communication Address" value={c.ResCommAddress} />
            </dl>

            {c.factPersons?.length > 0 && (
              <div className="table-responsive">
                <table className="table data-table mb-3">
                  <thead>
                    <tr>
                      <th>Fact Person</th>
                      <th>Mobile</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.factPersons.map((p) => (
                      <tr key={p.PersonID}>
                        <td>{p.PersonName}</td>
                        <td className="text-muted">{p.PersonMobile || '—'}</td>
                        <td className="text-muted">{p.PersonEmail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {c.answerable?.length > 0 && (
              <div className="table-responsive">
                <table className="table data-table mb-0">
                  <thead>
                    <tr>
                      <th>Answerable Member</th>
                      <th>Registration</th>
                      <th>Senior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.answerable.map((m) => (
                      <tr key={m.AMemID}>
                        <td>{m.MemName}</td>
                        <td className="text-muted">{m.MemRegistrationNo || '—'}</td>
                        <td>{Number(m.IsSenior) === 1 ? <span className="badge-soft badge-soft-warning">Senior</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            icon="bi-paperclip"
            title="Documents & Attachments"
            right={<span className="badge-soft badge-soft-neutral">{(c.documents?.length || 0) + (c.audioVideo?.length || 0)} files</span>}
          >
            {c.documents?.length === 0 && c.audioVideo?.length === 0 ? (
              <div className="empty-state p-3">
                <i className="bi bi-folder-plus mb-1" />
                <p className="mb-0">No documents uploaded for this complaint.</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {c.documents.map((d) => (
                  <a href={`/documents/${d.DocURL}`} target="_blank" rel="noreferrer" key={d.CompAttachID} className="doc-chip">
                    <i className={`bi ${fileIcon(d.DocURL)}`} />
                    <span className="doc-name">{d.DocURL}</span>
                    <i className="bi bi-box-arrow-up-right text-muted ms-auto" />
                  </a>
                ))}
                {c.audioVideo.map((av) => (
                  <a href={`/documents/${av.Attachment}`} target="_blank" rel="noreferrer" key={av.AttachID} className="doc-chip">
                    <i className={`bi ${fileIcon(av.Attachment)}`} />
                    <span className="doc-name">{av.Attachment}</span>
                    <i className="bi bi-box-arrow-up-right text-muted ms-auto" />
                  </a>
                ))}
              </div>
            )}
          </Section>

          {isParty && Number(c.StatusID) === 66 && (
          <Section
            icon="bi-diagram-3"
            title="Clubbing Decision"
            right={<span className="badge-soft badge-soft-neutral">Decision Accepted</span>}
          >
            <p className="text-muted small mb-3">
              The clubbing recommendation against this complaint has been accepted. The decision will be formally
              communicated to you by the Scrutiny Officer.
            </p>
            {c.ClubbedWithCompID && (
              <div className="alert alert-info small">
                <strong>This complaint is clubbed with {c.ClubbedWithCompNo || c.ClubbedWithCompID}</strong> · previous
                complaint status: {c.ClubbedWithStatusName || '—'}
              </div>
            )}
            {clubbingDocs.length ? (
              <div>
                <div className="small fw-semibold mb-1">Clubbing documents</div>
                <div className="d-flex flex-wrap gap-2">
                  {clubbingDocs.map((h) => (
                    <a
                      key={h.CompStatusID}
                      href={`/documents/${h.Attachment}`}
                      target="_blank"
                      rel="noreferrer"
                      className="doc-chip"
                    >
                      <i className="bi bi-file-earmark-pdf me-1" />
                      {h.StatusName || 'Document'}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-muted small">
                The communication letter will be made available here once the decision is communicated.
              </div>
            )}
          </Section>
        )}

        {isParty && Number(c.StatusID) === 123 && (
            <Section
              icon="bi-envelope-paper"
              title="Clubbing Decision Communication"
              right={<span className="badge-soft badge-soft-neutral">Clubbing Case Communicated</span>}
            >
              <p className="text-muted small mb-3">
                The clubbing recommendation has been accepted and the decision communicated. Please find the communication letter for your reference.
                {clubbingRec?.StatusDate && (
                  <span className="d-block mt-1">Communicated on {new Date(clubbingRec.StatusDate).toLocaleString()}</span>
                )}
              </p>
              {clubbingRec?.Attachment ? (
                <div className="d-flex gap-2">
                  <a
                    className="btn btn-outline-primary btn-sm"
                    href={`/documents/${clubbingRec.Attachment}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <i className="bi bi-eye me-1" />View
                  </a>
                  <a
                    className="btn btn-outline-secondary btn-sm"
                    href={`/documents/${clubbingRec.Attachment}`}
                    download={`ClubbingLetter_${c.CompNo || c.CompID}.pdf`}
                  >
                    <i className="bi bi-download me-1" />Download
                  </a>
                </div>
              ) : (
                <div className="text-muted small">No letter attached for this communication.</div>
              )}
            </Section>
          )}

          <Section
            icon="bi-calendar2-week"
            title="Schedule"
            right={c.schedules?.length ? <span className="badge-soft badge-soft-primary">{c.schedules.length} items</span> : null}
          >
            {c.schedules?.length === 0 ? (
              <div className="text-muted small">No schedule entries.</div>
            ) : (
              <div className="table-responsive">
                <table className="table data-table mb-0">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Part No</th>
                      <th>Schedule No</th>
                      <th>Misconduct Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.schedules.map((s) => (
                      <tr key={s.ScheduleID}>
                        <td>{s.ItemNo || '—'}</td>
                        <td className="text-muted">{s.PartNo || '—'}</td>
                        <td className="text-muted">{s.Schedule || '—'}</td>
                        <td className="text-muted">
                          {s.MisconductDate ? `${fmtDate(s.MisconductDate)}${s.MisconductDateTo ? ` – ${fmtDate(s.MisconductDateTo)}` : ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            icon="bi-clock-history"
            title="Status History"
            right={<span className="badge-soft badge-soft-neutral">{visibleHistory.length} entries</span>}
          >
            <div className="table-responsive">
              <table className="table data-table mb-0">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Date</th>
                    <th>By</th>
                    <th>Remarks</th>
                    <th>Attachment</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHistory.map((h, i) => (
                    <tr key={`${h.StatusID}-${i}`}>
                      <td><span className={`badge-soft ${badgeTone(h.StatusName)}`}>{statusLabel(h.StatusName, h.StatusID)}</span></td>
                      <td className="text-muted">{h.StatusDate ? new Date(h.StatusDate).toLocaleString() : '—'}</td>
                      <td className="text-muted">{h.ByUserName || h.UserID || '—'}</td>
                      <td className="text-muted rich-remark" dangerouslySetInnerHTML={{ __html: sanitizeHtml(h.Remarks) || '—' }} />
                      <td>
                        {h.Attachment ? (
                          <a className="btn btn-sm btn-outline-primary py-0 px-2" href={`/documents/${h.Attachment}`} target="_blank" rel="noreferrer" title="View attachment">
                            <i className="bi bi-eye" /> View
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {visibleHistory.length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center text-muted py-3">No history recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {/* ======================= RIGHT COLUMN ======================= */}
        <div className="col-lg-4">
          <div className="card ds-card mb-4">
            <div className="card-header">
              <div className="card-title">
                <i className="bi bi-speedometer2" />
                Summary
              </div>
            </div>
            <div className="card-body">
              <div className="d-flex flex-column gap-3">
                <div>
                  <div className="small text-muted fw-semibold">Current Stage</div>
                  <span className={`badge-soft ${badgeTone(c.StatusName)} mt-1`}>{statusLabel(c.StatusName, c.StatusID)}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span className="small text-muted">Days in system</span>
                  <span className="fw-semibold">{days ?? '—'} days</span>
                </div>
                {perDays != null && (
                  <div className="d-flex justify-content-between">
                    <span className="small text-muted">Days since PER</span>
                    <span className="fw-semibold">{perDays} days</span>
                  </div>
                )}
                <div className="d-flex justify-content-between">
                  <span className="small text-muted">Complaint type</span>
                  <span className="fw-semibold">{c.CompTypeName || '—'}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span className="small text-muted">Filed by</span>
                  <span className="fw-semibold text-end">{c.ComplainantName || '—'}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span className="small text-muted">Taxable amount</span>
                  <span className="fw-semibold">{fmtMoney(c.TaxableAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {ut === 5 && !scSheetSaved && [2, 4].includes(Number(c.StatusID)) && (
            <div className="alert alert-warning py-2 small">
              <i className="bi bi-clipboard-plus me-1" />
              Please submit the Scrutiny Sheet first, then you can take further action on this complaint.
            </div>
          )}

          {ut === 5 && !iActedAtCurrent && scSheetSaved && [2, 4].includes(Number(c.StatusID)) && (
            <div className="card ds-card mb-4">
              <div className="card-header">
                <div className="card-title">
                  <i className="bi bi-pencil-square" />
                  Take Action
                </div>
              </div>
              <div className="card-body">
                <form onSubmit={submitSoAction}>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">
                      Entity in respect of which misconduct alleged <span className="text-danger">*</span>
                    </label>
                    <input className="form-control" value={soEntity} onChange={(e) => setSoEntity(e.target.value)} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">
                      Nature of allegation
                    </label>
                    <select
                      className="form-select"
                      value={soNatureOption}
                      onChange={(e) => {
                        setSoNatureOption(e.target.value);
                        if (e.target.value !== 'Other') setSoNatureOther('');
                      }}
                    >
                      <option value="">--Select--</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {soNatureOption === 'Other' && (
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">Nature details</label>
                      <input
                        className="form-control"
                        value={soNatureOther}
                        onChange={(e) => setSoNatureOther(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">
                      Remarks <span className="text-danger">*</span>
                    </label>
                    <RichEditor value={soRemarks} onChange={setSoRemarks} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Attachment (PDF, max 20 MB)</label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf"
                      onChange={(e) => setSoFile(e.target.files[0] || null)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Please select one of the option</label>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="soAction"
                        id="soActionDefect"
                        value="defect"
                        checked={soAction === 'defect'}
                        onChange={(e) => setSoAction(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="soActionDefect">
                        Send to complainant for defect rectification.
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="soAction"
                        id="soActionRecommendDD"
                        value="recommendDD"
                        checked={soAction === 'recommendDD'}
                        onChange={(e) => setSoAction(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="soActionRecommendDD">
                        Recommendation to Working Officer (WO) for forward to Director Discipline
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="soAction"
                        id="soActionSimilar"
                        value="similar"
                        checked={soAction === 'similar'}
                        onChange={(e) => {
                          setSoAction(e.target.value);
                          if (e.target.value === 'similar') loadSimilarCandidates();
                        }}
                      />
                      <label className="form-check-label small" htmlFor="soActionSimilar">
                        Mark as Similar - mark this complaint as similar to a previous complaint and move it directly
                        to the same stage as that complaint
                      </label>
                    </div>
                    {/* "Assign to Officer for Additional Document" is available
                        at initial scrutiny (status 2) and after rectification
                        (status 4) as long as no officer has been assigned. */}
                    {[2, 4].includes(Number(c.StatusID)) && (
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="soAction"
                          id="soActionAssignOfficer"
                          value="assignOfficer"
                          checked={soAction === 'assignOfficer'}
                          onChange={(e) => setSoAction(e.target.value)}
                        />
                        <label className="form-check-label small" htmlFor="soActionAssignOfficer">
                          Assign to Officer for Additional Document
                        </label>
                      </div>
                    )}
                  </div>
                  {soAction === 'recommendDD' && (
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">
                        Recommendation <span className="text-danger">*</span>
                      </label>
                      <select className="form-select" value={soClubbing} onChange={(e) => setSoClubbing(e.target.value)} required>
                        <option value="Registration">Registration - send to the Working Officer and Director Discipline</option>
                        <option value="Clubbing before Director">Clubbing before Director</option>
                        <option value="Clubbing before Committee">Clubbing before Committee</option>
                        <option value="Closure before Committee">Closure before Committee</option>
                      </select>
                      {soClubbing !== 'Registration' && (
                      <div className="form-text">
                        Rule 5(4): recommend clubbing this complaint with a previous complaint (before the Director
                        or the Committee) or closure before the Committee. The recommendation then goes to the
                        Director Discipline, who agrees or disagrees with it.
                      </div>
                      )}
                    </div>
                  )}
                  {soAction === 'similar' && (
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">Similar Complaints</label>
                      {soSimilarLoading ? (
                        <div className="text-muted small py-2">
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                          Searching for similar complaints...
                        </div>
                      ) : soSimilarCandidates.length === 0 ? (
                        <div className="text-muted small">
                          No similar complaint found with the same respondent registration no or nature of allegation.
                        </div>
                      ) : (
                        <div>
                          {soSimilarCandidates.map((cand) => (
                            <div key={cand.CompID} className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`similar${cand.CompID}`}
                                checked={soSimilarLinked.includes(Number(cand.CompID))}
                                onChange={() => toggleSimilar(Number(cand.CompID))}
                              />
                              <label className="form-check-label small" htmlFor={`similar${cand.CompID}`}>
                                <strong>{cand.CompNo}</strong> - {cand.ResName || '—'}{' '}
                                <span className="badge-soft badge-soft-neutral">{cand.StatusName || '—'}</span>{' '}
                                <span className="text-muted">filed {cand.EntryDate ? fmtDate(cand.EntryDate) : '—'}</span>
                              </label>
                            </div>
                          ))}
                          {soSimilarLinked.length > 0 && (
                            <div className="mt-2">
                              <label className="form-label small fw-semibold">
                                Move this complaint to the same stage as this previous complaint{' '}
                                <span className="text-danger">*</span>
                              </label>
                              <select
                                className="form-select"
                                value={soPrimarySimilar}
                                onChange={(e) => setSoPrimarySimilar(e.target.value)}
                                required
                              >
                                {soSimilarCandidates
                                  .filter((x) => soSimilarLinked.includes(Number(x.CompID)))
                                  .map((x) => (
                                    <option key={x.CompID} value={x.CompID}>
                                      {x.CompNo} ({x.StatusName || 'status ' + x.StatusID})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {soAction === 'assignOfficer' && (
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">Select Officer</label>
                      <select className="form-select" value={soOfficer} onChange={(e) => setSoOfficer(e.target.value)} required>
                        <option value="">--Select Officer--</option>
                        {officers.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary w-100" disabled={soBusy}>
                    {soBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-send me-1" />Submit
                  </button>
                </form>
              </div>
            </div>
          )}

          {ut === 5 && !iActedAtCurrent && Number(c.StatusID) === 66 && (
            <div className="card ds-card mb-4">
              <div className="card-header">
                <div className="card-title">
                  <i className="bi bi-envelope-paper" />
                  Communicate Clubbing Decision
                </div>
              </div>
              <div className="card-body">
                {c.ClubbedWithCompID && (
                  <div className="alert alert-info small">
                    <strong>Rule 5(4){rule54Clause} - convey this fact to:</strong>
                    <ul className="mb-0 mt-1">
                      <li>
                        First complainant: {c.ClubbedWithComplainant || '—'}
                        {c.ClubbedWithComplainantEmail ? ` (${c.ClubbedWithComplainantEmail})` : ''} — complaint{' '}
                        {c.ClubbedWithCompNo}
                      </li>
                      <li>
                        New complainant: {c.ComplainantName || '—'}
                        {c.ComplainantEmail ? ` (${c.ComplainantEmail})` : ''}
                      </li>
                      <li>
                        Respondent: {c.ResName || '—'}
                        {c.ResEmailID ? ` (${c.ResEmailID})` : ''}
                      </li>
                    </ul>
                  </div>
                )}
                <form onSubmit={submitSoCommunication}>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">
                      Attach Letter <span className="text-danger">*</span> <span className="text-muted fw-normal">(PDF, max 20 MB)</span>
                    </label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf"
                      onChange={(e) => setSoComFile(e.target.files[0] || null)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
                    <RichEditor value={soComRemarks} onChange={setSoComRemarks} required />
                  </div>
                  <button type="submit" className="btn btn-primary w-100" disabled={soComBusy}>
                    {soComBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-send me-1" />
                    {c.ClubbedWithCompID
                      ? 'Send to First Complainant, Complainant & Respondent'
                      : 'Send to Respondent & Complainant'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {ut === 4 && !iActedAtCurrent && Number(c.StatusID) === 5 && (
            <div className="card ds-card mb-4">
              <div className="card-header">
                <div className="card-title">
                  <i className="bi bi-diagram-3" />
                  Director Discipline Decision
                </div>
              </div>
              <div className="card-body">
                <p className="small text-muted mb-3">
                  Recommendation forwarded by the Working Officer: <strong>{soRecType}</strong>.
                </p>
                <form onSubmit={submitDDDecision}>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Please select one of the option</label>
                    <div className="form-check mt-1">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="dd54Choice"
                        id="dd54Agree"
                        value="agree"
                        checked={dd54Choice === 'agree'}
                        onChange={(e) => setDd54Choice(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="dd54Agree">
                        {soRecType === 'Registration'
                          ? "Agree - register the complaint; the SO sends the query to take the Respondent's written statement"
                          : soRecType === 'Clubbing before Director'
                            ? 'Agree - club this complaint with the previous complaint'
                            : soRecType === 'Clubbing before Committee'
                              ? 'Agree - place this complaint before the Committee / Board of Discipline for the clubbing decision'
                              : 'Agree - place this complaint before the Committee for closure'}
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="dd54Choice"
                        id="dd54Disagree"
                        value="disagree"
                        checked={dd54Choice === 'disagree'}
                        onChange={(e) => setDd54Choice(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="dd54Disagree">
                        Disagree - send the complaint back to the SO for further action
                      </label>
                    </div>
                  </div>

                  {soRecType === 'Clubbing before Committee' && dd54Choice === 'agree' && (
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">
                        Select Committee / Board of Discipline <span className="text-danger">*</span>
                      </label>
                      <select
                        className="form-select"
                        value={wfCommittee}
                        onChange={(e) => setWfCommittee(e.target.value)}
                        required
                      >
                        <option value="">--Select Committee / Board of Discipline--</option>
                        <option value="Board of Discipline">Board of Discipline</option>
                        {committees.map((m) => (
                          <option key={m.value} value={m.label}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
                    <RichEditor value={ddClubbingRemarks} onChange={setDdClubbingRemarks} required />
                  </div>
                  <button type="submit" className="btn btn-primary w-100" disabled={ddClubbingBusy}>
                    {ddClubbingBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-check2-circle me-1" />Submit Decision
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Committee decision on a clubbing / closure case placed before it by the
              Director Discipline (status 69 = clubbing, status 68 = closure). Agree
              returns it to the SO (status 66) to communicate; Disagree sends it back
              to the SO for further action (status 2). */}
          {isCommitteeStage && isCommitteeActor && !iActedAtCurrent && (
            <div className="card ds-card mb-4">
              <div className="card-header">
                <div className="card-title">
                  <i className="bi bi-people" />
                  {Number(c.StatusID) === 68 ? 'Committee Decision on Closure' : 'Committee Decision on Clubbing'}
                </div>
              </div>
              <div className="card-body">
                <p className="small text-muted mb-3">
                  {Number(c.StatusID) === 68
                    ? 'The Director Discipline has placed this complaint before the Committee for closure. Agree to close it and return it to the SO for communication, or disagree and send it back to the SO for further action.'
                    : 'The Director Discipline has placed this complaint before the Committee / Board of Discipline for a clubbing decision. Agree to club it and return it to the SO for communication, or disagree and send it back to the SO for further action.'}
                </p>
                <form onSubmit={submitCommitteeClubbing}>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Please select one of the option</label>
                    <div className="form-check mt-1">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="cmDecision"
                        id="cmAgree"
                        value="agree"
                        checked={cmDecision === 'agree'}
                        onChange={(e) => setCmDecision(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="cmAgree">
                        Agree - return the complaint to the SO to communicate the decision
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="cmDecision"
                        id="cmDisagree"
                        value="disagree"
                        checked={cmDecision === 'disagree'}
                        onChange={(e) => setCmDecision(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="cmDisagree">
                        Disagree - send the complaint back to the SO for further action
                      </label>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
                    <RichEditor value={cmRemarks} onChange={setCmRemarks} required />
                  </div>
                  <button type="submit" className="btn btn-primary w-100" disabled={cmBusy}>
                    {cmBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-check2-circle me-1" />Submit Decision
                  </button>
                </form>
              </div>
            </div>
          )}

          {ut === 13 && !iActedAtCurrent && Number(c.StatusID) === 124 && (
            <div className="card ds-card mb-4">
              <div className="card-header">
                <div className="card-title">
                  <i className="bi bi-person-check" />
                  Working Officer - {soRecType} Recommendation
                </div>
              </div>
              <div className="card-body">
                <p className="small text-muted mb-3">
                  The SO has recommended this complaint for {soRecType.toLowerCase()}. Forward it to the Director
                  Discipline for a decision, or send it back to the SO for further action (DC Flow #103/#104/#123).
                </p>
                <form onSubmit={submitWO}>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Please select one of the option</label>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="woDecision"
                        id="woAgree"
                        value="agree"
                        checked={woDecision === 'agree'}
                        onChange={(e) => setWoDecision(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="woAgree">
                        Agree - Forward to Director Discipline for decision
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="woDecision"
                        id="woDisagree"
                        value="disagree"
                        checked={woDecision === 'disagree'}
                        onChange={(e) => setWoDecision(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor="woDisagree">
                        Disagree - Send back to SO for further action
                      </label>
                    </div>
                  </div>
                  {woDecision === 'agree' && (
                    <div className="mb-3">
                      <label className="form-label small fw-semibold">Select Director Discipline (DD) <span className="text-danger">*</span></label>
                      <select className="form-select" value={woDdId} onChange={(e) => setWoDdId(e.target.value)} required>
                        <option value="">--Select DD--</option>
                        {ddMembers.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Remarks <span className="text-danger">*</span></label>
                    <RichEditor value={woRemarks} onChange={setWoRemarks} required />
                  </div>
                  <button type="submit" className="btn btn-primary w-100" disabled={woBusy}>
                    {woBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-send me-1" />Submit
                  </button>
                </form>
              </div>
            </div>
          )}

          {ut === 4 && !iActedAtCurrent && !ddActionStatuses.includes(Number(c.StatusID)) && Number(c.StatusID) !== 55 && (
            <div className="card ds-card mb-4">
              <div className="card-header">
                <div className="card-title">
                  <i className="bi bi-person-bounding-box" />
                  Assign To SO for Scrutiny
                </div>
              </div>
              <div className="card-body">
                <form onSubmit={assignToSO}>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Select SO Member</label>
                    <select className="form-select" value={soId} onChange={(e) => setSoId(e.target.value)} required>
                      <option value="">--Select SO--</option>
                      {soMembers.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Remarks</label>
                    <RichEditor value={ddRemarks} onChange={setDdRemarks} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Attachment (PDF, max 20 MB)</label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf"
                      onChange={(e) => setDdFile(e.target.files[0] || null)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary w-100" disabled={ddBusy}>
                    {ddBusy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
                    <i className="bi bi-send me-1" />Assign To SO
                  </button>
                </form>
              </div>
            </div>
          )}

          {(isRespondent || isAnswerableMember) && Number(c.StatusID) === 15 && (
            <RespondentStatementCard compId={id} c={c} onRefresh={reload} />
          )}

          {isComplainant && Number(c.StatusID) === 22 && (
            <ComplainantRejoinderCard compId={id} c={c} onRefresh={reload} />
          )}
          {isComplainant && Number(c.StatusID) === 51 && (
            <AdditionalDocumentCard compId={id} c={c} onRefresh={reload} />
          )}

          {activePanels.map((panel) => (
            <RoleActionCard key={panel.title} panel={panel} members={wfMembers} onTransition={workflowTransition} />
          ))}
        </div>
      </div>
    </div>
  );
}