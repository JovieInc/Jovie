import { expect, test } from '@playwright/test';

// Public seed handles from test data
const publicHandles = ['musicmaker', 'popstar', 'techtalks', 'lifestyleguru'];

for (const handle of publicHandles) {
  test.describe(`Public profile: /${handle}`, () => {
    test(`renders and shows primary CTA`, async ({ page }) => {
      // Capture console errors
      const consoleMessages: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleMessages.push(msg.text());
      });

      const res = await page.goto(`/${handle}`, {
        waitUntil: 'domcontentloaded',
      });
      expect(res?.ok(), `HTTP status not OK for /${handle}`).toBeTruthy();

      // Title should include the display name or handle in most cases
      await expect(page).toHaveTitle(/.+/);

      // Exactly one primary CTA container should be present
      const primaryCtas = page.locator('[data-testid="primary-cta"]');
      await expect(primaryCtas).toHaveCount(1);
      await expect(primaryCtas.first()).toBeVisible();

      // No console errors
      expect(
        consoleMessages,
        `Console errors on /${handle}:\n${consoleMessages.join('\n')}`
      ).toHaveLength(0);
    });
  });
}
