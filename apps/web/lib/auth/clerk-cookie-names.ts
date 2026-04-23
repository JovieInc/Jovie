/**
 * Clerk cookie name prefixes. Catches suffixed variants like `__session_<suffix>`
 * that Clerk emits per-instance. Shared between the dev `/api/dev/clear-session`
 * route and the public `/api/auth/reset` route so both stay in sync.
 */
export const CLERK_COOKIE_PREFIXES = [
  '__clerk',
  '__session',
  '__client',
  '__refresh',
] as const;

export function isClerkCookieName(name: string): boolean {
  return CLERK_COOKIE_PREFIXES.some(prefix => name.startsWith(prefix));
}
