import { useQuery } from '@tanstack/react-query';
import { barberService } from '../services/barber.service';

/** Dados públicos do barbeiro (sem e-mail/telefone da equipe). */
export interface BarberData {
  id: string;
  name: string;
  avatarUrl: string | null;
  serviceIds: string[];
}

export function useBarbers(serviceId?: string) {
  return useQuery<BarberData[]>({
    queryKey: ['barbers', serviceId],
    queryFn: () => barberService.getAll(serviceId),
    staleTime: 5 * 60 * 1000,
  });
}
