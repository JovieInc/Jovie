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

test.describe('public Brand System page', () => {
  for (const viewport of VIEWPORTS) {
    test(`renders and fits ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(SMOKE_TIMEOUTS.HYDRATION_SETTLE);

      await expect(
        page.getByRole('heading', { name: 'Build Jovie From The Source.' })
      ).toBeVisible();
      await expect(page.getByTestId('header-nav')).toHaveAttribute(
        'data-presentation',
        'homepage-embedded'
      );
      await expect(page.locator('[data-primary-action="true"]')).toHaveCount(1);
      await expect(page.locator('section[id]')).toHaveCount(18);

      const primaryAction = page.getByRole('link', {
        name: /Download Brand System/,
      });
      const secondaryAction = page.getByRole('link', {
        name: 'How the system works',
      });
      await expect(primaryAction).toHaveAttribute('data-size', 'lg');
      await expect(secondaryAction).toHaveAttribute(
        'data-variant',
        'secondary'
      );

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

      const before = await page.evaluate(
        () => document.scrollingElement?.scrollTop ?? 0
      );
      await page.locator('#downloads').scrollIntoViewIfNeeded();
      await expect(page.locator('#downloads')).toBeVisible();

      const metrics = await page.evaluate(() => ({
        bodyOverflow: getComputedStyle(document.body).overflowY,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(metrics.documentScrollTop).toBeGreaterThan(before);
      expect(metrics.bodyOverflow).toBe('visible');
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);

      const header = page.getByTestId('header-nav');
      await expect(header).toHaveAttribute('data-scrolled', 'true');
      const headerBackground = await header.evaluate(
        element => getComputedStyle(element).backgroundColor
      );
      expect(headerBackground).not.toBe('rgba(0, 0, 0, 0)');
    });
  }

  test('serves the manifest and every registered download', async ({
    page,
    request,
  }) => {
    await page.goto('/brand');

    const manifestLink = page.getByRole('link', { name: /JSON manifest/ });
    const manifestHref = await manifestLink.getAttribute('href');
    expect(manifestHref).toBe('/brand/Jovie-Brand-System.json');

    const manifestResponse = await request.get(manifestHref ?? '');
    expect(manifestResponse.ok()).toBe(true);
    expect(manifestResponse.headers()['content-type']).toContain(
      'application/json'
    );
    const manifest = (await manifestResponse.json()) as {
      readonly version: string;
      readonly assets: readonly {
        readonly href: string;
        readonly sha256: string;
      }[];
      readonly media: { readonly published: readonly unknown[] };
    };
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.media.published).toEqual([]);

    for (const asset of manifest.assets) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      const response = await request.get(asset.href);
      expect(response.ok(), asset.href).toBe(true);
    }
  });

  test('keeps a static reduced-motion fallback with zero dominant delight', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/brand');

    await expect(page.locator('[data-dominant-delight]')).toHaveCount(0);
    await expect(page.getByText('Dominant delight on this page')).toBeVisible();
    await expect(
      page.locator('.system-b-brand-motion-status strong')
    ).toHaveText('0');

    const activeAnimations = await page
      .locator('.system-b-brand-page *')
      .evaluateAll(elements =>
        elements
          .map(element => getComputedStyle(element).animationName)
          .filter(name => name !== 'none')
      );
    expect(activeAnimations).toEqual([]);
  });
});
