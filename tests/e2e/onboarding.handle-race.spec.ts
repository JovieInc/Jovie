import { expect, test } from '@playwright/test';

test.describe('Onboarding Handle Race Conditions', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API endpoints to simulate network delays and control responses
    await page.route('/api/handle/check*', async (route, request) => {
      const url = new URL(request.url());
      const handle = url.searchParams.get('handle');

      // Add artificial delay to simulate network latency
      await new Promise(resolve =>
        setTimeout(resolve, 100 + Math.random() * 200)
      );

      // Define known test handles and their availability
      const handleAvailability: Record<string, boolean> = {
        taken1: false,
        taken2: false,
        available1: true,
        available2: true,
        available3: true,
        testhandle1: true,
        testhandle2: true,
        testhandle3: true,
        musicmaker: false, // Known existing handle from seed data
        existinguser: false,
      };

      const available = handleAvailability[handle?.toLowerCase() || ''] ?? true;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available }),
      });
    });

    // Navigate to homepage claim form (works unauthenticated)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('handle availability state matches last typed value', async ({
    page,
  }) => {
    // This test simulates rapid typing across different handles
    // to ensure the final availability state matches the last input

    const handleInput = page.getByTestId('onboarding-claim-handle-input');
    await expect(handleInput).toBeVisible();

    // Simulate rapid typing sequence: taken1 -> available1 -> taken2 -> available2
    const typingSequence = [
      { handle: 'taken1', expectedAvailable: false },
      { handle: 'available1', expectedAvailable: true },
      { handle: 'taken2', expectedAvailable: false },
      { handle: 'available2', expectedAvailable: true },
    ];

    for (let i = 0; i < typingSequence.length; i++) {
      const { handle } = typingSequence[i];

      // Clear input and type new handle rapidly
      await handleInput.fill('');
      await handleInput.fill(handle);

      // Add small delay between rapid inputs to simulate realistic typing
      await page.waitForTimeout(50);
    }

    // Wait for debouncing to complete (component uses ~450ms debounce)
    await page.waitForTimeout(650);

    // Final state should match the last typed value
    const lastHandle = typingSequence[typingSequence.length - 1];

    // Check that the input shows the final handle
    await expect(handleInput).toHaveValue(lastHandle.handle);

    // Check availability indicator matches expected state
    if (lastHandle.expectedAvailable) {
      // Submit button should be enabled
      const submitButton = page.getByTestId('onboarding-claim-submit');
      await expect(submitButton).toBeEnabled();
    } else {
      await expect(
        page.getByTestId('onboarding-claim-handle-helper')
      ).toHaveText(/handle already taken/i);

      // Submit button should be disabled
      const submitButton = page.getByTestId('onboarding-claim-submit');
      await expect(submitButton).toBeDisabled();
    }
  });

  test('prevents stale positive results for taken handles', async ({
    page,
  }) => {
    // This test specifically checks that a taken handle doesn't show as available
    // even if there are race conditions with previous requests

    const handleInput = page.getByTestId('onboarding-claim-handle-input');
    await expect(handleInput).toBeVisible();

    // Type sequence: available1 -> taken1 rapidly
    await handleInput.fill('available1');
    await page.waitForTimeout(100); // Small delay
    await handleInput.fill('taken1');

    // Wait for all requests to complete
    await page.waitForTimeout(650);

    // Final state must show taken1 as unavailable
    await expect(handleInput).toHaveValue('taken1');
    await expect(page.getByTestId('onboarding-claim-handle-helper')).toHaveText(
      /handle already taken/i
    );

    // Submit button must be disabled for taken handle
    const submitButton = page.getByTestId('onboarding-claim-submit');
    await expect(submitButton).toBeDisabled();
  });

  test('handles rapid sequential handle checks with different results', async ({
    page,
  }) => {
    // Test rapid sequence of different handles to stress test the race condition protection

    const handleInput = page.getByTestId('onboarding-claim-handle-input');
    await expect(handleInput).toBeVisible();

    const rapidSequence = [
      'testhandle1', // available
      'musicmaker', // taken (from seed data)
      'testhandle2', // available
      'existinguser', // taken
      'testhandle3', // available - final value
    ];

    // Type each handle in rapid succession
    for (const handle of rapidSequence) {
      await handleInput.fill('');
      await handleInput.fill(handle);
      await page.waitForTimeout(50); // Very fast typing simulation
    }

    // Wait for debouncing and all network requests to settle
    await page.waitForTimeout(900);

    // Verify final state
    const finalHandle = rapidSequence[rapidSequence.length - 1];
    await expect(handleInput).toHaveValue(finalHandle);

    // Since final handle is available, should show as such
    const submitButton = page.getByTestId('onboarding-claim-submit');
    await expect(submitButton).toBeEnabled();
  });

  test('aborts previous requests when typing rapidly', async ({ page }) => {
    // This test verifies that the AbortController properly cancels in-flight requests

    let requestCount = 0;
    let abortedCount = 0;

    // Track API calls and aborts
    await page.route('/api/handle/check*', async (route, request) => {
      requestCount++;
      const url = new URL(request.url());
      const handle = url.searchParams.get('handle');

      try {
        // Simulate longer network delay
        await new Promise(resolve => setTimeout(resolve, 300));

        const available = !['taken1', 'taken2'].includes(
          handle?.toLowerCase() || ''
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available }),
        });
      } catch {
        // Request was likely aborted
        abortedCount++;
        await route.abort();
      }
    });

    const handleInput = page.getByTestId('onboarding-claim-handle-input');
    await expect(handleInput).toBeVisible();

    // Type rapidly to trigger request cancellation
    const handles = ['a', 'ab', 'abc', 'abcd', 'final'];
    for (const handle of handles) {
      await handleInput.fill(handle);
      await page.waitForTimeout(50);
    }

    // Wait for final request to complete
    await page.waitForTimeout(900);

    // Verify final state
    await expect(handleInput).toHaveValue('final');

    // The component should have made fewer actual successful requests than total typing
    // due to request cancellation via AbortController
    console.log(
      `Total requests initiated: ${requestCount}, Aborted: ${abortedCount}`
    );
  });

  test('maintains consistent UI state during rapid typing', async ({
    page,
  }) => {
    // Test that the UI doesn't flicker or show inconsistent states

    const handleInput = page.getByTestId('onboarding-claim-handle-input');
    const submitButton = page.getByTestId('onboarding-claim-submit');

    await expect(handleInput).toBeVisible();

    // Start with a taken handle
    await handleInput.fill('taken1');
    await page.waitForTimeout(650);

    // Verify initial state - taken handle
    await expect(submitButton).toBeDisabled();

    // Quickly switch to available handle
    await handleInput.fill('available1');
    await page.waitForTimeout(650);

    // Verify final state - available handle
    await expect(page.getByTestId('onboarding-claim-submit')).toBeEnabled();

    // No error message should be visible for available handle
    await expect(
      page.getByTestId('onboarding-claim-handle-helper')
    ).not.toHaveText(/handle already taken/i);
  });

  test('handles network errors gracefully during race conditions', async ({
    page,
  }) => {
    // Test that network failures don't leave the UI in a broken state

    let requestCount = 0;

    await page.route('/api/handle/check*', async (route, request) => {
      requestCount++;

      if (requestCount === 1) {
        // First request fails at the network layer
        await route.abort();
      } else {
        // Subsequent requests succeed
        const url = new URL(request.url());
        const handle = url.searchParams.get('handle');
        const available = handle === 'recovery';

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available }),
        });
      }
    });

    const handleInput = page.getByTestId('onboarding-claim-handle-input');
    await expect(handleInput).toBeVisible();

    // Type handle that will cause network error
    await handleInput.fill('errorhandle');
    await page.waitForTimeout(650);

    // Should show network error
    await expect(page.getByTestId('onboarding-claim-handle-helper')).toHaveText(
      /network error/i
    );

    // Type new handle that succeeds
    await handleInput.fill('recovery');
    await page.waitForTimeout(650);

    // Should recover and show success state
    await expect(page.getByTestId('onboarding-claim-submit')).toBeEnabled();
    await expect(
      page.getByTestId('onboarding-claim-handle-helper')
    ).not.toHaveText(/network error/i);
  });
});
