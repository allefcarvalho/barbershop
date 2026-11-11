import { useQuery } from '@tanstack/react-query';
import { bookingService } from '../services/booking.service';
import type { TimeSlot } from '../services/booking.service';

export function useAvailableSlots(barberId: string, date: string, serviceId: string) {
  return useQuery<TimeSlot[]>({
    queryKey: ['slots', barberId, date, serviceId],
    queryFn: () => bookingService.getAvailableSlots(barberId, date, serviceId),
    enabled: !!barberId && !!date && !!serviceId,
    staleTime: 30 * 1000, // horários mudam rápido
    refetchOnWindowFocus: true,
  });
}
