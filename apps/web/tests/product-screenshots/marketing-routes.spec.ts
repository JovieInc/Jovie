import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing';
import { MARKETING_EXACT_ROUTE_VISUAL_QA_ENTRIES } from '@/lib/agent-os/visual-qa/coverage';
import { SCREENSHOT_VIEWPORTS } from '@/lib/screenshots/registry';
import {
  assertRegisteredQualityChecks,
  collectBrowserErrors,
  isRouteCoverageEntry,
} from '../visual-qa/route-quality';
import {
  assertNoDevOverlays,
  hideTransientUI,
  prepareImagesForScreenshot,
  SCREENSHOT_CLOCK_ISO,
  TIMEOUTS,
  waitForSettle,
} from './helpers';
import { resolveScreenshotSourceGitSha } from './source-provenance';

const sourceGitSha = resolveScreenshotSourceGitSha();

test.describe('Exact marketing route screenshots', () => {
  test.describe.configure({ mode: 'parallel', retries: 0 });

  for (const target of MARKETING_EXACT_PUBLIC_ROUTE_TARGETS) {
    for (const viewport of target.viewports) {
      test(`${target.url} ${viewport}`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);

        const coverageEntry = MARKETING_EXACT_ROUTE_VISUAL_QA_ENTRIES.find(
          entry =>
            isRouteCoverageEntry(entry) &&
            entry.source.sourcePath === target.sourcePath &&
            entry.id.endsWith(`-${viewport}`)
        );
        if (!coverageEntry || !isRouteCoverageEntry(coverageEntry)) {
          throw new Error(
            `Missing Visual QA coverage registration for ${target.url} ${viewport}`
          );
        }

        expect(
          sourceGitSha,
          'Exact-head screenshot evidence requires a clean full source SHA'
        ).toMatch(/^[0-9a-f]{40}$/);

        await page.clock.setFixedTime(new Date(SCREENSHOT_CLOCK_ISO));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize(SCREENSHOT_VIEWPORTS[viewport]);
        const browserErrors = collectBrowserErrors(
          page,
          coverageEntry.qualityChecks?.includes('console-errors') ?? false
        );

        const response = await page.goto(target.fixturePath, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.NAVIGATION,
        });
        const documentStatus = response?.status() ?? 0;
        const finalPath = new URL(page.url()).pathname;
        expect(documentStatus, target.url).toBeLessThan(400);
        expect(finalPath, `${target.url} redirected`).toBe(target.expectedPath);
        await expect(
          page.locator(target.expectedRuntimeSelector).first()
        ).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });

        await waitForSettle(page, 1_000);
        await hideTransientUI(page);
        await assertNoDevOverlays(page);
        await assertRegisteredQualityChecks(page, coverageEntry);
        await prepareImagesForScreenshot(page);

        const screenshotPath = testInfo.outputPath('marketing-route.png');
        await page.screenshot({
          animations: 'disabled',
          fullPage: true,
          path: screenshotPath,
          type: 'png',
        });
        expect(
          browserErrors.consoleErrors,
          `${coverageEntry.id} browser console`
        ).toEqual([]);
        expect(
          browserErrors.pageErrors,
          `${coverageEntry.id} page errors`
        ).toEqual([]);
        expect(
          browserErrors.failedResponses,
          `${coverageEntry.id} HTTP failures`
        ).toEqual([]);
        expect(
          browserErrors.failedRequests,
          `${coverageEntry.id} request failures`
        ).toEqual([]);

        const screenshotSha256 = createHash('sha256')
          .update(await readFile(screenshotPath))
          .digest('hex');

        const receiptPath = testInfo.outputPath('receipt.json');
        await writeFile(
          receiptPath,
          `${JSON.stringify(
            {
              schemaVersion: 'marketing-route-evidence/v1',
              buildMode: process.env.SCREENSHOT_BUILD_MODE ?? 'unknown',
              capturedAt: new Date().toISOString(),
              coverageId: coverageEntry.id,
              documentStatus,
              finalPath,
              route: target.url,
              fixturePath: target.fixturePath,
              qualityChecks: coverageEntry.qualityChecks,
              routeDisposition: target.disposition,
              screenshotSha256,
              sourcePath: target.sourcePath,
              sourceGitSha,
              stateMatrix: target.stateMatrix,
              viewport,
            },
            null,
            2
          )}\n`,
          'utf8'
        );

        await testInfo.attach('marketing-route-screenshot', {
          contentType: 'image/png',
          path: screenshotPath,
        });
        await testInfo.attach('marketing-route-receipt', {
          contentType: 'application/json',
          path: receiptPath,
        });
      });
    }
  }
});

test.describe('Pre-save countdown contrast', () => {
  test.describe.configure({ mode: 'parallel', retries: 0 });

  // The demo release is always ~3 weeks out relative to the page clock, so the
  // countdown renders days, hours and minutes (never years).
  const scenarios = [
    {
      name: 'days, hours and minutes',
      now: new Date('2026-10-29T12:00:00.000Z'),
      units: ['D', 'H', 'M'],
    },
  ];

  for (const viewport of ['desktop', 'mobile'] as const) {
    for (const scenario of scenarios) {
      test(`${scenario.name} units stay readable on ${viewport}`, async ({
        page,
      }) => {
        await page.clock.setFixedTime(scenario.now);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize(SCREENSHOT_VIEWPORTS[viewport]);
        await page.goto(APP_ROUTES.PRODUCT_PRE_SAVE);
        const countdown = page.getByTestId('pre-save-countdown');
        for (const unit of scenario.units) {
          await expect(
            countdown.getByText(unit, { exact: true })
          ).toBeVisible();
        }

        const results = await new AxeBuilder({ page })
          .include('[data-testid="pre-save-countdown"]')
          .withRules(['color-contrast'])
          .analyze();
        expect(results.violations).toEqual([]);
        expect(results.incomplete).toEqual([]);
        expect(results.passes.map(result => result.id)).toContain(
          'color-contrast'
        );
      });
    }
  }
});

test.describe('Marketing auth-entry prefetch boundary', () => {
  test.describe.configure({ retries: 0 });
  for (const route of [
    '/new',
    '/voice',
    '/support',
    '/artist-profiles',
    '/artist-notifications',
    '/smart-links',
    '/launch',
    '/instant-merch',
    '/waitlist/invite',
  ]) {
    test(`auth-entry waits for visitor intent on ${route}`, async ({
      page,
    }) => {
      const speculativeAuthRequests: string[] = [];
      const authRequestFailures: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        if (
          ['/signup', '/signin', '/start', '/app/chat', '/waitlist'].includes(
            url.pathname
          ) &&
          request.headers()['next-router-prefetch'] === '1'
        ) {
          speculativeAuthRequests.push(url.pathname);
        }
      });
      page.on('requestfailed', request => {
        const url = new URL(request.url());
        if (
          ['/signup', '/signin', '/start', '/app/chat', '/waitlist'].includes(
            url.pathname
          )
        ) {
          authRequestFailures.push(
            `${url.pathname} ${request.failure()?.errorText ?? 'unknown'}`
          );
        }
      });
      await page.setViewportSize(
        ['/artist-profiles', '/instant-merch', '/waitlist/invite'].includes(
          route
        )
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 }
      );
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const authLinks = page.locator(
        'a[href="/signup"]:visible, a[href^="/signup?"]:visible, a[href="/signin"]:visible, a[href^="/signin?"]:visible, a[href="/start"]:visible, a[href^="/start?"]:visible, a[href="/app/chat"]:visible, a[href^="/app/chat?"]:visible, a[href="/waitlist"]:visible, a[href^="/waitlist?"]:visible'
      );
      expect(await authLinks.count(), `${route} auth actions`).toBeGreaterThan(
        0
      );
      for (const authLink of await authLinks.all()) {
        await authLink.scrollIntoViewIfNeeded();
        await expect(authLink).toBeVisible();
        await authLink.focus();
        await authLink.hover();
        await waitForSettle(page, 1_000);
      }
      expect(speculativeAuthRequests, `${route} speculative auth work`).toEqual(
        []
      );
      expect(authRequestFailures, `${route} pre-intent auth failures`).toEqual(
        []
      );
    });
  }
});

test.describe('Public footer incremental content stability', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 1440, height: 1600 },
  ]) {
    test(`expanded footer keeps its origin at ${viewport.width}x${viewport.height}`, async ({
      browser,
    }) => {
      test.setTimeout(30_000);
      // Isolate the server-rendered shell from hydration. Removing and restoring
      // the existing navigation models its arrival after the CTA HTML has painted.
      const context = await browser.newContext({
        viewport,
        javaScriptEnabled: false,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        await page.goto('/demo/video', { waitUntil: 'load' });
        const footer = page.getByTestId('marketing-footer');
        const originalTop = (await footer.boundingBox())?.y;
        expect(originalTop).toBeDefined();
        const navigation = await footer
          .getByRole('navigation', { name: 'Footer', exact: true })
          .elementHandle();
        expect(navigation).not.toBeNull();
        if (!navigation) throw new Error('Missing expanded footer navigation');
        await navigation.evaluate(element => {
          const marker = document.createComment(
            'incremental-footer-navigation'
          );
          element.before(marker);
          (element as HTMLElement & { restoreMarker?: Comment }).restoreMarker =
            marker;
          element.remove();
        });
        await page.waitForTimeout(250);
        const partialTop = (await footer.boundingBox())?.y;
        await navigation.evaluate(element => {
          const marker = (element as HTMLElement & { restoreMarker?: Comment })
            .restoreMarker;
          if (!marker) throw new Error('Missing incremental footer marker');
          marker.replaceWith(element);
        });
        await page.waitForTimeout(250);
        const restoredTop = (await footer.boundingBox())?.y;
        expect(partialTop, 'partial footer origin').toBe(originalTop);
        expect(restoredTop, 'complete footer origin').toBe(originalTop);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('Instant merch hero media stability', () => {
  for (const width of [390, 1023, 1024, 1440]) {
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      test(`preview arrival at ${width}px with ${reducedMotion} motion`, async ({
        browser,
        baseURL,
      }, testInfo) => {
        // Exercise the real server-rendered preview without hydration replacing
        // the detached nodes. This is a deterministic sizing dependency probe;
        // it does not assert what caused the original CI arrival timing.
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          javaScriptEnabled: false,
          reducedMotion,
        });
        try {
          const page = await context.newPage();
          const response = await page.goto('/instant-merch', {
            waitUntil: 'load',
          });
          expect(response?.status()).toBe(200);
          await page.evaluate(() => document.fonts.ready);
          const surface = page.getByTestId('chat-generation-artifact-surface');
          const media = await surface.locator('..').elementHandle();
          if (!media) throw new Error('Missing hero media wrapper');
          const measure = async () => ({
            media: await media.boundingBox(),
            heading: await page.getByTestId('hero-heading').boundingBox(),
            cta: await page
              .getByTestId('instant-merch-primary-cta')
              .boundingBox(),
            following: await page
              .getByTestId('marketing-section-how-it-works')
              .boundingBox(),
          });
          const complete = await measure();
          const images = await surface.locator('img').elementHandles();
          expect(images).toHaveLength(3);
          for (const image of images) {
            await image.evaluate(element => {
              const marker = document.createComment('merch-image');
              element.before(marker);
              (element as Element & { restoreMarker?: Comment }).restoreMarker =
                marker;
              element.remove();
            });
          }
          expect(
            await measure(),
            'image arrival must not change layout'
          ).toEqual(complete);
          for (const image of images) {
            await image.evaluate(element => {
              const marker = (element as Element & { restoreMarker?: Comment })
                .restoreMarker;
              if (!marker) throw new Error('Missing image restore marker');
              marker.replaceWith(element);
            });
          }
          let partial = complete;
          if (width >= 1024) {
            const preview = await surface.elementHandle();
            if (!preview) throw new Error('Missing merch preview');
            await preview.evaluate(element => element.remove());
            partial = await measure();
            await media.evaluate(
              (element, child) => element.append(child),
              preview
            );
            expect(partial, 'desktop media must reserve its grid cell').toEqual(
              complete
            );
          }
          expect(await measure(), 'restored preview geometry').toEqual(
            complete
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth
            )
          ).toBeLessThanOrEqual(1);
          await testInfo.attach('hero-media-geometry', {
            body: JSON.stringify({ width, reducedMotion, complete, partial }),
            contentType: 'application/json',
          });
          await testInfo.attach('hero-media-render', {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
          });
        } finally {
          await context.close();
        }
      });
    }
  }
});

test.describe('UTM links hero panel stability', () => {
  for (const width of [390, 768, 1024, 1440]) {
    test(`builder arrival at ${width}px keeps the hero still`, async ({
      browser,
      baseURL,
    }) => {
      // CI saw utm-links-panel grow 424px -> 775px about 370ms after load
      // and push the hero copy (CLS 0.0686). Deterministic probe: with the
      // server render only, take the builder out (an island that has not
      // painted yet) and require the copy, the panel and the next band to
      // keep their geometry.
      const context = await browser.newContext({
        baseURL,
        viewport: { width, height: 900 },
        javaScriptEnabled: false,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        const response = await page.goto('/product/utm-links', {
          waitUntil: 'load',
        });
        expect(response?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        const measure = async () => ({
          copy: await page
            .getByRole('heading', { level: 1, name: 'UTM links' })
            .boundingBox(),
          panel: await page.getByTestId('utm-links-panel').boundingBox(),
          footer: await page
            .locator('footer, [role="contentinfo"]')
            .first()
            .boundingBox(),
        });
        const complete = await measure();
        const builder = await page.getByTestId('utm-builder').elementHandle();
        if (!builder) throw new Error('Missing UTM builder');
        await builder.evaluate(element => {
          const marker = document.createComment('utm-builder');
          element.before(marker);
          (element as Element & { restoreMarker?: Comment }).restoreMarker =
            marker;
          element.remove();
        });
        expect(
          await measure(),
          'builder arrival must not change hero layout'
        ).toEqual(complete);
        await builder.evaluate(element => {
          const marker = (element as Element & { restoreMarker?: Comment })
            .restoreMarker;
          if (!marker) throw new Error('Missing builder restore marker');
          marker.replaceWith(element);
        });
        expect(await measure(), 'restored builder geometry').toEqual(complete);
      } finally {
        await context.close();
      }
    });
  }
});
