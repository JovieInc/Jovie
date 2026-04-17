'use client';

import { useMutation } from '@tanstack/react-query';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';

/**
 * Input type for tracking mutations.
 * The payload is sent as JSON to the tracking endpoint.
 */
type TrackingMutationInput = Record<string, unknown>;

interface UseTrackingMutationOptions<TInput = TrackingMutationInput> {
  /** The API endpoint to send tracking data to */
  endpoint: string;
  /** HTTP method (defaults to POST) */
  method?: 'POST' | 'PUT' | 'PATCH';
  /** Optional transform function to modify the input before sending */
  transform?: (input: TInput) => unknown;
}

/**
 * Shared helper for fire-and-forget tracking mutations.
 *
 * - Silent failures: no error toasts, no console noise
 * - No cache invalidation on success
 * - Uses `keepalive: true` so requests survive page unload
 * - No retries (tracking is best-effort)
 *
 * @example
 * const trackClick = useTrackingMutation({
 *   endpoint: '/api/track',
 * });
 *
 * trackClick.mutate({ handle, linkType: 'social', target: 'twitter' });
 *
 * @example
 * const trackView = useTrackingMutation({
 *   endpoint: '/api/profile/view',
 *   transform: (input: { handle: string }) => ({ handle: input.handle }),
 * });
 */
export function useTrackingMutation<TInput = TrackingMutationInput>(
  options: UseTrackingMutationOptions<TInput>
) {
  const { endpoint, method = 'POST', transform } = options;

  return useMutation<void, Error, TInput>({
    mutationFn: async (input: TInput) => {
      const body = transform ? transform(input) : input;

      if (method === 'POST') {
        postJsonBeacon(endpoint, body);
        return;
      }

      await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      });
    },
    // Fire-and-forget: no error handling, no cache invalidation
    retry: false,
  });
}
