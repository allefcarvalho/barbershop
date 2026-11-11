import { useQuery } from '@tanstack/react-query';
import { serviceService } from '../services/service.service';

export interface ServiceData {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
  imageUrl: string | null;
}

export function useServices() {
  return useQuery<ServiceData[]>({
    queryKey: ['services'],
    queryFn: () => serviceService.getAll(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTenant() {
  return useQuery({ queryKey: ['tenant'], queryFn: () => serviceService.getTenant(), staleTime: 10 * 60 * 1000 });
}
