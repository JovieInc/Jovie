/**
 * Auth modal E2E tests — JOV-2037
 *
 * Covers the compact AuthModal component that opens via ?auth=signin / ?auth=signup
 * URL parameters on marketing surfaces. Tests use anonymous context (no stored auth).
 *
 * Run: pnpm run test:web:e2e -- tests/e2e/auth-modal.spec.ts
 */
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

// All modal tests use an anonymous session (no stored auth cookies)
test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_MODAL_TIMEOUT = 20_000;

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

/**
 * Navigate to a marketing page with an ?auth= URL param to trigger the modal.
 * We use the homepage since it renders AuthModal when the URL param is present.
 */
async function openModalViaUrl(
  page: import('@playwright/test').Page,
  mode: 'signin' | 'signup'
) {
  await blockAnalytics(page);

  if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
    await setupClerkTestingToken({ page }).catch((err: unknown) => {
      console.warn(
        '[auth-modal.spec] setupClerkTestingToken skipped:',
        err instanceof Error ? err.message : String(err)
      );
    });
  }

  await page.goto(`/?auth=${mode}`, { waitUntil: 'load', timeout: 60_000 });
}

/**
 * Wait for the AuthModal dialog to appear in the DOM.
 */
async function waitForModal(page: import('@playwright/test').Page) {
  await expect(page.getByRole('dialog')).toBeVisible({
    timeout: AUTH_MODAL_TIMEOUT,
  });
}

// ---------------------------------------------------------------------------
// Modal opening via URL param
// ---------------------------------------------------------------------------
test.describe('AuthModal — URL param triggers', () => {
  test('opens in sign-in mode via ?auth=signin', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Mode toggle footer should indicate we are in sign-in mode
    await expect(
      dialog.getByRole('button', { name: /need an account\? sign up/i })
    ).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });
  });

  test('opens in sign-up mode via ?auth=signup', async ({ page }) => {
    await openModalViaUrl(page, 'signup');
    await waitForModal(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Mode toggle footer should indicate we are in sign-up mode
    await expect(
      dialog.getByRole('button', { name: /have an account\? sign in/i })
    ).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });
  });
});

// ---------------------------------------------------------------------------
// Modal close behaviours
// ---------------------------------------------------------------------------
test.describe('AuthModal — close interactions', () => {
  test('Escape key dismisses the modal', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('close button dismisses the modal', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    // The X close button is the last button[aria-label="Close"] — after the backdrop button
    await page.locator('button[aria-label="Close"]').last().click();

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('backdrop click dismisses the modal', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    // Click on the backdrop element (absolute positioned button behind modal)
    // The backdrop button is the first close button (inset-0, behind the card)
    const backdrop = page
      .locator('.fixed.inset-0 > button[aria-label="Close"]')
      .first();
    await backdrop.click({ force: true });

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('closing the modal removes the auth URL param', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    // Verify the param is present
    expect(page.url()).toContain('auth=signin');

    // Dismiss via Escape
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 5_000,
    });

    // URL param should be cleaned up
    await expect(page).toHaveURL(url => !url.searchParams.has('auth'), {
      timeout: 5_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Mode toggle
// ---------------------------------------------------------------------------
test.describe('AuthModal — mode toggle', () => {
  test('mode toggle switches from sign-in to sign-up', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    const dialog = page.getByRole('dialog');

    // Starts in sign-in mode
    const toggleBtn = dialog.getByRole('button', {
      name: /need an account\? sign up/i,
    });
    await expect(toggleBtn).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });

    await toggleBtn.click();

    // Now in sign-up mode
    await expect(
      dialog.getByRole('button', { name: /have an account\? sign in/i })
    ).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });
  });

  test('mode toggle switches from sign-up to sign-in', async ({ page }) => {
    await openModalViaUrl(page, 'signup');
    await waitForModal(page);

    const dialog = page.getByRole('dialog');

    const toggleBtn = dialog.getByRole('button', {
      name: /have an account\? sign in/i,
    });
    await expect(toggleBtn).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });

    await toggleBtn.click();

    await expect(
      dialog.getByRole('button', { name: /need an account\? sign up/i })
    ).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });
  });

  test('modal does not unmount during mode toggle', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Toggle mode
    await dialog
      .getByRole('button', { name: /need an account\? sign up/i })
      .click();

    // Dialog still visible (portal not removed)
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------
test.describe('AuthModal — focus trap', () => {
  test('Tab focus stays within modal', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    // Tab through elements multiple times — focus must remain inside the dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
    }

    // Active element should still be inside the dialog container
    const focusedInModal = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      return dialog.contains(document.activeElement);
    });

    // Note: focus trap covers the fixed overlay div which contains the dialog role.
    // The fixed container is the parent of the role=dialog element.
    const focusedInOverlay = await page.evaluate(() => {
      const fixed = document.querySelector('.fixed.inset-0.z-\\[100\\]');
      if (!fixed) return false;
      return fixed.contains(document.activeElement);
    });

    expect(focusedInModal || focusedInOverlay).toBe(true);
  });

  test('Shift+Tab backwards stays within modal', async ({ page }) => {
    await openModalViaUrl(page, 'signin');
    await waitForModal(page);

    await expect(page.getByRole('dialog')).toBeVisible({
      timeout: AUTH_MODAL_TIMEOUT,
    });

    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
    }

    const focusedInOverlay = await page.evaluate(() => {
      const fixed = document.querySelector('.fixed.inset-0.z-\\[100\\]');
      if (!fixed) return false;
      return fixed.contains(document.activeElement);
    });

    expect(focusedInOverlay).toBe(true);
  });
});
