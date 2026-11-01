import { createRateLimiter } from '@/lib/rate-limit';

/**
 * One set of email OTP limiters for every flow that mails or verifies a
 * six-digit code (fan subscribe, promo downloads). Keep new OTP routes on
 * these instead of declaring their own: a route without them lets a caller
 * request a fresh code, which resets the per-code attempt cap, and guess again
 * (tests/unit/security/email-otp-routes-limited.test.ts).
 */
export const emailOtpSendLimiter = createRateLimiter({
  name: 'Email OTP Send',
  limit: 5,
  window: '10 m',
  prefix: 'notifications:email-otp:send',
  analytics: false,
  algorithm: 'fixed-window',
  trafficClass: 'anonymous',
});

// Server-side resend cooldown: enforces a single OTP send per email per
// 30-second window so the UI cooldown ("Resend in Ns") cannot be bypassed
// by callers that bypass the React state. Falls back to memory if Redis
// is unavailable; in that case the limit is still enforced per-instance.
export const emailOtpResendCooldownLimiter = createRateLimiter({
  name: 'Email OTP Resend Cooldown',
  limit: 1,
  window: '30 s',
  prefix: 'notifications:email-otp:resend-cooldown',
  analytics: false,
  algorithm: 'fixed-window',
  trafficClass: 'anonymous',
});

export const emailOtpVerifyLimiter = createRateLimiter({
  name: 'Email OTP Verify',
  limit: 10,
  window: '10 m',
  prefix: 'notifications:email-otp:verify',
  analytics: false,
  algorithm: 'fixed-window',
  trafficClass: 'anonymous',
});
