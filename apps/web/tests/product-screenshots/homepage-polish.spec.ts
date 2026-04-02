import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertNoDevOverlays,
  hideTransientUI,
  waitForImages,
  waitForSettle,
} from './helpers';

const OUTPUT_DIR = '.final-shots';

const HOMEPAGE_CASES = [
  {
    filename: 'mobile-375-dark.png',
    theme: 'dark',
    viewport: { width: 375, height: 812 },
  },
  {
    filename: 'mobile-375-light.png',
    theme: 'light',
    viewport: { width: 375, height: 812 },
  },
  {
    filename: 'mobile-430-dark.png',
    theme: 'dark',
    viewport: { width: 430, height: 932 },
  },
  {
    filename: 'mobile-430-light.png',
    theme: 'light',
    viewport: { width: 430, height: 932 },
  },
  {
    filename: 'tablet-768-dark.png',
    theme: 'dark',
    viewport: { width: 768, height: 1024 },
  },
  {
    filename: 'tablet-768-light.png',
    theme: 'light',
    viewport: { width: 768, height: 1024 },
  },
  {
    filename: 'laptop-1024-dark.png',
    theme: 'dark',
    viewport: { width: 1024, height: 900 },
  },
  {
    filename: 'laptop-1024-light.png',
    theme: 'light',
    viewport: { width: 1024, height: 900 },
  },
  {
    filename: 'desktop-1440-dark.png',
    theme: 'dark',
    viewport: { width: 1440, height: 1100 },
  },
  {
    filename: 'desktop-1440-light.png',
    theme: 'light',
    viewport: { width: 1440, height: 1100 },
  },
] as const;

async function interceptAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

async function setHomepageTheme(
  page: import('@playwright/test').Page,
  theme: 'light' | 'dark'
) {
  await page.addInitScript(value => {
    localStorage.setItem('jovie-theme', value);
    document.documentElement.classList.toggle('dark', value === 'dark');
    document.documentElement.style.colorScheme = value;
  }, theme);
}

async function warmLazyHomepageImages(page: import('@playwright/test').Page) {
  const targets = [
    '[data-testid="homepage-release-proof-screenshot"]',
    '[data-testid="homepage-system-profile-screenshot"]',
    '[data-testid="homepage-system-audience-screenshot"]',
    '[data-testid="homepage-system-ai-screenshot"]',
    '[data-testid="homepage-system-ai-screenshot-mobile"]',
  ];

  for (const selector of targets) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await waitForSettle(page, 140);
  }

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await waitForSettle(page, 600);
  await waitForImages(page).catch(() => {});
}

test.describe
  .serial('Homepage polish captures', () => {
    test.beforeAll(async () => {
      await mkdir(OUTPUT_DIR, { recursive: true });
    });

    for (const screenshotCase of HOMEPAGE_CASES) {
      test(screenshotCase.filename, async ({ page }) => {
        test.setTimeout(240_000);

        await page.setViewportSize(screenshotCase.viewport);
        await page.emulateMedia({ colorScheme: screenshotCase.theme });
        await interceptAnalytics(page);
        await setHomepageTheme(page, screenshotCase.theme);

        await page.goto('/', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });

        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
          timeout: 20_000,
        });

        await page.evaluate(theme => {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          document.documentElement.style.colorScheme = theme;
        }, screenshotCase.theme);

        await waitForImages(page).catch(() => {});
        await warmLazyHomepageImages(page);
        await waitForSettle(page, 1200);
        await hideTransientUI(page);
        await assertNoDevOverlays(page);

        await page.screenshot({
          path: join(OUTPUT_DIR, screenshotCase.filename),
          fullPage: true,
        });
      });
    }
  });
