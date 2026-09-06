#!/usr/bin/env node
/**
 * Run the cheap CI cluster as labeled lanes.
 *
 * Used by the dedicated `ci-fast-typecheck` and `ci-fast-remaining` jobs in
 * `.github/workflows/ci.yml` (JOV-4477). Each hosted job checks out and installs
 * once, invokes one value from LANE_GROUPS, and publishes an isolated lane
 * artifact; the aggregate `ci-fast` job also requires the dedicated profile
 * browser admission job.
 *
 * Fail-fast: the first failed lane skips later lanes in the same group so
 * biome/typecheck red does not pay for structural Playwright. Skipped-later
 * lanes still emit a receipt. Set CI_FAST_FAIL_FAST=false to restore the
 * historical run-every-lane report. Local callers may omit the selector to
 * retain the all-lanes default.
 *
 * Usage:
 *   node scripts/ci-fast-lanes.mjs [with CI_FAST_LANE_GROUP=<group>]
 *
 * Env:
 *   GITHUB_EVENT_NAME, GITHUB_BASE_REF, GITHUB_REF, GITHUB_STEP_SUMMARY
 *   CI_FAST_LANE_GROUP — hosted group selector; omitted locally runs all lanes
 *   CI_FAST_LANES_OUT  — optional path for JSON lane results
 *   TURBO_SCM_BASE     — for typecheck --affected
 *   CI_FAST_SKIP_STRUCTURAL — "true" to skip the remaining group's structural lane
 *   CI_FAST_ONLY_STRUCTURAL — "true" to run only the structural lane
 *   CI_FAST_FAIL_FAST — "false" to run every selected lane even after a failure
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectDesignConformanceChecks } from './design-conformance-paths.mjs';
import {
  affectsJovieTypecheck,
  classifyCiRepoLanes,
} from './lib/ci-repo-lanes.mjs';

const REPO_ROOT = process.cwd();
const selectedProductLanes = () =>
  new Set(
    (process.env.CI_PRODUCT_LANES || 'ios,mac,web,operations,cross-product')
      .split(',')
      .filter(Boolean)
  );

/** @typedef {{ id: string, name: string, nextLocalCommand: string, status: 'success'|'failure'|'skipped', logExcerpt: string, durationMs: number }} LaneResult */

const LANES = [
  {
    id: 'biome',
    name: 'Biome (lint + format)',
    nextLocalCommand: 'pnpm run biome:check',
    run: runBiome,
  },
  {
    id: 'eslint-server-boundaries',
    name: 'ESLint server boundaries',
    nextLocalCommand: 'pnpm --filter=@jovie/web run lint:server-boundaries',
    run: runEslintServerBoundaries,
  },
  {
    id: 'typecheck',
    name: 'Typecheck',
    nextLocalCommand: 'pnpm run typecheck',
    run: runTypecheck,
  },
  {
    id: 'scripts-typecheck',
    name: 'Scripts Typecheck (shrink-only baseline)',
    nextLocalCommand: 'pnpm run typecheck:scripts',
    run: runScriptsTypecheck,
  },
  {
    id: 'guardrails',
    name: 'Guardrails (proxy)',
    nextLocalCommand: 'pnpm next:proxy-guard',
    run: runGuardrails,
  },
  {
    id: 'design-system-source-ratchet',
    name: 'Design-system source count ratchet',
    nextLocalCommand: 'pnpm design:source-count-ratchet',
    run: runDesignSystemSourceRatchet,
  },
  {
    id: 'design-exception-registry',
    name: 'Design exception registry',
    nextLocalCommand: 'pnpm design:exception-registry:check',
    run: runDesignExceptionRegistry,
  },
  {
    id: 'design-conformance',
    name: 'Design Conformance',
    nextLocalCommand: 'pnpm design:conformance:gate',
    run: runDesignConformance,
  },
  {
    id: 'ios-fast',
    name: 'iOS Fast Contract',
    nextLocalCommand: 'pnpm run ios:lint',
    run: runIosFast,
  },
  {
    id: 'profile-admission',
    name: 'Public Profile Admission',
    nextLocalCommand:
      'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts lib/profile/capture-dismissal-client.test.ts components/features/release/SmartLinkProviderButton.test.tsx tests/unit/api/profile/capture-dismissal.test.ts tests/unit/api/profile/pac-event.test.ts tests/unit/lib/rate-limit/config.test.ts tests/unit/lib/rate-limit/limiters.test.ts tests/unit/profile/ProfileHomeRail.test.tsx tests/unit/cookie-banner-fixes.test.tsx tests/unit/tracking/pac-events.test.ts',
    run: runProfileAdmission,
  },
  {
    id: 'structural',
    name: 'Structural Contract',
    nextLocalCommand:
      'pnpm invariants:check && pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm design:shared-ui-visual-arbitrary:check && pnpm component-ship-gate && pnpm screen-registration-gate && pnpm doc:freshness:check && pnpm test:reliability-detectors',
    run: runStructural,
  },
];

const LANE_IDS = Object.freeze(LANES.map(lane => lane.id));

/**
 * The hosted workflow selects exactly one of these bounded groups. Keeping the
 * manifest here makes the split auditable and lets local callers omit the
 * selector to retain the historical all-lanes behavior.
 */
export const LANE_GROUPS = Object.freeze({
  typecheck: Object.freeze(['typecheck']),
  remaining: Object.freeze([
    'biome',
    'eslint-server-boundaries',
    'scripts-typecheck',
    'guardrails',
    'design-system-source-ratchet',
    'design-exception-registry',
    'design-conformance',
    'ios-fast',
    'profile-admission',
    'structural',
  ]),
});

export const LANE_COMMANDS = Object.freeze(
  Object.fromEntries(LANES.map(lane => [lane.id, lane.nextLocalCommand]))
);

export function validateLaneGroups(groups, laneIds = LANE_IDS) {
  const knownLaneIds = new Set(laneIds);
  const seenLaneIds = new Map();
  const errors = [];

  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new Error('CI fast lane groups must be an object');
  }

  for (const [groupId, selectedLaneIds] of Object.entries(groups)) {
    if (!Array.isArray(selectedLaneIds) || selectedLaneIds.length === 0) {
      errors.push(`${groupId}: group must contain at least one lane`);
      continue;
    }
    for (const laneId of selectedLaneIds) {
      if (!knownLaneIds.has(laneId)) {
        errors.push(`${groupId}: unknown lane ${laneId}`);
        continue;
      }
      const priorGroup = seenLaneIds.get(laneId);
      if (priorGroup) {
        errors.push(`${laneId}: duplicated in ${priorGroup} and ${groupId}`);
      } else {
        seenLaneIds.set(laneId, groupId);
      }
    }
  }

  for (const laneId of knownLaneIds) {
    if (!seenLaneIds.has(laneId)) {
      errors.push(`${laneId}: missing from lane groups`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid CI fast lane groups: ${errors.join('; ')}`);
  }
  return true;
}

validateLaneGroups(LANE_GROUPS);

export function selectLanes(groupId) {
  // Local callers historically ran the complete cluster with no selector.
  if (groupId === undefined) return LANES;
  if (typeof groupId !== 'string' || groupId.trim() === '') {
    throw new Error('CI_FAST_LANE_GROUP must be a non-empty known group');
  }

  const selectedLaneIds = LANE_GROUPS[groupId];
  if (!selectedLaneIds) {
    throw new Error(
      `Unknown CI_FAST_LANE_GROUP ${JSON.stringify(groupId)}; expected one of ${Object.keys(LANE_GROUPS).join(', ')}`
    );
  }
  return selectedLaneIds.map(laneId => LANES.find(lane => lane.id === laneId));
}

function shell(command, opts = {}) {
  const result = spawnSync(command, {
    shell: true,
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    code: result.status ?? 1,
    output: `${stdout}${stderr}`,
  };
}

function changedFiles(patterns) {
  const event = process.env.GITHUB_EVENT_NAME || '';
  let diffBase = 'HEAD^1';
  if (event === 'pull_request') {
    const base = process.env.GITHUB_BASE_REF || 'main';
    // Prefer origin/<base> when available (fetch done by workflow).
    const probe = shell(`git rev-parse --verify origin/${base}`);
    diffBase =
      probe.code === 0
        ? `origin/${base}`
        : process.env.TURBO_SCM_BASE || diffBase;
  } else if (process.env.TURBO_SCM_BASE) {
    diffBase = process.env.TURBO_SCM_BASE;
  }

  const pathspecs = patterns.map(p => `'${p}'`).join(' ');
  const result = shell(
    `git diff --diff-filter=ACDMRT --name-only ${diffBase} HEAD -- ${pathspecs}`
  );
  if (result.code !== 0) {
    // Fall back to full set (caller decides).
    return null;
  }
  return result.output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function listAllChangedFiles() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  let diffBase = 'HEAD^1';
  if (event === 'pull_request') {
    const base = process.env.GITHUB_BASE_REF || 'main';
    const probe = shell(`git rev-parse --verify origin/${base}`);
    diffBase =
      probe.code === 0
        ? `origin/${base}`
        : process.env.TURBO_SCM_BASE || diffBase;
  } else if (process.env.TURBO_SCM_BASE) {
    diffBase = process.env.TURBO_SCM_BASE;
  }
  const result = shell(
    `git diff --diff-filter=ACDMRT --name-only ${diffBase} HEAD`
  );
  if (result.code !== 0) return null;
  return result.output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

let cachedRepoLanes = null;
function repoLanes() {
  if (cachedRepoLanes) return cachedRepoLanes;
  const files = listAllChangedFiles();
  // Empty or unreadable diffs fail closed onto every lane so typed no-op
  // merge groups still run ci-fast against the combined head (JOV-5288).
  cachedRepoLanes =
    files === null || files.length === 0
      ? {
          runJovieProduct: true,
          runSymphonyControl: true,
          runSummerOps: true,
        }
      : classifyCiRepoLanes(files);
  return cachedRepoLanes;
}

function excerpt(text, max = 1200) {
  const trimmed = (text || '').trim();
  if (trimmed.length <= max) return trimmed;
  return `…${trimmed.slice(-max)}`;
}

function runBiome() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch') {
    const files = changedFiles([
      '*.ts',
      '*.tsx',
      '*.js',
      '*.jsx',
      '*.json',
      '*.mts',
      '*.mjs',
      ':(exclude)**/package-lock.json',
      ':(exclude).claude/settings.json',
      ':(exclude).claude/skills/**',
    ]);
    if (files && files.length === 0) {
      return { code: 0, output: 'No lintable files changed\n', skipped: false };
    }
    if (files && files.length > 0) {
      const quoted = files.map(f => JSON.stringify(f)).join(' ');
      return shell(
        `pnpm biome ci --reporter=github --no-errors-on-unmatched ${quoted}`
      );
    }
  }
  return shell('pnpm biome ci --reporter=github .');
}

function runEslintServerBoundaries() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch') {
    const files = changedFiles([
      'apps/web/*.ts',
      'apps/web/*.tsx',
      'apps/web/**/*.ts',
      'apps/web/**/*.tsx',
    ]);
    if (files && files.length === 0) {
      return {
        code: 0,
        output: 'No server-boundary TypeScript files changed\n',
        skipped: false,
      };
    }
    if (files && files.length > 0) {
      const quoted = files.map(f => JSON.stringify(f)).join(' ');
      return shell(
        `pnpm --filter=@jovie/web run lint:server-boundaries -- ${quoted}`
      );
    }
  }
  return shell('pnpm --filter=@jovie/web run lint:server-boundaries');
}

function runTypecheck() {
  // --force is mandatory (JOV-3499). Gate guard scans this file + ci.yml.
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (
    event === 'pull_request' &&
    process.env.CI_FAST_RUN_JOVIE_TYPECHECK === 'false'
  ) {
    return {
      code: 0,
      output:
        'No TypeScript graph files changed (ci-path-changes preselection)\n',
      skipped: true,
    };
  }
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output: 'Jovie product typecheck skipped (no product files changed)\n',
      skipped: true,
    };
  }
  if (event === 'pull_request') {
    const files = listAllChangedFiles();
    if (files && !files.some(file => affectsJovieTypecheck(file))) {
      return {
        code: 0,
        output: 'No TypeScript graph files changed\n',
        skipped: true,
      };
    }
  }
  return shell('pnpm turbo typecheck --affected --force');
}

function runScriptsTypecheck() {
  // JOV-4327: run the shrink-only scripts ratchet on every hydrated remaining
  // job. The TypeScript project imports files outside scripts/, and baseline or
  // resolver changes can alter its diagnostics without touching a path filter.
  return shell('pnpm run typecheck:scripts');
}

function runGuardrails() {
  // Exclusive Symphony/Summer diffs must not wait on Jovie product guardrails
  // (JOV-5288). Product-lane selection still slices remaining work when the
  // product lane is on.
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output: 'Guardrails skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const base = process.env.GITHUB_BASE_REF || 'main';
  const originBase = `origin/${base}`;
  const selected = selectedProductLanes();
  const parts = [
    ...(selected.has('mac')
      ? [
          `node scripts/desktop-release-guard.mjs --base ${JSON.stringify(originBase)}`,
        ]
      : []),
    ...(selected.has('cross-product')
      ? [
          `node scripts/version-fanout-guard.mjs --base ${JSON.stringify(originBase)}`,
          'node scripts/version-check.mjs',
        ]
      : []),
    ...(selected.has('operations')
      ? [
          'node scripts/design-authority-guard.mjs',
          'pnpm design:logo-assets:check',
          'node --test scripts/cleanup-stale-dev.test.mjs scripts/desktop-release-guard.test.mjs scripts/desktop-installed-apps-audit.test.mjs scripts/dev-web-fast.test.mjs scripts/ios-guardrail-rollout-audit.test.mjs scripts/version-fanout-guard.test.mjs scripts/version-stamp.test.mjs scripts/agent/preflight.test.mjs scripts/agent/pen-save-receipt.test.mjs scripts/agent/pen-live-canvas-persist.test.mjs scripts/agent/pen-cold-readback.test.mjs scripts/skill-governance-guard.test.mjs scripts/skill-catalog.test.mjs scripts/agent-web-contract.test.mjs',
        ]
      : []),
    ...(selected.has('web')
      ? ['node apps/web/scripts/next-proxy-guard.mjs']
      : []),
  ];
  if (parts.length === 0)
    return {
      code: 0,
      output: 'No guardrail product lane selected\n',
      skipped: true,
    };
  let combined = '';
  for (const cmd of parts) {
    const result = shell(cmd);
    combined += result.output;
    if (result.code !== 0) {
      return { code: result.code, output: combined };
    }
  }
  return { code: 0, output: combined };
}

function runDesignSystemSourceRatchet() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output:
        'Design-system source ratchet skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const selected = selectedProductLanes();
  if (!selected.has('web')) {
    return {
      code: 0,
      output: 'No web product lane selected\n',
      skipped: true,
    };
  }
  return shell(LANE_COMMANDS['design-system-source-ratchet']);
}

function runDesignExceptionRegistry() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output:
        'Design exception registry skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const selected = selectedProductLanes();
  if (!selected.has('web')) {
    return {
      code: 0,
      output: 'No web product lane selected\n',
      skipped: true,
    };
  }
  return shell(LANE_COMMANDS['design-exception-registry']);
}

/**
 * @typedef {object} DesignConformanceOpts
 * @property {string[] | null} [changedFileList]
 * @property {(command: string) => {code: number, output: string, skipped?: boolean}} [execute]
 */

/**
 * @param {DesignConformanceOpts} [opts]
 */
export function runDesignConformance(opts) {
  const options = opts ?? {};
  const execute = options.execute;
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event === 'workflow_dispatch') {
    return (execute ?? shell)(LANE_COMMANDS['design-conformance']);
  }

  const files =
    'changedFileList' in options
      ? options.changedFileList
      : listAllChangedFiles();
  if (files === null) {
    return {
      code: 1,
      output: 'Design conformance failed: changed files unavailable\n',
    };
  }

  if (!selectDesignConformanceChecks(files).applicable) {
    return {
      code: 0,
      output: 'Design conformance skipped (no design-domain files changed)\n',
      skipped: true,
    };
  }

  return (execute ?? shell)(LANE_COMMANDS['design-conformance']);
}

function runIosFast() {
  const files = changedFiles([
    'apps/ios/**',
    'fastlane/**',
    'Gemfile',
    'Gemfile.lock',
    'scripts/ios-best-practices-lint.sh',
    '.github/workflows/ios-ci.yml',
    '.github/workflows/ios-testflight.yml',
  ]);
  if (files && files.length === 0) {
    return {
      code: 0,
      output: 'No iOS contract files changed\n',
      skipped: true,
    };
  }
  return shell('pnpm run ios:lint');
}

function runProfileAdmission() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output:
        'Public-profile admission skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const files = changedFiles([
    ':(glob)apps/web/app/\\[username\\]/**',
    'apps/web/app/(marketing)/renders/profile-admission/**',
    'apps/web/app/api/profile/**',
    'apps/web/components/features/release/SmartLinkProviderButton.tsx',
    'apps/web/components/features/profile/**',
    'apps/web/components/organisms/CookieBannerMount.tsx',
    'apps/web/components/organisms/CookieBannerSection.tsx',
    'apps/web/lib/cookies/**',
    'apps/web/lib/profile/**',
    'apps/web/lib/rate-limit/**',
    'apps/web/lib/tracking/pac-**',
    'apps/web/styles/design-system.css',
    'apps/web/tests/e2e/profile/**',
    'apps/web/tests/e2e/public-profile-smoke.spec.ts',
    'apps/web/tests/e2e/utils/public-surface-**',
    'scripts/ci-fast-lanes.mjs',
  ]);
  if (files && files.length === 0) {
    return {
      code: 0,
      output: 'No public-profile admission files changed\n',
      skipped: true,
    };
  }

  return shell(LANE_COMMANDS['profile-admission']);
}

function runStructural() {
  if (process.env.CI_FAST_SKIP_STRUCTURAL === 'true') {
    return {
      code: 0,
      output: 'Structural Contract skipped (path-gated)\n',
      skipped: true,
    };
  }

  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch') {
    const lanes = repoLanes();
    if (!lanes.runJovieProduct && !lanes.runSymphonyControl) {
      return {
        code: 0,
        output:
          'Structural skipped (Summer/ops only; no Jovie or Symphony suites)\n',
        skipped: true,
      };
    }
  }

  const selected = selectedProductLanes();
  const operationsParts = [
    'pnpm invariants:check',
    "node --experimental-test-coverage --test --test-coverage-include='scripts/verification/*.mjs' --test-coverage-exclude='scripts/verification/*.test.mjs' --test-coverage-lines=100 --test-coverage-functions=100 --test-coverage-branches=98 scripts/verification/*.test.mjs",
    'pnpm ci:harness:check',
    'pnpm ci:incident-contract:validate',
    'node --test scripts/ci-release-trigger-contract.test.mjs',
    'pnpm ci:control:test',
    'node --test --experimental-test-coverage --test-coverage-include=scripts/backlog-orchestrator/linear-client.mjs --test-coverage-lines=73 --test-coverage-branches=83 --test-coverage-functions=66 scripts/backlog-orchestrator/__tests__/linear-client.transport.test.mjs scripts/backlog-orchestrator/__tests__/linear-pagination.test.mjs',
    'pnpm ci:branching-guard:validate',
    'pnpm ci:merge-queue:check',
    'pnpm ci:typecheck-gate-guard',
    'pnpm doc:freshness:check',
    'node .github/scripts/quarantine-ledger.mjs validate',
    'python3 .github/scripts/test-security-suppression-audit.py',
    // The Gem contract is embedded in the broader Symphony controller suite.
    "node --test --test-name-pattern='keeps the Gem drain on typed fleet admission' scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs",
    'python3 scripts/symphony/tests/run-hud-proof-gate.py',
    'python3 scripts/symphony/tests/test_gem_disk_reclaim.py',
    'python3 scripts/symphony/tests/jovie-symphony-workspace.test.py',
    'python3 scripts/symphony/tests/test_gem_workspace_migrate.py',
    'if python3 -c "import coverage" 2>/dev/null; then COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gbrain-proxy.coverage" GBRAIN_PROXY_COVERAGE=1 pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/gbrain-runtime-assets.test.mjs && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gbrain-proxy.coverage" python3 -m coverage combine "${RUNNER_TEMP:-/tmp}" && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gbrain-proxy.coverage" python3 -m coverage report --include="*/scripts/symphony/gbrain-runtime/gbrain-mcp-http-proxy.py" --show-missing --precision=2 --fail-under=78; elif [ "${CI:-}" = "true" ]; then echo "::error::coverage.py missing from hosted structural lane" >&2; exit 1; else echo "coverage.py not installed - skip local GBrain proxy coverage"; fi',
    'python3 scripts/symphony/tests/gem-pr-drain.test.py',
    'python3 scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py',
    'python3 scripts/symphony/tests/gem-priority-gate.test.py',
    'python3 scripts/symphony/tests/symphony-nvme-package-cache.test.py',
    'if python3 -c "import coverage" 2>/dev/null; then COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-summer-bottleneck-producer.coverage" python3 -m coverage run --branch scripts/symphony/tests/summer-bottleneck-producer.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-summer-bottleneck-producer.coverage" python3 -m coverage report --include="*/scripts/symphony/summer_bottleneck_producer.py" --show-missing --precision=2 --fail-under=80; elif [ "${CI:-}" = "true" ]; then echo "::error::coverage.py missing from hosted structural lane" >&2; exit 1; else echo "coverage.py not installed - skip local Summer bottleneck producer coverage"; fi',
    'python3 scripts/symphony/tests/test_evaluate_fleet_gate.py',
    'python3 scripts/symphony/tests/test-model-router.py',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-astra-readiness.coverage" python3 -m coverage run --branch scripts/symphony/tests/astra-readiness.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-astra-readiness.coverage" python3 -m coverage report --include="*/scripts/symphony/astra/astra_readiness.py" --show-missing --precision=2 --fail-under=90',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-hyperagent-lifecycle.coverage" python3 -m coverage run --branch scripts/symphony/tests/hyperagent-lifecycle.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-hyperagent-lifecycle.coverage" python3 -m coverage report --include="*/scripts/symphony/hyperagent/lifecycle.py" --show-missing --precision=2 --fail-under=95',
    'python3 scripts/symphony/tests/symphony-github-poke.test.py',
    'node --test scripts/backlog-orchestrator/__tests__/pre-lease-gates.test.mjs',
    'node --test scripts/backlog-orchestrator/__tests__/gate-next-hold.test.mjs',
    'node --test scripts/backlog-orchestrator/__tests__/ownership-inventory.test.mjs',
    'if python3 -c "import coverage, pytest" 2>/dev/null; then COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.coverage" python3 -m coverage run --branch scripts/symphony/tests/symphony-codex-auth-fallback.test.py OfficialServiceOwnershipContract && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.coverage" python3 -m coverage json -o "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json" && python3 scripts/symphony/tests/symphony-codex-auth-fallback.test.py --verify-ownership-coverage "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json" && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-rehabilitation.coverage" python3 -m coverage run --branch scripts/symphony/tests/gem-rehabilitation-policy.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-rehabilitation.coverage" python3 -m coverage report --include="*/scripts/symphony/gem_rehabilitation_policy.py" --fail-under=90 && python3 -m pytest scripts/tests/test_gh_retry.py scripts/tests/test_vercel_prebuilt_deploy.py scripts/tests/test_brand_scrub.py scripts/tests/test_agent_workflow_hygiene.py scripts/tests/test_runner_routing.py scripts/tests/test_symphony_ui_pilot_runtime.py scripts/tests/test_symphony_reconciler_runtime.py -v; else echo "pytest/coverage not installed — skip structural regressions"; fi',
    // actionlint runs as a dedicated workflow step before this script (rhysd/actionlint).
  ];
  const webParts = [
    'pnpm next:proxy-guard',
    'pnpm tailwind:check',
    'pnpm --filter=@jovie/web run lint:no-native-dialogs',
    'pnpm --filter=@jovie/web run lint:seo',
    'pnpm --filter=@jovie/web run lint:contrast-ratchet',
    'pnpm design:shared-ui-visual-arbitrary:check',
    // JOV-4421: hard ship gate — tests + matching stories for shippable UI.
    'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/component-ship-gate.test.mjs',
    // JOV-5454: live Storybook certification evaluator + lifecycle.
    'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/component-live-storybook-certification.test.mjs',
    'pnpm component-ship-gate',
    'pnpm screen-registration-gate',
    // CI workflow changes live at the repo root, so Turbo --affected can select
    // only the root package and return success after running zero web tests.
    // Target Vitest directly so the deploy contract always executes and fails
    // closed when the file cannot be resolved or contains no tests.
    'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci/deploy-workflow.test.ts tests/unit/ci/setup-doppler-action.test.ts',
    // Blocking UI invariants (Tim lock 2026-08-30, extended 2026-09-03 by
    // JOV-5951, gbrain ops/reviewed-invariants/blocking-ui-invariants-v1),
    // governed by certify-only-working-v1: unproven is hidden, not green.
    // Target Vitest directly so the screen contracts always execute and fail
    // closed when a file is missing or resolves to zero tests (visual ENOENT
    // is FAIL, not advisory).
    'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/design-system/one-primary-action-per-screen-v1.test.ts tests/unit/design-system/editorial-card-max-v1.test.ts tests/unit/design-system/mac-header-two-lines-v1.test.ts tests/unit/design-system/column-heading-line-clamp-1-v1.test.ts tests/unit/design-system/single-column-one-width-v1.test.ts tests/unit/design-system/one-chrome-layer-v1.test.ts tests/unit/design-system/one-notification-v1.test.ts tests/unit/design-system/one-modal-layer-v1.test.ts',
    'pnpm --filter @jovie/web run test:reliability-detectors',
  ];
  const parts = [
    ...(selected.has('operations') ? operationsParts : []),
    ...(selected.has('web') ? webParts : []),
  ];
  if (parts.length === 0) {
    return {
      code: 0,
      output: 'No structural product lane selected\n',
      skipped: true,
    };
  }

  let combined = '';
  for (const cmd of parts) {
    const result = shell(cmd);
    combined += result.output;
    if (result.code !== 0) {
      return { code: result.code, output: combined };
    }
  }
  return { code: 0, output: combined };
}

function annotateFailure(lane, logExcerpt) {
  // GitHub Actions annotation — visible on the PR Checks UI.
  const msg = `${lane.name} failed. Fix: ${lane.nextLocalCommand}`;
  console.error(`::error title=${lane.name}::${msg}`);
  if (logExcerpt) {
    // Keep annotation body short; full log is in the step output.
    const short = logExcerpt.split('\n').slice(-8).join(' | ').slice(0, 400);
    console.error(`::error::${short}`);
  }
}

function writeSummary(results, groupId) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    `### ci-fast lanes (${groupId || 'all'})`,
    '',
    '| Lane | Status | Next local command |',
    '| --- | --- | --- |',
  ];
  for (const r of results) {
    lines.push(`| ${r.name} | **${r.status}** | \`${r.nextLocalCommand}\` |`);
  }
  lines.push('');
  const failed = results.filter(r => r.status === 'failure');
  if (failed.length > 0) {
    lines.push('#### Failing lanes');
    for (const r of failed) {
      lines.push('');
      lines.push(`##### ${r.name}`);
      lines.push('');
      lines.push('```');
      lines.push(r.logExcerpt || '(no output)');
      lines.push('```');
    }
  }
  lines.push('');
  appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

/**
 * Always materialize CI_FAST_LANES_OUT so the workflow upload step never sees
 * a missing artifact path (JOV-4446: "No files were found ... ci-fast-lanes.json").
 * @param {LaneResult[]} results
 * @param {string | undefined} laneGroup
 * @param {string | undefined} setupError
 */
function writeLaneResults(results, laneGroup, setupError) {
  const outPath =
    process.env.CI_FAST_LANES_OUT || resolve(REPO_ROOT, 'ci-fast-lanes.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        schemaVersion: 2,
        job: 'ci-fast',
        group: laneGroup || 'all',
        lanes: results,
        setupError: setupError || null,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`[ci-fast] wrote lane results → ${outPath}`);
  return outPath;
}

function failFastEnabled() {
  return process.env.CI_FAST_FAIL_FAST !== 'false';
}

function main() {
  const laneGroup = process.env.CI_FAST_LANE_GROUP;
  /** @type {LaneResult[]} */
  const results = [];
  /** @type {string | undefined} */
  let setupError;
  const failFast = failFastEnabled();

  try {
    let selectedLanes = selectLanes(laneGroup);
    if (process.env.CI_FAST_ONLY_STRUCTURAL === 'true') {
      selectedLanes = selectedLanes.filter(lane => lane.id === 'structural');
    }

    let failedFast = false;
    for (const lane of selectedLanes) {
      console.log(`\n======== lane: ${lane.id} ========`);
      const laneStartedAt = Date.now();

      if (failedFast) {
        const logExcerpt = 'skipped: earlier lane failed (fail-fast)';
        console.log(`[ci-fast] ${lane.id}: skipped`);
        console.log(logExcerpt);
        results.push({
          id: lane.id,
          name: lane.name,
          nextLocalCommand: lane.nextLocalCommand,
          status: 'skipped',
          logExcerpt,
          durationMs: Math.max(0, Date.now() - laneStartedAt),
        });
        continue;
      }

      let outcome;
      try {
        outcome = lane.run();
      } catch (error) {
        const message =
          error instanceof Error ? error.stack || error.message : String(error);
        outcome = { code: 1, output: message };
      }

      const skipped = Boolean(outcome.skipped);
      const status = skipped
        ? 'skipped'
        : outcome.code === 0
          ? 'success'
          : 'failure';
      const logExcerpt = excerpt(outcome.output);

      if (status === 'failure') {
        annotateFailure(lane, logExcerpt);
        if (failFast) failedFast = true;
      }

      console.log(`[ci-fast] ${lane.id}: ${status}`);
      if (logExcerpt && status !== 'success') {
        console.log(logExcerpt);
      }

      results.push({
        id: lane.id,
        name: lane.name,
        nextLocalCommand: lane.nextLocalCommand,
        status,
        logExcerpt,
        durationMs: Math.max(0, Date.now() - laneStartedAt),
      });
    }
  } catch (error) {
    setupError =
      error instanceof Error ? error.stack || error.message : String(error);
    console.error(`[ci-fast] setup failed: ${setupError}`);
  }

  writeSummary(results, laneGroup);
  writeLaneResults(results, laneGroup, setupError);

  if (setupError) {
    process.exit(1);
  }

  const failed = results.filter(r => r.status === 'failure');
  if (failed.length > 0) {
    console.error(
      `[ci-fast] ${failed.length} lane(s) failed: ${failed.map(f => f.id).join(', ')}`
    );
    process.exit(1);
  }
  console.log('[ci-fast] all lanes passed');
  process.exit(0);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
