import { RATE_LIMITERS } from './config';
import { createRateLimiter } from './rate-limiter';

/**
 * Changelog subscribe limiter
 * Limit: 1 request per 10 seconds per IP
 */
export const changelogSubscribeLimiter = createRateLimiter(
  RATE_LIMITERS.changelogSubscribe,
  {
    requireRedis: true,
  }
);

/**
 * Closed-signup waitlist join limiter
 * Limit: 1 request per 10 seconds per IP
 */
export const waitlistJoinLimiter = createRateLimiter(
  RATE_LIMITERS.waitlistJoin,
  {
    requireRedis: true,
  }
);
