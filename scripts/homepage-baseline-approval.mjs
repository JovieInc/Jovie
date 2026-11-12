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
  'docs/design-system/approvals/homepage-baselines.json';

/**
 * The sources that decide what the homepage renders: its route and
 * components, plus the artist data, product UI copy and release art they read.
 */
export const HOMEPAGE_SOURCES = Object.freeze([
  'apps/web/app/(home)',
  'apps/web/components/homepage',
  'apps/web/components/features/home',
  'apps/web/data/demoArtists.ts',
  'apps/web/data/featuredArtists.ts',
  'apps/web/data/homepageProductUi.ts',
  'apps/web/lib/tim-white.ts',
  'apps/web/public/img/releases',
]);

const REPO_ROOT = resolve(import.meta.dirname, '..');

/**
 * sha256 of `git ls-tree -r <ref> -- <sources>`: every blob id and path under
 * the homepage sources, so any edit, add, delete or rename changes it.
 */
export function sourcesDigest(repoRoot = REPO_ROOT, ref = 'HEAD') {
  const result = spawnSync(
    'git',
    ['ls-tree', '-r', '--full-tree', ref, '--', ...HOMEPAGE_SOURCES],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0)
    throw new Error(`git ls-tree failed: ${result.stderr.trim()}`);
  if (!result.stdout.trim())
    throw new Error(`no homepage sources found at ${ref}`);
  return createHash('sha256').update(result.stdout).digest('hex');
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
