import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Presentation fixtures only. Real claim/auth acceptance stays in golden-path.
for (const width of [390, 1280]) {
  test(`actual homepage entry retains its handle through pending and Back at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto(
      '/iframe.html?id=marketing-homepageidentityhero--default&viewMode=story'
    );
    const hero = page.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', { name: 'Start with your name', exact: true })
    ).toBeVisible();
    await expect(hero.getByRole('img', { name: 'Jovie logo' })).toBeVisible();
    const input = hero.getByRole('textbox', { name: 'Choose Your Handle' });
    await expect(input).toBeInViewport();
    const explanation = await page
      .getByTestId('homepage-hero-explanation')
      .boundingBox();
    expect(explanation?.y).toBeGreaterThanOrEqual(844);
    // Storybook wraps fetch before network interception. Use its existing
    // live API hook so this fixture actually reaches the fetch error path.
    await page.evaluate(() => {
      const fixture = window as Window & {
        __homepageAvailabilityCalls?: number;
        __jovieApiMock?: (request: { url: URL }) => Response | undefined;
      };
      fixture.__homepageAvailabilityCalls = 0;
      fixture.__jovieApiMock = ({ url }) => {
        if (url.pathname !== '/api/handle/check') return undefined;
        fixture.__homepageAvailabilityCalls =
          (fixture.__homepageAvailabilityCalls ?? 0) + 1;
        return Response.json(
          { error: 'Availability is temporarily unavailable. Try again.' },
          { status: 503 }
        );
      };
    });
    await input.fill('fixture-claim');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __homepageAvailabilityCalls?: number })
              .__homepageAvailabilityCalls
        )
      )
      .toBeGreaterThan(0);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('homepage-handle-status')).not.toContainText(
      'Checking availability'
    );
    await expect(page.getByTestId('homepage-handle-status')).not.toContainText(
      'is available'
    );
    await page.screenshot({ path: testInfo.outputPath('homepage-error.png') });
    await input.focus();
    await expect(input).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('homepage-focus.png') });
    const before = await input.boundingBox();
    const buttonBefore = await page
      .getByTestId('homepage-primary-cta')
      .boundingBox();
    const sentAt = performance.now();
    await input.press('Enter');
    const pending = hero.getByRole('button', { name: /opening/i });
    await expect(pending).toBeDisabled({ timeout: 1000 });
    const pendingObservedMs = Math.round(performance.now() - sentAt);
    await expect(page.getByTestId('homepage-handle-status')).toContainText(
      'Opening setup for @fixture-claim'
    );
    await input.press('Enter');
    await expect(input).toHaveValue('fixture-claim');
    const after = await input.boundingBox();
    const buttonAfter = await page
      .getByTestId('homepage-primary-cta')
      .boundingBox();
    expect(after).toEqual(before);
    expect(buttonAfter).toEqual(buttonBefore);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('homepage-pending.png'),
    });
    await writeFile(
      testInfo.outputPath('homepage-pending-latency.json'),
      JSON.stringify({
        width,
        pendingObservedMs,
        scope:
          'Actual homepage component; existing Storybook API hook returns HTTP 503 and router is a no-op; no auth or claim mutation.',
      })
    );
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await expect(
      hero.getByRole('button', { name: 'Claim', exact: true })
    ).toBeEnabled();
    await expect(input).toHaveValue('fixture-claim');
    expect(runtimeErrors).toEqual([]);
  });

  test(`populated profile review precedes Google sign-in at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    // Keep the existing funnel instrumentation observable, but local to this
    // presentation fixture. Every other API write remains blocked below.
    await page.addInitScript(() => {
      const fixture = window as Window & {
        onboardingFixtureFunnel?: unknown[];
      };
      fixture.onboardingFixtureFunnel = [];
      const sendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        const target = new URL(String(url), location.href);
        if (
          target.origin === location.origin &&
          target.pathname === '/api/journey/step'
        ) {
          if (data instanceof Blob)
            void data
              .text()
              .then(body =>
                fixture.onboardingFixtureFunnel?.push(JSON.parse(body))
              );
          return true;
        }
        return sendBeacon(url, data);
      };
    });
    const runtimeEvents: Array<{ type: string; detail: string }> = [];
    page.on('pageerror', error =>
      runtimeEvents.push({ type: 'pageerror', detail: error.message })
    );
    page.on('requestfailed', request =>
      runtimeEvents.push({
        type: 'requestfailed',
        detail: `${request.url()} ${request.failure()?.errorText}`,
      })
    );
    page.on('console', message => {
      if (message.type() === 'error')
        runtimeEvents.push({ type: 'console-error', detail: message.text() });
    });
    page.on('response', response => {
      if (response.status() >= 400)
        runtimeEvents.push({
          type: 'http-error',
          detail: `${response.status()} ${response.url()}`,
        });
    });
    const writes: string[] = [];
    await page.route('**/api/**', route => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
        writes.push(route.request().url());
        return route.abort();
      }
      if (route.request().url().includes('/api/auth/get-session'))
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'null',
        });
      return route.continue();
    });
    try {
      await page.goto(
        '/iframe.html?id=features-onboarding-onboardingshell--profile-before-auth&viewMode=story'
      );
      const review = page.getByTestId('onboarding-profile-review');
      await expect(
        review.getByRole('heading', { name: 'Here is jov.ie/fixtureartist' })
      ).toBeVisible();
      await expect(
        review.getByText('Latest release: Fixture release')
      ).toBeVisible();
      const phone = page.getByTestId(
        width < 1024
          ? 'onboarding-profile-rail-inline'
          : 'onboarding-profile-rail'
      );
      await expect(phone).toBeVisible();
      const images = phone.locator('img');
      await expect(images.first()).toBeVisible();
      const releaseArtwork = phone.getByRole('img', {
        name: 'Fixture release artwork',
        exact: true,
      });
      await expect(releaseArtwork).toBeVisible();
      await expect(releaseArtwork).toHaveAttribute('src', /artwork-1\.png/);
      await testInfo.attach('image-state', {
        body: JSON.stringify(
          await images.evaluateAll(imgs =>
            imgs.map(img => ({
              src: img.getAttribute('src'),
              complete: (img as HTMLImageElement).complete,
              naturalWidth: (img as HTMLImageElement).naturalWidth,
            }))
          )
        ),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: testInfo.outputPath('profile-before-auth.png'),
      });
      await expect
        .poll(() =>
          releaseArtwork.evaluate(
            img =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0
          )
        )
        .toBe(true);
      await expect(page.getByTestId('onboarding-save-auth')).toHaveCount(0);
      await review.getByRole('button', { name: /keep this profile/i }).click();
      await expect(page.getByTestId('onboarding-save-auth')).toBeVisible();
      await expect(
        page.getByRole('button', { name: /continue with google/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /continue with google/i })
      ).toBeInViewport();
      await expect(
        page.getByRole('button', { name: /continue with google/i })
      ).toBeFocused();
      await expect(
        page.getByText(/has not been saved to your account/)
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('save-with-google.png'),
      });
      await review.getByRole('button', { name: /back to preview/i }).click();
      await expect(page.getByTestId('onboarding-save-auth')).toHaveCount(0);
      await expect(
        review.getByRole('button', { name: /keep this profile/i })
      ).toBeVisible();
      await expect(
        review.getByRole('button', { name: /keep this profile/i })
      ).toBeFocused();
      expect(writes).toEqual([]);
      expect(
        await page.evaluate(
          () =>
            (window as Window & { onboardingFixtureFunnel?: unknown[] })
              .onboardingFixtureFunnel
        )
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            funnel: 'artist_signup',
            step: 'onboarding_started',
          }),
          expect.objectContaining({
            funnel: 'artist_signup',
            step: 'qualified',
          }),
        ])
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    } finally {
      await writeFile(
        testInfo.outputPath('runtime-events.json'),
        JSON.stringify(runtimeEvents, null, 2)
      );
      await page
        .screenshot({
          path: testInfo.outputPath('final-state.png'),
          timeout: 5000,
        })
        .catch(() => {});
    }
  });

  test(`Enter immediately acknowledges one pending handle submission at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/handle/check?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          freshness: 'fresh',
          reserved: false,
        }),
      })
    );
    await page.goto(
      '/iframe.html?id=marketing-forms-claimhandleform--default&viewMode=story'
    );
    const input = page.getByRole('textbox', { name: 'Choose Your Handle' });
    await expect(input).toBeVisible();
    await input.fill('fixture-claim');
    const sentAt = performance.now();
    await input.press('Enter');
    const pending = page.getByRole('button', { name: /opening/i });
    await expect(pending).toBeDisabled({ timeout: 1000 });
    const pendingObservedMs = Math.round(performance.now() - sentAt);
    await writeFile(
      testInfo.outputPath('pending-latency.json'),
      JSON.stringify({
        width,
        pendingObservedMs,
        scope: 'local Storybook fixture; mocked availability and router',
      })
    );
    await expect(page.getByTestId('claim-handle-status')).toContainText(
      'Opening setup for @fixture-claim'
    );
    await input.press('Enter');
    await expect(pending).toBeDisabled();
    await expect(input).toHaveValue('fixture-claim');
    await page.screenshot({ path: testInfo.outputPath('pending.png') });
    await testInfo.attach('pending-latency', {
      body: JSON.stringify({
        width,
        pendingObservedMs,
        scope: 'local Storybook fixture; mocked availability and router',
      }),
      contentType: 'application/json',
    });
  });

  test(`artist preview retains its handle without fabricating release artwork at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const story = width < 1024 ? 'inline-clearance' : 'side-clearance';
    await page.goto(
      `/iframe.html?id=features-onboarding-onboardingprofilerail--${story}&viewMode=story`
    );
    const rail = page.getByTestId(
      width < 1024
        ? 'onboarding-profile-rail-inline'
        : 'onboarding-profile-rail'
    );
    await expect(rail).toBeVisible();
    await expect(rail).toContainText('testartist');
    await expect(rail.getByText('Listen now', { exact: true })).toHaveCount(0);
    await expect(rail.getByText('your-handle', { exact: false })).toHaveCount(
      0
    );
    await expect(rail.getByText('(source:', { exact: false })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('artist-preview.png') });
  });
}
