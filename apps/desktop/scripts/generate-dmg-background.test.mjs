import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDmgBackgroundSvg,
  getDesktopBuildYear,
  HEIGHT,
  WIDTH,
} from './generate-dmg-background.mjs';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('desktop build year follows the current calendar year', () => {
  assert.equal(getDesktopBuildYear(new Date('2028-01-01T12:00:00Z')), 2028);
});

test('desktop build year never falls behind the first production year', () => {
  assert.equal(getDesktopBuildYear(new Date('2025-12-31T12:00:00Z')), 2026);
});

test('dmg background uses the generated year and installer geometry', () => {
  const iconDataUri = 'data:image/png;base64,am92aWU=';
  const svg = buildDmgBackgroundSvg({ year: 2028, appIconDataUri: iconDataUri });

  assert.match(svg, new RegExp(`width="${WIDTH}" height="${HEIGHT}"`));
  assert.match(svg, /&#169; 2028/);
  assert.match(svg, /Jovie Technology Inc\./);
  assert.match(svg, /Built for artists/);
  assert.match(svg, /Drag Jovie to Applications/);
  assert.match(svg, new RegExp(`href="${iconDataUri}"`));
  assert.doesNotMatch(svg, /M31 10A20 20 0 0 0 11 30H31V10Z/);
  assert.doesNotMatch(svg, /&#169; 2025/);
});

test('electron-builder configs do not pin a stale copyright year', async () => {
  const configs = await Promise.all([
    readFile(join(desktopRoot, 'electron-builder.yml'), 'utf8'),
    readFile(join(desktopRoot, 'electron-builder.staging.yml'), 'utf8'),
  ]);

  for (const config of configs) {
    assert.doesNotMatch(config, /^copyright:\s*["']?Copyright/m);
  }
});

test('desktop package metadata uses the legal Jovie company name', async () => {
  const packageJson = JSON.parse(
    await readFile(join(desktopRoot, 'package.json'), 'utf8')
  );

  assert.equal(packageJson.author, 'Jovie Technology Inc.');
});
