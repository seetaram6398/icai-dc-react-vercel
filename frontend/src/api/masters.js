import api from './client';

export const fetchMasters = (type, option1 = '') =>
  api.get(`/masters/${type}${option1 ? `?option1=${option1}` : ''}`).then((r) => r.data);