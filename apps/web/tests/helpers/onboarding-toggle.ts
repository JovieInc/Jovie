import type { Page } from '@playwright/test';

export type ToggleState = 'complete' | 'reset';

export interface ToggleResponse {
  success: boolean;
  state: ToggleState;
  onboardingCompletedAt: string | null;
  error?: string;
}

async function callToggleEndpoint(
  page: Page,
  state: ToggleState
): Promise<ToggleResponse> {
  const res = await page.request.post(
    `/api/test/onboarding-toggle?state=${encodeURIComponent(state)}`
  );

  if (res.status() === 404) {
    throw new Error(
      'Test-only onboarding toggle endpoint is not available in this environment (likely production).'
    );
  }
  if (res.status() === 401) {
    throw new Error(
      'Unauthorized: ensure the test user is signed in before toggling onboarding.'
    );
  }
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(
      `Failed to toggle onboarding (status ${res.status()}): ${text}`
    );
  }

  const data = (await res.json()) as ToggleResponse;
  if (
    !data ||
    data.success !== true ||
    (data.state !== 'complete' && data.state !== 'reset')
  ) {
    throw new Error('Unexpected response from onboarding toggle endpoint.');
  }
  return data;
}

/**
 * Mark onboarding as completed for the currently authenticated user.
 * Requires the test to be signed in (see tests/helpers/clerk-auth.ts).
 */
export async function setOnboardingComplete(
  page: Page
): Promise<ToggleResponse> {
  return await callToggleEndpoint(page, 'complete');
}

/**
 * Reset onboarding (set onboardingCompletedAt to null) for the currently authenticated user.
 * Requires the test to be signed in (see tests/helpers/clerk-auth.ts).
 */
export async function resetOnboarding(page: Page): Promise<ToggleResponse> {
  return await callToggleEndpoint(page, 'reset');
}
