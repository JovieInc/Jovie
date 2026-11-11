import { describe, expect, it } from 'vitest';
import {
  hasPublicProfileHistoryDestination,
  resolvePublicProfileBackAction,
  shouldShowPublicProfileBackChevron,
} from '@/features/profile/profile-surface-state';
import {
  isPublicProfileRootLevel,
  isPublicProfileSiblingTab,
  resolveTabBackAction,
  shouldShowTabBackChevron,
} from '@/features/profile/sibling-tabs';

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

  it('shows a signed-in root escape hatch and prefers history over the app fallback', () => {
    expect(
      shouldShowPublicProfileBackChevron({
        isProfileRoot: true,
        hasHistoryDestination: false,
        isSignedIn: true,
      })
    ).toBe(true);
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 3,
        referrer: '',
        isSignedIn: true,
      })
    ).toBe('history-back');
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 1,
        referrer: '',
        isSignedIn: true,
      })
    ).toBe('app-fallback');
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 4,
        referrer: '',
        isSignedIn: true,
        arrivalHistoryLength: 1,
      })
    ).toBe('app-fallback');
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 4,
        referrer: '',
        isSignedIn: true,
        arrivalHistoryLength: 2,
        internalHistoryDepth: 2,
      })
    ).toBe('history-exit');
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 4,
        referrer: 'https://jov.ie/explore',
        arrivalHistoryLength: 2,
        internalHistoryDepth: 2,
      })
    ).toBe('history-exit');
    expect(
      resolvePublicProfileBackAction({
        isProfileRoot: true,
        historyLength: 4,
        referrer: '',
        isSignedIn: true,
        arrivalHistoryLength: 2,
        internalHistoryDepth: 0,
      })
    ).toBe('history-back');
  });

  it('treats the tab-row destinations as Home siblings, not nested pages', () => {
    for (const mode of ['listen', 'tour', 'about'] as const) {
      expect(isPublicProfileSiblingTab(mode)).toBe(true);
      expect(isPublicProfileRootLevel(mode)).toBe(true);
    }
    expect(isPublicProfileSiblingTab('profile')).toBe(false);
    expect(isPublicProfileRootLevel('profile')).toBe(true);
    for (const mode of ['releases', 'subscribe', 'pay', 'contact'] as const) {
      expect(isPublicProfileSiblingTab(mode)).toBe(false);
      expect(isPublicProfileRootLevel(mode)).toBe(false);
    }
  });

  it("gives sibling tabs Home's chevron and exit, and nested modes a Back home", () => {
    for (const mode of ['profile', 'listen', 'tour', 'about'] as const) {
      expect(
        shouldShowTabBackChevron({ mode, hasHistoryDestination: false })
      ).toBe(false);
      expect(
        resolveTabBackAction({
          mode,
          historyLength: 1,
          referrer: '',
          isSignedIn: true,
        })
      ).toBe('app-fallback');
    }
    expect(
      shouldShowTabBackChevron({
        mode: 'releases',
        hasHistoryDestination: false,
      })
    ).toBe(true);
    expect(
      resolveTabBackAction({ mode: 'releases', historyLength: 1, referrer: '' })
    ).toBe('profile-root');
  });
});
