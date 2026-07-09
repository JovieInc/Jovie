import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth/better-auth';

/**
 * Better Auth catch-all handler (sign-in/social, OAuth callbacks, email OTP,
 * one-time-token verify, session endpoints).
 *
 * Static sibling routes (e.g. /api/auth/reset) take precedence over this
 * catch-all per Next.js route resolution.
 */
export const { GET, POST } = toNextJsHandler(auth);
