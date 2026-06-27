import { expect, test } from '@playwright/test';
import expected from '@/lib/auth/oauth-redirect-uris.expected.json';

/**
 * OAuth provider redirect-URI probe (@production-smoke).
 *
 * Catches the 2026-06-26 incident: production Google/Apple sign-in died with
 * `Error 400: redirect_uri_mismatch` because the Clerk FAPI host moved to
 * clerk.jov.ie (staging unification) but the Google OAuth client + Apple
 * Service ID consoles still only had the old proxy-path / meetjovie callbacks.
 * No existing test caught it: auth-public-ready.spec.ts only asserts the SSO
 * buttons RENDER — it never follows the redirect to Google/Apple.
 *
 * This probe does NOT click the in-app button (that couples to Clerk readiness
 * and the invisible bot-protection / Turnstile gate). Instead it hits the
 * Google + Apple authorize endpoints directly with the EXACT redirect_uri Clerk
 * hands them — `https://<fapi-host>/v1/oauth_callback` — and asserts the
 * provider ACCEPTS it (shows its sign-in / consent screen) rather than the
 * redirect_uri_mismatch error page. Deterministic, needs no credentials, and
 * tests the precise contract the consoles must satisfy.
 *
 * Source of truth for the URIs: apps/web/lib/auth/oauth-redirect-uris.expected.json
 * (kept honest by scripts/auth-redirect-uris.ts + fapi-host-snapshot.test.ts).
 */

test.use({ storageState: { cookies: [], origins: [] } });

// redirect_uri_mismatch surfaces differently per provider; match all the shapes.
const GOOGLE_REJECT =
  /redirect_uri_mismatch|Access blocked|request is invalid|Error 400/i;
const APPLE_REJECT =
  /invalid_request|invalid_redirect_uri|invalid web redirect|your request could not be completed/i;

/**
 * Pick the FAPI callback that matches the deployment under test. Probing
 * jov.ie must test clerk.jov.ie; staging.jov.ie must test clerk.staging.jov.ie,
 * because the two run different Clerk instances with different OAuth clients.
 */
function callbackForBaseUrl(): string {
  const base = process.env.BASE_URL ?? 'https://jov.ie';
  const instance = /staging\./i.test(base) ? 'staging' : 'prod';
  return `https://${expected.instances[instance].fapiHost}/v1/oauth_callback`;
}

test.describe('OAuth provider redirect URIs @production-smoke', () => {
  test.setTimeout(60_000);

  test('Google accepts the Clerk redirect_uri (no redirect_uri_mismatch)', async ({
    page,
  }) => {
    const redirectUri = callbackForBaseUrl();
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

  test('Apple accepts the Clerk return URL (no invalid_request)', async ({
    page,
  }) => {
    const redirectUri = callbackForBaseUrl();
    // Apple Sign In is only enabled on the prod instance (staging Apple is off).
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
