import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsRoot = join(desktopRoot, 'assets');

const APPROVED_JOVIE_DARK_ICON_SHA256 =
  'd13a8ccc60ef522bc0696fdd75d944812724c8f56a4a76671104cd358dec99ee';
const ICON_SIZE = 512;

async function pngMetadata(fileName) {
  return sharp(join(assetsRoot, fileName)).metadata();
}

async function sha256(fileName) {
  return createHash('sha256')
    .update(await readFile(join(assetsRoot, fileName)))
    .digest('hex');
}

test('desktop source icon is the approved Jovie dark icon asset', async () => {
  const sourceMetadata = await pngMetadata('icon-source.png');

  assert.equal(sourceMetadata.format, 'png');
  assert.equal(sourceMetadata.width, 1024);
  assert.equal(sourceMetadata.height, 1024);
  assert.equal(
    await sha256('icon-source.png'),
    APPROVED_JOVIE_DARK_ICON_SHA256
  );
});

test('packaged production and staging icons are generated from the Jovie source icon', async () => {
  const [productionMetadata, stagingMetadata] = await Promise.all([
    pngMetadata('icon.png'),
    pngMetadata('icon-staging.png'),
  ]);

  assert.equal(productionMetadata.width, ICON_SIZE);
  assert.equal(productionMetadata.height, ICON_SIZE);
  assert.equal(stagingMetadata.width, ICON_SIZE);
  assert.equal(stagingMetadata.height, ICON_SIZE);

  const expectedProductionIcon = await sharp(join(assetsRoot, 'icon-source.png'))
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const productionIcon = await readFile(join(assetsRoot, 'icon.png'));

  assert.deepEqual(productionIcon, expectedProductionIcon);
  assert.notEqual(await sha256('icon-staging.png'), await sha256('icon.png'));
});

test('electron-builder packages the Jovie app icons for every desktop target', async () => {
  const [productionConfig, stagingConfig] = await Promise.all([
    readFile(join(desktopRoot, 'electron-builder.yml'), 'utf8'),
    readFile(join(desktopRoot, 'electron-builder.staging.yml'), 'utf8'),
  ]);

  assert.match(productionConfig, /productName: Jovie/);
  assert.match(productionConfig, /icon: assets\/icon\.png/);
  assert.match(productionConfig, /assets\/icon\.png/);
  assert.match(productionConfig, /assets\/dmg-background\.png/);
  assert.doesNotMatch(productionConfig, /Linear/);

  assert.match(stagingConfig, /productName: Jovie Staging/);
  assert.match(stagingConfig, /icon: assets\/icon-staging\.png/);
  assert.match(stagingConfig, /assets\/icon-staging\.png/);
  assert.match(stagingConfig, /assets\/dmg-background\.png/);
  assert.doesNotMatch(stagingConfig, /Linear/);
});
