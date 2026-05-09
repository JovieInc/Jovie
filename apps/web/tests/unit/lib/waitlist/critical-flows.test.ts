import { describe, expect, it } from 'vitest';
import { evaluateWaitlistQualification } from '@/lib/waitlist/qualification';
import {
  canTransitionWaitlistStatus,
  isWaitlistApprovedStatus,
  isWaitlistPendingStatus,
} from '@/lib/waitlist/state-machine';
import {
  generateWaitlistInviteTokenPair,
  waitlistInviteTokenMatches,
} from '@/lib/waitlist/tokens';

const basePayload = {
  primaryGoal: 'launch',
  primarySocialUrl: 'https://instagram.com/artist',
  spotifyUrl: 'https://open.spotify.com/artist/abc',
  spotifyArtistName: 'Artist',
  heardAbout: 'friend',
  selectedPlan: undefined,
} as never;

describe('waitlist critical flow contracts', () => {
  it('chat onboarding -> immediate approval -> signup -> welcome email contract', () => {
    const decision = evaluateWaitlistQualification({
      email: 'artist@example.com',
      payload: basePayload,
      config: { mode: 'open_signup' },
    });

    expect(decision).toMatchObject({
      qualified: true,
      status: 'approved',
      reasonCode: 'qualified_open_signup',
    });
    expect(canTransitionWaitlistStatus('chat_started', 'qualified')).toBe(true);
    expect(canTransitionWaitlistStatus('qualified', 'approved')).toBe(true);
    expect(canTransitionWaitlistStatus('approved', 'signed_up')).toBe(true);
  });

  it('chat onboarding -> waitlist -> waitlist email contract', () => {
    const decision = evaluateWaitlistQualification({
      email: 'artist@example.com',
      payload: basePayload,
      config: { mode: 'waitlist_enabled' },
    });

    expect(decision).toMatchObject({
      qualified: true,
      status: 'waitlisted',
      reasonCode: 'waitlist_gate_enabled',
    });
    expect(isWaitlistPendingStatus('waitlisted')).toBe(true);
  });

  it('waitlist -> manual approval -> invite email -> signup contract', () => {
    const tokenPair = generateWaitlistInviteTokenPair(
      new Date('2026-05-01T00:00:00.000Z')
    );

    expect(canTransitionWaitlistStatus('waitlisted', 'invited')).toBe(true);
    expect(isWaitlistApprovedStatus('invited')).toBe(true);
    expect(
      waitlistInviteTokenMatches(tokenPair.token, tokenPair.tokenHash)
    ).toBe(true);
    expect(canTransitionWaitlistStatus('invited', 'signed_up')).toBe(true);
  });

  it('waitlist -> auto-accept after configured days -> invite email -> signup contract', () => {
    const decision = evaluateWaitlistQualification({
      email: 'artist@example.com',
      payload: basePayload,
      config: { mode: 'waitlist_enabled', autoAcceptReserved: true },
    });

    expect(decision).toMatchObject({
      qualified: true,
      status: 'approved',
      reasonCode: 'qualified_auto_accept',
    });
    expect(canTransitionWaitlistStatus('waitlisted', 'invited')).toBe(true);
    expect(canTransitionWaitlistStatus('invited', 'signed_up')).toBe(true);
  });
});
