import { expect, test } from '@playwright/test';

/**
 * One flow, not a separate waitlist and onboarding: public entry points hand
 * new visitors to the /start chat, which admits or holds them.
 */

for (const { route, cta } of [
  { route: '/launch', cta: 'Request access' },
  { route: '/brand', cta: 'Start Free Trial' },
]) {
  test(`${route} sends its primary CTA to /start`, async ({
    page,
  }, testInfo) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    const link = page.getByRole('link', { name: cta }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/start');
    await testInfo.attach(`${route} entry`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}
