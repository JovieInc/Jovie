#!/usr/bin/env tsx
/**
 * Chunk Comparison Script
 *
 * Compares Next.js build output against a baseline to detect bundle size regressions.
 * Follows the same guard pattern as test-performance-guard.ts.
 *
 * Usage:
 *   pnpm --filter @jovie/web compare-chunks          # Compare against baseline
 *   pnpm --filter @jovie/web compare-chunks:snapshot  # Capture new baseline
 *
 * JOV-6585: also enforces explicit telemetry-contribution budgets (compressed
 * and uncompressed) for the chunks that ship browser telemetry onto public
 * routes. Limits live in docs/performance/telemetry-budgets.json with a
 * documented Jovie-measured baseline; a missing build manifest fails closed.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(
  WEB_ROOT,
  '../../docs/performance/bundle-baseline.json'
);
const BUILD_MANIFEST_PATH = join(WEB_ROOT, '.next/build-manifest.json');
// Reserved for future app-router manifest comparison
// const APP_BUILD_MANIFEST_PATH = join(WEB_ROOT, '.next/app-build-manifest.json');
const ROUTE_BUDGETS_PATH = join(
  WEB_ROOT,
  '../../docs/performance/route-budgets.json'
);
const TELEMETRY_BUDGETS_PATH = join(
  WEB_ROOT,
  '../../docs/performance/telemetry-budgets.json'
);

const GROWTH_THRESHOLD_PERCENT = 10;

/**
 * Telemetry chunk classification (JOV-6585). A chunk counts as telemetry
 * contribution when any module in it resolves to one of these provenance
 * markers — the browser analytics paths plus the vendor collectors they pull
 * in transitively.
 *
 * Turbopack sanitizes source paths into chunk names by replacing `/` and `.`
 * with `_` (e.g. `..._lib_tracking_navigation_telemetry_..._.js`), and webpack
 * keeps path segments in split-chunk names, so each marker is normalized to
 * its underscore-separated form for matching against chunk paths.
 */
export const TELEMETRY_MODULE_MARKERS = [
  'lib/tracking/',
  'lib/analytics',
  'lib/monitoring/web-vitals',
  '@vercel/analytics',
  'web-vitals',
  'googletagmanager',
  'gtag',
] as const;

function normalizeChunkName(chunkPath: string): string {
  return chunkPath.replaceAll('/', '_').replaceAll('.', '_');
}

export function isTelemetryChunk(
  chunkPath: string,
  markers: readonly string[] = TELEMETRY_MODULE_MARKERS
): boolean {
  // Match the raw path (webpack may keep `/` and `.`) and the sanitized name
  // (Turbopack). The 'web-vitals'/'gtag' markers intentionally match either
  // spelling; no non-telemetry module path contains these substrings.
  const normalized = normalizeChunkName(chunkPath).replaceAll('-', '_');
  return markers.some(marker => {
    const markerNormalized = normalizeChunkName(marker).replaceAll('-', '_');
    return chunkPath.includes(marker) || normalized.includes(markerNormalized);
  });
}

interface TelemetryBudgets {
  limits: {
    gzip_bytes: number;
    raw_bytes: number;
  };
  baseline: {
    commit: string | null;
    capturedAt: string;
    measured_gzip_bytes: number;
    measured_raw_bytes: number;
  };
  rationale: string;
}

interface Baseline {
  capturedAt: string | null;
  commit: string | null;
  totalInitialJS_bytes: number;
  chunks: Record<string, number>;
}

export interface BuildManifest {
  pages: Record<string, string[]>;
  polyfillFiles?: string[];
  ampDevFiles?: string[];
  lowPriorityFiles?: string[];
  rootMainFiles?: string[];
  devFiles?: string[];
}

function getFileSize(filePath: string): number {
  try {
    const fullPath = join(WEB_ROOT, '.next', filePath);
    if (existsSync(fullPath)) {
      return readFileSync(fullPath).length;
    }
  } catch {
    // Ignore missing files
  }
  return 0;
}

function getFileBytes(filePath: string): Buffer | null {
  try {
    const fullPath = join(WEB_ROOT, '.next', filePath);
    if (existsSync(fullPath)) {
      return readFileSync(fullPath);
    }
  } catch {
    // Ignore missing files
  }
  return null;
}

/**
 * JOV-6585: telemetry chunk classification lives above (isTelemetryChunk with
 * Turbopack/webpack name normalization).
 */
export interface TelemetryContribution {
  readonly chunks: Record<string, { raw: number; gzip: number }>;
  readonly rawBytes: number;
  readonly gzipBytes: number;
}

/**
 * Measure the telemetry contribution of a build-manifest chunk set: raw and
 * gzip-compressed bytes summed over every telemetry chunk (deduplicated by
 * chunk path, so transitive telemetry dependencies shared across pages count
 * once).
 */
export function measureTelemetryContribution(
  chunkPaths: readonly string[],
  readChunkBytes: (chunkPath: string) => Buffer | null = getFileBytes
): TelemetryContribution {
  const chunks: Record<string, { raw: number; gzip: number }> = {};
  let rawBytes = 0;
  let gzipBytes = 0;
  const seen = new Set<string>();

  for (const chunkPath of chunkPaths) {
    if (seen.has(chunkPath)) continue;
    seen.add(chunkPath);
    if (!isTelemetryChunk(chunkPath)) continue;
    const bytes = readChunkBytes(chunkPath);
    if (!bytes) continue;
    const gzip = gzipSync(bytes).length;
    chunks[chunkPath] = { raw: bytes.length, gzip };
    rawBytes += bytes.length;
    gzipBytes += gzip;
  }

  return { chunks, gzipBytes, rawBytes };
}

export function loadTelemetryBudgets(
  budgetsPath: string = TELEMETRY_BUDGETS_PATH
): TelemetryBudgets {
  if (!existsSync(budgetsPath)) {
    throw new TypeError(
      `Telemetry budget file is missing: ${budgetsPath}. The gate is fail-closed — commit docs/performance/telemetry-budgets.json instead of skipping the check.`
    );
  }

  const parsed = JSON.parse(readFileSync(budgetsPath, 'utf-8')) as Partial<
    Record<'limits' | 'baseline' | 'rationale', unknown>
  >;
  const limits = parsed.limits as
    | { gzip_bytes?: unknown; raw_bytes?: unknown }
    | undefined;
  const baseline = parsed.baseline as
    | {
        commit?: unknown;
        capturedAt?: unknown;
        measured_gzip_bytes?: unknown;
        measured_raw_bytes?: unknown;
      }
    | undefined;
  if (
    typeof limits?.gzip_bytes !== 'number' ||
    typeof limits?.raw_bytes !== 'number' ||
    limits.gzip_bytes <= 0 ||
    limits.raw_bytes <= 0 ||
    typeof parsed.rationale !== 'string' ||
    parsed.rationale.trim() === '' ||
    typeof baseline?.capturedAt !== 'string' ||
    typeof baseline?.measured_gzip_bytes !== 'number' ||
    typeof baseline?.measured_raw_bytes !== 'number'
  ) {
    throw new TypeError(
      `Telemetry budget file is malformed: ${budgetsPath} must define limits.gzip_bytes, limits.raw_bytes, a non-empty rationale, and a baseline {commit, capturedAt, measured_gzip_bytes, measured_raw_bytes}.`
    );
  }

  return parsed as TelemetryBudgets;
}

export interface TelemetryBudgetResult {
  readonly gzipBytes: number;
  readonly rawBytes: number;
  readonly limits: { gzip_bytes: number; raw_bytes: number };
  readonly passed: boolean;
  readonly violations: readonly string[];
}

export function evaluateTelemetryBudgets(
  contribution: TelemetryContribution,
  budgets: TelemetryBudgets
): TelemetryBudgetResult {
  const violations: string[] = [];
  if (contribution.gzipBytes > budgets.limits.gzip_bytes) {
    violations.push(
      `telemetry gzip ${contribution.gzipBytes}B > ${budgets.limits.gzip_bytes}B limit`
    );
  }
  if (contribution.rawBytes > budgets.limits.raw_bytes) {
    violations.push(
      `telemetry uncompressed ${contribution.rawBytes}B > ${budgets.limits.raw_bytes}B limit`
    );
  }
  return {
    gzipBytes: contribution.gzipBytes,
    limits: budgets.limits,
    passed: violations.length === 0,
    rawBytes: contribution.rawBytes,
    violations,
  };
}

/** Print the telemetry report section; returns violations for the caller. */
export function reportTelemetryBudget(
  contribution: TelemetryContribution,
  budgets: TelemetryBudgets
): TelemetryBudgetResult {
  const result = evaluateTelemetryBudgets(contribution, budgets);
  console.log(`\n### Telemetry contribution (JOV-6585)\n`);
  console.log(`| Metric | Measured | Limit |`);
  console.log(`|--------|----------|-------|`);
  console.log(
    `| Telemetry JS (gzip) | ${formatBytes(contribution.gzipBytes)} | ${formatBytes(budgets.limits.gzip_bytes)} |`
  );
  console.log(
    `| Telemetry JS (uncompressed) | ${formatBytes(contribution.rawBytes)} | ${formatBytes(budgets.limits.raw_bytes)} |`
  );
  console.log(
    `| Telemetry chunks | ${Object.keys(contribution.chunks).length} | — |`
  );
  for (const [chunk, sizes] of Object.entries(contribution.chunks)) {
    console.log(
      `- \`${chunk}\`: ${formatBytes(sizes.raw)} raw / ${formatBytes(sizes.gzip)} gzip`
    );
  }
  if (!result.passed) {
    for (const violation of result.violations) {
      console.log(`\n❌ TELEMETRY BUDGET EXCEEDED: ${violation}`);
    }
  } else {
    console.log(`\n✅ Telemetry contribution within committed limits.`);
  }
  return result;
}

/**
 * Per-route initial-JS budgets (JOV-8561). docs/performance/route-budgets.json
 * declares a per-surface initialJS_gzip_kb (marketing 150, public 180,
 * dashboard 250, admin 300). Every build-manifest page is charged the chunks
 * it ships and checked against its OWN surface budget — replacing the former
 * site-wide Math.max(admin) ceiling that let marketing/public pages grow to
 * the admin limit without failing.
 */
export interface RouteInitialJsBudgets {
  readonly surfaces: Readonly<Record<string, number>>;
}

export interface RouteBudgetResult {
  readonly page: string;
  readonly surface: string;
  readonly rawBytes: number;
  readonly estimatedGzipBytes: number;
  readonly budgetKB: number | null;
}

export interface RouteBudgetEvaluation {
  readonly results: readonly RouteBudgetResult[];
  readonly violations: readonly string[];
  readonly passed: boolean;
}

export function loadRouteInitialJsBudgets(
  budgetsPath: string = ROUTE_BUDGETS_PATH
): RouteInitialJsBudgets {
  if (!existsSync(budgetsPath)) {
    throw new TypeError(
      `Route budget file is missing: ${budgetsPath}. The gate is fail-closed — commit docs/performance/route-budgets.json instead of skipping the check.`
    );
  }

  const parsed = JSON.parse(readFileSync(budgetsPath, 'utf-8')) as {
    routes?: unknown;
  };
  const routes = parsed.routes as
    | Record<string, { budgets?: Record<string, unknown> }>
    | undefined;
  if (!routes || Object.keys(routes).length === 0) {
    throw new TypeError(
      `Route budget file is malformed: ${budgetsPath} must define a non-empty routes object.`
    );
  }

  const surfaces: Record<string, number> = {};
  const problems: string[] = [];
  for (const [surface, spec] of Object.entries(routes)) {
    const kb = spec?.budgets?.initialJS_gzip_kb;
    if (typeof kb !== 'number' || !Number.isFinite(kb) || kb <= 0) {
      problems.push(
        `${surface}.budgets.initialJS_gzip_kb must be a positive number`
      );
      continue;
    }
    surfaces[surface] = kb;
  }
  if (problems.length > 0) {
    throw new TypeError(
      `Route budget file is malformed: ${budgetsPath} — ${problems.join('; ')}.`
    );
  }

  return { surfaces };
}

/**
 * Classify a build-manifest page key into a route-budgets.json surface.
 * Precedence mirrors the declared examples: /app/admin* is admin, other /app
 * routes are dashboard, public-profile shapes (/r/*, a leading dynamic
 * segment, or a single-segment slug route) are public, everything else is
 * marketing. Unmatched pages default to marketing — the tightest declared
 * budget — so an unmapped route can never ride a looser ceiling.
 */
export function classifyRouteSurface(page: string): string {
  if (page.startsWith('/app/admin')) return 'admin';
  if (page.startsWith('/app')) return 'dashboard';
  if (
    page.startsWith('/r/') ||
    page.startsWith('/[') ||
    /^\/[a-z0-9-]+$/i.test(page)
  ) {
    return 'public';
  }
  return 'marketing';
}

/**
 * Evaluate every build-manifest page against its surface's initialJS_gzip_kb
 * budget. Sizes are uncompressed bytes; budgets are gzip, compared via the
 * same gzip ≈ 30% of uncompressed estimate the pre-JOV-8561 aggregate check
 * used. A page whose surface declares no budget is a fail-closed violation.
 */
export function evaluateRouteBudgets(
  manifest: BuildManifest,
  budgets: RouteInitialJsBudgets,
  getChunkSizeFn: (chunkPath: string) => number = getFileSize
): RouteBudgetEvaluation {
  const results: RouteBudgetResult[] = [];
  const violations: string[] = [];
  const rootFiles = manifest.rootMainFiles ?? [];

  for (const page of Object.keys(manifest.pages).sort()) {
    // Framework pseudo-pages (/_app, /_error, ...) have no surface of their
    // own; their chunks ship on every real page via rootMainFiles.
    if (page.startsWith('/_')) continue;

    const files = new Set<string>();
    for (const file of rootFiles) {
      files.add(file);
    }
    for (const file of manifest.pages[page] ?? []) {
      if (file.endsWith('.js')) {
        files.add(file);
      }
    }

    let rawBytes = 0;
    for (const file of files) {
      rawBytes += getChunkSizeFn(file);
    }
    const estimatedGzipBytes = rawBytes * 0.3;
    const surface = classifyRouteSurface(page);
    const budgetKB = budgets.surfaces[surface] ?? null;
    results.push({
      page,
      surface,
      rawBytes,
      estimatedGzipBytes,
      budgetKB,
    });

    if (budgetKB === null) {
      violations.push(
        `route ${page} maps to surface '${surface}' which declares no initialJS_gzip_kb budget (fail-closed)`
      );
      continue;
    }
    if (estimatedGzipBytes > budgetKB * 1024) {
      violations.push(
        `route ${page} (${surface}) estimated initial JS gzip ${formatBytes(estimatedGzipBytes)} > ${formatBytes(budgetKB * 1024)} budget`
      );
    }
  }

  return {
    results,
    violations,
    passed: violations.length === 0,
  };
}

function collectChunkSizes(manifest: BuildManifest): Record<string, number> {
  const chunks: Record<string, number> = {};

  // Collect all unique JS files from the manifest
  const allFiles = new Set<string>();

  // Root main files (shared framework chunks)
  for (const file of manifest.rootMainFiles ?? []) {
    allFiles.add(file);
  }

  // Page-specific chunks
  for (const [_page, files] of Object.entries(manifest.pages)) {
    for (const file of files) {
      if (file.endsWith('.js')) {
        allFiles.add(file);
      }
    }
  }

  for (const file of allFiles) {
    const size = getFileSize(file);
    if (size > 0) {
      chunks[file] = size;
    }
  }

  return chunks;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  return `${(kb / 1024).toFixed(2)}MB`;
}

function captureSnapshot(): void {
  if (!existsSync(BUILD_MANIFEST_PATH)) {
    console.error('❌ No build output found. Run `pnpm build` first.');
    process.exit(1);
  }

  const manifest: BuildManifest = JSON.parse(
    readFileSync(BUILD_MANIFEST_PATH, 'utf-8')
  );
  const chunks = collectChunkSizes(manifest);
  const totalBytes = Object.values(chunks).reduce((sum, size) => sum + size, 0);

  let commit: string | null = null;
  try {
    commit = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    // Not in a git repo
  }

  const baseline: Baseline = {
    capturedAt: new Date().toISOString(),
    commit,
    totalInitialJS_bytes: totalBytes,
    chunks,
  };

  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `✅ Baseline captured: ${formatBytes(totalBytes)} total JS (${Object.keys(chunks).length} chunks)`
  );
  console.log(`   Saved to: ${BASELINE_PATH}`);
}

function compare(): void {
  if (!existsSync(BUILD_MANIFEST_PATH)) {
    console.error('❌ No build output found. Run `pnpm build` first.');
    process.exit(1);
  }

  const manifest: BuildManifest = JSON.parse(
    readFileSync(BUILD_MANIFEST_PATH, 'utf-8')
  );
  const currentChunks = collectChunkSizes(manifest);
  const currentTotal = Object.values(currentChunks).reduce(
    (sum, size) => sum + size,
    0
  );

  // Load baseline
  let baseline: Baseline | null = null;
  if (existsSync(BASELINE_PATH)) {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  }

  let hasFailure = false;

  // Load per-route initialJS budgets (JOV-8561). Fail-closed: a missing or
  // malformed budget file is itself a failure, never a skip.
  let routeBudgets: RouteInitialJsBudgets | null = null;
  try {
    routeBudgets = loadRouteInitialJsBudgets();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ ROUTE BUDGET GATE UNAVAILABLE: ${reason}`);
    hasFailure = true;
  }

  console.log('## Bundle Size Report\n');
  console.log(`| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| Total JS | ${formatBytes(currentTotal)} |`);
  console.log(`| Chunks | ${Object.keys(currentChunks).length} |`);
  console.log(
    `| Budget | per-route initialJS_gzip_kb (docs/performance/route-budgets.json) |`
  );

  if (baseline && baseline.totalInitialJS_bytes > 0) {
    const delta = currentTotal - baseline.totalInitialJS_bytes;
    const deltaPercent = (
      (delta / baseline.totalInitialJS_bytes) *
      100
    ).toFixed(1);
    const sign = delta >= 0 ? '+' : '';
    console.log(
      `| vs Baseline | ${sign}${formatBytes(delta)} (${sign}${deltaPercent}%) |`
    );
    console.log(`| Baseline commit | ${baseline.commit ?? 'unknown'} |`);

    // Find new, removed, and grown chunks
    const newChunks: string[] = [];
    const removedChunks: string[] = [];
    const grownChunks: Array<{
      file: string;
      before: number;
      after: number;
      percent: number;
    }> = [];

    for (const [file, size] of Object.entries(currentChunks)) {
      if (!(file in baseline.chunks)) {
        newChunks.push(file);
      } else {
        const before = baseline.chunks[file];
        const growthPercent = ((size - before) / before) * 100;
        if (growthPercent > GROWTH_THRESHOLD_PERCENT) {
          grownChunks.push({
            file,
            before,
            after: size,
            percent: growthPercent,
          });
        }
      }
    }

    for (const file of Object.keys(baseline.chunks)) {
      if (!(file in currentChunks)) {
        removedChunks.push(file);
      }
    }

    if (newChunks.length > 0) {
      console.log(`\n### New chunks (${newChunks.length})`);
      for (const file of newChunks.slice(0, 10)) {
        console.log(`- \`${file}\` (${formatBytes(currentChunks[file])})`);
      }
      if (newChunks.length > 10)
        console.log(`- ... and ${newChunks.length - 10} more`);
    }

    if (removedChunks.length > 0) {
      console.log(`\n### Removed chunks (${removedChunks.length})`);
      for (const file of removedChunks.slice(0, 10)) {
        console.log(`- \`${file}\``);
      }
    }

    if (grownChunks.length > 0) {
      console.log(`\n### Chunks grown >${GROWTH_THRESHOLD_PERCENT}%`);
      console.log('| Chunk | Before | After | Growth |');
      console.log('|-------|--------|-------|--------|');
      for (const { file, before, after, percent } of grownChunks
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 10)) {
        console.log(
          `| \`${file.split('/').pop()}\` | ${formatBytes(before)} | ${formatBytes(after)} | +${percent.toFixed(1)}% |`
        );
      }
    }
  } else {
    console.log(`| vs Baseline | No baseline captured yet |`);
  }

  // Per-route initial-JS budget check (JOV-8561). Sizes are uncompressed;
  // budgets are gzip, estimated at ≈ 30% of uncompressed (the same convention
  // the former site-wide Math.max(admin) aggregate check used).
  if (routeBudgets) {
    const evaluation = evaluateRouteBudgets(manifest, routeBudgets);
    console.log(`\n### Per-route initial JS budgets (JOV-8561)\n`);
    console.log(`| Route | Surface | Est. gzip | Budget |`);
    console.log(`|-------|---------|-----------|--------|`);
    // Report is bounded: the worst (largest) page per surface — violations
    // are printed in full below regardless of count.
    const worstBySurface = new Map<string, RouteBudgetResult>();
    for (const row of evaluation.results) {
      const worst = worstBySurface.get(row.surface);
      if (!worst || row.estimatedGzipBytes > worst.estimatedGzipBytes) {
        worstBySurface.set(row.surface, row);
      }
    }
    for (const row of [...worstBySurface.values()].sort((a, b) =>
      a.surface.localeCompare(b.surface)
    )) {
      const budgetLabel =
        row.budgetKB === null ? 'none' : formatBytes(row.budgetKB * 1024);
      console.log(
        `| ${row.page} | ${row.surface} | ${formatBytes(row.estimatedGzipBytes)} | ${budgetLabel} |`
      );
    }
    for (const violation of evaluation.violations) {
      console.log(`\n❌ ROUTE BUDGET EXCEEDED: ${violation}`);
    }
    if (evaluation.passed) {
      console.log(`\n✅ All routes within their initialJS_gzip_kb budgets.`);
    } else {
      hasFailure = true;
    }
  }

  // Telemetry contribution budgets (JOV-6585): explicit compressed and
  // uncompressed limits over the telemetry dependency graph of the build.
  // Fail-closed: a missing/malformed budget file is itself a failure.
  try {
    const telemetryBudgets = loadTelemetryBudgets();
    const chunkPaths = Object.keys(currentChunks);
    const contribution = measureTelemetryContribution(chunkPaths);
    const telemetryResult = reportTelemetryBudget(
      contribution,
      telemetryBudgets
    );
    if (!telemetryResult.passed) {
      hasFailure = true;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ TELEMETRY BUDGET GATE UNAVAILABLE: ${reason}`);
    hasFailure = true;
  }

  if (hasFailure) {
    process.exit(1);
  }
}

// CLI. Importing the budget helpers must not exit the process.
// Node resolves module URLs through symlinks; argv can retain an alias (such as
// macOS /var versus /private/var), so compare canonical paths on both sides.
const invokedPath = process.argv[1];
if (
  invokedPath &&
  existsSync(invokedPath) &&
  realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))
) {
  if (process.argv.includes('--snapshot')) {
    captureSnapshot();
  } else {
    compare();
  }
}
