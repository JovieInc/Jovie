#!/usr/bin/env node
/**
 * Fail-closed visual snapshot compare CLI (JOV-5459).
 * Usage: node scripts/visual-snapshot-compare.mjs compare
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runVisualSnapshotCompare,
  VISUAL_COMPARE_MODE,
} from './lib/visual-snapshot-compare.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return 'Usage: node scripts/visual-snapshot-compare.mjs compare';
}

function fail(result) {
  const detail = result.reason ?? 'unknown';
  console.error(`::error::Visual snapshot compare failed: ${detail}`);
  for (const path of result.missingBaselinePaths ?? []) {
    console.error(`missing baseline: ${path}`);
  }
  for (const issue of result.workflowIssues ?? []) {
    console.error(`workflow: ${issue}`);
  }
  process.exit(1);
}

const command = process.argv[2];
if (command !== VISUAL_COMPARE_MODE) {
  console.error(usage());
  process.exit(2);
}

const result = runVisualSnapshotCompare({
  repoRoot: REPO_ROOT,
  mode: VISUAL_COMPARE_MODE,
  existsSync,
  readFileSync,
  visualRegressionYaml: readFileSync(
    resolve(REPO_ROOT, '.github/workflows/visual-regression.yml'),
    'utf8'
  ),
  ciYaml: readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8'),
});

if (!result.ok) fail(result);

console.log(
  'Visual snapshot compare passed: missing baseline/ENOENT is fail-closed; skip is not a pass.'
);
