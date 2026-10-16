import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('icai_user'));
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('icai_token'));
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!token) {
      setInitialized(true);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('icai_user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('icai_token');
        localStorage.removeItem('icai_user');
        setToken(null);
        setUser(null);
      })
      .finally(() => setInitialized(true));
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