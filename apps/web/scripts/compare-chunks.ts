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
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Initial JS budget (bytes) — fail CI if total exceeds this
const DEFAULT_INITIAL_JS_BUDGET_KB = 250;
const GROWTH_THRESHOLD_PERCENT = 10;

interface Baseline {
  capturedAt: string | null;
  commit: string | null;
  totalInitialJS_bytes: number;
  chunks: Record<string, number>;
}

interface BuildManifest {
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

  // Load route budgets
  let budgetKB = DEFAULT_INITIAL_JS_BUDGET_KB;
  if (existsSync(ROUTE_BUDGETS_PATH)) {
    try {
      const routeBudgets = JSON.parse(
        readFileSync(ROUTE_BUDGETS_PATH, 'utf-8')
      );
      // Use the highest budget (admin) as the overall threshold
      budgetKB = Math.max(
        ...Object.values(
          routeBudgets.routes as Record<
            string,
            { budgets: { initialJS_gzip_kb: number } }
          >
        ).map(r => r.budgets.initialJS_gzip_kb)
      );
    } catch {
      // Use default
    }
  }

  const budgetBytes = budgetKB * 1024;
  let hasFailure = false;

  console.log('## Bundle Size Report\n');
  console.log(`| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| Total JS | ${formatBytes(currentTotal)} |`);
  console.log(`| Chunks | ${Object.keys(currentChunks).length} |`);
  console.log(`| Budget | ${formatBytes(budgetBytes)} |`);

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

  // Budget check
  // Note: currentTotal is uncompressed; budget is gzip. Rough estimate: gzip ≈ 30% of uncompressed.
  const estimatedGzip = currentTotal * 0.3;
  if (estimatedGzip > budgetBytes) {
    console.log(
      `\n❌ BUDGET EXCEEDED: Estimated gzip size ${formatBytes(estimatedGzip)} > ${formatBytes(budgetBytes)} budget`
    );
    hasFailure = true;
  } else {
    console.log(
      `\n✅ Within budget: ~${formatBytes(estimatedGzip)} gzip < ${formatBytes(budgetBytes)}`
    );
  }

  if (hasFailure) {
    process.exit(1);
  }
}

// CLI
const isSnapshot = process.argv.includes('--snapshot');
if (isSnapshot) {
  captureSnapshot();
} else {
  compare();
}
