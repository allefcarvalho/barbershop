import { api, pub } from '../config/api';

export const barberService = {
  async getAll(serviceId?: string) {
    const res = await api.get(pub('/barbers'), { params: serviceId ? { serviceId } : {} });
    return res.data.data;
  },
};
