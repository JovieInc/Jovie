import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTH_OAUTH_PROVIDER_LABELS,
  buildDisabledOAuthProviderElements,
  CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE,
  getEnabledAuthOAuthProviders,
  isOAuthProviderEnabled,
} from '@/lib/auth/oauth-providers';

const OAUTH_PROVIDERS_SOURCE = readFileSync(
  path.join(process.cwd(), 'lib/auth/oauth-providers.ts'),
  'utf8'
);

describe('OAuth provider guard', () => {
  describe('isOAuthProviderEnabled', () => {
    it('returns true for explicitly enabled providers (apple, google)', () => {
      expect(isOAuthProviderEnabled('apple')).toBe(true);
      expect(isOAuthProviderEnabled('google')).toBe(true);
    });

    it('returns false for providers not in the allowlist', () => {
      expect(isOAuthProviderEnabled('facebook')).toBe(false);
      expect(isOAuthProviderEnabled('github')).toBe(false);
      expect(isOAuthProviderEnabled('spotify')).toBe(false);
      expect(isOAuthProviderEnabled('tiktok')).toBe(false);
    });

    it('is independent of NEXT_PUBLIC_CLERK_OAUTH_* env vars', () => {
      // Set every env var to '1' and verify the allowlist still wins.
      const flags = [
        'NEXT_PUBLIC_CLERK_OAUTH_FACEBOOK_ENABLED',
        'NEXT_PUBLIC_CLERK_OAUTH_GITHUB_ENABLED',
        'NEXT_PUBLIC_CLERK_OAUTH_SPOTIFY_ENABLED',
        'NEXT_PUBLIC_CLERK_OAUTH_TIKTOK_ENABLED',
        'NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED',
        'NEXT_PUBLIC_CLERK_OAUTH_GOOGLE_ENABLED',
      ];
      const saved: Record<string, string | undefined> = {};
      for (const f of flags) {
        saved[f] = process.env[f];
        process.env[f] = '1';
      }
      try {
        expect(isOAuthProviderEnabled('facebook')).toBe(false);
        expect(isOAuthProviderEnabled('github')).toBe(false);
        expect(isOAuthProviderEnabled('spotify')).toBe(false);
        expect(isOAuthProviderEnabled('tiktok')).toBe(false);
        // Allowlisted providers stay on even if env is cleared.
        delete process.env.NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED;
        delete process.env.NEXT_PUBLIC_CLERK_OAUTH_GOOGLE_ENABLED;
        expect(isOAuthProviderEnabled('apple')).toBe(true);
        expect(isOAuthProviderEnabled('google')).toBe(true);
      } finally {
        for (const f of flags) {
          if (saved[f] === undefined) delete process.env[f];
          else process.env[f] = saved[f];
        }
      }
    });
  });

  describe('JOV-2131 allowlist source contract', () => {
    it('does not reintroduce process.env.NEXT_PUBLIC_CLERK_OAUTH_* enablement reads', () => {
      // PR #8458/#8497 env gates silently emptied production sign-in. The
      // allowlist is the only approved chokepoint for provider buttons.
      expect(OAUTH_PROVIDERS_SOURCE).not.toMatch(
        /process\.env\.NEXT_PUBLIC_CLERK_OAUTH_/
      );
      expect(OAUTH_PROVIDERS_SOURCE).not.toMatch(
        /process\.env\[[^\]]*CLERK_OAUTH/
      );
      expect(OAUTH_PROVIDERS_SOURCE).toMatch(/case 'apple':/);
      expect(OAUTH_PROVIDERS_SOURCE).toMatch(/case 'google':/);
      expect(OAUTH_PROVIDERS_SOURCE).toMatch(/return true;/);
    });
  });

  describe('buildDisabledOAuthProviderElements', () => {
    it('hides only disabled providers; leaves apple and google alone', () => {
      const elements = buildDisabledOAuthProviderElements();
      // Apple + Google are allowlisted, so no hide entries.
      expect(elements.socialButtonsBlockButton__apple).toBeUndefined();
      expect(elements.socialButtonsIconButton__apple).toBeUndefined();
      expect(elements.socialButtonsBlockButton__google).toBeUndefined();
      expect(elements.socialButtonsIconButton__google).toBeUndefined();
      // Everything else stays hidden.
      expect(elements.socialButtonsBlockButton__facebook).toBe('hidden');
      expect(elements.socialButtonsIconButton__facebook).toBe('hidden');
      expect(elements.socialButtonsBlockButton__github).toBe('hidden');
      expect(elements.socialButtonsBlockButton__spotify).toBe('hidden');
      expect(elements.socialButtonsBlockButton__tiktok).toBe('hidden');
    });

    it('produces exactly 8 hidden element keys (4 disabled providers × 2 variants)', () => {
      const elements = buildDisabledOAuthProviderElements();
      const hiddenKeys = Object.entries(elements)
        .filter(([, v]) => v === 'hidden')
        .map(([k]) => k);
      expect(hiddenKeys).toHaveLength(8);
    });
  });

  describe('shared provider button copy', () => {
    it('uses full provider labels for the enabled auth providers', () => {
      expect(getEnabledAuthOAuthProviders()).toEqual(['apple', 'google']);
      expect(AUTH_OAUTH_PROVIDER_LABELS.google).toBe('Continue with Google');
      expect(AUTH_OAUTH_PROVIDER_LABELS.apple).toBe('Continue with Apple');
    });

    it('forces Clerk compact multi-provider labels to keep the full copy', () => {
      expect(CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE).toBe(
        'Continue with {{provider|titleize}}'
      );
    });
  });
});
