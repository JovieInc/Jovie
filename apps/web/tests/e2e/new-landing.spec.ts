import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

async function blockAnalytics(page: import('@playwright/test').Page) {
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
  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('renders the simplified premium sections with live profile assets', async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.LANDING_NEW, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toContainText(
      /The link your music\s*deserves\./
    );
    await expect(
      page.getByText(
        'Smart links, release automation, and fan insight that keep every launch moving.'
      )
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();

    await expect(
      page.getByRole('heading', { name: 'Release day, automated.' })
    ).toBeVisible();
    await expect(
      page.getByText('Imported automatically').first()
    ).toBeVisible();
    await expect(page.getByText('Fans notified').first()).toBeVisible();
    await expect(page.getByText('Know every fan by name.')).toHaveCount(0);
    await expect(
      page.getByText('Smart links generated for every release')
    ).toHaveCount(0);

    const desktopProfileImage = page.getByAltText(
      'Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
    );
    const phoneProfileImage = page.locator(
      'img[alt="Mobile artist profile preview with fan actions and listening destinations"]:visible'
    );

    await page
      .getByRole('heading', { name: 'One page. Every fan.' })
      .scrollIntoViewIfNeeded();
    await expect(desktopProfileImage).toBeVisible();
    await expect(desktopProfileImage).toHaveAttribute(
      'src',
      /profile-desktop\.png/
    );
    await expect
      .poll(() =>
        desktopProfileImage.evaluate(
          image => (image as HTMLImageElement).naturalWidth
        )
      )
      .toBeGreaterThan(0);

    await expect(phoneProfileImage).toBeVisible();
    await expect(phoneProfileImage).toHaveAttribute(
      'src',
      /profile-phone\.png/
    );
    await expect
      .poll(() =>
        phoneProfileImage.evaluate(
          image => (image as HTMLImageElement).naturalWidth
        )
      )
      .toBeGreaterThan(0);

    await expect(
      page.getByRole('heading', { name: 'One page. Every fan.' })
    ).toBeVisible();
    await expect(page.getByText('Own every contact').first()).toBeVisible();
    await expect(
      page.getByText('See what brought them in').first()
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Page not found');

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
