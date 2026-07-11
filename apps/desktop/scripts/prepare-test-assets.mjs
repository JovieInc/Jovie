#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = join(desktopRoot, 'assets');
const entries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

async function generateIcns(name) {
  const source = join(assetsRoot, `${name}.png`);
  const iconset = join(assetsRoot, `${name}.iconset`);
  const output = join(assetsRoot, `${name}.icns`);
  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset, { recursive: true });
  try {
    await Promise.all(
      entries.map(([file, size]) =>
        sharp(source).resize(size, size).png().toFile(join(iconset, file))
      )
    );
    const result = spawnSync(
      'iconutil',
      ['-c', 'icns', iconset, '-o', output],
      { encoding: 'utf8' }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'iconutil failed');
    }
  } finally {
    await rm(iconset, { recursive: true, force: true });
  }
}

if (process.platform === 'darwin') {
  await Promise.all([generateIcns('icon'), generateIcns('icon-staging')]);
}
