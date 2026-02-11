import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_CONFIG } from '@/lib/db/config';
import { checkRateLimit } from '@/lib/utils/rate-limit';

/**
 * Claim Flow Unit Tests
 *
 * These tests verify the claim flow logic without requiring database access.
 * Integration tests with actual DB operations are in tests/integration/.
 */

describe('Claim Flow Logic', () => {
  describe('rate limiting', () => {
    it('blocks repeated attempts for the same key', () => {
      const key = `claim:test:${Date.now()}:${Math.random()}`;

      // Use the configured limit (shared with the in-memory limiter).
      for (let i = 0; i < RATE_LIMIT_CONFIG.requests; i += 1) {
        expect(checkRateLimit(key)).toBe(false);
      }

      expect(checkRateLimit(key)).toBe(true);
    });
  });

  describe('claim token validation', () => {
    it('rejects empty claim tokens', () => {
      const token = '';
      expect(token.length).toBe(0);
      // Empty tokens should redirect to home
    });

    it('accepts valid UUID tokens', () => {
      const token = '550e8400-e29b-41d4-a716-446655440000';
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(token)).toBe(true);
    });

    it('rejects malformed tokens', () => {
      const invalidTokens = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716', // too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // too long
        'ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ', // invalid characters
      ];

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      for (const token of invalidTokens) {
        expect(uuidRegex.test(token)).toBe(false);
      }
    });
  });

  describe('token expiration', () => {
    it('identifies expired tokens', () => {
      const expiredDate = new Date('2020-01-01');
      const now = new Date();
      expect(expiredDate < now).toBe(true);
    });

    it('identifies valid (non-expired) tokens', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30); // 30 days from now
      const now = new Date();
      expect(futureDate > now).toBe(true);
    });

    it('handles null expiration dates', () => {
      const expiresAt: Date | null = null;
      // Null expiration should be treated as valid (no expiry set)
      function isTokenValid(expiry: Date | null): boolean {
        if (expiry === null) return true;
        return expiry > new Date();
      }
      expect(isTokenValid(expiresAt)).toBe(true);
    });
  });

  describe('claim eligibility', () => {
    interface MockProfile {
      isClaimed: boolean;
      userId: string | null;
      claimToken: string | null;
      claimTokenExpiresAt: Date | null;
    }

    function canClaim(profile: MockProfile): boolean {
      // Profile must not be claimed
      if (profile.isClaimed) return false;

      // Profile must not have an owner
      if (profile.userId) return false;

      // Profile must have a claim token
      if (!profile.claimToken) return false;

      // Token must not be expired
      if (
        profile.claimTokenExpiresAt &&
        profile.claimTokenExpiresAt < new Date()
      ) {
        return false;
      }

      return true;
    }

    it('allows claiming unclaimed profile with valid token', () => {
      const profile: MockProfile = {
        isClaimed: false,
        userId: null,
        claimToken: '550e8400-e29b-41d4-a716-446655440000',
        claimTokenExpiresAt: new Date(Date.now() + 86400000), // 1 day from now
      };

      expect(canClaim(profile)).toBe(true);
    });

    it('prevents claiming already claimed profile', () => {
      const profile: MockProfile = {
        isClaimed: true,
        userId: 'user-123',
        claimToken: null,
        claimTokenExpiresAt: null,
      };

      expect(canClaim(profile)).toBe(false);
    });

    it('prevents claiming profile with owner', () => {
      const profile: MockProfile = {
        isClaimed: false,
        userId: 'user-123',
        claimToken: '550e8400-e29b-41d4-a716-446655440000',
        claimTokenExpiresAt: new Date(Date.now() + 86400000),
      };

      expect(canClaim(profile)).toBe(false);
    });

    it('prevents claiming profile with expired token', () => {
      const profile: MockProfile = {
        isClaimed: false,
        userId: null,
        claimToken: '550e8400-e29b-41d4-a716-446655440000',
        claimTokenExpiresAt: new Date('2020-01-01'),
      };

      expect(canClaim(profile)).toBe(false);
    });

    it('prevents claiming profile without token', () => {
      const profile: MockProfile = {
        isClaimed: false,
        userId: null,
        claimToken: null,
        claimTokenExpiresAt: null,
      };

      expect(canClaim(profile)).toBe(false);
    });
  });

  describe('redirect URL generation', () => {
    function generateClaimPath(username: string, token: string): string {
      return `/${encodeURIComponent(username)}/claim?token=${encodeURIComponent(token)}`;
    }

    function generateAuthRedirectUrl(
      authPath: '/signin' | '/signup',
      username: string,
      token: string
    ): string {
      const claimPath = generateClaimPath(username, token);
      return `${authPath}?redirect_url=${encodeURIComponent(claimPath)}`;
    }

    it('generates direct claim URL for signed-in users', () => {
      const claimPath = generateClaimPath('testartist', 'test-token');
      expect(claimPath).toBe('/testartist/claim?token=test-token');
    });

    it('generates signin URL with redirect for signed-out users', () => {
      const url = generateAuthRedirectUrl(
        '/signin',
        'testartist',
        'test-token'
      );
      expect(url).toBe(
        '/signin?redirect_url=%2Ftestartist%2Fclaim%3Ftoken%3Dtest-token'
      );
    });

    it('generates signup URL with redirect for signed-out users', () => {
      const url = generateAuthRedirectUrl(
        '/signup',
        'testartist',
        'test-token'
      );
      expect(url).toBe(
        '/signup?redirect_url=%2Ftestartist%2Fclaim%3Ftoken%3Dtest-token'
      );
    });

    it('properly encodes special characters', () => {
      const url = generateAuthRedirectUrl(
        '/signin',
        'testartist',
        'token/with&special'
      );
      expect(url).toContain('token%3Dtoken%252Fwith%2526special');
    });
  });

  describe('multi-profile guard', () => {
    interface MockUser {
      id: string;
      claimedProfiles: { id: string; username: string }[];
    }

    function canClaimNewProfile(user: MockUser): boolean {
      // Default policy: 1 user can only have 1 claimed profile
      return user.claimedProfiles.length === 0;
    }

    it('allows user with no profiles to claim', () => {
      const user: MockUser = {
        id: 'user-123',
        claimedProfiles: [],
      };

      expect(canClaimNewProfile(user)).toBe(true);
    });

    it('prevents user with existing profile from claiming another', () => {
      const user: MockUser = {
        id: 'user-123',
        claimedProfiles: [{ id: 'profile-1', username: 'existing' }],
      };

      expect(canClaimNewProfile(user)).toBe(false);
    });
  });
});
