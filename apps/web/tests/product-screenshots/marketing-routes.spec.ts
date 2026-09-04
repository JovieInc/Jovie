import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing';
import { SCREENSHOT_VIEWPORTS } from '@/lib/screenshots/registry';
import {
  assertNoDevOverlays,
  hideTransientUI,
  SCREENSHOT_CLOCK_ISO,
  TIMEOUTS,
  waitForSettle,
} from './helpers';
import { resolveScreenshotSourceGitSha } from './source-provenance';

const sourceGitSha = resolveScreenshotSourceGitSha();
const HOMEPAGE_CONSENT_REQUIRED_COOKIE = 'jv_cc_required';
const HOMEPAGE_BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';

async function prepareHomepageConsentState(
  page: import('@playwright/test').Page
) {
  await page.addInitScript(() => {
    localStorage.removeItem('jv_cc');
    const target = window as Window & {
      __homepageProofCls?: number;
      __homepageProofClsSupported?: boolean;
    };
    target.__homepageProofCls = 0;
    target.__homepageProofClsSupported =
      PerformanceObserver.supportedEntryTypes.includes('layout-shift');
    if (!target.__homepageProofClsSupported) return;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (!shift.hadRecentInput)
          target.__homepageProofCls =
            (target.__homepageProofCls ?? 0) + shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.setExtraHTTPHeaders({
    'x-vercel-ip-country': 'DE',
    'x-vercel-ip-country-region': 'BE',
  });
  await page.context().addCookies([
    {
      name: HOMEPAGE_CONSENT_REQUIRED_COOKIE,
      value: '1',
      url: HOMEPAGE_BASE_URL,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/spotify/search**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'homepage-proof-artist',
          name: 'Taylor Swift',
          url: 'https://open.spotify.com/artist/homepage-proof-artist',
          followers: 1000,
          verified: true,
          isClaimed: true,
        },
      ]),
    })
  );
}

async function measureHomepageProof(page: import('@playwright/test').Page) {
  const response = await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.NAVIGATION,
  });
  expect(response?.status() ?? 0, 'homepage document status').toBeLessThan(400);
  const banner = page.getByTestId('cookie-banner');
  await expect(
    banner,
    'cookie consent must be observed, never hidden'
  ).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
  const reject = banner.getByRole('button', {
    name: /^reject all$/i,
  });
  await expect(reject).toBeVisible();
  await reject.click();
  await expect(banner).toBeHidden();
  const consent = await page.evaluate(() => {
    const raw = localStorage.getItem('jv_cc');
    return raw ? JSON.parse(raw) : null;
  });
  expect(consent).toMatchObject({
    essential: true,
    analytics: false,
    marketing: false,
  });

  const hero = page.getByTestId('homepage-hero-shell');
  const input = hero.getByPlaceholder('Search your name');
  await input.fill('Taylor');
  const dropdown = hero.locator('[data-dropdown-presentation="attached"]');
  await expect(dropdown).toBeVisible();
  await input.press('ArrowDown');
  await expect(
    dropdown.getByRole('option', { name: /Taylor Swift/i })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', /result-0$/);
  await input.press('Escape');
  await expect(dropdown).toHaveCount(0);

  await waitForSettle(page, 1_000);
  await assertNoDevOverlays(page);
  const [overflow, cls] = await Promise.all([
    page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    ),
    page.evaluate(() => {
      const target = window as Window & {
        __homepageProofCls?: number;
        __homepageProofClsSupported?: boolean;
      };
      return {
        supported: target.__homepageProofClsSupported === true,
        value: target.__homepageProofCls ?? null,
      };
    }),
  ]);
  expect(overflow, 'homepage horizontal overflow').toBeLessThanOrEqual(1);
  expect(cls.supported, 'layout-shift measurement must be supported').toBe(
    true
  );
  expect(cls.value, 'layout-shift measurement must be numeric').not.toBeNull();

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations, 'homepage accessibility violations').toEqual([]);
  const contrast = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze();
  expect(
    contrast.incomplete.filter(result => result.id === 'color-contrast'),
    'color contrast must not be unsupported or incomplete'
  ).toEqual([]);
  expect(contrast.violations, 'homepage color-contrast violations').toEqual([]);
  const colorContrastPass = contrast.passes.find(
    result => result.id === 'color-contrast'
  );
  const contrastSamples = colorContrastPass?.nodes.length ?? 0;
  expect(
    contrastSamples,
    'color contrast must produce measured samples'
  ).toBeGreaterThan(0);

  return {
    axe: { violations: axe.violations.length },
    cls: { value: cls.value },
    consent: { observed: true, action: 'reject-all' as const, value: consent },
    contrast: {
      passed: true,
      method: 'axe-color-contrast',
      samples: contrastSamples,
    },
    interaction: { passed: true, flow: 'autocomplete-keyboard-escape' },
    overflow: { maxHorizontalPx: overflow },
  };
}

test.describe('Exact marketing route screenshots', () => {
  test.describe.configure({ mode: 'parallel', retries: 0 });

  for (const target of MARKETING_EXACT_PUBLIC_ROUTE_TARGETS) {
    for (const viewport of target.viewports) {
      test(`${target.url} ${viewport}`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);

        expect(
          sourceGitSha,
          'Exact-head screenshot evidence requires a clean full source SHA'
        ).toMatch(/^[0-9a-f]{40}$/);

        await page.clock.setFixedTime(new Date(SCREENSHOT_CLOCK_ISO));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize(SCREENSHOT_VIEWPORTS[viewport]);

        const response = await page.goto(target.fixturePath, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.NAVIGATION,
        });
        const documentStatus = response?.status() ?? 0;
        const finalPath = new URL(page.url()).pathname;
        expect(documentStatus, target.url).toBeLessThan(400);
        expect(finalPath, `${target.url} redirected`).toBe(target.expectedPath);
        await expect(
          page.locator(target.expectedRuntimeSelector).first()
        ).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });

        await waitForSettle(page, 1_000);
        await hideTransientUI(page);
        await assertNoDevOverlays(page);

        const screenshotPath = testInfo.outputPath('marketing-route.png');
        await page.screenshot({
          animations: 'disabled',
          fullPage: true,
          path: screenshotPath,
          type: 'png',
        });

        const receiptPath = testInfo.outputPath('receipt.json');
        await writeFile(
          receiptPath,
          `${JSON.stringify(
            {
              capturedAt: new Date().toISOString(),
              documentStatus,
              finalPath,
              route: target.url,
              fixturePath: target.fixturePath,
              sourceGitSha,
              viewport,
            },
            null,
            2
          )}\n`,
          'utf8'
        );

        await testInfo.attach('marketing-route-screenshot', {
          contentType: 'image/png',
          path: screenshotPath,
        });
        await testInfo.attach('marketing-route-receipt', {
          contentType: 'application/json',
          path: receiptPath,
        });
      });
    }
  }
});

test.describe('Homepage screen-proof measurements', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const viewport of ['desktop', 'mobile'] as const) {
    test(`records real cookie and browser metrics for / ${viewport}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      expect(
        sourceGitSha,
        'Homepage metrics require a clean full source SHA'
      ).toMatch(/^[0-9a-f]{40}$/);

      await page.clock.setFixedTime(new Date(SCREENSHOT_CLOCK_ISO));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize(SCREENSHOT_VIEWPORTS[viewport]);
      await prepareHomepageConsentState(page);
      const measurements = await measureHomepageProof(page);

      const screenshotPath = testInfo.outputPath('homepage-proof.png');
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: screenshotPath,
        type: 'png',
      });
      const receiptPath = testInfo.outputPath('homepage-proof-metrics.json');
      await writeFile(
        receiptPath,
        `${JSON.stringify(
          {
            schema: 'screen-browser-measurements/v1',
            status: 'unverified-measurement',
            screenId: 'web.homepage',
            stateScope: 'homepage-cookie-state-observed',
            capturedAt: new Date().toISOString(),
            sourceGitSha,
            viewport,
            ...measurements,
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await testInfo.attach('homepage-proof-screenshot', {
        contentType: 'image/png',
        path: screenshotPath,
      });
      await testInfo.attach('homepage-proof-metrics', {
        contentType: 'application/json',
        path: receiptPath,
      });
    });
  }
});
