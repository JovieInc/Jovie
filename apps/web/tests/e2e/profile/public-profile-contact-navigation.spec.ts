import { expect, test } from '@playwright/test';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { waitForHydration } from '../utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`Contact query navigation at ${viewport.width}px`, async ({ page }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize(viewport);
    // The canonical source-backed fixture renders the full public template.
    // Contact actions are inspected only; never activate email or phone links.
    await page.goto('/unfazed?mode=contact');
    await waitForHydration(page);
    const contact = page.getByTestId('profile-mode-drawer-contact');
    await expect(contact).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(contact).toBeHidden();

    const shell = page.getByTestId('public-profile-layout-shell');
    const initialBounds = await shell.boundingBox();
    expect(initialBounds).not.toBeNull();

    for (let transition = 0; transition < 2; transition += 1) {
      await page.getByRole('button', { name: 'About', exact: true }).click();
      const about = page.getByTestId('profile-about-contacts');
      await expect(about).toBeVisible();
      await about.getByRole('link', { name: /Brand Partnerships/i }).click();
      await expect(page).toHaveURL(/\/unfazed\?mode=contact$/);
      await expect(contact).toBeVisible();
      expect(await shell.boundingBox()).toEqual(initialBounds);

      await page.goBack();
      await expect(page).toHaveURL(/\/unfazed\?mode=about$/);
      await expect(contact).toBeHidden();
      await expect(about).toBeVisible();
      await page.goForward();
      await expect(page).toHaveURL(/\/unfazed\?mode=contact$/);
      await expect(contact).toBeVisible();

      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(contact).toBeHidden();
      expect(new URL(page.url()).searchParams.get('mode')).not.toBe('contact');
      expect(await shell.boundingBox()).toEqual(initialBounds);
    }
  });
}
