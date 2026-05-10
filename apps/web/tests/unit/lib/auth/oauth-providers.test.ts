import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildDisabledOAuthProviderElements,
  isOAuthProviderEnabled,
} from '@/lib/auth/oauth-providers';

const FLAGS = [
  'NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED',
  'NEXT_PUBLIC_CLERK_OAUTH_GOOGLE_ENABLED',
  'NEXT_PUBLIC_CLERK_OAUTH_FACEBOOK_ENABLED',
  'NEXT_PUBLIC_CLERK_OAUTH_GITHUB_ENABLED',
  'NEXT_PUBLIC_CLERK_OAUTH_SPOTIFY_ENABLED',
  'NEXT_PUBLIC_CLERK_OAUTH_TIKTOK_ENABLED',
] as const;

describe('OAuth provider guard', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const flag of FLAGS) {
      originalEnv[flag] = process.env[flag];
      delete process.env[flag];
    }
  });

  afterEach(() => {
    for (const flag of FLAGS) {
      if (originalEnv[flag] === undefined) {
        delete process.env[flag];
      } else {
        process.env[flag] = originalEnv[flag];
      }
    }
  });

  describe('isOAuthProviderEnabled', () => {
    it('returns false when env var is unset', () => {
      expect(isOAuthProviderEnabled('apple')).toBe(false);
      expect(isOAuthProviderEnabled('google')).toBe(false);
    });

    it("returns false when env var is anything other than the literal '1'", () => {
      process.env.NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED = 'true';
      expect(isOAuthProviderEnabled('apple')).toBe(false);

      process.env.NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED = '0';
      expect(isOAuthProviderEnabled('apple')).toBe(false);

      process.env.NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED = '';
      expect(isOAuthProviderEnabled('apple')).toBe(false);

      process.env.NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED = ' 1 ';
      expect(isOAuthProviderEnabled('apple')).toBe(false);
    });

    it("returns true only when env var is the exact literal '1'", () => {
      process.env.NEXT_PUBLIC_CLERK_OAUTH_GOOGLE_ENABLED = '1';
      expect(isOAuthProviderEnabled('google')).toBe(true);
    });

    it('treats each provider independently', () => {
      process.env.NEXT_PUBLIC_CLERK_OAUTH_GOOGLE_ENABLED = '1';
      expect(isOAuthProviderEnabled('google')).toBe(true);
      expect(isOAuthProviderEnabled('apple')).toBe(false);
      expect(isOAuthProviderEnabled('facebook')).toBe(false);
    });
  });

  describe('buildDisabledOAuthProviderElements', () => {
    it('hides every provider by default (fail closed)', () => {
      const elements = buildDisabledOAuthProviderElements();
      expect(elements.socialButtonsBlockButton__apple).toBe('hidden');
      expect(elements.socialButtonsIconButton__apple).toBe('hidden');
      expect(elements.socialButtonsBlockButton__google).toBe('hidden');
      expect(elements.socialButtonsBlockButton__facebook).toBe('hidden');
      expect(elements.socialButtonsBlockButton__github).toBe('hidden');
      expect(elements.socialButtonsBlockButton__spotify).toBe('hidden');
      expect(elements.socialButtonsBlockButton__tiktok).toBe('hidden');
    });

    it('does not hide providers that are explicitly enabled', () => {
      process.env.NEXT_PUBLIC_CLERK_OAUTH_GOOGLE_ENABLED = '1';
      const elements = buildDisabledOAuthProviderElements();
      expect(elements.socialButtonsBlockButton__google).toBeUndefined();
      expect(elements.socialButtonsIconButton__google).toBeUndefined();
      // Apple remains hidden because it is not explicitly enabled.
      expect(elements.socialButtonsBlockButton__apple).toBe('hidden');
      expect(elements.socialButtonsIconButton__apple).toBe('hidden');
    });

    it('keeps Apple hidden by default — regression guard for JOV-2062', () => {
      // Even if every other provider is enabled, Apple must stay hidden until
      // it is explicitly enabled via its env flag.
      for (const flag of FLAGS) {
        if (flag === 'NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED') continue;
        process.env[flag] = '1';
      }
      const elements = buildDisabledOAuthProviderElements();
      expect(elements.socialButtonsBlockButton__apple).toBe('hidden');
      expect(elements.socialButtonsIconButton__apple).toBe('hidden');
    });
  });
});
