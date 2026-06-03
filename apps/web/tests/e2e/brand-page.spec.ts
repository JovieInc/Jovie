import type { Locator } from '@playwright/test';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

type ElementBox = Awaited<ReturnType<Locator['boundingBox']>>;

function expectStableBox(before: ElementBox, after: ElementBox) {
  expect(after).not.toBeNull();
  expect(before).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(
    Math.abs((after?.width ?? 0) - (before?.width ?? 0))
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((after?.height ?? 0) - (before?.height ?? 0))
  ).toBeLessThanOrEqual(1);
}

test.describe('brand page', () => {
  for (const viewport of VIEWPORTS) {
    test(`scrolls on the document and fits ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(SMOKE_TIMEOUTS.HYDRATION_SETTLE);

      await expect(
        page.getByRole('heading', { name: 'One loop. Every release.' })
      ).toBeVisible();
      await expect(page.getByTestId('header-nav')).toHaveAttribute(
        'data-presentation',
        'marketing-glass'
      );
      await expect(page.locator('[data-primary-action="true"]')).toHaveCount(1);

      const primaryAction = page.getByRole('link', {
        name: 'Download brand kit',
      });
      const secondaryAction = page.getByRole('link', {
        name: 'View guidelines',
      });
      await expect(secondaryAction).toHaveClass('system-b-brand-text-link');
      const primaryBox = await primaryAction.boundingBox();
      const secondaryBox = await secondaryAction.boundingBox();

      await primaryAction.focus();
      expectStableBox(primaryBox, await primaryAction.boundingBox());
      await primaryAction.hover();
      expectStableBox(primaryBox, await primaryAction.boundingBox());

      await secondaryAction.focus();
      expectStableBox(secondaryBox, await secondaryAction.boundingBox());
      await secondaryAction.hover();
      expectStableBox(secondaryBox, await secondaryAction.boundingBox());

      const secondaryVisuals = await secondaryAction.evaluate(element => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          borderTopWidth: styles.borderTopWidth,
        };
      });
      expect(secondaryVisuals.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(secondaryVisuals.borderTopWidth).toBe('0px');

      if (viewport.name === 'desktop') {
        const finalTitleSize = await page
          .locator('.system-b-brand-final-title')
          .evaluate(element =>
            Number.parseFloat(getComputedStyle(element).fontSize)
          );
        expect(finalTitleSize).toBeGreaterThanOrEqual(60);
      }

      const contactLink = page.getByRole('link', { name: 'brand@jov.ie' });
      await expect(contactLink).toHaveClass('system-b-brand-contact-link');
      const contactDecoration = await contactLink.evaluate(
        element => getComputedStyle(element).textDecorationLine
      );
      expect(contactDecoration).toContain('underline');

      const before = await page.evaluate(
        () => document.scrollingElement?.scrollTop ?? 0
      );

      await page.locator('#downloads').scrollIntoViewIfNeeded();
      await expect(page.locator('#downloads')).toBeVisible();

      const metrics = await page.evaluate(() => {
        const scrollingElement = document.scrollingElement;
        return {
          bodyOverflow: getComputedStyle(document.body).overflowY,
          documentScrollTop: scrollingElement?.scrollTop ?? 0,
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(metrics.documentScrollTop).toBeGreaterThan(before);
      expect(metrics.bodyOverflow).toBe('visible');
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    });
  }
});
