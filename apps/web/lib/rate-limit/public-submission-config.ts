import type { RateLimitConfig } from './types';

/** Anonymous email-capture forms share a durable, fail-closed public boundary. */
export const PUBLIC_SUBMISSION_RATE_LIMITERS = {
  /** Changelog subscribe: 1 request per 10 seconds per IP */
  changelogSubscribe: {
    name: 'Changelog Subscribe',
    limit: 1,
    window: '10 s',
    prefix: 'changelog:subscribe',
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'anonymous',
    requireRedis: true,
  } satisfies RateLimitConfig,

  /**
   * Closed-signup waitlist join (anonymous, Turnstile-gated): 1 request per
   * 10 seconds per IP. Over the limit returns 429; Redis outage denies.
   */
  waitlistJoin: {
    name: 'Waitlist Join',
    limit: 1,
    window: '10 s',
    prefix: 'waitlist:join',
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'anonymous',
    requireRedis: true,
  } satisfies RateLimitConfig,
};
