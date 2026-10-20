import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('icai_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('icai_token');
      localStorage.removeItem('icai_user');
      // Stash where the user was so Login can send them back after re-auth.
      if (!window.location.pathname.startsWith('/login')) {
        sessionStorage.setItem('icai_return_to', window.location.pathname + window.location.search);
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;