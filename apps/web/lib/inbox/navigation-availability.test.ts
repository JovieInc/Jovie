import { describe, expect, it } from 'vitest';
import { suggestedActionStatusEnum } from '@/lib/db/schema/enums';
import {
  PENDING_SUGGESTED_ACTION_STATUS,
  resolveInboxNavigationAvailability,
  shouldShowInboxNavigation,
  UNKNOWN_INBOX_NAVIGATION_AVAILABILITY,
} from './navigation-availability';

describe('Inbox navigation availability', () => {
  it('filters the pending count by a status literal the prod enum has (JOV-5160)', () => {
    // JOV-3125/JOV-5160 class: an out-of-enum status literal breaks the
    // suggested_actions count read on every Inbox load.
    expect(suggestedActionStatusEnum.enumValues).toContain(
      PENDING_SUGGESTED_ACTION_STATUS
    );
  });

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
