import { type Page } from '@playwright/test';

export type WaitlistToggleState = 'clear' | 'new' | 'claimed';

export interface WaitlistToggleResponse {
  success: boolean;
  state: WaitlistToggleState;
  email: string;
  error?: string;
}

async function callToggleEndpoint(
  page: Page,
  state: WaitlistToggleState
): Promise<WaitlistToggleResponse> {
  const res = await page.request.post(
    `/api/test/waitlist-toggle?state=${encodeURIComponent(state)}`
  );

  if (res.status() === 404) {
    throw new Error(
      'Test-only waitlist toggle endpoint is not available in this environment (likely production).'
    );
  }
  if (res.status() === 401) {
    throw new Error(
      'Unauthorized: ensure the test user is signed in before toggling waitlist state.'
    );
  }
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(
      `Failed to toggle waitlist (status ${res.status()}): ${text}`
    );
  }

  const data = (await res.json()) as WaitlistToggleResponse;
  if (!data || data.success !== true) {
    throw new Error('Unexpected response from waitlist toggle endpoint.');
  }

  return data;
}

export async function setWaitlistState(
  page: Page,
  state: WaitlistToggleState
): Promise<WaitlistToggleResponse> {
  return await callToggleEndpoint(page, state);
}
