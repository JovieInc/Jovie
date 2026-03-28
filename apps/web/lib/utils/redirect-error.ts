import { isRedirectError as nextIsRedirectError } from 'next/dist/client/components/redirect-error';

/**
 * Checks if an error is a Next.js redirect error.
 * Uses Next.js's internal utility which correctly checks the digest format.
 */
export function isRedirectError(error: unknown): boolean {
  return nextIsRedirectError(error);
}

/**
 * Re-throws redirect errors, returns false for other errors.
 * Use in catch blocks to handle Next.js redirects properly.
 *
 * @example
 * try {
 *   // code that might redirect
 * } catch (error) {
 *   if (throwIfRedirect(error)) return; // never reached
 *   // handle actual error
 * }
 */
export function throwIfRedirect(error: unknown): false {
  if (isRedirectError(error)) {
    throw error;
  }
  return false;
}
