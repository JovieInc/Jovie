import { type BoundingBox, expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Open Home and capture the greeting and composer box once both have mounted.
 *
 * `greetsName`, when given, is the name the signed-in identity must be greeted
 * by. The greeting is captured only once it names them: under E2E the chat
 * page renders a stand-in profile ("E2E Chat Smoke") while the dashboard data
 * has no profile yet, and freezing that stand-in as the "initial" greeting
 * made the later swap to the real artist read as the welcome moving (Golden
 * Path run 45436250396: "Good afternoon, UNMARKED." vs the captured stand-in).
 * The no-move assertions downstream keep their full strength from that point.
 */
export async function openHomeWelcome(page: Page, greetsName?: string) {
  // Slow images must not hold the welcome; read it as soon as the DOM is in.
  await page.goto(APP_ROUTES.CHAT, { waitUntil: 'domcontentloaded' });
  const heading = page.getByTestId('chat-empty-state-greeting-text');
  await expect(heading).toBeVisible();
  if (greetsName) await expect(heading).toContainText(greetsName);
  const initialGreeting = await heading.textContent();
  // The composer is a client-shell surface: the greeting is server-rendered,
  // but the composer mounts on hydration, which can land after this read on a
  // contended runner. boundingBox() does not wait, so wait for the composer
  // itself (Golden Path run 43276711590, job 131387101056, 2026-11-12).
  const input = page
    .getByRole('textbox', { name: 'Chat message input', exact: false })
    .first();
  await expect(input).toBeVisible();
  // The deferred chat chunk (JOV-10150) swaps the server-rendered welcome for
  // the loading body and back while the chunk loads, and that swap can land
  // between the visibility check and a single boundingBox() read, which does
  // not retry: the box came back null on main pushes 3e772d62c and 875bd2e98
  // (runs 43645152882 and 43647984362, 2026-11-14). Read the box through a
  // retrying poll so it is captured from the mounted composer; every
  // downstream assertion keeps its full strength.
  let before: BoundingBox | null = null;
  await expect
    .poll(
      async () => {
        before = await input.boundingBox();
        return before;
      },
      { timeout: 15_000, message: 'mounted composer box' }
    )
    .not.toBeNull();
  return { initialGreeting, before };
}
