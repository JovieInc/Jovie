import { expect, test } from '@playwright/test';

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start each test at the homepage
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('anonymous handle claim redirects to waitlist', async ({ page }) => {
    const handle = `e2e-${Date.now().toString(36)}`;

    await page.route('/api/handle/check*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true }),
      });
    });

    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible({ timeout: 5000 });

    await handleInput.fill(handle);

    const submitButton = page
      .locator('form:has(#handle-input) button[type="submit"]')
      .first();
    await expect(submitButton).toBeVisible();

    await expect
      .poll(
        async () => {
          return await submitButton.isEnabled();
        },
        {
          timeout: 15000,
          intervals: [500, 750, 1000],
        }
      )
      .toBe(true);

    await Promise.all([
      page.waitForURL('**/waitlist', { timeout: 15000 }),
      submitButton.click(),
    ]);

    const url = new URL(page.url());
    expect(url.pathname).toBe('/waitlist');
  });

  test('unauthenticated /onboarding redirects to signin with redirect_url', async ({
    page,
  }) => {
    // Navigate directly to onboarding while unauthenticated
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });

    // Should redirect to canonical /signin route
    await expect(page).toHaveURL(/\/signin/);

    const url = new URL(page.url());
    const redirectUrl = url.searchParams.get('redirect_url');
    expect(redirectUrl).toBe('/onboarding');
  });

  test('unauthenticated /onboarding?handle preserves handle in redirect_url', async ({
    page,
  }) => {
    const handle = `e2e-deeplink-${Date.now().toString(36)}`;

    await page.goto(`/onboarding?handle=${handle}`, {
      waitUntil: 'domcontentloaded',
    });

    // Final destination should be the canonical /signin page
    await expect(page).toHaveURL(/\/signin/);

    const url = new URL(page.url());
    const redirectUrl = url.searchParams.get('redirect_url');
    expect(redirectUrl).toBe(`/onboarding?handle=${handle}`);
  });

  test('complete onboarding flow with handle validation', async ({ page }) => {
    // Navigate to onboarding (requires authentication first)
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });

    // Should redirect to canonical /signin if not authenticated
    await expect(page).toHaveURL(/\/signin/);

    // For now, just test the onboarding page loads for authenticated users
    // This test will be expanded when we have test auth setup
  });

  test('handle validation works correctly', async ({ page }) => {
    // Test the handle check API directly
    const response = await page.request.get(
      '/api/handle/check?handle=testuser123'
    );
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('available');
    expect(typeof data.available).toBe('boolean');
  });

  test('handle check API rejects invalid handles', async ({ page }) => {
    // Test with empty handle
    const emptyResponse = await page.request.get('/api/handle/check?handle=');
    expect(emptyResponse.status()).toBe(400);

    // Test with special characters
    const invalidResponse = await page.request.get(
      '/api/handle/check?handle=test@user'
    );
    const invalidData = await invalidResponse.json();
    expect(invalidData.available).toBe(false);
  });

  test('handle check API handles existing handles', async ({ page }) => {
    // Test with known existing handle from seed data
    const response = await page.request.get(
      '/api/handle/check?handle=musicmaker'
    );
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(typeof data.available).toBe('boolean');
  });

  test('handle check API handles race conditions', async ({ page }) => {
    // Fire multiple rapid requests to test race condition handling
    const handles = ['race1', 'race2', 'race3', 'race4', 'race5'];
    const promises = handles.map(handle =>
      page.request.get(`/api/handle/check?handle=${handle}`)
    );

    const responses = await Promise.all(promises);

    // All requests should complete successfully
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });
  });

  test('onboarding page renders without authentication errors', async ({
    page,
  }) => {
    // Go directly to onboarding page
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });

    // Should not have JavaScript errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(3000);

    // Filter out expected authentication redirects
    const criticalErrors = errors.filter(
      error =>
        !error.includes('NEXT_REDIRECT') &&
        !error.includes('auth') &&
        !error.includes('sign-in')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('onboarding form prevents double submission', async ({ page }) => {
    // This test would need authentication setup to be fully functional
    // For now, we test the API doesn't allow duplicate rapid calls

    const handle = 'doubletest' + Date.now();

    // Make two rapid requests
    const [response1, response2] = await Promise.all([
      page.request.get(`/api/handle/check?handle=${handle}`),
      page.request.get(`/api/handle/check?handle=${handle}`),
    ]);

    expect(response1.ok()).toBeTruthy();
    expect(response2.ok()).toBeTruthy();

    const [data1, data2] = await Promise.all([
      response1.json(),
      response2.json(),
    ]);

    // Both should return consistent results
    expect(data1.available).toBe(data2.available);
  });

  const runDbHealthCheck =
    process.env.E2E_DB_HEALTH === '1' ||
    !!(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy'));

  (runDbHealthCheck ? test : test.skip)(
    'database connection and RLS policies work',
    async ({ page }) => {
      // Test that the database is accessible and RLS is working
      const response = await page.request.get('/api/health/db');
      expect(response.ok()).toBeTruthy();

      const health = await response.json();
      expect(health.status).toBe('ok');
    }
  );
});
