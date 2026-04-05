/**
 * E2E helpers for setting the test user's plan.
 *
 * Uses the test-only `/api/dev/test-user/set-plan` endpoint to upgrade
 * or downgrade the test user without Stripe interaction.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { PlanId } from '@/lib/entitlements/registry';

/**
 * Set the authenticated test user's plan via the dev test endpoint.
 * Requires the user to already be signed in (page has auth cookies).
 */
export async function setTestUserPlan(page: Page, plan: PlanId): Promise<void> {
  const response = await page.request.post('/api/dev/test-user/set-plan', {
    data: { plan },
  });
  expect(response.ok(), `Failed to set plan to ${plan}`).toBeTruthy();
  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.plan).toBe(plan);
}

/**
 * Reset the test user back to the free plan.
 * Call this in afterEach/afterAll to clean up after paid-tier tests.
 */
export async function ensureTestUserFree(page: Page): Promise<void> {
  await setTestUserPlan(page, 'free');
}
