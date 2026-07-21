import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildDmgBackgroundSvg,
  getDesktopBuildYear,
  HEIGHT,
  JOVIE_MARK_PATH,
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
  const svg = buildDmgBackgroundSvg({ year: 2028 });

  assert.match(svg, new RegExp(`width="${WIDTH}" height="${HEIGHT}"`));
  assert.match(svg, /&#169; 2028/);
  assert.match(svg, /Jovie Technology Inc\./);
  assert.match(svg, /Built for artists/);
  assert.match(svg, /Drag Jovie to Applications/);
  assert.ok(svg.includes(JOVIE_MARK_PATH));
  assert.doesNotMatch(svg, /href="data:image/);
  assert.doesNotMatch(svg, /M31 10A20 20 0 0 0 11 30/);
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

test('direct-run guard still fires when invoked through a symlink', async () => {
  const scriptPath = join(desktopRoot, 'scripts/generate-dmg-background.mjs');
  const tmp = await mkdtemp(join(tmpdir(), 'dmg-bg-link-'));
  const linkPath = join(tmp, 'generate-dmg-background.mjs');
  try {
    await symlink(scriptPath, linkPath);
    const stdout = execFileSync(process.execPath, [linkPath], {
      encoding: 'utf8',
    });
    assert.match(stdout, /DMG background written: /);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
