import { RATE_LIMITERS } from './config';
import { createRateLimiter } from './rate-limiter';

/**
 * Handle availability checks: 30/minute per IP. Fail-closed without Redis so
 * cold starts cannot reset the enumeration budget.
 */
export const handleCheckLimiter = createRateLimiter(RATE_LIMITERS.handleCheck, {
  requireRedis: true,
});

/**
 * Public profile capture dismissal. Fail-closed without Redis (no per-instance
 * memory fallback).
 */
export const publicProfileCaptureDismissalLimiter = createRateLimiter(
  RATE_LIMITERS.publicProfileCaptureDismissal,
  { requireRedis: true }
);

/**
 * Public profile PAC telemetry. Fail-closed without Redis (no per-instance
 * memory fallback).
 */
export const publicProfilePacEventLimiter = createRateLimiter(
  RATE_LIMITERS.publicProfilePacEvent,
  { requireRedis: true }
);
