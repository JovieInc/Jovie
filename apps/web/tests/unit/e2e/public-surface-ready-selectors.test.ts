import { describe, expect, it } from 'vitest';
import {
  PROFILE_HOME_READY_SELECTORS,
  PROFILE_HOME_SETTLED_SURFACE_IDS,
  PROFILE_HOME_UNIVERSAL_READY_SELECTORS,
  readySelectorMatchesProfileHome,
  resolvePublicSurfaceManifestSync,
} from '../../e2e/utils/public-surface-manifest';

/**
 * Marketing, legal, and auth pages use `h1` / `main` as their own landmark.
 * They do not render profile Home. `profile-header` stays forbidden there.
 */
const PAGE_LANDMARK_FAMILIES = new Set(['marketing', 'legal', 'auth-entry']);

const SUBSCRIBE_FLOW_SELECTOR =
  '[data-testid="profile-mobile-notifications-flow"]';

function homeGenericSelectors(
  homeReadySelectors: readonly string[]
): Set<string> {
  return new Set([
    ...PROFILE_HOME_READY_SELECTORS,
    ...PROFILE_HOME_UNIVERSAL_READY_SELECTORS,
    ...homeReadySelectors,
  ]);
}

describe('public surface ready selectors', () => {
  it('treats a comma group that includes a Home selector as generic', () => {
    const generic = new Set(['h1', 'body', '[data-testid="profile-header"]']);

    expect(readySelectorMatchesProfileHome('form, button, h1', generic)).toBe(
      true
    );
    expect(readySelectorMatchesProfileHome('h1', generic)).toBe(true);
    expect(
      readySelectorMatchesProfileHome('[data-testid="claim-banner"]', generic)
    ).toBe(false);
  });

  it('rejects Home-generic ready selectors outside profile Home', () => {
    const manifest = resolvePublicSurfaceManifestSync();
    const home = manifest.find(surface => surface.id === 'profile-main');
    expect(home?.readySelectors).toEqual([...PROFILE_HOME_READY_SELECTORS]);
    expect([...PROFILE_HOME_SETTLED_SURFACE_IDS]).toEqual([
      'profile-main',
      'profile-shop',
    ]);

    const generic = homeGenericSelectors(home?.readySelectors ?? []);
    const profileHeader = new Set(['[data-testid="profile-header"]']);
    const settled = new Set<string>(PROFILE_HOME_SETTLED_SURFACE_IDS);
    const offenders: string[] = [];

    for (const surface of manifest) {
      if (settled.has(surface.id)) continue;

      const headerHits = surface.readySelectors.filter(selector =>
        readySelectorMatchesProfileHome(selector, profileHeader)
      );
      if (headerHits.length > 0) {
        offenders.push(`${surface.id}: ${headerHits.join(', ')}`);
        continue;
      }

      const hits = surface.readySelectors.filter(selector =>
        readySelectorMatchesProfileHome(selector, generic)
      );
      if (hits.length === 0) {
        expect(surface.readySelectors.length, surface.id).toBeGreaterThan(0);
        continue;
      }

      if (!PAGE_LANDMARK_FAMILIES.has(surface.family)) {
        offenders.push(`${surface.id}: ${hits.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('requires the subscribe flow on subscribe surfaces', () => {
    const manifest = resolvePublicSurfaceManifestSync();

    for (const id of [
      'profile-mode-subscribe',
      'profile-subscribe',
      'profile-notifications',
    ]) {
      const surface = manifest.find(item => item.id === id);
      expect(surface?.readySelectors, id).toEqual([SUBSCRIBE_FLOW_SELECTOR]);
    }
  });

  it('uses profile Home landmarks for the shop redirect', () => {
    const manifest = resolvePublicSurfaceManifestSync();
    const shop = manifest.find(surface => surface.id === 'profile-shop');

    expect(shop?.readySelectors).toEqual([...PROFILE_HOME_READY_SELECTORS]);
  });
});
