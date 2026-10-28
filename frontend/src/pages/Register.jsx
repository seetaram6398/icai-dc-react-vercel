import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { usePopups } from '../components/Popup';
import './Register.css';

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const REGIONS = ['Eastern', 'Western', 'Northern', 'Southern', 'Central'];

function genCaptchaString() {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  return s;
}

function parseDDMMYYYY(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isValidEmail(v) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());
}

const CaptchaBlock = ({ canvasRef, captcha, setCaptcha, refreshCaptcha }) => (
  <div className="reg-field reg-span-2">
    <label>
      Verification <span className="reg-required">*</span>
    </label>
    <div className="reg-captcha-row">
      <span className="reg-captcha-box">
        <canvas ref={canvasRef} width="140" height="48" />
      </span>
      <button type="button" className="reg-captcha-refresh" onClick={refreshCaptcha}>
        <i className="bi bi-arrow-clockwise" /> Refresh
      </button>
    </div>
    <input
      className="reg-input"
      placeholder="Enter CAPTCHA"
      value={captcha}
      onChange={(e) => setCaptcha(e.target.value)}
      maxLength={6}
      autoComplete="off"
      required
    />
  </div>
);

export default function Register() {
  const { token, user, register, verifyRegistration } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  // Registration is for logged-out users only.
  useEffect(() => {
    if (token && user) navigate('/dashboard', { replace: true });
  }, [token, user]);

  useEffect(() => {
    const shown = sessionStorage.getItem('reg_info_shown');
    if (!shown) {
      setTimeout(() => {
        popup.info('Please fill all the details carefully before creating an account.');
      }, 300);
      sessionStorage.setItem('reg_info_shown', '1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTab] = useState('member');
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const popup = usePopups();

  // member tab
  const [mem, setMem] = useState({ membershipNo: '', dob: '' });
  const [memberDetails, setMemberDetails] = useState(null);

  // non-member tab
  const [non, setNon] = useState({
    govOff: '',
    name: '',
    dob: '',
    mobile: '',
    email: '',
    categoryId: '',
    regulatorId: '',
    regulatorName: '',
    nameOfOffice: '',
    govId: '',
    designation: '',
    countryCode: '91',
    stdCode: '',
    landlineNo: '',
    address: '',
    area: '',
    landmark: '',
    stateId: '',
    cityId: '',
    pincode: '',
    region: '',
  });

  // captcha
  const [captchaText, setCaptchaText] = useState('');
  const [captcha, setCaptcha] = useState('');

  const [categories, setCategories] = useState([]);
  const [regulators, setRegulators] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  const setMemF = (k) => (e) => setMem({ ...mem, [k]: e.target.value });
  const setNonF = (k) => (e) => setNon({ ...non, [k]: e.target.value });

  const refreshCaptcha = () => {
    setCaptchaText(genCaptchaString());
    setCaptcha('');
  };

  useEffect(() => {
    refreshCaptcha();
    api.get('/masters/3').then((r) => setStates(r.data || [])).catch(() => {});
    api.get('/masters/25').then((r) => setCategories(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !captchaText) return;
    const ctx = c.getContext('2d');
    const W = 140;
    const H = 48;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#eef3f8';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 150)},${Math.floor(Math.random() * 150)},${Math.floor(Math.random() * 150)},0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * W, Math.random() * H);
      ctx.lineTo(Math.random() * W, Math.random() * H);
      ctx.stroke();
    }

    captchaText.split('').forEach((ch, i) => {
      ctx.save();
      ctx.translate(16 + i * 19, 33);
      ctx.rotate((Math.random() - 0.5) * 0.55);
      ctx.font = `700 ${22 + Math.floor(Math.random() * 6)}px Verdana`;
      ctx.fillStyle = `rgb(${Math.floor(Math.random() * 100)},${Math.floor(Math.random() * 100)},${Math.floor(Math.random() * 160)})`;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });

    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 180)},${Math.floor(Math.random() * 180)},${Math.floor(Math.random() * 180)},0.6)`;
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [captchaText]);

  const checkCaptcha = () => {
    const ok = String(captcha).trim().toLowerCase() === captchaText.toLowerCase();
    refreshCaptcha();
    if (!ok) popup.warning('Invalid Captcha...');
    return ok;
  };

  const switchTab = (t) => {
    setTab(t);
    setMemberDetails(null);
    refreshCaptcha();
  };

  // ICAI Member : Send OTP
  const handleMemberOTP = async (e) => {
    e.preventDefault();
    if (!checkCaptcha()) return;
    if (mem.membershipNo.trim().length !== 6) {
      popup.warning('Please enter valid Membership no...');
      return;
    }
    const dobIso = parseDDMMYYYY(mem.dob);
    if (!dobIso) {
      popup.warning('Please enter valid Date of Birth...');
      return;
    }

    setBusy(true);
    try {
      const md = (await api.post('/auth/member-lookup', { membershipNo: mem.membershipNo.trim(), dob: dobIso })).data;
      setMemberDetails(md);

      const res = await register({
        name: md.name,
        email: md.email,
        mobile: md.mobile,
        membershipNo: mem.membershipNo.trim().toLowerCase(),
        dob: dobIso,
        memberCity: md.city,
        memberMembershipType: md.membershipType,
        // ASPX stores the CA registration date (yyyy-MM-dd) as RegisterDate for members
        memberRegistrationDate: md.registrationDate ? md.registrationDate.split(' ')[0] : null,
        isICAIMember: true,
        isGovEmp: false,
      });
      if (res.emailSent === false && res.otp) {
        popup.info(`Email delivery failed. Your development OTP is: ${res.otp}`);
      } else if (res.emailSent === false) {
        popup.warning('OTP stored, but email delivery failed. Contact the administrator.');
      } else {
        popup.success(res.message || 'OTP has been sent on given email...');
      }
      setStep(2);
    } catch (ex) {
      const apiErr = ex.response?.data?.error;
      popup.error(
        apiErr === 'Email already registered'
          ? 'Please check email id already exists...'
          : apiErr || 'Failed to send OTP'
      );
    } finally {
      setBusy(false);
    }
  };

  // Non-ICAI Member : Send OTP
  const handleNonOTP = async (e) => {
    e.preventDefault();
    if (!checkCaptcha()) return;
    if (non.govOff === '') {
      popup.warning('Please select are you a government officer?...');
      return;
    }
    if (!non.name.trim()) {
      popup.warning('Please enter name...');
      return;
    }
    if (non.govOff === '0' && !parseDDMMYYYY(non.dob)) {
      popup.warning('Please enter valid Date of Birth...');
      return;
    }
    if (non.mobile.length !== 10 || !/^\d+$/.test(non.mobile)) {
      popup.warning('Please enter mobile no...');
      return;
    }
    if (!isValidEmail(non.email)) {
      popup.warning('Please enter valid email id...');
      return;
    }
    if (non.govOff === '1') {
      if (!non.categoryId) return popup.warning('Please select Government Category...');
      if (!non.regulatorId) return popup.warning('Please select Regulator/Office...');
      if (!non.nameOfOffice.trim()) return popup.warning('Please enter Name of Officer...');
      if (!non.designation.trim()) return popup.warning('Please enter Designation...');
      if (!non.govId.trim()) return popup.warning('Please enter Government ID No. ...');
      if (!non.countryCode) return popup.warning('Please select country code...');
      if (!non.address.trim()) return popup.warning('Please enter Flat, House no., Building, Company, Apartment...');
      if (!non.area.trim()) return popup.warning('Please enter Area...');
      if (!non.stateId) return popup.warning('Please select state...');
      if (!non.cityId) return popup.warning('Please select city...');
      if (non.pincode.length !== 6 || !/^\d+$/.test(non.pincode)) return popup.warning('Please enter pincode...');
    }

    setBusy(true);
    try {
      const isGov = non.govOff === '1';
      const payload = {
        name: non.name.trim(),
        email: non.email.trim(),
        mobile: non.mobile,
        isICAIMember: false,
        isGovEmp: isGov,
        dob: non.govOff === '0' ? parseDDMMYYYY(non.dob) : undefined,
        governmentFields: isGov
          ? {
              office: non.nameOfOffice.trim(),
              designation: non.designation.trim(),
              govId: non.govId.trim(),
              address: non.address.trim(),
              area: non.area.trim(),
              landmark: non.landmark.trim(),
              stateId: non.stateId,
              cityId: non.cityId,
              pincode: non.pincode,
              countryCode: non.countryCode,
              stdCode: non.stdCode,
              landlineNo: non.landlineNo,
              region: non.region,
              compType: non.categoryId,
              regulatorId: non.regulatorId,
              regulatorName: non.regulatorName,
            }
          : undefined,
      };
      const res = await register(payload);
      if (res.emailSent === false && res.otp) {
        popup.info(`Email delivery failed. Your development OTP is: ${res.otp}`);
      } else if (res.emailSent === false) {
        popup.warning('OTP stored, but email delivery failed. Contact the administrator.');
      } else {
        popup.success(res.message || 'OTP has been sent on given email...');
      }
      setStep(2);
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const email = tab === 'member' ? memberDetails.email : non.email.trim();
      await verifyRegistration(email, otp);
      popup.success('Registered Successfully...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Please enter valid OTP...');
    } finally {
      setBusy(false);
    }
  };

  const loadGovCategory = async (e) => {
    const v = e.target.value;
    setNon({ ...non, categoryId: v, regulatorId: '', regulatorName: '' });
    if (v) {
      const r = await api.get(`/masters/33?option1=${v}`);
      setRegulators(r.data || []);
    } else setRegulators([]);
  };

  const setState = async (e) => {
    const v = e.target.value;
    const st = states.find((s) => String(s.value) === String(v));
    setNon({ ...non, stateId: v, cityId: '', region: st?.region || st?.Region || '' });
    if (v) {
      const r = await api.get(`/masters/7?option1=${v}`);
      setCities(r.data || []);
    } else setCities([]);
  };

  const activeEmail = tab === 'member' ? memberDetails?.email : non.email;

  return (
    <div className="reg-page">
      {/* Left branding panel */}
      <aside className="reg-brand">
        <div className="reg-brand-content">
          <span className="reg-brand-icon"><i className="bi bi-patch-check-fill" /></span>
          <h1>Join the Disciplinary Information System</h1>
          <p>One portal for lodging complaints against members of ICAI and officials of the Disciplinary Directorate.</p>
          <div className="reg-brand-features">
            <div className="feature-item"><i className="bi bi-shield-lock-fill" /> Secure, verified registration</div>
            <div className="feature-item"><i className="bi bi-person-badge-fill" /> ICAI member verification via e-Services</div>
            <div className="feature-item"><i className="bi bi-journal-text" /> Track your complaints in one place</div>
          </div>
        </div>
      </aside>

      {/* Right form panel */}
      <section className="reg-form-panel">
        <div className="reg-form-wrapper">
          <div className="reg-mobile-brand">
            <span className="mobile-icon"><i className="bi bi-patch-check-fill" /></span>
            <h4>ICAI Disciplinary Directorate</h4>
          </div>

          <div className="reg-form-header">
            <h2>Create your account</h2>
            <p>on ICAI Disciplinary Directorate Portal</p>
          </div>

          <div className="reg-card">
            {step === 1 && (
              <>
                <div className="reg-tabs" role="tablist" aria-label="Complainant type">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'member'}
                    className={`reg-tab ${tab === 'member' ? 'active' : ''}`}
                    onClick={() => switchTab('member')}
                  >
                    <i className="bi bi-person-check" /> Qualified CA / ICAI Member
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'non'}
                    className={`reg-tab ${tab === 'non' ? 'active' : ''}`}
                    onClick={() => switchTab('non')}
                  >
                    <i className="bi bi-person" /> Non ICAI Member
                  </button>
                </div>

                {/* ===== ICAI MEMBER ===== */}
                {tab === 'member' && (
                  <form onSubmit={handleMemberOTP}>
                    <div className="reg-grid">
                      <div className="reg-field reg-span-2">
                        <label>Membership No. <span className="reg-required">*</span></label>
                        <input
                          className="reg-input"
                          value={mem.membershipNo}
                          onChange={setMemF('membershipNo')}
                          maxLength={6}
                          placeholder="XXXXXX"
                          required
                        />
                        <div className="reg-hint">
                          (Please add prefix '0' (Zero) if membership no. is less than 6 digits.)
                        </div>
                      </div>

                      <div className="reg-field reg-span-2">
                        <label>Date of Birth <span className="reg-required">*</span></label>
                        <input
                          className="reg-input"
                          placeholder="DD/MM/YYYY"
                          value={mem.dob}
                          onChange={setMemF('dob')}
                          required
                        />
                      </div>

                      {memberDetails && (
                        <div className="reg-span-2">
                          <div className="reg-details-title">
                            <i className="bi bi-person-badge me-1" /> Your Details
                          </div>
                          <div className="reg-grid">
                            {[
                              ['Name', memberDetails.name],
                              ['Email ID', memberDetails.email],
                              ['Mobile No.', memberDetails.mobile],
                              ['Registration Date', memberDetails.registrationDate],
                              ['Registration Number', memberDetails.registrationNumber],
                              ['City', memberDetails.city],
                              ['Membership Type', memberDetails.membershipType],
                            ].map(([label, val]) => (
                              <div key={label} className="reg-detail">
                                <small>{label}</small>
                                <div>{val || '-'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <CaptchaBlock
                        canvasRef={canvasRef}
                        captcha={captcha}
                        setCaptcha={setCaptcha}
                        refreshCaptcha={refreshCaptcha}
                      />
                    </div>

                    <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>
                      {busy ? <><span className="reg-spinner" /> Sending...</> : <><i className="bi bi-envelope-paper" /> Send OTP</>}
                    </button>
                  </form>
                )}

                {/* ===== NON-ICAI MEMBER ===== */}
                {tab === 'non' && (
                  <form onSubmit={handleNonOTP}>
                    <div className="reg-grid">
                      <div className="reg-field reg-span-2">
                        <label>
                          Are you filing complaint on behalf of any Central government, State government,
                          Regulatory Authority or Statutory Authority? <span className="reg-required">*</span>
                        </label>
                        <select className="reg-input" value={non.govOff} onChange={setNonF('govOff')}>
                          <option value="">--Select--</option>
                          <option value="0">No</option>
                          <option value="1">Yes</option>
                        </select>
                      </div>

                      {non.govOff === '0' && (
                        <>
                          <div className="reg-field">
                            <label>Name <span className="reg-required">*</span></label>
                            <input className="reg-input" value={non.name} onChange={setNonF('name')} maxLength={100} required />
                          </div>
                          <div className="reg-field">
                            <label>Date of Birth <span className="reg-required">*</span></label>
                            <input
                              className="reg-input"
                              placeholder="DD/MM/YYYY"
                              value={non.dob}
                              onChange={setNonF('dob')}
                              required
                            />
                          </div>
                          <div className="reg-field">
                            <label>Mobile No. <span className="reg-required">*</span></label>
                            <input
                              className="reg-input"
                              value={non.mobile}
                              onChange={(e) => setNon({ ...non, mobile: e.target.value.replace(/\D/g, '') })}
                              maxLength={10}
                              placeholder="10 digit mobile"
                              required
                            />
                          </div>
                          <div className="reg-field">
                            <label>Email ID <span className="reg-required">*</span></label>
                            <input type="email" className="reg-input" value={non.email} onChange={setNonF('email')} maxLength={50} required />
                          </div>
                        </>
                      )}

                      {non.govOff === '1' && (
                        <>
                          <div className="reg-field">
                            <label>Name <span className="reg-required">*</span></label>
                            <input className="reg-input" value={non.name} onChange={setNonF('name')} maxLength={100} required />
                          </div>
                          <div className="reg-field">
                            <label>Department Mobile No. <span className="reg-required">*</span></label>
                            <input
                              className="reg-input"
                              value={non.mobile}
                              onChange={(e) => setNon({ ...non, mobile: e.target.value.replace(/\D/g, '') })}
                              maxLength={10}
                              placeholder="10 digit mobile"
                              required
                            />
                          </div>
                          <div className="reg-field">
                            <label>Department Email ID <span className="reg-required">*</span></label>
                            <input type="email" className="reg-input" value={non.email} onChange={setNonF('email')} maxLength={50} required />
                          </div>
                          <div className="reg-field reg-span-2">
                            <label>Type of Government Category <span className="reg-required">*</span></label>
                            <select className="reg-input" value={non.categoryId} onChange={loadGovCategory}>
                              <option value="">--Select--</option>
                              {categories.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="reg-field reg-span-2">
                            <label>Government Department/Regulatory Authority/Statutory Authority/Office <span className="reg-required">*</span></label>
                            <select
                              className="reg-input"
                              value={non.regulatorId}
                              onChange={(e) => {
                                const r = regulators.find((x) => String(x.value) === String(e.target.value));
                                setNon({ ...non, regulatorId: e.target.value, regulatorName: r ? r.label : '' });
                              }}
                              disabled={!non.categoryId}
                            >
                              <option value="">--Select--</option>
                              {regulators.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="reg-field reg-span-2">
                            <label>Name of Government Department/Regulatory Authority/Statutory Authority Officer <span className="reg-required">*</span></label>
                            <input className="reg-input" value={non.nameOfOffice} onChange={setNonF('nameOfOffice')} maxLength={450} required />
                          </div>
                          <div className="reg-field">
                            <label>Employee ID No. <span className="reg-required">*</span></label>
                            <input className="reg-input" value={non.govId} onChange={setNonF('govId')} maxLength={20} required />
                          </div>
                          <div className="reg-field">
                            <label>Designation <span className="reg-required">*</span></label>
                            <input className="reg-input" value={non.designation} onChange={setNonF('designation')} maxLength={50} required />
                            <small className="reg-hint">Not below the rank of under secretary or equivalent</small>
                          </div>
                          <div className="reg-field">
                            <label>Country Code <span className="reg-required">*</span></label>
                            <select className="reg-input" value={non.countryCode} onChange={setNonF('countryCode')}>
                              <option value="91">91</option>
                              <option value="">--Select--</option>
                            </select>
                          </div>
                          <div className="reg-field">
                            <label>STD Code</label>
                            <input className="reg-input" value={non.stdCode} onChange={(e) => setNon({ ...non, stdCode: e.target.value.replace(/\D/g, '') })} maxLength={4} />
                          </div>
                          <div className="reg-field">
                            <label>Landline No</label>
                            <input className="reg-input" value={non.landlineNo} onChange={(e) => setNon({ ...non, landlineNo: e.target.value.replace(/\D/g, '') })} maxLength={10} />
                          </div>
                          <div className="reg-field reg-span-2">
                            <label>Flat, House no., Building, Company, Apartment <span className="reg-required">*</span></label>
                            <input className="reg-input" value={non.address} onChange={setNonF('address')} maxLength={200} required />
                          </div>
                          <div className="reg-field reg-span-2">
                            <label>Area, Street, Sector, Village <span className="reg-required">*</span></label>
                            <input className="reg-input" value={non.area} onChange={setNonF('area')} maxLength={500} required />
                          </div>
                          <div className="reg-field reg-span-2">
                            <label>Landmark</label>
                            <input className="reg-input" value={non.landmark} onChange={setNonF('landmark')} maxLength={90} />
                          </div>
                          <div className="reg-field">
                            <label>State <span className="reg-required">*</span></label>
                            <select className="reg-input" value={non.stateId} onChange={setState}>
                              <option value="">--Select--</option>
                              {states.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="reg-field">
                            <label>City <span className="reg-required">*</span></label>
                            <select className="reg-input" value={non.cityId} onChange={(e) => {
                              const cityId = e.target.value;
                              setNon((prev) => ({ ...prev, cityId }));
                            }} disabled={!non.stateId}>
                              <option value="">--Select--</option>
                              {cities.map((ct) => (
                                <option key={ct.value} value={ct.value}>{ct.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="reg-field">
                            <label>Pincode <span className="reg-required">*</span></label>
                            <input
                              className="reg-input"
                              value={non.pincode}
                              onChange={(e) => setNon({ ...non, pincode: e.target.value.replace(/\D/g, '') })}
                              maxLength={6}
                              required
                            />
                          </div>
                          <div className="reg-field">
                            <label>Region <span className="reg-required">*</span></label>
                            <select className="reg-input" value={non.region} disabled>
                              <option value="">--</option>
                              {REGIONS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      <CaptchaBlock
                        canvasRef={canvasRef}
                        captcha={captcha}
                        setCaptcha={setCaptcha}
                        refreshCaptcha={refreshCaptcha}
                      />
                    </div>

                    <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>
                      {busy ? <><span className="reg-spinner" /> Sending...</> : <><i className="bi bi-envelope-paper" /> Send OTP</>}
                    </button>
                  </form>
                )}
              </>
            )}

            {step === 2 && (
              <form onSubmit={handleVerify}>
                <div className="reg-field">
                  <label>Enter OTP</label>
                  <input
                    className="reg-input"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={8}
                    required
                    autoFocus
                    style={{ letterSpacing: '0.25em', fontWeight: 600, textAlign: 'center' }}
                  />
                  <div className="reg-hint">OTP has been sent to {activeEmail}</div>
                </div>
                <button type="submit" className="reg-btn reg-btn-success" disabled={busy}>
                  {busy ? <><span className="reg-spinner" /> Verifying...</> : <><i className="bi bi-check2-circle" /> Verify &amp; Register</>}
                </button>
              </form>
            )}
          </div>

          <div className="reg-footer">
            Already have an account? <Link to="/login">Log In</Link>
          </div>
        </div>
      </section>
    </div>
  );
}