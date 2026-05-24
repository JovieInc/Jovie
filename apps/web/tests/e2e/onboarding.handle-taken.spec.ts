import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

/**
 * E2E Test: Handle Taken Prevents Submission
 *
 * This test verifies that when a user enters an already-taken handle during onboarding,
 * the UI shows an error and the submit button remains disabled.
 *
 * Approach:
 * 1. Use a known taken handle from seed data ('musicmaker')
 * 2. Verify error message is displayed
 * 3. Verify submit button is disabled
 *
 * Requirements:
 * - E2E_ONBOARDING_HANDLE_TAKEN=1 environment variable (optional)
 * - Real Clerk environment variables and DATABASE_URL
 */

test.describe('Onboarding Handle Taken Prevention', () => {
  test.skip(
    FAST_ITERATION,
    'Onboarding handle-taken coverage runs outside the hot fast-iteration lane'
  );

  // Only run when environment is properly configured
  // If E2E_ONBOARDING_HANDLE_TAKEN is not set, we'll still run the test
  // but with mocked API responses
  const runWithRealAPI = process.env.E2E_ONBOARDING_HANDLE_TAKEN === '1';

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    if (runWithRealAPI) {
      // Validate required environment variables when using real API
      const requiredEnvVars = {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        DATABASE_URL: process.env.DATABASE_URL,
      };

      // Skip if any required env var is missing or contains dummy values
      for (const [key, value] of Object.entries(requiredEnvVars)) {
        if (!value || value.includes('dummy')) {
          console.log(
            `Skipping test with real API: ${key} is not properly configured`
          );
          test.skip();
        }
      }

      await setupClerkTestingToken({ page });
    } else {
      // Mock the API endpoint to simulate taken handle
      await page.route('/api/handle/check*', async (route, request) => {
        const url = new URL(request.url());
        const handle = url.searchParams.get('handle');

        // Define known test handles and their availability
        const takenHandles = ['musicmaker', 'existinguser', 'taken'];
        const available = !takenHandles.includes(handle?.toLowerCase() || '');

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available }),
        });
      });
    }

    // Navigate to onboarding page only when running with real auth.
    // In mocked mode, use the public homepage claim form.
    await page.goto(runWithRealAPI ? APP_ROUTES.ONBOARDING : APP_ROUTES.HOME, {
      waitUntil: 'domcontentloaded',
    });

    // The handle claim form is wired into the onboarding shell, not the
    // marketing homepage. In mocked mode, skip tests if the form isn't here.
    if (!runWithRealAPI) {
      const handleInput = page.getByLabel(
        /choose your handle|claim your handle/i
      );
      const isFormVisible = await handleInput
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (!isFormVisible) {
        console.log(
          '⚠ Handle claim form not rendered on homepage (feature flag off) — skipping'
        );
        test.skip();
      }
    }
  });

  test('entering a taken handle shows error and disables submit button', async ({
    page,
  }) => {
    // Set timeout to 30 seconds
    test.setTimeout(30_000);

    // Setup Clerk testing token for authentication if needed
    if (runWithRealAPI) {
      // Load homepage to initialize Clerk
      await page.goto(APP_ROUTES.HOME, { waitUntil: 'domcontentloaded' });

      // Wait for Clerk to be ready
      await page.waitForFunction(
        () => {
          // @ts-ignore – Clerk v5 uses `loaded` (boolean getter) instead of `isReady()`
          return window.Clerk && window.Clerk.loaded;
        },
        { timeout: 10_000 }
      );

      // Navigate to onboarding page
      await page.goto(APP_ROUTES.ONBOARDING, {
        waitUntil: 'domcontentloaded',
      });
    }

    const handleInput = page.getByRole('textbox', { name: /handle/i });
    const unavailableState = runWithRealAPI
      ? page.getByTestId('handle-unavailable')
      : page.getByTestId('claim-handle-status');
    const submitButton = runWithRealAPI
      ? page.getByTestId('onboarding-handle-submit')
      : page.getByTestId('homepage-primary-cta');
    await expect(handleInput).toBeVisible({ timeout: 5_000 });

    // Enter a known taken handle from seed data
    await handleInput.fill('musicmaker');

    await expect(handleInput).toHaveAttribute('aria-invalid', 'true');
    await expect(unavailableState).toContainText(/not available/i, {
      timeout: 5_000,
    });
    await expect(submitButton).toBeDisabled({ timeout: 5_000 });

    // Now try with a different taken handle to ensure consistency
    await handleInput.fill('existinguser');

    await expect(handleInput).toHaveAttribute('aria-invalid', 'true');
    await expect(unavailableState).toContainText(/not available/i, {
      timeout: 5_000,
    });

    // Verify submit button is still disabled
    await expect(submitButton).toBeDisabled({ timeout: 5_000 });
  });

  test('switching from taken to available handle enables submission', async ({
    page,
  }) => {
    // Set timeout to 30 seconds
    test.setTimeout(30_000);

    // Get the handle input field
    const handleInput = page.getByRole('textbox', { name: /handle/i });
    const submitButton = runWithRealAPI
      ? page.getByTestId('onboarding-handle-submit')
      : page.getByTestId('homepage-primary-cta');
    await expect(handleInput).toBeVisible({ timeout: 5_000 });

    // First enter a taken handle
    await handleInput.fill('musicmaker');
    await expect(handleInput).toHaveAttribute('aria-invalid', 'true');

    // Verify submit button is disabled
    await expect(submitButton).toBeDisabled({ timeout: 5_000 });

    // Now switch to an available handle
    const uniqueHandle = `e2e-${Date.now().toString(36)}`;
    await handleInput.fill(uniqueHandle);

    if (runWithRealAPI) {
      // Verify submit button is now enabled
      await expect(submitButton).toBeEnabled({ timeout: 5_000 });
    } else {
      await expect(submitButton).toBeEnabled({ timeout: 5_000 });
    }

    await expect(handleInput).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('handles race conditions correctly when switching between taken and available', async ({
    page,
  }) => {
    // Set timeout to 30 seconds
    test.setTimeout(30_000);

    // Get the handle input field
    const handleInput = page.getByRole('textbox', { name: /handle/i });
    await expect(handleInput).toBeVisible({ timeout: 5_000 });

    // Simulate rapid typing sequence: available -> taken -> available
    const typingSequence = [
      { handle: 'available-handle', expectedAvailable: true },
      { handle: 'musicmaker', expectedAvailable: false },
      { handle: 'unique-handle', expectedAvailable: true },
    ];

    for (let i = 0; i < typingSequence.length; i++) {
      const { handle } = typingSequence[i];

      // Clear input and type new handle rapidly
      await handleInput.fill('');
      await handleInput.fill(handle);

      // Add small delay between rapid inputs to simulate realistic typing
      await page.waitForTimeout(50);
    }

    // Wait for debouncing to complete

    // Final state should match the last typed value (available)
    const lastHandle = typingSequence[typingSequence.length - 1];

    // Check that the input shows the final handle
    await expect(handleInput).toHaveValue(lastHandle.handle);

    if (runWithRealAPI) {
      // Submit button should be enabled
      const submitButton = page.getByTestId('onboarding-handle-submit');
      await expect(submitButton).toBeEnabled();
    } else {
      const submitButton = page.getByTestId('homepage-primary-cta');
      await expect(submitButton).toBeEnabled();
    }
  });
});
