/**
 * Checks if an error is a Next.js redirect error.
 * These are thrown when using redirect() in server components
 * and should be re-thrown to work properly.
 */
export function isRedirectError(error: unknown): boolean {
  return error instanceof Error && error.message === 'NEXT_REDIRECT';
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
export function throwIfRedirect(error: unknown): never | false {
  if (isRedirectError(error)) {
    throw error;
  }
  return false;
}
