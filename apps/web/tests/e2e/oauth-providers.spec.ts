import { expect, test } from '@playwright/test';
import expected from '@/lib/auth/oauth-redirect-uris.expected.json';

/**
 * OAuth provider redirect-URI probe (@production-smoke).
 *
 * Catches the 2026-06-26 incident class: production Google/Apple sign-in
 * died with `Error 400: redirect_uri_mismatch` because the console
 * registrations drifted from the OAuth redirect_uri the app hands them.
 * No existing test caught it: auth-public-ready.spec.ts only asserts the
 * SSO buttons RENDER — it never follows the redirect to Google/Apple.
 *
 * This probe does NOT click the in-app button (that couples to Better
 * Auth handler readiness and invisible bot-protection). Instead it hits
 * the Google + Apple authorize endpoints directly with the EXACT
 * redirect_uri Better Auth hands them —
 * `https://<appHost>/api/auth/callback/<provider>` — and asserts the
 * provider ACCEPTS it (shows its sign-in / consent screen) rather than
 * the redirect_uri_mismatch error page. Deterministic, needs no
 * credentials, and tests the precise contract the consoles must satisfy.
 *
 * Source of truth for the URIs: apps/web/lib/auth/oauth-redirect-uris.expected.json
 * (kept honest by scripts/auth-redirect-uris.ts +
 * redirect-uri-snapshot.test.ts + /auth-console-sync skill).
 *
 * Plan Phase 11 (Clerk → Better Auth migration): the callback changed from
 * Clerk's `https://<fapi-host>/v1/oauth_callback` to Better Auth's
 * `https://<appHost>/api/auth/callback/<provider>`. Plus a new hard probe
 * `GET /api/auth/ok` (ci.yml production-oauth-gate +
 * canary-health-gate.yml) covers the handler-reachable case.
 */

test.use({ storageState: { cookies: [], origins: [] } });

// redirect_uri_mismatch surfaces differently per provider; match all the shapes.
const GOOGLE_REJECT =
  /redirect_uri_mismatch|Access blocked|request is invalid|Error 400/i;
const APPLE_REJECT =
  /invalid_request|invalid_redirect_uri|invalid web redirect|your request could not be completed/i;

/**
 * Pick the OAuth callback URI that matches the deployment under test.
 * Probing jov.ie must test jov.ie's callback; staging.jov.ie must test
 * staging.jov.ie's callback, because the two run different app hosts
 * registered against the same Google OAuth client + Apple Service ID.
 */
function callbackForBaseUrl(provider: 'google' | 'apple'): string {
  const base = process.env.BASE_URL ?? 'https://jov.ie';
  const instance = /staging\./i.test(base) ? 'staging' : 'prod';
  const appHost = expected.instances[instance].appHost;
  return `https://${appHost}/api/auth/callback/${provider}`;
}

test.describe('OAuth provider redirect URIs @production-smoke', () => {
  test.setTimeout(60_000);

  test('Google accepts the Better Auth redirect_uri (no redirect_uri_mismatch)', async ({
    page,
  }) => {
    const redirectUri = callbackForBaseUrl('google');
    // Only probe Google if this redirect_uri is in the required set for the env.
    test.skip(
      !expected.google.requiredRedirectUris.includes(redirectUri),
      `Google not expected to allow ${redirectUri}`
    );

    const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorize.searchParams.set('client_id', expected.google.clientId);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'openid email profile');
    authorize.searchParams.set('state', 'oauth-redirect-probe');

    await page.goto(authorize.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    const body = await page.locator('body').innerText();
    // HARD GATE (drives the post-promote auto-rollback): fail ONLY on a real
    // provider rejection of our redirect_uri, never on an inconclusive page.
    expect(
      body,
      `Google rejected redirect_uri ${redirectUri} — it is NOT registered in OAuth client ${expected.google.clientId}. Re-run /auth-console-sync.`
    ).not.toMatch(GOOGLE_REJECT);

    // Soft signal: Google should show its sign-in surface for "Jovie". A CI
    // datacenter IP can get a "couldn't sign you in / browser not secure" page;
    // that is NOT a redirect_uri_mismatch, so we warn instead of failing (a
    // spurious failure here would auto-roll-back a healthy production deploy).
    if (!/jovie|sign in|choose an account|email/i.test(body)) {
      test.info().annotations.push({
        type: 'warning',
        description: `Google reached without redirect_uri_mismatch but no recognizable sign-in surface (likely datacenter-IP gating). Body: ${body.slice(0, 200)}`,
      });
    }
  });

  test('Apple accepts the Better Auth return URL (no invalid_request)', async ({
    page,
  }) => {
    const redirectUri = callbackForBaseUrl('apple');
    // Apple Sign In is only enabled on prod (staging Apple is off).
    test.skip(
      !expected.apple.requiredReturnUrls.includes(redirectUri),
      `Apple not expected to allow ${redirectUri}`
    );

    const authorize = new URL('https://appleid.apple.com/auth/authorize');
    authorize.searchParams.set('client_id', expected.apple.serviceId);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'name email');
    authorize.searchParams.set('response_mode', 'form_post');
    authorize.searchParams.set('state', 'oauth-redirect-probe');

    await page.goto(authorize.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    const body = await page.locator('body').innerText();
    // HARD GATE: fail ONLY on a real Apple rejection of our return URL.
    expect(
      body,
      `Apple rejected return URL ${redirectUri} — it is NOT registered on Service ID ${expected.apple.serviceId}. Re-run /auth-console-sync.`
    ).not.toMatch(APPLE_REJECT);

    // Soft signal: Apple should show its sign-in surface.
    if (!/apple|sign in|continue/i.test(body)) {
      test.info().annotations.push({
        type: 'warning',
        description: `Apple reached without an invalid_request error but no recognizable sign-in surface. Body: ${body.slice(0, 200)}`,
      });
    }
  });
});
