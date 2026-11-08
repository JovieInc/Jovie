import { queryOptions } from '@tanstack/react-query';
import { SHIPPING_STATE_FRESHNESS_MS } from '@/lib/ovie/shipping-state/contract';
import { REALTIME_CACHE } from './cache-strategies';

export const SHIPPING_STATE_REFETCH_MS = SHIPPING_STATE_FRESHNESS_MS / 2;

/** Shared by navigation prefetch and both Shipping observers. Receipt deadlines
 * still govern whether a cached measurement may be displayed as current. */
export const shippingStateQueryOptions = queryOptions({
  ...REALTIME_CACHE,
  queryKey: ['ovie', 'shipping-state'],
  queryFn: async ({ signal }) => {
    // The validator (zod schemas) loads with the first read, in parallel with
    // the request. The signed-in sidebar imports these options for hover
    // prefetch, so a static import put zod in every app page's first chunk.
    const parser = import('@/lib/ovie/shipping-state/client');
    // A failed request throws before awaiting the parser; keep that path free
    // of an unhandled rejection if the chunk also failed to load.
    parser.catch(() => {});
    const response = await fetch('/api/hud/shipping-state', {
      signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Shipping observation unavailable (${response.status})`);
    }
    const [{ parseShippingCockpitProjection }, body] = await Promise.all([
      parser,
      response.json(),
    ]);
    const data = parseShippingCockpitProjection(body);
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
