import { expect, test } from '@playwright/test';

// UI-only fixture: payment correctness stays in claim-checkout.spec.ts.
// Hold the existing checkout read until pending geometry has been measured.
test.use({ storageState: { cookies: [], origins: [] } });

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`billing confirmation stays anchored at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const auth = await page.request.get(
      '/api/dev/test-auth/enter?persona=creator&redirect=/billing/success',
      { maxRedirects: 0 }
    );
    expect(auth.status()).toBe(303);
    await page.route('**/api/billing/status', route =>
      route.fulfill({ json: { isPro: false, plan: 'free' } })
    );
    let releaseCheckout!: () => void;
    const checkoutReady = new Promise<void>(resolve => {
      releaseCheckout = resolve;
    });
    await page.route('**/api/billing/checkout-session**', async route => {
      await checkoutReady;
      await route.fulfill({
        json: {
          status: 'confirmed',
          paymentStatus: 'paid',
          plan: 'pro',
          needsProfile: false,
          proofPending: false,
          profileShareUrl: null,
        },
      });
    });

    try {
      await page.goto('/billing/success?session_id=cs_test_layout', {
        waitUntil: 'domcontentloaded',
      });
      const pending = page.getByTestId('checkout-success-pending');
      await expect(pending).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const before = await pending.boundingBox();
      expect(before).not.toBeNull();
      await test.info().attach('billing-pending', {
        body: await page.screenshot({
          path: test.info().outputPath('billing-pending.png'),
        }),
        contentType: 'image/png',
      });

      releaseCheckout();
      const paid = page.getByTestId('checkout-success-paid');
      await expect(paid).toBeVisible();
      await expect(page.getByTestId('checkout-success-status')).toBeVisible();
      const after = await paid.boundingBox();
      expect(after).not.toBeNull();
      expect(after!.y).toBeCloseTo(before!.y, 0);
      expect(after!.x).toBeCloseTo(before!.x, 0);
      expect(after!.width).toBeCloseTo(before!.width, 0);
      expect(after!.height).toBeGreaterThan(before!.height);
      const fitsViewport = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );
      expect(fitsViewport).toBe(true);
      await test.info().attach('billing-paid', {
        body: await page.screenshot({
          path: test.info().outputPath('billing-paid.png'),
        }),
        contentType: 'image/png',
      });
      const footerLink = paid.getByRole('link').last();
      await footerLink.scrollIntoViewIfNeeded();
      await expect(footerLink).toBeInViewport();
      await test.info().attach('billing-paid-footer', {
        body: await page.screenshot({
          path: test.info().outputPath('billing-paid-footer.png'),
        }),
        contentType: 'image/png',
      });
    } finally {
      releaseCheckout();
    }
  });
}
