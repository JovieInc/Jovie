/**
 * Circuit breaker for Musicfetch API.
 *
 * Conservative configuration due to lower rate limits (6-40 req/min
 * depending on plan tier).
 */

import 'server-only';

import { CircuitBreaker } from '@/lib/spotify/circuit-breaker';

export const musicfetchCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3, // Open after 3 failures (conservative)
  resetTimeout: 60_000, // Try again after 60 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 120_000, // Count failures within 2 minutes
});
