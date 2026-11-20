import { describe, expect, it } from 'vitest';
import {
  buildWaitlistConfirmationEmail,
  buildWaitlistInviteEmail,
  NO_PROFILE_INVITE_COPY_APPROVED,
  selectWaitlistInviteCopyVariant,
} from '@/lib/waitlist/invite';

describe('waitlist email route contracts', () => {
  it('preserves invite copy while using the canonical invite route', () => {
    const result = buildWaitlistInviteEmail({
      email: 'creator@example.com',
      fullName: 'Test Creator',
      appUrl: 'https://jovie.test',
      dedupKey: 'invite-test',
      token: 'secure-token',
    });

    expect(result.inviteUrl).toBe(
      'https://jovie.test/waitlist/invite?token=secure-token'
    );
    expect(result.message.subject).toBe("You're off the waitlist!");
    expect(result.message.channels).toEqual(['email', 'push']);
    expect(result.message.pushTitle).toBe("You're off the waitlist!");
    expect(result.message.pushBody).toContain('access is ready');
    expect(result.message.text).toContain(
      'Use this secure link to finish signup:'
    );
    expect(result.message.html).toContain('Finish signup');
  });

  it('keeps the founder-approved copy byte-for-byte, with or without a profile, until the variant is approved', () => {
    const base = {
      email: 'creator@example.com',
      fullName: 'Test Creator',
      appUrl: 'https://jovie.test',
      dedupKey: 'invite-test',
      token: 'secure-token',
    };
    const approvedHtml =
      '<p>Hi Test Creator,</p><p>You\'re off the waitlist! Your Jovie profile is ready.</p><p><a href="https://jovie.test/waitlist/invite?token=secure-token">Finish signup</a></p><p><small>If you didn\'t request this, you can ignore this email.</small></p>';
    expect(NO_PROFILE_INVITE_COPY_APPROVED).toBe(false);
    for (const hasProfile of [true, false, undefined]) {
      const result = buildWaitlistInviteEmail({ ...base, hasProfile });
      expect(result.message.subject).toBe("You're off the waitlist!");
      expect(result.message.html).toBe(approvedHtml);
    }
  });

  it('selects the setup variant only for no-profile invites once approved', () => {
    expect(selectWaitlistInviteCopyVariant(false, true)).toBe('finish_setup');
    expect(selectWaitlistInviteCopyVariant(true, true)).toBe('profile_ready');
    expect(selectWaitlistInviteCopyVariant(undefined, true)).toBe(
      'profile_ready'
    );
    expect(selectWaitlistInviteCopyVariant(false, false)).toBe('profile_ready');
  });

  it('preserves confirmation copy while using the canonical waitlist route', () => {
    const result = buildWaitlistConfirmationEmail({
      email: 'creator@example.com',
      fullName: 'Test Creator',
      appUrl: 'https://jovie.test',
      dedupKey: 'confirmation-test',
    });

    expect(result.message.text).toContain('https://jovie.test/waitlist');
    expect(result.message.text).toContain(
      "You're on the Jovie waitlist. We'll email you when your access is ready."
    );
    expect(result.message.html).toContain('Check waitlist status');
  });
});
