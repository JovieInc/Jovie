import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ context, baseURL }) => {
  expect(baseURL).toBeDefined();
  // Keep the anonymous visitor's analytics choice deterministic across regions.
  await context.addCookies([
    { name: 'jv_tracking_consent', value: 'rejected', url: baseURL! },
  ]);
});

// JOV-8349: return-URL rendering, not provider authentication. Block writes so
// the same regression can safely replay against an exact deployed revision.
const returns = [
  [
    'canonical failure',
    'error=oauth_failed',
    'Something went wrong with sign-up. Please try again.',
  ],
  [
    'canonical cancellation',
    'error=oauth_failed&error=access_denied',
    'Sign-in was cancelled. Try again, or pick a different method.',
  ],
  [
    'legacy cancellation',
    'oauth_error=access_denied',
    'Sign-in was cancelled. Try again, or pick a different method.',
  ],
] as const;

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const [name, error, message] of returns) {
      test(`signup ${name} at ${width}px with ${reducedMotion} @smoke`, async ({
        page,
        context,
      }, testInfo) => {
        let mutationAttempts = 0;
        await context.route('**/api/**', async route => {
          if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
            await route.continue();
          } else {
            mutationAttempts++;
            await route.abort();
          }
        });
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion });
        const claim = new URLSearchParams({
          handle: 'JovieDogfood',
          redirect_url: '/start?handle=joviedogfood',
          email: 'fixture@example.com',
        });
        const returnUrl = `/signup?${claim}&${error}#recovery`;
        await page.goto(returnUrl, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/signup\?/);
        const submit = page.getByRole('button', { name: 'Send sign-in code' });
        await expect(submit).toBeEnabled();
        const feedback = page.getByRole('alert').filter({ hasText: /\S/ });
        await expect(feedback).toHaveCount(1);
        await expect(feedback).toBeVisible();
        await expect(feedback).toHaveText(message);
        const email = page.getByRole('textbox', { name: 'Email', exact: true });
        // The query email belongs to conflict messaging, not form prefill.
        await expect(email).toHaveValue('');
        await email.fill('e2e+jov8349@example.com');

        // A fleeting alert before URL cleanup is not readable recovery.
        await page.waitForTimeout(1000);
        await expect(feedback).toBeVisible();
        await expect(feedback).toHaveText(message);
        await expect(email).toHaveValue('e2e+jov8349@example.com');
        const cleaned = new URL(page.url());
        expect(cleaned.searchParams.has('error')).toBe(false);
        expect(cleaned.searchParams.has('oauth_error')).toBe(false);
        expect(cleaned.searchParams.get('handle')).toBe('JovieDogfood');
        expect(cleaned.searchParams.get('redirect_url')).toBe(
          '/start?handle=joviedogfood'
        );
        expect(cleaned.hash).toBe('#recovery');
        const box = await feedback.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: testInfo.outputPath('settled-return.png'),
          fullPage: true,
        });

        // Reloading the cleaned URL consumes feedback; revisiting the original
        // return must show it again, without any automatic auth submission.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(submit).toBeEnabled();
        await expect(feedback).toHaveCount(0);
        await page.goto(returnUrl, { waitUntil: 'domcontentloaded' });
        await expect(submit).toBeEnabled();
        await expect(feedback).toHaveText(message);
        const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
        const href = new URL((await signIn.getAttribute('href'))!, page.url());
        expect(href.pathname).toBe('/signin');
        expect(href.searchParams.get('handle')).toBe('joviedogfood');
        expect(href.searchParams.get('redirect_url')).toBe(
          '/start?handle=joviedogfood'
        );
        expect(href.searchParams.has('error')).toBe(false);
        expect(href.searchParams.has('oauth_error')).toBe(false);
        expect(href.searchParams.has('email')).toBe(false);
        await signIn.focus();
        await expect(signIn).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(href.href);
        await expect(submit).toBeEnabled();
        await expect(feedback).toHaveCount(0);
        expect(mutationAttempts).toBe(0);
      });
    }
  }
}

test('signup recovers the callback URL emitted by its provider control @smoke', async ({
  page,
  context,
}, testInfo) => {
  const blockedWrites: string[] = [];
  const funnelSteps: unknown[] = [];
  await context.route('**/api/**', async route => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      await route.continue();
    } else {
      const pathname = new URL(route.request().url()).pathname;
      blockedWrites.push(pathname);
      if (pathname === '/api/journey/step') {
        funnelSteps.push(route.request().postDataJSON());
      }
      await route.abort();
    }
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/signup?handle=JovieDogfood&redirect_url=%2Fstart', {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('button', { name: 'Send sign-in code' })
  ).toBeEnabled();
  const request = page.waitForRequest(
    candidate =>
      candidate.method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/auth/sign-in/social'
  );
  await page.getByRole('button', { name: 'Continue with Apple' }).click();
  const body = (await request).postDataJSON() as { errorCallbackURL: string };
  expect(typeof body.errorCallbackURL).toBe('string');
  const callback = new URL(body.errorCallbackURL, page.url());
  expect(callback.origin).toBe(new URL(page.url()).origin);
  expect(callback.pathname).toBe('/signup');
  expect(callback.searchParams.getAll('error')).toEqual(['oauth_failed']);
  await expect(
    page.getByRole('button', { name: 'Continue with Apple' })
  ).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
  await expect.poll(() => funnelSteps.length).toBe(2);

  // Better Auth appends the provider error to this published callback URL.
  // The provider-start POST was aborted; this is a return-rendering fixture,
  // not a successful OAuth/state/PKCE/session validation receipt.
  callback.searchParams.append('error', 'access_denied');
  await page.goto(callback.href, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('button', { name: 'Send sign-in code' })
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath('callback-return-ready.png'),
    fullPage: true,
  });
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
    'Sign-in was cancelled. Try again, or pick a different method.'
  );
  expect(new URL(page.url()).searchParams.get('handle')).toBe('joviedogfood');
  expect(new URL(page.url()).searchParams.get('redirect_url')).toBe('/start');
  expect(blockedWrites.sort()).toEqual([
    '/api/auth/sign-in/social',
    '/api/journey/step',
    '/api/journey/step',
  ]);
  // AuthShell records the explicit start and the locally aborted failure.
  expect(funnelSteps).toHaveLength(2);
  expect(funnelSteps).toEqual(
    expect.arrayContaining([
      { funnel: 'artist_signup', step: 'auth_start', surface: 'signup' },
      {
        funnel: 'artist_signup',
        step: 'auth_start',
        outcome: 'error',
        surface: 'signup',
        reason: 'oauth_start_failed',
      },
    ])
  );
});
