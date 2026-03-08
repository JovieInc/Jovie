import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { createOrReuseTestUserSession } from '../helpers/clerk-auth';

async function interceptTrackingCalls(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

async function bootstrapNewSession(page: import('@playwright/test').Page) {
  await setupClerkTestingToken({ page });

  await page.goto('/signin', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const loaded = await page
    .waitForFunction(
      () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      {
        timeout: 60_000,
      }
    )
    .then(() => true)
    .catch(() => false);

  if (!loaded) {
    throw new Error('Clerk JS failed to load from CDN');
  }

  const email = `golden-signup+clerk_test+${Date.now().toString(36)}@example.com`;
  await createOrReuseTestUserSession(page, email);

  const authed = await page
    .waitForFunction(
      () =>
        !!(window as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id,
      {
        timeout: 15_000,
      }
    )
    .then(() => true)
    .catch(() => false);

  if (!authed) {
    throw new Error('Clerk user session not established after sign-up');
  }

  return email;
}

async function completeHandleStep(
  page: import('@playwright/test').Page
): Promise<string> {
  const handleInput = page.getByLabel('Enter your desired handle');
  await expect(handleInput).toBeVisible({ timeout: 20_000 });

  const uniqueHandle = `gp-${Date.now().toString(36)}`;
  await handleInput.fill(uniqueHandle);

  // Availability check must complete and must not block progression.
  await expect(page.locator('.text-success').first()).toBeVisible({
    timeout: 20_000,
  });

  const continueBtn = page.getByRole('button', { name: 'Continue' });
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  return uniqueHandle;
}

async function selectTimWhite(page: import('@playwright/test').Page) {
  const artistInput = page.getByPlaceholder(
    /search for your artist or paste a spotify link/i
  );
  await expect(artistInput).toBeVisible({ timeout: 20_000 });

  await artistInput.fill('Tim White');

  const timWhiteResult = page
    .locator('li button')
    .filter({ hasText: /tim white/i })
    .first();
  await expect(timWhiteResult).toBeVisible({ timeout: 20_000 });
  await timWhiteResult.click();
}

async function assertMusicFetchEnrichment(
  page: import('@playwright/test').Page
) {
  const displayName = page.locator('#onboarding-display-name');
  const bio = page.locator('#onboarding-bio');
  const avatarImage = page.locator(
    'img[alt*="Tim White"], img[alt*="tim white"]'
  );

  await expect(displayName).toBeVisible({ timeout: 20_000 });

  await expect
    .poll(async () => (await displayName.inputValue()).trim(), {
      timeout: 60_000,
      message: 'Music fetch enrichment did not populate artist display name',
    })
    .toMatch(/tim white/i);

  await expect
    .poll(async () => (await bio.inputValue()).trim().length, {
      timeout: 60_000,
      message: 'Music fetch enrichment did not populate artist bio',
    })
    .toBeGreaterThan(0);

  await expect(avatarImage.first()).toBeVisible({ timeout: 60_000 });
}

async function createStripeCheckoutSession(
  page: import('@playwright/test').Page
) {
  const pricingResponse = await page.request.get('/api/stripe/pricing-options');
  expect(pricingResponse.ok()).toBeTruthy();

  const pricingJson = (await pricingResponse.json()) as {
    pricingOptions?: Array<{ priceId?: string }>;
    options?: Array<{ priceId?: string }>;
  };

  const firstPriceId =
    pricingJson.pricingOptions?.find(option => option.priceId)?.priceId ??
    pricingJson.options?.find(option => option.priceId)?.priceId;

  expect(
    firstPriceId,
    'No Stripe price ID available for checkout'
  ).toBeTruthy();

  const checkoutResponse = await page.request.post('/api/stripe/checkout', {
    data: {
      priceId: firstPriceId,
    },
  });

  expect(checkoutResponse.ok()).toBeTruthy();

  const checkoutJson = (await checkoutResponse.json()) as { url?: string };
  expect(
    checkoutJson.url,
    'Stripe checkout URL missing from /api/stripe/checkout response'
  ).toMatch(/^https:\/\/checkout\.stripe\.com\//);
}

const runFull = process.env.E2E_ONBOARDING_FULL === '1';

const requiredEnvVars: Record<string, string | undefined> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};

test.describe('Golden Path Signup Flow (JOV-1376)', () => {
  test.describe.configure({ mode: 'serial' });

  // Fresh browser context — no inherited auth/session shortcuts.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (!runFull) {
      test.skip(
        true,
        'Full golden path onboarding E2E runs only when E2E_ONBOARDING_FULL=1'
      );
    }

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value || value.includes('dummy') || value.includes('mock')) {
        test.skip(true, `Skipping: ${key} is not configured for real auth`);
      }
    }

    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }

    await interceptTrackingCalls(page);
  });

  test('landing -> signup -> onboarding music fetch -> completed profile -> stripe checkout', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // 1) Landing page loads.
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/$/);

    // 2) Signup entry starts from landing page.
    const signupCta = page.locator('a[href^="/signup"]').first();
    await expect(signupCta).toBeVisible({ timeout: 20_000 });
    await signupCta.click();
    await page.waitForURL('**/signup**', { timeout: 30_000 });

    // 3) Account creation with Clerk test user (new session, no pre-auth storage state).
    await bootstrapNewSession(page);

    // 4) Navigate to onboarding and choose "Tim White" artist.
    await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForURL('**/onboarding**', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    const handle = await completeHandleStep(page);
    await selectTimWhite(page);

    // 5) Music fetch must succeed and populate real enrichment data.
    await assertMusicFetchEnrichment(page);

    // 6) Complete profile and verify no profile-completion prompts remain.
    const goToDashboardBtn = page.getByRole('button', {
      name: /go to dashboard/i,
    });
    await expect(goToDashboardBtn).toBeEnabled({ timeout: 20_000 });
    await goToDashboardBtn.click();

    await page.waitForURL('**/app/**', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByText(/complete your profile/i)).toHaveCount(0);

    // Validate public profile has at least one DSP link after onboarding import.
    await page.goto(`/${handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await expect(
      page
        .locator(
          'a[href*="open.spotify.com"], a[href*="music.apple.com"], a[href*="youtube.com"], a[href*="soundcloud.com"]'
        )
        .first()
    ).toBeVisible({ timeout: 30_000 });

    // 7) Exercise Stripe checkout creation in test mode.
    await createStripeCheckoutSession(page);
  });
});
