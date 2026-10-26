/**
 * Local and CI runs have no edge geo header, and the consent gate fails closed
 * without one (banner shown, tracking blocked). Default every e2e request to a
 * known non-consent geography (US/TX) so unrelated specs are not covered by the
 * banner. Specs that exercise consent override this per page/context.
 */
export const E2E_DEFAULT_GEO_HEADERS: Record<string, string> = {
  'x-vercel-ip-country': 'US',
  'x-vercel-ip-country-region': 'TX',
};

export function vercelAutomationHeaders(): {
  readonly active: boolean;
  readonly headers: Record<string, string>;
} {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (secret) {
    throw new Error(
      'Global Vercel bypass headers are forbidden; use the origin-bound cookie bootstrap.'
    );
  }
  return {
    active: false,
    headers: {},
  };
}
