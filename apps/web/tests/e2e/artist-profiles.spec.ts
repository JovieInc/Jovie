import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

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

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page
) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

async function getViewportHeight(page: import('@playwright/test').Page) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  return viewport?.height ?? 0;
}

async function expectFullyInViewport(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator
) {
  const box = await locator.boundingBox();
  const viewportHeight = await getViewportHeight(page);

  expect(box).not.toBeNull();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    viewportHeight
  );
}

const MODE_TRANSITION_SETTLE_MS = 400;
const GEOMETRY_TOLERANCE_PX = 1;
const ARTIST_PROFILE_MODE_LABELS = [
  'Pre-save',
  'Out now',
  'On tour',
  'Support',
] as const;

interface GeometrySnapshot {
  readonly documentTop: number;
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

async function getGeometrySnapshot(
  locator: import('@playwright/test').Locator
): Promise<GeometrySnapshot> {
  return locator.evaluate(el => {
    const rect = el.getBoundingClientRect();

    (
      window as unknown as {
        __jovieOriginalEntryMark?: (phase: string) => void;
      }
    ).__jovieOriginalEntryMark?.(
      `geometry:${el.getAttribute('data-testid') ?? el.getAttribute('role') ?? el.tagName}`
    );

    return {
      documentTop: window.scrollY + rect.top,
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  });
}

// Diagnosis only: observe the original two-click entry without settling,
// recentering, changing focus, or changing the 400ms/1px oracle.
async function observeOriginalEntry(
  page: import('@playwright/test').Page,
  identity: { title: string; retry: number; project: string }
) {
  page.on('console', message => {
    if (message.text().startsWith('ORIGINAL_ENTRY_TRACE ')) {
      console.log(message.text());
    }
  });
  await page.addInitScript(identity => {
    let sequence = 0;
    let frames = 0;
    let omittedEvents = 0;
    let lastScrollY = window.scrollY;
    let readinessKey = '';
    let readyDeliveredAt: number | null = null;
    let readyDeliveredFrame: number | null = null;
    let firstPointerSurfaces: Record<string, unknown> | null = null;
    const controlPointers: {
      phase: string;
      ready: string | null;
      disabled: boolean;
      focus: unknown;
      scrollY: number;
    }[] = [];
    const rect = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        documentTop: box.top + window.scrollY,
        x: box.x,
        y: box.y,
        height: box.height,
        width: box.width,
      };
    };
    const describe = (element: Element | null) =>
      element
        ? {
            tag: element.tagName,
            role: element.getAttribute('role'),
            label: element.closest('[role="tab"]')?.textContent,
          }
        : null;
    const record = (phase: string, event?: Event) => {
      // Bound console lines and observer work; keep all explicit phase marks.
      if (
        ++sequence > 240 &&
        !phase.startsWith('phase:') &&
        !phase.startsWith('geometry:')
      ) {
        omittedEvents++;
        return;
      }
      const section = document.querySelector(
        '[data-testid="artist-profile-section-adaptive"]'
      );
      const tabList = section?.querySelector('[role="tablist"]') ?? null;
      const image = section?.querySelector('img');
      const pointer = event instanceof MouseEvent ? event : null;
      const surfaces = {
        section: rect(section),
        phone: rect(image ?? null),
        tabList: rect(tabList),
        panel: rect(tabList?.nextElementSibling ?? null),
      };
      if (
        phase === 'pointerdown' &&
        !firstPointerSurfaces &&
        tabList?.contains(event?.target as Node)
      ) {
        firstPointerSurfaces = surfaces;
      }
      (
        window as unknown as { __jovieFirstPointerSurfaces: unknown }
      ).__jovieFirstPointerSurfaces = firstPointerSurfaces;
      const targetTab =
        event?.target instanceof Element
          ? event.target.closest('[role="tab"]')
          : null;
      if (
        targetTab &&
        ['pointerdown', 'pointerup', 'click'].includes(phase) &&
        controlPointers.length < 12
      ) {
        controlPointers.push({
          phase,
          ready:
            section
              ?.querySelector('[data-interactive-ready]')
              ?.getAttribute('data-interactive-ready') ?? null,
          disabled: targetTab.hasAttribute('disabled'),
          focus: describe(document.activeElement),
          scrollY: window.scrollY,
        });
      }
      (
        window as unknown as { __jovieControlPointers: unknown }
      ).__jovieControlPointers = controlPointers;
      console.info(
        'ORIGINAL_ENTRY_TRACE ' +
          JSON.stringify({
            identity,
            documentId: performance.timeOrigin,
            path: location.pathname,
            sequence,
            phase,
            at: performance.now(),
            frames,
            readyDeliveredAt,
            readyDeliveredFrame,
            sinceReadyMs:
              readyDeliveredAt === null
                ? null
                : performance.now() - readyDeliveredAt,
            sinceReadyFrames:
              readyDeliveredFrame === null
                ? null
                : frames - readyDeliveredFrame,
            hasFocus: document.hasFocus(),
            visibility: document.visibilityState,
            dpr: window.devicePixelRatio,
            htmlScrollBehavior: getComputedStyle(document.documentElement)
              .scrollBehavior,
            htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
            omittedEvents,
            scrollY: window.scrollY,
            maxScroll:
              document.documentElement.scrollHeight - window.innerHeight,
            viewport: [window.innerWidth, window.innerHeight],
            ready: section
              ?.querySelector('[data-interactive-ready]')
              ?.getAttribute('data-interactive-ready'),
            selected: tabList?.querySelector('[aria-selected="true"]')
              ?.textContent,
            panelText: tabList?.nextElementSibling?.textContent?.slice(0, 600),
            documentReady: document.readyState,
            fonts: document.fonts.status,
            image: image
              ? {
                  complete: image.complete,
                  naturalWidth: image.naturalWidth,
                  currentSrc: image.currentSrc,
                }
              : null,
            focus: describe(document.activeElement),
            target: describe(
              event?.target instanceof Element ? event.target : null
            ),
            pointer: pointer
              ? {
                  x: pointer.clientX,
                  y: pointer.clientY,
                  hit: describe(
                    document.elementFromPoint(pointer.clientX, pointer.clientY)
                  ),
                }
              : null,
            surfaces,
            tabs: Array.from(
              tabList?.querySelectorAll('[role="tab"]') ?? []
            ).map(tab => ({
              label: tab.textContent,
              disabled: tab.hasAttribute('disabled'),
              bounds: rect(tab),
            })),
          })
      );
    };
    (
      window as unknown as { __jovieOriginalEntryMark: (phase: string) => void }
    ).__jovieOriginalEntryMark = record;
    for (const type of [
      'scroll',
      'focusin',
      'pointerdown',
      'pointerup',
      'click',
      'wheel',
    ]) {
      document.addEventListener(type, event => record(type, event), {
        capture: true,
        passive: true,
      });
    }
    new MutationObserver(() => {
      const section = document.querySelector(
        '[data-testid="artist-profile-section-adaptive"]'
      );
      const ready = section
        ?.querySelector('[data-interactive-ready]')
        ?.getAttribute('data-interactive-ready');
      const disabled = Array.from(
        section?.querySelectorAll('[role="tab"]') ?? []
      ).map(tab => tab.hasAttribute('disabled'));
      const key = JSON.stringify([ready, disabled]);
      if (key === readinessKey) return;
      readinessKey = key;
      if (
        ready === 'true' &&
        disabled.length === 4 &&
        disabled.every(value => !value) &&
        readyDeliveredAt === null
      ) {
        readyDeliveredAt = performance.now();
        readyDeliveredFrame = frames;
      }
      record('readiness-mutation-delivery');
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-interactive-ready', 'disabled'],
    });
    const frame = () => {
      frames++;
      if (window.scrollY !== lastScrollY) {
        lastScrollY = window.scrollY;
        record('raf-scroll-change');
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, identity);
}

async function markOriginalEntry(
  page: import('@playwright/test').Page,
  phase: string
) {
  await page.evaluate(label => {
    (
      window as unknown as {
        __jovieOriginalEntryMark?: (phase: string) => void;
      }
    ).__jovieOriginalEntryMark?.(`phase:${label}`);
  }, phase);
}

function expectStableGeometry(
  baseline: GeometrySnapshot,
  current: GeometrySnapshot,
  surface: string
) {
  for (const key of ['documentTop', 'height', 'width', 'x', 'y'] as const) {
    expect(
      Math.abs(current[key] - baseline[key]),
      `${surface} ${key} shifted`
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  }
}

test.describe('Artist Profiles Landing', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (
      testInfo.title ===
        'adaptive mode changes preserve desktop and mobile geometry' ||
      testInfo.title.startsWith('entry discriminator:')
    ) {
      await observeOriginalEntry(page, {
        title: testInfo.title,
        retry: testInfo.retry,
        project: testInfo.project.name,
      });
    }
    await interceptAnalytics(page);
    await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (
      testInfo.title ===
        'adaptive mode changes preserve desktop and mobile geometry' ||
      testInfo.title.startsWith('entry discriminator:')
    ) {
      try {
        await markOriginalEntry(page, `finally:${testInfo.status}`);
      } catch {
        console.log(
          'ORIGINAL_ENTRY_TRACE ' +
            JSON.stringify({
              phase: 'finally-incomplete',
              status: testInfo.status,
              reason: 'page-mark-unavailable',
            })
        );
      }
    }
  });

  test('hero renders with headline and CTAs', async ({ page }) => {
    const claimLink = page
      .getByRole('link', {
        name: /claim your profile/i,
      })
      .first();

    await expect(
      page.getByRole('heading', {
        name: /the link your music deserves\./i,
      })
    ).toBeVisible();
    await expect(claimLink).toBeVisible();
    await expect(claimLink).toHaveAttribute('href', /\/start/);
    await expectFullyInViewport(page, claimLink);
  });

  test('final CTA renders with claim form', async ({ page }) => {
    const finalCta = page.getByTestId('artist-profile-section-final-cta');
    await expect(
      finalCta.getByRole('heading', {
        name: 'Claim your profile.',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByTestId('final-cta-action').getByText(/claim your profile/i)
    ).toBeVisible();
    await expect(page.getByTestId('final-cta-action')).toHaveAttribute(
      'href',
      /\/start/
    );
  });

  test('singular artist-profile alias preserves the canonical experience', async ({
    page,
  }) => {
    await page.goto('/artist-profile', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(
      page.getByRole('heading', {
        name: /the link your music deserves\./i,
      })
    ).toBeVisible();
    await expect(
      page.getByTestId('artist-profile-section-adaptive')
    ).toHaveCount(1);
  });

  test('hero stays intact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(
      page.getByRole('heading', {
        name: /the link your music deserves\./i,
      })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    const claimLink = page
      .getByRole('link', { name: /claim your profile/i })
      .first();
    await expect(claimLink).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expectFullyInViewport(page, claimLink);
  });

  test('keeps mode choices pending before JavaScript attaches their handlers', async ({
    browser,
    page,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 900 },
    });
    try {
      const pendingPage = await context.newPage();
      await interceptAnalytics(pendingPage);
      await pendingPage.goto(new URL('/artist-profiles', page.url()).href, {
        waitUntil: 'domcontentloaded',
      });
      const adaptive = pendingPage.getByTestId(
        'artist-profile-section-adaptive'
      );
      await adaptive.scrollIntoViewIfNeeded();
      await expect(
        adaptive.locator('[data-interactive-ready]')
      ).toHaveAttribute('aria-busy', 'true');
      const choices = adaptive.getByRole('tab');
      await expect(choices).toHaveCount(4);
      for (const choice of await choices.all()) {
        await expect(choice).toBeDisabled();
        expect(
          await choice.evaluate(element => getComputedStyle(element).opacity)
        ).toBe('0.5');
      }
      await expectNoHorizontalOverflow(pendingPage);
    } finally {
      await context.close();
    }
  });

  test('adaptive profile exposes four moment-based modes without layout shift', async ({
    page,
  }) => {
    const adaptiveSection = page.getByTestId('artist-profile-section-adaptive');
    await adaptiveSection.scrollIntoViewIfNeeded();

    await expect(
      adaptiveSection.getByRole('heading', {
        name: 'One profile. Right action.',
      })
    ).toBeVisible();
    await expect(adaptiveSection.getByRole('tab')).toHaveCount(4);
    await expect(
      adaptiveSection.locator('[data-interactive-ready]')
    ).toHaveAttribute('data-interactive-ready', 'true');

    const initialHeight = await adaptiveSection.evaluate(
      element => element.getBoundingClientRect().height
    );
    const modes = [
      {
        label: 'Pre-save',
        headline: 'Collect release alerts before it lands.',
        screenshotAlt:
          'Jovie artist profile inviting fans to get release updates.',
      },
      {
        label: 'Out now',
        headline:
          'When the song is live, fans go straight to the right service.',
        screenshotAlt:
          'Jovie artist profile showing a release-day listen view.',
      },
      {
        label: 'On tour',
        headline: "When you're on the road, nearby dates come first.",
        screenshotAlt:
          'Jovie artist profile showing nearby shows and ticket paths.',
      },
      {
        label: 'Support',
        headline: 'At the merch table, one scan becomes support and capture.',
        screenshotAlt: 'Jovie artist profile showing direct support options.',
      },
    ] as const;

    for (const mode of modes) {
      const tab = adaptiveSection.getByRole('tab', { name: mode.label });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(
        adaptiveSection
          .getByRole('tabpanel', { name: mode.label })
          .getByText(mode.headline, { exact: true })
      ).toBeVisible();
      await expect(
        adaptiveSection.getByAltText(mode.screenshotAlt)
      ).toBeVisible();

      const selectedHeight = await adaptiveSection.evaluate(
        element => element.getBoundingClientRect().height
      );
      expect(Math.abs(selectedHeight - initialHeight)).toBeLessThanOrEqual(1);
    }
  });

  test('adaptive mode changes preserve desktop and mobile geometry', async ({
    page,
  }) => {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 960 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);

      const adaptiveSection = page.getByTestId(
        'artist-profile-section-adaptive'
      );
      const phone = adaptiveSection.getByRole('img').first();
      const tabList = adaptiveSection.getByRole('tablist', {
        name: 'Profile Modes',
      });
      const panelSlot = tabList.locator('xpath=following-sibling::*[1]');
      const upcomingRelease = adaptiveSection.getByRole('tab', {
        name: 'Pre-save',
      });

      await markOriginalEntry(page, `${viewport.name}:entry-before-scroll`);
      await tabList.scrollIntoViewIfNeeded();
      await markOriginalEntry(page, `${viewport.name}:entry-after-scroll`);
      await expect(phone).toBeVisible();
      await expect(tabList).toBeVisible();
      await expect(panelSlot).toBeVisible();
      await markOriginalEntry(page, `${viewport.name}:first-presave-invoke`);
      await upcomingRelease.click();
      await markOriginalEntry(page, `${viewport.name}:first-presave-resolved`);
      await expect(upcomingRelease).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(MODE_TRANSITION_SETTLE_MS);

      const baseline = {
        adaptive: await getGeometrySnapshot(adaptiveSection),
        panel: await getGeometrySnapshot(panelSlot),
        phone: await getGeometrySnapshot(phone),
        tabList: await getGeometrySnapshot(tabList),
      };
      await markOriginalEntry(page, `${viewport.name}:baseline-collected`);

      for (const label of ARTIST_PROFILE_MODE_LABELS) {
        const tab = adaptiveSection.getByRole('tab', { name: label });
        await markOriginalEntry(page, `${viewport.name}:${label}:invoke`);
        await tab.click();
        await markOriginalEntry(page, `${viewport.name}:${label}:resolved`);
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await page.waitForTimeout(MODE_TRANSITION_SETTLE_MS);
        await markOriginalEntry(page, `${viewport.name}:${label}:400ms`);

        await expectNoHorizontalOverflow(page);
        expectStableGeometry(
          baseline.adaptive,
          await getGeometrySnapshot(adaptiveSection),
          `${viewport.name} adaptive section`
        );
        expectStableGeometry(
          baseline.phone,
          await getGeometrySnapshot(phone),
          `${viewport.name} phone`
        );
        expectStableGeometry(
          baseline.tabList,
          await getGeometrySnapshot(tabList),
          `${viewport.name} tab list`
        );
        expectStableGeometry(
          baseline.panel,
          await getGeometrySnapshot(panelSlot),
          `${viewport.name} panel slot`
        );
      }

      await page.waitForTimeout(2500);
      await expect(
        adaptiveSection.getByRole('tab', { name: 'Support' })
      ).toHaveAttribute('aria-selected', 'true');
    }
  });

  // Mechanistic controls only. The original subject above remains unchanged.
  for (const mechanism of [
    'ready-before-entry locator',
    'earliest-ready coordinate',
    'disabled pending coordinate',
  ] as const) {
    test(`entry discriminator: ${mechanism}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      const section = page.getByTestId('artist-profile-section-adaptive');
      const phone = section.getByRole('img').first();
      const tabList = section.getByRole('tablist', { name: 'Profile Modes' });
      const panel = tabList.locator('xpath=following-sibling::*[1]');
      const preSave = section.getByRole('tab', { name: 'Pre-save' });
      const ready = section.locator('[data-interactive-ready]');
      const readSurfaces = async () => ({
        section: await getGeometrySnapshot(section),
        phone: await getGeometrySnapshot(phone),
        tabList: await getGeometrySnapshot(tabList),
        panel: await getGeometrySnapshot(panel),
      });
      type NativePoint = {
        x: number;
        y: number;
        fullyVisible: boolean;
        hit: boolean;
      };
      const clickCoordinate = async (
        tab: import('@playwright/test').Locator,
        alreadyMeasured?: NativePoint
      ) => {
        const point =
          alreadyMeasured ??
          (await tab.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const x = rect.x + rect.width / 2;
            const y = rect.y + rect.height / 2;
            return {
              x,
              y,
              fullyVisible:
                rect.y >= 0 &&
                rect.bottom <= innerHeight &&
                rect.x >= 0 &&
                rect.right <= innerWidth,
              hit: element.contains(document.elementFromPoint(x, y)),
            };
          }));
        expect(
          point.fullyVisible,
          'native target fully visible without recentering'
        ).toBe(true);
        expect(point.hit, 'native coordinate hit matches target').toBe(true);
        await page.mouse.click(point.x, point.y);
      };
      if (mechanism === 'ready-before-entry locator') {
        await expect(ready).toHaveAttribute('data-interactive-ready', 'true');
        await expect(preSave).toBeEnabled();
      }
      await markOriginalEntry(page, `${mechanism}:entry-before-scroll`);
      await tabList.scrollIntoViewIfNeeded();
      await markOriginalEntry(page, `${mechanism}:entry-after-scroll`);
      await expect(phone).toBeVisible();
      await expect(tabList).toBeVisible();
      await expect(panel).toBeVisible();
      if (mechanism === 'disabled pending coordinate') {
        const outNow = section.getByRole('tab', { name: 'Out now' });
        const naturallyPending = await outNow.isDisabled();
        await markOriginalEntry(
          page,
          `disabled-control:naturally-pending:${naturallyPending}`
        );
        test.skip(
          !naturallyPending,
          'No naturally pending control; inconclusive, no forced hydration delay'
        );
        await clickCoordinate(outNow);
        await markOriginalEntry(page, 'disabled-control:pointer-resolved');
        const observed = await page.evaluate(
          () =>
            (
              window as unknown as {
                __jovieControlPointers: {
                  phase: string;
                  ready: string | null;
                  disabled: boolean;
                  focus: { tag: string } | null;
                }[];
              }
            ).__jovieControlPointers
        );
        const down = observed.find(event => event.phase === 'pointerdown');
        const up = observed.find(event => event.phase === 'pointerup');
        const disabledThroughout =
          down?.ready === 'false' &&
          up?.ready === 'false' &&
          down.disabled &&
          up.disabled;
        await markOriginalEntry(
          page,
          `disabled-control:observed-disabled-throughout:${disabledThroughout}`
        );
        test.skip(
          !disabledThroughout,
          'Pointer crossed ready transition or was not observed disabled; inconclusive'
        );
        expect(
          down?.focus?.tag,
          'disabled pointer keeps original BODY focus'
        ).toBe('BODY');
        expect(up?.focus?.tag, 'disabled pointer does not accept focus').toBe(
          'BODY'
        );
        await expect(ready).toHaveAttribute('data-interactive-ready', 'true');
        await page.waitForTimeout(MODE_TRANSITION_SETTLE_MS);
        await markOriginalEntry(
          page,
          'disabled-control:natural-ready-plus-400ms'
        );
        await expect(preSave).toHaveAttribute('aria-selected', 'true');
        return;
      }
      let enabledPoint: NativePoint | undefined;
      if (mechanism === 'earliest-ready coordinate') {
        // Read-only transition observation avoids expect polling and extra
        // measurement round trips. Actual pointer latency remains in the trace.
        enabledPoint = await page.evaluate(
          () =>
            new Promise<NativePoint>(resolve => {
              const observer = new MutationObserver(check);
              function check() {
                const section = document.querySelector(
                  '[data-testid="artist-profile-section-adaptive"]'
                );
                const ready = section
                  ?.querySelector('[data-interactive-ready]')
                  ?.getAttribute('data-interactive-ready');
                const tab = Array.from(
                  section?.querySelectorAll('[role="tab"]') ?? []
                ).find(element => element.textContent === 'Pre-save');
                if (ready !== 'true' || !tab || tab.hasAttribute('disabled'))
                  return;
                observer.disconnect();
                const rect = tab.getBoundingClientRect();
                const x = rect.x + rect.width / 2;
                const y = rect.y + rect.height / 2;
                (
                  window as unknown as {
                    __jovieOriginalEntryMark?: (phase: string) => void;
                  }
                ).__jovieOriginalEntryMark?.(
                  'phase:earliest-ready coordinate:first-presave-invoke'
                );
                resolve({
                  x,
                  y,
                  fullyVisible:
                    rect.y >= 0 &&
                    rect.bottom <= innerHeight &&
                    rect.x >= 0 &&
                    rect.right <= innerWidth,
                  hit: tab.contains(document.elementFromPoint(x, y)),
                });
              }
              observer.observe(document, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['data-interactive-ready', 'disabled'],
              });
              check();
            })
        );
      } else {
        await markOriginalEntry(page, `${mechanism}:first-presave-invoke`);
      }
      if (mechanism === 'ready-before-entry locator') await preSave.click();
      else await clickCoordinate(preSave, enabledPoint);
      await markOriginalEntry(page, `${mechanism}:first-presave-resolved`);
      await expect(preSave).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(MODE_TRANSITION_SETTLE_MS);
      const baseline = await readSurfaces();
      const firstPointer = await page.evaluate(
        () =>
          (
            window as unknown as {
              __jovieFirstPointerSurfaces: Record<
                string,
                GeometrySnapshot
              > | null;
            }
          ).__jovieFirstPointerSurfaces
      );
      expect(firstPointer, 'observed first accepted pointer').not.toBeNull();
      await markOriginalEntry(page, `${mechanism}:second-presave-invoke`);
      if (mechanism === 'ready-before-entry locator') await preSave.click();
      else await clickCoordinate(preSave);
      await expect(preSave).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(MODE_TRANSITION_SETTLE_MS);
      const current = await readSurfaces();
      await markOriginalEntry(page, `${mechanism}:second-400ms`);
      for (const surface of ['section', 'phone', 'tabList', 'panel'] as const) {
        expectStableGeometry(
          firstPointer![surface],
          baseline[surface],
          `${mechanism} FIRST ${surface}`
        );
        expectStableGeometry(
          baseline[surface],
          current[surface],
          `${mechanism} SECOND ${surface}`
        );
      }
      await expectNoHorizontalOverflow(page);
    });
  }

  test('canonical sections render in order and proof remains gated', async ({
    page,
  }) => {
    const sectionIds = [
      'artist-profile-section-hero',
      'artist-profile-section-adaptive',
      'artist-profile-section-outcomes',
      'artist-profile-section-capture',
      'artist-profile-section-opinionated',
      'artist-profile-section-spec-wall',
      'artist-profile-section-showcase',
      'artist-profile-section-spec-bento',
      'artist-profile-section-how-it-works',
      'artist-profile-section-release-cycle',
      'artist-profile-section-faq',
      'artist-profile-section-final-cta',
    ];

    for (const sectionId of sectionIds) {
      await expect(page.getByTestId(sectionId)).toHaveCount(1);
    }

    const documentOrder = await page.evaluate(ids => {
      return ids.map(id => {
        const element = document.querySelector(`[data-testid="${id}"]`);
        return element
          ? element.getBoundingClientRect().top + window.scrollY
          : -1;
      });
    }, sectionIds);
    expect(documentOrder).toEqual([...documentOrder].sort((a, b) => a - b));

    await expect(
      page.getByTestId('artist-profile-section-social-proof')
    ).toHaveCount(0);
    await expect(page.getByTestId('artist-profile-section-trust')).toHaveCount(
      0
    );
    await expect(
      page.getByTestId('artist-profile-section-reactivation')
    ).toHaveCount(0);
    await expect(
      page.getByTestId('artist-profile-section-monetization')
    ).toHaveCount(0);
  });

  test('four fan outcomes keep a stable ledger across breakpoints', async ({
    page,
  }) => {
    await expectNoHorizontalOverflow(page);

    const outcomesSection = page.getByTestId('artist-profile-section-outcomes');
    const captureSection = page.getByTestId('artist-profile-section-capture');
    const grid = page.getByTestId('artist-profile-outcomes-grid');
    const scroller = page.getByTestId('artist-profile-outcomes-scroller');
    await outcomesSection.scrollIntoViewIfNeeded();

    await expect(grid).toBeVisible();
    await expect(scroller).toBeHidden();
    await expect(
      outcomesSection.getByTestId('artist-profile-outcome-card')
    ).toHaveCount(4);
    for (const title of ['Listen', 'Show Up', 'Support', 'Stay Close']) {
      await expect(
        outcomesSection.getByRole('heading', { name: title })
      ).toBeVisible();
    }
    const outcomesTop = await outcomesSection.evaluate(
      element => element.getBoundingClientRect().top + window.scrollY
    );
    const captureTop = await captureSection.evaluate(
      element => element.getBoundingClientRect().top + window.scrollY
    );
    expect(captureTop).toBeGreaterThan(outcomesTop);

    const startScrollY = await page.evaluate(() => window.scrollY);
    await grid.locator('li').first().hover();
    await page.mouse.wheel(0, 720);
    await page.waitForTimeout(180);
    const endScrollY = await page.evaluate(() => window.scrollY);
    expect(endScrollY).toBeGreaterThan(startScrollY);

    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const mobileOutcomesSection = page.getByTestId(
      'artist-profile-section-outcomes'
    );
    await mobileOutcomesSection.scrollIntoViewIfNeeded();
    const mobileGrid = page.getByTestId('artist-profile-outcomes-grid');
    const mobileScroller = page.getByTestId('artist-profile-outcomes-scroller');
    await expect(mobileGrid).toBeVisible();
    await expect(mobileScroller).toBeHidden();
    await expect(
      mobileOutcomesSection.getByTestId('artist-profile-outcome-card')
    ).toHaveCount(4);

    await expectNoHorizontalOverflow(page);
  });

  test('capture, opinionated decisions, product truth, steps, and FAQ match the plan', async ({
    page,
  }) => {
    const captureSection = page.getByTestId('artist-profile-section-capture');
    await expect(
      captureSection.getByRole('heading', {
        name: ARTIST_PROFILE_COPY.capture.headline,
      })
    ).toBeVisible();
    const capturePreview = captureSection.getByTestId(
      'artist-profile-capture-demo'
    );
    await expect(capturePreview).toBeVisible();
    await expect(capturePreview.locator('input, button')).toHaveCount(0);

    const opinionatedSection = page.getByTestId(
      'artist-profile-section-opinionated'
    );
    await expect(
      opinionatedSection.getByRole('heading', {
        name: 'Stop designing your link-in-bio.',
      })
    ).toBeVisible();
    await expect(
      opinionatedSection.getByTestId('artist-profile-opinionated-profile')
    ).toBeVisible();

    const specWallSection = page.getByTestId(
      'artist-profile-section-spec-wall'
    );
    await specWallSection.scrollIntoViewIfNeeded();

    await expect(
      specWallSection.getByRole('heading', {
        name: 'Your music stays together. The right action leads.',
      })
    ).toBeVisible();
    await expect(
      specWallSection.getByTestId('artist-profile-truth-tile')
    ).toHaveCount(4);
    await expect(
      specWallSection.getByText('They Know It Is You')
    ).toBeVisible();
    await expect(
      specWallSection.getByText('The Right Next Move')
    ).toBeVisible();
    await expect(
      specWallSection.getByTestId('artist-profile-related-feature')
    ).toHaveCount(4);
    await expect(
      specWallSection.getByRole('link', { name: /See Fan Notifications/i })
    ).toHaveAttribute('href', '/artist-notifications');
    await expect(
      specWallSection.getByRole('link', { name: /See Instant Merch/i })
    ).toHaveAttribute('href', '/instant-merch');

    const howSection = page.getByTestId('artist-profile-section-how-it-works');
    await expect(
      howSection.getByRole('heading', { name: 'One link. Three steps.' })
    ).toBeVisible();
    await expect(
      howSection.getByRole('heading', { name: 'Claim your profile.' })
    ).toBeVisible();
    await expect(
      howSection.getByRole('heading', {
        name: 'Connect your music and links.',
      })
    ).toBeVisible();
    await expect(
      howSection.getByRole('heading', { name: 'Share one link everywhere.' })
    ).toBeVisible();

    const faqSection = page.getByTestId('artist-profile-section-faq');
    await expect(
      faqSection.getByRole('heading', { name: 'Questions' })
    ).toBeVisible();
    await expect(faqSection.getByRole('button')).toHaveCount(4);
    const firstQuestion = faqSection.getByRole('button', {
      name: 'How is this different from Linktree?',
    });
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
    await firstQuestion.click();
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
    await expect(
      faqSection.getByText(/Jovie is built for music release behavior/i)
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });
});
