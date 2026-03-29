import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

async function stubGtag(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (!globalThis.sessionStorage.getItem('__gtagCalls')) {
      globalThis.sessionStorage.setItem('__gtagCalls', '[]');
    }

    (
      globalThis as typeof globalThis & {
        gtag?: (...args: unknown[]) => void;
      }
    ).gtag = (...args: unknown[]) => {
      const stored = globalThis.sessionStorage.getItem('__gtagCalls') ?? '[]';
      const calls = JSON.parse(stored) as unknown[];
      calls.push(args);
      globalThis.sessionStorage.setItem('__gtagCalls', JSON.stringify(calls));
    };
  });
}

async function getTrackedEvents(
  page: import('@playwright/test').Page
): Promise<string[]> {
  return page.evaluate(() => {
    const stored = globalThis.sessionStorage.getItem('__gtagCalls') ?? '[]';
    const calls = JSON.parse(stored) as Array<[string, string]>;
    return calls.map(call => call[1]);
  });
}

test.describe('/new landing page', () => {
  test('renders the homepage hero and final CTA with noindex metadata', async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.LANDING_NEW, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toContainText(
      /The link your music\s*deserves\./
    );
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Claim your handle.' })
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex, nofollow/
    );
  });

  test('tracks the hero CTA and navigates to signup', async ({ page }) => {
    await stubGtag(page);
    await page.goto(APP_ROUTES.LANDING_NEW, { waitUntil: 'domcontentloaded' });

    await page.getByRole('link', { name: 'Get started' }).click();

    await expect(page).toHaveURL(/\/signup$/);
    expect(await getTrackedEvents(page)).toContain('landing_cta_get_started');
  });

  test('tracks the claim CTA and preserves the onboarding redirect', async ({
    page,
  }) => {
    await stubGtag(page);
    await page.route('**/api/handle/check?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true }),
      })
    );

    await page.goto(APP_ROUTES.LANDING_NEW, { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('textbox', { name: /choose your handle/i })
      .fill('releasefanclub');

    await page.getByTestId('landing-claim-submit').click();

    await expect(page).toHaveURL(
      /\/signup\?redirect_url=%2Fonboarding%3Fhandle%3Dreleasefanclub/
    );
    expect(await getTrackedEvents(page)).toContain('landing_cta_claim_handle');

    const pendingClaim = await page.evaluate(() =>
      globalThis.sessionStorage.getItem('pendingClaim')
    );
    expect(pendingClaim).toContain('releasefanclub');
  });
});
