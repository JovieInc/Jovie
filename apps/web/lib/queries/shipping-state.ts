import { queryOptions } from '@tanstack/react-query';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { SHIPPING_STATE_FRESHNESS_MS } from '@/lib/ovie/shipping-state/contract';
import { REALTIME_CACHE } from './cache-strategies';

export const SHIPPING_STATE_REFETCH_MS = SHIPPING_STATE_FRESHNESS_MS / 2;

/** Shared by navigation prefetch and both Shipping observers. Receipt deadlines
 * still govern whether a cached measurement may be displayed as current. */
export const shippingStateQueryOptions = queryOptions({
  ...REALTIME_CACHE,
  queryKey: ['ovie', 'shipping-state'],
  queryFn: async ({ signal }) => {
    const response = await fetch('/api/hud/shipping-state', {
      signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Shipping observation unavailable (${response.status})`);
    }
    const data = parseShippingCockpitProjection(await response.json());
    if (!data) throw new Error('Shipping receipt could not be validated');
    return data;
  },
  staleTime: SHIPPING_STATE_REFETCH_MS,
  retry: false,
  // Resize/focus and responsive remounts must not restart a slow observation.
  // The statistics observer owns timed refresh; explicit Refresh still works.
  refetchOnMount: false,
  refetchOnWindowFocus: false,
});
