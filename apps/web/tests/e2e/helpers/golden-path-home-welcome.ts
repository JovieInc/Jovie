import { expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

/** Open Home and capture the greeting and composer box once both have mounted. */
export async function openHomeWelcome(page: Page) {
  // Slow images must not hold the welcome; read it as soon as the DOM is in.
  await page.goto(APP_ROUTES.CHAT, { waitUntil: 'domcontentloaded' });
  const heading = page.getByTestId('chat-empty-state-greeting-text');
  await expect(heading).toBeVisible();
  const initialGreeting = await heading.textContent();
  // The composer is a client-shell surface: the greeting is server-rendered,
  // but the composer mounts on hydration, which can land after this read on a
  // contended runner. boundingBox() does not wait, so wait for the composer
  // itself (Golden Path run 43276711590, job 131387101056, 2026-11-12).
  const input = page
    .getByRole('textbox', { name: 'Chat message input', exact: false })
    .first();
  await expect(input).toBeVisible();
  const before = await input.boundingBox();
  return { initialGreeting, before };
}
