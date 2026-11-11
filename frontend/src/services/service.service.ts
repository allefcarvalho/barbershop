import { api, pub } from '../config/api';

export const serviceService = {
  async getAll() {
    const res = await api.get(pub('/services'));
    return res.data.data;
  },

  /** Dados públicos da barbearia: fuso, janela de agendamento e dias de funcionamento. */
  async getTenant(): Promise<{ name: string; timezone: string; maxAdvanceDays: number; openDays: number[] }> {
    const res = await api.get(pub(''));
    return res.data.data;
  },
};
