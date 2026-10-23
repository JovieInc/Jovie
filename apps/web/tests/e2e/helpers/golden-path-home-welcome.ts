import { expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

/** Capture the pending welcome before releasing its controlled summary. */
export async function openHomeWelcome(page: Page, releaseSummary?: () => void) {
  // Slow images must not consume the welcome's bounded summary wait before
  // the test observes the pending state and releases the response fixture.
  await page.goto(APP_ROUTES.CHAT, { waitUntil: 'domcontentloaded' });
  const heading = page.getByTestId('chat-empty-state-greeting-text');
  await expect(heading).toBeVisible();
  const initialGreeting = await heading.textContent();
  const before = await page
    .getByRole('textbox', { name: 'Chat message input', exact: false })
    .boundingBox();
  if (releaseSummary) {
    await expect(
      page.getByTestId('chat-empty-state-next-step').getByRole('status')
    ).toHaveText('Finding your next step…');
    releaseSummary();
  }
  return { initialGreeting, before };
}
