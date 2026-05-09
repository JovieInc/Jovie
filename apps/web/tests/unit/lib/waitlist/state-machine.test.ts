import { describe, expect, it } from 'vitest';
import {
  canTransitionWaitlistStatus,
  isWaitlistApprovedStatus,
  isWaitlistInviteRedeemableStatus,
  isWaitlistPendingStatus,
  shouldSendWaitlistConfirmationForStatus,
  shouldSendWaitlistWelcomeForStatus,
} from '@/lib/waitlist/state-machine';

describe('waitlist state machine', () => {
  it('classifies pending and approved access states', () => {
    expect(isWaitlistPendingStatus('waitlisted')).toBe(true);
    expect(isWaitlistPendingStatus('new')).toBe(true);
    expect(isWaitlistApprovedStatus('approved')).toBe(true);
    expect(isWaitlistApprovedStatus('invited')).toBe(true);
  });

  it('allows the canonical critical-path transitions', () => {
    expect(canTransitionWaitlistStatus('chat_started', 'qualified')).toBe(true);
    expect(canTransitionWaitlistStatus('qualified', 'approved')).toBe(true);
    expect(canTransitionWaitlistStatus('qualified', 'waitlisted')).toBe(true);
    expect(canTransitionWaitlistStatus('waitlisted', 'invited')).toBe(true);
    expect(canTransitionWaitlistStatus('invited', 'signed_up')).toBe(true);
  });

  it('blocks terminal state regressions', () => {
    expect(canTransitionWaitlistStatus('signed_up', 'waitlisted')).toBe(false);
    expect(canTransitionWaitlistStatus('blocked', 'approved')).toBe(false);
  });

  it('guards invite redemption and queued email sends by canonical status', () => {
    expect(isWaitlistInviteRedeemableStatus('invited')).toBe(true);
    expect(isWaitlistInviteRedeemableStatus('approved')).toBe(true);
    expect(isWaitlistInviteRedeemableStatus('waitlisted')).toBe(false);
    expect(isWaitlistInviteRedeemableStatus('rejected')).toBe(false);
    expect(isWaitlistInviteRedeemableStatus('blocked')).toBe(false);
    expect(isWaitlistInviteRedeemableStatus('expired')).toBe(false);

    expect(shouldSendWaitlistConfirmationForStatus('waitlisted')).toBe(true);
    expect(shouldSendWaitlistConfirmationForStatus('approved')).toBe(false);
    expect(shouldSendWaitlistWelcomeForStatus('signed_up')).toBe(true);
    expect(shouldSendWaitlistWelcomeForStatus('claimed')).toBe(true);
    expect(shouldSendWaitlistWelcomeForStatus('invited')).toBe(false);
  });
});
