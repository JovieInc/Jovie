import { describe, expect, it } from 'vitest';

import { buildWaitlistInviteEmail } from '@/lib/waitlist/invite';

describe('buildWaitlistInviteEmail', () => {
  it('builds a signup URL with redirect_url', () => {
    const { signupUrl } = buildWaitlistInviteEmail({
      email: 'hello@example.com',
      fullName: 'Example User',
      appUrl: 'https://jov.ie',
      redirectUrl: '/app/dashboard',
      dedupKey: 'dedup',
    });

    expect(signupUrl).toBe(
      'https://jov.ie/signup?redirect_url=%2Fapp%2Fdashboard'
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
