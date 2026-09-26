import { describe, expect, it } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  isReservedUsername,
  validateUsernameCore,
} from '@/lib/validation/username-core';

/**
 * /product is deliberately excluded — see the exemption comment next to
 * RESERVED_USERNAMES in username-core.ts (DESIGN_READY shipping route,
 * reservation intentionally deferred).
 */
const DOCUMENTED_EXEMPTIONS = new Set(['/product']);

function singleSegmentActiveMarketingUrls(): string[] {
  return MARKETING_ROUTE_MANIFEST.filter(
    entry =>
      entry.status === 'active' &&
      /^\/[a-z0-9-]+$/.test(entry.url) &&
      !DOCUMENTED_EXEMPTIONS.has(entry.url)
  ).map(entry => entry.url);
}

describe('marketing route manifest ⇔ reserved usernames', () => {
  it('reserves every active single-segment marketing route as a username', () => {
    // A creator who claims a handle matching a live marketing root (e.g.
    // "launch", "new") gets a permanently unreachable profile: the routing
    // layer always resolves that segment to the marketing page first. That
    // must be blocked at signup, not discovered after the fact.
    const urls = singleSegmentActiveMarketingUrls();
    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      const handle = url.slice(1);
      expect(isReservedUsername(handle), `missing reservation: ${handle}`).toBe(
        true
      );
      expect(
        validateUsernameCore(handle).isValid,
        `should reject "${handle}"`
      ).toBe(false);
    }
  });
});
