import { describe, expect, it } from 'vitest';

import {
  AGENTCOOKIE_PORT,
  API_KEY_ALLOWLIST,
  buildReceiveCommand,
  buildSendCommand,
  COOKIE_ALLOWLIST,
  COOKIE_BLOCKLIST,
  domainMatchesList,
  isApiKeyAllowed,
  isDomainAllowed,
  readStatus,
} from '../../hermes/lib/agentcookie.ts';

describe('agentcookie security policy', () => {
  // ── blocklist ──────────────────────────────────────────────────────────────

  it('blocks banking domains', () => {
    for (const domain of [
      'chase.com',
      'wellsfargo.com',
      'paypal.com',
      'stripe.com',
    ]) {
      expect(isDomainAllowed(domain), `${domain} should be blocked`).toBe(
        false
      );
    }
  });

  it('blocks healthcare domains', () => {
    for (const domain of ['mychart.com', 'aetna.com', 'kaiserpermanente.org']) {
      expect(isDomainAllowed(domain), `${domain} should be blocked`).toBe(
        false
      );
    }
  });

  it('blocks password manager domains', () => {
    for (const domain of ['1password.com', 'lastpass.com', 'bitwarden.com']) {
      expect(isDomainAllowed(domain), `${domain} should be blocked`).toBe(
        false
      );
    }
  });

  it('blocks cloud-root console domains', () => {
    for (const domain of [
      'console.aws.amazon.com',
      'console.cloud.google.com',
      'portal.azure.com',
    ]) {
      expect(isDomainAllowed(domain), `${domain} should be blocked`).toBe(
        false
      );
    }
  });

  it('blocks tax / government domains', () => {
    for (const domain of ['irs.gov', 'turbotax.com', 'ssa.gov']) {
      expect(isDomainAllowed(domain), `${domain} should be blocked`).toBe(
        false
      );
    }
  });

  // ── allowlist ──────────────────────────────────────────────────────────────

  it('allows Spotify analytics domains', () => {
    for (const domain of ['artists.spotify.com', 'analytics.spotify.com']) {
      expect(isDomainAllowed(domain), `${domain} should be allowed`).toBe(true);
    }
  });

  it('allows Apple Music analytics', () => {
    expect(isDomainAllowed('artists.apple.com')).toBe(true);
  });

  it('allows dev tooling domains', () => {
    for (const domain of [
      'github.com',
      'linear.app',
      'vercel.com',
      'sentry.io',
    ]) {
      expect(isDomainAllowed(domain), `${domain} should be allowed`).toBe(true);
    }
  });

  // ── subdomain matching ─────────────────────────────────────────────────────

  it('blocks subdomains of blocked root domains', () => {
    expect(domainMatchesList('app.chase.com', COOKIE_BLOCKLIST)).toBe(true);
    expect(domainMatchesList('secure.wellsfargo.com', COOKIE_BLOCKLIST)).toBe(
      true
    );
    expect(domainMatchesList('vault.1password.com', COOKIE_BLOCKLIST)).toBe(
      true
    );
  });

  it('allows subdomains of allowed root domains', () => {
    expect(domainMatchesList('dash.sentry.io', COOKIE_ALLOWLIST)).toBe(true);
    expect(domainMatchesList('team.linear.app', COOKIE_ALLOWLIST)).toBe(true);
  });

  it('rejects unknown domains (default-deny)', () => {
    for (const domain of ['example.com', 'randomsite.io', 'notlisted.org']) {
      expect(
        isDomainAllowed(domain),
        `${domain} should be blocked (default-deny)`
      ).toBe(false);
    }
  });

  // ── API key allowlist ──────────────────────────────────────────────────────

  it('allows expected Jovie workflow keys', () => {
    for (const key of [
      'OPENROUTER_API_KEY',
      'GITHUB_TOKEN',
      'LINEAR_API_KEY',
      'SPOTIFY_CLIENT_ID',
      'SPOTIFY_ACCESS_TOKEN',
      'APPLE_MUSIC_TOKEN',
    ]) {
      expect(isApiKeyAllowed(key), `${key} should be allowed`).toBe(true);
    }
  });

  it('rejects cloud-root and banking keys', () => {
    for (const key of [
      'AWS_SECRET_ACCESS_KEY',
      'AWS_ACCESS_KEY_ID',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'STRIPE_SECRET_KEY',
      'PLAID_SECRET',
    ]) {
      expect(isApiKeyAllowed(key), `${key} should be blocked`).toBe(false);
    }
  });

  // ── port constant ──────────────────────────────────────────────────────────

  it('uses a numeric port in a reasonable ephemeral range', () => {
    expect(typeof AGENTCOOKIE_PORT).toBe('number');
    expect(AGENTCOOKIE_PORT).toBeGreaterThan(1024);
    expect(AGENTCOOKIE_PORT).toBeLessThan(65_536);
  });

  // ── list non-overlap guarantee ─────────────────────────────────────────────

  it('has no domain in both blocklist and allowlist', () => {
    const overlapping = COOKIE_BLOCKLIST.filter(d =>
      COOKIE_ALLOWLIST.includes(d)
    );
    expect(overlapping).toEqual([]);
  });

  // ── command builders return null without required env ─────────────────────

  it('buildReceiveCommand returns null when AGENTCOOKIE_ENCRYPT_KEY is unset', () => {
    // Binary will also be absent in CI, so either condition triggers null.
    const cmd = buildReceiveCommand();
    expect(cmd).toBeNull();
  });

  it('buildSendCommand returns null when AGENTCOOKIE_AIR_IP is unset', () => {
    const cmd = buildSendCommand();
    expect(cmd).toBeNull();
  });

  // ── readStatus returns safe defaults when file is absent ──────────────────

  it('readStatus returns zero-state defaults when status file is absent', () => {
    // Status file will not exist in the test sandbox.
    const status = readStatus();
    expect(status.running).toBe(false);
    expect(status.lastSyncAt).toBeNull();
    expect(status.lastError).toBeNull();
    expect(status.cookieCount).toBeNull();
  });

  // ── blocklist/allowlist contain no duplicates ─────────────────────────────

  it('blocklist has no duplicates', () => {
    const unique = new Set(COOKIE_BLOCKLIST);
    expect(unique.size).toBe(COOKIE_BLOCKLIST.length);
  });

  it('allowlist has no duplicates', () => {
    const unique = new Set(COOKIE_ALLOWLIST);
    expect(unique.size).toBe(COOKIE_ALLOWLIST.length);
  });

  it('API key allowlist has no duplicates', () => {
    const unique = new Set(API_KEY_ALLOWLIST);
    expect(unique.size).toBe(API_KEY_ALLOWLIST.length);
  });
});
