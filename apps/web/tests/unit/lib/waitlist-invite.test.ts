import { describe, expect, it } from 'vitest';

import { buildWaitlistInviteEmail } from '@/lib/waitlist/invite';

describe('buildWaitlistInviteEmail', () => {
  it('builds a signup URL with redirect_url when claimToken is not provided', () => {
    const { inviteUrl } = buildWaitlistInviteEmail({
      email: 'hello@example.com',
      fullName: 'Example User',
      appUrl: 'https://jov.ie',
      redirectUrl: '/app/dashboard',
      dedupKey: 'dedup',
    });

    expect(inviteUrl).toBe(
      'https://jov.ie/signup?redirect_url=%2Fapp%2Fdashboard'
    );
  });

  it('builds a claim URL when claimToken is provided', () => {
    const { inviteUrl } = buildWaitlistInviteEmail({
      email: 'hello@example.com',
      fullName: 'Example User',
      appUrl: 'https://jov.ie',
      claimToken: '550e8400-e29b-41d4-a716-446655440000',
      dedupKey: 'dedup',
    });

    expect(inviteUrl).toBe(
      'https://jov.ie/claim/550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('includes greeting in text and html', () => {
    const result = buildWaitlistInviteEmail({
      email: 'hello@example.com',
      fullName: 'Example User',
      appUrl: 'https://jov.ie',
      redirectUrl: '/app/dashboard',
      dedupKey: 'dedup',
    });

    expect(result.message.text).toContain('Hi Example User');
    expect(result.message.html ?? '').toContain('Hi Example User');
  });
});
