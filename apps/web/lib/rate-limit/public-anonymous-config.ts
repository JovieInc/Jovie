import type { RateLimitConfig } from './types';

/**
 * Public anonymous abuse budgets that must stay durable (SEC-04).
 * Callers may still soft-drop on outage; the limiter itself must not
 * fall back to per-instance memory.
 */
export const PUBLIC_ANONYMOUS_RATE_LIMITERS = {
  /** Handle check: 30 checks per minute per IP — fail-closed (enumeration). */
  handleCheck: {
    name: 'Handle Check',
    limit: 30,
    window: '1 m',
    prefix: 'handle_check',
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'anonymous',
    requireRedis: true,
  } satisfies RateLimitConfig,

  /**
   * Public profile capture dismissal reads/writes: 20 requests per minute per
   * IP. Keep this isolated from the general API bucket so unrelated same-origin
   * traffic cannot suppress a conversion control on a healthy profile page.
   */
  publicProfileCaptureDismissal: {
    name: 'Public Profile Capture Dismissal',
    limit: 20,
    window: '1 m',
    prefix: 'public:profile:capture-dismissal',
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'anonymous',
    requireRedis: true,
  } satisfies RateLimitConfig,

  /**
   * Primary Action Card telemetry: 40 events per minute per IP. Together with
   * capture dismissal this preserves the former aggregate 60/minute public
   * profile budget while preventing unrelated general API calls from consuming
   * either endpoint's durable Redis bucket.
   */
  publicProfilePacEvent: {
    name: 'Public Profile PAC Event',
    limit: 40,
    window: '1 m',
    prefix: 'public:profile:pac-event',
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'anonymous',
    requireRedis: true,
  } satisfies RateLimitConfig,
};
