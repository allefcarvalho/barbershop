import { api, pub } from '../config/api';

export interface CreateBookingPayload {
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  barberId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD no fuso da barbearia
  time: string; // HH:mm
  notes?: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

export const bookingService = {
  async create(data: CreateBookingPayload) {
    const res = await api.post(pub('/bookings'), data);
    return res.data.data;
  },

  async getAvailableSlots(barberId: string, date: string, serviceId: string): Promise<TimeSlot[]> {
    const res = await api.get(pub(`/barbers/${barberId}/slots`), { params: { date, serviceId } });
    return res.data.data;
  },
};
