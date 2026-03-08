/**
 * Circuit breaker for Musicfetch API.
 *
 * Conservative configuration due to lower rate limits (6-40 req/min
 * depending on plan tier).
 */

import 'server-only';

import { CircuitBreaker } from '@/lib/spotify/circuit-breaker';

export const musicfetchCircuitBreaker = new CircuitBreaker({
  name: 'musicfetch',
  failureThreshold: 5, // Open after 5 failures (conservative for lower rate limits)
  resetTimeout: 90_000, // Try again after 90 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 120_000, // Count failures within 2 minutes
  minimumRequestCount: 10, // Need 10 requests before circuit can open
});
