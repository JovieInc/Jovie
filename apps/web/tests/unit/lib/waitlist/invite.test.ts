import { describe, expect, it } from 'vitest';
import {
  buildWaitlistConfirmationEmail,
  buildWaitlistInviteEmail,
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
    expect(result.message.text).toContain(
      'Use this secure link to finish signup:'
    );
    expect(result.message.html).toContain('Finish signup');
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
