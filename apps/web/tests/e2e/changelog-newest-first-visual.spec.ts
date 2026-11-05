import type { Page } from '@playwright/test';
import { expect, test } from './setup';

/**
 * The customer changelog reads newest first and advertises its feeds.
 * Regression for 2026-10-31: receipts with failed checks dropped every post
 * except 2026-10-02, and the rest rendered in CHANGELOG.md section order.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function expectReadableMatteHero(page: Page, viewportWidth: number) {
  const hero = page.locator('.marketing-hero-dock');
  const heading = hero.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  // Decorative photography must not return, while article artwork stays intact.
  await expect(page.locator('.marketing-editorial-hero-photo')).toHaveCount(0);
  await expect(hero.locator('img, picture, video')).toHaveCount(0);

  const heroBounds = await hero.boundingBox();
  const headingBounds = await heading.boundingBox();
  expect(heroBounds).not.toBeNull();
  expect(headingBounds).not.toBeNull();
  if (!heroBounds || !headingBounds) {
    throw new Error('The changelog hero and heading must have rendered bounds');
  }
  expect(headingBounds.width).toBeGreaterThan(0);
  expect(headingBounds.height).toBeGreaterThan(0);
  expect(headingBounds.x).toBeGreaterThanOrEqual(0);
  expect(headingBounds.x + headingBounds.width).toBeLessThanOrEqual(
    viewportWidth
  );
  expect(headingBounds.y).toBeGreaterThanOrEqual(heroBounds.y);
  expect(headingBounds.y + headingBounds.height).toBeLessThanOrEqual(
    heroBounds.y + heroBounds.height
  );

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('changelog newest first', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const viewport of VIEWPORTS) {
    test(`orders entries newest first on a readable matte page at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto('/changelog');

      const entries = page.locator('article.changelog-entry');
      await expect(entries.first()).toBeVisible();

      const dates = await entries
        .locator('.changelog-entry__date')
        .allTextContents();
      const instants = dates.map(text => Date.parse(text.trim()));
      for (const instant of instants) expect(Number.isNaN(instant)).toBe(false);
      expect(instants).toEqual([...instants].sort((a, b) => b - a));

      const subscription = page.getByRole('complementary', {
        name: 'Subscribe To Changelog Updates',
      });
      await expect(
        subscription.getByRole('textbox', { name: 'Email address' })
      ).toBeVisible();
      await expect(
        subscription.getByRole('button', { name: 'Subscribe', exact: true })
      ).toBeVisible();
      await expect(
        subscription.getByRole('link', { name: 'RSS Feed' })
      ).toHaveAttribute('href', '/changelog/feed.xml');
      await expectReadableMatteHero(page, viewport.width);
      await testInfo.attach(`changelog-index-${viewport.width}px`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    });

    test(`keeps release permalinks readable without hero wallpaper at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto('/changelog');

      // Follow a real published technical release instead of hard-coding a version.
      await page.getByText('Browse all updates', { exact: true }).click();
      const releaseLink = page
        .getByRole('navigation', { name: 'Technical Release Log' })
        .getByRole('link')
        .first();
      await expect(releaseLink).toBeVisible();
      const releaseHref = await releaseLink.getAttribute('href');
      expect(releaseHref).toMatch(/^\/changelog\/[^/#?]+$/);
      if (!releaseHref) {
        throw new Error('A published release must have a permalink');
      }
      await releaseLink.click();
      await expect(page).toHaveURL(new URL(releaseHref, page.url()).href);
      await expectReadableMatteHero(page, viewport.width);
      await expect(page.locator('article').first()).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Release navigation' })
      ).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: 'Resources for this release' })
          .getByRole('link', { name: /RSS Feed/ })
      ).toHaveAttribute('href', '/changelog/feed.xml');
      await testInfo.attach(`changelog-release-${viewport.width}px`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });

      await page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: '/changelog', exact: true })
        .click();
      await expect(page).toHaveURL(/\/changelog$/);
      await expect(
        page.locator('article.changelog-entry').first()
      ).toBeVisible();
      await expectReadableMatteHero(page, viewport.width);
    });
  }

  test('advertises the RSS and Atom feeds for autodiscovery', async ({
    page,
  }) => {
    await page.goto('/changelog');
    await expect(
      page.locator('head link[rel="alternate"][type="application/rss+xml"]')
    ).toHaveAttribute('href', /\/changelog\/rss\.xml$/);
    await expect(
      page.locator('head link[rel="alternate"][type="application/atom+xml"]')
    ).toHaveAttribute('href', /\/changelog\/feed\.xml$/);
  });
});
