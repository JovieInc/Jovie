import { expect, test } from '@playwright/test';

/**
 * One flow, not a separate waitlist and onboarding: public entry points hand
 * new visitors to the /start chat, which admits or holds them.
 */
const CHAT_PANEL = '[data-testid="onboarding-chat"]';

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

test('signed-out /waitlist hands off to the /start chat with its query', async ({
  page,
}, testInfo) => {
  // The no-auth runtime keeps the kill-switch landing for route health.
  test.skip(
    process.env.PUBLIC_NOAUTH_SMOKE === '1',
    'no-auth runtime renders the kill-switch landing'
  );
  await page.goto('/waitlist?source=one-door', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page).toHaveURL(/\/start\?source=one-door$/);
  await expect(page.locator(CHAT_PANEL)).toBeVisible();
  await testInfo.attach('waitlist handoff', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
