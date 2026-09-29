/**
 * Help Center visual proof capture (JOV-5900).
 *
 * Captures deterministic, seeded-account screenshots for Help Center guides.
 * Authentication comes from the shared E2E bootstrap (tests/e2e/auth.setup.ts
 * via the `auth-setup` project dependency and `tests/.auth/user.json`), never
 * from hand-maintained credentials.
 *
 * Assets are written to `apps/docs/public/proof/` with stable names derived
 * from the article id and step (`proof/<articleId>-<step>.png`) plus a
 * machine-readable `manifest.json` recording route, viewport, theme, build
 * SHA, and capture timestamp for each asset.
 *
 * Usage:
 *   pnpm --filter web docs-guide-shots
 *   pnpm --filter web docs-guide-shots -- --grep edit-smart-link
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { optimizePngLosslessly } from '../../scripts/png-optimization';
import { replaceWithAtomicSibling } from '../product-screenshots/atomic-output';
import {
  assertNoDevOverlays,
  hideTransientUI,
  SCREENSHOT_CLOCK_ISO,
  TIMEOUTS,
  waitForImages,
  waitForSettle,
} from '../product-screenshots/helpers';
import {
  resolveScreenshotEvidence,
  resolveScreenshotSourceGitSha,
} from '../product-screenshots/source-provenance';
import { SENSITIVE_CAPTURE_SELECTORS, sanitizeDocsCaptureDom } from './persona';
import {
  DOCS_GUIDE_PLAN,
  DOCS_GUIDE_VIEWPORTS,
  type DocsGuidePlanEntry,
  visualProofRef,
} from './plan';

const WEB_ROOT = resolve(__dirname, '../..');
const PROOF_DIR = resolve(WEB_ROOT, DOCS_GUIDE_PLAN.outputDir);
const MANIFEST_PATH = resolve(WEB_ROOT, DOCS_GUIDE_PLAN.manifestPath);

export interface VisualProofManifestEntry {
  readonly ref: string;
  readonly articleId: string;
  readonly step: string;
  readonly title: string;
  readonly alt: string;
  readonly route: string;
  readonly viewport: string;
  readonly viewportCss: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly captureTarget: string;
  readonly theme: string;
  readonly capturedAt: string;
  readonly gitSha: string | null;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
  readonly sha256: string;
}

async function readOptionalFile(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readManifestEntries() {
  const existing = await readOptionalFile(MANIFEST_PATH);
  if (!existing) return new Map<string, VisualProofManifestEntry>();
  try {
    const parsed = JSON.parse(existing.toString('utf8'));
    const entries = Array.isArray(parsed) ? parsed : [];
    return new Map(
      entries
        .filter(entry => entry && typeof entry.ref === 'string')
        .map(entry => [entry.ref, entry as VisualProofManifestEntry])
    );
  } catch {
    return new Map<string, VisualProofManifestEntry>();
  }
}

async function writeManifest(
  entriesByRef: ReadonlyMap<string, VisualProofManifestEntry>
) {
  const ordered = DOCS_GUIDE_PLAN.entries.flatMap(planEntry => {
    const manifestEntry = entriesByRef.get(visualProofRef(planEntry));
    return manifestEntry ? [manifestEntry] : [];
  });
  const nextManifest = `${JSON.stringify(ordered, null, 2)}\n`;
  const previous = await readOptionalFile(MANIFEST_PATH);
  if (previous && previous.toString('utf8') === nextManifest) return;
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  await replaceWithAtomicSibling(MANIFEST_PATH, async temporaryPath => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(temporaryPath, nextManifest, 'utf8');
    return true;
  });
}

function pngDimensions(buffer: Buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function capturePlanEntry(
  page: import('@playwright/test').Page,
  entry: DocsGuidePlanEntry,
  assetPath: string
) {
  return replaceWithAtomicSibling(assetPath, async nextPath => {
    if (entry.captureTarget === 'locator' && entry.captureSelector) {
      await page
        .locator(entry.captureSelector)
        .first()
        .screenshot({ path: nextPath, type: 'png' });
    } else {
      await page.screenshot({ path: nextPath, type: 'png' });
    }

    await optimizePngLosslessly(nextPath);

    const previous = await readOptionalFile(assetPath);
    const next = await readFile(nextPath);
    return previous === null || !previous.equals(next);
  });
}

test.describe('docs guide visual proof capture', () => {
  test.describe.configure({ mode: 'serial' });

  for (const entry of DOCS_GUIDE_PLAN.entries) {
    test(`capture ${entry.id}`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium', 'chromium only');
      test.skip(
        testInfo.project.name !== 'docs-guides',
        'runs under the docs-guides project only'
      );

      const viewport = DOCS_GUIDE_VIEWPORTS[entry.viewport];
      await page.setViewportSize(viewport);
      await page.clock.setFixedTime(new Date(SCREENSHOT_CLOCK_ISO));
      await page.emulateMedia({
        colorScheme: entry.theme,
        reducedMotion: 'reduce',
      });

      await page.goto(entry.route, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.NAVIGATION,
      });
      await page.waitForSelector(entry.waitFor, {
        state: 'visible',
        timeout: TIMEOUTS.CONTENT_VISIBLE,
      });

      if (entry.interaction === 'open-first-link') {
        await page
          .locator(
            '[data-testid*="link-row"], [data-testid*="smart-link"], main li, main tr'
          )
          .first()
          .click({ timeout: TIMEOUTS.CONTENT_VISIBLE });
      }

      await waitForImages(page);
      await waitForSettle(page);
      await hideTransientUI(page);
      await sanitizeDocsCaptureDom(page);
      await assertNoDevOverlays(page);

      const assetPath = join(PROOF_DIR, `${entry.articleId}-${entry.step}.png`);
      const imageChanged = await capturePlanEntry(page, entry, assetPath);
      const buffer = await readFile(assetPath);
      const { width, height } = pngDimensions(buffer);

      const previousManifest = await readManifestEntries();
      const previousEntry = previousManifest.get(visualProofRef(entry));
      const evidence = resolveScreenshotEvidence({
        capturedAt: new Date().toISOString(),
        imageChanged,
        previousCapturedAt: previousEntry?.capturedAt,
        previousGitSha: previousEntry?.gitSha ?? null,
        sourceGitSha: resolveScreenshotSourceGitSha(),
      });

      const { createHash } = await import('node:crypto');
      const manifestEntry: VisualProofManifestEntry = {
        ref: visualProofRef(entry),
        articleId: entry.articleId,
        step: entry.step,
        title: entry.title,
        alt: entry.alt,
        route: entry.route,
        viewport: entry.viewport,
        viewportCss: viewport,
        deviceScaleFactor: 2,
        captureTarget: entry.captureTarget,
        theme: entry.theme,
        capturedAt: evidence.capturedAt,
        gitSha: evidence.gitSha,
        width,
        height,
        sizeBytes: buffer.byteLength,
        sha256: createHash('sha256').update(buffer).digest('hex'),
      };

      previousManifest.set(visualProofRef(entry), manifestEntry);
      await writeManifest(previousManifest);

      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    });
  }

  test('plan selectors stay anchored', () => {
    expect(DOCS_GUIDE_PLAN.entries.length).toBeGreaterThan(0);
    for (const entry of DOCS_GUIDE_PLAN.entries) {
      expect(SENSITIVE_CAPTURE_SELECTORS.length).toBeGreaterThan(0);
      expect(entry.route.startsWith('/')).toBe(true);
    }
  });
});
