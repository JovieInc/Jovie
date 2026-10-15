import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// JOV-8350: advisory GET response handling, never account/handle allocation.
// The write fence also makes this selector safe for exact-deployment replay.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ context, baseURL }) => {
  expect(baseURL).toBeDefined();
  await context.addCookies([
    { name: 'jv_tracking_consent', value: 'rejected', url: baseURL! },
  ]);
});

const handle = 'joviedogfood';
const messages = {
  available: `@${handle} is available. Sign up to claim it.`,
  taken: `@${handle} is already taken. You can pick another handle after signing up.`,
  error: `Couldn't check if @${handle} is available. You can still sign up and choose a handle.`,
};
const fixtures = [
  {
    name: 'available',
    status: 200,
    body: { available: true },
    state: 'available',
  },
  { name: 'taken', status: 200, body: { available: false }, state: 'taken' },
  {
    name: '500 JSON',
    status: 500,
    body: { available: false, reason: 'error', error: 'Unavailable' },
    state: 'error',
  },
  {
    name: '429 JSON',
    status: 429,
    body: { available: false, reason: 'error', error: 'Rate limited' },
    state: 'error',
  },
  {
    name: '503 HTML',
    status: 503,
    body: '<html>Unavailable</html>',
    state: 'error',
  },
  { name: 'network failure', status: 0, body: null, state: 'error' },
  { name: 'malformed success', status: 200, body: {}, state: 'error' },
] as const;
type Fixture = (typeof fixtures)[number];

async function intercept(page: Page, fixture: Fixture, delay?: Promise<void>) {
  const evidence = {
    delivered: 0,
    writes: [] as string[],
    handles: [] as string[],
  };
  await page.context().route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      evidence.writes.push(`${request.method()} ${url.pathname}`);
      await route.abort();
    } else if (url.pathname === '/api/handle/check') {
      evidence.delivered++;
      evidence.handles.push(url.searchParams.get('handle') ?? '');
      await delay;
      if (fixture.status === 0) await route.abort('internetdisconnected');
      else
        await route.fulfill({
          status: fixture.status,
          contentType:
            typeof fixture.body === 'string' ? 'text/html' : 'application/json',
          body:
            typeof fixture.body === 'string'
              ? fixture.body
              : JSON.stringify(fixture.body),
        });
    } else await route.continue();
  });
  return evidence;
}

async function ready(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Send sign-in code' })
  ).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

async function settled(page: Page) {
  const output = page.locator('output');
  await expect(output).toHaveCount(1);
  await expect(output).toBeVisible();
  await expect(output).not.toContainText('Checking if');
  return output;
}

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const fixture of fixtures) {
      // The full failure matrix runs normally; reduced motion covers a
      // definitive result and both HTTP/malformed uncertainty transitions.
      if (
        reducedMotion === 'reduce' &&
        !['available', '500 JSON', 'malformed success'].includes(fixture.name)
      )
        continue;
      test(`signup handle ${fixture.name} at ${width}px ${reducedMotion} @smoke`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion });
        const evidence = await intercept(page, fixture);
        const url =
          '/signup?handle=JovieDogfood&redirect_url=%2Fstart%3Fhandle%3Djoviedogfood';
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await expect.poll(() => evidence.delivered).toBeGreaterThan(0);
        const output = await settled(page);
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: testInfo.outputPath('settled-handle.png'),
          fullPage: true,
        });
        // Read the already-settled result before asserting, so deliberate red
        // is a semantic failure rather than a long locator timeout.
        expect((await output.innerText()).replace(/\s+/g, ' ').trim()).toBe(
          messages[fixture.state]
        );
        await expect(output).toHaveAttribute('aria-live', 'polite');
        const box = await output.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await ready(page);
        expect(
          (await (await settled(page)).innerText()).replace(/\s+/g, ' ').trim()
        ).toBe(messages[fixture.state]);
        expect(evidence.delivered).toBeGreaterThanOrEqual(2);
        expect(evidence.handles.every(value => value === handle)).toBe(true);
        expect(evidence.writes).toEqual([]);
        expect(
          await page.evaluate(() => sessionStorage.getItem('pendingClaim'))
        ).toBeNull();
        await testInfo.attach('read-only-requests.json', {
          body: JSON.stringify(evidence),
          contentType: 'application/json',
        });
      });
    }
  }

  test(`signup recovery preserves focus and existing error geometry at ${width}px @smoke`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const evidence = await intercept(page, fixtures[2], pending);
    await page.goto('/signup?handle=JovieDogfood&redirect_url=%2Fstart', {
      waitUntil: 'domcontentloaded',
    });
    await ready(page);
    // Development Strict Mode cancels its first mount and repeats the GET.
    // Both environments must reach one current status without a request loop.
    await expect.poll(() => evidence.delivered).toBeGreaterThan(0);
    await expect(page.locator('output')).toContainText('Checking if');
    const email = page.getByRole('textbox', { name: 'Email', exact: true });
    await email.fill('e2e+jov8350@example.com');
    // Native email inputs intentionally expose no selectionRange API. Select
    // the penultimate character using real keys, then verify the replacement
    // lands there after the asynchronous status update.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    const before = await email.boundingBox();
    const scrollBefore = await page.evaluate(() => scrollY);
    release();
    const output = await settled(page);
    expect((await output.innerText()).replace(/\s+/g, ' ').trim()).toBe(
      messages.error
    );
    await expect(email).toBeFocused();
    await expect(email).toHaveValue('e2e+jov8350@example.com');
    await page.keyboard.type('O');
    await expect(email).toHaveValue('e2e+jov8350@example.cOm');
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
    const corrected = {
      output: await output.boundingBox(),
      email: await email.boundingBox(),
    };
    const axe = await new AxeBuilder({ page })
      .include('output')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('recovery-focused.png'),
      fullPage: true,
    });

    // Compare against the existing passing HTML-error presentation. Pending
    // reflow is measured separately under JOV-6538, never silently certified.
    await page.context().unrouteAll({ behavior: 'wait' });
    const controlEvidence = await intercept(page, fixtures[4]);
    await page.goto('/signup?handle=JovieDogfood&redirect_url=%2Fstart', {
      waitUntil: 'domcontentloaded',
    });
    await ready(page);
    await settled(page);
    const control = {
      output: await page.locator('output').boundingBox(),
      email: await email.boundingBox(),
    };
    for (const key of ['output', 'email'] as const) {
      expect(corrected[key]).not.toBeNull();
      expect(control[key]).not.toBeNull();
      for (const dimension of ['x', 'y', 'width', 'height'] as const)
        expect(
          Math.abs(corrected[key]![dimension] - control[key]![dimension])
        ).toBeLessThanOrEqual(1);
    }
    await testInfo.attach('recovery-geometry-and-a11y.json', {
      body: JSON.stringify({
        corrected,
        control,
        pendingEmail: before,
        pendingToSettledY: corrected.email!.y - before!.y,
        pendingGeometryOwner: 'JOV-6538',
        axeViolations: axe.violations,
        screenReaderAnnouncement:
          'UNKNOWN: DOM/axe do not attest actual assistive technology speech',
      }),
      contentType: 'application/json',
    });
    // CSS zoom exercises engine reflow at 200%; it is not a native browser
    // zoom or screen-reader certificate.
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    for (const control of [
      page.locator('output'),
      email,
      page.getByRole('button', { name: 'Send sign-in code' }),
      page.getByRole('button', { name: 'Continue with Apple' }),
      page.getByRole('button', { name: 'Continue with Google' }),
      page.getByRole('link', { name: 'Sign in', exact: true }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({
      path: testInfo.outputPath('recovery-css-zoom-200.png'),
      fullPage: true,
    });
    const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
    const href = new URL((await signIn.getAttribute('href'))!, page.url());
    expect(href.pathname).toBe('/signin');
    expect(href.searchParams.get('handle')).toBe(handle);
    expect(href.searchParams.get('redirect_url')).toBe('/start');
    await signIn.focus();
    await expect(signIn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(href.href);
    await ready(page);
    expect(evidence.writes).toEqual([]);
    expect(controlEvidence.writes).toEqual([]);
    expect(evidence.delivered).toBeLessThanOrEqual(2);
    expect(evidence.handles.every(value => value === handle)).toBe(true);
  });
}
