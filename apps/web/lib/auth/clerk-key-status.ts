/**
 * Why Clerk publishable key resolution succeeded or failed for a request.
 *
 * Threaded through the `x-clerk-key-status` middleware header so downstream
 * SSR code and client providers can surface a specific error UI instead of
 * silently falling back to the mock provider.
 */
export type ClerkKeyStatus =
  | 'ok'
  | 'no_publishable_key'
  | 'staging_missing'
  | 'staging_inherits_prod';

export const CLERK_KEY_STATUS_HEADER = 'x-clerk-key-status';

export function isClerkKeyStatus(value: string): value is ClerkKeyStatus {
  return (
    value === 'ok' ||
    value === 'no_publishable_key' ||
    value === 'staging_missing' ||
    value === 'staging_inherits_prod'
  );
}
