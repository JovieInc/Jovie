/**
 * Runtime certification slice for JOV-6227. No auth responses are mocked.
 * Request aborts exercise transport failure; they do not prove email delivery,
 * OTP verification, provider round-trips, or physical iPhone behavior.
 *
 * Run with the normal Playwright config for local Better Auth, or the noauth
 * config with CI=1 BASE_URL=<exact deployment> for public browser evidence.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { waitForHydration } from './utils/smoke-test-utils';

const SHELL = '[data-auth-shell-mode]';
const HANDLE = 'jov6227cert';
const claimReturn = `${APP_ROUTES.START}?handle=${HANDLE}`;
const claimQuery = new URLSearchParams({
  handle: HANDLE,
  redirect_url: claimReturn,
});
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();

// Every test starts signed out. Unavailable/disabled auth is a failure, never a skip.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 90_000 });

async function readBuild(page: Page) {
  const response = await page.request.get('/api/version');
  expect(response.ok(), 'Build identity endpoint must respond').toBe(true);
  const build: unknown = await response.json();
  expect(build).toEqual({ buildId: expect.any(String) });
  const buildId = (build as { buildId: string }).buildId;
  expect(buildId.length).toBeGreaterThan(0);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(response.url()).hostname
    )
  ) {
    expect(buildId, 'Hosted evidence needs a commit build ID').toMatch(
      /^[a-f0-9]{7,40}$/
    );
  }
  return buildId;
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({
    path,
    fullPage: !(await page.getByRole('dialog').isVisible()),
  });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectLiveShell(page: Page) {
  const shell = page.locator(SHELL);
  await expect(shell).toHaveCount(1);
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute('data-auth-shell-hydrated', 'true');
  for (const provider of ['Apple', 'Google']) {
    await expect(
      shell.getByRole('button', {
        name: `Continue with ${provider}`,
        exact: true,
      })
    ).toBeEnabled();
  }
  await expect(
    shell.getByRole('textbox', { name: 'Email', exact: true })
  ).toBeEditable();
  await expect(
    shell.getByRole('button', { name: 'Send sign-in code', exact: true })
  ).toBeEnabled();
  await expect(
    shell.getByRole('link', { name: /terms of service/i })
  ).toHaveAttribute('href', APP_ROUTES.LEGAL_TERMS);
  await expect(
    shell.getByRole('link', { name: /privacy policy/i })
  ).toHaveAttribute('href', APP_ROUTES.LEGAL_PRIVACY);
  return shell;
}

async function expectClaim(page: Page) {
  await expect(
    page
      .locator(SHELL)
      .getByRole('link', { name: `Back to @${HANDLE}`, exact: true })
  ).toHaveAttribute('href', `/${HANDLE}?claim=1`);
  const url = new URL(page.url());
  expect(url.searchParams.get('handle')).toBe(HANDLE);
  expect(url.searchParams.get('redirect_url')).toBe(claimReturn);
}

// Traverse with Tab, rather than programmatically focusing each control.
// Screenshots record the actual browser focus paint for each reachable control.
async function captureKeyboardControls(
  page: Page,
  testInfo: TestInfo,
  scope: Locator
) {
  const controls = scope.locator(
    'a[href], button:not([disabled]), input:not([disabled])'
  );
  const count = await controls.count();
  expect(count).toBeGreaterThanOrEqual(7);
  const reached = new Set<number>();
  for (let step = 0; step < count * 2 + 4 && reached.size < count; step++) {
    await page.keyboard.press('Tab');
    for (let index = 0; index < count; index++) {
      const control = controls.nth(index);
      const focused = await control.evaluate(
        element => element === document.activeElement
      );
      if (!focused || reached.has(index)) continue;
      await expect(control).toBeInViewport();
      reached.add(index);
      await capture(page, testInfo, `keyboard-control-${index}`);
    }
  }
  expect(
    reached.size,
    'Every enabled auth control must be reachable with Tab'
  ).toBe(count);
}

test.beforeEach(async ({ page }, testInfo) => {
  const buildId = await readBuild(page);
  testInfo.annotations.push({ type: 'served-build', description: buildId });
  // Keep this public certification slice read-only even if validation regresses.
  await page.route('**/api/auth/**', route =>
    route.request().method() === 'POST'
      ? route.abort('internetdisconnected')
      : route.continue()
  );
});

test.afterEach(async ({ page, browser }, testInfo) => {
  await page.context().setOffline(false);
  const before = testInfo.annotations.find(
    annotation => annotation.type === 'served-build'
  )?.description;
  const after = await readBuild(page);
  await capture(page, testInfo, 'final-state');
  const identityPath = testInfo.outputPath('runtime-identity.json');
  writeFileSync(
    identityPath,
    JSON.stringify(
      {
        test: testInfo.title,
        status: testInfo.status,
        sourceHead,
        specSha256: createHash('sha256')
          .update(readFileSync(testInfo.file))
          .digest('hex'),
        origin: testInfo.project.use.baseURL,
        url: page.url(),
        servedBuildBefore: before,
        servedBuildAfter: after,
        browser: testInfo.project.name,
        browserVersion: browser.version(),
        userAgent: await page.evaluate(() => navigator.userAgent),
        viewport: page.viewportSize(),
        capturedAt: new Date().toISOString(),
        physicalDevice: false,
      },
      null,
      2
    )
  );
  await testInfo.attach('runtime-identity', {
    path: identityPath,
    contentType: 'application/json',
  });
  expect(after, 'Do not combine evidence across deployments').toBe(before);
});

for (const route of [APP_ROUTES.SIGNIN, APP_ROUTES.SIGNUP]) {
  test(`${route} full page validates email and exposes all keyboard controls @auth-certification`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const shell = await expectLiveShell(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    let authRequests = 0;
    page.on('request', request => {
      if (
        new URL(request.url()).pathname.startsWith('/api/auth/') &&
        request.method() === 'POST'
      )
        authRequests++;
    });
    const submit = shell.getByRole('button', {
      name: 'Send sign-in code',
      exact: true,
    });
    await submit.click();
    await expect(page.locator('#auth-email-error')).toBeVisible();
    for (const email of ['not-email', 'name@host']) {
      await shell
        .getByRole('textbox', { name: 'Email', exact: true })
        .fill(email);
      await submit.click();
      await expect(page.locator('#auth-email-error')).toBeVisible();
      await expect(page.locator('[data-auth-email-code-step]')).toHaveAttribute(
        'data-auth-email-code-step',
        'email'
      );
    }
    expect(authRequests, 'Invalid email must never reach auth').toBe(0);
    await page.locator('#auth-form').focus();
    await captureKeyboardControls(page, testInfo, shell);
  });

  test(`${route} reflows with 200% text at 390px @auth-certification`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const shell = await expectLiveShell(page);
    // Desktop browser text-resize simulation, not iOS Dynamic Type or keyboard proof.
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth
            ) - innerWidth
        )
      )
      .toBeLessThanOrEqual(1);
    const controls = shell.locator('a[href], button, input');
    for (let index = 0; index < (await controls.count()); index++) {
      const control = controls.nth(index);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
    }
    await capture(page, testInfo, '200-percent-text');
    // Hidden overflow and partial intersection can hide clipped labels. Inspect
    // actual text/target bounds as well as scrollWidth (JOV-8362).
    const clipped = await shell.evaluate(root => {
      const bounds = [
        ...root.querySelectorAll('a, button, input, label, h1'),
      ].map(element => {
        const rect = element.getBoundingClientRect();
        return {
          text:
            element.textContent ||
            element.getAttribute('aria-label') ||
            element.tagName,
          left: rect.left,
          right: rect.right,
        };
      });
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (
          !node.textContent?.trim() ||
          node.parentElement?.closest(
            '.sr-only, [aria-hidden="true"], [hidden]'
          )
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width && rect.height)
            bounds.push({
              text: node.textContent,
              left: rect.left,
              right: rect.right,
            });
        }
      }
      return bounds.filter(
        rect => rect.left < -1 || rect.right > innerWidth + 1
      );
    });
    const clippedPath = testInfo.outputPath('clipped-content.json');
    writeFileSync(clippedPath, JSON.stringify(clipped, null, 2));
    await testInfo.attach('clipped-content', {
      path: clippedPath,
      contentType: 'application/json',
    });
    expect(
      clipped,
      'All auth labels and targets must fit the visible width at 200% text'
    ).toEqual([]);
  });
}

for (const entry of [
  { origin: APP_ROUTES.HOME, route: APP_ROUTES.SIGNIN },
  { origin: APP_ROUTES.LAUNCH, route: APP_ROUTES.SIGNUP },
]) {
  test(`${entry.route} soft navigation opens a modal and reload opens a full page @auth-certification`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(entry.origin, { waitUntil: 'load' });
    await waitForHydration(page);
    const entryLink = page.locator(`a[href="${entry.route}"]:visible`).first();
    await entryLink.click();
    await expect(page).toHaveURL(url => url.pathname === entry.route);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectLiveShell(page);
    await captureKeyboardControls(page, testInfo, dialog);
    await capture(page, testInfo, 'intercepted-modal');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(url => url.pathname === entry.origin);
    await entryLink.click();
    await expect(dialog).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectLiveShell(page);
    await expect(page).toHaveURL(url => url.pathname === entry.route);
  });
}

test('claim entry survives mode switch and provider transport failure/retry @auth-certification', async ({
  page,
}, testInfo) => {
  await page.goto(`${APP_ROUTES.SIGNUP}?${claimQuery}`, {
    waitUntil: 'domcontentloaded',
  });
  let shell = await expectLiveShell(page);
  await expectClaim(page);
  await expect(
    shell.getByRole('heading', { name: `Claim @${HANDLE}`, exact: true })
  ).toBeVisible();
  await shell.getByRole('link', { name: 'Sign in', exact: true }).click();
  shell = await expectLiveShell(page);
  await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN);
  await expectClaim(page);
  const attempts: unknown[] = [];
  // Transport fault injection only: no fake Better Auth response or provider callback.
  await page.route('**/api/auth/sign-in/social', async route => {
    attempts.push(route.request().postDataJSON());
    await route.abort('internetdisconnected');
  });
  for (const provider of ['Apple', 'Google', 'Apple']) {
    await shell
      .getByRole('button', { name: `Continue with ${provider}`, exact: true })
      .click();
    await expect(shell.getByRole('alert')).toBeVisible();
    await expectLiveShell(page);
    await expectClaim(page);
    await capture(page, testInfo, `provider-failure-${attempts.length}`);
  }
  expect(attempts).toHaveLength(3);
  for (const [index, provider] of ['apple', 'google', 'apple'].entries()) {
    expect(attempts[index]).toEqual(
      expect.objectContaining({
        provider,
        callbackURL: claimReturn,
        errorCallbackURL: expect.stringContaining(`handle=${HANDLE}`),
      })
    );
  }
  await testInfo.attach('aborted-provider-requests', {
    body: Buffer.from(JSON.stringify(attempts, null, 2)),
    contentType: 'application/json',
  });
});

test('valid email pending, send transport failure and retry retain claim context @auth-certification', async ({
  page,
}, testInfo) => {
  await page.goto(`${APP_ROUTES.SIGNUP}?${claimQuery}`, {
    waitUntil: 'domcontentloaded',
  });
  const shell = await expectLiveShell(page);
  await expectClaim(page);
  const email = shell.getByRole('textbox', { name: 'Email', exact: true });
  await email.fill('e2e+jov6227cert@example.com');
  let release: (() => void) | undefined;
  let attempts = 0;
  await page.route(
    '**/api/auth/email-otp/send-verification-otp',
    async route => {
      attempts++;
      if (attempts === 1)
        await new Promise<void>(resolve => {
          release = resolve;
        });
      await route.abort('internetdisconnected');
    }
  );
  const submit = shell.getByRole('button', {
    name: 'Send sign-in code',
    exact: true,
  });
  await submit.click();
  try {
    await expect.poll(() => attempts).toBe(1);
    await expect(email).toBeDisabled();
    await expect(
      shell.getByRole('button', { name: /sending/i })
    ).toBeDisabled();
    await capture(page, testInfo, 'email-pending');
  } finally {
    release?.();
  }
  await expect(page.locator('#auth-email-error')).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(email).toHaveValue('e2e+jov6227cert@example.com');
  await expectClaim(page);
  await submit.click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.locator('#auth-email-error')).toBeVisible();
  await expect(submit).toBeEnabled();
  await expectClaim(page);
});

// Production regression (2026-10-18/20): an email typed or autofilled before
// hydration was wiped by the first client render, so the click showed "Enter
// your email address." and no OTP request was made. Script chunks are held
// until the field is filled so the typing always lands before hydration.
test('email typed before hydration survives and is sent @auth-certification', async ({
  page,
}) => {
  const typedEmail = 'e2e+prehydration@example.com';
  let releaseScripts: (() => void) | undefined;
  const scriptsReleased = new Promise<void>(resolve => {
    releaseScripts = resolve;
  });
  // Hold JavaScript only; stylesheets share the chunks path and must load
  // for the server-rendered form to become visible.
  await page.route(
    url =>
      url.pathname.startsWith('/_next/static/chunks/') &&
      url.pathname.endsWith('.js'),
    async route => {
      await scriptsReleased;
      await route.continue();
    }
  );
  const sentBodies: string[] = [];
  await page.route(
    '**/api/auth/email-otp/send-verification-otp',
    async route => {
      sentBodies.push(route.request().postData() ?? '');
      await route.abort('internetdisconnected');
    }
  );

  try {
    await page.goto(APP_ROUTES.SIGNIN, { waitUntil: 'commit' });
    const email = page.locator('#auth-email');
    await email.waitFor({ state: 'visible' });
    await expect(page.locator(SHELL)).toHaveAttribute(
      'data-auth-shell-hydrated',
      'false'
    );
    await email.fill(typedEmail);
  } finally {
    releaseScripts?.();
  }

  const shell = await expectLiveShell(page);
  const email = shell.getByRole('textbox', { name: 'Email', exact: true });
  await expect(email).toHaveValue(typedEmail);
  await shell
    .getByRole('button', { name: 'Send sign-in code', exact: true })
    .click();

  await expect.poll(() => sentBodies.length).toBe(1);
  expect(JSON.parse(sentBodies[0])).toMatchObject({ email: typedEmail });
  await expect(email).toHaveValue(typedEmail);
  await expect(page.locator('#auth-email-error')).not.toHaveText(
    'Enter your email address.'
  );
});

// JOV-8342: abort every auth POST even when the client validator regresses.
// A generic transport failure is not evidence of client validation.
for (const width of [390, 768, 1440]) {
  test(`malformed mailboxes are rejected before any auth POST at ${width}px @auth-certification`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests: string[] = [];
    page.on('request', request => {
      if (
        new URL(request.url()).pathname.startsWith('/api/auth/') &&
        request.method() === 'POST'
      ) {
        requests.push(new URL(request.url()).pathname);
      }
    });
    await page.goto(APP_ROUTES.SIGNUP, { waitUntil: 'domcontentloaded' });
    const shell = await expectLiveShell(page);
    const email = shell.getByRole('textbox', { name: 'Email', exact: true });
    const submit = shell.getByRole('button', {
      name: 'Send sign-in code',
      exact: true,
    });
    for (const [index, value] of [
      '<script>@example.com',
      'artist,name@example.com',
      'artíst@example.com',
      'artist@-example.com',
      'artist@example-.com',
      'artist..name@example.com',
    ].entries()) {
      await email.fill(value);
      if (index % 2 === 0) await email.press('Enter');
      else await submit.click();
      await expect(page.locator('#auth-email-error')).toBeVisible();
      expect(requests, `${value} must not reach auth`).toHaveLength(0);
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await expect(email).toHaveAccessibleDescription(
        'That email address doesn’t look right. Check it and try again.'
      );
      await expect(email).toBeEditable();
      await expect(email).toHaveValue(value);
      await expect(submit).toBeEnabled();
      await expect(page.locator('[data-auth-email-code-step]')).toHaveAttribute(
        'data-auth-email-code-step',
        'email'
      );
      await expect
        .poll(() =>
          page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        )
        .toBeLessThanOrEqual(1);
    }
    await testInfo.attach('unexpected-auth-posts', {
      body: Buffer.from(JSON.stringify(requests)),
      contentType: 'application/json',
    });
    await capture(page, testInfo, 'mailbox-validation');
  });
}
