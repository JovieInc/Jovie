import { describe, expect, it } from 'vitest';
import {
  markPacTabBarReturnVisit,
  PAC_TAB_BAR_RETURN_VISIT_KEY,
  readPacTabBarReturnVisit,
  shouldShowColdVisitorTabBar,
} from './pac-tab-bar-experiment';

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

  it('hides the bar only for cold first-visit visitors on the hidden arm', () => {
    expect(
      shouldShowColdVisitorTabBar({
        tabBarArm: 'hidden',
        isSubscribed: false,
        restoredThisSession: false,
        isReturnVisit: false,
      })
    ).toBe(false);
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

describe('return-visit storage helpers', () => {
  it('reads and marks the durable return-visit flag', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    expect(readPacTabBarReturnVisit(storage)).toBe(false);
    markPacTabBarReturnVisit(storage);
    expect(store.get(PAC_TAB_BAR_RETURN_VISIT_KEY)).toBe('1');
    expect(readPacTabBarReturnVisit(storage)).toBe(true);
  });
});
