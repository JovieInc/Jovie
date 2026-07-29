import { describe, expect, it } from 'vitest';
import {
  resolveInboxNavigationAvailability,
  shouldShowInboxNavigation,
  UNKNOWN_INBOX_NAVIGATION_AVAILABILITY,
} from './navigation-availability';

describe('Inbox navigation availability', () => {
  it('marks the Inbox available when either review queue has pending work', () => {
    expect(resolveInboxNavigationAvailability(1, 0)).toEqual({
      state: 'available',
      pendingCount: 1,
    });
    expect(resolveInboxNavigationAvailability(0, 2)).toEqual({
      state: 'available',
      pendingCount: 2,
    });
  });

  it('marks the Inbox empty only after both queues settle at zero', () => {
    expect(resolveInboxNavigationAvailability(0, 0)).toEqual({
      state: 'empty',
      pendingCount: 0,
    });
  });

  it('fails open for unknown availability and preserves an active empty Inbox', () => {
    expect(
      shouldShowInboxNavigation(UNKNOWN_INBOX_NAVIGATION_AVAILABILITY, false)
    ).toBe(true);
    expect(shouldShowInboxNavigation(undefined, false)).toBe(true);
    expect(
      shouldShowInboxNavigation({ state: 'empty', pendingCount: 0 }, true)
    ).toBe(true);
    expect(
      shouldShowInboxNavigation({ state: 'empty', pendingCount: 0 }, false)
    ).toBe(false);
  });
});
