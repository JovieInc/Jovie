/**
 * Marketing background plates under apps/web/public/assets/generated.
 *
 * Smoothness: mean absolute luma residual against a 3×3 box blur, measured
 * on a 96px-wide RGB resize. SMOOTH_RESIDUAL_MAX is 14 (0–255). A plate at
 * or above that reads as high-frequency texture and fails.
 *
 * Hue: pixels with HSL saturation ≥ 0.22 and lightness in (0.08, 0.96) are
 * chromatic. One 24° bin may dominate. A second bin that is not adjacent and
 * holds ≥ 18% of chromatic pixels is a second hue. Orange (hue 18–48°,
 * saturation ≥ 0.45) fails when it covers ≥ 4% of all pixels.
 *
 * Sidecar `<file>.meta.json` must declare accent `ion` | `ultra` | `pulse`.
 * `kind: "generated-ui"` is a hard failure, not a baseline id. Near-neutral
 * plates still name one role; the homepage plates declare ion.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromWeb = createRequire(
  new URL('../../../apps/web/package.json', import.meta.url)
);
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const IMAGE_BASELINE =
  'scripts/invariants/art-direction/images.baseline.json';
export const SMOOTH_RESIDUAL_MAX = 14;
export const SAMPLE_WIDTH = 96;
export const CHROMATIC_SAT_MIN = 0.22;
export const SECONDARY_HUE_MASS = 0.18;
export const ORANGE_PIXEL_MASS = 0.04;
export const HUE_BIN = 24;
const ROOTS = ['apps/web/public/assets/generated'];
const ACCENTS = new Set(['ion', 'ultra', 'pulse']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'storybook-static',
]);

function rgbToHsl(r, g, b) {
  const red = r / 255,
    green = g / 255,
    blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

function hueBin(hue) {
  return Math.floor(hue / HUE_BIN) % (360 / HUE_BIN);
}

function adjacent(a, b) {
  const span = 360 / HUE_BIN;
  const delta = Math.abs(a - b);
  return delta <= 1 || delta >= span - 1;
}

export function analyzePixels(data, width, height) {
  const count = width * height;
  const luma = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    luma[index] =
      0.2126 * data[offset] +
      0.7152 * data[offset + 1] +
      0.0722 * data[offset + 2];
  }
  let residual = 0;
  let residualSamples = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1)
          sum += luma[(y + dy) * width + (x + dx)];
      }
      residual += Math.abs(luma[y * width + x] - sum / 9);
      residualSamples += 1;
    }
  }
  const bins = new Map();
  let chromatic = 0;
  let orange = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const { h, s, l } = rgbToHsl(
      data[offset],
      data[offset + 1],
      data[offset + 2]
    );
    if (h >= 18 && h <= 48 && s >= 0.45) orange += 1;
    if (s < CHROMATIC_SAT_MIN || l <= 0.08 || l >= 0.96) continue;
    chromatic += 1;
    const bin = hueBin(h);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  const ordered = [...bins.entries()].sort((a, b) => b[1] - a[1]);
  const primary = ordered[0]?.[0] ?? null;
  let secondaryMass = 0;
  for (const [bin, mass] of ordered.slice(1)) {
    if (primary !== null && adjacent(bin, primary)) continue;
    secondaryMass = Math.max(secondaryMass, mass / Math.max(chromatic, 1));
  }
  return {
    residual: residualSamples === 0 ? 0 : residual / residualSamples,
    secondaryMass,
    orangeMass: orange / count,
    chromatic,
  };
}

export function classifyPlate(rel, stats, sidecar) {
  const ids = [];
  const hard = [];
  if (stats.residual >= SMOOTH_RESIDUAL_MAX) ids.push(`rough:${rel}`);
  if (stats.secondaryMass >= SECONDARY_HUE_MASS) ids.push(`multi-hue:${rel}`);
  if (stats.orangeMass >= ORANGE_PIXEL_MASS) ids.push(`orange-image:${rel}`);
  if (sidecar.missing) ids.push(`sidecar:${rel}`);
  else if (sidecar.invalid) ids.push(`sidecar-invalid:${rel}`);
  else if (!ACCENTS.has(sidecar.json?.accent))
    ids.push(`sidecar-accent:${rel}`);
  else if (
    sidecar.json.kind === 'generated-ui' ||
    sidecar.json['generated-ui'] === true
  ) {
    hard.push(`generated-ui:${rel}`);
  }
  return { ids, hard };
}

function walk(repoRoot) {
  const files = [];
  const visit = absolute => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isFile()) {
      files.push(absolute);
      return;
    }
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(absolute)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      visit(join(absolute, entry));
    }
  };
  for (const root of ROOTS) visit(join(repoRoot, root));
  return files.filter(file =>
    IMAGE_EXT.has(file.slice(file.lastIndexOf('.')).toLowerCase())
  );
}

export async function scanImages(repoRoot = REPO_ROOT) {
  const sharp = requireFromWeb('sharp');
  const ids = [];
  const hard = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    const { data, info } = await sharp(file)
      .resize({ width: SAMPLE_WIDTH, withoutEnlargement: false })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const stats = analyzePixels(data, info.width, info.height);
    const meta = `${file}.meta.json`;
    let sidecar;
    if (!existsSync(meta)) sidecar = { missing: true };
    else {
      try {
        sidecar = {
          missing: false,
          json: JSON.parse(readFileSync(meta, 'utf8')),
        };
      } catch {
        sidecar = { missing: false, invalid: true };
      }
    }
    const found = classifyPlate(rel, stats, sidecar);
    ids.push(...found.ids);
    hard.push(...found.hard);
  }
  ids.sort();
  return { ids, hard };
}

function ancestorIds(repoRoot, relPath) {
  const rev = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (rev.status !== 0)
    return {
      ok: false,
      error:
        'origin/main is not available; the ratchet cannot prove it only shrinks',
    };
  const spec = `origin/main:${relPath}`;
  if (
    spawnSync('git', ['cat-file', '-e', spec], { cwd: repoRoot }).status !== 0
  ) {
    return { ok: true, ancestor: null };
  }
  const show = spawnSync('git', ['show', spec], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (show.status !== 0) return { ok: false, error: `unable to read ${spec}` };
  return { ok: true, ancestor: JSON.parse(show.stdout).ids };
}

function ratchet(current, recorded, ancestor) {
  const errors = [];
  const known = new Set(recorded);
  const live = new Set(current);
  const added = current.filter(id => !known.has(id));
  const removed = recorded.filter(id => !live.has(id));
  if (added.length)
    errors.push(
      `baseline is missing ${added.length} live id(s); do not add ids:\n${added.map(id => `  + ${id}`).join('\n')}`
    );
  if (removed.length)
    errors.push(
      `baseline can only shrink; delete ${removed.length} resolved id(s):\n${removed.map(id => `  - ${id}`).join('\n')}`
    );
  if (ancestor) {
    const grown = current.filter(id => !new Set(ancestor).has(id));
    if (grown.length)
      errors.push(
        `new violations are not allowed (${grown.length}):\n${grown.map(id => `  + ${id}`).join('\n')}`
      );
  }
  return errors;
}

export const check = checkImages;

export async function checkImages(repoRoot = REPO_ROOT, recordedIds) {
  const { ids, hard } = await scanImages(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, IMAGE_BASELINE), 'utf8')).ids;
  const ancestor = ancestorIds(repoRoot, IMAGE_BASELINE);
  const failures = [...hard];
  if (!ancestor.ok) failures.push(ancestor.error);
  else failures.push(...ratchet(ids, recorded, ancestor.ancestor));
  return { failures, ids, hard };
}
