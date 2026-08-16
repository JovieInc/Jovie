import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { recordVisualQaCapture } from '@/lib/agent-os/visual-qa/manifest';
import {
  getVisualQaRootDirectory,
  resolveVisualQaPhaseScreenshotPath,
  resolveVisualQaSurfaceDirectory,
} from '@/lib/agent-os/visual-qa/paths';

describe('recordVisualQaCapture', () => {
  const runId = 'unit-capture-locked';

  afterEach(async () => {
    await rm(path.join(getVisualQaRootDirectory(), runId), {
      recursive: true,
      force: true,
    });
  });

  it('records run-relative capture paths and locked-region hashes', async () => {
    const surfaceDirectory = resolveVisualQaSurfaceDirectory(
      runId,
      'web-public-homepage'
    );
    const screenshotPath = resolveVisualQaPhaseScreenshotPath(
      runId,
      'web-public-homepage',
      'baseline',
      'dark'
    );
    await mkdir(surfaceDirectory, { recursive: true });
    await writeFile(
      screenshotPath,
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: { r: 20, g: 40, b: 60 },
        },
      })
        .png()
        .toBuffer()
    );

    const manifest = await recordVisualQaCapture({
      runId,
      surfaceId: 'web-public-homepage',
      coverageId: 'web-public-homepage',
      phase: 'baseline',
      colorScheme: 'dark',
      screenshotPath,
      gitSha: 'unit-test-sha',
      surfaceDefinition: {
        title: 'Web — public homepage',
        viewport: { width: 1280, height: 720 },
      },
    });

    const surface = manifest.surfaces[0];
    expect(surface?.themes.dark?.baselinePath).toBe(
      'web-public-homepage/baseline-dark.png'
    );
    expect(surface?.lockedRegionHashes?.baseline?.dark?.[0]?.sha256).toMatch(
      /^[a-f0-9]{64}$/
    );
  });
});
