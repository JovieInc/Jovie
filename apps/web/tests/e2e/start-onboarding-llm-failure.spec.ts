import type { Page } from '@playwright/test';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

/**
 * Onboarding must never be blocked by LLM failure (JOV-3806).
 *
 * Every /api/chat request in this spec carries `x-jovie-e2e-llm-failure: 1`,
 * which the server honors only because the smoke web server runs with
 * `CHAT_LLM_FAILURE_INJECTION=1` (see playwright.config.smoke.ts). The LLM
 * path is skipped entirely; the deterministic script must carry the
 * conversation: greet → artist picker → confirm, with real tool cards and
 * no error UI.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const COMPOSER_TEXTAREA = '[aria-label="Chat message input" i]';

async function injectLlmFailureHeader(page: Page) {
  await page.route('**/api/chat', async route => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        'x-jovie-e2e-llm-failure': '1',
      },
    });
  });
}

async function sendComposerMessage(page: Page, text: string) {
  await page.locator(COMPOSER_TEXTAREA).fill(text);
  const sendButton = page.getByRole('button', { name: 'Send message' });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
}

test.describe('onboarding chat with the LLM down', () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }) => {
    page.setDefaultNavigationTimeout(180_000);
    await page.addInitScript(() => {
      localStorage.setItem('__dev_toolbar_hidden', '1');
    });
    await injectLlmFailureHeader(page);
  });

  test('deterministic script carries the visitor to the artist picker', async ({
    page,
  }) => {
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // Turn 1: scripted greeting streams back instead of a 500.
    const firstResponse = page.waitForResponse('**/api/chat');
    await sendComposerMessage(page, 'hey, I want in');
    const first = await firstResponse;
    expect(first.status()).toBe(200);
    expect(first.headers()['x-fallback-reason']).toBe('injected');
    expect(first.headers()['x-onboarding-fallback']).toMatch(/^greet:/);
    await expect(page.getByText(/I'm Jovie/).first()).toBeVisible();

    // No error UI anywhere.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Message paused' })
    ).toHaveCount(0);

    // Turn 2: the script opens the real artist picker card.
    const secondResponse = page.waitForResponse('**/api/chat');
    await sendComposerMessage(page, 'I am Test Artist');
    const second = await secondResponse;
    expect(second.status()).toBe(200);
    expect(second.headers()['x-onboarding-fallback']).toMatch(/^get_artist:/);
    await expect(page.getByTestId('onboarding-artist-picker')).toBeVisible();

    await expect(
      page.getByRole('alert').filter({ hasText: 'Message paused' })
    ).toHaveCount(0);

    // The scripted rail keeps the composer usable for the next turn.
    await expect(page.locator(COMPOSER_TEXTAREA)).toBeEditable();
  });
});
