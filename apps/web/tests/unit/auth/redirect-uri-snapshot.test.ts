import { describe, expect, it } from 'vitest';
import expected from '@/lib/auth/oauth-redirect-uris.expected.json';

/**
 * OAuth redirect-URI snapshot guard (Clerk → Better Auth migration,
 * plan Phase 11).
 *
 * Replaces `fapi-host-snapshot.test.ts` (Clerk-era). Better Auth owns the
 * `/api/auth/callback/<provider>` route at `app/api/auth/[...all]/route.ts`
 * and hands Google/Apple the redirect_uri
 * `https://<appHost>/api/auth/callback/<provider>` directly — no FAPI proxy
 * host in the path. This guard locks the relationship between each
 * deployment's app host and the console registrations that MUST exist for
 * it, so a host change forces a console re-sync before shipping.
 *
 * The runtime safety net is `oauth-providers.spec.ts` (staging canary +
 * post-promote production-oauth-gate) plus the `GET /api/auth/ok` hard
 * probe added in plan Phase 11.
 */

const googleCallback = (appHost: string) =>
  `https://${appHost}/api/auth/callback/google`;
const appleCallback = (appHost: string) =>
  `https://${appHost}/api/auth/callback/apple`;

describe('OAuth redirect-URI snapshot', () => {
  it('every required Google redirect URI is derived from a known app host', () => {
    const knownHosts = new Set([
      ...Object.values(expected.instances).map(i => i.appHost),
      'localhost:3100',
    ]);
    for (const uri of expected.google.requiredRedirectUris) {
      const host = (() => {
        try {
          return new URL(uri).host;
        } catch {
          return null;
        }
      })();
      expect(
        host,
        `Google redirect URI not parseable / not derived from a known app host: ${uri}`
      ).not.toBeNull();
      expect(
        knownHosts,
        `Google redirect URI not derived from a known app host: ${uri}`
      ).toContain(host);
      expect(
        uri.endsWith('/api/auth/callback/google'),
        `Google redirect URI must end with /api/auth/callback/google: ${uri}`
      ).toBe(true);
    }
  });

  it('every required Apple return URL is derived from a known app host', () => {
    const knownHosts = new Set(
      Object.values(expected.instances).map(i => i.appHost)
    );
    for (const uri of expected.apple.requiredReturnUrls) {
      const host = (() => {
        try {
          return new URL(uri).host;
        } catch {
          return null;
        }
      })();
      expect(
        host,
        `Apple return URL not parseable / not derived from a known app host: ${uri}`
      ).not.toBeNull();
      expect(
        knownHosts,
        `Apple return URL not derived from a known deployment app host: ${uri}`
      ).toContain(host);
      expect(
        uri.endsWith('/api/auth/callback/apple'),
        `Apple return URL must end with /api/auth/callback/apple: ${uri}`
      ).toBe(true);
    }
  });

  it('the production callbacks are registered in BOTH consoles', () => {
    const prodHost = expected.instances.prod.appHost;
    expect(
      expected.google.requiredRedirectUris,
      'prod Google callback missing — re-run /auth-console-sync'
    ).toContain(googleCallback(prodHost));
    expect(
      expected.apple.requiredReturnUrls,
      'prod Apple callback missing — re-run /auth-console-sync'
    ).toContain(appleCallback(prodHost));
  });

  it('Apple domains include the host of every required return URL', () => {
    for (const uri of expected.apple.requiredReturnUrls) {
      const host = new URL(uri).host;
      expect(
        expected.apple.requiredDomains,
        `Apple domain list missing ${host} for return URL ${uri}`
      ).toContain(host);
    }
  });

  it('every required Google JS origin (One Tap) is derived from a known app host', () => {
    const knownHosts = new Set([
      ...Object.values(expected.instances).map(i => i.appHost),
      'localhost:3100',
    ]);
    for (const origin of expected.google.requiredJsOrigins) {
      const url = new URL(origin);
      expect(
        knownHosts,
        `Google JS origin host not a known app host: ${origin}`
      ).toContain(url.host);
      expect(
        url.protocol === 'http:' || url.protocol === 'https:',
        `Google JS origin must be http(s): ${origin}`
      ).toBe(true);
    }
  });

  it('locks the known app hosts so a change forces a console re-sync (shame-on-me guard)', () => {
    // If this assertion fails, a deployment app host changed. Update the
    // snapshot JSON AND re-run the /auth-console-sync skill to register the
    // new callbacks in Google + Apple, or production sign-in breaks with
    // redirect_uri_mismatch.
    expect(expected.instances.prod.appHost).toBe('jov.ie');
    expect(expected.instances.staging.appHost).toBe('staging.jov.ie');
  });
});
