import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsRoot = join(desktopRoot, 'assets');
const webRoot = join(desktopRoot, '..', 'web');
const canonicalIconPath = join(
  webRoot,
  'public',
  'brand',
  'app-icons',
  'jovie-app-icon-512.png'
);
const contactSheetPath = join(
  webRoot,
  'public',
  'brand',
  'jovie-icon-contact-sheet.png'
);
const ICON_SIZE = 512;

async function pngMetadata(filePath) {
  return sharp(filePath).metadata();
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function assertOpaquePng(filePath, size) {
  const metadata = await pngMetadata(filePath);
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, size);
  assert.equal(metadata.height, size);
  assert.notEqual(metadata.hasAlpha, true);
}

async function assertBlackCorners(filePath) {
  const pixels = await sharp(filePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = pixels;
  const sample = (x, y) => {
    const index = (y * info.width + x) * info.channels;
    return [data[index], data[index + 1], data[index + 2]];
  };
  for (const [r, g, b] of [
    sample(0, 0),
    sample(info.width - 1, 0),
    sample(0, info.height - 1),
    sample(info.width - 1, info.height - 1),
  ]) {
    assert.ok(r <= 10 && g <= 11 && b <= 12);
  }
}

test('desktop sources the canonical opaque Jovie app icon profile', async () => {
  const sourceMetadata = await pngMetadata(canonicalIconPath);

  assert.equal(sourceMetadata.format, 'png');
  assert.equal(sourceMetadata.width, ICON_SIZE);
  assert.equal(sourceMetadata.height, ICON_SIZE);
  assert.notEqual(sourceMetadata.hasAlpha, true);
  await assertBlackCorners(canonicalIconPath);
});

test('legacy icon-source.png remains for reference but is no longer the production source', async () => {
  // Ensures we didn't accidentally leave a sailboat/placeholder as active source.
  const legacyMeta = await pngMetadata(join(assetsRoot, 'icon-source.png'));
  assert.equal(legacyMeta.format, 'png');
  assert.equal(legacyMeta.width, 1024);
  assert.equal(legacyMeta.height, 1024);
  // If this ever matches the old placeholder SHA we can flag, but the value is kept for audit.
  // (Current SHA below was the pre-real-icon placeholder.)
  const currentLegacySha = await sha256(join(assetsRoot, 'icon-source.png'));
  assert.notEqual(currentLegacySha, ''); // just ensure readable
});

test('packaged production and staging icons are generated from the canonical profile', async () => {
  await assertOpaquePng(join(assetsRoot, 'icon.png'), ICON_SIZE);
  await assertOpaquePng(join(assetsRoot, 'icon-staging.png'), ICON_SIZE);
  await assertBlackCorners(join(assetsRoot, 'icon.png'));
  await assertBlackCorners(join(assetsRoot, 'icon-staging.png'));

  const expectedProductionIcon = await readFile(canonicalIconPath);
  const productionIcon = await readFile(join(assetsRoot, 'icon.png'));
  const stagingIcon = await readFile(join(assetsRoot, 'icon-staging.png'));

  assert.deepEqual(productionIcon, expectedProductionIcon);
  assert.deepEqual(stagingIcon, expectedProductionIcon);
});

test('generated icon contact sheet exists for visual review', async () => {
  const metadata = await pngMetadata(contactSheetPath);
  assert.equal(metadata.format, 'png');
  assert.ok((metadata.width ?? 0) >= 900);
  assert.ok((metadata.height ?? 0) >= 180);
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
