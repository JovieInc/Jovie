import { describe, expect, it } from 'vitest';
import {
  canTransitionWaitlistStatus,
  isWaitlistApprovedStatus,
  isWaitlistInviteRedeemableStatus,
  isWaitlistPendingStatus,
  isWaitlistSignupEligibleStatus,
  shouldSendWaitlistConfirmationForStatus,
  shouldSendWaitlistWelcomeForStatus,
  toAdminWaitlistLabel,
  transitionWaitlistStatus,
  WAITLIST_TERMINAL_STATUSES,
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
    // qualify/2026-11-v1: waitlisted is reachable only from disqualified.
    expect(canTransitionWaitlistStatus('qualified', 'waitlisted')).toBe(false);
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

    expect(isWaitlistSignupEligibleStatus('approved')).toBe(true);
    expect(isWaitlistSignupEligibleStatus('invited')).toBe(true);
    expect(isWaitlistSignupEligibleStatus('waitlisted')).toBe(false);
    expect(isWaitlistSignupEligibleStatus('rejected')).toBe(false);

    expect(shouldSendWaitlistConfirmationForStatus('waitlisted')).toBe(true);
    expect(shouldSendWaitlistConfirmationForStatus('approved')).toBe(false);
    expect(shouldSendWaitlistWelcomeForStatus('signed_up')).toBe(true);
    expect(shouldSendWaitlistWelcomeForStatus('claimed')).toBe(true);
    expect(shouldSendWaitlistWelcomeForStatus('invited')).toBe(false);
  });
});

describe('Mom Test funnel transitions (qualify/2026-11-v1)', () => {
  it('forbids entering waitlisted directly from new/chat_started/qualified', () => {
    expect(canTransitionWaitlistStatus('new', 'waitlisted')).toBe(false);
    expect(canTransitionWaitlistStatus('chat_started', 'waitlisted')).toBe(
      false
    );
    expect(canTransitionWaitlistStatus('qualified', 'waitlisted')).toBe(false);
  });

  it('reaches waitlisted only from disqualified', () => {
    expect(canTransitionWaitlistStatus('disqualified', 'waitlisted')).toBe(
      true
    );
    for (const from of [
      'new',
      'chat_started',
      'qualified',
      'queued',
      'invited',
      'approved',
      'claimed',
      'signed_up',
      'rejected',
      'expired',
      'blocked',
    ] as const) {
      if (from === 'expired') {
        // expired -> waitlisted is the pre-existing resubmission path.
        expect(canTransitionWaitlistStatus(from, 'waitlisted')).toBe(true);
        continue;
      }
      expect(canTransitionWaitlistStatus(from, 'waitlisted')).toBe(false);
    }
  });

  it('clears queued to qualified/approved when readiness does', () => {
    expect(canTransitionWaitlistStatus('queued', 'qualified')).toBe(true);
    expect(canTransitionWaitlistStatus('queued', 'approved')).toBe(true);
    expect(canTransitionWaitlistStatus('queued', 'disqualified')).toBe(true);
    expect(canTransitionWaitlistStatus('queued', 'rejected')).toBe(true);
    expect(canTransitionWaitlistStatus('queued', 'blocked')).toBe(true);
    expect(canTransitionWaitlistStatus('queued', 'waitlisted')).toBe(false);
    expect(canTransitionWaitlistStatus('queued', 'invited')).toBe(false);
  });

  it('routes pending states to queued/disqualified, never waitlisted', () => {
    for (const from of ['new', 'chat_started', 'qualified'] as const) {
      expect(canTransitionWaitlistStatus(from, 'queued')).toBe(true);
      expect(canTransitionWaitlistStatus(from, 'disqualified')).toBe(true);
    }
    expect(canTransitionWaitlistStatus('disqualified', 'qualified')).toBe(true);
  });

  it('requires a decisionReason to enter queued/disqualified', () => {
    expect(
      transitionWaitlistStatus('new', 'queued', { decisionReason: '' })
    ).toEqual({ ok: false, error: 'decision_reason_required' });
    expect(transitionWaitlistStatus('new', 'disqualified')).toEqual({
      ok: false,
      error: 'decision_reason_required',
    });
    expect(
      transitionWaitlistStatus('qualified', 'queued', {
        decisionReason: 'hold_capacity_full',
      })
    ).toEqual({ ok: true });
    expect(
      transitionWaitlistStatus('chat_started', 'disqualified', {
        decisionReason: 'disqualified_wrong_audience',
      })
    ).toEqual({ ok: true });
  });

  it('requires a decisionReason on the disqualified -> waitlisted move', () => {
    expect(transitionWaitlistStatus('disqualified', 'waitlisted')).toEqual({
      ok: false,
      error: 'decision_reason_required',
    });
    expect(
      transitionWaitlistStatus('disqualified', 'waitlisted', {
        decisionReason: 'needs_collected_rewaitlist',
      })
    ).toEqual({ ok: true });
  });

  it('rejects invalid moves even with a reason', () => {
    expect(
      transitionWaitlistStatus('approved', 'queued', {
        decisionReason: 'hold_capacity_full',
      })
    ).toEqual({ ok: false, error: 'invalid_transition' });
    expect(
      transitionWaitlistStatus('signed_up', 'disqualified', {
        decisionReason: 'disqualified_wrong_audience',
      })
    ).toEqual({ ok: false, error: 'invalid_transition' });
  });

  it('labels queued and disqualified distinctly from waitlisted', () => {
    expect(toAdminWaitlistLabel('queued')).toBe('Queued (held)');
    expect(toAdminWaitlistLabel('disqualified')).toBe('Not a fit');
    expect(toAdminWaitlistLabel('waitlisted')).toBe('Waitlisted');
  });

  it('classifies queued as pending and disqualified as neither pending nor terminal', () => {
    expect(isWaitlistPendingStatus('queued')).toBe(true);
    expect(isWaitlistPendingStatus('disqualified')).toBe(false);
    expect(WAITLIST_TERMINAL_STATUSES.has('disqualified')).toBe(false);
    expect(WAITLIST_TERMINAL_STATUSES.has('queued')).toBe(false);
  });
});
