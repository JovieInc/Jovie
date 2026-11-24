/**
 * Whether a post-auth hard navigation would reload the document the visitor
 * is already on (same origin + pathname). Used to skip redundant
 * `location.assign` after Email OTP on `/start` so OnboardingSessionBoundary
 * can keep the anonymous→account freeze shell long enough for idle preparing
 * copy to paint (ONB-48 / JOV-14952).
 */
export function isSameDocumentRedirect(
  redirectUrl: string,
  currentHref: string | undefined = globalThis.location?.href
): boolean {
  if (!currentHref) return false;
  try {
    const current = new URL(currentHref);
    const target = new URL(redirectUrl, current.origin);
    if (target.origin !== current.origin) return false;
    const normalize = (pathname: string) =>
      pathname.length > 1 && pathname.endsWith('/')
        ? pathname.slice(0, -1)
        : pathname;
    return normalize(current.pathname) === normalize(target.pathname);
  } catch {
    return false;
  }
}
