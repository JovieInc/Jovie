import { describe, expect, it } from 'vitest';
import {
  analyzeHost,
  categorizePath,
  DASHBOARD_URL,
} from '@/lib/routing/proxy-routing';

describe('proxy routing helpers', () => {
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
      expect(categorizePath('/onboarding/profile').isProtectedPath).toBe(true);
    });

    it('keeps public routes public', () => {
      expect(categorizePath('/').isProtectedPath).toBe(false);
      expect(categorizePath('/pricing').isProtectedPath).toBe(false);
      expect(categorizePath('/tim').isProtectedPath).toBe(false);
    });

    it('recognizes auth entrypoints and callback aliases', () => {
      expect(categorizePath('/signin').isAuthPath).toBe(true);
      expect(categorizePath('/signup').isAuthPath).toBe(true);
      expect(categorizePath('/signin/sso-callback').isAuthCallbackPath).toBe(
        true
      );
      expect(categorizePath('/sign-up/sso-callback').isAuthCallbackPath).toBe(
        true
      );
      expect(categorizePath('/pricing').isAuthCallbackPath).toBe(false);
    });

    it('only adds nonce requirements to app and api surfaces', () => {
      expect(categorizePath('/api/stripe/checkout').needsNonce).toBe(true);
      expect(categorizePath('/app/dashboard').needsNonce).toBe(true);
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
});
