import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { hasAdminCredentials } from '../helpers/auth';
import { signInAsAdmin } from './utils/admin-test-utils';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

/**
 * Admin passkey step-up unlock flow (JOV-6892).
 *
 * The Ovie shell locks behind a passkey step-up. The reported bug: clicking
 * Unlock entered "Waiting for passkey…" forever with no ceremony, and a
 * device-only passkey silently looped back to the lock. These specs run the
 * real client flow end-to-end with the WebAuthn network/authenticator layer
 * stubbed (the dev-bypass session cannot complete a real ceremony), covering:
 *
 * 1. Unlock actually invokes the browser passkey ceremony and the
 *    verify-authentication + step-up-status round trip, then reloads.
 * 2. A sign-in without an admin-factor passkey fails loudly instead of
 *    looping back to "admin access required".
 * 3. A ceremony whose prompt never appears resolves to an actionable error
 *    with retry, not an indefinite wait.
 * 4. A canceled enrollment (the 1Password cancel regression) never reaches
 *    the sign-in prompt and offers an immediate retry.
 *
 * @admin @critical
 */

const PASSKEY_API = '**/api/auth/passkey';
const STEP_UP_STATUS_API = '**/api/admin/step-up-status';

const AUTHENTICATE_OPTIONS = {
  challenge: 'ZmFrZS1jaGFsbGVuZ2U',
  timeout: 60_000,
  rpId: 'localhost',
  allowCredentials: [],
  userVerification: 'preferred',
};

/**
 * Fake WebAuthn assertion; simplewebauthn's startAuthentication only reads
 * these fields to base64url-encode them before POSTing verify-authentication.
 */
function fakeAssertionScript(mode: 'resolve' | 'hang') {
  return `
    window.__passkeyGetCalled = false;
    window.PublicKeyCredential = function PublicKeyCredential() {};
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
      function () { return Promise.resolve(true); };
    navigator.credentials = {
      create: function () { return Promise.reject(new Error('not stubbed')); },
      get: function () {
        window.__passkeyGetCalled = true;
        ${
          mode === 'hang'
            ? 'return new Promise(function () {});'
            : `var buf = new Uint8Array([1, 2, 3]).buffer;
               return Promise.resolve({
                 id: 'cred-1',
                 rawId: buf,
                 type: 'public-key',
                 authenticatorAttachment: 'platform',
                 response: {
                   authenticatorData: buf,
                   clientDataJSON: buf,
                   signature: buf,
                   userHandle: buf,
                 },
                 getClientExtensionResults: function () { return {}; },
               });`
        }
      },
    };
  `;
}

const REGISTER_OPTIONS = {
  challenge: 'ZmFrZS1jaGFsbGVuZ2U',
  rp: { name: 'Jovie', id: 'localhost' },
  user: { id: 'dXNlcg', name: 'admin@jovie.test', displayName: 'Admin' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 60_000,
  attestation: 'none',
  userVerification: 'preferred',
};

/**
 * Simulates the founder canceling the passkey setup inside the authenticator
 * (e.g. dismissing the 1Password sheet): navigator.credentials.create rejects
 * with NotAllowedError, which SimpleWebAuthn surfaces as a passthrough error —
 * no credential is created and verify-registration is never called.
 */
const CANCELLED_REGISTRATION_SCRIPT = `
  window.PublicKeyCredential = function PublicKeyCredential() {};
  window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
    function () { return Promise.resolve(true); };
  navigator.credentials = {
    create: function () {
      return Promise.reject(
        new DOMException(
          'The operation either timed out or was not allowed.',
          'NotAllowedError'
        )
      );
    },
    get: function () { return Promise.reject(new Error('not stubbed')); },
  };
`;

async function mockPasskeyApi(
  page: import('@playwright/test').Page,
  {
    unlocked,
    passkeys = [{ id: 'pk_1', name: 'Ovie' }],
  }: {
    unlocked: boolean;
    passkeys?: { id: string; name: string }[];
  }
) {
  await page.route(`${PASSKEY_API}/list-user-passkeys`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(passkeys),
    })
  );
  await page.route(`${PASSKEY_API}/generate-register-options`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(REGISTER_OPTIONS),
    })
  );
  await page.route(`${PASSKEY_API}/verify-registration`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'pk_new', name: 'Ovie' }),
    })
  );
  await page.route(`${PASSKEY_API}/generate-authenticate-options`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AUTHENTICATE_OPTIONS),
    })
  );
  await page.route(`${PASSKEY_API}/verify-authentication`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: { id: 'sess_step_up' }, user: {} }),
    })
  );
  await page.route(STEP_UP_STATUS_API, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ unlocked }),
    })
  );
}

test.describe('Admin passkey step-up (JOV-6892)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'Admin credentials not configured');
    await signInAsAdmin(page);
  });

  test('unlock invokes the passkey ceremony and completes the step-up round trip', async ({
    page,
  }) => {
    await page.addInitScript(fakeAssertionScript('resolve'));
    await mockPasskeyApi(page, { unlocked: true });

    await smokeNavigateWithRetry(page, APP_ROUTES.HUD, { timeout: 60_000 });
    const unlock = page.getByRole('button', { name: 'Unlock to continue' });
    await expect(unlock).toBeVisible();

    const verifyRequest = page.waitForRequest(
      `${PASSKEY_API}/verify-authentication`
    );
    const statusRequest = page.waitForRequest(STEP_UP_STATUS_API);
    await unlock.click();

    // verify-authentication only fires after navigator.credentials.get
    // resolves, so its request proves the ceremony actually ran; the status
    // check then confirms the step-up before the client reloads.
    await verifyRequest;
    await statusRequest;
    await page.waitForEvent('framenavigated');
  });

  test('a sign-in without an admin-factor passkey fails loudly instead of looping', async ({
    page,
  }) => {
    await page.addInitScript(fakeAssertionScript('resolve'));
    await mockPasskeyApi(page, { unlocked: false });

    await smokeNavigateWithRetry(page, APP_ROUTES.HUD, { timeout: 60_000 });
    const unlock = page.getByRole('button', { name: 'Unlock to continue' });
    await expect(unlock).toBeVisible();
    await unlock.click();

    await expect(page.getByRole('alert')).toContainText(
      'cannot unlock admin access'
    );
    // Recovery is available — the user can retry instead of looping.
    await expect(
      page.getByRole('button', { name: 'Unlock to continue' })
    ).toBeEnabled();
  });

  test('a canceled enrollment never reaches the sign-in prompt and can retry', async ({
    page,
  }) => {
    await page.addInitScript(CANCELLED_REGISTRATION_SCRIPT);
    await mockPasskeyApi(page, { unlocked: true, passkeys: [] });

    await smokeNavigateWithRetry(page, APP_ROUTES.HUD, { timeout: 60_000 });
    const unlock = page.getByRole('button', { name: 'Unlock to continue' });
    await expect(unlock).toBeVisible();

    let authenticateRequested = false;
    page.on('request', request => {
      if (
        request
          .url()
          .includes('/api/auth/passkey/generate-authenticate-options')
      )
        authenticateRequested = true;
    });
    await unlock.click();

    // Canceled setup must fail as a recoverable enrollment state — no
    // phantom credential, no fall-through into the authenticate ceremony.
    await expect(page.getByRole('alert')).toContainText('no passkey was saved');
    await expect
      .poll(() => authenticateRequested, { timeout: 5_000 })
      .toBe(false);
    await expect(
      page.getByRole('button', { name: 'Unlock to continue' })
    ).toBeEnabled();
  });

  test('a passkey prompt that never appears becomes an actionable error', async ({
    page,
  }) => {
    await page.addInitScript(`
      ${fakeAssertionScript('hang')}
      window.__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__ = 400;
    `);
    await mockPasskeyApi(page, { unlocked: true });

    await smokeNavigateWithRetry(page, APP_ROUTES.HUD, { timeout: 60_000 });
    const unlock = page.getByRole('button', { name: 'Unlock to continue' });
    await expect(unlock).toBeVisible();
    await unlock.click();

    await expect(page.getByRole('alert')).toContainText(
      'passkey prompt did not appear'
    );
    await expect(
      page.getByRole('button', { name: 'Unlock to continue' })
    ).toBeEnabled();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as { __passkeyGetCalled?: boolean }).__passkeyGetCalled
        )
      )
      .toBe(true);
  });
});
