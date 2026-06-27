import { describe, expect, it } from 'vitest';
import { decodeFapiHostFromPublishableKey } from '@/lib/auth/decode-fapi-host';
import expected from '@/lib/auth/oauth-redirect-uris.expected.json';

/**
 * FAPI-host drift guard.
 *
 * The 2026-06-26 incident: a Clerk "staging unification" moved the production
 * FAPI host to clerk.jov.ie, but the Google/Apple consoles still pointed at the
 * old callbacks — production sign-in died with redirect_uri_mismatch and no test
 * caught it. This guard locks the relationship between each Clerk instance's
 * FAPI host and the console redirect URIs that MUST be registered for it.
 *
 * If someone changes a FAPI host (another unification, a key rotation, a new
 * instance), this test fails and the message tells them to re-sync the consoles
 * via the /auth-console-sync skill BEFORE shipping. The runtime safety net is
 * the OAuth probe (oauth-providers.spec.ts) + the post-promote production gate.
 */

const callback = (fapiHost: string) => `https://${fapiHost}/v1/oauth_callback`;

describe('OAuth redirect-URI snapshot', () => {
  it('every required Google redirect URI is derived from a known FAPI host', () => {
    const known = new Set(
      Object.values(expected.instances).map(i => callback(i.fapiHost))
    );
    for (const uri of expected.google.requiredRedirectUris) {
      expect(
        known,
        `Google redirect URI not derived from a Clerk FAPI host: ${uri}`
      ).toContain(uri);
    }
  });

  it('every required Apple return URL is derived from a known FAPI host', () => {
    const known = new Set(
      Object.values(expected.instances).map(i => callback(i.fapiHost))
    );
    for (const uri of expected.apple.requiredReturnUrls) {
      expect(
        known,
        `Apple return URL not derived from a Clerk FAPI host: ${uri}`
      ).toContain(uri);
    }
  });

  it('the production callback is registered in BOTH consoles', () => {
    const prodCallback = callback(expected.instances.prod.fapiHost);
    expect(
      expected.google.requiredRedirectUris,
      'prod callback missing from Google client — re-run /auth-console-sync'
    ).toContain(prodCallback);
    expect(
      expected.apple.requiredReturnUrls,
      'prod callback missing from Apple Service ID — re-run /auth-console-sync'
    ).toContain(prodCallback);
  });

  it('Apple domains include the bare FAPI host of every required return URL', () => {
    for (const uri of expected.apple.requiredReturnUrls) {
      const host = new URL(uri).host;
      expect(
        expected.apple.requiredDomains,
        `Apple domain list missing ${host} for return URL ${uri}`
      ).toContain(host);
    }
  });

  it('locks the known FAPI hosts so a change forces a console re-sync (shame-on-me guard)', () => {
    // If this assertion fails, a Clerk instance's FAPI host changed. Update the
    // snapshot JSON AND re-run /auth-console-sync to register the new callbacks
    // in Google + Apple, or production sign-in breaks with redirect_uri_mismatch.
    expect(expected.instances.prod.fapiHost).toBe('clerk.jov.ie');
    expect(expected.instances.staging.fapiHost).toBe('clerk.staging.jov.ie');
  });

  it('the live publishable key (when present) decodes to a known FAPI host', () => {
    // In build/deploy lanes NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set; in plain
    // unit runs it may be a dev key. Either way, if it decodes, the host must be
    // one we have registered consoles for — catches a prod key swap to an
    // unregistered FAPI host before it ships.
    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const host = decodeFapiHostFromPublishableKey(pk);
    if (!host || pk?.startsWith('pk_test_')) {
      // dev/test key or no key — nothing to assert against the prod snapshot.
      return;
    }
    const knownHosts = Object.values(expected.instances).map(i => i.fapiHost);
    expect(
      knownHosts,
      `Live publishable key decodes to unregistered FAPI host "${host}". ` +
        'Update oauth-redirect-uris.expected.json and re-run /auth-console-sync.'
    ).toContain(host);
  });
});
