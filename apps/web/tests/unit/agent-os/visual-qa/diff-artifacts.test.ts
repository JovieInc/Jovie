import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { computeVisualQaDiffArtifacts } from '@/lib/agent-os/visual-qa/diff-artifacts';
import {
  getVisualQaRootDirectory,
  resolveVisualQaDiffSummaryPath,
  resolveVisualQaManifestPath,
} from '@/lib/agent-os/visual-qa/paths';

async function createSolidPng(color: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe('computeVisualQaDiffArtifacts', () => {
  const runId = 'unit-diff-demo';

  afterEach(async () => {
    const runDirectory = path.join(getVisualQaRootDirectory(), runId);
    await mkdir(runDirectory, { recursive: true });
  });

  it('writes overlay and summary artifacts for captured surfaces', async () => {
    const runDirectory = path.join(getVisualQaRootDirectory(), runId);
    const surfaceDirectory = path.join(runDirectory, 'shell-desktop-idle');
    await mkdir(surfaceDirectory, { recursive: true });

    const baseline = await createSolidPng({ r: 10, g: 20, b: 30 });
    const after = await createSolidPng({ r: 10, g: 20, b: 30 });

    await Promise.all([
      writeFile(path.join(surfaceDirectory, 'baseline.png'), baseline),
      writeFile(path.join(surfaceDirectory, 'after.png'), after),
      writeFile(
        resolveVisualQaManifestPath(runId),
        `${JSON.stringify(
          {
            runId,
            createdAt: '2026-06-08T00:00:00.000Z',
            updatedAt: '2026-06-08T00:00:00.000Z',
            gitSha: null,
            surfaces: [
              {
                surfaceId: 'shell-desktop-idle',
                title: 'Shell — desktop idle',
                baselinePath: 'shell-desktop-idle/baseline.png',
                afterPath: 'shell-desktop-idle/after.png',
                baselineCapturedAt: '2026-06-08T00:00:00.000Z',
                afterCapturedAt: '2026-06-08T00:00:00.000Z',
                viewport: { width: 1440, height: 900 },
              },
            ],
          },
          null,
          2
        )}\n`
      ),
    ]);

    const summary = await computeVisualQaDiffArtifacts(runId);

    expect(summary.passed).toBe(true);
    expect(summary.surfaces[0]).toMatchObject({
      surfaceId: 'shell-desktop-idle',
      status: 'no_significant_change',
      overlayPath: 'unit-diff-demo/shell-desktop-idle/diff-overlay.png',
    });

    const persistedSummary = JSON.parse(
      await readFile(resolveVisualQaDiffSummaryPath(runId), 'utf8')
    );

    expect(persistedSummary.passed).toBe(true);
  });
});
