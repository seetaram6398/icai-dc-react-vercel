import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { uploadFile } from '../api/upload';
import { useAuth } from '../context/AuthContext';
import { usePopups } from '../components/Popup';
import {
  isValidEmail, sanitizeDigits, isValidMobile, isValidPincode, isValidStdCode,
  isValidLandline, isValidPan, isValidGstin,
  sanitizeAlphaNumUpper, sanitizeUpper, isValidName, isValidFirmName,
  isFutureDate, isDateRangeOk,
} from '../utils/validators';
import './Reports.css';

const CCODES = ['91', '1', '44', '61', '971', '966', '65', '977', '880', '94', '92'];

const emptyForm = {
  compTypeId: '',
  formType: 'A',
  name: '', email: '', countryCode: '91', mobile: '', stdCode: '', landlineNo: '',
  address: '', area: '', landmark: '', stateId: '', cityId: '', pincode: '', aadharNo: '',
  aadharPhoto: '', complaintantPhoto: '', complaintantSignature: '', complainantRegion: '',
  salutation: '', relationName: '',
  isFirm: false, firmNo: '', nameOfFirm: '', firmProfAddress: '', firmCommAddress: '',
  firmProfStateId: '', firmProfCityId: '',
  resType: 'member', resRegistrationNo: '', resName: '', resCountryCode: '91',
  resMobile: '', resStdCode: '', resLandlineNo: '', resEmail: '',
  resProfessionalAddress: '', resCommunicationAddress: '',
  resStateId: '', resCityId: '', resStateName: '', resCityName: '',
  resRStateName: '', resRCityName: '', resRegion: '', resComRegion: '',
  regulatorName: '', regulatorDesignation: '', regulatorId: '', regulatorAttachment: '',
  briefStatement: '', briefAttachment: '', particularMisconduct: '', misconductAttachment: '',
  paymentMode: '', paymentDate: '', transRefNo: '', gstinNo: '', instrumentNo: '',
  instrumentDate: '', taxableAmount: '2950', taxRate: '18', paymentDetails: '',
  gstType: 'CGST&SGST',
  digitalEvidenceCert: '',
  entityMisconduct: '', natureOfAllegation: '',
  declaration: false, isChkSameAddress: false, isAnswerable: '0', isAudioVideo: '0',
};

// Fetch an uploaded /documents/<relPath> file through the authenticated backend proxy
// and expose it as a blob URL so it renders in <img> tags (browser can't send the Bearer header).
function useAuthImage(path) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!path) { setUrl(''); return; }
    if (path.startsWith('blob:') || path.startsWith('data:') || path.startsWith('http')) {
      setUrl(path);
      return;
    }
    let cancelled = false;
    const token = localStorage.getItem('icai_token');
    fetch(`/documents/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        const objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        return objectUrl;
      })
      .then((objectUrl) => {
        if (cancelled && objectUrl) URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

function ImagePreview({ src, placeholder, width = 96, height = 96, onRemove }) {
  const url = useAuthImage(src);
  return (
    <div className="d-inline-block position-relative mt-2" style={{ width, height }}>
      {url ? (
        <img
          src={url}
          alt="preview"
          className="border rounded"
          style={{ width, height, objectFit: 'cover' }}
        />
      ) : (
        <div
          className="border rounded bg-light d-flex align-items-center justify-content-center text-muted"
          style={{ width, height, fontSize: 11 }}
        >
          <i className="bi bi-image me-1"></i>{placeholder || 'No image'}
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          className="btn btn-danger btn-sm position-absolute top-0 end-0 m-n1 shadow"
          style={{ borderRadius: '50%', width: 22, height: 22, lineHeight: 1, padding: 0 }}
          onClick={onRemove}
          title="Remove"
        >
          <i className="bi bi-x" />
        </button>
      )}
    </div>
  );
}

function FileUploadInput({ label, hint, accept, sizeMB = 15, onUpload, current, required, preview, type = 'other' }) {
  const [busy, setBusy] = useState(false);
  const [objUrl, setObjUrl] = useState('');
  const popup = usePopups();
  useEffect(() => () => { if (objUrl) URL.revokeObjectURL(objUrl); }, [objUrl]);
  const handle = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (accept && !accept.split(',').some((a) => f.name.toLowerCase().endsWith(a.trim()))) {
      popup.warning(`Only ${accept} files allowed`);
      return;
    }
    if (f.size > sizeMB * 1024 * 1024) {
      const limit = sizeMB && sizeMB < 1 ? `${Math.round(sizeMB * 1024)}kb` : `${sizeMB}MB`;
      popup.warning(`File size should be less than ${limit}`);
      return;
    }
    if (preview) setObjUrl(URL.createObjectURL(f));
    setBusy(true);
    try {
      const data = await uploadFile(f, type);
      onUpload(data.relativePath || data.path, f.name);
    } catch (ex) {
      popup.error('Upload failed');
      setObjUrl('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label className="form-label fw-semibold mb-1">{label}{required && ' *'}</label>
      {hint && <div className="small text-muted mb-1" style={{ fontSize: 11 }}>{hint}</div>}
      <input type="file" className="form-control form-control-sm" accept={accept} onChange={handle} disabled={busy} />
      {busy && <small className="text-muted">Uploading...</small>}
      {(objUrl || current) && preview && (
        <ImagePreview
          src={objUrl || current}
          placeholder={objUrl || current ? '' : 'Upload'}
          onRemove={objUrl ? () => { setObjUrl(''); URL.revokeObjectURL(objUrl); onUpload(''); } : undefined}
        />
      )}
      {!preview && current && <small className="text-success d-block"><i className="bi bi-check-circle"></i> Uploaded</small>}
    </div>
  );
}

const IMAGE_HINT = "(File Size should be less than 500kb ) (.png, .jpg, .jpeg file format supported)";
const PDF_HINT = "(File Size should be less than 10 MB ) (.pdf file format supported)\n(In case of document in vernacular/national language, Kindly submit a duly certified true english translation of the same.)";
const DOC_HINT = "(Total File Size should be less than 150 MB and Each file should be less than 15 MB )(.pdf file format supported)\n(In case of document in vernacular/national language, Kindly submit a duly certified true english translation of the same.)";

function toDateInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function FileComplaint() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const editId = searchParams.get('edit') || '';
  const isEdit = !!editId;
  const isGovEmp = Number(user?.IsGovEmp) === 1;
  const isDD = Number(user?.UserType) === 4;
  // End-user (public) complaints filed through this page are always recorded as
  // Form I (the legacy ?type=A link). Only the DD "Suo Moto" flow keeps Form A.
  const formType = isDD ? 'A' : 'I';

  const [form, setForm] = useState({ ...emptyForm, formType });
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [commStates, setCommStates] = useState([]);
  const [commCities, setCommCities] = useState([]);
  const [profStates, setProfStates] = useState([]);
  const [profCities, setProfCities] = useState([]);
  const [compTypes, setCompTypes] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [parts, setParts] = useState([]);
  const [items, setItems] = useState([]);
  const [regulators, setRegulators] = useState([]);
  const [captcha, setCaptcha] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [memberLookupBusy, setMemberLookupBusy] = useState(false);

  const [personName, setPersonName] = useState('');
  const [personMobile, setPersonMobile] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [persons, setPersons] = useState([]);

  const [scheduleItem, setScheduleItem] = useState({ schedule: '', partNo: '', itemNo: '', misconductDate: '', misconductDateFrom: '', misconductDateTo: '' });
  const [scheduleList, setScheduleList] = useState([]);

  const [docName, setDocName] = useState('');
  const [docs, setDocs] = useState([]);

  const [memberRegNo, setMemberRegNo] = useState('');
  const [memAnsCaptcha, setMemAnsCaptcha] = useState(null);
  const [memAnsCaptchaAnswer, setMemAnsCaptchaAnswer] = useState('');
  const [memAnsLookupBusy, setMemAnsLookupBusy] = useState(false);
  const [memName, setMemName] = useState('');
  const [memRegNo, setMemRegNo] = useState('');
  const [memMobile, setMemMobile] = useState('');
  const [memStdCode, setMemStdCode] = useState('');
  const [memLandline, setMemLandline] = useState('');
  const [memEmail, setMemEmail] = useState('');
  const [memProAddress, setMemProAddress] = useState('');
  const [memCommAddress, setMemCommAddress] = useState('');
  const [memProState, setMemProState] = useState('');
  const [memProCity, setMemProCity] = useState('');
  const [memCommStateId, setMemCommStateId] = useState('');
  const [memCommCityId, setMemCommCityId] = useState('');
  const [memProRegion, setMemProRegion] = useState('');
  const [memCommRegion, setMemCommRegion] = useState('');
  const [memCountryCode, setMemCountryCode] = useState('91');
  const [memCommStates, setMemCommStates] = useState([]);
  const [memCommCities, setMemCommCities] = useState([]);
  const [answerableMembers, setAnswerableMembers] = useState([]);

  const [audioFiles, setAudioFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const popup = usePopups();

  const set = (k) => (e) => {
    let v = e.target.value;
    // Input-level sanitization so invalid characters never even reach state.
    if (k === 'mobile' || k === 'resMobile') v = sanitizeDigits(v, 15);
    else if (k === 'pincode') v = sanitizeDigits(v, 6);
    else if (k === 'stdCode' || k === 'resStdCode') v = sanitizeDigits(v, 4);
    else if (k === 'landlineNo' || k === 'resLandlineNo') v = sanitizeDigits(v, 8);
    else if (k === 'aadharNo') v = sanitizeAlphaNumUpper(v, 10);
    else if (k === 'gstinNo') v = sanitizeUpper(v, 15);
    else if (k === 'transRefNo' || k === 'instrumentNo') v = sanitizeUpper(v, 30);
    else if (k === 'taxableAmount') v = v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    setForm({ ...form, [k]: v });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [s, pm, sc] = await Promise.all([
          api.get('/masters/3'),
          api.get('/masters/4'),
          api.get('/masters/8'),
        ]);
        setStates(s.data);
        setCommStates(s.data);
        setProfStates(s.data);
        setMemCommStates(s.data);
        setPaymentModes(pm.data);
        setSchedules(sc.data);

        const ct = await api.get(`/masters/2?option1=${isGovEmp ? 1 : 0}`);
        setCompTypes(ct.data);
      } catch (_) {}
    };
    load();
  }, [isGovEmp]);

  useEffect(() => {
    if (user && !isDD) {
      setForm((f) => ({
        ...f,
        name: user.NameOfTheUser || '',
        email: user.Email || '',
        mobile: user.Mob || '',
        countryCode: user.CountryCode || '91',
        aadharNo: user.AadharNo || '',
        address: user.Address || '',
        area: user.Area || '',
        landmark: user.Landmark || '',
        stateId: user.StateID || '',
        cityId: user.CityID || '',
        pincode: user.Pincode != null ? String(user.Pincode).trim().replace(/\.0+$/, '') : '',
        stdCode: user.STDCode || '',
        landlineNo: user.LandlineNo || '',
        aadharPhoto: user.AadharPhoto || '',
        complaintantPhoto: user.ComplaintantPhoto || '',
        complaintantSignature: user.ComplaintantSignature || '',
        regulatorName: user.NameOfOffice || '',
        regulatorDesignation: user.RegulatorDesignation || '',
        complainantRegion: user.Region || '',
      }));
      if (user.StateID) {
        api.get(`/masters/7?option1=${user.StateID}`).then((r) => setCities(r.data)).catch(() => {});
      }
    }
  }, [user, isDD]);

  const loadCities = useCallback(async (stateId, setter) => {
    if (!stateId) { setter([]); return; }
    try {
      const r = await api.get(`/masters/7?option1=${stateId}`);
      setter(r.data);
    } catch (_) { setter([]); }
  }, []);

  // When "Same as professional address" is checked for a member respondent,
  // re-resolve the communication city ID from the stored city name as soon as
  // the city list for the resolved state is available (avoids sending the city
  // NAME into the integer resCityId column).
  useEffect(() => {
    if (!form.isChkSameAddress || form.resType !== 'member') return;
    const cid = String(form.resCityId || '').trim();
    if (/^\d+$/.test(cid)) return;
    const name = String(form.resRCityName || '').trim().toLowerCase();
    if (!name || !commCities.length) return;
    const match = commCities.find((c) => String(c.label || '').trim().toLowerCase() === name);
    if (match) setForm((f) => ({ ...f, resCityId: String(match.value) }));
  }, [commCities, form.isChkSameAddress, form.resType, form.resCityId, form.resRCityName]);

  // Resolve schedule/part/item labels (edit mode) after masters are available.
  const resolveScheduleLabels = async (scheds) => {
    if (!scheds || !scheds.length) return;
    let schMaster = schedules;
    if (!schMaster || !schMaster.length) {
      try {
        const r = await api.get('/masters/8');
        schMaster = r.data || [];
      } catch (_) { schMaster = []; }
    }
    let updated = scheds;
    for (const s of scheds) {
      const schLabel = schMaster.find((x) => String(x.value) === String(s.schedule))?.label || s.schedule;
      let partLabel = s.partNo;
      let itemLabel = s.itemNo;
      try {
        const pr = await api.get(`/masters/10?option1=${s.schedule}`);
        const part = (pr.data || []).find((x) => String(x.value) === String(s.partNo));
        partLabel = part ? part.label : s.partNo;
        if (s.partNo) {
          const ir = await api.get(`/masters/9?option1=${s.partNo}`);
          const item = (ir.data || []).find((x) => String(x.value) === String(s.itemNo));
          itemLabel = item ? item.label : s.itemNo;
        }
      } catch (_) {}
      updated = updated.map((x) => (x === s ? { ...x, scheduleName: schLabel, partLabel, itemLabel } : x));
    }
    setScheduleList([...updated]);
  };

  // Load an existing complaint into the form when arriving in edit mode
  // (?edit=<CompID>). Used for defect rectification: the complainant edits all
  // details in the same form used for submission and resubmits to the SO.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await api.get(`/complaints/${editId}`);
        if (cancelled) return;
        setForm({
          ...form,
          formType: d.FormType || 'A',
          compTypeId: d.CompType != null ? String(d.CompType) : '',
          name: d.Name || '',
          email: d.EmailID || '',
          countryCode: d.CountryCode || '91',
          mobile: d.MobileNo || '',
          stdCode: d.STDCode || '',
          landlineNo: d.LandlineNo || '',
          address: d.Address || '',
          area: d.Area || '',
          landmark: d.Landmark || '',
          stateId: d.StateID != null ? String(d.StateID) : '',
          cityId: d.CityID != null ? String(d.CityID) : '',
          pincode: d.Pincode != null ? String(d.Pincode).trim().replace(/\.0+$/, '') : (d.PinCode != null ? String(d.PinCode).trim().replace(/\.0+$/, '') : ''),
          aadharNo: d.AadharNo || '',
          aadharPhoto: d.AadharPhoto || '',
          complaintantPhoto: d.ComplaintantPhoto || '',
          complaintantSignature: d.ComplaintantSignature || '',
          complainantRegion: d.Region || '',
          salutation: d.Salutation || '',
          relationName: d.RelationName || '',
          isFirm: Number(d.IsFirm) === 1,
          resType: Number(d.IsFirm) === 1 ? 'firm' : 'member',
          firmNo: d.FirmNo || '',
          nameOfFirm: d.NameofFirm || (Number(d.IsFirm) === 1 ? d.FirmNo : '') || '',
          firmProfAddress: d.FirmProfAddress || '',
          firmCommAddress: d.FirmCommAddress || '',
          firmProfStateId: d.FirmProfStateID != null ? String(d.FirmProfStateID) : '',
          firmProfCityId: d.FirmProfCityID != null ? String(d.FirmProfCityID) : '',
          resRegistrationNo: d.ResRegistrationNo || '',
          resName: d.ResName || '',
          resCountryCode: d.ResCountryCode || '91',
          resMobile: d.ResMobileNo || '',
          resStdCode: d.ResSTDCode || '',
          resLandlineNo: d.ResLandlineNo || '',
          resEmail: d.ResEmailID || '',
          resProfessionalAddress: d.ResProfAddress || '',
          resCommunicationAddress: d.ResCommAddress || '',
          resStateId: d.RStateID != null ? String(d.RStateID) : '',
          resCityId: d.RCityID != null ? String(d.RCityID) : '',
          resStateName: d.RStateName || '',
          resCityName: d.RCityName || d.RCityname || '',
          resRStateName: d.RStateName || '',
          resRCityName: d.RCityName || d.RCityname || '',
          resRegion: d.RRegion || '',
          resComRegion: d.RComRegion || '',
          regulatorName: d.RegulatorName || '',
          regulatorDesignation: d.RegulatorDesignation || '',
          regulatorId: d.RegulatorID != null ? String(d.RegulatorID) : '',
          regulatorAttachment: d.RegulatorAttachment || '',
          briefStatement: d.BriefStatement || '',
          briefAttachment: d.BriefAttachment || '',
          particularMisconduct: d.ParticularMisconduct || '',
          misconductAttachment: d.MisconductAttachment || '',
          paymentMode: d.PaymentMode != null ? String(d.PaymentMode) : '',
          paymentDate: toDateInput(d.PaymentDate),
          transRefNo: d.TransRefNo || '',
          gstinNo: d.GSTINNo || '',
          instrumentNo: d.InstrumentNo || '',
          instrumentDate: toDateInput(d.InstrumentDate),
          taxableAmount: d.TaxableAmount != null ? String(d.TaxableAmount) : '',
          taxRate: d.TaxRate != null ? String(d.TaxRate) : '',
          paymentDetails: d.PaymentDetails || '',
          gstType: d.GSTType || 'CGST&SGST',
          entityMisconduct: d.EntityMisconduct || '',
          natureOfAllegation: d.NatureOfAllegation || '',
          declaration: Number(d.Declaration) === 1,
          isChkSameAddress: Number(d.isChkSameAddress) === 1,
          isAnswerable: d.IsAnswerable != null ? String(d.IsAnswerable) : '0',
          isAudioVideo: d.IsAudioVideo != null ? String(d.IsAudioVideo) : '0',
        });
        const certDoc = (d.documents || []).find((x) => x.DocumentID === 'Digital Evidence Certificate');
        setForm((f) => ({ ...f, digitalEvidenceCert: certDoc?.DocURL || '' }));
        setDocs((d.documents || []).filter((x) => x.DocumentID !== 'Digital Evidence Certificate').map((x) => ({
          documentId: x.DocumentID || '',
          docUrl: x.DocURL || '',
          fileName: x.DocURL || '',
        })));
        setPersons((d.factPersons || []).map((p) => ({
          personName: p.PersonName || '',
          personMobile: p.PersonMobile || '',
          personEmail: p.PersonEmail || '',
        })));
        setAnswerableMembers((d.answerable || []).map((m) => ({
          memName: m.MemName || '',
          memRegistrationNo: m.MemRegistrationNo || '',
          memCountryCode: m.MemCountryCode || '91',
          memMobileNo: m.MemMobileNo || '',
          memSTDCode: m.MemSTDCode || '',
          memLandlineNo: m.MemLandlineNo || '',
          memEmailID: m.MemEmailID || '',
          memProAddress: m.MemProAddress || '',
          memCommAddress: m.MemCommAddress || '',
          memProState: m.MemStateName || '',
          memProCity: m.MemCityName || '',
          memCommStateId: m.MemCommStateID != null ? String(m.MemCommStateID) : '',
          memCommCityId: m.MemCommCityID != null ? String(m.MemCommCityID) : '',
          memProRegion: m.MemProRegion || '',
          memCommRegion: m.MemCommRegion || '',
          firmNo: m.FirmNo || '',
        })));
        setAudioFiles((d.audioVideo || []).map((a) => ({
          attachment: a.Attachment || '',
          fileName: a.Attachment || '',
        })));
        const scheds = (d.schedules || []).map((s) => ({
          schedule: s.Schedule != null ? String(s.Schedule) : '',
          partNo: s.PartNo != null ? String(s.PartNo) : '',
          itemNo: s.ItemNo != null ? String(s.ItemNo) : '',
          misconductDate: toDateInput(s.MisconductDate),
          misconductDateFrom: toDateInput(s.Miscondate || s.MisconductDate),
          misconductDateTo: toDateInput(s.MisconductDateTo),
          scheduleName: '',
          partLabel: '',
          itemLabel: '',
        }));
        setScheduleList(scheds);
        resolveScheduleLabels(scheds);
        if (d.StateID) loadCities(d.StateID, setCities);
        if (d.RStateID) loadCities(d.RStateID, setCommCities);
        if (d.FirmProfStateID) loadCities(d.FirmProfStateID, setProfCities);
        if (d.CompType) {
          api.get(`/masters/33?option1=${d.CompType}`).then((r) => setRegulators(r.data)).catch(() => {});
        }
      } catch (_) {
        popup.error('Failed to load complaint for editing');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const onStateChange = (e) => {
    const v = e.target.value;
    const st = states.find((s) => String(s.value) === v);
    setForm({ ...form, stateId: v, cityId: '', complainantRegion: st?.Region || '' });
    loadCities(v, setCities);
  };

  // Communication State -> sets resStateId/resCityId and auto Communication Region
  const onCommStateChange = (e) => {
    const v = e.target.value;
    const st = commStates.find((s) => String(s.value) === v);
    setForm({ ...form, resStateId: v, resCityId: '', resComRegion: st?.Region || '' });
    loadCities(v, setCommCities);
  };

  // Firm Professional State -> firmProfStateId / firmProfCityId and auto Professional Region
  const onProfStateChange = (e) => {
    const v = e.target.value;
    const st = profStates.find((s) => String(s.value) === v);
    setForm({ ...form, firmProfStateId: v, firmProfCityId: '', resRegion: st?.Region || '' });
    loadCities(v, setProfCities);
  };

  const onCompTypeChange = async (e) => {
    const v = e.target.value;
    setForm({ ...form, compTypeId: v });
    if (v) {
      try {
        const { data } = await api.get(`/masters/33?option1=${v}`);
        setRegulators(data);
      } catch (_) { setRegulators([]); }
    }
  };

  const onScheduleChange = async (e) => {
    const v = e.target.value;
    setScheduleItem({ ...scheduleItem, schedule: v, partNo: '', itemNo: '' });
    if (v) {
      const r = await api.get(`/masters/10?option1=${v}`);
      setParts(r.data);
    } else setParts([]);
    setItems([]);
  };

  const onPartChange = async (e) => {
    const v = e.target.value;
    setScheduleItem({ ...scheduleItem, partNo: v, itemNo: '' });
    if (v) {
      const r = await api.get(`/masters/9?option1=${v}`);
      setItems(r.data);
    } else setItems([]);
  };

  const loadCaptcha = async () => {
    try {
      const { data } = await api.get('/captcha/generate');
      setCaptcha(data);
      setCaptchaAnswer('');
    } catch (_) {}
  };

  const loadMemberAnsCaptcha = async () => {
    try {
      const { data } = await api.get('/captcha/generate');
      setMemAnsCaptcha(data);
      setMemAnsCaptchaAnswer('');
    } catch (_) {}
  };

  // CAPTCHA auto-mode: load it as soon as the relevant section is shown —
  // no "Load CAPTCHA" click required. Reloads when the respondent type flips
  // between Member (lookup captcha) and Firm (answerable-member captcha).
  useEffect(() => {
    if (form.resType === 'firm') loadMemberAnsCaptcha();
    else loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.resType]);

  const onGetMemberDetails = async () => {
    if (!memberRegNo) { popup.warning('Please enter Membership No'); return; }
    if (!captchaAnswer) { popup.warning('Please enter CAPTCHA'); return; }
    setMemberLookupBusy(true);
    try {
      try {
        const vr = await api.post('/captcha/verify', { id: captcha.id, answer: captchaAnswer });
        if (!vr.data.valid) { popup.warning('Invalid CAPTCHA'); loadCaptcha(); return; }
      } catch (_) { popup.warning('Invalid CAPTCHA'); loadCaptcha(); return; }
      try {
        const { data } = await api.post('/auth/member-lookup', { membershipNo: memberRegNo });
        const st = commStates.find((s) => s.label?.toLowerCase() === (data.professionalState || '').toLowerCase());
        setForm((f) => ({
          ...f,
          resRegistrationNo: memberRegNo,
          resName: data.name || '',
          resEmail: data.email || '',
          resMobile: data.mobile || '',
          resProfessionalAddress: data.professionalAddress || '',
          resRStateName: data.professionalState || '',
          resRCityName: data.city || '',
          resRegion: st?.Region || '',
        }));
        loadCaptcha();
      } catch (ex) {
        popup.error(ex.response?.data?.error || 'Member not found');
        loadCaptcha();
      }
    } finally {
      setMemberLookupBusy(false);
    }
  };

  const onGetMemberAnsDetails = async () => {
    if (!memRegNo) { popup.warning('Please enter Membership No'); return; }
    if (!memAnsCaptchaAnswer) { popup.warning('Please enter CAPTCHA'); return; }
    setMemAnsLookupBusy(true);
    try {
      try {
        const vr = await api.post('/captcha/verify', { id: memAnsCaptcha.id, answer: memAnsCaptchaAnswer });
        if (!vr.data.valid) { popup.warning('Invalid CAPTCHA'); loadMemberAnsCaptcha(); return; }
      } catch (_) { popup.warning('Invalid CAPTCHA'); loadMemberAnsCaptcha(); return; }
      try {
        const { data } = await api.post('/auth/member-lookup', { membershipNo: memRegNo });
        setMemName(data.name || '');
        setMemMobile(data.mobile || '');
        setMemEmail(data.email || '');
        setMemProAddress(data.professionalAddress || '');
        setMemProState(data.professionalState || '');
        setMemProCity(data.city || '');
        loadMemberAnsCaptcha();
      } catch (ex) {
        popup.error(ex.response?.data?.error || 'Member not found');
        loadMemberAnsCaptcha();
      }
    } finally {
      setMemAnsLookupBusy(false);
    }
  };

  const onSameAddress = (e) => {
    const checked = e.target.checked;
    setForm((f) => {
      if (checked && f.resType === 'firm') {
        return {
          ...f,
          isChkSameAddress: true,
          resCommunicationAddress: f.resProfessionalAddress,
          resStateId: f.firmProfStateId,
          resCityId: f.firmProfCityId,
          resComRegion: f.resRegion,
        };
      }
      if (checked) {
        // member: communication = professional (from lookup, needs state value)
        const st = commStates.find((s) => s.label?.toLowerCase() === (f.resRStateName || '').toLowerCase());
        const cityMatch = commCities.find((c) => c.label?.trim().toLowerCase() === (f.resRCityName || '').trim().toLowerCase());
        return {
          ...f,
          isChkSameAddress: true,
          resCommunicationAddress: f.resProfessionalAddress,
          resStateId: st ? String(st.value) : f.resStateId,
          resCityId: cityMatch ? String(cityMatch.value) : '',
          resComRegion: f.resRegion,
        };
      }
      return { ...f, isChkSameAddress: false, resCommunicationAddress: '', resStateId: '', resCityId: '', resComRegion: '' };
    });
    if (checked) {
      const f = form;
      let stid = f.resType === 'firm' ? f.firmProfStateId : '';
      if (f.resType === 'member') {
        const st = commStates.find((s) => s.label?.toLowerCase() === (f.resRStateName || '').toLowerCase());
        stid = st ? String(st.value) : '';
      }
      if (stid) loadCities(stid, setCommCities);
    }
  };

  const onPersonAdd = () => {
    if (!personName || !personMobile || !personEmail) { popup.warning('Please fill all person fields'); return; }
    if (!isValidName(personName)) { popup.warning('Please enter a valid Name of Person (letters only)'); return; }
    if (!isValidMobile(personMobile, '91')) { popup.warning('Please enter valid 10-digit mobile number (starting 6-9)'); return; }
    if (!isValidEmail(personEmail)) { popup.warning('Please enter valid email ID'); return; }
    setPersons([...persons, { personName: personName.trim(), personMobile, personEmail: personEmail.trim() }]);
    setPersonName(''); setPersonMobile(''); setPersonEmail('');
  };

  const onScheduleAdd = () => {
    const { schedule, partNo, itemNo, misconductDate, misconductDateFrom, misconductDateTo } = scheduleItem;
    if (!schedule || !partNo || !itemNo) { popup.warning('Please select Schedule Number, Part Number and Item Number'); return; }
    if (!misconductDateFrom) { popup.warning('Please select Misconduct Period Date From'); return; }
    if (!misconductDateTo) { popup.warning('Please select Misconduct Period Date To'); return; }
    if (!isDateRangeOk(misconductDateFrom, misconductDateTo)) {
      popup.warning('Misconduct Period Date To must be on or after Date From');
      return;
    }
    if (misconductDate && misconductDateFrom && misconductDateTo
      && !(new Date(misconductDateFrom) <= new Date(misconductDate) && new Date(misconductDate) <= new Date(misconductDateTo))) {
      popup.warning('Misconduct Date must lie within the Misconduct Period (From - To)');
      return;
    }
    const schName = schedules.find((s) => String(s.value) === schedule)?.label || schedule;
    const partLabel = parts.find((p) => String(p.value) === partNo)?.label || partNo;
    const itemLabel = items.find((i) => String(i.value) === itemNo)?.label || itemNo;
    const exists = scheduleList.find((s) => s.schedule === schedule && s.partNo === partNo && s.itemNo === itemNo);
    if (exists) { popup.warning('Selected Schedule already Exists'); return; }
    setScheduleList([...scheduleList, {
      schedule, partNo, itemNo, misconductDate,
      misconductDateTo: misconductDateTo || null, misconductDateFrom: misconductDateFrom || null,
      scheduleName: schName, partLabel, itemLabel,
    }]);
    setScheduleItem({ schedule: '', partNo: '', itemNo: '', misconductDate: '', misconductDateFrom: '', misconductDateTo: '' });
  };

  const onDocAdd = (path, name) => {
    if (!docName) { popup.warning('Please enter Document/Evidence Name'); return; }
    setDocs([...docs, { documentId: docName, docUrl: path, fileName: name }]);
    setDocName('');
  };

  const onAnswerableAdd = async () => {
    if (!memRegNo) { popup.warning('Please enter Member Registration No'); return; }
    if (!/^[A-Za-z0-9-]{5,20}$/.test(String(memRegNo).trim())) { popup.warning('Please enter a valid Membership No (5-20 letters/digits)'); return; }
    if (!memAnsCaptchaAnswer) { popup.warning('Please complete CAPTCHA verification'); return; }
    if (memMobile && !isValidMobile(memMobile, memCountryCode)) {
      popup.warning(String(memCountryCode) === '91'
        ? 'Please enter valid 10-digit mobile number (starting 6-9)'
        : 'Please enter a valid mobile number');
      return;
    }
    if (memEmail && !isValidEmail(memEmail)) { popup.warning('Please enter valid email ID'); return; }
    if (memName && !isValidName(memName)) { popup.warning('Please enter a valid Name (letters only)'); return; }
    if (form.resRegistrationNo === memRegNo) { popup.warning('Respondent and Answerable member cannot be same'); return; }
    if (answerableMembers.find((m) => m.memRegistrationNo === memRegNo)) { popup.warning('Already added Answerable member'); return; }
    setAnswerableMembers([...answerableMembers, {
      memName, memRegistrationNo: memRegNo, memCountryCode, memMobileNo: memMobile,
      memSTDCode: memStdCode, memLandlineNo: memLandline, memEmailID: memEmail,
      memProAddress, memCommAddress, memProState, memProCity,
      memCommStateId, memCommCityId, memProRegion, memCommRegion, firmNo: form.firmNo,
    }]);
    setMemName(''); setMemRegNo(''); setMemMobile(''); setMemStdCode(''); setMemLandline('');
    setMemEmail(''); setMemProAddress(''); setMemCommAddress(''); setMemProState('');
    setMemCommStateId(''); setMemCommCityId(''); setMemProRegion(''); setMemCommRegion('');
    setMemAnsCaptcha(null); setMemAnsCaptchaAnswer('');
  };

  const onAudioUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['.mp3', '.wav', '.mp4', '.wmv', '.avi'];
    if (!allowed.some((a) => f.name.toLowerCase().endsWith(a))) {
      popup.warning('Only MP3, WAV, MP4, WMV, AVI files allowed'); return;
    }
    if (f.size > 15 * 1024 * 1024) { popup.warning('File size should not be greater than 15mb'); return; }
    try {
      const data = await uploadFile(f, 'audiovideo');
      setAudioFiles([...audioFiles, { attachment: data.relativePath || data.path, fileName: f.name }]);
    } catch (_) { popup.error('Upload failed'); }
  };

  const validate = () => {
    if (!form.compTypeId) return 'Please select Type of Complaint';
    const ctLabel = compTypes.find((c) => String(c.value) === String(form.compTypeId))?.label || '';
    if (['Central Goverment', 'State Goverment', 'Regulatory Agency'].includes(ctLabel)) {
      if (!form.regulatorName) return 'Please enter Regulator Name';
    }
    if (!form.name) return 'Please enter Name';
    if (!isValidName(form.name)) return 'Please enter a valid Name (letters, spaces, dots, hyphens only)';
    if (!form.email) return 'Please enter Email ID';
    if (!isValidEmail(form.email)) return 'Please enter a valid Email ID';
    if (!form.countryCode) return 'Please enter Country Code';
    if (!form.mobile) return 'Please enter Mobile No';
    if (!isValidMobile(form.mobile, form.countryCode)) {
      return String(form.countryCode) === '91'
        ? 'Please enter a valid 10-digit Mobile No (starting 6-9)'
        : 'Please enter a valid Mobile No';
    }
    if (form.stdCode && !isValidStdCode(form.stdCode)) return 'Please enter a valid STD Code (2-4 digits)';
    if (form.landlineNo && !isValidLandline(form.landlineNo)) return 'Please enter a valid Landline No (6-8 digits)';
    if (!form.address) return 'Please enter Flat, House no., Building, Company, Apartment';
    if (!form.area) return 'Please enter Area, Street, Sector, Village';
    if (!form.stateId) return 'Please select State';
    if (!form.cityId) return 'Please select City';
    if (!isValidPincode(form.pincode)) return 'Please enter valid 6-digit Pincode';
    const pan = String(form.aadharNo || '').trim().toUpperCase();
    if (!pan) return 'Please enter PAN No';
    if (!isValidPan(pan)) return 'Please enter a valid PAN No (e.g., AAAPA1234A — 4th letter P for individuals)';
    if (!form.aadharPhoto) return 'Please upload Complainant PAN No. Photo';
    if (!form.complaintantPhoto) return 'Please upload Complainant Photo';
    if (!form.complaintantSignature) return 'Please upload Complainant Signature';

    if (form.resType === 'member') {
      if (!form.resName) return 'Please enter Respondent Name';
      if (!isValidName(form.resName)) return 'Please enter a valid Respondent Name (letters only)';
      if (!form.resRegistrationNo) return 'Please enter Membership Number';
      if (!/^[A-Za-z0-9-]{5,20}$/.test(String(form.resRegistrationNo).trim())) {
        return 'Please enter a valid Membership Number (5-20 letters/digits)';
      }
      if (!form.resMobile) return 'Please enter Respondent Mobile No';
      if (!isValidMobile(form.resMobile, form.resCountryCode)) {
        return String(form.resCountryCode) === '91'
          ? 'Please enter a valid 10-digit Respondent Mobile No (starting 6-9)'
          : 'Please enter a valid Respondent Mobile No';
      }
      if (form.resEmail && !isValidEmail(form.resEmail)) return 'Please enter a valid Respondent Email ID';
      if (form.resStdCode && !isValidStdCode(form.resStdCode)) return 'Please enter a valid STD Code (2-4 digits)';
      if (form.resLandlineNo && !isValidLandline(form.resLandlineNo)) return 'Please enter a valid Landline No (6-8 digits)';
      if (!form.resProfessionalAddress) return 'Please enter Professional Address';
      if (!form.resCommunicationAddress) return 'Please enter Communication Address';
      if (!form.resStateId) return 'Please select Communication State';
      if (!form.resCityId) return 'Please select Communication City';
    } else {
      if (!form.nameOfFirm) return 'Please enter Name of Firm';
      if (!isValidFirmName(form.nameOfFirm)) return 'Please enter a valid Name of Firm';
      if (!form.firmNo) return 'Please enter Firm No';
      if (!/^[A-Za-z0-9-]{1,20}$/.test(String(form.firmNo).trim())) return 'Please enter a valid Firm No (letters/digits)';
      if (!form.resMobile) return 'Please enter Respondent Mobile No';
      if (!isValidMobile(form.resMobile, form.resCountryCode)) {
        return String(form.resCountryCode) === '91'
          ? 'Please enter a valid 10-digit Respondent Mobile No (starting 6-9)'
          : 'Please enter a valid Respondent Mobile No';
      }
      if (form.resEmail && !isValidEmail(form.resEmail)) return 'Please enter a valid Respondent Email ID';
      if (!form.resProfessionalAddress) return 'Please enter Professional Address';
      if (!form.resCommunicationAddress) return 'Please enter Communication Address';
      if (!form.firmProfStateId) return 'Please select Professional State';
      if (!form.firmProfCityId) return 'Please select Professional City';
      if (!form.resStateId) return 'Please select Communication State';
      if (!form.resCityId) return 'Please select Communication City';
    }

    if (!form.briefAttachment) return 'Please upload Brief Fact Statement';
    if (!form.misconductAttachment) return 'Please upload Particular of Misconduct';
    if (scheduleList.length === 0) return 'Please add at least one allegation / misconduct';
    if (!form.entityMisconduct) return 'Please enter Entity in respect of which misconduct alleged';
    if (String(form.entityMisconduct).trim().length < 2) return 'Please enter a valid Entity name';

    const isGovType = ['Central Goverment', 'State Goverment', 'Regulatory Agency'].includes(ctLabel);
    if (!isGovType) {
      if (!form.paymentMode) return 'Please select Mode of Payment';
      if (!form.paymentDate) return 'Please enter Payment Date';
      if (isFutureDate(form.paymentDate)) return 'Payment Date cannot be in the future';
      if (!form.transRefNo) return 'Please enter Transaction Reference No';
      if (String(form.transRefNo).trim().length < 3) return 'Please enter a valid Transaction Reference No';
      if (!form.instrumentNo) return 'Please enter Instrument Number';
      if (String(form.instrumentNo).trim().length < 3) return 'Please enter a valid Instrument Number';
      if (!form.instrumentDate) return 'Please enter Instrument Date';
      if (isFutureDate(form.instrumentDate)) return 'Instrument Date cannot be in the future';
      if (!form.taxableAmount) return 'Please enter Taxable Amount';
      if (!(parseFloat(form.taxableAmount) > 0)) return 'Please enter a valid Taxable Amount';
      if (!form.taxRate) return 'Please enter Tax Rate';
      if (form.gstinNo && !isValidGstin(form.gstinNo)) return 'Please enter a valid GSTIN (15 characters, e.g., 22AAAAA0000A1Z5)';
      if (!form.paymentDetails) return 'Please enter Payment Details Like DD';
    }
    if (docs.length === 0) return 'Please provide at least one document/evidence';
    if (form.isAudioVideo === '1') {
      if (audioFiles.length === 0) return 'Please upload Audio/Video Evidence';
      if (!form.digitalEvidenceCert) return 'Please upload Digital Evidence Certificate';
    }
    if (!form.declaration) return 'Please Accept Declaration';
    return null;
  };

  const handleSubmit = async (preview = false) => {
    const vErr = validate();
    if (vErr) { popup.error(vErr); return; }
    setBusy(true);
    try {
      const T = (v) => String(v ?? '').trim();
      const payload = {
        ...form,
        name: T(form.name), email: T(form.email),
        address: T(form.address), area: T(form.area), landmark: T(form.landmark),
        pincode: T(form.pincode), aadharNo: T(form.aadharNo).toUpperCase(),
        nameOfFirm: T(form.nameOfFirm), firmNo: T(form.firmNo).toUpperCase(),
        resName: T(form.resName), resRegistrationNo: T(form.resRegistrationNo).toUpperCase(),
        resMobile: T(form.resMobile), resEmail: T(form.resEmail),
        resProfessionalAddress: T(form.resProfessionalAddress),
        resCommunicationAddress: T(form.resCommunicationAddress),
        transRefNo: T(form.transRefNo), instrumentNo: T(form.instrumentNo),
        gstinNo: T(form.gstinNo), paymentDetails: T(form.paymentDetails),
        entityMisconduct: T(form.entityMisconduct),
        regulatorName: T(form.regulatorName), regulatorDesignation: T(form.regulatorDesignation),
        resStateName: form.resRStateName,
        resCityName: form.resRCityName,
        rStateName: form.resRStateName,
        rCityName: form.resRCityName,
        isAnswerable: form.isAnswerable === '1' || answerableMembers.length > 0 ? '1' : '0',
        isAudioVideo: audioFiles.length > 0 ? '1' : '0',
        documents: form.isAudioVideo === '1' && form.digitalEvidenceCert
          ? [...docs, { documentId: 'Digital Evidence Certificate', docUrl: form.digitalEvidenceCert, fileName: form.digitalEvidenceCert.split(/[\\/]/).pop() }]
          : docs,
        factPersons: persons,
        schedules: scheduleList,
        answerableMembers,
        audioVideo: audioFiles,
        isChkSameAddress: form.isChkSameAddress,
        declaration: form.declaration,
        isFirm: form.resType === 'firm',
      };
      for (const k of ['stateId', 'cityId', 'resStateId', 'resCityId', 'firmProfStateId', 'firmProfCityId']) {
        payload[k] = /^\d+$/.test(String(payload[k] || '').trim()) ? String(payload[k]).trim() : '';
      }
      let data;
      if (isEdit) {
        data = (await api.put(`/complaints/${editId}`, payload)).data;
      } else {
        data = (await api.post('/complaints', payload)).data;
      }
      if (preview) {
        popup.success(`Complaint saved as draft (${data.CompNo || editId}). Preview will be available soon.`);
      } else {
        if (isEdit) {
          popup.success('Complaint updated and sent to SO successfully');
          navigate(`/complaints/${editId}`);
        } else {
          popup.success(`Complaint ${data.CompNo} filed successfully`);
          navigate(`/complaints/${data.CompID}`);
        }
      }
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to file complaint');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => navigate(-1);

  const formTitle = isGovEmp
    ? 'Filing disciplinary complaint accompanied with investigation report by Government/its agencies'
    : 'Filing disciplinary complaint by Private Individual/Company/Firm';

  const ctLabel = compTypes.find((c) => String(c.value) === String(form.compTypeId))?.label || '';
  const isGovType = ['Central Goverment', 'State Goverment', 'Regulatory Agency'].includes(ctLabel);

  return (
    <div>
      <div className="d-flex align-items-center mb-3">
        <button className="btn btn-outline-secondary me-3 btn-sm" onClick={goBack}><i className="bi bi-arrow-left"></i></button>
        <div>
          <h4 className="mb-0">
            {isEdit ? 'Edit Complaint' : 'Register New Complaint'}
            <span className="fw-bold ms-2" style={{ fontSize: '0.99rem' }}>(FORM {formType})</span>
          </h4>
          {isEdit
            ? <small className="text-muted">Modify all complaint details using the complaint submission form. The updated complaint will be sent to the SO for re-scrutiny.</small>
            : (!isDD && <small className="text-muted">{formTitle}</small>)}
        </div>
      </div>

      {/* ===== PARTICULARS OF COMPLAINANT / INFORMATION ===== */}
      <div className="card mb-3">
        <div className="card-header bg-primary text-white fw-semibold"><i className="bi bi-person me-2"></i>Particulars of the Complaint/Information</div>
        <div className="card-body">
          <div className="mb-3">
            <span className="badge bg-dark text-uppercase me-2">Form {formType}</span>
            <span className="text-muted small">{formTitle}</span>
          </div>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Type of Complaint *</label>
              <select className="form-select" value={form.compTypeId} onChange={onCompTypeChange}>
                <option value="">--Select--</option>
                {compTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Name *</label>
              <input className="form-control" value={form.name} onChange={set('name')} readOnly={!isDD} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Email ID *</label>
              <input type="email" className="form-control" maxLength={100} value={form.email} onChange={set('email')} readOnly={!isDD} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Country Code *</label>
              <select className="form-select" value={form.countryCode} onChange={set('countryCode')}>
                {CCODES.map((c) => <option key={c} value={c}>+{c}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Mobile No *</label>
              <input className="form-control" value={form.mobile} onChange={set('mobile')} readOnly={!isDD} inputMode="numeric" maxLength={String(form.countryCode) === '91' ? 10 : 15} />
            </div>
            <div className="col-md-2">
              <label className="form-label">STD Code</label>
              <input className="form-control" maxLength={8} value={form.stdCode} onChange={set('stdCode')} inputMode="numeric" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Landline No</label>
              <input className="form-control" maxLength={8} value={form.landlineNo} onChange={set('landlineNo')} inputMode="numeric" />
            </div>
            <div className="col-md-2">
              <label className="form-label">Region *</label>
              <input className="form-control" value={form.complainantRegion || ''} readOnly />
            </div>
            <div className="col-md-6">
              <label className="form-label">Flat, House no., Building, Company, Apartment *</label>
              <input className="form-control" value={form.address} onChange={set('address')} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Area, Street, Sector, Village *</label>
              <input className="form-control" value={form.area} onChange={set('area')} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Landmark</label>
              <input className="form-control" value={form.landmark} onChange={set('landmark')} />
            </div>
            <div className="col-md-3">
              <label className="form-label">State *</label>
              <select className="form-select" value={form.stateId} onChange={onStateChange}>
                <option value="">--Select--</option>
                {states.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">City *</label>
              <select className="form-select" value={form.cityId} onChange={set('cityId')} disabled={!form.stateId}>
                <option value="">--Select--</option>
                {cities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Pincode *</label>
              <input className="form-control" maxLength={6} value={form.pincode} onChange={set('pincode')} inputMode="numeric" />
            </div>
            <div className="col-md-4">
              <label className="form-label">PAN No. *</label>
              <input className="form-control" maxLength={10} value={form.aadharNo} onChange={set('aadharNo')} placeholder="AAAPA1234A" title="PAN: 3 letters, holder-type letter (P=Individual, F=Firm, C=Company), name letter, 4 digits, 1 letter" />
            </div>
            <div className="col-md-4">
              <FileUploadInput label="Upload Complainant PAN No. Photo" hint={`${IMAGE_HINT}\nUploaded with duly signed.`}
                accept=".png,.jpg,.jpeg" sizeMB={0.5} required preview type="aadhar"
                current={form.aadharPhoto} onUpload={(path) => setForm({ ...form, aadharPhoto: path })} />
            </div>
            <div className="col-md-4">
              <FileUploadInput label="Upload Complainant Photo" hint={`${IMAGE_HINT}\nUploaded with duly signed.`}
                accept=".png,.jpg,.jpeg" sizeMB={0.5} required preview type="photo"
                current={form.complaintantPhoto} onUpload={(path) => setForm({ ...form, complaintantPhoto: path })} />
            </div>
            <div className="col-md-4">
              <FileUploadInput label="Upload Complainant Signature" hint={`${IMAGE_HINT}\nUploaded with duly signed.`}
                accept=".png,.jpg,.jpeg" sizeMB={0.5} required preview type="signature"
                current={form.complaintantSignature} onUpload={(path) => setForm({ ...form, complaintantSignature: path })} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== PARTICULARS OF THE RESPONDENT ===== */}
      <div className="card mb-3">
        <div className="card-header bg-secondary text-white fw-semibold"><i className="bi bi-person-dash me-2"></i>Particulars of the Respondent</div>
        <div className="card-body">
          <div className="row g-3 mb-3">
            <div className="col-md-12">
              <label className="form-label fw-bold">Respondent is a:</label>
              <div className="radio-card-list">
                <label className="radio-card">
                  <input className="form-check-input" type="radio" name="resType" id="resMember" value="member"
                    checked={form.resType === 'member'} onChange={() => setForm({ ...form, resType: 'member' })} />
                  <span className="radio-card-label">Member</span>
                </label>
                <label className="radio-card">
                  <input className="form-check-input" type="radio" name="resType" id="resFirm" value="firm"
                    checked={form.resType === 'firm'} onChange={() => setForm({ ...form, resType: 'firm' })} />
                  <span className="radio-card-label">Firm</span>
                </label>
              </div>
            </div>
          </div>

          {form.resType === 'firm' ? (
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <label className="form-label">Name of Firm *</label>
                <input className="form-control" value={form.nameOfFirm} onChange={set('nameOfFirm')} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Firm No *</label>
                <input className="form-control" value={form.firmNo} onChange={set('firmNo')} />
              </div>
            </div>
          ) : (
            <div className="row g-3 mb-3">
              <div className="col-md-3">
                <label className="form-label">Membership Number *</label>
                <input className="form-control" maxLength={20} value={memberRegNo} onChange={(e) => setMemberRegNo(sanitizeAlphaNumUpper(e.target.value, 20))} />
                <small className="text-muted" style={{ fontSize: 11 }}>Please add prefix '0' (Zero) If membership no is less than 6 digit.</small>
              </div>
              <div className="col-md-2">
                <label className="form-label">CAPTCHA Image</label>
                <div className="d-flex align-items-center" style={{ minHeight: 38 }}>
                  {captcha && <img src={captcha.image} alt="CAPTCHA" height={36} style={{ cursor: 'pointer' }} onClick={loadCaptcha} title="Click to refresh" />}
                  {!captcha && <button className="btn btn-outline-secondary btn-sm" onClick={loadCaptcha} type="button">Load CAPTCHA</button>}
                </div>
              </div>
              <div className="col-md-2">
                <label className="form-label">Enter CAPTCHA</label>
                <input className="form-control" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} />
              </div>
              <div className="col-md-2">
                <label className="form-label">&nbsp;</label>
                <button className="btn btn-outline-secondary w-100" style={{ height: 38 }} onClick={loadCaptcha} type="button" title="Refresh CAPTCHA">
                  <i className="bi bi-arrow-clockwise me-1"></i>Refresh CAPTCHA
                </button>
              </div>
              <div className="col-md-3">
                <label className="form-label">&nbsp;</label>
                <button className="btn btn-primary w-100" style={{ height: 38 }} onClick={onGetMemberDetails} type="button" disabled={memberLookupBusy}>
                  {memberLookupBusy ? (
                    <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />Loading...</>
                  ) : (
                    <><i className="bi bi-search me-1"></i>Get Member Details</>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Name</label>
              <input className="form-control" value={form.resName} onChange={set('resName')} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Country Code</label>
              <select className="form-select" value={form.resCountryCode} onChange={set('resCountryCode')}>
                {CCODES.map((c) => <option key={c} value={c}>+{c}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Mobile No *</label>
              <input className="form-control" value={form.resMobile} onChange={set('resMobile')} inputMode="numeric" maxLength={String(form.resCountryCode) === '91' ? 10 : 15} />
            </div>
            <div className="col-md-1">
              <label className="form-label">STD Code</label>
              <input className="form-control" maxLength={4} value={form.resStdCode} onChange={set('resStdCode')} inputMode="numeric" />
            </div>
            <div className="col-md-2">
              <label className="form-label">Landline No</label>
              <input className="form-control" maxLength={8} value={form.resLandlineNo} onChange={set('resLandlineNo')} inputMode="numeric" />
            </div>
            <div className="col-md-4">
              <label className="form-label">Email ID</label>
              <input type="email" className="form-control" maxLength={100} value={form.resEmail} onChange={set('resEmail')} />
            </div>
            <div className="col-md-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="sameAddr" checked={form.isChkSameAddress} onChange={onSameAddress} />
                <label className="form-check-label" htmlFor="sameAddr">Same as Professional Address</label>
              </div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Professional Address *</label>
              <input className="form-control" value={form.resProfessionalAddress} onChange={set('resProfessionalAddress')} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Communication Address *</label>
              <input className="form-control" value={form.resCommunicationAddress} onChange={set('resCommunicationAddress')} />
            </div>

            {form.resType === 'firm' ? (
              <>
                <div className="col-md-3">
                  <label className="form-label">Professional State *</label>
                  <select className="form-select" value={form.firmProfStateId} onChange={onProfStateChange}>
                    <option value="">--Select--</option>
                    {profStates.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label">Professional City *</label>
                  <select className="form-select" value={form.firmProfCityId} onChange={set('firmProfCityId')} disabled={!form.firmProfStateId}>
                    <option value="">--Select--</option>
                    {profCities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label">Professional Region *</label>
                  <input className="form-control" value={form.resRegion || ''} readOnly />
                </div>
              </>
            ) : (
              <>
                <div className="col-md-3">
                  <label className="form-label">Professional State *</label>
                  <input className="form-control" value={form.resRStateName || ''} readOnly />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Professional City *</label>
                  <input className="form-control" value={form.resRCityName || ''} readOnly />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Professional Region *</label>
                  <input className="form-control" value={form.resRegion || ''} readOnly />
                </div>
              </>
            )}

            <div className="col-md-3">
              <label className="form-label">Communication State *</label>
              <select className="form-select" value={form.resStateId} onChange={onCommStateChange}>
                <option value="">--Select--</option>
                {commStates.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Communication City *</label>
              <select className="form-select" value={form.resCityId} onChange={set('resCityId')} disabled={!form.resStateId}>
                <option value="">--Select--</option>
                {commCities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Communication Region</label>
              <input className="form-control" value={form.resComRegion || ''} readOnly />
            </div>
          </div>

          {/* Members Answerable (for firms) */}
          {form.resType === 'firm' && (
            <div className="mt-4 border-top pt-3">
              <h6 className="text-primary mb-3">Do you know any member answerable?</h6>
              <div className="row g-3 mb-3">
                <div className="col-md-2">
                  <label className="form-label">Membership No</label>
                  <input className="form-control" maxLength={20} value={memRegNo} onChange={(e) => setMemRegNo(sanitizeAlphaNumUpper(e.target.value, 20))} />
                </div>
                <div className="col-md-2">
                  <label className="form-label">CAPTCHA Image</label>
                  <div className="d-flex align-items-center" style={{ minHeight: 38 }}>
                    {memAnsCaptcha && <img src={memAnsCaptcha.image} alt="CAPTCHA" height={36} style={{ cursor: 'pointer' }} onClick={loadMemberAnsCaptcha} title="Click to refresh" />}
                    {!memAnsCaptcha && <button className="btn btn-outline-secondary btn-sm" onClick={loadMemberAnsCaptcha} type="button">Load CAPTCHA</button>}
                  </div>
                </div>
                <div className="col-md-2">
                  <label className="form-label">Enter CAPTCHA</label>
                  <input className="form-control" value={memAnsCaptchaAnswer} onChange={(e) => setMemAnsCaptchaAnswer(e.target.value)} />
                </div>
                <div className="col-md-1">
                  <label className="form-label">&nbsp;</label>
                  <button className="btn btn-outline-secondary w-100 px-2" style={{ height: 38 }} onClick={loadMemberAnsCaptcha} type="button" title="Refresh CAPTCHA">
                    <i className="bi bi-arrow-clockwise"></i>
                  </button>
                </div>
                <div className="col-md-2">
                  <label className="form-label">&nbsp;</label>
                  <button className="btn btn-primary w-100" style={{ height: 38 }} onClick={onGetMemberAnsDetails} type="button" disabled={memAnsLookupBusy}>
                    {memAnsLookupBusy ? (
                      <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />Loading...</>
                    ) : (
                      <><i className="bi bi-search me-1"></i>Get Details</>
                    )}
                  </button>
                </div>
              </div>
              <div className="row g-3 mb-3">
                <div className="col-md-3"><label className="form-label">Name</label><input className="form-control" value={memName} onChange={(e) => setMemName(e.target.value)} /></div>
                <div className="col-md-2"><label className="form-label">Mobile No</label><input className="form-control" maxLength={String(memCountryCode) === '91' ? 10 : 15} inputMode="numeric" value={memMobile} onChange={(e) => setMemMobile(sanitizeDigits(e.target.value, 15))} /></div>
                <div className="col-md-3"><label className="form-label">Email ID</label><input className="form-control" maxLength={100} value={memEmail} onChange={(e) => setMemEmail(e.target.value.trim())} /></div>
                <div className="col-md-2">
                  <label className="form-label">Comm State</label>
                  <select className="form-select" value={memCommStateId} onChange={async (e) => {
                    setMemCommStateId(e.target.value);
                    if (e.target.value) {
                      const r = await api.get(`/masters/7?option1=${e.target.value}`);
                      setMemCommCities(r.data);
                    }
                  }}>
                    <option value="">--Select--</option>
                    {memCommStates.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="form-label">Comm City</label>
                  <select className="form-select" value={memCommCityId} onChange={(e) => setMemCommCityId(e.target.value)} disabled={!memCommStateId}>
                    <option value="">--Select--</option>
                    {memCommCities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn btn-success btn-sm mb-3" onClick={onAnswerableAdd} type="button">
                <i className="bi bi-plus-circle me-1"></i>Save
              </button>
              {answerableMembers.length > 0 && (
                <table className="table table-sm table-bordered">
                  <thead><tr><th>Name</th><th>Reg No</th><th>Mobile</th><th>Email</th><th>Action</th></tr></thead>
                  <tbody>
                    {answerableMembers.map((m, i) => (
                      <tr key={i}>
                        <td>{m.memName}</td><td>{m.memRegistrationNo}</td><td>{m.memMobileNo}</td><td>{m.memEmailID}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => setAnswerableMembers(answerableMembers.filter((_, j) => j !== i))} type="button">Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== PARTICULARS OF COMPLAINT ===== */}
      <div className="card mb-3">
        <div className="card-header bg-info text-white fw-semibold"><i className="bi bi-file-text me-2"></i>Particulars of Complaint</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <FileUploadInput label="Brief Fact Statement (Upload File)" hint={`Uploaded with duly signed.\n${PDF_HINT}`}
                accept=".pdf" sizeMB={10} required
                current={form.briefAttachment} onUpload={(path) => setForm({ ...form, briefAttachment: path })} />
            </div>
            <div className="col-12">
              <FileUploadInput label="Particular of Misconduct (Upload File)" hint={`Uploaded with duly signed.\n${PDF_HINT}`}
                accept=".pdf" sizeMB={10} required
                current={form.misconductAttachment} onUpload={(path) => setForm({ ...form, misconductAttachment: path })} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== PERSONS HAVING KNOWLEDGE OF FACTS ===== */}
      <div className="card mb-3">
        <div className="card-header bg-dark text-white fw-semibold"><i className="bi bi-people me-2"></i>Name of person who have knowledge of the facts of the case</div>
        <div className="card-body">
          <div className="row g-3 mb-2">
            <div className="col-md-3">
              <label className="form-label">Name of Person</label>
              <input className="form-control" value={personName} onChange={(e) => setPersonName(e.target.value)} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Mobile No.</label>
              <input className="form-control" maxLength={10} inputMode="numeric" value={personMobile} onChange={(e) => setPersonMobile(sanitizeDigits(e.target.value, 15))} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Email ID</label>
              <input type="email" className="form-control" maxLength={100} value={personEmail} onChange={(e) => setPersonEmail(e.target.value.trim())} />
            </div>
            <div className="col-md-3 d-flex align-items-end">
              <button className="btn btn-success btn-sm" onClick={onPersonAdd} type="button"><i className="bi bi-plus-circle me-1"></i>Save</button>
            </div>
          </div>
          <p className="small text-muted mb-3" style={{ fontSize: 12 }}>Please click the save button to store one or more person.</p>
          {persons.length > 0 && (
            <table className="table table-sm table-bordered">
              <thead><tr><th>Name of Person</th><th>Mobile No.</th><th>Email ID</th><th>Action</th></tr></thead>
              <tbody>
                {persons.map((p, i) => (
                  <tr key={i}>
                    <td>{p.personName}</td><td>{p.personMobile}</td><td>{p.personEmail}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => setPersons(persons.filter((_, j) => j !== i))} type="button">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== MISCONDUCT SCHEDULE ===== */}
      <div className="card mb-3">
        <div className="card-header bg-danger text-white fw-semibold"><i className="bi bi-list-check me-2"></i>The alleged misconduct falls under :</div>
        <div className="card-body">
          <div className="row g-3 mb-2">
            <div className="col-md-3">
              <label className="form-label">Schedule Number *</label>
              <select className="form-select" value={scheduleItem.schedule} onChange={onScheduleChange}>
                <option value="">--Select--</option>
                {schedules.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Part Number *</label>
              <select className="form-select" value={scheduleItem.partNo} onChange={onPartChange} disabled={!scheduleItem.schedule}>
                <option value="">--Select--</option>
                {parts.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Item No *</label>
              <select className="form-select" value={scheduleItem.itemNo} onChange={(e) => setScheduleItem({ ...scheduleItem, itemNo: e.target.value })} disabled={!scheduleItem.partNo}>
                <option value="">--Select--</option>
                {items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Misconduct Date</label>
              <input type="date" className="form-control" value={scheduleItem.misconductDate} onChange={(e) => setScheduleItem({ ...scheduleItem, misconductDate: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Misconduct Period Date From *</label>
              <input type="date" className="form-control" value={scheduleItem.misconductDateFrom} onChange={(e) => setScheduleItem({ ...scheduleItem, misconductDateFrom: e.target.value })} />
            </div>
          </div>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Misconduct Period Date To *</label>
              <input type="date" className="form-control" value={scheduleItem.misconductDateTo} onChange={(e) => setScheduleItem({ ...scheduleItem, misconductDateTo: e.target.value })} />
            </div>
            <div className="col-md-3 d-flex align-items-end">
              <button className="btn btn-success btn-sm" onClick={onScheduleAdd} type="button"><i className="bi bi-plus-circle me-1"></i>Save</button>
            </div>
          </div>
          <p className="small text-muted mb-3" style={{ fontSize: 12 }}>Please click the save button to store one or more allegation information.</p>
          {scheduleList.length > 0 && (
            <table className="table table-sm table-bordered">
              <thead><tr><th>Schedule Number</th><th>Part Number</th><th>Item No</th><th>Misconduct Date</th><th>From</th><th>To</th><th>Action</th></tr></thead>
              <tbody>
                {scheduleList.map((s, i) => (
                  <tr key={i}>
                    <td>{s.scheduleName}</td><td>{s.partLabel}</td><td>{s.itemLabel}</td>
                    <td>{s.misconductDate}</td><td>{s.misconductDateFrom || '-'}</td><td>{s.misconductDateTo || '-'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => setScheduleList(scheduleList.filter((_, j) => j !== i))} type="button">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== PAYMENT DETAILS ===== */}
      <div className="card mb-3">
        <div className="card-header bg-success text-white fw-semibold"><i className="bi bi-credit-card me-2"></i>Payment Details</div>
        <div className="card-body">
          {isGovType ? (
            <p className="text-muted mb-0">Payment is exempted for Government/Regulatory Agency complaints.</p>
          ) : (
            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label">Mode of Payment *</label>
                <select className="form-select" value={form.paymentMode} onChange={set('paymentMode')}>
                  <option value="">--Select--</option>
                  {paymentModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Payment Date *</label>
                <input type="date" className="form-control" value={form.paymentDate} onChange={set('paymentDate')} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Transaction Reference No *</label>
                <input className="form-control" value={form.transRefNo} onChange={set('transRefNo')} />
              </div>
              <div className="col-md-3">
                <label className="form-label">GST Number</label>
                <input className="form-control" maxLength={15} value={form.gstinNo} onChange={set('gstinNo')} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Instrument Number *</label>
                <input className="form-control" value={form.instrumentNo} onChange={set('instrumentNo')} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Instrument Date *</label>
                <input type="date" className="form-control" value={form.instrumentDate} onChange={set('instrumentDate')} />
              </div>
              <div className="col-md-2">
                <label className="form-label">Taxable Amount *</label>
                <input type="number" className="form-control" value={form.taxableAmount} onChange={set('taxableAmount')} />
              </div>
              <div className="col-md-2">
                <label className="form-label">GST Type</label>
                <select className="form-select" value={form.gstType} onChange={set('gstType')}>
                  <option value="CGST&SGST">CGST & SGST</option>
                  <option value="IGST">IGST</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Tax Rate *</label>
                <input type="number" className="form-control" value={form.taxRate} onChange={set('taxRate')} readOnly />
              </div>
              <div className="col-md-6">
                <label className="form-label">Payment Details Like DD *</label>
                <input className="form-control" value={form.paymentDetails} onChange={set('paymentDetails')} />
              </div>
            </div>
          )}
          <div className="row g-3 mt-3">
            <div className="col-12">
              <label className="form-label fw-semibold">Entity in respect of which misconduct alleged*</label>
              <input className="form-control" value={form.entityMisconduct} onChange={set('entityMisconduct')} placeholder="Entity in respect of which misconduct alleged." />
            </div>
          </div>
        </div>
      </div>

      {/* ===== DOCUMENT / EVIDENCE ===== */}
      <div className="card mb-3">
        <div className="card-header bg-dark text-white fw-semibold"><i className="bi bi-paperclip me-2"></i>Document/Evidence</div>
        <div className="card-body">
          <div className="row g-3 mb-2">
            <div className="col-md-4">
              <label className="form-label">Document/Evidence Name</label>
              <input className="form-control" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="e.g. Signed complaint, Email evidence..." />
            </div>
            <div className="col-md-5">
              <FileUploadInput label="Attach Document" hint={DOC_HINT} accept=".pdf" sizeMB={15} onUpload={onDocAdd} />
            </div>
          </div>
          <div className="row g-3 mt-2">
            <div className="col-md-6">
              <label className="form-label">Do you have Audio/Video Evidence?</label>
              <select className="form-select" value={form.isAudioVideo} onChange={set('isAudioVideo')}>
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>
            {form.isAudioVideo === '1' && (
              <>
                <div className="col-md-3">
                  <label className="form-label">Upload Audio/Video *</label>
                  <input type="file" className="form-control form-control-sm" accept=".mp3,.wav,.mp4,.wmv,.avi" onChange={onAudioUpload} />
                </div>
                <div className="col-md-3">
                  <FileUploadInput label="Upload Digital Evidence Certificate" required
                    hint="(File Size should be less than 10 MB ) (.pdf file format supported)"
                    accept=".pdf" sizeMB={10} type="digicert" current={form.digitalEvidenceCert}
                    onUpload={(path) => setForm({ ...form, digitalEvidenceCert: path })} />
                </div>
              </>
            )}
          </div>
          {docs.length > 0 && (
            <table className="table table-sm table-bordered mt-3">
              <thead><tr><th>Document/Evidence Name</th><th>File</th><th>Action</th></tr></thead>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={i}>
                    <td>{d.documentId}</td><td>{d.fileName}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => setDocs(docs.filter((_, j) => j !== i))} type="button">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {audioFiles.length > 0 && (
            <table className="table table-sm table-bordered mt-2">
              <thead><tr><th>Audio/Video File</th><th>Action</th></tr></thead>
              <tbody>
                {audioFiles.map((a, i) => (
                  <tr key={i}>
                    <td>{a.fileName}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => setAudioFiles(audioFiles.filter((_, j) => j !== i))} type="button">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== DECLARATION ===== */}
      <div className="card mb-3">
        <div className="card-header bg-primary text-white fw-semibold"><i className="bi bi-shield-check me-2"></i>Declaration</div>
        <div className="card-body">
          <div className="form-check mb-2">
            <input className="form-check-input" type="checkbox" id="declaration" checked={form.declaration}
              onChange={(e) => setForm({ ...form, declaration: e.target.checked })} />
            <label className="form-check-label fw-bold" htmlFor="declaration">I hereby declare the following : *</label>
          </div>
          <ol className="small text-muted mt-2 mb-0" style={{ fontSize: 12 }}>
            <li>I, authorized signatory on behalf of the Complainant do hereby declare that what is stated above is true to the best of my information and belief.</li>
            <li>I further declare that I have been duly authorized to file the complaint and the authorization/resolution in this regard has been enclosed along with this form.</li>
            <li>I understand that in case of any misstatement of facts or any misrepresentation/suppression of facts/false statements/furnishing of fabricated documents, I am liable to be proceeded with in accordance with the law.</li>
            <li className="mb-0">I further understand that in case the complaint is found to be frivolous or to bring disrepute to the Respondent or the organization thereof, I am liable to be proceeded with in accordance with the law.</li>
          </ol>
        </div>
      </div>

      {/* ===== SUBMIT ===== */}
      <div className="d-flex gap-3 mb-5">
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => handleSubmit(false)} type="button">
          {busy ? <><span className="spinner-border spinner-border-sm me-2"></span>Submitting...</> : <><i className="bi bi-send me-2"></i>{isEdit ? 'Submit Edited Complaint' : 'Submit Complaint'}</>}
        </button>
        {!isEdit && (
          <button className="btn btn-outline-secondary btn-lg" disabled={busy} onClick={() => handleSubmit(true)} type="button">
            <i className="bi bi-eye me-2"></i>Preview Complaint
          </button>
        )}
      </div>
    </div>
  );
}