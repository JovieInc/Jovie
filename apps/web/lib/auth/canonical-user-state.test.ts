import { describe, expect, it } from 'vitest';
import {
  CanonicalUserState,
  resolveCanonicalState,
  type UserStateInput,
} from './canonical-user-state';

const pendingUser: UserStateInput = {
  isAuthenticated: true,
  hasDbUser: true,
  userStatus: 'waitlist_pending',
  waitlistEntryId: null,
  deletedAt: null,
  waitlistGateEnabled: true,
  profile: null,
};

describe('waitlist receipt state', () => {
  it('keeps a signed-in pre-receipt user on the /start request path', () => {
    expect(resolveCanonicalState(pendingUser)).toBe(
      CanonicalUserState.NEEDS_WAITLIST_SUBMISSION
    );
    expect(
      resolveCanonicalState({ ...pendingUser, waitlistGateEnabled: false })
    ).toBe(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION);
  });

  it('keeps an existing pending receipt gated when the launch gate is off', () => {
    expect(
      resolveCanonicalState({
        ...pendingUser,
        waitlistEntryId: 'entry-1',
        waitlistGateEnabled: false,
      })
    ).toBe(CanonicalUserState.WAITLIST_PENDING);
  });

  it('does not admit a banned user with a missing receipt', () => {
    expect(
      resolveCanonicalState({ ...pendingUser, userStatus: 'banned' })
    ).toBe(CanonicalUserState.BANNED);
  });
});
