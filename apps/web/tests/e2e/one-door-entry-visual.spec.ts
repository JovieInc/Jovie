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

test('/waitlist serves the one front door in both signup modes', async ({
  page,
}, testInfo) => {
  const response = await page.goto('/waitlist', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(500);
  if (process.env.FEATURE_PUBLIC_SIGNUP_CLOSED === 'true') {
    // Kill-switch mode: the waitlist role form is the front door.
    await expect(page.locator('#auth-form').first()).toBeVisible();
  } else {
    // One front door (Tim, 2026-11-09): anonymous /waitlist hands off to the
    // /start onboarding chat — including the no-database visual runtime,
    // so the capture ships the same journey prod serves.
    expect(new URL(page.url()).pathname).toBe('/start');
    await expect(
      page.locator('[data-testid="onboarding-chat"]').first()
    ).toBeVisible();
  }
  await testInfo.attach('/waitlist entry', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
