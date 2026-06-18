import { beforeEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  _analyzeHostCache,
  _categorizePathCache,
  analyzeHost,
  categorizePath,
  DASHBOARD_URL,
  getPublicProfileCandidate,
} from '@/lib/routing/proxy-routing';

describe('proxy routing helpers', () => {
  beforeEach(() => {
    _categorizePathCache.clear();
    _analyzeHostCache.clear();
  });

  describe('memoization', () => {
    it('returns the same cached object for repeated categorizePath calls', () => {
      const first = categorizePath('/timwhite');
      const second = categorizePath('/timwhite');

      expect(second).toBe(first);
    });

    it('returns the same cached object for repeated analyzeHost calls', () => {
      const first = analyzeHost('jov.ie');
      const second = analyzeHost('jov.ie');

      expect(second).toBe(first);
    });

    it('bounds categorizePath cache at 1000 entries with FIFO eviction', () => {
      for (let i = 0; i < 1001; i++) {
        categorizePath(`/user-${i}`);
      }

      expect(_categorizePathCache.size).toBe(1000);
      expect(_categorizePathCache.has('/user-0')).toBe(false);
      expect(_categorizePathCache.has('/user-1000')).toBe(true);
    });

    it('bounds analyzeHost cache at 50 entries with FIFO eviction', () => {
      for (let i = 0; i < 51; i++) {
        analyzeHost(`host-${i}.example.com`);
      }

      expect(_analyzeHostCache.size).toBe(50);
      expect(_analyzeHostCache.has('host-0.example.com')).toBe(false);
      expect(_analyzeHostCache.has('host-50.example.com')).toBe(true);
    });
  });
  describe('analyzeHost', () => {
    it('treats local, preview, staging, and production app hosts as main hosts', () => {
      const hosts = [
        'localhost',
        '127.0.0.1',
        'jovie-abc123.vercel.app',
        'staging.jov.ie',
        'main.jov.ie',
        'jov.ie',
        'www.jov.ie',
      ];

      hosts.forEach(host => {
        expect(analyzeHost(host).isMainHost).toBe(true);
      });
    });

    it('marks preview-style hosts as dev or preview', () => {
      expect(analyzeHost('localhost').isDevOrPreview).toBe(true);
      expect(analyzeHost('127.0.0.1').isDevOrPreview).toBe(true);
      expect(analyzeHost('feature-branch.vercel.app').isDevOrPreview).toBe(
        true
      );
      expect(analyzeHost('staging.jov.ie').isDevOrPreview).toBe(true);
      expect(analyzeHost('jov.ie').isDevOrPreview).toBe(false);
    });

    it('keeps redirect-only hosts out of the main host classification', () => {
      const meetJovie = analyzeHost('meetjovie.com');
      expect(meetJovie.isMainHost).toBe(false);
      expect(meetJovie.isMeetJovie).toBe(true);
      expect(analyzeHost('support.jov.ie').isSupportHost).toBe(true);
      expect(analyzeHost('investors.jov.ie').isInvestorPortal).toBe(true);
    });
  });

  describe('categorizePath', () => {
    it('classifies protected shell and onboarding routes correctly', () => {
      expect(categorizePath('/app').isProtectedPath).toBe(true);
      expect(categorizePath('/app/dashboard/earnings').isProtectedPath).toBe(
        true
      );
      expect(categorizePath('/billing').isProtectedPath).toBe(true);
      expect(categorizePath('/waitlist').isProtectedPath).toBe(true);
      expect(categorizePath('/onboarding').isProtectedPath).toBe(false);
      expect(categorizePath('/onboarding/checkout').isProtectedPath).toBe(true);
    });

    it('keeps public routes public', () => {
      expect(categorizePath('/').isProtectedPath).toBe(false);
      expect(categorizePath('/pricing').isProtectedPath).toBe(false);
      expect(categorizePath('/tim').isProtectedPath).toBe(false);
      expect(
        categorizePath('/mobile-auth-return').publicProfileCandidate
      ).toBeNull();
    });

    it('recognizes auth entrypoints and callback aliases', () => {
      expect(categorizePath(APP_ROUTES.SIGNIN).isAuthPath).toBe(true);
      expect(categorizePath(APP_ROUTES.SIGNUP).isAuthPath).toBe(true);
      expect(
        categorizePath(APP_ROUTES.SIGNIN_SSO_CALLBACK).isAuthCallbackPath
      ).toBe(true);
      expect(
        categorizePath(APP_ROUTES.SIGNUP_HYPHEN_SSO_CALLBACK).isAuthCallbackPath
      ).toBe(true);
      expect(categorizePath(APP_ROUTES.PRICING).isAuthCallbackPath).toBe(false);
    });

    it('adds nonce requirements to app, api, and hydrated auth surfaces', () => {
      expect(categorizePath('/api/stripe/checkout').needsNonce).toBe(true);
      expect(categorizePath('/app/dashboard').needsNonce).toBe(true);
      expect(categorizePath(APP_ROUTES.SIGNIN).needsNonce).toBe(true);
      expect(categorizePath(APP_ROUTES.SIGNUP).needsNonce).toBe(true);
      expect(categorizePath(APP_ROUTES.SIGNIN_SSO_CALLBACK).needsNonce).toBe(
        true
      );
      expect(categorizePath(APP_ROUTES.DESKTOP_AUTH).needsNonce).toBe(true);
      expect(categorizePath(APP_ROUTES.AUTH_NATIVE_COMPLETE).needsNonce).toBe(
        true
      );
      expect(categorizePath(APP_ROUTES.START).needsNonce).toBe(true);
      expect(categorizePath('/pricing').needsNonce).toBe(false);
    });

    it('flags only the sensitive link APIs for bot protections', () => {
      expect(categorizePath('/api/link/abc').isSensitiveAPI).toBe(true);
      expect(categorizePath('/api/stripe/checkout').isSensitiveAPI).toBe(false);
    });
  });

  it('keeps the dashboard path stable across environments', () => {
    expect(DASHBOARD_URL).toBe('/app');
  });

  describe('getPublicProfileCandidate reserved short-circuit (JOV-3054)', () => {
    it('excludes reserved legacy paths before any profile DB work', () => {
      expect(getPublicProfileCandidate('/login')).toBeNull();
      expect(getPublicProfileCandidate('/request-access')).toBeNull();
      expect(getPublicProfileCandidate('/register')).toBeNull();
    });

    it('still recognizes real public profile handles', () => {
      expect(getPublicProfileCandidate('/timwhite')).toBe('timwhite');
    });
  });
});
