import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePopups } from '../components/Popup';
import './Login.css';

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function genCaptchaString() {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  return s;
}

function defaultLanding(u) {
  if (u?.UserType === 6) return '/bod-dashboard';
  if (Number(u?.UserType) === 13) return '/complaints?statusIds=124';
  if ([1, 4, 5, 7, 10, 11].includes(Number(u?.UserType))) return '/complaints';
  return '/dashboard';
}

function isAuthPath(p) {
  return !p || p === '/login' || p.startsWith('/register');
}

export default function Login() {
  const { token, user, requestOTP, loginWithOTP } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canvasRef = useRef(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const popup = usePopups();

  // captcha (matches the ASPX session captcha: it persists across steps and is
  // re-validated on both Send OTP and Login clicks)
  const [captchaText, setCaptchaText] = useState('');
  const [captcha, setCaptcha] = useState('');

  const refreshCaptcha = () => {
    setCaptchaText(genCaptchaString());
    setCaptcha('');
  };

  useEffect(() => {
    refreshCaptcha();
  }, []);

  // Already signed in? Login/Register are for logged-out users only.
  // Guard on pathname so this never overrides handleVerify's own navigation
  // (with its return-to target) after a successful login.
  useEffect(() => {
    if (token && user && location.pathname === '/login') {
      navigate(defaultLanding(user), { replace: true });
    }
  }, [token, user, location.pathname]);

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
    if (!ok) {
      popup.warning('Invalid Captcha...');
      refreshCaptcha();
    }
    return ok;
  };

  const CaptchaField = (
    <div className="login-field">
      <label>Verification</label>
      <div className="login-captcha-row">
        <span className="login-captcha-box">
          <canvas ref={canvasRef} width="140" height="48" />
        </span>
        <button type="button" className="login-captcha-refresh" onClick={refreshCaptcha}>
          <i className="bi bi-arrow-clockwise" /> Refresh
        </button>
      </div>
      <input
        className="login-input"
        placeholder="Enter CAPTCHA"
        value={captcha}
        onChange={(e) => setCaptcha(e.target.value)}
        maxLength={6}
        autoComplete="off"
        required
      />
    </div>
  );

  const handleSend = async (e) => {
    e.preventDefault();
    if (!checkCaptcha()) return;
    setBusy(true);
    try {
      const res = await requestOTP(email);
      if (res.emailSent === false && res.otp) {
        popup.info(`Email delivery failed. Development OTP: ${res.otp}`);
      } else if (res.emailSent === false) {
        popup.warning('Email Sending failed...');
      } else {
        popup.success(res.message || 'OTP has been sent to your email id');
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
      const user = await loginWithOTP(email, otp);
      // Send the user back to the page they originally requested, then to the
      // 401-interceptor stash, and only then fall back to the role default.
      const from = location.state?.from;
      const stored = sessionStorage.getItem('icai_return_to');
      sessionStorage.removeItem('icai_return_to');
      if (from?.pathname && !isAuthPath(from.pathname)) {
        navigate(from.pathname + (from.search || ''), { replace: true });
      } else if (!isAuthPath(stored)) {
        navigate(stored, { replace: true });
      } else {
        navigate(defaultLanding(user), { replace: true });
      }
    } catch (ex) {
      popup.error(ex.response?.data?.error || 'Login Failed...');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left branding panel */}
      <div className="login-brand">
        <div className="login-brand-content">
          <div className="login-brand-icon">
            <i className="bi bi-bank" />
          </div>
          <h1>ICAI Disciplinary Directorate</h1>
          <p>
            A secure platform for members, committees, and administrators to
            manage disciplinary proceedings with transparency.
          </p>
          <div className="login-brand-features">
            <div className="feature-item">
              <i className="bi bi-shield-check" />
              <span>Secure OTP-based authentication</span>
            </div>
            <div className="feature-item">
              <i className="bi bi-file-earmark-text" />
              <span>File & track complaints online</span>
            </div>
            <div className="feature-item">
              <i className="bi bi-graph-up-arrow" />
              <span>Real-time status dashboards</span>
            </div>
            <div className="feature-item">
              <i className="bi bi-bell" />
              <span>Automated notifications & alerts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        <div className="login-form-wrapper">
          {/* Mobile-only brand */}
          <div className="login-mobile-brand">
            <div className="mobile-icon">
              <i className="bi bi-bank" />
            </div>
            <h4>ICAI Disciplinary Directorate</h4>
          </div>

          {/* Step indicator */}
          <div className="login-steps">
            <div className={`login-step-dot ${step === 1 ? 'active' : step === 2 ? 'done' : ''}`} />
            <div className={`login-step-dot ${step === 2 ? 'active' : ''}`} />
            <span className="login-steps-label">
              Step {step} of 2
            </span>
          </div>

          {/* Form header */}
          <div className="login-form-header">
            <h2>{step === 1 ? 'Sign In' : 'Verify OTP'}</h2>
            <p>
              {step === 1
                ? 'Enter your registered email to receive a one-time password.'
                : `Enter the 8-character code sent to ${email}`}
            </p>
          </div>

          {/* Step 1: Email */}
          {step === 1 && (
            <form onSubmit={handleSend}>
              <div className="login-field">
                <label>Email Address</label>
                <div className="login-input-wrapper">
                  <input
                    type="email"
                    className="login-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  <i className="bi bi-envelope" />
                </div>
                <p className="login-hint">(OTP will be sent to registered email id for verification.)</p>
              </div>

              {CaptchaField}

              <button type="submit" className="login-btn login-btn-primary" disabled={busy}>
                {busy ? (
                  <>
                    <span className="login-spinner" /> Sending OTP...
                  </>
                ) : (
                  <>
                    Send OTP <i className="bi bi-arrow-right" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <form onSubmit={handleVerify}>
              <div className="login-field">
                <label>One-Time Password</label>
                <div className="login-input-wrapper">
                  <input
                    type="text"
                    className="login-input login-otp-input"
                    placeholder="8-character code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                    maxLength={8}
                    autoFocus
                  />
                  <i className="bi bi-key" />
                </div>
              </div>

              <button type="submit" className="login-btn login-btn-primary" disabled={busy}>
                {busy ? (
                  <>
                    <span className="login-spinner" /> Verifying...
                  </>
                ) : (
                  <>
                    Verify & Sign In <i className="bi bi-box-arrow-in-right" />
                  </>
                )}
              </button>

              <button
                type="button"
                className="login-btn-link"
                onClick={() => { setStep(1); setOtp(''); refreshCaptcha(); }}
              >
                <i className="bi bi-arrow-left" /> Change email
              </button>
            </form>
          )}

          <div className="login-divider">or</div>

          {/* Footer */}
          <div className="login-footer">
            New here? <Link to="/register">Register to file a complaint</Link>
          </div>
        </div>
      </div>
    </div>
  );
}