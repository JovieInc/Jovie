/**
 * Optional JOV-6439 overlap: inspect a rendered proof profile for the
 * taste-safe claim CTA. Not wired into the production integrity snapshot —
 * that canary stays HTTP/identity-only until this lands.
 */

export function inspectProofClaimCta(document: Document): {
  readonly present: boolean;
  readonly label: string | null;
  readonly href: string | null;
} {
  const cta =
    document.querySelector('[data-testid="profile-aeo-claim-cta"]') ??
    document.querySelector('[data-testid="proof-claim-cta"]') ??
    document.querySelector('[data-testid="profile-claim-footer-cta"]');

  if (!(cta instanceof HTMLAnchorElement)) {
    return { present: false, label: null, href: null };
  }

  return {
    present: true,
    label: cta.textContent?.replace(/\s+/g, ' ').trim() || null,
    href: cta.getAttribute('href'),
  };
}
