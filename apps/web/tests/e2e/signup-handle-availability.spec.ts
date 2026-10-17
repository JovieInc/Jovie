import AxeBuilder from '@axe-core/playwright';
import { test as baseTest, expect, type Page } from '@playwright/test';
import { USERNAME_MAX_LENGTH } from '@/lib/validation/client-username';
import {
  expectAuthPendingStatusContained,
  expectAuthStatusTextContained,
  measureAuthPendingStatus,
  measureAuthStatusText,
} from './utils/auth-text-containment';

const test = baseTest.extend({
  context: async ({ context }, runTest, info) => {
    const attempted: { method: string; path: string }[] = [];
    const completed: { method: string; path: string }[] = [];
    context.on('request', r => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()))
        attempted.push({ method: r.method(), path: new URL(r.url()).pathname });
    });
    context.on('requestfinished', r => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()))
        completed.push({ method: r.method(), path: new URL(r.url()).pathname });
    });
    await context.route('**/*', route =>
      ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
        ? route.continue()
        : route.abort('internetdisconnected')
    );
    try {
      await runTest(context);
    } finally {
      await info.attach('write-census', {
        body: JSON.stringify({ attempted, completed }),
        contentType: 'application/json',
      });
      expect(completed, 'No HTTP write may complete').toEqual([]);
      const mode =
        /^maximum handle transport (empty|email|apple|google) at (390|768|1440)px ([12])x @smoke$/.exec(
          info.title
        )?.[1];
      const path =
        mode === 'email'
          ? '/api/auth/email-otp/send-verification-otp'
          : '/api/auth/sign-in/social';
      const expected =
        mode && mode !== 'empty'
          ? [
              { method: 'POST', path },
              { method: 'POST', path },
            ]
          : [];
      expect(
        attempted.filter(
          x => x.path === '/api/auth' || x.path.startsWith('/api/auth/')
        ),
        'Only declared transport attempts may occur'
      ).toEqual(expected);
    }
  },
});

// JOV-8350: advisory GET response handling, never account/handle allocation.
// The write fence also makes this selector safe for exact-deployment replay.
test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
});
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
  await expect(page.locator('[data-auth-shell-hydrated="true"]')).toHaveCount(
    1
  );
  await expect(
    page.getByRole('button', { name: 'Send sign-in code' })
  ).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

async function currentOutput(page: Page) {
  // Next may retain an inert streamed copy under [hidden]. Certify the
  // exposed page without accepting a second visible or accessible status.
  const output = page.getByRole('status');
  await expect(page.locator('output:visible')).toHaveCount(1);
  await expect(output).toHaveCount(1);
  await expect(output).toBeVisible();
  expect(
    await output.evaluate(
      (node, visibleNode) => {
        const roots = Array.from(
          document.querySelectorAll('[data-auth-shell]')
        ).filter(root =>
          root.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        );
        return (
          node === visibleNode &&
          roots.length === 1 &&
          roots[0].contains(node) &&
          roots[0].querySelectorAll('[data-auth-shell-hydrated="true"]')
            .length === 1
        );
      },
      await page.locator('output:visible').elementHandle()
    )
  ).toBe(true);
  return output;
}

async function settled(page: Page) {
  const output = await currentOutput(page);
  await expect(output).not.toContainText('Checking if');
  return output;
}

async function settleConfiguration(page: Page) {
  // Explicit text scaling/focus can start finite padding transitions.
  // Finish that setup while the request is held; never settle after release.
  return page.evaluate(async targets => {
    await document.fonts.ready;
    const trace = [];
    const deadline = performance.now() + 5000;
    let previous = '';
    let stable = 0;
    while (performance.now() < deadline) {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      const roots = Array.from(
        document.querySelectorAll('[data-auth-shell]')
      ).filter(node =>
        node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      );
      if (roots.length !== 1)
        throw new Error('Expected one visible auth layout during setup');
      const root = roots[0];
      const outputs = Array.from(document.querySelectorAll('output')).filter(
        node =>
          node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      );
      if (
        outputs.length !== 1 ||
        !root.contains(outputs[0]) ||
        outputs[0].getAttribute('aria-busy') !== 'true'
      )
        throw new Error(
          'Setup must retain one pending status in the active auth layout'
        );
      const boxes: Record<
        string,
        { x: number; y: number; width: number; height: number }
      > = {};
      for (const [name, selector] of Object.entries(targets)) {
        const nodes = Array.from(root.querySelectorAll(selector)).filter(node =>
          node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        );
        if (nodes.length !== 1)
          throw new Error(`Expected one ${name} during pending setup`);
        const { x, y, width, height } = nodes[0].getBoundingClientRect();
        boxes[name] = { x, y, width, height };
      }
      const animations = root
        .getAnimations({ subtree: true })
        .filter(
          animation =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().iterations !== Infinity
        );
      const fingerprint = JSON.stringify({
        boxes,
        top: root.scrollTop,
        left: root.scrollLeft,
      });
      stable =
        animations.length === 0 && fingerprint === previous ? stable + 1 : 0;
      previous = fingerprint;
      trace.push({
        boxes,
        finiteAnimations: animations.length,
        padding: getComputedStyle(root).padding,
        busy: outputs[0].getAttribute('aria-busy'),
      });
      if (stable >= 3) return trace;
    }
    throw new Error(
      `Pending signup configuration did not settle within5s: ${JSON.stringify(trace.slice(-3))}`
    );
  }, geometryTargets);
}

const geometryTargets = {
  email: 'input[type="email"]',
  status: 'output',
  column: '[data-auth-form-column]',
  identity: '[data-auth-shell-identity]',
  back: '[data-auth-shell-back]',
  providers: '[data-auth-provider-slots]',
  apple: '[data-auth-provider-slot="apple"]',
  google: '[data-auth-provider-slot="google"]',
  submit: 'button[type="submit"]',
  modeSwitch: '[data-auth-mode-switch]',
  signIn: '[data-auth-mode-switch] a[href^="/signin"]',
  support: '[data-auth-mode-switch] a[href="/support"]',
  legal: '[data-auth-legal-copy]',
  terms: '[data-auth-legal-links] a[href="/legal/terms"]',
  privacy: '[data-auth-legal-links] a[href="/legal/privacy"]',
};

async function authGeometry(page: Page) {
  return page.evaluate(targets => {
    const roots = Array.from(
      document.querySelectorAll('[data-auth-shell]')
    ).filter(root =>
      root.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    );
    if (roots.length !== 1) throw new Error('Expected one visible auth layout');
    const root = roots[0];
    const outputs = Array.from(document.querySelectorAll('output')).filter(
      node =>
        node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    );
    if (outputs.length !== 1 || !root.contains(outputs[0]))
      throw new Error('Expected one visible status in its auth layout');
    const boxes: Record<
      string,
      { x: number; y: number; width: number; height: number }
    > = {};
    for (const [name, selector] of Object.entries(targets)) {
      const elements = Array.from(root.querySelectorAll(selector)).filter(
        element =>
          element.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          })
      );
      if (elements.length !== 1)
        throw new Error(
          `${name}: expected one target, found ${elements.length}`
        );
      const { x, y, width, height } = elements[0].getBoundingClientRect();
      if (!width || (!height && name !== 'status'))
        throw new Error(`${name}: target has no rendered box`);
      boxes[name] = { x, y, width, height };
    }
    return {
      boxes,
      emailFocused:
        document.activeElement?.matches('input[type="email"]') ?? false,
      scroll: {
        windowX: scrollX,
        windowY: scrollY,
        shellX: root.scrollLeft,
        shell: root.scrollTop,
      },
    };
  }, geometryTargets);
}

type AuthGeometry = Awaited<ReturnType<typeof authGeometry>>;

function expectStableGeometry(
  before: AuthGeometry,
  after: AuthGeometry,
  state: string
) {
  for (const [name, box] of Object.entries(before.boxes)) {
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(
        Math.abs(after.boxes[name][dimension] - box[dimension]),
        `${name}.${dimension} moved during ${state}`
      ).toBeLessThanOrEqual(1);
    }
  }
  expect(after.scroll, `scroll moved during ${state}`).toEqual(before.scroll);
  expect(after.emailFocused, `focus moved during ${state}`).toBe(
    before.emailFocused
  );
}

test('signup geometry detector rejects hidden and displaced email controls @smoke', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  const evidence = await intercept(page, fixtures[4], pending);
  await page.goto('/signup?handle=JovieDogfood&redirect_url=%2Fstart', {
    waitUntil: 'domcontentloaded',
  });
  await ready(page);
  const email = page.getByRole('textbox', { name: 'Email', exact: true });
  await email.fill('e2e+geometry-detector@example.com');
  await settleConfiguration(page);
  await currentOutput(page);
  const before = await authGeometry(page);
  const emailNode = await email.elementHandle();
  if (!emailNode) throw new Error('Email fixture is missing');
  const originalStyle = await emailNode.getAttribute('style');
  const restore = () =>
    emailNode.evaluate((node, style) => {
      if (style === null) node.removeAttribute('style');
      else node.setAttribute('style', style);
    }, originalStyle);
  try {
    for (const style of ['opacity:0', 'visibility:hidden']) {
      await emailNode.evaluate(
        (node, value) => node.setAttribute('style', value),
        style
      );
      await expect(authGeometry(page)).rejects.toThrow(
        'email: expected one target'
      );
      await restore();
    }
    await emailNode.evaluate(node =>
      node.setAttribute('style', 'transform:translateY(36px)')
    );
    const displaced = await authGeometry(page);
    expect(() =>
      expectStableGeometry(before, displaced, 'deliberate detector fixture')
    ).toThrow('email.y moved');
    await testInfo.attach('geometry-detector-adversary.json', {
      body: JSON.stringify({
        before,
        displaced,
        rejected: ['opacity:0', 'visibility:hidden', 'translateY(36px)'],
      }),
      contentType: 'application/json',
    });
  } finally {
    try {
      await restore();
    } finally {
      release();
    }
  }
  expect(await emailNode.evaluate(node => node.isConnected)).toBe(true);
  expect(await email.evaluate((node, saved) => node === saved, emailNode)).toBe(
    true
  );
  await settled(page);
  expect(evidence.writes).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const scale of [
      'normal',
      'text-200',
      'text-elements-200',
      'css-zoom-200',
    ] as const) {
      const handles = [handle, 'a'.repeat(USERNAME_MAX_LENGTH)];
      for (const statusHandle of handles) {
        if (
          width === 320 &&
          (reducedMotion !== 'reduce' ||
            scale !== 'text-elements-200' ||
            statusHandle === handle)
        )
          continue;
        if (scale === 'text-elements-200' && statusHandle === handle) continue;
        if (
          width > 390 &&
          reducedMotion === 'no-preference' &&
          statusHandle !== handle &&
          scale !== 'text-elements-200'
        )
          continue;
        test(`signup status keeps surrounding controls stable at ${width}px ${scale} ${reducedMotion}${statusHandle === handle ? '' : ' maximum handle'} @smoke`, async ({
          page,
        }, testInfo) => {
          await page.setViewportSize({ width, height: 1000 });
          await page.emulateMedia({ reducedMotion });
          for (const fixture of [fixtures[4], fixtures[0], fixtures[1]]) {
            await page.context().unroute('**/api/**');
            let release!: () => void;
            const pending = new Promise<void>(resolve => {
              release = resolve;
            });
            const evidence = await intercept(page, fixture, pending);
            const query = new URLSearchParams({
              handle: statusHandle === handle ? 'JovieDogfood' : statusHandle,
              redirect_url: '/start',
            });
            await page.goto(`/signup?${query}`, {
              waitUntil: 'domcontentloaded',
            });
            await ready(page);
            await page.evaluate(scale => {
              if (scale === 'text-200')
                document.documentElement.style.fontSize = '200%';
              if (scale === 'css-zoom-200')
                document.documentElement.style.zoom = '2';
              if (scale === 'text-elements-200') {
                const styles = [
                  ...document.querySelectorAll<HTMLElement>(
                    '[data-auth-shell] *'
                  ),
                ].map(
                  node =>
                    [
                      node,
                      getComputedStyle(node).fontSize,
                      getComputedStyle(node).lineHeight,
                    ] as const
                );
                for (const [node, size, line] of styles) {
                  node.style.fontSize = `${Number.parseFloat(size) * 2}px`;
                  node.style.lineHeight = `${Number.parseFloat(line) * 2}px`;
                }
              }
            }, scale);
            await page.evaluate(() => document.fonts.ready);
            await expect.poll(() => evidence.delivered).toBeGreaterThan(0);
            await testInfo.attach(
              `status-${fixture.state}-initial-census.json`,
              {
                body: JSON.stringify(
                  await page.locator('output').evaluateAll(nodes =>
                    nodes.map(node => ({
                      html: node.outerHTML,
                      hiddenAncestor: node
                        .closest('[hidden]')
                        ?.outerHTML.slice(0, 1000),
                      visible: node.checkVisibility({
                        checkOpacity: true,
                        checkVisibilityCSS: true,
                      }),
                      parent: node.parentElement?.tagName,
                    }))
                  )
                ),
                contentType: 'application/json',
              }
            );
            await expect(page.locator('output:visible')).toHaveCount(1);
            await expect(page.getByRole('status')).toHaveCount(1);
            await expect(page.getByRole('status')).toContainText('Checking if');
            const email = page.getByRole('textbox', {
              name: 'Email',
              exact: true,
            });
            await email.fill('e2e+jov6538@example.com');
            await page.keyboard.press('ArrowLeft');
            await page.keyboard.press('Shift+ArrowLeft');
            const setupTrace = await settleConfiguration(page);
            await currentOutput(page);
            await page.screenshot({
              path: testInfo.outputPath(
                'pending-status-' + fixture.state + '.png'
              ),
              fullPage: true,
            });
            await expectAuthPendingStatusContained(
              await currentOutput(page),
              testInfo,
              statusHandle,
              `status-${fixture.state}`
            );
            const before = await authGeometry(page);
            const sampling = page.evaluate(async targets => {
              document.documentElement.dataset.geometrySampling = 'running';
              const frames = [];
              const deadline = performance.now() + 15_000;
              while (
                document.documentElement.dataset.geometrySampling ===
                  'running' &&
                performance.now() < deadline
              ) {
                await new Promise<void>(resolve =>
                  requestAnimationFrame(() => resolve())
                );
                const roots = Array.from(
                  document.querySelectorAll('[data-auth-shell]')
                ).filter(root =>
                  root.checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                  })
                );
                if (roots.length !== 1)
                  throw new Error(
                    'Expected one visible auth layout during transition'
                  );
                const root = roots[0];
                const outputs = Array.from(
                  document.querySelectorAll('output')
                ).filter(node =>
                  node.checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                  })
                );
                if (outputs.length !== 1 || !root.contains(outputs[0]))
                  throw new Error(
                    'Expected one visible status during transition'
                  );
                const boxes: Record<
                  string,
                  { x: number; y: number; width: number; height: number }
                > = {};
                for (const [name, selector] of Object.entries(targets)) {
                  const elements = Array.from(
                    root.querySelectorAll(selector)
                  ).filter(element =>
                    element.checkVisibility({
                      checkOpacity: true,
                      checkVisibilityCSS: true,
                    })
                  );
                  if (elements.length !== 1)
                    throw new Error(
                      `${name}: expected one target during transition, found ${elements.length}`
                    );
                  const element = elements[0];
                  const { x, y, width, height } =
                    element.getBoundingClientRect();
                  if (
                    !width ||
                    !height ||
                    !element.checkVisibility({
                      checkOpacity: true,
                      checkVisibilityCSS: true,
                    })
                  )
                    throw new Error(
                      `${name}: target disappeared during transition`
                    );
                  boxes[name] = { x, y, width, height };
                }
                frames.push({
                  boxes,
                  emailFocused:
                    document.activeElement?.matches('input[type="email"]') ??
                    false,
                  scroll: {
                    windowX: scrollX,
                    windowY: scrollY,
                    shellX: root.scrollLeft,
                    shell: root.scrollTop,
                  },
                });
              }
              if (
                document.documentElement.dataset.geometrySampling === 'running'
              )
                throw new Error(
                  'Status geometry sampling exceeded its bounded transition window'
                );
              return frames;
            }, geometryTargets);
            await expect
              .poll(() =>
                page.evaluate(
                  () => document.documentElement.dataset.geometrySampling
                )
              )
              .toBe('running');
            let after: AuthGeometry | undefined;
            let frames: AuthGeometry[] = [];
            try {
              release();
              const output = await settled(page);
              expect(
                (await output.innerText()).replace(/\s+/g, ' ').trim()
              ).toBe(messages[fixture.state].replaceAll(handle, statusHandle));
              await expect(email).toBeFocused();
              await expect(email).toHaveValue('e2e+jov6538@example.com');
              await page.waitForTimeout(1000);
              await currentOutput(page);
              after = await authGeometry(page);
            } finally {
              await page.evaluate(() => {
                document.documentElement.dataset.geometrySampling = 'stopped';
              });
              frames = await sampling;
              await testInfo.attach(
                `status-${fixture.state}-transition-frames.json`,
                {
                  body: JSON.stringify({ before, frames }),
                  contentType: 'application/json',
                }
              );
            }
            expect(after).toBeDefined();
            expect(frames.length).toBeGreaterThan(1);
            // A deliberate key edit may scroll an enlarged offscreen caret.
            // Verify retained selection after the async measurement has ended.
            await page.keyboard.type('O');
            await expect(email).toHaveValue('e2e+jov6538@example.cOm');
            const afterUserEdit = await authGeometry(page);
            const observation = {
              state: fixture.state,
              setupTrace,
              before,
              after,
              afterUserEdit,
              frames,
              requests: evidence,
            };
            await testInfo.attach(`status-${fixture.state}-geometry.json`, {
              body: JSON.stringify(observation),
              contentType: 'application/json',
            });
            await page.screenshot({
              path: testInfo.outputPath(
                `status-${fixture.state}-after-caret-edit.png`
              ),
              fullPage: true,
            });
            for (const frame of frames)
              expectStableGeometry(before, frame, fixture.state);
            expectStableGeometry(before, after!, `${fixture.state} after idle`);
            await expectAuthStatusTextContained(
              await currentOutput(page),
              testInfo,
              `status-${fixture.state}`
            );
            expect(evidence.writes).toEqual([]);
            expect(
              evidence.handles.every(value => value === statusHandle)
            ).toBe(true);
          }
        });
      }
    }
  }
  // The extra 320px neighbor covers enlarged continuous-handle geometry.
  if (width === 320) continue;
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
    await expect(page.locator('output:visible')).toHaveCount(1);
    await expect(page.getByRole('status')).toContainText('Checking if');
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
    await page.context().unroute('**/api/**');
    const controlEvidence = await intercept(page, fixtures[4]);
    await page.goto('/signup?handle=JovieDogfood&redirect_url=%2Fstart', {
      waitUntil: 'domcontentloaded',
    });
    await ready(page);
    await settled(page);
    const control = {
      output: await page.getByRole('status').boundingBox(),
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
      page.getByRole('status'),
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

async function scaleStatusText(page: Page, scale: number) {
  await page.evaluate(scale => {
    const styles = [
      ...document.querySelectorAll<HTMLElement>('[data-auth-shell] *'),
    ].map(
      node =>
        [
          node,
          getComputedStyle(node).fontSize,
          getComputedStyle(node).lineHeight,
        ] as const
    );
    for (const [node, size, line] of styles) {
      node.style.fontSize = `${Number.parseFloat(size) * scale}px`;
      node.style.lineHeight = `${Number.parseFloat(line) * scale}px`;
    }
  }, scale);
}

for (const reload of [false, true]) {
  test(`maximum status glyph regression at 390px 2x ${reload ? 'reload' : 'idle'} @smoke`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const maximum = 'a'.repeat(USERNAME_MAX_LENGTH);
    const requests = await intercept(page, fixtures[4]);
    await page.goto(
      `/signup?${new URLSearchParams({ handle: maximum, redirect_url: '/start' })}`,
      { waitUntil: 'domcontentloaded' }
    );
    await ready(page);
    if (reload) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready(page);
    }
    const output = await settled(page);
    await expect(output).toHaveText(messages.error.replaceAll(handle, maximum));
    await scaleStatusText(page, 2);
    await page.waitForTimeout(1000);
    await expectAuthStatusTextContained(
      output,
      info,
      reload ? 'reload' : 'idle'
    );
    await page.screenshot({
      path: info.outputPath(reload ? 'reload-result.png' : 'idle-result.png'),
      fullPage: true,
    });
    expect(requests.writes).toEqual([]);
  });
}

test('status glyph containment detector rejects clipping and disappearance @smoke', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const message = `Couldn't check if @${'a'.repeat(USERNAME_MAX_LENGTH)} is available. You can still sign up and choose a handle.`;
  await page.setContent(
    `<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style><div id="clip" style="width:800px;margin:32px"><div style="width:360px;min-height:500px"><output aria-busy="false" style="display:block;min-height:500px"><p style="font:32px/48px sans-serif;overflow-wrap:anywhere;margin:0">${message}</p></output></div></div>`
  );
  const output = page.getByRole('status');
  const copy = output.locator('p');
  await expectAuthStatusTextContained(output, info, 'wrapped-positive');
  await copy.evaluate(node => {
    node.style.transform = 'translateX(400px)';
  });
  expect(
    (await measureAuthStatusText(output)).failures.some(
      x => x.kind === 'outside-owner'
    )
  ).toBe(true);
  await expect(
    expectAuthStatusTextContained(output, info, 'displaced')
  ).rejects.toThrow('Every settled status glyph');
  await copy.evaluate(node => {
    node.style.transform = '';
  });
  await page.locator('#clip').evaluate(node => {
    node.style.width = '120px';
    node.style.overflow = 'hidden';
  });
  expect(
    (await measureAuthStatusText(output)).failures.some(
      x => x.kind === 'ancestor-clipped'
    )
  ).toBe(true);
  await expect(
    expectAuthStatusTextContained(output, info, 'ancestor-clipped')
  ).rejects.toThrow('Every settled status glyph');
  await page.locator('#clip').evaluate(node => {
    node.style.width = '800px';
    node.style.overflow = '';
  });
  for (const style of ['opacity:0', 'color:transparent', 'visibility:hidden']) {
    const before = await copy.getAttribute('style');
    await copy.evaluate((node, style) => {
      node.setAttribute('style', `${node.getAttribute('style')};${style}`);
    }, style);
    await expect(
      expectAuthStatusTextContained(output, info, `hidden-${style}`)
    ).rejects.toThrow('Every settled status glyph');
    await copy.evaluate((node, before) => {
      node.setAttribute('style', before!);
    }, before);
  }
  await copy.evaluate(node => {
    node.setAttribute('class', 'sr-only');
  });
  await expect(
    expectAuthStatusTextContained(output, info, 'screen-reader-only')
  ).rejects.toThrow('Every settled status glyph');
  await copy.evaluate(node => {
    node.setAttribute('class', '');
  });
  await expectAuthStatusTextContained(output, info, 'restored-positive');
  await output.evaluate(node => node.remove());
  await expect(
    expectAuthStatusTextContained(output, info, 'removed')
  ).rejects.toThrow();
});

test('pending status skeleton detector rejects clipping and disappearance @smoke', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.setContent(
    `<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style><div id="pending-clip" style="width:800px;margin:32px"><div style="width:360px;min-height:160px"><output aria-busy="true" aria-live="polite" aria-atomic="true" style="display:block;min-height:160px"><div style="width:176px;max-width:100%"><div data-slot="loading-skeleton" style="width:100%"><div data-slot="skeleton" aria-hidden="true" style="height:16px;width:100%;background:#ddd"></div></div></div><span class="sr-only">Checking if @pending is available...</span></output></div></div>`
  );
  const output = page.getByRole('status');
  const leaf = output.locator('[data-slot="skeleton"]');
  await expectAuthPendingStatusContained(
    output,
    info,
    'pending',
    'pending-positive'
  );
  await leaf.evaluate(node => {
    node.style.transform = 'translateX(400px)';
  });
  expect((await measureAuthPendingStatus(output)).failures).toContain(
    'outside-width-owner'
  );
  await expect(
    expectAuthPendingStatusContained(
      output,
      info,
      'pending',
      'pending-displaced'
    )
  ).rejects.toThrow('Pending skeleton must');
  await leaf.evaluate(node => {
    node.style.transform = '';
  });
  await page.locator('#pending-clip').evaluate(node => {
    node.style.width = '100px';
    node.style.overflow = 'hidden';
  });
  expect((await measureAuthPendingStatus(output)).failures).toContain(
    'ancestor-clipped'
  );
  await expect(
    expectAuthPendingStatusContained(output, info, 'pending', 'pending-clipped')
  ).rejects.toThrow('Pending skeleton must');
  await page.locator('#pending-clip').evaluate(node => {
    node.style.width = '800px';
    node.style.overflow = '';
  });
  for (const style of [
    'opacity:0',
    'visibility:hidden',
    'display:none',
    'background:transparent',
  ]) {
    const before = await leaf.getAttribute('style');
    await leaf.evaluate(
      (node, style) =>
        node.setAttribute('style', `${node.getAttribute('style')};${style}`),
      style
    );
    await expect(
      expectAuthPendingStatusContained(
        output,
        info,
        'pending',
        `pending-hidden-${style}`
      )
    ).rejects.toThrow('Pending skeleton must');
    await leaf.evaluate(
      (node, before) => node.setAttribute('style', before!),
      before
    );
  }
  const announcement = output.locator('.sr-only');
  for (const attribute of ['aria-hidden', 'hidden']) {
    await announcement.evaluate(
      (node, attribute) => node.setAttribute(attribute, 'true'),
      attribute
    );
    await expect(
      expectAuthPendingStatusContained(
        output,
        info,
        'pending',
        `pending-announcement-${attribute}`
      )
    ).rejects.toThrow('Pending announcement must');
    await announcement.evaluate(
      (node, attribute) => node.removeAttribute(attribute),
      attribute
    );
  }
  await expectAuthPendingStatusContained(
    output,
    info,
    'pending',
    'pending-restored'
  );
  await leaf.evaluate(node => node.remove());
  await expect(
    expectAuthPendingStatusContained(output, info, 'pending', 'pending-removed')
  ).rejects.toThrow('Pending skeleton must');
});

for (const width of [390, 768, 1440])
  for (const scale of [1, 2])
    for (const mode of ['empty', 'email', 'apple', 'google'] as const) {
      test(`maximum handle transport ${mode} at ${width}px ${scale}x @smoke`, async ({
        page,
        context,
      }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const maximum = 'a'.repeat(USERNAME_MAX_LENGTH);
        await intercept(page, fixtures[4]);
        const attempts: string[] = [];
        context.on('request', r => {
          if (
            !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) &&
            new URL(r.url()).pathname.startsWith('/api/auth/')
          )
            attempts.push(new URL(r.url()).pathname);
        });
        let release!: () => void;
        const pending = new Promise<void>(resolve => {
          release = resolve;
        });
        const endpoint =
          mode === 'email'
            ? '/api/auth/email-otp/send-verification-otp'
            : '/api/auth/sign-in/social';
        await page.route(`**${endpoint}`, async route => {
          if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()))
            return route.fallback();
          await pending;
          return route.abort('internetdisconnected');
        });
        try {
          await page.goto(
            `/signup?${new URLSearchParams({ handle: maximum, redirect_url: '/start' })}`,
            { waitUntil: 'domcontentloaded' }
          );
          await ready(page);
          const output = await settled(page);
          await expect(output).toHaveText(
            messages.error.replaceAll(handle, maximum)
          );
          await scaleStatusText(page, scale);
          await expectAuthStatusTextContained(
            output,
            info,
            `transport-${mode}-before`
          );
          const email = page.getByRole('textbox', {
            name: 'Email',
            exact: true,
          });
          const originalNode = await email.elementHandle();
          const submit = page.getByRole('button', {
            name: 'Send sign-in code',
            exact: true,
          });
          if (mode === 'empty') {
            await submit.click();
            await expect(page.locator('#auth-email-error')).toBeVisible();
            expect(attempts).toEqual([]);
          } else {
            await email.fill('e2e+status-resize@example.com');
            const providerName = `Continue with ${mode === 'apple' ? 'Apple' : 'Google'}`;
            const action =
              mode === 'email'
                ? submit
                : page.locator(`[data-auth-provider-slot="${mode}"]`);
            if (mode !== 'email')
              await expect(action).toHaveAccessibleName(providerName);
            const error =
              mode === 'email'
                ? page.locator('#auth-email-error')
                : page.locator('[data-auth-shell-mode]').getByRole('alert');
            await action.click();
            await expect.poll(() => attempts.length).toBe(1);
            if (mode === 'email') await expect(email).toBeDisabled();
            else {
              await expect(action).toBeDisabled();
              await expect(action).toHaveAccessibleName(
                `${providerName} loading`
              );
            }
            await expectAuthStatusTextContained(
              output,
              info,
              `transport-${mode}-pending`
            );
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.evaluate(
              () =>
                new Promise<void>(resolve =>
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                  )
                )
            );
            expect(attempts).toEqual([endpoint]);
            release();
            await expect(error).toBeVisible();
            await expect(action).toBeEnabled();
            if (mode !== 'email')
              await expect(action).toHaveAccessibleName(providerName);
            await expectAuthStatusTextContained(
              output,
              info,
              `transport-${mode}-error`
            );
            await action.click();
            await expect.poll(() => attempts.length).toBe(2);
            await expect(error).toBeVisible();
            await expect(action).toBeEnabled();
            if (mode !== 'email')
              await expect(action).toHaveAccessibleName(providerName);
            await expectAuthStatusTextContained(
              output,
              info,
              `transport-${mode}-retry`
            );
            expect(attempts).toEqual([endpoint, endpoint]);
            await expect(email).toHaveValue('e2e+status-resize@example.com');
          }
          await expect(email).toBeEditable();
          expect(
            await email.evaluate(
              (node, original) => node === original,
              originalNode
            )
          ).toBe(true);
          await expect(submit).toBeEnabled();
          for (const provider of ['Apple', 'Google'])
            await expect(
              page.getByRole('button', {
                name: `Continue with ${provider}`,
                exact: true,
              })
            ).toBeEnabled();
          await expectAuthStatusTextContained(
            output,
            info,
            `transport-${mode}`
          );
          await page.screenshot({
            path: info.outputPath('transport-result.png'),
            fullPage: true,
          });
        } catch (error) {
          await page
            .screenshot({
              path: info.outputPath('transport-failure.png'),
              fullPage: true,
            })
            .catch(() => {});
          throw error;
        } finally {
          release();
        }
      });
    }

test('settled vertical reachability detector accepts scrolling and rejects clipping @smoke', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 500 });
  const paragraphs = Array.from(
    { length: 12 },
    (_, index) =>
      `<p style="margin:0;font:24px/32px sans-serif">Status segment ${index + 1} remains reachable.</p>`
  ).join('');
  await page.setContent(
    `<div id="vertical-port" style="height:180px;width:320px;overflow-y:auto"><div style="width:300px"><output aria-busy="false" style="display:block">${paragraphs}</output><input aria-label="Probe focus" /></div></div>`
  );
  const output = page.getByRole('status');
  const focus = page.getByRole('textbox', { name: 'Probe focus' });
  await focus.focus();
  const before = await page
    .locator('#vertical-port')
    .evaluate(node => node.scrollTop);
  expect(before).toBeGreaterThan(0);
  await expectAuthStatusTextContained(output, info, 'tall-scrollable-positive');
  await expect(focus).toBeFocused();
  expect(
    await page.locator('#vertical-port').evaluate(node => node.scrollTop)
  ).toBe(before);
  for (const overflow of ['hidden', 'clip']) {
    await page.locator('#vertical-port').evaluate((node, overflow) => {
      node.scrollTop = 0;
      node.style.overflowY = overflow;
    }, overflow);
    await expect(
      expectAuthStatusTextContained(output, info, `unreachable-${overflow}`)
    ).rejects.toThrow('Every settled status glyph');
  }
});

test('pending vertical reachability detector accepts scrolling and rejects clipping @smoke', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.setContent(
    `<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style><div id="vertical-port" style="height:180px;width:320px;overflow-y:auto"><div style="width:300px"><output aria-busy="true" aria-live="polite" aria-atomic="true" style="display:block;height:900px;padding-top:600px;box-sizing:border-box"><div style="width:176px;max-width:100%"><div data-slot="loading-skeleton" style="width:100%"><div data-slot="skeleton" aria-hidden="true" style="height:16px;width:100%;background:#ddd"></div></div></div><span class="sr-only">Checking if @pending is available...</span></output><input aria-label="Probe focus" /></div></div>`
  );
  const output = page.getByRole('status');
  const focus = page.getByRole('textbox', { name: 'Probe focus' });
  await focus.focus();
  const before = await page
    .locator('#vertical-port')
    .evaluate(node => node.scrollTop);
  expect(before).toBeGreaterThan(0);
  await expectAuthPendingStatusContained(
    output,
    info,
    'pending',
    'tall-scrollable-positive'
  );
  await expect(focus).toBeFocused();
  expect(
    await page.locator('#vertical-port').evaluate(node => node.scrollTop)
  ).toBe(before);
  for (const overflow of ['hidden', 'clip']) {
    await page.locator('#vertical-port').evaluate((node, overflow) => {
      node.scrollTop = 0;
      node.style.overflowY = overflow;
    }, overflow);
    await expect(
      expectAuthPendingStatusContained(
        output,
        info,
        'pending',
        `unreachable-${overflow}`
      )
    ).rejects.toThrow('Pending skeleton must');
  }
});

for (const kind of ['settled', 'pending'] as const) {
  const effects =
    kind === 'settled'
      ? ['opacity', 'visibility', 'color', 'displaced']
      : ['opacity', 'visibility', 'paint', 'displaced'];
  for (const effect of effects) {
    test(`scroll-reactive ${kind} ${effect} detector @smoke`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 500 });
      const content =
        kind === 'settled'
          ? '<p id="reactive-target" style="margin:0;font:24px/32px sans-serif">Readable status</p>'
          : '<div style="width:176px;max-width:100%"><div data-slot="loading-skeleton" style="width:100%"><div id="reactive-target" data-slot="skeleton" aria-hidden="true" style="height:16px;width:100%;background:#ddd"></div></div></div><span class="sr-only">Checking if @pending is available...</span>';
      await page.setContent(
        `<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style><div id="vertical-port" style="height:180px;width:320px;overflow-y:auto"><div style="width:300px"><output aria-busy="${kind === 'pending'}" aria-live="polite" aria-atomic="true" style="display:block;height:900px;padding-top:600px;box-sizing:border-box">${content}</output><input aria-label="Probe focus" /></div></div>`
      );
      const output = page.getByRole('status');
      await page.getByRole('textbox', { name: 'Probe focus' }).focus();
      await page.evaluate(effect => {
        const port = document.querySelector<HTMLElement>('#vertical-port')!;
        const target = document.querySelector<HTMLElement>('#reactive-target')!;
        port.addEventListener('scroll', () => {
          const bounds = port.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          const entered =
            rect.top >= bounds.top && rect.bottom <= bounds.bottom;
          target.style.opacity = effect === 'opacity' && entered ? '0' : '1';
          target.style.visibility =
            effect === 'visibility' && entered ? 'hidden' : 'visible';
          target.style.color =
            effect === 'color' && entered ? 'transparent' : 'black';
          target.style.background =
            effect === 'paint' && entered ? 'transparent' : '#ddd';
          target.style.transform =
            effect === 'displaced' && entered ? 'translateX(600px)' : 'none';
        });
      }, effect);
      const initial =
        kind === 'settled'
          ? await measureAuthStatusText(output)
          : await measureAuthPendingStatus(output);
      await info.attach('scroll-reactive-initial.json', {
        body: JSON.stringify(initial),
        contentType: 'application/json',
      });
      if (kind === 'settled')
        await expect(
          expectAuthStatusTextContained(output, info, `reactive-${effect}`)
        ).rejects.toThrow('Every settled status glyph');
      else
        await expect(
          expectAuthPendingStatusContained(
            output,
            info,
            'pending',
            `reactive-${effect}`
          )
        ).rejects.toThrow('Pending skeleton must');
    });
  }
}

for (const kind of ['settled', 'pending'] as const) {
  test(`scroll-reactive ${kind} owner-y detector @smoke`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 500 });
    const content =
      kind === 'settled'
        ? '<p id="owner-target" style="margin:0;font:24px/32px sans-serif">Readable status</p>'
        : '<div style="width:176px;max-width:100%"><div data-slot="loading-skeleton" style="width:100%"><div id="owner-target" data-slot="skeleton" aria-hidden="true" style="height:16px;width:100%;background:#ddd"></div></div></div><span class="sr-only">Checking if @pending is available...</span>';
    await page.setContent(
      `<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style><div id="vertical-port" style="height:180px;width:320px;overflow-y:auto"><div style="height:600px"></div><div style="width:300px;height:40px"><output aria-busy="${kind === 'pending'}" aria-live="polite" aria-atomic="true" style="display:block;height:40px">${content}</output></div><div style="height:600px"></div><input aria-label="Probe focus" /></div>`
    );
    const output = page.getByRole('status');
    await page.getByRole('textbox', { name: 'Probe focus' }).focus();
    await page.evaluate(() => {
      const port = document.querySelector<HTMLElement>('#vertical-port')!;
      const target = document.querySelector<HTMLElement>('#owner-target')!;
      port.addEventListener('scroll', () => {
        const bounds = port.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        const entered = rect.top >= bounds.top && rect.bottom <= bounds.bottom;
        target.style.transform = entered ? 'translateY(-60px)' : 'none';
      });
    });
    if (kind === 'settled')
      await expect(
        expectAuthStatusTextContained(output, info, 'reactive-owner-y')
      ).rejects.toThrow('Every settled status glyph');
    else
      await expect(
        expectAuthPendingStatusContained(
          output,
          info,
          'pending',
          'reactive-owner-y'
        )
      ).rejects.toThrow('Pending skeleton must');
  });
}
