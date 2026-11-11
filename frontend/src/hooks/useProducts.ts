import { useQuery } from '@tanstack/react-query';
import { api, pub } from '../config/api';

export interface ProductData {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
}

export function useProducts() {
  return useQuery<ProductData[]>({
    queryKey: ['products-public'],
    queryFn: async () => (await api.get(pub('/products'))).data.data,
    staleTime: 5 * 60 * 1000,
  });
}
