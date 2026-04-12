import { describe, expect, it } from 'vitest';

import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import { truncateText } from '@/lib/profile/profile-card-layout';

describe('profile edge cases', () => {
  it('truncateText handles 80+ character artist name', () => {
    const longName = 'A'.repeat(80);
    const result = truncateText(longName, 32);
    expect(result.length).toBeLessThanOrEqual(32);
    expect(result).toMatch(/…$/);
  });

  it('truncateText handles long release title', () => {
    const result = truncateText(
      'This Is My Very Long Release Title That Goes On Forever',
      25
    );
    expect(result.length).toBeLessThanOrEqual(25);
    expect(result).toMatch(/…$/);
  });

  it('normalizeSubscriptionEmail accepts special characters', () => {
    expect(
      normalizeSubscriptionEmail('test+tag@sub.domain.com')
    ).not.toBeNull();
    expect(normalizeSubscriptionEmail('user@example.co.uk')).not.toBeNull();
    expect(normalizeSubscriptionEmail('invalid')).toBeNull();
  });
});
