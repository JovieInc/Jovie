import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

// JOV-8341: exercise the composed route and native browser focus behavior.
// No auth mutation, test-auth bypass, or email delivery is needed.
for (const route of ['/signup', '/signin']) {
  for (const width of [390, 768, 1440]) {
    test(`${route} has one main landmark and a working keyboard skip at ${width}px @smoke`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByRole('button', { name: 'Send sign-in code' })
      ).toBeEnabled();

      await expect(page.getByRole('main')).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Skip to form' })
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#auth-form')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Go to homepage' })
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Continue with Apple' })
      ).toBeFocused();

      // Repeated activation must work when the URL already has the fragment.
      await page.getByRole('link', { name: 'Skip to form' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#auth-form')).toBeFocused();
    });
  }
}

for (const route of ['/waitlist', '/error/user-creation-failed']) {
  for (const width of [390, 768, 1440]) {
    test(`standalone ${route} retains a main landmark and keyboard skip at ${width}px @smoke`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#auth-form')).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);
      await page.getByRole('link', { name: 'Skip to form' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#auth-form')).toBeFocused();
    });
  }
}

for (const width of [390, 768, 1440]) {
  test(`waitlist invite recovery has one main landmark at ${width}px @smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/waitlist/invite', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Invite link missing' })
    ).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(
      page.getByRole('link', { name: 'Check waitlist status' })
    ).toHaveAttribute('href', '/waitlist');
  });
}
