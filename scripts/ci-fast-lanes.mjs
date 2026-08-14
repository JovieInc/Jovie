#!/usr/bin/env node
/**
 * Run the cheap CI cluster as labeled lanes with continue-on-failure semantics.
 *
 * Used by the dedicated `ci-fast-typecheck` and `ci-fast-remaining` jobs in
 * `.github/workflows/ci.yml` (JOV-4477). Each hosted job checks out and installs
 * once, invokes one value from LANE_GROUPS, and publishes an isolated lane
 * artifact; the aggregate `ci-fast` job also requires the dedicated profile
 * browser admission job. Never aborts mid-group — always reports every
 * selected lane, writes
 * $GITHUB_STEP_SUMMARY, emits lane records for the harness, and exits non-zero
 * only after all selected lanes finish if any failed. Local callers may omit
 * the selector to retain the historical all-lanes behavior.
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
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = process.cwd();

/** @typedef {{ id: string, name: string, nextLocalCommand: string, status: 'success'|'failure'|'skipped', logExcerpt: string }} LaneResult */

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
      'pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm component-ship-gate && pnpm doc:freshness:check && pnpm test:reliability-detectors',
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

function excerpt(text, max = 1200) {
  const trimmed = (text || '').trim();
  if (trimmed.length <= max) return trimmed;
  return `…${trimmed.slice(-max)}`;
}

function runBiome() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event === 'pull_request') {
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
  if (event === 'pull_request') {
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
  return shell('pnpm turbo typecheck --affected --force');
}

function runScriptsTypecheck() {
  // JOV-4327: scripts/ tree typecheck vs shrink-only baseline. Runs
  // unconditionally (no path gating) — the baseline comparison is ~6s and the
  // error graph also covers imported files outside scripts/.
  return shell('pnpm run typecheck:scripts');
}

function runGuardrails() {
  const base = process.env.GITHUB_BASE_REF || 'main';
  const originBase = `origin/${base}`;
  const parts = [
    `node scripts/desktop-release-guard.mjs --base ${JSON.stringify(originBase)}`,
    `node scripts/version-fanout-guard.mjs --base ${JSON.stringify(originBase)}`,
    'node scripts/design-authority-guard.mjs',
    'node --test scripts/cleanup-stale-dev.test.mjs scripts/desktop-release-guard.test.mjs scripts/desktop-installed-apps-audit.test.mjs scripts/dev-web-fast.test.mjs scripts/ios-guardrail-rollout-audit.test.mjs scripts/version-fanout-guard.test.mjs scripts/version-stamp.test.mjs scripts/agent/preflight.test.mjs scripts/agent/pen-save-receipt.test.mjs scripts/agent/pen-live-canvas-persist.test.mjs scripts/agent/pen-cold-readback.test.mjs',
    'node scripts/version-check.mjs',
    'node apps/web/scripts/next-proxy-guard.mjs',
  ];
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
  const files = changedFiles([
    ':(glob)apps/web/app/\\[username\\]/**',
    'apps/web/app/(marketing)/profile-admission-fixture/**',
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
    '.github/workflows/ci.yml',
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

  const parts = [
    'pnpm ci:harness:check',
    'pnpm ci:incident-contract:validate',
    'node --test scripts/ci-release-trigger-contract.test.mjs',
    'pnpm ci:control:test',
    'pnpm ci:branching-guard:validate',
    'pnpm ci:merge-queue:check',
    'pnpm ci:typecheck-gate-guard',
    // actionlint runs as a dedicated workflow step before this script (rhysd/actionlint).
    'pnpm next:proxy-guard',
    'pnpm tailwind:check',
    'pnpm --filter=@jovie/web run lint:no-native-dialogs',
    'pnpm --filter=@jovie/web run lint:seo',
    'pnpm --filter=@jovie/web run lint:contrast-ratchet',
    // JOV-4421: hard ship gate — tests + matching stories for shippable UI.
    'pnpm component-ship-gate',
    'pnpm doc:freshness:check',
    'node .github/scripts/quarantine-ledger.mjs validate',
    'python3 .github/scripts/test-security-suppression-audit.py',
    // CI workflow changes live at the repo root, so Turbo --affected can select
    // only the root package and return success after running zero web tests.
    // Target Vitest directly so the deploy contract always executes and fails
    // closed when the file cannot be resolved or contains no tests.
    'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci/deploy-workflow.test.ts',
    'pnpm --filter @jovie/web run test:reliability-detectors',
    // Optional: structural regression tests need pytest; soft-skip if unavailable.
    'if command -v pytest >/dev/null 2>&1; then pytest scripts/tests/test_gh_retry.py scripts/tests/test_vercel_prebuilt_deploy.py scripts/tests/test_brand_scrub.py scripts/tests/test_agent_workflow_hygiene.py scripts/tests/test_runner_routing.py scripts/tests/test_symphony_ui_pilot_runtime.py -v; elif python3 -c "import pytest" 2>/dev/null; then python3 -m pytest scripts/tests/test_gh_retry.py scripts/tests/test_vercel_prebuilt_deploy.py scripts/tests/test_brand_scrub.py scripts/tests/test_agent_workflow_hygiene.py scripts/tests/test_runner_routing.py scripts/tests/test_symphony_ui_pilot_runtime.py -v; else echo "pytest not installed — skip structural regressions"; fi',
  ];

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
        schemaVersion: 1,
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

function main() {
  const laneGroup = process.env.CI_FAST_LANE_GROUP;
  /** @type {LaneResult[]} */
  const results = [];
  /** @type {string | undefined} */
  let setupError;

  try {
    const selectedLanes = selectLanes(laneGroup);

    for (const lane of selectedLanes) {
      console.log(`\n======== lane: ${lane.id} ========`);
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
