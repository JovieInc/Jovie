#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const VITEST_ENTRYPOINT = resolve(REPO_ROOT, 'node_modules/vitest/vitest.mjs');

export const CI_CONTROL_TEST_FILES = Object.freeze([
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/lib/__tests__/ci-harness.test.mjs',
  'scripts/lib/__tests__/ci-duration-ratchet.test.mjs',
  'scripts/lib/__tests__/ci-branching-guard.test.mjs',
  'scripts/lib/__tests__/merge-queue-backend.test.mjs',
  'scripts/lib/__tests__/merge-queue-guard.test.mjs',
  'scripts/lib/__tests__/ownerless-recovery-policy.test.mjs',
  'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
  'scripts/lib/__tests__/auto-ready-agent-drafts.test.mjs',
  'scripts/lib/__tests__/eval-main-health-action.test.mjs',
  'scripts/lib/__tests__/pr-check-failures.test.mjs',
  'scripts/lib/__tests__/pr-conflict-handler.test.mjs',
  'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs',
  'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
  'scripts/lib/__tests__/lockfile-specifier-preflight.test.mjs',
  'scripts/lib/__tests__/sentry-autofix-workflow-contract.test.mjs',
  'scripts/lib/__tests__/golden-path-lock.test.mjs',
  'scripts/lib/__tests__/golden-path-prod-autofix-workflow-contract.test.mjs',
  'scripts/lib/__tests__/queue-deferral-receipt.test.mjs',
  'scripts/lib/__tests__/queue-deferred-release.test.mjs',
  'scripts/lib/__tests__/queue-deferred-release-admission.test.mjs',
  'scripts/lib/__tests__/setup-worktree-health.test.mjs',
]);

export function runCiControlTests({ spawnSyncImpl = spawnSync } = {}) {
  const testFiles = CI_CONTROL_TEST_FILES.map(file =>
    file.replace(/^scripts\//, '')
  );
  const result = spawnSyncImpl(
    process.execPath,
    [
      VITEST_ENTRYPOINT,
      '--root',
      'scripts',
      '--config',
      'vitest.config.mts',
      'run',
      ...testFiles,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );

  if (result.error) {
    throw result.error;
  }
  return Number.isInteger(result.status) ? result.status : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = runCiControlTests();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
