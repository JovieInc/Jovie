import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing';
import { SCREENSHOT_VIEWPORTS } from '@/lib/screenshots/registry';
import {
  assertNoDevOverlays,
  hideTransientUI,
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

        expect(
          sourceGitSha,
          'Exact-head screenshot evidence requires a clean full source SHA'
        ).toMatch(/^[0-9a-f]{40}$/);

        await page.clock.setFixedTime(new Date(SCREENSHOT_CLOCK_ISO));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize(SCREENSHOT_VIEWPORTS[viewport]);

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

        const screenshotPath = testInfo.outputPath('marketing-route.png');
        await page.screenshot({
          animations: 'disabled',
          fullPage: true,
          path: screenshotPath,
          type: 'png',
        });

        const receiptPath = testInfo.outputPath('receipt.json');
        await writeFile(
          receiptPath,
          `${JSON.stringify(
            {
              capturedAt: new Date().toISOString(),
              documentStatus,
              finalPath,
              route: target.url,
              fixturePath: target.fixturePath,
              sourceGitSha,
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
