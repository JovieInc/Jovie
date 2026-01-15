import { describe, expect, it } from 'vitest';
import {
  isUpgradeableAvatarUrl,
  upgradeOAuthAvatarUrl,
} from '@/lib/utils/avatar-url';

describe('upgradeOAuthAvatarUrl', () => {
  describe('Google OAuth avatars', () => {
    it('should upgrade Google avatar with =s96-c parameter to =s512-c', () => {
      const input = 'https://lh3.googleusercontent.com/a/ACg8ocLXyz123=s96-c';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(
        'https://lh3.googleusercontent.com/a/ACg8ocLXyz123=s512-c'
      );
    });

    it('should upgrade Google avatar with =s96 parameter (no -c suffix)', () => {
      const input = 'https://lh3.googleusercontent.com/a/ACg8ocLXyz123=s96';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(
        'https://lh3.googleusercontent.com/a/ACg8ocLXyz123=s512-c'
      );
    });

    it('should add size parameter to Google avatar without one', () => {
      const input = 'https://lh3.googleusercontent.com/a/ACg8ocLXyz123';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(
        'https://lh3.googleusercontent.com/a/ACg8ocLXyz123=s512-c'
      );
    });

    it('should handle various Google URL formats', () => {
      const inputs = [
        'https://lh3.googleusercontent.com/a-/AOh14Gi123=s96-c',
        'https://lh4.googleusercontent.com/a/ACg8ocL456=s64-c',
        'https://lh5.googleusercontent.com/a/ACg8ocL789=s128-c',
      ];
      for (const input of inputs) {
        const result = upgradeOAuthAvatarUrl(input);
        expect(result).toMatch(/=s512-c$/);
      }
    });
  });

  describe('Facebook/Meta avatars', () => {
    it('should upgrade Facebook avatar with path-based dimensions', () => {
      const input =
        'https://platform-lookaside.fbsbx.com/platform/profilepic/s96x96/abc.jpg';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(
        'https://platform-lookaside.fbsbx.com/platform/profilepic/s512x512/abc.jpg'
      );
    });

    it('should upgrade Facebook avatar with query param dimensions', () => {
      const input =
        'https://graph.facebook.com/123456/picture?width=96&height=96';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('width=512');
      expect(result).toContain('height=512');
    });

    it('should handle fbcdn.net URLs', () => {
      const input = 'https://scontent.fbcdn.net/v/t1.6435/s96x96/image.jpg';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('s512x512');
    });
  });

  describe('Twitter/X avatars', () => {
    it('should upgrade Twitter avatar with _normal suffix', () => {
      const input =
        'https://pbs.twimg.com/profile_images/123456/avatar_normal.jpg';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(
        'https://pbs.twimg.com/profile_images/123456/avatar_400x400.jpg'
      );
    });

    it('should upgrade Twitter avatar with _bigger suffix', () => {
      const input =
        'https://pbs.twimg.com/profile_images/123456/avatar_bigger.png';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(
        'https://pbs.twimg.com/profile_images/123456/avatar_400x400.png'
      );
    });

    it('should upgrade Twitter avatar with _200x200 suffix', () => {
      const input =
        'https://pbs.twimg.com/profile_images/123456/avatar_200x200.jpg';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(
        'https://pbs.twimg.com/profile_images/123456/avatar_400x400.jpg'
      );
    });

    it('should not modify already max-resolution Twitter avatar', () => {
      const input =
        'https://pbs.twimg.com/profile_images/123456/avatar_400x400.jpg';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(input);
    });
  });

  describe('GitHub avatars', () => {
    it('should upgrade GitHub avatar with s parameter', () => {
      const input = 'https://avatars.githubusercontent.com/u/12345?s=96';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('s=512');
    });

    it('should add size parameter to GitHub avatar without one', () => {
      const input = 'https://avatars.githubusercontent.com/u/12345';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('s=512');
    });

    it('should upgrade GitHub avatar with size parameter', () => {
      const input = 'https://avatars.githubusercontent.com/u/12345?v=4&size=96';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('size=512');
    });
  });

  describe('Gravatar avatars', () => {
    it('should upgrade Gravatar with s parameter', () => {
      const input = 'https://www.gravatar.com/avatar/abc123?s=80&d=identicon';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('s=512');
      expect(result).toContain('d=identicon');
    });

    it('should add size parameter to Gravatar without one', () => {
      const input = 'https://secure.gravatar.com/avatar/abc123';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('s=512');
    });
  });

  describe('Clerk CDN avatars', () => {
    it('should upgrade Clerk avatar with w and h parameters', () => {
      const input = 'https://img.clerk.com/abc123?w=96&h=96';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toContain('w=512');
      expect(result).toContain('h=512');
    });

    it('should not modify Clerk avatar without size params', () => {
      const input = 'https://img.clerk.com/abc123';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(input);
    });
  });

  describe('Unknown providers', () => {
    it('should return unknown URLs unchanged', () => {
      const input = 'https://example.com/avatar.jpg';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(input);
    });

    it('should return custom CDN URLs unchanged', () => {
      const input = 'https://cdn.myapp.com/avatars/user123.png';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(input);
    });
  });

  describe('Edge cases', () => {
    it('should return null for null input', () => {
      const result = upgradeOAuthAvatarUrl(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = upgradeOAuthAvatarUrl(undefined);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = upgradeOAuthAvatarUrl('');
      expect(result).toBeNull();
    });

    it('should return invalid URLs unchanged', () => {
      const input = 'not-a-valid-url';
      const result = upgradeOAuthAvatarUrl(input);
      expect(result).toBe(input);
    });
  });
});

describe('isUpgradeableAvatarUrl', () => {
  it('should return true for Google URLs', () => {
    expect(
      isUpgradeableAvatarUrl('https://lh3.googleusercontent.com/a/abc')
    ).toBe(true);
  });

  it('should return true for Facebook URLs', () => {
    expect(
      isUpgradeableAvatarUrl('https://platform-lookaside.fbsbx.com/abc')
    ).toBe(true);
  });

  it('should return true for Twitter URLs', () => {
    expect(
      isUpgradeableAvatarUrl('https://pbs.twimg.com/profile_images/abc')
    ).toBe(true);
  });

  it('should return true for GitHub URLs', () => {
    expect(
      isUpgradeableAvatarUrl('https://avatars.githubusercontent.com/u/123')
    ).toBe(true);
  });

  it('should return true for Gravatar URLs', () => {
    expect(isUpgradeableAvatarUrl('https://www.gravatar.com/avatar/abc')).toBe(
      true
    );
  });

  it('should return false for unknown URLs', () => {
    expect(isUpgradeableAvatarUrl('https://example.com/avatar.jpg')).toBe(
      false
    );
  });

  it('should return false for null', () => {
    expect(isUpgradeableAvatarUrl(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isUpgradeableAvatarUrl(undefined)).toBe(false);
  });
});

describe('Security: Subdomain Injection Prevention', () => {
  describe('should reject subdomain injection attacks', () => {
    it('should reject evil.fbsbx.com.attacker.com (Facebook)', () => {
      const maliciousUrl = 'https://evil.fbsbx.com.attacker.com/image.jpg';
      expect(isUpgradeableAvatarUrl(maliciousUrl)).toBe(false);
      const result = upgradeOAuthAvatarUrl(maliciousUrl);
      // Should return unchanged (not upgraded as Facebook)
      expect(result).toBe(maliciousUrl);
    });

    it('should reject grafavatar.com (Gravatar substring)', () => {
      const maliciousUrl = 'https://grafavatar.com/avatar/abc123';
      expect(isUpgradeableAvatarUrl(maliciousUrl)).toBe(false);
      const result = upgradeOAuthAvatarUrl(maliciousUrl);
      expect(result).toBe(maliciousUrl);
    });

    it('should reject notgoogleusercontent.com (Google suffix)', () => {
      const maliciousUrl = 'https://notgoogleusercontent.com/image.jpg';
      expect(isUpgradeableAvatarUrl(maliciousUrl)).toBe(false);
      const result = upgradeOAuthAvatarUrl(maliciousUrl);
      expect(result).toBe(maliciousUrl);
    });

    it('should reject evil.gravatar.com.attacker.com', () => {
      const maliciousUrl = 'https://evil.gravatar.com.attacker.com/avatar/abc';
      expect(isUpgradeableAvatarUrl(maliciousUrl)).toBe(false);
      const result = upgradeOAuthAvatarUrl(maliciousUrl);
      expect(result).toBe(maliciousUrl);
    });

    it('should reject facebook.com.attacker.com', () => {
      const maliciousUrl = 'https://facebook.com.attacker.com/image.jpg';
      expect(isUpgradeableAvatarUrl(maliciousUrl)).toBe(false);
      const result = upgradeOAuthAvatarUrl(maliciousUrl);
      expect(result).toBe(maliciousUrl);
    });
  });

  describe('should accept legitimate subdomains', () => {
    it('should accept lh3.googleusercontent.com (Google subdomain)', () => {
      const validUrl = 'https://lh3.googleusercontent.com/a/abc=s96-c';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
      const result = upgradeOAuthAvatarUrl(validUrl);
      expect(result).toContain('=s512-c');
    });

    it('should accept scontent.fbsbx.com (Facebook subdomain)', () => {
      const validUrl = 'https://scontent.fbsbx.com/v/image.jpg';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
    });

    it('should accept secure.gravatar.com (Gravatar subdomain)', () => {
      const validUrl = 'https://secure.gravatar.com/avatar/abc123?s=80';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
      const result = upgradeOAuthAvatarUrl(validUrl);
      expect(result).toContain('s=512');
    });

    it('should accept www.gravatar.com (Gravatar www subdomain)', () => {
      const validUrl = 'https://www.gravatar.com/avatar/abc123';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
    });
  });

  describe('should accept exact domain matches', () => {
    it('should accept googleusercontent.com (bare domain)', () => {
      const validUrl = 'https://googleusercontent.com/image.jpg';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
    });

    it('should accept gravatar.com (bare domain)', () => {
      const validUrl = 'https://gravatar.com/avatar/abc123';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
    });

    it('should accept fbsbx.com (bare domain)', () => {
      const validUrl = 'https://fbsbx.com/image.jpg';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
    });

    it('should accept facebook.com (bare domain)', () => {
      const validUrl = 'https://facebook.com/image.jpg';
      expect(isUpgradeableAvatarUrl(validUrl)).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('should handle mixed case domains correctly', () => {
      const mixedCaseUrl = 'https://Lh3.GoogleUserContent.COM/a/abc=s96-c';
      expect(isUpgradeableAvatarUrl(mixedCaseUrl)).toBe(true);
      const result = upgradeOAuthAvatarUrl(mixedCaseUrl);
      expect(result).toContain('=s512-c');
    });

    it('should reject mixed case injection attempts', () => {
      const maliciousUrl = 'https://Evil.FbSbx.Com.Attacker.Com/image.jpg';
      expect(isUpgradeableAvatarUrl(maliciousUrl)).toBe(false);
    });
  });
});
