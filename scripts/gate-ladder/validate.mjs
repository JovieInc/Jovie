#!/usr/bin/env node
/**
 * Validate the universal gate ladder skeleton (JOV-3210).
 *
 * Checks:
 * - ladder.json schema + unique rung ids
 * - hard-block pre-commit rungs are referenced from .husky/pre-commit
 * - PR aggregate rung references PR Ready / ios-ci
 * - web + ios adapters declare hook/workflow paths that exist
 *
 * Exit 0 = pass. Exit 1 = fail.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const LADDER_PATH = resolve(__dirname, 'ladder.json');

function read(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function main() {
  const errors = [];
  const ladder = JSON.parse(readFileSync(LADDER_PATH, 'utf8'));

  if (ladder.schemaVersion !== 1) {
    errors.push(`expected schemaVersion 1, got ${ladder.schemaVersion}`);
  }
  if (!Array.isArray(ladder.rungs) || ladder.rungs.length < 5) {
    errors.push('ladder must declare at least 5 rungs');
  }

  const ids = ladder.rungs.map(r => r.id);
  if (new Set(ids).size !== ids.length) {
    errors.push('rung ids must be unique');
  }

  for (const rung of ladder.rungs) {
    if (!rung.id || !rung.name || !rung.intent) {
      errors.push(`rung missing id/name/intent: ${JSON.stringify(rung)}`);
    }
    if (typeof rung.hardBlock !== 'boolean') {
      errors.push(`rung ${rung.id}: hardBlock must be boolean`);
    }
  }

  // Pre-commit hard blocks must be reachable from husky.
  const preCommit = existsSync(resolve(REPO_ROOT, '.husky/pre-commit'))
    ? read('.husky/pre-commit')
    : '';
  if (!preCommit.includes('scan-secrets.sh')) {
    errors.push(
      '.husky/pre-commit must invoke scripts/security/scan-secrets.sh'
    );
  }
  if (!preCommit.includes('check-conflict-markers.sh')) {
    errors.push(
      '.husky/pre-commit must invoke scripts/check-conflict-markers.sh'
    );
  }
  if (!preCommit.includes('lint-staged')) {
    errors.push(
      '.husky/pre-commit must invoke lint-staged (format/lint/typecheck)'
    );
  }

  const prePush = existsSync(resolve(REPO_ROOT, '.husky/pre-push'))
    ? read('.husky/pre-push')
    : '';
  if (!prePush.includes('pre-push-gate.sh')) {
    errors.push('.husky/pre-push must invoke scripts/hooks/pre-push-gate.sh');
  }

  // PR aggregate: ci.yml must define PR Ready OR document the restore path.
  // After JOV-3464 the job is `ci-pr-ready` / name: PR Ready. Tolerate either
  // the restored job or the merge-queue required-status contract.
  const ciYml = existsSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'))
    ? read('.github/workflows/ci.yml')
    : '';
  const mergeQueue = existsSync(
    resolve(REPO_ROOT, 'scripts/lib/merge-queue-guard.mjs')
  )
    ? read('scripts/lib/merge-queue-guard.mjs')
    : '';
  const hasPrReadyJob =
    /name:\s*PR Ready/.test(ciYml) || /ci-pr-ready:/.test(ciYml);
  const hasPrReadyContract = /['"]PR Ready['"]/.test(mergeQueue);
  if (!hasPrReadyJob && !hasPrReadyContract) {
    errors.push(
      'PR Ready must exist as a ci.yml job or as REQUIRED_MERGE_STATUSES in merge-queue-guard.mjs'
    );
  }

  // iOS adapter surfaces
  if (!existsSync(resolve(REPO_ROOT, 'scripts/ios-best-practices-lint.sh'))) {
    errors.push(
      'missing scripts/ios-best-practices-lint.sh (ios lint adapter)'
    );
  }
  if (!existsSync(resolve(REPO_ROOT, '.github/workflows/ios-ci.yml'))) {
    errors.push('missing .github/workflows/ios-ci.yml');
  }
  if (!existsSync(resolve(REPO_ROOT, '.github/workflows/security.yml'))) {
    errors.push('missing .github/workflows/security.yml (PR secret scan)');
  }
  if (!existsSync(resolve(REPO_ROOT, '.github/workflows/pr-size-guard.yml'))) {
    errors.push('missing .github/workflows/pr-size-guard.yml');
  }

  // Adapter path existence from ladder.json
  for (const [app, adapter] of Object.entries(ladder.adapters ?? {})) {
    for (const key of ['preCommitHook', 'prePushHook', 'prWorkflow']) {
      const value = adapter[key];
      if (typeof value !== 'string') continue;
      // First path-like token only (hooks may include prose after the path).
      const token = value.split(/\s+/)[0];
      if (token.includes('/') && !existsSync(resolve(REPO_ROOT, token))) {
        errors.push(`adapter ${app}.${key}: path not found: ${token}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('[gate-ladder] FAIL');
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(
    `[gate-ladder] PASS — ${ladder.rungs.length} rungs, web+ios adapters wired (JOV-3210)`
  );
  process.exit(0);
}

main();
