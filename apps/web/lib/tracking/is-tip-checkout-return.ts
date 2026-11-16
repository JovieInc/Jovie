/** Checkout return URLs carry a bearer session ID and must not enter analytics. */
export function isTipCheckoutReturn(pathname: string | null): boolean {
  return /^\/[^/]+\/tip\/thank-you\/?$/.test(pathname ?? '');
}
