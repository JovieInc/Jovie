import { describe, expect, it, vi } from 'vitest';
import { hasRecentAdminMfaReverification } from '@/lib/admin/mfa';

describe('hasRecentAdminMfaReverification', () => {
  it('returns false when authResult does not expose has()', () => {
    expect(hasRecentAdminMfaReverification(null)).toBe(false);
    expect(hasRecentAdminMfaReverification({ userId: 'user_admin' })).toBe(
      false
    );
  });

  it('passes the expected reverification requirement to authResult.has()', () => {
    const has = vi.fn().mockReturnValue(true);

    expect(hasRecentAdminMfaReverification({ has })).toBe(true);
    expect(has).toHaveBeenCalledWith({
      reverification: {
        level: 'multi_factor',
        afterMinutes: 15,
      },
    });
  });

  it('returns false when authResult.has() reports stale MFA', () => {
    const has = vi.fn().mockReturnValue(false);

    expect(hasRecentAdminMfaReverification({ has })).toBe(false);
  });
});
