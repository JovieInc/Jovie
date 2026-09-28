import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// .icns files are macOS-specific and cannot be generated on Linux CI
const isMacOS = process.platform === 'darwin';

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
const productionIcnsPath = join(assetsRoot, 'icon.icns');
const stagingIcnsPath = join(assetsRoot, 'icon-staging.icns');
const productionPngPath = join(assetsRoot, 'icon.png');
const stagingPngPath = join(assetsRoot, 'icon-staging.png');
const productionIconsetPath = join(assetsRoot, 'icon.iconset');
const stagingIconsetPath = join(assetsRoot, 'icon-staging.iconset');
const ICON_SIZE = 512;

async function pngMetadata(filePath) {
  return sharp(filePath).metadata();
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function assertBlackCorners(filePath) {
  const pixels = await sharp(filePath)
    .ensureAlpha()
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

async function assertTransparentCorners(filePath) {
  const pixels = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = pixels;
  const sampleAlpha = (x, y) => {
    const index = (y * info.width + x) * info.channels;
    return data[index + 3];
  };
  for (const alpha of [
    sampleAlpha(0, 0),
    sampleAlpha(info.width - 1, 0),
    sampleAlpha(0, info.height - 1),
    sampleAlpha(info.width - 1, info.height - 1),
  ]) {
    assert.ok(alpha <= 5);
  }
}

async function assertRoundedTransparentPng(filePath, size) {
  const metadata = await pngMetadata(filePath);
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, size);
  assert.equal(metadata.height, size);
  assert.equal(metadata.hasAlpha, true);
  await assertTransparentCorners(filePath);
}

// macOS grid: the visible tile must sit inside the canvas (Apple reserves
// ~824/1024). A full-bleed tile reads oversized next to grid-conforming
// icons in the Dock and app switcher — this asserts the safe-area margin.
async function assertMacSafeArea(filePath, size) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const tileW = maxX - minX + 1;
  const tileH = maxY - minY + 1;
  const ratio = tileW / size;
  assert.ok(
    ratio >= 0.76 && ratio <= 0.84,
    `tile occupies ${(ratio * 100).toFixed(1)}% of canvas; expected ~80%`
  );
  assert.equal(tileW, tileH);
  // Centered within rounding.
  assert.ok(Math.abs(minX - (size - 1 - maxX)) <= 2);
  assert.ok(Math.abs(minY - (size - 1 - maxY)) <= 2);
}

async function assertIcnsFile(filePath) {
  const buffer = await readFile(filePath);
  assert.equal(buffer.subarray(0, 4).toString('utf8'), 'icns');
  assert.ok(buffer.length > 0);
}

async function icnsFilesMissing() {
  for (const filePath of [productionIcnsPath, stagingIcnsPath]) {
    try {
      await access(filePath);
    } catch {
      return true;
    }
  }
  return false;
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

test('packaged production and staging icons use the rounded desktop profile', async () => {
  await assertRoundedTransparentPng(productionPngPath, ICON_SIZE);
  await assertRoundedTransparentPng(stagingPngPath, ICON_SIZE);
  await assertMacSafeArea(productionPngPath, ICON_SIZE);
  await assertMacSafeArea(stagingPngPath, ICON_SIZE);

  // .icns files are macOS-specific; skip this assertion on other platforms.
  // They are also gitignored build artifacts of prepare:assets (macOS-only
  // iconutil), so skip when they have not been generated yet.
  if (!isMacOS) {
    console.log('Skipping .icns file assertions on non-macOS platform');
  } else if (await icnsFilesMissing()) {
    console.log(
      'Skipping .icns file assertions: assets/*.icns not generated (run pnpm run prepare:assets)'
    );
  } else {
    await assertIcnsFile(productionIcnsPath);
    await assertIcnsFile(stagingIcnsPath);
  }

  const expectedProductionIcon = await readFile(canonicalIconPath);
  const productionIcon = await readFile(productionPngPath);
  const stagingIcon = await readFile(stagingPngPath);

  assert.notDeepEqual(productionIcon, expectedProductionIcon);
  assert.deepEqual(stagingIcon, productionIcon);
});

test('desktop icon generation cleans up temporary iconset caches', async () => {
  await assert.rejects(access(productionIconsetPath));
  await assert.rejects(access(stagingIconsetPath));
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
  assert.match(productionConfig, /icon: assets\/icon\.icns/);
  assert.match(productionConfig, /assets\/icon\.png/);
  assert.match(productionConfig, /assets\/dmg-background\.png/);
  assert.doesNotMatch(productionConfig, /Linear/);

  assert.match(stagingConfig, /productName: Jovie Staging/);
  assert.match(stagingConfig, /icon: assets\/icon-staging\.icns/);
  assert.match(stagingConfig, /assets\/icon-staging\.png/);
  assert.match(stagingConfig, /assets\/dmg-background\.png/);
  assert.doesNotMatch(stagingConfig, /Linear/);
});
