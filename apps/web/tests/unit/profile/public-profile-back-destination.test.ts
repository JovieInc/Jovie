import { describe, expect, it } from 'vitest';
import {
  hasPublicProfileHistoryDestination,
  resolvePublicProfileBackAction,
  shouldShowPublicProfileBackChevron,
} from '@/features/profile/profile-surface-state';

describe('public profile back destination', () => {
  it('hides the root chevron when there is no real history destination', () => {
    expect(
      shouldShowPublicProfileBackChevron({
        isProfileRoot: true,
        hasHistoryDestination: false,
      })
    ).toBe(false);
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 1,
        referrer: '',
      })
    ).toBe('none');
    expect(
      hasPublicProfileHistoryDestination({
        historyLength: 2,
        referrer: '',
      })
    ).toBe(false);
  });

  it('keeps nested-mode back when the profile root is a real destination', () => {
    expect(
      shouldShowPublicProfileBackChevron({
        isProfileRoot: false,
        hasHistoryDestination: false,
      })
    ).toBe(true);
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: false,
        historyLength: 1,
        referrer: '',
      })
    ).toBe('profile-root');
  });

  it('uses browser history only on the root when a referrer exists', () => {
    expect(
      shouldShowPublicProfileBackChevron({
        isProfileRoot: true,
        hasHistoryDestination: true,
      })
    ).toBe(true);
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 2,
        referrer: 'https://jov.ie/explore',
      })
    ).toBe('history-back');
  });
});
