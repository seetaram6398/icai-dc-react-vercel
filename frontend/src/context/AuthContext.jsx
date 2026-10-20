import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

function jwtExpMs(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  const exp = jwtExpMs(token);
  return exp !== null && exp <= Date.now();
}

function clearStoredSession() {
  localStorage.removeItem('icai_token');
  localStorage.removeItem('icai_user');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('icai_user'));
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('icai_token');
    if (t && isTokenExpired(t)) {
      clearStoredSession();
      return null;
    }
    return t;
  });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!token) {
      setInitialized(true);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!data.user) throw new Error('Session response missing user');
        setUser(data.user);
        localStorage.setItem('icai_user', JSON.stringify(data.user));
      })
      .catch(() => {
        clearStoredSession();
        setToken(null);
        setUser(null);
      })
      .finally(() => setInitialized(true));
  }, []);

  // Expire the session the moment the JWT's `exp` passes, without waiting for
  // the next API call to bounce with a 401.
  useEffect(() => {
    if (!token) return;
    const exp = jwtExpMs(token);
    if (exp === null) return;
    const ms = exp - Date.now();
    const expire = () => {
      clearStoredSession();
      setToken(null);
      setUser(null);
    };
    if (ms <= 0) {
      expire();
      return;
    }
    const id = setTimeout(expire, ms);
    return () => clearTimeout(id);
  }, [token]);

  // Cross-tab logout: when another tab removes or changes the token, this tab
  // must drop its session state too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'icai_token') return;
      const t = e.newValue;
      if (!t || isTokenExpired(t)) {
        localStorage.removeItem('icai_user');
        setToken(null);
        setUser(null);
      } else {
        setToken(t);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Back/forward cache: a page restored from bfcache after logout must not
  // keep rendering the authenticated UI.
  useEffect(() => {
    const onPageShow = (e) => {
      if (!e.persisted) return;
      const t = localStorage.getItem('icai_token');
      if (!t || isTokenExpired(t)) {
        window.location.replace('/login');
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const loginWithOTP = async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    localStorage.setItem('icai_token', data.token);
    setToken(data.token);
    // verify-otp returns a slim user; reload the full profile (incl.
    // Mob, StateID, CityID, etc.) so forms can auto-fill from registration data.
    const { data: me } = await api.get('/auth/me');
    const fullUser = me.user || data.user;
    localStorage.setItem('icai_user', JSON.stringify(fullUser));
    setUser(fullUser);
    return fullUser;
  };

  const requestOTP = async (email) => {
    const { data } = await api.post('/auth/request-otp', { email });
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    return data;
  };

  const verifyRegistration = async (email, otp) => {
    // ASPX redirects to Login.aspx after verifying OTP; it does NOT auto-login.
    // This call still hits the endpoint, but we intentionally do not persist the token here.
    const { data } = await api.post('/auth/verify-registration', { email, otp });
    return data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    localStorage.removeItem('icai_token');
    localStorage.removeItem('icai_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, initialized, loginWithOTP, requestOTP, register, verifyRegistration, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}