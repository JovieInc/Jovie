/**
 * Canonical public origin for anything sent to a real person. Outbound copy is
 * read outside the app, so it never uses the request host or the deploy's
 * NEXT_PUBLIC_PROFILE_URL (staging.jov.ie, previews, localhost).
 */
export const PRODUCTION_PUBLIC_ORIGIN = 'https://jov.ie';

/**
 * The claim link in cold outreach. The public route is `/claim/[token]`; the
 * old `getAppUrl('/claim/…')` built `/app/claim/…`, which sends a signed-out
 * artist to sign-in instead of their claim.
 */
export function getOutboundClaimUrl(token: string): string {
  return `${PRODUCTION_PUBLIC_ORIGIN}/claim/${encodeURIComponent(token)}`;
}
