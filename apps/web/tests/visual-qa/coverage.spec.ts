import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  getVisualQaCoverageEntry,
  VISUAL_QA_COVERAGE_MANIFEST,
  type VisualQaCoverageEntry,
  type VisualQaPlaywrightRouteSource,
} from '@/lib/agent-os/visual-qa/coverage';
import { recordVisualQaCapture } from '@/lib/agent-os/visual-qa/manifest';
import {
  resolveVisualQaPhaseScreenshotPath,
  resolveVisualQaSurfaceDirectory,
} from '@/lib/agent-os/visual-qa/paths';
import { parseVisualQaCaptureRequest } from '@/lib/visual-qa/capture-request';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';
import type {
  VisualQaCaptureConfig,
  VisualQaPhase,
} from '@/lib/visual-qa/types';
import { measureBufferedCls } from '../helpers/cls-measurement';
import { prepareVisualQaCapture, writeVisualQaScreenshot } from './helpers';

type RouteCoverageEntry = VisualQaCoverageEntry & {
  readonly source: VisualQaPlaywrightRouteSource;
};

function isRouteCoverageEntry(
  entry: VisualQaCoverageEntry
): entry is RouteCoverageEntry {
  return entry.source.kind === 'playwright-route';
}

async function assertRegisteredQualityChecks(
  page: Parameters<typeof prepareVisualQaCapture>[0],
  entry: RouteCoverageEntry
): Promise<void> {
  const checks = new Set(entry.qualityChecks ?? []);

  if (checks.has('accessibility')) {
    const results = await new AxeBuilder({ page })
      .withTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22a',
        'wcag22aa',
      ])
      .analyze();
    const blockingViolations = results.violations.filter(
      violation =>
        violation.impact === 'moderate' ||
        violation.impact === 'serious' ||
        violation.impact === 'critical'
    );
    expect(blockingViolations, `${entry.id} accessibility`).toEqual([]);
  }

  if (checks.has('focus-visible')) {
    const routeControlSelector =
      'main a[href], main button:not([disabled]), main input:not([disabled]), main select:not([disabled]), main textarea:not([disabled]), main [tabindex]:not([tabindex="-1"])';
    if ((await page.locator(routeControlSelector).count()) > 0) {
      let focusedControl = page.locator('main :focus-visible').first();
      for (let tabIndex = 0; tabIndex < 64; tabIndex += 1) {
        await page.keyboard.press('Tab');
        focusedControl = page.locator('main :focus-visible').first();
        if (await focusedControl.isVisible().catch(() => false)) break;
      }
      await expect(
        focusedControl,
        `${entry.id} main keyboard focus target`
      ).toBeVisible();
      const focusedElement = await focusedControl.elementHandle();
      expect(
        focusedElement,
        `${entry.id} focused element handle`
      ).not.toBeNull();
      if (!focusedElement) return;

      const focused = await focusedElement.evaluate(element => {
        const style = globalThis.getComputedStyle(element);
        return {
          boxShadow: style.boxShadow,
          href: element instanceof HTMLAnchorElement ? element.href : null,
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          tagName: element.tagName,
          testId: element.getAttribute('data-testid'),
        };
      });
      await focusedElement.evaluate(element => (element as HTMLElement).blur());
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            globalThis.requestAnimationFrame(() => resolve());
          })
      );
      const blurred = await focusedElement.evaluate(element => {
        const style = globalThis.getComputedStyle(element);
        return {
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      });
      const outlineChanged =
        focused.outlineStyle !== 'none' &&
        focused.outlineWidth !== '0px' &&
        (focused.outlineStyle !== blurred.outlineStyle ||
          focused.outlineWidth !== blurred.outlineWidth ||
          focused.outlineColor !== blurred.outlineColor);
      const shadowChanged =
        focused.boxShadow !== 'none' && focused.boxShadow !== blurred.boxShadow;
      expect(
        outlineChanged || shadowChanged,
        `${entry.id} visible focus indicator ${JSON.stringify({ focused, blurred })}`
      ).toBe(true);
    }
  }

  if (checks.has('horizontal-overflow')) {
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - window.innerWidth
    );
    expect(overflow, `${entry.id} horizontal overflow`).toBeLessThanOrEqual(1);
  }

  if (checks.has('layout-stability')) {
    const cls = await measureBufferedCls(page, 300);
    expect(cls, `${entry.id} cumulative layout shift`).toBeLessThanOrEqual(
      0.05
    );
  }

  if (checks.has('reduced-motion')) {
    const motion = await page.evaluate(() => {
      const activeAnimations = document
        .getAnimations()
        .filter(
          animation =>
            animation.playState === 'pending' ||
            animation.playState === 'running'
        )
        .map(animation => {
          const timing = animation.effect?.getComputedTiming();
          return {
            duration: timing?.duration ?? 0,
            playState: animation.playState,
          };
        })
        .filter(
          animation =>
            animation.duration === Infinity || animation.duration > 10
        );
      return {
        matches: globalThis.matchMedia('(prefers-reduced-motion: reduce)')
          .matches,
        activeAnimations,
      };
    });
    expect(motion.matches, `${entry.id} reduced-motion fixture`).toBe(true);
    expect(
      motion.activeAnimations,
      `${entry.id} active reduced-motion animations`
    ).toEqual([]);
  }
}

function collectBrowserErrors(
  page: Page,
  enabled: boolean
): {
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  readonly failedResponses: string[];
  readonly pageErrors: string[];
} {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  const pageErrors: string[] = [];
  const origin = new URL(
    process.env.BASE_URL?.trim() || 'http://localhost:3100'
  ).origin;
  const failures = {
    consoleErrors,
    failedRequests,
    failedResponses,
    pageErrors,
  };
  if (!enabled) return failures;

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin)) {
      failedRequests.push(
        `${request.url()} ${request.failure()?.errorText ?? 'unknown failure'}`
      );
    }
  });
  return failures;
}

function resolveCoverageRun(): {
  readonly entries: readonly RouteCoverageEntry[];
  readonly phases: readonly VisualQaPhase[];
  readonly runId: string;
  readonly themes: readonly VisualQaColorScheme[];
} | null {
  const runId = process.env.VISUAL_QA_COVERAGE_RUN_ID?.trim();
  if (!runId) return null;

  const captureRequest = parseVisualQaCaptureRequest({
    runId,
    phase: process.env.VISUAL_QA_PHASE,
    themes:
      process.env.VISUAL_QA_COVERAGE_THEMES ??
      process.env.VISUAL_QA_THEMES ??
      'dark',
  });
  const requestedIds = new Set(
    (process.env.VISUAL_QA_COVERAGE_IDS ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
  );
  const entries = VISUAL_QA_COVERAGE_MANIFEST.entries.filter(
    (entry): entry is RouteCoverageEntry =>
      entry.availability === 'available' &&
      isRouteCoverageEntry(entry) &&
      (requestedIds.size === 0 || requestedIds.has(entry.id))
  );

  for (const requestedId of requestedIds) {
    const entry = getVisualQaCoverageEntry(requestedId);
    if (!entry) {
      throw new Error(
        `Unknown Visual QA coverage entry requested: ${requestedId}`
      );
    }
    if (entry.availability !== 'available') {
      throw new Error(
        `Visual QA coverage entry ${requestedId} is unavailable: ${entry.unavailableReason}`
      );
    }
    if (entry.source.kind !== 'playwright-route') {
      throw new Error(
        `Visual QA coverage entry ${requestedId} is not a Playwright route source.`
      );
    }
  }

  if (entries.length === 0) {
    throw new Error(
      'No available Playwright route entries matched the requested Visual QA coverage run.'
    );
  }

  return {
    entries,
    phases: captureRequest.phases,
    runId,
    themes: captureRequest.themes,
  };
}

const coverageRun = resolveCoverageRun();
const gitSha = process.env.GITHUB_SHA ?? null;

test.describe('Visual QA coverage capture pipeline', () => {
  test.skip(
    coverageRun === null,
    'Set VISUAL_QA_COVERAGE_RUN_ID to run registered route coverage captures.'
  );

  test.describe.configure({ mode: 'serial' });

  const { entries, phases, runId, themes } = coverageRun ?? {
    entries: [],
    phases: [],
    runId: 'skipped',
    themes: [],
  };

  for (const entry of entries) {
    const fixture = VISUAL_QA_COVERAGE_MANIFEST.fixtures.find(
      candidate => candidate.id === entry.fixtureId
    );
    if (!fixture) {
      throw new Error(
        `Visual QA coverage entry ${entry.id} references a missing fixture.`
      );
    }

    for (const colorScheme of themes) {
      for (const phase of phases) {
        test(`captures ${entry.id} (${phase}, ${colorScheme})`, async ({
          page,
        }) => {
          test.setTimeout(120_000);

          const source = entry.source;
          if (source.sourceSha === 'capture-time-git-sha') {
            expect(
              gitSha,
              `${entry.id} exact-head evidence requires GITHUB_SHA`
            ).toMatch(/^[0-9a-f]{40}$/i);
          }
          const browserErrors = collectBrowserErrors(
            page,
            entry.qualityChecks?.includes('console-errors') ?? false
          );
          const config: VisualQaCaptureConfig = {
            route: source.route,
            waitFor: source.waitFor,
            viewport: fixture.viewport.width < 500 ? 'mobile' : 'desktop',
            colorScheme,
            dynamicMasks: entry.dynamicMasks,
            fixedNow: source.fixedNow,
            fullPage: source.fullPage ?? false,
            reducedMotion: entry.qualityChecks?.includes('reduced-motion'),
          };
          const breakpoint = { ...fixture.viewport, label: fixture.id };
          const surfaceDirectory = resolveVisualQaSurfaceDirectory(
            runId,
            entry.id
          );
          const screenshotPath = resolveVisualQaPhaseScreenshotPath(
            runId,
            entry.id,
            phase,
            colorScheme
          );

          await mkdir(surfaceDirectory, { recursive: true });
          await prepareVisualQaCapture(page, config, breakpoint);

          if (source.expectedPath) {
            const pathname = new URL(page.url()).pathname;
            if (pathname !== source.expectedPath) {
              throw new Error(
                `Coverage route ${entry.id} resolved to ${pathname}; expected ${source.expectedPath}.`
              );
            }
          }

          await assertRegisteredQualityChecks(page, entry);
          await writeVisualQaScreenshot(page, config, screenshotPath);
          expect(
            browserErrors.consoleErrors,
            `${entry.id} browser console`
          ).toEqual([]);
          expect(browserErrors.pageErrors, `${entry.id} page errors`).toEqual(
            []
          );
          expect(
            browserErrors.failedResponses,
            `${entry.id} HTTP failures`
          ).toEqual([]);
          expect(
            browserErrors.failedRequests,
            `${entry.id} request failures`
          ).toEqual([]);
          await recordVisualQaCapture({
            runId,
            surfaceId: entry.id,
            coverageId: entry.id,
            phase,
            colorScheme,
            screenshotPath,
            gitSha,
            surfaceDefinition: {
              title: entry.title,
              viewport: fixture.viewport,
            },
          });
        });
      }
    }
  }
});
