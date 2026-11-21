// JOV-7973: closed public signup (canon/PRODUCT.md, 2026-11-02) hands the
// anonymous /start entry to the waitlist role form, and the public-screens
// producer (apps/web/tests/product-screenshots/public-screens-proof.spec.ts)
// already follows that handoff. Without a declared landing here, every main
// Product Screenshots run fails web.start and the screen-audit receipt
// producer never gets an exact-build run, so merged UI issues never leave
// Validating.
//
// Keys are a screen's exact proof route; values are the only bare pathnames
// that route may additionally land on. An alternate carries no query, and
// every route without an entry keeps the exact-route rule.
export const SCREEN_PROOF_FINAL_PATHS = Object.freeze({
  '/start': Object.freeze(['/waitlist']),
  // One front door (Tim, 2026-11-09): with public signup open, the anonymous
  // /waitlist proof follows the /start handoff — the other flag state of the
  // same seam as the closed-signup entry above.
  '/waitlist': Object.freeze(['/start']),
});

/**
 * True when a rendered final URL matches the requested proof route exactly,
 * or lands on one of that route's declared alternate pathnames.
 * @param {URL} url the rendered final URL
 * @param {URL} expected the requested proof route, resolved
 * @param {Record<string, readonly string[]>} [declared]
 */
export const finalPathMatches = (
  url,
  expected,
  declared = SCREEN_PROOF_FINAL_PATHS
) => {
  if (url.pathname === expected.pathname && url.search === expected.search)
    return true;
  const route = `${expected.pathname}${expected.search}`;
  const alternates = Object.hasOwn(declared, route) ? declared[route] : [];
  return url.search === '' && alternates.includes(url.pathname);
};
