#!/usr/bin/env node
/**
 * Run the cheap CI cluster as labeled lanes with continue-on-failure semantics.
 *
 * Used by the `ci-fast` job in `.github/workflows/ci.yml` (JOV-3464):
 * checkout + install once, then run typecheck / biome / eslint / guardrails /
 * structural as independent lanes. Never aborts mid-suite — always reports every
 * lane, writes $GITHUB_STEP_SUMMARY, emits lane records for the harness, and
 * exits non-zero only after all lanes finish if any failed.
 *
 * Usage:
 *   node scripts/ci-fast-lanes.mjs
 *
 * Env:
 *   GITHUB_EVENT_NAME, GITHUB_BASE_REF, GITHUB_REF, GITHUB_STEP_SUMMARY
 *   CI_FAST_LANES_OUT  — optional path for JSON lane results
 *   TURBO_SCM_BASE     — for typecheck --affected
 *   CI_FAST_SKIP_STRUCTURAL — "true" to skip structural lane (path-gated)
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    id: 'structural',
    name: 'Structural Contract',
    nextLocalCommand:
      'pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm doc:freshness:check && pnpm test:reliability-detectors',
    run: runStructural,
  },
];

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
    `git diff --diff-filter=d --name-only ${diffBase} HEAD -- ${pathspecs}`
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

function runGuardrails() {
  const base = process.env.GITHUB_BASE_REF || 'main';
  const originBase = `origin/${base}`;
  const parts = [
    `node scripts/desktop-release-guard.mjs --base ${JSON.stringify(originBase)}`,
    `node scripts/version-fanout-guard.mjs --base ${JSON.stringify(originBase)}`,
    'node --test scripts/cleanup-stale-dev.test.mjs scripts/desktop-release-guard.test.mjs scripts/desktop-installed-apps-audit.test.mjs scripts/dev-web-fast.test.mjs scripts/ios-guardrail-rollout-audit.test.mjs scripts/version-fanout-guard.test.mjs scripts/version-stamp.test.mjs scripts/agent/preflight.test.mjs',
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
    'if command -v pytest >/dev/null 2>&1; then pytest scripts/tests/test_gh_retry.py scripts/tests/test_vercel_prebuilt_deploy.py scripts/tests/test_brand_scrub.py scripts/tests/test_agent_workflow_hygiene.py scripts/tests/test_runner_routing.py -v; elif python3 -c "import pytest" 2>/dev/null; then python3 -m pytest scripts/tests/test_gh_retry.py scripts/tests/test_vercel_prebuilt_deploy.py scripts/tests/test_brand_scrub.py scripts/tests/test_agent_workflow_hygiene.py scripts/tests/test_runner_routing.py -v; else echo "pytest not installed — skip structural regressions"; fi',
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

function writeSummary(results) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    '### ci-fast lanes (JOV-3464)',
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

function main() {
  /** @type {LaneResult[]} */
  const results = [];

  for (const lane of LANES) {
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

  writeSummary(results);

  const outPath =
    process.env.CI_FAST_LANES_OUT || resolve(REPO_ROOT, 'ci-fast-lanes.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        job: 'ci-fast',
        lanes: results,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`[ci-fast] wrote lane results → ${outPath}`);

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

main();
