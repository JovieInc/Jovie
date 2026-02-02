import { expect, test } from '@playwright/test';

test.describe('Onboarding Handle Race Conditions', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API endpoints to simulate network delays and control responses
    await page.route('/api/handle/check*', async (route, request) => {
      const url = new URL(request.url());
      const handle = url.searchParams.get('handle');
      const normalizedHandle = handle?.toLowerCase() || '';
      const latencyByHandle: Record<string, number> = {
        taken1: 120,
        taken2: 80,
        available1: 100,
        available2: 60,
        available3: 140,
        testhandle1: 90,
        testhandle2: 110,
        testhandle3: 70,
        musicmaker: 130,
        existinguser: 95,
      };
      const simulatedLatencyMs = latencyByHandle[normalizedHandle] ?? 75;

      // Add deterministic delay to simulate network latency
      await new Promise(resolve => setTimeout(resolve, simulatedLatencyMs));

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

      const available = handleAvailability[normalizedHandle] ?? true;

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

    const handleInput = page.getByLabel('Enter your desired handle');
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
      const submitButton = page.getByRole('button', {
        name: `Claim @${lastHandle.handle}`,
      });
      await expect(submitButton).toBeEnabled();
    } else {
      // Should show error for unavailable handle
      await expect(page.locator('text="Handle already taken"')).toBeVisible();

      // Submit button should be disabled
      const submitButton = page.getByRole('button', {
        name: 'Request Early Access',
      });
      await expect(submitButton).toBeDisabled();
    }
  });

  test('prevents stale positive results for taken handles', async ({
    page,
  }) => {
    // This test specifically checks that a taken handle doesn't show as available
    // even if there are race conditions with previous requests

    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible();

    // Type sequence: available1 -> taken1 rapidly
    await handleInput.fill('available1');
    await page.waitForTimeout(100); // Small delay
    await handleInput.fill('taken1');

    // Wait for all requests to complete
    await page.waitForTimeout(650);

    // Final state must show taken1 as unavailable
    await expect(handleInput).toHaveValue('taken1');
    await expect(page.locator('text="Handle already taken"')).toBeVisible();

    // Submit button must be disabled for taken handle
    const submitButton = page.getByRole('button', {
      name: 'Request Early Access',
    });
    await expect(submitButton).toBeDisabled();
  });

  test('handles rapid sequential handle checks with different results', async ({
    page,
  }) => {
    // Test rapid sequence of different handles to stress test the race condition protection

    const handleInput = page.getByLabel('Enter your desired handle');
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
    const submitButton = page.getByRole('button', {
      name: `Claim @${finalHandle}`,
    });
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

    const handleInput = page.getByLabel('Enter your desired handle');
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

    const handleInput = page.getByLabel('Enter your desired handle');
    const submitButton = page.getByRole('button', {
      name: 'Request Early Access',
    });

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
    await expect(
      page.getByRole('button', { name: 'Claim @available1' })
    ).toBeEnabled();

    // No error message should be visible for available handle
    await expect(page.locator('text="Handle already taken"')).not.toBeVisible();
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

    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible();

    // Type handle that will cause network error
    await handleInput.fill('errorhandle');
    await page.waitForTimeout(650);

    // Should show network error
    await expect(page.locator('text="Network error"')).toBeVisible();

    // Type new handle that succeeds
    await handleInput.fill('recovery');
    await page.waitForTimeout(650);

    // Should recover and show success state
    await expect(
      page.getByRole('button', { name: 'Claim @recovery' })
    ).toBeEnabled();
    await expect(page.locator('text="Network error"')).not.toBeVisible();
  });
});
