#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const requireFromWeb = createRequire(
  path.join(repoRoot, 'apps/web/package.json')
);
const sharp = requireFromWeb('sharp');
const registryPath = path.join(
  repoRoot,
  'apps/web/data/design/logo-assets.json'
);

const DIRECT_LOGO_TAG =
  /<(?:AwalLogo|TheOrchardLogo|UniversalMusicGroupLogo|ArmadaMusicLogo|BlackHoleRecordingsLogo)\b/;

export function verifyNormalizedLogoConsumers() {
  const files = execFileSync('git', ['ls-files', 'apps/web/**/*.tsx'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const failures = [];
  for (const file of files) {
    if (
      file.endsWith('label-logos.tsx') ||
      file.endsWith('trustLogoAssets.tsx')
    )
      continue;
    if (DIRECT_LOGO_TAG.test(readFileSync(path.join(repoRoot, file), 'utf8'))) {
      failures.push(
        `${file}: use NormalizedTrustLogo, not route-local logo sizing`
      );
    }
  }
  return failures;
}

export async function measureAlphaBounds(filePath, threshold = 8) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY)
    throw new Error(`${filePath}: no visible pixels`);
  return {
    visibleBounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    cropInset: {
      top: minY,
      right: info.width - maxX - 1,
      bottom: info.height - maxY - 1,
      left: minX,
    },
  };
}

export function assertRealRasterFile(filePath, id, failures) {
  const head = readFileSync(filePath).subarray(0, 32);
  const isPng =
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47;
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46;
  const isWebp =
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP';
  const isAvif =
    head.toString('ascii', 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(head.toString('ascii', 8, 12));
  if (!(isPng || isJpeg || isGif || isWebp || isAvif)) {
    failures.push(`${id}: ${filePath} is not a real raster image`);
  }
}

export async function verifyLogoAssetRegistry() {
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const failures = [];
  if (registry.assets.length < 5)
    failures.push('normal batch requires at least five assets');
  for (const asset of registry.assets) {
    const [filePart, symbol] = asset.sourcePath.split('#');
    const absolutePath = path.join(repoRoot, filePart);
    if (!existsSync(absolutePath)) {
      failures.push(`${asset.id}: source file missing: ${filePart}`);
      continue;
    }
    if (symbol) {
      // file#Symbol entries point at an exported inline SVG component.
      const source = readFileSync(absolutePath, 'utf8');
      if (!new RegExp(`export function ${symbol}\\b`).test(source)) {
        failures.push(`${asset.id}: ${symbol} is not exported by ${filePart}`);
      }
      if (!source.includes('<svg')) {
        failures.push(`${asset.id}: ${filePart} does not render an SVG`);
      }
    } else {
      assertRealRasterFile(absolutePath, asset.id, failures);
      const measured = await measureAlphaBounds(absolutePath);
      if (
        JSON.stringify(measured.visibleBounds) !==
        JSON.stringify(asset.visibleBounds)
      ) {
        failures.push(`${asset.id}: visibleBounds drift`);
      }
      if (
        JSON.stringify(measured.cropInset) !== JSON.stringify(asset.cropInset)
      ) {
        failures.push(`${asset.id}: cropInset drift`);
      }
    }
    if (asset.opticalScale !== 1 && !asset.opticalOverride) {
      failures.push(`${asset.id}: opticalScale requires reviewed provenance`);
    }
    if (asset.visibleBounds.width <= 0 || asset.visibleBounds.height <= 0) {
      failures.push(`${asset.id}: empty visible bounds`);
    }
    if (!asset.provenance?.version || !asset.provenance?.owner) {
      failures.push(`${asset.id}: missing provenance/version/owner`);
    }
  }
  return [...failures, ...verifyNormalizedLogoConsumers()];
}

if (process.argv[1] === import.meta.filename) {
  const failures = await verifyLogoAssetRegistry();
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Logo asset normalization contract passed.');
  }
}
