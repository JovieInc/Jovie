import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
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
