import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test } from '@playwright/test';
import { resolveGoldenJourneyScreenshotPath } from '../../lib/agent-os/golden-journey/paths';
import {
  GOLDEN_JOURNEY_ROUTES,
  type GoldenJourneyRoute,
} from '../../lib/agent-os/golden-journey/routes';
import { hideTransientUI, waitForSettle } from '../product-screenshots/helpers';

/**
 * Golden-journey route capture (JOV #11815).
 *
 * Navigates each registered route in its declared auth state and writes a
 * full-page screenshot into the sweep run directory. The comparison + jury
 * pass runs afterwards via `scripts/golden-journey-sweep.ts`.
 */

const RUN_ID = process.env.GOLDEN_JOURNEY_RUN_ID ?? 'local';

function bootstrapUrl(route: GoldenJourneyRoute): string {
  if (route.authState === 'logged-out') {
    return route.path;
  }

  const params = new URLSearchParams({
    persona: route.authState,
    redirect: route.path,
  });
  return `/api/dev/test-auth/enter?${params.toString()}`;
}

test.describe('golden journey capture', () => {
  for (const route of GOLDEN_JOURNEY_ROUTES) {
    test(`captures ${route.id}`, async ({ page }) => {
      await page.goto(bootstrapUrl(route), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await waitForSettle(page);
      await hideTransientUI(page);

      const screenshotPath = resolveGoldenJourneyScreenshotPath(
        RUN_ID,
        route.id
      );
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});
