import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyVisualQaThemePair } from '@/lib/agent-os/visual-qa/theme-check';

const tempDirs: string[] = [];

async function createSolidPng(
  directory: string,
  filename: string,
  color: { readonly r: number; readonly g: number; readonly b: number }
) {
  const outputPath = path.join(directory, filename);
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toFile(outputPath);

  return outputPath;
}

afterEach(async () => {
  tempDirs.length = 0;
});

describe('visual-qa theme check', () => {
  it('passes when dark and light captures are materially different', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'visual-qa-theme-'));
    tempDirs.push(directory);

    const darkPath = await createSolidPng(directory, 'dark.png', {
      r: 10,
      g: 12,
      b: 16,
    });
    const lightPath = await createSolidPng(directory, 'light.png', {
      r: 240,
      g: 242,
      b: 245,
    });

    const result = await verifyVisualQaThemePair({
      darkScreenshotPath: darkPath,
      lightScreenshotPath: lightPath,
    });

    expect(result.passed).toBe(true);
    expect(result.luminanceDelta).toBeGreaterThan(0.04);
  });

  it('fails when dark and light captures are identical', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'visual-qa-theme-'));
    tempDirs.push(directory);

    const darkPath = await createSolidPng(directory, 'dark.png', {
      r: 20,
      g: 20,
      b: 20,
    });
    const lightPath = await writeFile(
      path.join(directory, 'light.png'),
      await sharp(darkPath).png().toBuffer()
    ).then(() => path.join(directory, 'light.png'));

    const result = await verifyVisualQaThemePair({
      darkScreenshotPath: darkPath,
      lightScreenshotPath: lightPath,
    });

    expect(result.passed).toBe(false);
  });
});
