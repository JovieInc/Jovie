/**
 * Shared auth types used across sign-in and sign-up flows.
 */

/**
 * Available authentication methods
 */
export type AuthMethod = 'email' | 'google' | 'spotify';

/**
 * Loading state for auth flows
 */
export type LoadingState =
  | { type: 'idle' }
  | { type: 'submitting' }
  | { type: 'verifying' }
  | { type: 'completing' } // Session propagation after OTP verification
  | { type: 'resending' }
  | { type: 'oauth'; provider: 'google' | 'spotify' };
