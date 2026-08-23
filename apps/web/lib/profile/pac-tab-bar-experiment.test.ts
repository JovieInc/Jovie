import { describe, expect, it } from 'vitest';
import { shouldShowColdVisitorTabBar } from './pac-tab-bar-experiment';

describe('shouldShowColdVisitorTabBar', () => {
  it('shows the bar for the visible arm', () => {
    expect(
      shouldShowColdVisitorTabBar({
        tabBarArm: 'visible',
        isSubscribed: false,
        restoredThisSession: false,
        isReturnVisit: false,
      })
    ).toBe(true);
  });

  it('keeps authorized navigation visible for cold visitors on the hidden arm', () => {
    expect(
      shouldShowColdVisitorTabBar({
        tabBarArm: 'hidden',
        isSubscribed: false,
        restoredThisSession: false,
        isReturnVisit: false,
      })
    ).toBe(true);
  });

  it('always restores after first interaction, on return visits, or when subscribed', () => {
    expect(
      shouldShowColdVisitorTabBar({
        tabBarArm: 'hidden',
        isSubscribed: false,
        restoredThisSession: true,
        isReturnVisit: false,
      })
    ).toBe(true);

    expect(
      shouldShowColdVisitorTabBar({
        tabBarArm: 'hidden',
        isSubscribed: false,
        restoredThisSession: false,
        isReturnVisit: true,
      })
    ).toBe(true);

    expect(
      shouldShowColdVisitorTabBar({
        tabBarArm: 'hidden',
        isSubscribed: true,
        restoredThisSession: false,
        isReturnVisit: false,
      })
    ).toBe(true);
  });

  it('keeps the bar in non-interactive/preview renders', () => {
    expect(
      shouldShowColdVisitorTabBar({
        tabBarArm: 'hidden',
        isSubscribed: false,
        restoredThisSession: false,
        isReturnVisit: false,
        isInteractive: false,
      })
    ).toBe(true);
  });
});
