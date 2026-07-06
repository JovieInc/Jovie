import { emailOTPClient, oneTapClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth browser client.
 *
 * INERT until the client-flip commit of the Better Auth migration
 * (docs/auth/better-auth-migration-plan.md, build-order commit ⑦):
 * nothing outside `hooks/useJovieAuth.tsx` may import this module while
 * Clerk is still the live auth provider.
 *
 * Client-safe by construction: no server-only imports, no secrets. The
 * only configuration input is the public Google client id used by the
 * One Tap plugin.
 *
 * No `baseURL` on purpose — the Better Auth handler lives at
 * `/api/auth/[...all]` on the current origin, so the client derives its
 * base URL from `window.location` (same-origin cookies, no CORS).
 */

// Read `process.env.NEXT_PUBLIC_*` textually so Next.js can statically
// inline the value into the client bundle. The centralized getter in
// `lib/env-public.ts` does not expose this key yet; the env fan-out is
// owned by the migration's env commit (plan §Env) and this read moves to
// `publicEnv` when that lands.
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * Plugins:
 * - `emailOTPClient` — email one-time-code sign-in (replaces the Clerk
 *   email-code strategy used by EmailCodeAuthForm).
 * - `oneTapClient` — Google One Tap; only mounted when the public Google
 *   client id is configured so mock/DB-less and test environments never
 *   load the Google Identity Services script path.
 */
export const authClient = createAuthClient({
  plugins: [
    emailOTPClient(),
    ...(googleClientId ? [oneTapClient({ clientId: googleClientId })] : []),
  ],
});

export type AuthClient = typeof authClient;
