import { describe, expect, it } from 'vitest';
import {
  artistProfileNavItem,
  filterProfilesWorkspaceNavigation,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  newThreadNavItem,
  primaryNavigation,
  settingsNavItem,
  touringNavItem,
} from './config';

// Canonical nav items that mobile is allowed to reference. Anything mobile
// renders must come from this set (or the shared exports above) so desktop
// and mobile can never drift — see JOV-12644.
const CANONICAL_ITEM_IDS = new Set([
  ...primaryNavigation.map(item => item.id),
  artistProfileNavItem.id,
  touringNavItem.id,
  settingsNavItem.id,
]);

describe('mobile nav derivation', () => {
  it('never defines a mobile-only NavItem — every id traces back to a canonical item', () => {
    for (const item of [
      ...mobilePrimaryNavigation,
      ...mobileExpandedNavigation,
    ]) {
      expect(CANONICAL_ITEM_IDS.has(item.id)).toBe(true);
    }
  });

  it('uses the shared chat entry point instead of a redefined "home" item', () => {
    expect(mobilePrimaryNavigation[0]).toBe(newThreadNavItem);
  });

  it('omits the Profiles destination while its rollout flag is disabled', () => {
    expect(
      filterProfilesWorkspaceNavigation(mobileExpandedNavigation, false).some(
        item => item.id === artistProfileNavItem.id
      )
    ).toBe(false);
    expect(
      filterProfilesWorkspaceNavigation(mobileExpandedNavigation, true).some(
        item => item.id === artistProfileNavItem.id
      )
    ).toBe(true);
  });
});
