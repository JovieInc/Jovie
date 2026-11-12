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
  // The composer is a client-shell surface: the greeting is server-rendered,
  // but the composer mounts on hydration, which can land after this read on a
  // contended runner. boundingBox() does not wait, so the pending-welcome
  // geometry was read against a page whose composer was not mounted yet and
  // returned null (Golden Path run 43276711590, job 131387101056, 2026-11-12
  // 18:15Z — #23989's added root-layout client JS pushed hydration past the
  // read). Wait for the composer itself; the before/after position-stability
  // assertions downstream keep their full strength.
  const input = page
    .getByRole('textbox', { name: 'Chat message input', exact: false })
    .first();
  await expect(input).toBeVisible();
  const before = await input.boundingBox();
  if (releaseSummary) {
    await expect(
      page.getByTestId('chat-empty-state-next-step').getByRole('status')
    ).toHaveText('Finding your next step…');
    releaseSummary();
  }
  return { initialGreeting, before };
}
