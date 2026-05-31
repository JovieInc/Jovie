import { expect, test } from '@playwright/test';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import {
  installOnboardingAnalyticsCapture,
  mockOnboardingRobotStartChat,
  readOnboardingRobotState,
  waitForOnboardingRobotEvents,
} from './helpers/onboarding-robot';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const COMPOSER_TEXTAREA = '[aria-label="Chat message input"]';

test.describe('Onboarding Robot PR Smoke', () => {
  test('verifies /start chat health and event emission', async ({ page }) => {
    test.setTimeout(60_000);

    await installOnboardingAnalyticsCapture(page);
    await mockOnboardingRobotStartChat(page);

    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(page.getByTestId('onboarding-chat')).toBeVisible();
    await waitForOnboardingRobotEvents(page, [
      ONBOARDING_FUNNEL_EVENTS.ONBOARDING_STARTED,
    ]);

    await page.locator(COMPOSER_TEXTAREA).fill('I am launching a test artist');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(
      page.getByText('I found enough signal to keep going')
    ).toBeVisible({ timeout: 30_000 });

    await waitForOnboardingRobotEvents(page, [
      ONBOARDING_FUNNEL_EVENTS.ONBOARDING_STARTED,
      ONBOARDING_FUNNEL_EVENTS.CHAT_STARTED,
      ONBOARDING_FUNNEL_EVENTS.CHAT_COMPLETED,
      ONBOARDING_FUNNEL_EVENTS.QUALIFIED,
    ]);

    const cookies = await page.context().cookies();
    expect(
      cookies.some(cookie => cookie.name === 'jovie_onboarding_session')
    ).toBe(true);

    const state = await readOnboardingRobotState(page);
    console.log(
      `[Synthetic][onboarding-robot] smoke scenario=pr-start-chat url=${state.url} events=${state.events
        .map(entry => entry.event)
        .join(',')}`
    );
  });
});
