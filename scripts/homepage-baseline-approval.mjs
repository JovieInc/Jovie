#!/usr/bin/env node
/**
 * Founder approval receipt for homepage visual baselines.
 *
 * The homepage (`/`) is bound to Pen stills, so scripts/visual-baseline-adopt.mjs
 * refuses to adopt homepage-*.png renders. When the founder approves a new
 * homepage from screenshots instead of a Pen export, this receipt records that
 * approval and pins it to the exact homepage sources that were reviewed. The approved
 * branch refresh in .github/workflows/visual-regression.yml renders the
 * homepage baselines only while the branch's sources still match the receipt,
 * so an approval can never carry later, unseen changes into a baseline.
 *
 * Usage:
 *   node scripts/homepage-baseline-approval.mjs digest [ref]   # print the sources digest of ref (HEAD)
 *   node scripts/homepage-baseline-approval.mjs verify   # exit 1 unless the receipt matches HEAD
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const RECEIPT_SCHEMA = 'jovie-homepage-baseline-approval/v1';
export const RECEIPT_PATH =
  'docs/design-system/approvals/homepage-visual-approval.json';

/**
 * The sources that decide what the homepage renders: its route and
 * components, the homepage copy and artist data they read, and the release
 * art. A trailing `*` matches a file-name prefix.
 */
export const HOMEPAGE_SOURCES = Object.freeze([
  'apps/web/app/(home)/',
  'apps/web/components/homepage/',
  'apps/web/components/features/home/',
  'apps/web/data/homepage*',
  'apps/web/data/demoArtists.ts',
  'apps/web/data/featuredArtists.ts',
  'apps/web/lib/tim-white.ts',
  'apps/web/public/img/releases/',
]);

/** Files under the sources that never change a pixel: tests, stories, analytics. */
export const NON_RENDERING = Object.freeze([
  /\.(test|spec|stories)\.[cm]?[jt]sx?$/,
  /\/__tests__\//,
  /^apps\/web\/components\/homepage\/homepage-analytics\.ts$/,
]);

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** True when a repo path is one the approval covers. */
export function isHomepageSource(path) {
  const listed = HOMEPAGE_SOURCES.some(source =>
    source.endsWith('*')
      ? path.startsWith(source.slice(0, -1)) &&
        !path.slice(source.length - 1).includes('/')
      : source.endsWith('/')
        ? path.startsWith(source)
        : path === source
  );
  return listed && !NON_RENDERING.some(pattern => pattern.test(path));
}

/**
 * sha256 of the `git ls-tree -r <ref>` lines (blob id and path) for every
 * homepage source, so any edit, add, delete or rename of one changes it.
 */
export function sourcesDigest(repoRoot = REPO_ROOT, ref = 'HEAD') {
  const result = spawnSync(
    'git',
    ['ls-tree', '-r', '--full-tree', ref, '--', 'apps/web'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  if (result.status !== 0)
    throw new Error(`git ls-tree failed: ${result.stderr.trim()}`);
  const lines = result.stdout
    .split('\n')
    .filter(line => line && isHomepageSource(line.split('\t')[1]));
  if (lines.length === 0)
    throw new Error(`no homepage sources found at ${ref}`);
  return createHash('sha256')
    .update(`${lines.join('\n')}\n`)
    .digest('hex');
}

/** Returns the problems with a receipt against a digest; empty means valid. */
export function receiptProblems(receipt, digest) {
  const problems = [];
  if (!receipt || typeof receipt !== 'object')
    return ['receipt is not an object'];
  if (receipt.schema !== RECEIPT_SCHEMA)
    problems.push(`schema must be ${RECEIPT_SCHEMA}`);
  for (const field of [
    'approvedBy',
    'approvedAt',
    'approvalMessage',
    'answer',
  ]) {
    if (typeof receipt[field] !== 'string' || !receipt[field].trim())
      problems.push(`${field} is required`);
  }
  if (receipt.approvedAt && Number.isNaN(Date.parse(receipt.approvedAt)))
    problems.push('approvedAt must be an ISO time');
  if (receipt.sourcesDigest !== digest)
    problems.push(
      `homepage sources changed since approval (receipt ${receipt.sourcesDigest ?? 'none'}, branch ${digest}); get a new approval`
    );
  return problems;
}

function main(argv) {
  const command = argv[0];
  if (command === 'digest') {
    // Pass the reviewed commit (e.g. the approved preview's SHA) to pin it.
    console.log(sourcesDigest(REPO_ROOT, argv[1] ?? 'HEAD'));
    return 0;
  }
  if (command === 'verify') {
    const path = join(REPO_ROOT, RECEIPT_PATH);
    if (!existsSync(path)) {
      console.error(`::error::No approval receipt at ${RECEIPT_PATH}`);
      return 1;
    }
    const problems = receiptProblems(
      JSON.parse(readFileSync(path, 'utf8')),
      sourcesDigest()
    );
    for (const problem of problems) console.error(`::error::${problem}`);
    if (problems.length === 0)
      console.log(
        'Homepage baseline approval receipt matches the branch sources.'
      );
    return problems.length === 0 ? 0 : 1;
  }
  console.error('usage: homepage-baseline-approval.mjs <digest|verify>');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
