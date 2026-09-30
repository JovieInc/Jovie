import type { Page } from '@playwright/test';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

function installTrace() {
  const samples: unknown[] = [];
  let recording = true;
  const snapshot = (event: string, detail?: Record<string, unknown>) => {
    const section = document.querySelector(
      '[data-testid="artist-profile-section-adaptive"]'
    );
    const tabs = section?.querySelector('[role="tablist"]');
    const rect = (element: Element | null | undefined) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        documentTop: window.scrollY + box.top,
        height: box.height,
        width: box.width,
        x: box.x,
        y: box.y,
      };
    };
    const value = {
      event,
      detail,
      at: performance.now(),
      scrollY: window.scrollY,
      dpr: window.devicePixelRatio,
      fonts: document.fonts.status,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      image: section?.querySelector('img')?.getAttribute('src'),
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      ready: section
        ?.querySelector('[data-interactive-ready]')
        ?.getAttribute('data-interactive-ready'),
      selected: tabs?.querySelector('[aria-selected="true"]')?.textContent,
      focus: {
        tag: document.activeElement?.tagName,
        role: document.activeElement?.getAttribute('role'),
        text: document.activeElement?.textContent?.trim().slice(0, 80),
      },
      section: rect(section),
      phone: rect(section?.querySelector('img')),
      tabList: rect(tabs),
      panel: rect(tabs?.nextElementSibling),
      tabs: Array.from(tabs?.querySelectorAll('[role="tab"]') ?? []).map(
        tab => ({
          label: tab.textContent,
          bounds: rect(tab),
        })
      ),
    };
    if (recording) samples.push(value);
    return value;
  };
  for (const event of [
    'scroll',
    'focusin',
    'pointerdown',
    'pointerup',
    'click',
  ]) {
    document.addEventListener(
      event,
      action =>
        snapshot(event, {
          target:
            action.target instanceof Element
              ? {
                  tag: action.target.tagName,
                  role: action.target.getAttribute('role'),
                  text: action.target.textContent?.trim().slice(0, 80),
                }
              : null,
          point:
            action instanceof MouseEvent
              ? { x: action.clientX, y: action.clientY }
              : null,
        }),
      { capture: true, passive: true }
    );
  }
  const frame = () => {
    if (!recording) return;
    snapshot('frame');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    snapshot,
    finish: () => {
      recording = false;
      return samples;
    },
  };
}

async function prepare(page: Page, url: string) {
  await page.route('**/*', route =>
    ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 204, body: '' })
  );
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  const section = page.getByTestId('artist-profile-section-adaptive');
  await expect(section.locator('[data-interactive-ready]')).toHaveAttribute(
    'data-interactive-ready',
    'true'
  );
  await expect(section.getByRole('tab', { name: 'Pre-save' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await page.evaluate(() => document.fonts.ready);
  const traceHandle = await page.evaluateHandle(installTrace);
  await traceHandle.evaluate(trace => {
    (
      window as unknown as {
        __adaptivePointerDiagnostic: ReturnType<typeof installTrace>;
      }
    ).__adaptivePointerDiagnostic = trace;
  });
  await section.getByRole('tablist').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      section
        .locator('img')
        .first()
        .evaluate(
          image =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0
        )
    )
    .toBe(true);
  const settled = await page.evaluate(async () => {
    const trace = (
      window as unknown as {
        __adaptivePointerDiagnostic: ReturnType<typeof installTrace>;
      }
    ).__adaptivePointerDiagnostic;
    const start = performance.now();
    let previous = '';
    let stableSince = start;
    while (performance.now() - start < 4500) {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      const snapshot = trace.snapshot('prepare');
      const geometry = JSON.stringify([
        snapshot.scrollY,
        snapshot.section,
        snapshot.phone,
        snapshot.tabList,
        snapshot.panel,
        snapshot.tabs,
      ]);
      if (geometry !== previous) stableSince = performance.now();
      previous = geometry;
      if (performance.now() - stableSince >= 300)
        return { settled: true, snapshot };
    }
    return {
      settled: false,
      snapshot: trace.snapshot('prepare-budget-exhausted'),
    };
  });
  expect(
    settled.settled,
    'bounded identical-entry preparation must settle'
  ).toBe(true);
  expect(settled.snapshot.focus.tag).toBe('BODY');
  expect(settled.snapshot.tabs).toHaveLength(4);
  for (const surface of ['section', 'phone', 'tabList', 'panel'] as const) {
    expect(settled.snapshot[surface], `prepared ${surface}`).not.toBeNull();
  }
  for (const tab of settled.snapshot.tabs) {
    expect(tab.bounds?.y).toBeGreaterThanOrEqual(0);
    expect(
      (tab.bounds?.y ?? -1) + (tab.bounds?.height ?? 0)
    ).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
  }
  return settled.snapshot;
}

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  for (const label of ['Pre-save', 'Out now']) {
    test(`diagnoses adaptive native-coordinate versus locator click at ${viewport.width}px for ${label}`, async ({
      browser,
      baseURL,
    }) => {
      const results = [];
      for (const mechanism of ['native-coordinate', 'locator'] as const) {
        const context = await browser.newContext({
          viewport,
          reducedMotion: 'no-preference',
          storageState: { cookies: [], origins: [] },
        });
        const page = await context.newPage();
        let traceFinished = false;
        try {
          const initial = await prepare(
            page,
            new URL('/artist-profiles', baseURL).href
          );
          const tab = page
            .getByTestId('artist-profile-section-adaptive')
            .getByRole('tab', { name: label, exact: true });
          const point = await tab.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const x = rect.x + rect.width / 2;
            const y = rect.y + rect.height / 2;
            return {
              x,
              y,
              hit:
                document.elementFromPoint(x, y)?.closest('[role="tab"]') ===
                element,
              disabled: (element as HTMLButtonElement).disabled,
            };
          });
          expect(point.hit).toBe(true);
          expect(point.disabled).toBe(false);
          if (mechanism === 'native-coordinate')
            await page.mouse.click(point.x, point.y);
          else await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await page.waitForTimeout(400);
          const at400 = await page.evaluate(() =>
            (
              window as unknown as {
                __adaptivePointerDiagnostic: ReturnType<typeof installTrace>;
              }
            ).__adaptivePointerDiagnostic.snapshot('original-400ms')
          );
          const mode = ARTIST_PROFILE_COPY.adaptive.modes.find(
            candidate => candidate.label === label
          );
          expect(mode).toBeDefined();
          await expect(
            page
              .getByTestId('artist-profile-section-adaptive')
              .getByRole('tabpanel', { name: label })
              .getByText(mode!.headline, { exact: true })
          ).toBeVisible();
          await expect(
            page
              .getByTestId('artist-profile-section-adaptive')
              .getByAltText(mode!.screenshotAlt, { exact: true })
          ).toBeVisible();
          await page.waitForTimeout(1500);
          const trace = await page.evaluate(() =>
            (
              window as unknown as {
                __adaptivePointerDiagnostic: ReturnType<typeof installTrace>;
              }
            ).__adaptivePointerDiagnostic.finish()
          );
          traceFinished = true;
          results.push({ mechanism, initial, point, at400, trace });
        } finally {
          if (!traceFinished) {
            const trace = await page
              .evaluate(
                () =>
                  (
                    window as unknown as {
                      __adaptivePointerDiagnostic?: ReturnType<
                        typeof installTrace
                      >;
                    }
                  ).__adaptivePointerDiagnostic?.finish() ?? null
              )
              .catch(() => null);
            console.log(
              'ADAPTIVE_POINTER_INCOMPLETE ' +
                JSON.stringify({ mechanism, viewport, label, trace })
            );
          }
          await context.close();
        }
      }
      console.log(
        'ADAPTIVE_POINTER_COMPARISON ' +
          JSON.stringify({
            source: process.env.GITHUB_SHA ?? 'local',
            browser: browser.browserType().name(),
            version: browser.version(),
            viewport,
            label,
            results,
          })
      );
      const [native, locator] = results;
      expect(native.initial.selected).toBe('Pre-save');
      expect(locator.initial.selected).toBe('Pre-save');
      expect(native.initial.dpr).toBe(locator.initial.dpr);
      expect(native.initial.ready).toBe(locator.initial.ready);
      expect(native.initial.fonts).toBe(locator.initial.fonts);
      expect(native.initial.image).toBe(locator.initial.image);
      expect(native.initial.focus).toEqual(locator.initial.focus);
      expect(native.initial.tabs).toHaveLength(4);
      expect(locator.initial.tabs).toHaveLength(4);
      for (let index = 0; index < 4; index++) {
        const nativeTab = native.initial.tabs[index];
        const locatorTab = locator.initial.tabs[index];
        expect(nativeTab.label).toBe(locatorTab.label);
        expect(nativeTab.bounds).not.toBeNull();
        expect(locatorTab.bounds).not.toBeNull();
        for (const key of [
          'documentTop',
          'height',
          'width',
          'x',
          'y',
        ] as const) {
          expect(
            Math.abs(nativeTab.bounds![key] - locatorTab.bounds![key]),
            `identical entry tab${index} ${key}`
          ).toBeLessThanOrEqual(1);
        }
      }
      for (const result of results) {
        expect(result.at400.selected).toBe(label);
        expect
          .soft(result.at400.scrollWidth)
          .toBeLessThanOrEqual(result.at400.viewportWidth + 1);
      }
      expect(
        Math.abs(native.initial.scrollY - locator.initial.scrollY)
      ).toBeLessThanOrEqual(1);
      for (const surface of ['section', 'phone', 'tabList', 'panel'] as const) {
        for (const result of results) {
          expect(
            result.at400[surface],
            `${result.mechanism} current ${surface}`
          ).not.toBeNull();
        }
        for (const key of [
          'documentTop',
          'height',
          'width',
          'x',
          'y',
        ] as const) {
          expect(
            Math.abs(
              (native.initial[surface]?.[key] ?? -1) -
                (locator.initial[surface]?.[key] ?? -1)
            ),
            `identical entry ${surface} ${key}`
          ).toBeLessThanOrEqual(1);
          for (const result of results) {
            expect
              .soft(
                Math.abs(
                  (result.initial[surface]?.[key] ?? -1) -
                    (result.at400[surface]?.[key] ?? -1)
                ),
                `${result.mechanism} original400ms ${surface} ${key}`
              )
              .toBeLessThanOrEqual(1);
          }
        }
      }
    });
  }
}
