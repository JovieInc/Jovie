import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

test.describe('New user completes onboarding and sees live profile', () => {
  const runFull = process.env.E2E_ONBOARDING_FULL === '1';

  test.beforeEach(async () => {
    if (!runFull) {
      test.skip();
    }
  });

  test('onboarding -> dashboard -> public profile', async ({ page }) => {
    test.setTimeout(60_000);

    await setupClerkTestingToken({ page });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        // @ts-ignore
        return window.Clerk && window.Clerk.isReady();
      },
      { timeout: 10_000 }
    );

    const uniqueSuffix = Date.now().toString(36);
    const testEmail = `playwright+${uniqueSuffix}@example.com`;
    const testPassword = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
    const displayName = `Playwright User ${uniqueSuffix}`;
    const handle = `e2e-live-${uniqueSuffix}`;

    await page.evaluate(
      async ({ email, password }) => {
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        try {
          const signIn = await clerk.signIn?.create({
            identifier: email,
            password,
          });

          if (signIn?.status === 'needs_first_factor') {
            await clerk.signIn?.attemptFirstFactor({
              strategy: 'password',
              password,
            });
          }

          await clerk.setActive({
            session:
              signIn?.createdSessionId ||
              clerk.client?.lastActiveSessionId ||
              null,
          });
        } catch {
          const signUp = await clerk.signUp?.create({
            emailAddress: email,
            password,
          });

          await clerk.setActive({
            session:
              signUp?.createdSessionId ||
              clerk.client?.lastActiveSessionId ||
              null,
          });
        }
      },
      { email: testEmail, password: testPassword }
    );

    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/onboarding', {
      timeout: 10_000,
      waitUntil: 'domcontentloaded',
    });

    await page.getByTestId('onboarding-name-input').fill(displayName);
    await page.getByTestId('onboarding-name-continue').click();

    const handleInput = page.getByTestId('onboarding-handle-input');
    await handleInput.fill(handle);
    await expect(handleInput).toHaveValue(handle);

    await expect(page.getByTestId('onboarding-handle-status-text')).toHaveText(
      /available/i,
      {
        timeout: 10_000,
      }
    );

    await page.getByTestId('onboarding-handle-continue').click();
    await expect(
      page.getByRole('heading', { name: /you're live/i })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('onboarding-go-dashboard').click();
    await page.waitForURL('**/app/dashboard/overview**', { timeout: 15_000 });

    const updatedName = `${displayName} Published`;
    await page.getByLabel('Display name').fill(updatedName);
    await page.getByRole('button', { name: 'Save & Publish' }).click();
    await page.waitForURL('**/app/dashboard/overview**', { timeout: 15_000 });
    await expect(page.getByLabel('Display name')).toHaveValue(updatedName);

    await page.goto(`/${handle}`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: new RegExp(updatedName, 'i') })
    ).toBeVisible({ timeout: 10_000 });
  });
});
