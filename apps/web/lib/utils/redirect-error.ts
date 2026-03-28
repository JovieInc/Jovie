/**
 * Next.js redirect errors use a semicolon-delimited digest string
 * starting with this prefix. This avoids importing internal Next.js
 * modules that break across versions.
 */
const NEXT_REDIRECT_DIGEST_PREFIX = 'NEXT_REDIRECT;';

/**
 * Checks if an error is a Next.js redirect error.
 * Detects via the digest prefix format used by Next.js redirect().
 */
export function isRedirectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === 'string' && digest.startsWith(NEXT_REDIRECT_DIGEST_PREFIX)
  );
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
