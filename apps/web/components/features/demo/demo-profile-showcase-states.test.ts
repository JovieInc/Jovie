import { describe, expect, it } from 'vitest';
import { HOMEPAGE_PROFILE_SHOWCASE_STATES } from '@/features/home/homepage-profile-preview-fixture';
import {
  DEMO_TIM_WHITE_SHOWCASE_STATE_IDS,
  isProfileShowcaseStateId,
} from './demo-profile-showcase-states';

describe('demo profile query-state admission', () => {
  it('admits every supported state with its corresponding fixture', () => {
    for (const id of DEMO_TIM_WHITE_SHOWCASE_STATE_IDS) {
      expect(isProfileShowcaseStateId(id)).toBe(true);
      expect(HOMEPAGE_PROFILE_SHOWCASE_STATES[id].id).toBe(id);
    }
  });

  it.each([null, '', 'unknown', 'toString', '__proto__', 'share-extra'])(
    'rejects unsupported query state %s',
    value => expect(isProfileShowcaseStateId(value)).toBe(false)
  );

  it.each([
    [
      'tour',
      'tour',
      'none',
      'Next Date Live',
      'Lead with the next date and open the full run from there.',
      undefined,
    ],
    [
      'events-empty',
      'tour',
      'none',
      'Events Empty',
      'The empty Events tab should still offer alerts.',
      undefined,
    ],
    [
      'more-menu',
      'menu',
      'live',
      'More Menu',
      'The compact profile menu should fit above the bottom nav.',
      'Listen',
    ],
    [
      'share',
      'share',
      'live',
      'Share Profile',
      'One link to copy or post anywhere.',
      'Listen',
    ],
  ] as const)(
    'preserves the complete %s drawer fixture',
    (id, drawerView, latestReleaseKey, label, helper, releaseActionLabel) => {
      const expected = {
        id,
        drawerView,
        latestReleaseKey,
        notifications: { kind: 'button', tone: 'quiet', label, helper },
        showSubscriptionConfirmedBanner: false,
        previewOverlay: null,
        ...(releaseActionLabel ? { releaseActionLabel } : {}),
      };
      expect(HOMEPAGE_PROFILE_SHOWCASE_STATES[id]).toEqual(expected);
    }
  );
});
