import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, test } from '@playwright/test';
import { createOrReuseTestUserSession } from '../helpers/clerk-auth';

const runFull = process.env.E2E_ONBOARDING_FULL === '1';

const requiredEnvVars = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};

async function ensureClerkReady(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const clerk = (window as { Clerk?: { isReady?: () => boolean } }).Clerk;
      return Boolean(clerk?.isReady && clerk.isReady());
    },
    { timeout: 10_000 }
  );
}

async function bootstrapFreshUser(page: Page) {
  const email = `onboarding-complete+${Date.now().toString(36)}@example.com`;

  await createOrReuseTestUserSession(page, email);
  await page.waitForFunction(
    () => {
      const clerk = (window as { Clerk?: { user?: { id?: string } } }).Clerk;
      return Boolean(clerk?.user?.id);
    },
    { timeout: 10_000 }
  );

  await page.goto('/app/dashboard', {
    waitUntil: 'domcontentloaded',
  });

  await page.waitForURL('**/onboarding**', {
    timeout: 15_000,
    waitUntil: 'domcontentloaded',
  });
}

test.describe
  .serial('Onboarding complete flow', () => {
    test.beforeEach(async ({ page }) => {
      if (!runFull) {
        test.skip(
          true,
          'Full onboarding E2E runs only when E2E_ONBOARDING_FULL=1'
        );
      }

      for (const [key, value] of Object.entries(requiredEnvVars)) {
        if (!value || value.includes('dummy')) {
          test.skip(true, `Skipping: ${key} is not configured for real auth`);
        }
      }

      await setupClerkTestingToken({ page });
      await ensureClerkReady(page);
    });

    test('new user completes onboarding and adds first dashboard link', async ({
      page,
    }) => {
      test.setTimeout(90_000);

      const uniqueHandle = `journey-${Date.now().toString(36)}`;

      await bootstrapFreshUser(page);

      // Handle step
      const handleInput = page.getByLabel('Enter your desired handle');
      await expect(handleInput).toBeVisible({ timeout: 10_000 });
      await handleInput.fill(uniqueHandle);

      await expect(page.getByText('Available')).toBeVisible({
        timeout: 15_000,
      });

      const handleContinue = page.getByRole('button', { name: 'Continue' });
      await expect(handleContinue).toBeEnabled({ timeout: 5_000 });
      await Promise.all([
        page
          .getByRole('heading', { name: "You're live." })
          .waitFor({ state: 'visible', timeout: 20_000 }),
        handleContinue.click(),
      ]);

      // Completion step → Dashboard
      const goToDashboard = page.getByRole('button', {
        name: 'Go to Dashboard',
      });
      await expect(goToDashboard).toBeVisible({ timeout: 10_000 });
      await Promise.all([
        page.waitForURL('**/app/dashboard/**', {
          timeout: 15_000,
          waitUntil: 'domcontentloaded',
        }),
        goToDashboard.click(),
      ]);

      // Navigate to Profile editor to add the first link
      await page.goto('/app/dashboard/profile', {
        waitUntil: 'domcontentloaded',
      });

      const linksManager = page.getByTestId('grouped-links-manager');
      await expect(linksManager).toBeVisible({ timeout: 15_000 });

      const linkInput = page.getByPlaceholder(/Paste any link/i);
      await expect(linkInput).toBeVisible({ timeout: 10_000 });

      const firstLinkUrl = `https://instagram.com/${uniqueHandle}`;
      await linkInput.fill(firstLinkUrl);
      await linkInput.press('Enter');

      const firstLinkPill = page
        .locator('[data-testid^="link-pill-"]')
        .filter({ hasText: /Instagram/i })
        .first();
      await expect(firstLinkPill).toBeVisible({ timeout: 20_000 });

      await expect(
        page.getByText('Add your first link', { exact: false })
      ).not.toBeVisible();
    });

    test('taken handle blocks onboarding completion', async ({ page }) => {
      test.setTimeout(60_000);

      await bootstrapFreshUser(page);

      const nameInput = page.getByLabel('Your full name');
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill('Handle Collision Tester');

      await page.getByRole('button', { name: 'Continue' }).click();

      const handleInput = page.getByLabel('Enter your desired handle');
      await expect(handleInput).toBeVisible({ timeout: 10_000 });

      const takenHandle = process.env.E2E_TAKEN_HANDLE || 'dualipa';

      const checkResponse = await page.request.get(
        `/api/handle/check?handle=${takenHandle}`
      );
      if (!checkResponse.ok) {
        test.skip(true, 'Handle availability endpoint is not reachable');
      }

      const checkData = (await checkResponse.json()) as { available?: boolean };
      if (checkData.available) {
        test.skip(true, `Handle ${takenHandle} is unexpectedly available`);
      }

      await handleInput.fill(takenHandle);

      await expect(page.getByText('Not available')).toBeVisible({
        timeout: 10_000,
      });

      const handleContinue = page.getByRole('button', { name: 'Continue' });
      await expect(handleContinue).toBeDisabled();
      await expect(
        page.getByRole('heading', { name: 'Claim your handle' })
      ).toBeVisible();
    });
  });
