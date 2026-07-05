import { describe, expect, it } from 'vitest';

import {
  COOKIE_ALLOWLIST,
  COOKIE_BLOCKLIST,
  isAllowed,
  isBlocked,
  partitionDomains,
} from '../agentcookie';

describe('agentcookie blocklist / allowlist', () => {
  // -------------------------------------------------------------------
  // isBlocked
  // -------------------------------------------------------------------
  describe('isBlocked', () => {
    it('blocks exact blocklisted domains', () => {
      for (const domain of ['stripe.com', 'github.com', 'chase.com']) {
        expect(isBlocked(domain), `expected ${domain} to be blocked`).toBe(
          true
        );
      }
    });

    it('blocks subdomains of blocklisted domains', () => {
      expect(isBlocked('dashboard.stripe.com')).toBe(true);
      expect(isBlocked('api.github.com')).toBe(true);
      expect(isBlocked('sub.bankofamerica.com')).toBe(true);
    });

    it('does not block unrelated domains', () => {
      expect(isBlocked('artists.spotify.com')).toBe(false);
      expect(isBlocked('linear.app')).toBe(false);
      expect(isBlocked('posthog.com')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isBlocked('STRIPE.COM')).toBe(true);
      expect(isBlocked('GitHub.com')).toBe(true);
    });

    it('strips leading dot before matching', () => {
      expect(isBlocked('.stripe.com')).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // isAllowed
  // -------------------------------------------------------------------
  describe('isAllowed', () => {
    it('allows exact allowlisted domains', () => {
      for (const domain of ['artists.spotify.com', 'linear.app']) {
        expect(isAllowed(domain), `expected ${domain} to be allowed`).toBe(
          true
        );
      }
    });

    it('allows subdomains of allowlisted domains', () => {
      // analytics.spotify.com is in the allowlist itself
      expect(isAllowed('analytics.spotify.com')).toBe(true);
    });

    it('does not allow arbitrary domains', () => {
      expect(isAllowed('example.com')).toBe(false);
      expect(isAllowed('twitter.com')).toBe(false);
      expect(isAllowed('youtube.com')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isAllowed('Artists.Spotify.COM')).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // partitionDomains
  // -------------------------------------------------------------------
  describe('partitionDomains', () => {
    it('partitions a mixed list correctly', () => {
      const candidates = [
        'artists.spotify.com', // allowed
        'linear.app', // allowed
        'stripe.com', // blocked
        'github.com', // blocked
        'example.com', // not in allowlist
        'twitter.com', // not in allowlist
      ];

      const manifest = partitionDomains(candidates);

      expect(manifest.eligible).toEqual(['artists.spotify.com', 'linear.app']);
      expect(manifest.blocked).toEqual(['stripe.com', 'github.com']);
      expect(manifest.notInAllowlist).toEqual(['example.com', 'twitter.com']);
    });

    it('returns empty arrays for an empty input', () => {
      const manifest = partitionDomains([]);
      expect(manifest.eligible).toHaveLength(0);
      expect(manifest.blocked).toHaveLength(0);
      expect(manifest.notInAllowlist).toHaveLength(0);
    });

    it('blocked takes precedence over not-in-allowlist', () => {
      // A domain that is both blocked AND not in the allowlist should appear
      // only in blocked (blocked check runs first).
      const manifest = partitionDomains(['stripe.com']);
      expect(manifest.blocked).toContain('stripe.com');
      expect(manifest.notInAllowlist).not.toContain('stripe.com');
      expect(manifest.eligible).not.toContain('stripe.com');
    });
  });

  // -------------------------------------------------------------------
  // Invariant: nothing in the allowlist should be blocked
  // -------------------------------------------------------------------
  describe('allowlist / blocklist mutual exclusivity', () => {
    it('has no domain in both lists', () => {
      for (const domain of COOKIE_ALLOWLIST) {
        expect(
          isBlocked(domain),
          `${domain} is in COOKIE_ALLOWLIST but also matches COOKIE_BLOCKLIST`
        ).toBe(false);
      }
    });

    it('COOKIE_BLOCKLIST contains high-value financial and identity domains', () => {
      expect(COOKIE_BLOCKLIST).toContain('stripe.com');
      expect(COOKIE_BLOCKLIST).toContain('github.com');
      expect(COOKIE_BLOCKLIST).toContain('1password.com');
      expect(COOKIE_BLOCKLIST).toContain('aws.amazon.com');
    });

    it('COOKIE_ALLOWLIST contains the primary analytics targets', () => {
      expect(COOKIE_ALLOWLIST).toContain('artists.spotify.com');
      expect(COOKIE_ALLOWLIST).toContain('music.apple.com');
    });
  });
});
