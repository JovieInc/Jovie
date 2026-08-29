import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  resetOwnedOutputDirectory,
  resolveFixedOwnedOutputDirectory,
} from '../../../scripts/owned-output-path';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { waitForHydration } from '../utils/smoke-test-utils';

const repoRoot = path.resolve(process.cwd(), '../..');
const outputBase = path.join(repoRoot, '.context');
const outputSegment = 'public-profile-cta-identity';
const outputDir = resolveFixedOwnedOutputDirectory(
  outputBase,
  outputSegment,
  path.join(outputBase, outputSegment),
  'PROFILE_CTA_IDENTITY_SCREENSHOT_DIR'
);

const viewports = [
  { id: '390x844', width: 390, height: 844 },
  { id: '1440x900', width: 1440, height: 900 },
] as const;

test.describe('Public profile CTA and identity evidence', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await resetOwnedOutputDirectory(outputBase, outputSegment);
  });

  for (const viewport of viewports) {
    test(`${viewport.id} keeps compact identity rhythm`, async ({ page }) => {
      await installPublicRouteMocks(page);
      await page.route('**/api/px', route =>
        route.fulfill({ status: 204, body: '' })
      );
      await page.setViewportSize(viewport);
      const response = await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status() ?? 0).toBeLessThan(500);
      await waitForHydration(page);

      const identity = page.getByTestId('profile-hero-identity-content');
      const name = page.getByTestId('profile-identity-link');
      const metadata = page.getByTestId('profile-hero-metadata-row');
      await expect(identity).toBeVisible();
      await expect(name).toBeVisible();
      await expect(metadata).toBeVisible();

      const metrics = await identity.evaluate(element => {
        const nameElement = element.querySelector<HTMLElement>(
          '[data-testid="profile-identity-link"]'
        );
        const metadataElement = element.querySelector<HTMLElement>(
          '[data-testid="profile-hero-metadata-row"]'
        );
        if (!nameElement || !metadataElement) return null;

        const identityStyle = window.getComputedStyle(element);
        const nameRect = nameElement.getBoundingClientRect();
        const metadataRect = metadataElement.getBoundingClientRect();
        const headingElement = nameElement.parentElement;
        const headingRect = headingElement?.getBoundingClientRect();
        const headingStyle = headingElement
          ? window.getComputedStyle(headingElement)
          : null;
        return {
          rowGap: Number.parseFloat(identityStyle.rowGap),
          nameTargetHeight: nameRect.height,
          metadataHeight: metadataRect.height,
          renderedGap: metadataRect.top - nameRect.bottom,
          headingHeight: headingRect?.height ?? 0,
          headingMarginBottom: Number.parseFloat(
            headingStyle?.marginBottom ?? '0'
          ),
          headingDisplay: headingStyle?.display ?? '',
        };
      });

      expect(metrics).not.toBeNull();
      expect(metrics?.rowGap).toBe(4);
      expect(metrics?.nameTargetHeight).toBeGreaterThanOrEqual(44);
      expect(metrics?.metadataHeight).toBeLessThanOrEqual(20);
      const metricsReceipt = JSON.stringify(metrics);
      expect(metrics?.renderedGap, metricsReceipt).toBeGreaterThanOrEqual(0);
      expect(metrics?.renderedGap, metricsReceipt).toBeLessThanOrEqual(4);

      await page.screenshot({
        path: path.join(outputDir, `${viewport.id}.png`),
        fullPage: false,
      });

      await page.getByRole('button', { name: 'Events' }).click();
      const canonicalCta = page.getByRole('button', {
        name: 'Turn On Event Alerts',
      });
      await expect(canonicalCta).toBeVisible();
      const ctaGeometry = await canonicalCta.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const beforeStyle = window.getComputedStyle(element, '::before');
        return {
          visibleHeight: rect.height,
          targetHeight: Number.parseFloat(beforeStyle.height),
          targetWidth: Number.parseFloat(beforeStyle.width),
        };
      });
      expect(ctaGeometry.visibleHeight).toBeCloseTo(32, 0);
      expect(ctaGeometry.targetHeight).toBeGreaterThanOrEqual(44);
      expect(ctaGeometry.targetWidth).toBeGreaterThanOrEqual(44);
    });
  }
});
