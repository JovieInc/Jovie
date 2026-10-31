/**
 * Marketing product imagery comes from the product-shot registry, and every
 * shot is as new as the UI it shows.
 *
 * 1. Freshness (blocking): each rendered shot in
 *    apps/web/lib/screenshots/product-shots.manifest.json records a hash of
 *    its source components. When a source changes after the render, the shot
 *    is stale: `pnpm --filter @jovie/web shots:render --stale` against a
 *    demo-mode server regenerates it. Missing or oversized files also fail.
 * 2. Source (shrink-only ratchet): marketing source may not reach product
 *    imagery around the registries: no `/product-screenshots/` or
 *    `/product-shots/` path literals and no `screenshot-catalog` imports.
 *    Existing hits live in product-shots.baseline.json and only shrink.
 *
 * Full-viewport captures on marketing pages are banned by
 * apps/web/tests/unit/marketing/product-imagery-invariant.test.ts, which can
 * read the TypeScript scenario registry.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashShotSources } from '../../../apps/web/scripts/product-shots/source-hash.mjs';
import {
  MARKETING_SOURCE_ROOTS,
  REPO_ROOT,
  relPath,
  stripComments,
  walkFiles,
} from './paths.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';

export const SHOT_MANIFEST =
  'apps/web/lib/screenshots/product-shots.manifest.json';
export const SHOT_PUBLIC_DIR = 'apps/web/public/product-shots';
export const SHOT_BASELINE =
  'scripts/invariants/art-direction/product-shots.baseline.json';
/** Matches PRODUCT_SHOT_MAX_BYTES in apps/web/scripts/product-shots/render.ts. */
export const SHOT_MAX_BYTES = 120 * 1024;

const RAW_IMAGERY = [
  { id: 'product-screenshots-path', pattern: /['"`(]\/product-screenshots\// },
  { id: 'product-shots-path', pattern: /['"`(]\/product-shots\// },
  { id: 'screenshot-catalog-import', pattern: /screenshot-catalog\// },
];

/** Shot files the renderer owns; the component resolves them via the registry. */
const RAW_IMAGERY_OWNERS = new Set([
  'apps/web/components/marketing/ProductShot.tsx',
]);

export function checkFreshness(repoRoot = REPO_ROOT) {
  /** @type {string[]} */
  const failures = [];
  const manifestPath = join(repoRoot, SHOT_MANIFEST);
  if (!existsSync(manifestPath)) {
    return [`${SHOT_MANIFEST} is missing`];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const [id, entry] of Object.entries(manifest.shots ?? {})) {
    let current;
    try {
      current = hashShotSources(repoRoot, entry.sources ?? []);
    } catch (error) {
      failures.push(
        `${id}: a source file is unreadable (${error.message}); update the shot's sources and re-render`
      );
      continue;
    }
    if (current !== entry.sourceHash) {
      failures.push(
        `${id}: stale, a source changed after the shot was rendered (${entry.renderedAt}). Run: pnpm --filter @jovie/web shots:render --stale`
      );
    }
    for (const format of ['avif', 'webp']) {
      const rel = `${SHOT_PUBLIC_DIR}/${id}.${format}`;
      const file = join(repoRoot, rel);
      if (!existsSync(file)) {
        failures.push(`${id}: ${rel} is missing`);
        continue;
      }
      const size = statSync(file).size;
      if (size > SHOT_MAX_BYTES) {
        failures.push(
          `${id}: ${rel} is ${size} bytes (> ${SHOT_MAX_BYTES}); tighten the crop`
        );
      }
    }
  }
  return failures;
}

export function rawImageryIds(repoRoot = REPO_ROOT) {
  const ids = new Set();
  for (const file of walkFiles(repoRoot, MARKETING_SOURCE_ROOTS)) {
    const rel = relPath(repoRoot, file);
    if (RAW_IMAGERY_OWNERS.has(rel)) continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const { id, pattern } of RAW_IMAGERY) {
      if (pattern.test(source)) ids.add(`${rel}#${id}`);
    }
  }
  return [...ids].sort();
}

export function checkRawImagery(repoRoot = REPO_ROOT, recordedIds) {
  const current = rawImageryIds(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, SHOT_BASELINE), 'utf8')).ids;
  const ancestor = ancestorJson(repoRoot, SHOT_BASELINE);
  if (!ancestor.ok) return [ancestor.error];
  return evaluateRatchet({
    current,
    recorded,
    ancestor: ancestor.ancestor?.ids ?? null,
  }).map(
    error =>
      `${error}\nUse <ProductShot id> (lib/screenshots/product-shots.ts) or the registry wrappers instead of raw product image paths.`
  );
}

export function check(repoRoot = REPO_ROOT) {
  return {
    failures: [...checkFreshness(repoRoot), ...checkRawImagery(repoRoot)],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--write')) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      join(REPO_ROOT, SHOT_BASELINE),
      `${JSON.stringify({ schema: 'jovie.art-direction-product-shots/v1', ids: rawImageryIds() }, null, 2)}\n`
    );
  }
  const { failures } = check();
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('product-shots: ok\n');
  }
}
