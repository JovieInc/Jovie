import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCaptureArtifactPaths,
  readTrustedCapture,
} from '../../../.github/scripts/pr-visual-review.mjs';

describe('PR visual capture artifact paths', () => {
  it('writes beneath the output directory but records an artifact-relative path', () => {
    expect(
      buildCaptureArtifactPaths({
        outDir: 'pr-visual-artifacts',
        route: '/',
        viewportName: 'desktop',
      })
    ).toEqual({
      artifactPath: 'home-desktop.png',
      outputPath: join('pr-visual-artifacts', 'home-desktop.png'),
    });
  });

  it('sanitizes nested routes without reintroducing the artifact directory', () => {
    expect(
      buildCaptureArtifactPaths({
        outDir: '/tmp/pr-visual-artifacts',
        route: '/app/chat',
        viewportName: 'mobile',
      })
    ).toEqual({
      artifactPath: 'app-chat-mobile.png',
      outputPath: join('/tmp/pr-visual-artifacts', 'app-chat-mobile.png'),
    });
  });

  it('rejects an empty viewport name before creating an ambiguous artifact', () => {
    expect(() =>
      buildCaptureArtifactPaths({
        outDir: 'pr-visual-artifacts',
        route: '/',
        viewportName: '---',
      })
    ).toThrow('Capture viewport name is required');
  });

  it('round-trips the recorded path through the trusted artifact reader', async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'pr-visual-artifact-'));
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('capture-path-contract'),
    ]);
    try {
      const { artifactPath, outputPath } = buildCaptureArtifactPaths({
        outDir: artifactDir,
        route: '/',
        viewportName: 'desktop',
      });
      await writeFile(outputPath, png);
      await expect(
        readTrustedCapture(artifactDir, artifactPath)
      ).resolves.toEqual(png);
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});
