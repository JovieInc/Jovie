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

  it('fails open for unknown availability and hides a conclusively empty Inbox', () => {
    expect(
      shouldShowInboxNavigation(UNKNOWN_INBOX_NAVIGATION_AVAILABILITY)
    ).toBe(true);
    expect(shouldShowInboxNavigation(undefined)).toBe(true);
    expect(shouldShowInboxNavigation({ state: 'empty', pendingCount: 0 })).toBe(
      false
    );
  });
});
