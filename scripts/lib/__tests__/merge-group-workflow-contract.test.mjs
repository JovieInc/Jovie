import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRunner,
  formatMetaEnv,
  LIVE_MAIN_FETCH_REF,
  resolveMergeGroupPathDiff,
} from '../resolve-merge-group-path-diff.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);
const PRODUCTION_RELEASE_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/production-release.yml'),
  'utf8'
);
const PRODUCTION_CONTROLLER_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/production-controller.yml'),
  'utf8'
);
const POSTDEPLOY_PROBES_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/postdeploy-probes.yml'),
  'utf8'
);
const CANARY_HEALTH_GATE_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/canary-health-gate.yml'),
  'utf8'
);
const FORK_GATE_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/fork-pr-gate.yml'),
  'utf8'
);
const SIZE_GUARD_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/pr-size-guard.yml'),
  'utf8'
);
const SECURITY_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/security.yml'),
  'utf8'
);
const CLAUDE_REVIEW_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/claude-review.yml'),
  'utf8'
);
const MEMBER_POLICY = readFileSync(
  resolve(REPO_ROOT, 'scripts/lib/merge-group-member-policy.mjs'),
  'utf8'
);
const PATH_DIFF_HELPER = readFileSync(
  resolve(REPO_ROOT, 'scripts/lib/resolve-merge-group-path-diff.mjs'),
  'utf8'
);
const BRANCH_RULESET = readFileSync(
  resolve(REPO_ROOT, '.github/rulesets/branch-protection.yml'),
  'utf8'
);
const EVENT = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, 'fixtures/merge-group-checks-requested.json'),
    'utf8'
  )
);

function getJobBlock(workflow, jobKey) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);

  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

function getMergeGroupReachableJobText(jobBlock) {
  const lines = jobBlock.split('\n');
  const stepsIndex = lines.findIndex(line => line === '    steps:');
  if (stepsIndex < 0) return jobBlock;

  const reachable = lines.slice(0, stepsIndex + 1);
  const stepStarts = [];
  for (let index = stepsIndex + 1; index < lines.length; index += 1) {
    if (/^      - /.test(lines[index])) stepStarts.push(index);
  }
  for (let index = 0; index < stepStarts.length; index += 1) {
    const block = lines.slice(
      stepStarts[index],
      stepStarts[index + 1] ?? lines.length
    );
    const condition = block.find(line => /^        if:/.test(line)) ?? '';
    if (!condition.includes("github.event_name != 'merge_group'")) {
      reachable.push(...block);
    }
  }
  return reachable.join('\n');
}

function parseExactCiFastFailureOperands(script) {
  const condition = [...script.matchAll(/if\s+\[\[\s*(.+?)\s*\]\];\s*then/g)]
    .map(match => match[1])
    .find(candidate => candidate.includes('$TYPECHECK_RESULT'));
  const operands = (condition ?? '')
    .split(/\s+\|\|\s+/)
    .map(
      clause =>
        clause.match(
          /^"\$(TYPECHECK_RESULT|REMAINING_RESULT|PROFILE_BROWSER_RESULT)"\s+!=\s+"success"$/
        )?.[1]
    );
  if (
    operands.sort().join() !==
    'PROFILE_BROWSER_RESULT,REMAINING_RESULT,TYPECHECK_RESULT'
  )
    throw new Error('Invalid ci-fast fail-closed result set');
  return operands;
}

function workflowDeclaresReadyForReviewType(source) {
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)types:\s*(.*?)\s*$/);
    if (!match) continue;

    const indentation = match[1].length;
    const declaration = [match[2].replace(/\s+#.*$/, '')];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      const nextIndentation = line.match(/^\s*/)?.[0].length ?? 0;
      if (nextIndentation <= indentation) break;
      declaration.push(line.replace(/\s+#.*$/, '').trim());
    }

    if (/\bready_for_review\b/.test(declaration.join(' '))) return true;
  }
  return false;
}

describe('merge_group workflow contract', () => {
  it('accepts reordered exact ci-fast failure operands', () => {
    expect(
      parseExactCiFastFailureOperands(
        'if [[ "$PROFILE_BROWSER_RESULT" != "success" || "$TYPECHECK_RESULT" != "success" || "$REMAINING_RESULT" != "success" ]]; then'
      )
    ).toHaveLength(3);
  });

  it('rejects a ci-fast failure condition missing a required operand', () => {
    expect(() =>
      parseExactCiFastFailureOperands(
        'if [[ "$TYPECHECK_RESULT" != "success" || "$REMAINING_RESULT" != "success" ]]; then'
      )
    ).toThrow('Invalid ci-fast fail-closed result set');
  });

  it('models a checks_requested combined-head event', () => {
    expect(EVENT.action).toBe('checks_requested');
    expect(EVENT.merge_group.base_ref).toBe('refs/heads/main');
    expect(EVENT.merge_group.base_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(EVENT.merge_group.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(EVENT.merge_group.head_ref).toContain('gh-readonly-queue/main/');
  });

  it('runs deterministic CI against the synthetic base-to-head diff', () => {
    expect(CI_WORKFLOW).toMatch(/merge_group:\n\s+types: \[checks_requested\]/);
    expect(CI_WORKFLOW).toContain(
      'MERGE_GROUP_BASE_SHA="${{ github.event.merge_group.base_sha }}"'
    );
    expect(CI_WORKFLOW).toContain(
      'MERGE_GROUP_HEAD_SHA="${{ github.event.merge_group.head_sha }}"'
    );
    expect(CI_WORKFLOW).toContain(
      'git show "${MERGE_GROUP_BASE_SHA}:scripts/lib/resolve-merge-group-path-diff.mjs"'
    );
    expect(CI_WORKFLOW).toContain('node "$TRUSTED_PATH_DIFF_RESOLVER"');
    expect(CI_WORKFLOW).not.toContain(
      'node scripts/lib/resolve-merge-group-path-diff.mjs \\'
    );
    expect(CI_WORKFLOW).not.toContain('source "$PATH_DIFF_DIR/meta.env"');
    expect(CI_WORKFLOW).toContain(
      'git show "${MERGE_GROUP_BASE_SHA}:scripts/lib/ci-repo-lanes.mjs"'
    );
    expect(CI_WORKFLOW).toContain('node "$TRUSTED_CI_REPO_LANES"');
    expect(CI_WORKFLOW).not.toContain('node scripts/lib/ci-repo-lanes.mjs');
    expect(CI_WORKFLOW).toContain('--base "$MERGE_GROUP_BASE_SHA"');
    expect(CI_WORKFLOW).toContain('--head "$MERGE_GROUP_HEAD_SHA"');
    expect(PATH_DIFF_HELPER).toContain(
      "['diff', '--no-renames', '--name-only', `${baseSha}...${headSha}`]"
    );
    expect(CI_WORKFLOW).not.toContain('withgraphite/graphite-ci-action');
    expect(CI_WORKFLOW).not.toContain('steps.graphite');
  });

  it('runs source checks once per revision and never on ready_for_review', () => {
    const sourceRevisionTrigger = 'types: [opened, synchronize, reopened]';

    // Draft state does not change the source SHA. The original source checks
    // remain authoritative when the owner pairs ready with native auto-merge.
    expect(CI_WORKFLOW).toContain(sourceRevisionTrigger);
    expect(SIZE_GUARD_WORKFLOW).toContain(sourceRevisionTrigger);
    expect(FORK_GATE_WORKFLOW).toContain(
      `pull_request:\n    ${sourceRevisionTrigger}`
    );
    expect(FORK_GATE_WORKFLOW).toContain(
      `pull_request_target:\n    ${sourceRevisionTrigger}`
    );
    expect(CI_WORKFLOW).not.toContain('ready_for_review');
    expect(SIZE_GUARD_WORKFLOW).not.toContain('ready_for_review');
    expect(FORK_GATE_WORKFLOW).not.toContain('ready_for_review');
    expect(CI_WORKFLOW).toMatch(/merge_group:\n\s+types: \[checks_requested\]/);
    expect(SIZE_GUARD_WORKFLOW).toMatch(
      /merge_group:\n\s+types: \[checks_requested\]/
    );
    expect(FORK_GATE_WORKFLOW).toMatch(
      /merge_group:\n\s+types: \[checks_requested\]/
    );
  });

  it('does not launch any workflow from an unchanged ready transition', () => {
    const workflowDir = resolve(REPO_ROOT, '.github/workflows');
    const offenders = readdirSync(workflowDir)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .filter(file => {
        const source = readFileSync(resolve(workflowDir, file), 'utf8');
        return workflowDeclaresReadyForReviewType(source);
      });

    expect(offenders).toEqual([]);
  });

  it('rejects every valid YAML spelling of a ready_for_review type', () => {
    const unsafeDeclarations = [
      'types: [opened, ready_for_review]',
      'types: ready_for_review',
      'types:\n  - opened\n  - ready_for_review',
      'types: [\n  opened,\n  ready_for_review\n]',
    ];
    for (const declaration of unsafeDeclarations) {
      expect(workflowDeclaresReadyForReviewType(declaration)).toBe(true);
    }
    expect(
      workflowDeclaresReadyForReviewType(
        'types:\n  - opened\n  - synchronize\n  - reopened'
      )
    ).toBe(false);
  });

  it('quarantines fixed unit capacity until all named warm receipts exist', () => {
    const route = getJobBlock(CI_WORKFLOW, 'ci-unit-runner-route');
    const units = getJobBlock(CI_WORKFLOW, 'ci-unit-tests');

    expect(route).toContain('runs-on: ubuntu-latest');
    expect(route).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(route).not.toContain("github.event_name == 'merge_group'");
    expect(route).toContain('ref: main');
    expect(route).toContain('continue-on-error: true');
    expect(route).toContain('GH_TOKEN: ${{ github.token }}');
    expect(route).not.toContain('secrets.');
    expect(route).toContain('.github/scripts/query-runner-heartbeat.sh');
    expect(route).toContain('[ "$HEARTBEAT_HEALTH" = \'up\' ]');
    expect(route).toContain("runner_class='hosted'");
    expect(route).toContain('fixed|hosted');
    expect(route).not.toContain('runner: ${{ steps.route.outputs.runner }}');
    expect(units).not.toContain('ci-unit-runner-route');
    expect(units).toContain('ci-merge-group-admission');
    expect(units).toContain('runs-on: ubuntu-latest');
    expect(units).not.toContain('runs-on: jovie-runner');
    expect(units).not.toContain('vars.CI_UNIT_RUNNER');
    expect(units).toContain('max-parallel: 120');
    expect(units).toContain('all five named');
  });

  it('admits expensive queue lanes only while exact external gates are green', () => {
    const admission = getJobBlock(CI_WORKFLOW, 'ci-merge-group-admission');
    expect(admission).toContain('needs: [ci-path-changes]');
    expect(admission).toContain("github.event_name == 'merge_group'");
    expect(admission).toContain('runs-on: ubuntu-latest');
    expect(admission).toContain('timeout-minutes: 2');
    expect(admission).toContain('checks: read');
    expect(admission).toContain('contents: read');
    expect(admission).toContain('ref: main');
    expect(admission).not.toContain(
      'ref: ${{ github.event.merge_group.base_sha }}'
    );
    expect(admission).toContain('persist-credentials: false');
    expect(admission).toContain('GH_TOKEN: ${{ github.token }}');
    expect(admission).toContain(
      'run: node scripts/lib/merge-group-admission.mjs'
    );
    expect(admission).not.toContain('secrets.');

    for (const jobId of ['ci-fast-typecheck', 'ci-fast-remaining']) {
      const job = getJobBlock(CI_WORKFLOW, jobId);
      expect(job, jobId).toContain('ci-merge-group-admission');
      expect(job, jobId).toMatch(/if: >-\s+!cancelled\(\) &&/);
      expect(job, jobId).not.toContain('always()');
      expect(job, jobId).toContain("github.event_name != 'merge_group'");
      expect(job, jobId).toContain(
        "needs.ci-merge-group-admission.result == 'success'"
      );
    }

    const remaining = getJobBlock(CI_WORKFLOW, 'ci-fast-remaining');
    expect(remaining).toContain(
      'CI_FAST_SKIP_STRUCTURAL: ${{ steps.structural.outputs.skip }}'
    );
    expect(remaining).toContain('github.event_name }}" != "pull_request"');
    expect(remaining).toContain('echo "skip=false"');
    expect(remaining).toContain('apps/web/\\.storybook/');
    expect(remaining).toContain('apps/web/package\\.json$');
    expect(remaining).toContain('apps/web/scripts/');
    expect(remaining).toContain('chromatic\\.config\\.json$');
    expect(remaining).toContain('package\\.json$');
    expect(remaining).toContain('shared-ui-visual-arbitrary');
    expect(remaining).toContain('scripts/doc-freshness-lint');
    expect(remaining).toContain('apps/web/tests/');

    for (const jobId of [
      'ci-unit-tests',
      'ci-build-layout',
      'ci-ios',
      'ci-macos',
      'ci-cross-product-integration',
      'ci-promptfoo-evals',
      'ci-golden-eval-set',
    ]) {
      const job = getJobBlock(CI_WORKFLOW, jobId);
      expect(job, jobId).toContain('ci-merge-group-admission');
      expect(job, jobId).toContain('always()');
      expect(job, jobId).toContain("github.event_name != 'merge_group'");
      expect(job, jobId).toContain(
        "needs.ci-merge-group-admission.result == 'success'"
      );
    }

    const ciFast = getJobBlock(CI_WORKFLOW, 'ci-fast');
    expect(ciFast).toContain('ci-fast-typecheck');
    expect(ciFast).toContain('ci-fast-remaining');
    expect(ciFast).toContain('always()');
    expect(ciFast).toContain("needs.ci-path-changes.result == 'success'");
    expect(ciFast).toContain("github.event_name != 'merge_group'");
    expect(ciFast).toContain(
      "needs.ci-merge-group-admission.result == 'success'"
    );
    expect(ciFast).toContain('TYPECHECK_RESULT');
    expect(ciFast).toContain('REMAINING_RESULT');
    expect(ciFast).toContain('PROFILE_BROWSER_RESULT');
    expect(parseExactCiFastFailureOperands(ciFast)).toHaveLength(3);
    expect(ciFast).toContain('exit 1');
    const units = getJobBlock(CI_WORKFLOW, 'ci-unit-tests');
    expect(units).not.toContain('ci-unit-runner-route');
    expect(units).toMatch(
      /github\.event_name == 'push' &&\s+github\.ref == 'refs\/heads\/main'/
    );
    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    expect(buildLayout).toMatch(
      /github\.event_name == 'push' &&\s+github\.ref == 'refs\/heads\/main'/
    );

    for (const jobId of [
      'ci-unit-runner-route',
      'ci-risk-classifier',
      'ci-secret-scan',
      'drizzle-migration-guard',
    ]) {
      expect(getJobBlock(CI_WORKFLOW, jobId), jobId).not.toContain(
        'ci-merge-group-admission'
      );
    }
  });

  it('fans real combined-head checks into PR Ready without PR metadata or deploy evidence', () => {
    const aggregate = getJobBlock(CI_WORKFLOW, 'ci-merge-group-ready');
    const sourceAggregate = getJobBlock(CI_WORKFLOW, 'ci-pr-ready');
    const unitTests = getJobBlock(CI_WORKFLOW, 'ci-unit-tests');
    const unitJobHeader = unitTests.slice(0, unitTests.indexOf('    runs-on:'));
    const triggerBlock = CI_WORKFLOW.slice(
      0,
      CI_WORKFLOW.indexOf('\npermissions:')
    );
    expect(aggregate).toContain(
      "github.event_name == 'merge_group' && 'PR Ready'"
    );
    expect(aggregate).toContain(
      "if: ${{ always() && github.event_name == 'merge_group' }}"
    );
    expect(aggregate).not.toContain('!cancelled()');
    expect(aggregate).toContain('ci-fast');
    expect(aggregate).toContain('ci-unit-tests');
    expect(aggregate).toContain('ci-build-layout');
    expect(aggregate).toContain('ci-ios');
    expect(aggregate).toContain('ci-macos');
    expect(aggregate).toContain('ci-cross-product-integration');
    expect(aggregate).toContain('ci-product-lane-receipt');
    expect(aggregate).toContain('ci-promptfoo-evals');
    expect(aggregate).toContain('ci-golden-eval-set');
    expect(aggregate).toContain('ci-golden-path-lock');
    expect(aggregate).toContain('ci-visual-snapshot-compare');
    expect(aggregate).toContain('drizzle-migration-guard');
    expect(aggregate).toContain('BUILD_LAYOUT_RESULT');
    expect(aggregate).toContain('RUN_PROMPTFOO');
    expect(aggregate).toContain('RUN_GOLDEN_EVAL');
    expect(aggregate).toContain(
      '$name did not pass for its selected product lane'
    );
    expect(aggregate).not.toContain(
      'RUN_TEST="${{ needs.ci-path-changes.outputs.run_test }}"'
    );
    expect(sourceAggregate).not.toContain(
      'RUN_TEST="${{ needs.ci-path-changes.outputs.run_test }}"'
    );
    expect(sourceAggregate).not.toContain('ci-unit-tests');
    expect(sourceAggregate).toContain(
      'All deterministic source PR checks passed.'
    );
    expect(unitTests).not.toContain(
      "needs.ci-path-changes.outputs.run_test == 'true'"
    );
    expect(unitTests).toContain(
      "needs.ci-path-changes.outputs.run_web == 'true'"
    );
    // JOV-5288 repo lanes skip Jovie app suites in ci-fast; Web unit shards
    // stay on the product-lane `run_web` gate so iOS/Mac-only diffs do not
    // wait on Web units.
    expect(unitTests).not.toContain('run_jovie_product');
    expect(unitTests).toContain('run: echo "run_full_ci=true"');
    expect(unitTests).toContain("github.event_name == 'merge_group'");
    expect(unitTests).toMatch(
      /github\.event_name == 'push' &&\s+github\.ref == 'refs\/heads\/main'/
    );
    expect(unitTests).toContain("github.event_name == 'workflow_dispatch'");
    expect(unitTests).not.toContain("github.event_name == 'pull_request'");
    expect(unitJobHeader).toContain('always() &&\n      !cancelled() &&');
    expect(unitJobHeader).not.toContain('continue-on-error');
    expect(unitTests).toContain(
      "fail-fast: ${{ github.event_name == 'merge_group' }}"
    );
    expect(unitTests).not.toContain('fail-fast: true');
    expect(unitTests).not.toContain('fail-fast: false');
    expect(unitTests).toContain('Preserve failed unit-shard diagnosis');
    expect(unitTests).toContain(
      "if: ${{ failure() && !cancelled() && steps.check_changes.outputs.run_full_ci == 'true' }}"
    );
    expect(unitTests).toContain(
      'unit-test-failure-${{ github.run_id }}-${{ github.run_attempt }}-${{ strategy.job-index }}'
    );
    expect(unitTests).toContain(
      'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1'
    );
    expect(unitTests).toContain('path: apps/web/test-report.*.junit.xml');
    expect(unitTests).toContain('if-no-files-found: warn');
    expect(unitTests).toContain('retention-days: 14');
    expect(triggerBlock).not.toMatch(
      /^\s+(?:workflow_run|check_run|check_suite):/m
    );
    expect(aggregate).not.toMatch(
      /github\.event\.pull_request|github\.(base_ref|head_ref)/
    );
    expect(aggregate).not.toContain('ci-pr-vercel-preview');
    expect(aggregate).not.toContain('ci-a11y');
    expect(aggregate).not.toContain('neon-db');
    expect(aggregate).not.toContain('deploy-staging');

    for (const job of [
      'ci-risk-classifier',
      'drizzle-migration-guard',
      'ci-unit-tests',
      'ci-build-layout',
      'ci-ios',
      'ci-macos',
      'ci-cross-product-integration',
      'ci-promptfoo-evals',
      'ci-golden-eval-set',
    ]) {
      expect(getJobBlock(CI_WORKFLOW, job)).toContain(
        "github.event_name == 'merge_group'"
      );
    }
    expect(getJobBlock(CI_WORKFLOW, 'drizzle-migration-guard')).toContain(
      'name: Migration Guard'
    );
    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    expect(buildLayout).toContain('runs-on: ubuntu-latest');
    expect(buildLayout).toContain('Build exact combined head');
    expect(buildLayout).toContain('Run deterministic layout behavior guard');
    expect(buildLayout).not.toContain('actions/upload-artifact');
    expect(buildLayout).not.toContain('actions/download-artifact');
    expect(unitTests).toContain(
      "shard: ['1/10', '2/10', '3/10', '4/10', '5/10', '6/10', '7/10', '8/10', '9/10', '10/10']"
    );

    const macos = getJobBlock(CI_WORKFLOW, 'ci-macos');
    expect(macos).toContain('runs-on: macos-26');
    expect(CI_WORKFLOW).toContain('node "$TRUSTED_PRODUCT_LANE_CLASSIFIER"');
    expect(CI_WORKFLOW).not.toContain('.github/workflows/macos-ci.yml');
    expect(macos).toContain("github.event_name == 'merge_group'");
    expect(macos).not.toContain("github.event_name == 'pull_request'");
    expect(macos).toContain(
      'swift test --package-path apps/macos/MenuMonitor --enable-code-coverage'
    );
    expect(macos).toContain(
      'swift build --package-path apps/macos/MenuMonitor -c release'
    );
    expect(macos).toContain('pnpm --filter @jovie/desktop run package:staging');
    expect(unitTests).toContain(
      "github.event_name == 'merge_group' && matrix.shard == '4/10'"
    );
    expect(unitTests).toContain(
      "github.event_name != 'merge_group' && matrix.shard == '1/10'"
    );
    expect(
      unitTests.match(/pnpm turbo test --filter=@jovie\/ui/g)
    ).toHaveLength(1);
    expect(unitTests).not.toContain("matrix.shard == '1/5'");
    expect(unitTests).toContain('max-parallel: 120');
    expect(getJobBlock(CI_WORKFLOW, 'ci-a11y')).not.toContain(
      "github.event_name == 'merge_group'"
    );
    expect(aggregate).toContain(
      'Preview/A11y evidence is explicit opt-in or post-merge; merge groups do not provision Neon.'
    );

    for (const jobId of ['ci-promptfoo-evals', 'ci-golden-eval-set']) {
      const job = getJobBlock(CI_WORKFLOW, jobId);
      expect(job).toContain("github.event_name == 'merge_group'");
      expect(job).toContain(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'"
      );
      expect(job).toContain("github.event_name == 'workflow_dispatch'");
      expect(job).not.toContain("github.event_name == 'pull_request'");
      expect(job).toContain('runs-on: ubuntu-latest');
    }
  });

  it('requires one diff-scoped secret scan on source and combined heads', () => {
    const secret = getJobBlock(CI_WORKFLOW, 'ci-secret-scan');
    const mergeReady = getJobBlock(CI_WORKFLOW, 'ci-merge-group-ready');
    const sourceReady = getJobBlock(CI_WORKFLOW, 'ci-pr-ready');
    expect(secret).toContain('needs: [main-queue-provenance]');
    expect(secret).toMatch(
      /github\.event_name == 'pull_request'\s*\|\|\s*github\.event_name == 'merge_group'\s*\|\|\s*\(\s*github\.event_name == 'push'/
    );
    expect(secret).toContain('github.event.merge_group.base_sha');
    expect(secret).toContain('github.event.before');
    for (const aggregate of [mergeReady, sourceReady]) {
      expect(aggregate).toContain('ci-secret-scan');
      expect(aggregate).toContain('Secret Scan');
    }
    expect(sourceReady).toContain(
      "if: ${{ always() && github.event_name == 'pull_request'"
    );
    expect(sourceReady).not.toContain('Graphite');
    expect(SECURITY_WORKFLOW).not.toMatch(/^\s*pull_request:/m);
  });

  // JOV-4446: systemic merge_group failures from push/PR-only event fields.
  it('resolves path changes and risk classification from merge_group SHAs only (JOV-4446)', () => {
    const pathChanges = getJobBlock(CI_WORKFLOW, 'ci-path-changes');
    const risk = getJobBlock(CI_WORKFLOW, 'ci-risk-classifier');

    // Path Changes: explicit merge_group branch with exact base/head SHAs.
    expect(pathChanges).toContain(
      'MERGE_GROUP_BASE_SHA="${{ github.event.merge_group.base_sha }}"'
    );
    expect(pathChanges).toContain(
      'MERGE_GROUP_HEAD_SHA="${{ github.event.merge_group.head_sha }}"'
    );
    expect(pathChanges).toContain('node "$TRUSTED_PATH_DIFF_RESOLVER"');
    expect(pathChanges).toContain('--base "$MERGE_GROUP_BASE_SHA"');
    expect(pathChanges).toContain('--head "$MERGE_GROUP_HEAD_SHA"');
    expect(PATH_DIFF_HELPER).toContain(
      "['diff', '--no-renames', '--name-only', `${baseSha}...${headSha}`]"
    );
    expect(PATH_DIFF_HELPER).toContain(LIVE_MAIN_FETCH_REF);
    expect(PATH_DIFF_HELPER).not.toContain('github.event.before');
    expect(PATH_DIFF_HELPER).not.toContain('github.base_ref');
    expect(pathChanges).toContain('IS_NOOP');
    expect(pathChanges).toContain(
      "is_noop_merge_group: ${{ steps.detect.outputs.is_noop_merge_group || 'false' }}"
    );
    expect(pathChanges).toContain(
      "run_jovie_product: ${{ steps.detect.outputs.run_jovie_product || 'false' }}"
    );
    expect(pathChanges).toContain(
      "run_jovie_typecheck: ${{ steps.detect.outputs.run_jovie_typecheck || 'true' }}"
    );
    expect(pathChanges).toContain(
      "run_symphony_control: ${{ steps.detect.outputs.run_symphony_control || 'false' }}"
    );
    expect(pathChanges).toContain(
      "run_summer_ops: ${{ steps.detect.outputs.run_summer_ops || 'false' }}"
    );
    expect(pathChanges).toContain(
      'node "$TRUSTED_CI_REPO_LANES" --emit-github-output'
    );
    expect(pathChanges).toContain(
      'echo "is_noop_merge_group=true" >> "$GITHUB_OUTPUT"'
    );
    expect(pathChanges).toContain(
      'for output in run_build run_test run_test_performance'
    );
    expect(pathChanges).toContain('echo "$output=false" >> "$GITHUB_OUTPUT"');
    expect(pathChanges).toContain(
      'elif [[ "${{ github.event_name }}" == "push" ]]; then'
    );
    expect(pathChanges).toContain(
      'Unsupported event for path change detection'
    );
    // Must not treat merge_group as an implicit push (event.before is empty).
    const detectStep = pathChanges.slice(
      pathChanges.indexOf('Detect path changes for all job types')
    );
    // The push branch is gated; merge_group never reads event.before.
    expect(detectStep).toMatch(
      /merge_group[\s\S]*?elif \[\[ "\$\{\{ github\.event_name \}\}" == "push" \]\]/
    );

    // Risk classifier: same SHA-only contract.
    expect(risk).toContain('github.event.merge_group.base_sha');
    expect(risk).toContain('github.event.merge_group.head_sha');
    expect(risk).toContain(
      'merge_group base_sha/head_sha are not usable exact SHAs'
    );
    expect(risk).toContain(
      'Unsupported event for CI risk classification: $EVENT_NAME'
    );
    // merge_group branch must appear before the push/before fallback.
    const riskCollect = risk.slice(risk.indexOf('Collect changed files'));
    const mergeIdx = riskCollect.indexOf('EVENT_NAME" == "merge_group"');
    const pushIdx = riskCollect.indexOf('EVENT_NAME" == "push"');
    // Only the push branch may bind github.event.before as DIFF_BASE.
    const beforeAssignIdx = riskCollect.indexOf(
      'DIFF_BASE="${{ github.event.before }}"'
    );
    expect(mergeIdx).toBeGreaterThanOrEqual(0);
    expect(pushIdx).toBeGreaterThan(mergeIdx);
    expect(beforeAssignIdx).toBeGreaterThan(pushIdx);
  });

  it('keeps the pull_request empty-diff docs-only hard-fail (JOV-4905)', () => {
    const pathChanges = getJobBlock(CI_WORKFLOW, 'ci-path-changes');
    const detectStep = pathChanges.slice(
      pathChanges.indexOf('Detect path changes for all job types')
    );
    const pullRequestStart = detectStep.indexOf(
      'elif [[ "${{ github.event_name }}" == "pull_request" ]]; then'
    );
    const mergeGroupStart = detectStep.indexOf(
      'if [[ "${{ github.event_name }}" == "merge_group" ]]; then'
    );
    expect(pullRequestStart).toBeGreaterThan(mergeGroupStart);
    const pullRequestBranch = detectStep.slice(pullRequestStart);
    expect(pullRequestBranch).toContain(
      'Empty changed-file list vs origin/${{ github.base_ref }}; refusing a false docs-only classification.'
    );
    const mergeGroupBranch = detectStep.slice(
      mergeGroupStart,
      pullRequestStart
    );
    expect(mergeGroupBranch).not.toContain('refusing a false docs-only');
    expect(mergeGroupBranch).not.toMatch(
      /(?:DIFF_BASE|CHANGED_FILES)=.*github\.event\.before/
    );
    expect(mergeGroupBranch).not.toMatch(
      /(?:DIFF_BASE|CHANGED_FILES|git fetch).*\${{ github\.base_ref }}/
    );
  });

  it('selects product lanes independently and fails closed on selected lane results', () => {
    const pathChanges = getJobBlock(CI_WORKFLOW, 'ci-path-changes');
    const units = getJobBlock(CI_WORKFLOW, 'ci-unit-tests');
    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    const ios = getJobBlock(CI_WORKFLOW, 'ci-ios');
    const macos = getJobBlock(CI_WORKFLOW, 'ci-macos');
    const crossProduct = getJobBlock(
      CI_WORKFLOW,
      'ci-cross-product-integration'
    );
    const aggregate = getJobBlock(CI_WORKFLOW, 'ci-merge-group-ready');

    expect(pathChanges).toContain(
      "is_noop_merge_group: ${{ steps.detect.outputs.is_noop_merge_group || 'false' }}"
    );
    expect(pathChanges).toContain('product-lane-classifier.mjs');
    expect(pathChanges).toContain('persist-credentials: false');
    expect(pathChanges).toContain(
      'git show "${DIFF_BASE}:scripts/brand-scrub.py"'
    );
    expect(pathChanges).toContain('python3 "$TRUSTED_BRAND_SCRUBBER"');
    expect(pathChanges).not.toContain('python3 scripts/brand-scrub.py');
    expect(pathChanges).toContain(
      'git show "${CLASSIFICATION_BASE_REF}:scripts/lib/product-lane-classifier.mjs"'
    );
    expect(pathChanges).toContain('node "$TRUSTED_PRODUCT_LANE_CLASSIFIER"');
    expect(pathChanges).not.toContain(
      'node scripts/lib/product-lane-classifier.mjs \\'
    );
    expect(pathChanges).toContain('--base-ref "$CLASSIFICATION_BASE_REF"');
    expect(pathChanges).toContain('--head-ref "$CLASSIFICATION_HEAD_REF"');
    expect(pathChanges).toContain(
      'CLASSIFICATION_BASE_REF="$PATH_DIFF_BASE_SHA"'
    );
    expect(pathChanges).toContain(
      'CLASSIFICATION_HEAD_REF="$PATH_DIFF_HEAD_SHA"'
    );
    expect(pathChanges).toContain(
      'git merge-base --is-ancestor "$PATH_DIFF_BASE_SHA" "$PATH_DIFF_HEAD_SHA"'
    );
    expect(pathChanges).toContain(
      'CLASSIFICATION_BASE_REF="origin/${{ github.base_ref }}"'
    );
    expect(pathChanges).toContain('CLASSIFICATION_BASE_REF="$PUSH_BASE_SHA"');
    expect(pathChanges).toContain(
      "run_web: ${{ steps.detect.outputs.run_web || 'false' }}"
    );
    expect(pathChanges).toContain(
      "run_macos: ${{ steps.detect.outputs.run_macos || 'false' }}"
    );
    expect(pathChanges).toContain(
      "run_cross_product: ${{ steps.detect.outputs.run_cross_product || 'false' }}"
    );
    expect(units).toContain("outputs.run_web == 'true'");
    expect(buildLayout).toContain("outputs.run_web == 'true'");
    expect(ios).toContain("outputs.run_ios == 'true'");
    expect(macos).toContain("outputs.run_macos == 'true'");
    expect(crossProduct).toContain("outputs.run_cross_product == 'true'");
    expect(getJobBlock(CI_WORKFLOW, 'ci-fast-remaining')).toContain(
      'CI_PRODUCT_LANES: ${{ needs.ci-path-changes.outputs.selected_lanes }}'
    );
    expect(aggregate).toContain(
      'NOOP_GROUP="${{ needs.ci-path-changes.outputs.is_noop_merge_group }}"'
    );
    expect(aggregate).toContain('SELECTED_LANES=');
    expect(aggregate).toContain('Shared-contract impact');
    expect(aggregate).toContain(
      'Cross-Product Integration:$RUN_CROSS_PRODUCT:$CROSS_PRODUCT_RESULT'
    );

    for (const jobId of [
      'ci-merge-group-admission',
      'ci-risk-classifier',
      'ci-fast',
      'ci-secret-scan',
      'ci-golden-path-lock',
      'ci-visual-snapshot-compare',
      'drizzle-migration-guard',
    ]) {
      expect(getJobBlock(CI_WORKFLOW, jobId), jobId).not.toContain(
        "needs.ci-path-changes.outputs.run_web == 'true'"
      );
    }

    const loopStart = aggregate.indexOf(
      '          for selected_gate in \\\n            "Web Unit Tests:'
    );
    const loopEnd = aggregate.indexOf('          done', loopStart);
    expect(loopStart).toBeGreaterThanOrEqual(0);
    expect(loopEnd).toBeGreaterThan(loopStart);
    const selectedGateScript = aggregate
      .slice(loopStart, loopEnd + '          done'.length)
      .replace(/^ {10}/gm, '');

    const cases = `unselected Web accepts skipped jobs|false|skipped|skipped|false|skipped|0
unselected Web rejects unit execution|false|success|skipped|false|skipped|1
unselected Web rejects build execution|false|skipped|success|false|skipped|1
healthy Web passes with iOS skipped|true|success|success|false|skipped|0
selected Web rejects skipped jobs|true|skipped|skipped|false|skipped|1
selected Web rejects failed unit shard|true|failure|success|false|skipped|1
selected Web rejects cancelled unit siblings|true|cancelled|success|false|skipped|1
deliberate-red iOS fails with Web skipped|false|skipped|skipped|true|failure|1`;
    for (const testCase of cases.split('\n')) {
      const [name, web, unit, build, runIos, iosResult, status] =
        testCase.split('|');
      const result = spawnSync(
        'bash',
        [
          '-euo',
          'pipefail',
          '-c',
          `RUN_WEB="$1"
UNIT_RESULT="$2"
BUILD_LAYOUT_RESULT="$3"
RUN_IOS="$4"
IOS_RESULT="$5"
RUN_MACOS=false
MACOS_RESULT=skipped
RUN_CROSS_PRODUCT=false
CROSS_PRODUCT_RESULT=skipped
${selectedGateScript}`,
          'product-lane-gate',
          web,
          unit,
          build,
          runIos,
          iosResult,
        ],
        { encoding: 'utf8' }
      );
      expect(
        result.status,
        `${name}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      ).toBe(Number(status));
    }
  });

  it('builds the exact product-lane receipt with a valid immutable run URL', () => {
    const receipt = getJobBlock(CI_WORKFLOW, 'ci-product-lane-receipt');
    expect(receipt).toContain(
      '--arg run "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"'
    );
    const queryLine = receipt
      .split('\n')
      .find(line => line.includes("'{lanes:"));
    expect(queryLine).toBeDefined();
    const query = queryLine.trim().replace(/^'/, '').replace(/' \\$/, '');
    const runUrl = 'https://github.com/JovieInc/Jovie/actions/runs/33198607319';
    const result = spawnSync(
      'jq',
      [
        '-n',
        '--argjson',
        'ios',
        '["skipped","skipped"]',
        '--argjson',
        'mac',
        '["skipped","skipped"]',
        '--argjson',
        'web',
        '["success","success","success"]',
        '--argjson',
        'operations',
        '["skipped"]',
        '--argjson',
        'cross',
        '["skipped"]',
        '--arg',
        'receipt',
        'product-lane-final-exact-head-1',
        '--arg',
        'run',
        runUrl,
        query,
      ],
      { encoding: 'utf8' }
    );
    expect(
      result.status,
      `stdout: ${result.stdout}\nstderr: ${result.stderr}`
    ).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      receiptArtifact: 'product-lane-final-exact-head-1',
      run: runUrl,
      lanes: {
        web: ['success', 'success', 'success'],
      },
    });
  });

  it('starts Build+Layout combined-head server with pinned loopback HOSTNAME (JOV-4446)', () => {
    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    expect(buildLayout).toContain("github.event_name == 'merge_group'");
    expect(buildLayout).toContain('Build exact combined head');
    expect(buildLayout).toContain('Verify combined build output');
    expect(buildLayout).toContain(
      'apps/web/.next/standalone/apps/web/server.js'
    );
    expect(buildLayout).toContain('export HOSTNAME=localhost');
    expect(buildLayout).toContain(
      'PORT=3230 node .next/standalone/apps/web/server.js'
    );
    expect(buildLayout).toContain('Combined-head standalone server died');
    expect(buildLayout).toContain(
      'Combined-head standalone server failed to start'
    );
    expect(buildLayout).not.toContain('actions/download-artifact');
  });

  it('coalesces a short release wave before exact authorization and mutation', () => {
    const coalesce = getJobBlock(
      PRODUCTION_CONTROLLER_WORKFLOW,
      'coalesce-production'
    );
    const authorize = getJobBlock(
      PRODUCTION_CONTROLLER_WORKFLOW,
      'authorize-production'
    );

    expect(coalesce).toContain('timeout-minutes: 5');
    expect(coalesce).toContain(
      "github.event.workflow_run.event == 'push' && github.event.workflow_run.conclusion == 'success'"
    );
    expect(coalesce).toContain("COALESCE_DELAY_SECONDS: '60'");
    expect(coalesce).toContain('sleep "$COALESCE_DELAY_SECONDS"');
    expect(coalesce).toContain('echo "is_current=false" >> "$GITHUB_OUTPUT"');
    expect(coalesce).toContain('echo "is_current=true" >> "$GITHUB_OUTPUT"');
    expect(coalesce).toContain('commits/main');
    expect(authorize).toContain(
      'needs: [coalesce-production, fleet-promotion]'
    );
    expect(authorize).toContain(
      "needs.coalesce-production.outputs.is_current == 'true'"
    );
    expect(authorize).toContain(
      "needs.fleet-promotion.outputs.deployment_allowed == 'true'"
    );
    expect(PRODUCTION_CONTROLLER_WORKFLOW).toContain(
      'group: production-mutation'
    );
    expect(PRODUCTION_CONTROLLER_WORKFLOW).toContain(
      'cancel-in-progress: false'
    );
    expect(coalesce).not.toContain('vercel ');
    expect(coalesce).not.toContain('secrets: inherit');
  });

  it('keeps merge groups out of manual evidence and deployment jobs', () => {
    expect(getJobBlock(CI_WORKFLOW, 'neon-db')).not.toContain(
      "github.event_name == 'push'"
    );
    expect(getJobBlock(CI_WORKFLOW, 'ci-pr-vercel-preview')).toContain(
      "github.event_name == 'workflow_dispatch'"
    );
    expect(getJobBlock(CI_WORKFLOW, 'ci-summary')).toContain(
      "github.event_name == 'workflow_dispatch'"
    );

    const caller = getJobBlock(
      PRODUCTION_CONTROLLER_WORKFLOW,
      'production-release'
    );
    const verified = getJobBlock(
      PRODUCTION_CONTROLLER_WORKFLOW,
      'production-verified'
    );
    const workflowHeader = PRODUCTION_CONTROLLER_WORKFLOW.slice(
      0,
      PRODUCTION_CONTROLLER_WORKFLOW.indexOf('\njobs:')
    );
    expect(caller).toContain(
      'uses: ./.github/workflows/production-release.yml'
    );
    expect(workflowHeader).toContain('group: production-mutation');
    expect(workflowHeader).toContain('queue: max');
    expect(workflowHeader).toContain('cancel-in-progress: false');
    expect(caller).not.toContain('concurrency:');
    expect(CI_WORKFLOW).not.toMatch(/^  (deploy-staging|promote-production):/m);
    expect(PRODUCTION_RELEASE_WORKFLOW).toContain('  deploy-staging:');
    expect(PRODUCTION_RELEASE_WORKFLOW).toContain('  promote-production:');
    expect(PRODUCTION_RELEASE_WORKFLOW).not.toContain('concurrency:');

    expect(verified).toContain("github.event.workflow_run.event == 'push'");
    expect(verified).toContain(
      "needs.authorize-production.result == 'success'"
    );
    expect(verified).toContain(
      "needs.authorize-production.outputs.already_verified != 'true'"
    );
    expect(verified).not.toContain(
      "needs.authorize-production.outputs.authorized == 'true' &&"
    );
    expect(verified).toContain(
      '[ "${{ needs.authorize-production.outputs.authorized }}" != "true" ]'
    );
    expect(verified).not.toContain('concurrency:');
    expect(CI_WORKFLOW).not.toContain('  deploy-notify:');
    expect(CI_WORKFLOW).not.toContain('  production-release:');
    expect(CI_WORKFLOW).not.toContain('  production-verified:');
  });

  it('keeps the supersession probe gap additive with gates untouched', () => {
    // Fences: the deploy-gate exactness contract, the released gating, the
    // canary-health-gate probe semantics, and the required-check set all stay
    // exactly as they were; the follow-up path lives outside them.
    const authorize = getJobBlock(
      PRODUCTION_CONTROLLER_WORKFLOW,
      'authorize-production'
    );
    expect(authorize).toContain('.name == "Main Release Ready"');
    expect(authorize).toContain('if [ "$evidence_count" != "1" ]; then');

    for (const jobId of [
      'ci-public-profile-smoke',
      'ci-post-deploy-auth-smoke',
      'lighthouse-ci',
    ]) {
      const job = getJobBlock(PRODUCTION_CONTROLLER_WORKFLOW, jobId);
      expect(job, jobId).toContain(
        "needs.production-release.result == 'success' && needs.production-release.outputs.released == 'true'"
      );
    }
    expect(PRODUCTION_CONTROLLER_WORKFLOW).not.toContain(
      'postdeploy-probes.yml'
    );
    expect(PRODUCTION_RELEASE_WORKFLOW).not.toContain('postdeploy-probes.yml');

    const releaseResult = getJobBlock(
      PRODUCTION_RELEASE_WORKFLOW,
      'release-result'
    );
    expect(releaseResult).toContain('echo "released=false"');
    expect(releaseResult).toContain('echo "released=true" >> "$GITHUB_OUTPUT"');
    expect(releaseResult.indexOf('echo "released=false"')).toBeLessThan(
      releaseResult.indexOf('echo "released=true" >> "$GITHUB_OUTPUT"')
    );
    expect(releaseResult).toContain('boundary_sha=');

    // The canary gate stays a preview/staging gate; production probes never
    // reuse it (its robots and build-info semantics are preview-specific).
    expect(CANARY_HEALTH_GATE_WORKFLOW).toContain(
      'EXPECTED_VERCEL_ENVIRONMENT=preview'
    );
    expect(CANARY_HEALTH_GATE_WORKFLOW).toContain(
      'preview robots.txt must globally block crawlers'
    );
    expect(CANARY_HEALTH_GATE_WORKFLOW).not.toContain(
      'EXPECTED_VERCEL_ENVIRONMENT=production'
    );
  });

  it('re-probes landed production only when in-lease probes went dark', () => {
    const header = POSTDEPLOY_PROBES_WORKFLOW.slice(
      0,
      POSTDEPLOY_PROBES_WORKFLOW.indexOf('\njobs:')
    );
    expect(header).toContain('workflows: [Production Controller]');
    expect(header).toContain('types: [completed]');
    expect(header).toContain('branches: [main]');
    expect(header).toMatch(/^  workflow_dispatch:\s*$/m);
    expect(header).not.toMatch(/^  (pull_request|push|merge_group|schedule):/m);

    // Read-only evidence must never hold the deploy lease; coalescing keeps
    // only the newest probe run during drains.
    expect(header).toContain('group: postdeploy-probes');
    expect(header).toContain('cancel-in-progress: true');
    expect(header).toContain('contents: read');
    expect(header).toContain('actions: read');
    expect(POSTDEPLOY_PROBES_WORKFLOW).not.toContain(
      'group: production-mutation'
    );
    expect(POSTDEPLOY_PROBES_WORKFLOW).not.toContain('secrets: inherit');
    expect(POSTDEPLOY_PROBES_WORKFLOW).not.toContain('environment:');

    const resolve = getJobBlock(POSTDEPLOY_PROBES_WORKFLOW, 'resolve-target');
    expect(resolve).toContain('runs-on: ubuntu-latest');
    expect(resolve).toContain('timeout-minutes:');
    expect(resolve).toContain('persist-credentials: false');
    // Exact trigger cross-proof, same observer shape as the release observers.
    expect(resolve).toContain(
      '[ "$TRIGGER_RUN_PATH" = ".github/workflows/production-controller.yml" ]'
    );
    expect(resolve).toContain('[ "$TRIGGER_HEAD_BRANCH" = "main" ]');
    expect(resolve).toContain(
      'actions/runs/$TRIGGER_RUN_ID/attempts/$TRIGGER_RUN_ATTEMPT'
    );
    expect(resolve).toContain('.conclusion == $conclusion');
    // Skips only on one exact successful in-lease Lighthouse probe.
    expect(resolve).toContain('.name == "Lighthouse CI (Production)"');
    expect(resolve).toContain('probe_evidence_count');
    expect(resolve).toContain('.conclusion == "success"');
    // Resolves the landed canonical deployment, never a release candidate.
    expect(resolve).toContain('vercel inspect jov.ie');
    expect(resolve).toContain('[ "$deployment_state" != "READY" ]');
    expect(resolve).toContain('[ "$deployment_target" != "production" ]');
    expect(resolve).toContain(
      '^https://jovie-[a-z0-9-]+-jovie\\.vercel\\.app$'
    );
    expect(resolve).toContain('VERCEL_ALLOW_MISSING_COMMIT_SHA=true');
    expect(resolve).toContain('resolve-deployment');
    expect(resolve).toContain('discover-build-identity');
    expect(resolve).toContain(
      'EXPECTED_VERCEL_DEPLOYMENT_ORIGIN="$deployment_url"'
    );
    expect(resolve).toContain('EXPECTED_VERCEL_ENVIRONMENT=production');
    expect(resolve).toContain(
      'gh api "repos/$REPOSITORY/commits/$deployed_sha"'
    );
    expect(resolve).toContain(
      'gh api "repos/$REPOSITORY/compare/$commit_sha...main"'
    );
    expect(resolve).toContain('.merge_base_commit.sha == $sha');
    expect(resolve).toContain(
      'Vercel list metadata disagrees with the exact origin build identity.'
    );
    expect(resolve).not.toContain(
      'commit_sha="$(jq -r \'.meta.githubCommitSha // .gitSource.sha'
    );
    expect(resolve).toContain('should_probe');

    for (const jobId of ['smoke', 'auth-smoke', 'lighthouse']) {
      const job = getJobBlock(POSTDEPLOY_PROBES_WORKFLOW, jobId);
      expect(job, jobId).toContain('needs: [resolve-target]');
      expect(job, jobId).toContain(
        "needs.resolve-target.outputs.should_probe == 'true'"
      );
      expect(job, jobId).toContain(
        'ref: ${{ needs.resolve-target.outputs.commit_sha }}'
      );
      expect(job, jobId).toContain(
        'EXPECTED_COMMIT_SHA: ${{ needs.resolve-target.outputs.commit_sha }}'
      );
      expect(job, jobId).toContain(
        'PRODUCTION_BASE_URL_B64: ${{ needs.resolve-target.outputs.deployment_url_b64 }}'
      );
      expect(job, jobId).toContain('runs-on: ubuntu-latest');
      expect(job, jobId).toContain('timeout-minutes:');
      expect(job, jobId).not.toContain('needs.production-release');
      expect(job, jobId).not.toContain('needs.authorize-production');
      expect(job, jobId).not.toContain('concurrency:');
    }

    const controllerLighthouse = getJobBlock(
      PRODUCTION_CONTROLLER_WORKFLOW,
      'lighthouse-ci'
    );
    // The skip signal keys on this exact job name; drift must fail here.
    expect(controllerLighthouse).toContain('name: Lighthouse CI (Production)');
    expect(POSTDEPLOY_PROBES_WORKFLOW).toContain('notify-failure:');
    expect(POSTDEPLOY_PROBES_WORKFLOW).toContain('#alerts-production');
  });

  it('revalidates submitted and dismissed reviews for main-bound forks', () => {
    const controller = getJobBlock(FORK_GATE_WORKFLOW, 'fork-gate');
    const jobCondition = controller.match(
      /^    if: >-\n([\s\S]*?)^    runs-on:/m
    )?.[1];
    expect(jobCondition).toBeTruthy();
    for (const requirement of [
      "github.event_name == 'pull_request_target'",
      "github.event_name == 'pull_request_review'",
      "github.event.pull_request.base.ref == 'main'",
      'github.event.pull_request.head.repo.fork == true',
    ]) {
      expect(jobCondition).toContain(requirement);
    }
    expect(jobCondition).toContain("github.actor != 'dependabot[bot]'");
    expect(jobCondition).not.toContain('copilot-swe-agent');
    expect(FORK_GATE_WORKFLOW).toContain('types: [submitted, dismissed]');
    expect(controller).toContain('gh api --paginate --slurp');
    expect(controller).toContain('.state == "DISMISSED"');
    expect(controller).toContain('.commit_id == $head_sha');
    expect(controller).toContain('.author_association == "COLLABORATOR"');
  });

  it('revalidates mutable member policy on the exact combined head', () => {
    expect(FORK_GATE_WORKFLOW).toMatch(
      /merge_group:\n\s+types: \[checks_requested\]/
    );
    const forkGate = getJobBlock(FORK_GATE_WORKFLOW, 'merge-group-gate');
    expect(forkGate).toContain(
      "github.event_name == 'merge_group' && 'Fork PR Gate'"
    );
    expect(forkGate).toContain("github.event_name == 'merge_group'");
    expect(forkGate).toContain('ref: ${{ github.event.merge_group.base_sha }}');
    expect(forkGate).toContain('persist-credentials: false');
    expect(forkGate).toContain('contents: read');
    expect(forkGate).toContain('pull-requests: read');
    expect(forkGate).toContain('GH_TOKEN: ${{ github.token }}');
    expect(forkGate).not.toContain('actions/create-github-app-token');
    expect(forkGate).not.toContain('secrets.');
    expect(forkGate).not.toContain('private-key:');
    expect(forkGate).toContain(
      'node scripts/lib/merge-group-member-policy.mjs --policy=fork'
    );
    expect(forkGate).not.toContain('inherits the source PR fork-policy');

    expect(SIZE_GUARD_WORKFLOW).toMatch(
      /merge_group:\n\s+types: \[checks_requested\]/
    );
    const sizeGuard = getJobBlock(SIZE_GUARD_WORKFLOW, 'merge-group-size');
    expect(sizeGuard).toContain(
      "github.event_name == 'merge_group' && 'PR Size Guard'"
    );
    expect(sizeGuard).toContain("github.event_name == 'merge_group'");
    expect(sizeGuard).toContain(
      'ref: ${{ github.event.merge_group.base_sha }}'
    );
    expect(sizeGuard).toContain('persist-credentials: false');
    expect(SIZE_GUARD_WORKFLOW).toContain('contents: read');
    expect(SIZE_GUARD_WORKFLOW).toContain('pull-requests: read');
    expect(sizeGuard).toContain('GH_TOKEN: ${{ github.token }}');
    expect(sizeGuard).not.toContain('actions/create-github-app-token');
    expect(sizeGuard).not.toContain('secrets.');
    expect(sizeGuard).not.toContain('private-key:');
    expect(sizeGuard).toContain(
      'node scripts/lib/merge-group-member-policy.mjs --policy=size'
    );
    expect(sizeGuard).toContain("MAX_LINES: ${{ vars.PR_MAX_LINES || '800' }}");
    expect(sizeGuard).not.toContain('members were size-checked as source PRs');
    expect(getJobBlock(SIZE_GUARD_WORKFLOW, 'size')).toContain(
      "github.event_name == 'pull_request'"
    );
    expect(MEMBER_POLICY).toContain('fetchComparison');
    expect(MEMBER_POLICY).toContain('fetchPullRequest');
    expect(MEMBER_POLICY).not.toContain("githubRequest('/graphql'");
    expect(MEMBER_POLICY).not.toContain('mergeQueue(');
    const maxMembers = BRANCH_RULESET.match(
      /^\s*max_entries_to_merge:\s*(\d+)$/m
    )?.[1];
    expect(maxMembers).toBeTruthy();
    expect(MEMBER_POLICY).toContain(`const MAX_GROUP_MEMBERS = ${maxMembers};`);
  });

  it('keeps source and combined-head lanes deterministic and free of privileged secrets', () => {
    const workflowHeader = CI_WORKFLOW.slice(0, CI_WORKFLOW.indexOf('\njobs:'));
    expect(workflowHeader).toContain(
      "TURBO_TOKEN: ${{ (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets.TURBO_TOKEN || '' }}"
    );
    expect(workflowHeader).toContain(
      "TURBO_TEAM: ${{ (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets.TURBO_TEAM || '' }}"
    );
    expect(workflowHeader).toContain(
      "TURBO_CACHE: ${{ (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && 'local:rw,remote:rw' || 'local:rw' }}"
    );
    expect(workflowHeader).not.toContain("github.event_name != 'merge_group'");

    const sourceJobs = [
      'ci-path-changes',
      'ci-risk-classifier',
      'ci-fast',
      'ci-secret-scan',
      'ci-golden-path-lock',
      'drizzle-migration-guard',
      'ci-integration-ready',
      'ci-pr-ready',
    ];
    for (const job of sourceJobs) {
      expect(getJobBlock(CI_WORKFLOW, job), job).not.toMatch(
        /secrets\.[A-Z0-9_]+|secrets:\s*inherit/
      );
    }

    const activeJobs = [
      'ci-path-changes',
      'ci-merge-group-admission',
      'ci-risk-classifier',
      'ci-fast',
      'ci-build-layout',
      'ci-ios',
      'ci-macos',
      'ci-promptfoo-evals',
      'ci-golden-eval-set',
      'ci-secret-scan',
      'ci-golden-path-lock',
      'ci-visual-snapshot-compare',
      'drizzle-migration-guard',
      'ci-unit-tests',
      'ci-merge-group-ready',
    ];
    for (const job of activeJobs) {
      const block = getMergeGroupReachableJobText(
        getJobBlock(CI_WORKFLOW, job)
      );
      expect(block, job).not.toMatch(/secrets\.[A-Z0-9_]+/);

      const reusable = block.match(
        /^    uses:\s+(\.\/\.github\/workflows\/[^\s]+)$/m
      )?.[1];
      if (reusable) {
        const calledWorkflow = readFileSync(
          resolve(REPO_ROOT, reusable.slice(2)),
          'utf8'
        );
        expect(calledWorkflow, reusable).toContain('workflow_call:');
        expect(calledWorkflow, reusable).not.toMatch(
          /secrets\.[A-Z0-9_]+|secrets:\s*inherit/
        );
      }
    }

    const unitTests = getJobBlock(CI_WORKFLOW, 'ci-unit-tests');
    expect(unitTests).toContain("github.event_name != 'merge_group'");
    expect(getMergeGroupReachableJobText(unitTests)).not.toMatch(
      /secrets\.[A-Z0-9_]+/
    );

    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    expect(buildLayout).toContain(
      'pk_test_ZHVtbXktdGVzdC1jb3ZlcmFnZS5jbGVyay5hY2NvdW50cy5kZXYk'
    );
    expect(buildLayout).not.toContain('secrets.');

    const mergeGroupWorkflows = readdirSync(
      resolve(REPO_ROOT, '.github/workflows')
    )
      .filter(file => file.endsWith('.yml'))
      .filter(file =>
        /^\s*merge_group:\s*$/m.test(
          readFileSync(resolve(REPO_ROOT, '.github/workflows', file), 'utf8')
        )
      )
      .sort();
    expect(mergeGroupWorkflows).toEqual([
      'ci.yml',
      'fork-pr-gate.yml',
      'pr-size-guard.yml',
    ]);
    expect(getJobBlock(FORK_GATE_WORKFLOW, 'merge-group-gate')).not.toContain(
      'secrets.'
    );
    expect(getJobBlock(SIZE_GUARD_WORKFLOW, 'merge-group-size')).not.toContain(
      'secrets.'
    );
    expect(FORK_GATE_WORKFLOW).toContain(
      'Active native-queue required-context producer'
    );
    expect(SIZE_GUARD_WORKFLOW).toContain(
      'Active native-queue required-context producer'
    );
  });

  it('keeps secret-backed AI review manual and isolates PR head data', () => {
    const workflowHeader = CLAUDE_REVIEW_WORKFLOW.slice(
      0,
      CLAUDE_REVIEW_WORKFLOW.indexOf('\njobs:')
    );
    expect(workflowHeader).toMatch(/^  workflow_dispatch:\s*$/m);
    for (const automaticTrigger of [
      'schedule',
      'workflow_run',
      'issues',
      'issue_comment',
      'pull_request',
      'pull_request_target',
      'pull_request_review',
      'pull_request_review_comment',
    ]) {
      expect(workflowHeader).not.toMatch(
        new RegExp(`^  ${automaticTrigger}:\\s*$`, 'm')
      );
    }
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      "if: github.ref == 'refs/heads/main'"
    );
    expect(workflowHeader).toMatch(/^  pull-requests: read$/m);
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      'ref: ${{ steps.pr.outputs.base_sha }}'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('persist-credentials: false');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      'Fetch exact PR head as data only'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      '+refs/pull/$PR_NUMBER/head:$head_ref'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('permission-contents: read');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('permission-pull-requests: read');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('permission-pull-requests: write');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      '--allowedTools "Read,Glob,Grep,mcp__gbrain__query,mcp__gbrain__search"'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('--max-turns 8');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      '--mcp-config "${{ runner.temp }}/gbrain-mcp.json"'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      'BUNDLE_DIR="$GITHUB_WORKSPACE/.claude-review-input"'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      'GBRAIN_CONNECTION:"${GBRAIN_CONNECTION}"'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).not.toContain('--add-dir');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      'chmod 600 "$RUNNER_TEMP/gbrain-mcp.json"'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('Remove trusted review inputs');
    expect(CLAUDE_REVIEW_WORKFLOW).not.toMatch(/^\s+mcp_config:/m);
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('--json-schema');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain(
      'STRUCTURED_OUTPUT: ${{ steps.claude.outputs.structured_output }}'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('pull.head.sha !== expectedHead');
    expect(CLAUDE_REVIEW_WORKFLOW).toContain('github.rest.pulls.createReview');
    expect(CLAUDE_REVIEW_WORKFLOW).not.toContain(
      'github.rest.issues.createComment'
    );
    expect(CLAUDE_REVIEW_WORKFLOW).not.toContain('gh pr diff');
    expect(CLAUDE_REVIEW_WORKFLOW).not.toContain('github.event.pull_request');

    for (const workflowFile of readdirSync(
      resolve(REPO_ROOT, '.github/workflows')
    ).filter(file => file.endsWith('.yml') && file !== 'claude-review.yml')) {
      expect(
        readFileSync(
          resolve(REPO_ROOT, '.github/workflows', workflowFile),
          'utf8'
        ),
        workflowFile
      ).not.toContain('claude-review.yml');
    }
  });

  it('keeps workflow execution posture reporting post-merge and advisory', () => {
    const workflowHeader = SECURITY_WORKFLOW.slice(
      0,
      SECURITY_WORKFLOW.indexOf('\njobs:')
    );
    const posture = getJobBlock(
      SECURITY_WORKFLOW,
      'workflow-execution-posture'
    );

    expect(workflowHeader).not.toMatch(/^  pull_request:\s*$/m);
    expect(workflowHeader).not.toMatch(/^  merge_group:\s*$/m);
    expect(posture).toContain('continue-on-error: true');
    expect(posture).toContain('contents: read');
    expect(posture).toContain('persist-credentials: false');
    expect(posture).toContain(
      'node scripts/security/audit-workflow-execution.mjs'
    );
    expect(posture).not.toContain('secrets.');
  });

  it('reserves each exact required context for its active event producer', () => {
    const mergeReady = getJobBlock(CI_WORKFLOW, 'ci-merge-group-ready');
    const sourceReady = getJobBlock(CI_WORKFLOW, 'ci-pr-ready');
    expect(mergeReady).toContain(
      "name: ${{ github.event_name == 'merge_group' && 'PR Ready' || 'PR Ready (merge-group inactive)' }}"
    );
    expect(sourceReady).toContain(
      "name: ${{ github.event_name == 'pull_request' && 'PR Ready' || 'PR Ready (source inactive)' }}"
    );
    expect(CI_WORKFLOW).not.toMatch(/^ {4}name: PR Ready\s*$/m);

    const mergeSize = getJobBlock(SIZE_GUARD_WORKFLOW, 'merge-group-size');
    const sourceSize = getJobBlock(SIZE_GUARD_WORKFLOW, 'size');
    expect(mergeSize).toContain("'PR Size Guard (merge-group inactive)'");
    expect(sourceSize).toContain("'PR Size Guard (source inactive)'");
    expect(SIZE_GUARD_WORKFLOW).not.toMatch(/^ {4}name: PR Size Guard\s*$/m);

    const mergeFork = getJobBlock(FORK_GATE_WORKFLOW, 'merge-group-gate');
    expect(mergeFork).toContain("'Fork PR Gate (merge-group inactive)'");
    expect(getJobBlock(FORK_GATE_WORKFLOW, 'dependabot-gate')).toContain(
      'name: Fork PR Gate Dependabot Controller'
    );
    expect(getJobBlock(FORK_GATE_WORKFLOW, 'fork-gate')).toContain(
      'name: Fork PR Gate Controller'
    );
    expect(FORK_GATE_WORKFLOW).not.toMatch(/^ {4}name: Fork PR Gate\s*$/m);
    expect(FORK_GATE_WORKFLOW.match(/-f context="Fork PR Gate"/g)).toHaveLength(
      3
    );
  });
});

describe('resolveMergeGroupPathDiff coalesced heads (JOV-4905)', () => {
  const tempRoots = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function git(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(
        `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`
      );
    }
    return result.stdout.trim();
  }

  function writeAndCommit(cwd, relativePath, contents, message) {
    const absolutePath = join(cwd, relativePath);
    mkdirSync(join(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, contents);
    git(cwd, ['add', relativePath]);
    git(cwd, ['commit', '-q', '-m', message]);
    return git(cwd, ['rev-parse', 'HEAD']);
  }

  function createFixture() {
    const root = mkdtempSync(join(tmpdir(), 'jovie-path-diff-'));
    tempRoots.push(root);
    const origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    git(root, ['init', '--bare', '-q', origin]);
    git(root, ['init', '-q', '-b', 'main', seed]);
    git(seed, ['config', 'user.name', 'Path Diff Test']);
    git(seed, ['config', 'user.email', 'path-diff@example.invalid']);
    git(seed, ['config', 'commit.gpgsign', 'false']);
    git(seed, ['remote', 'add', 'origin', origin]);
    const rootSha = writeAndCommit(seed, 'README.md', 'root\n', 'root');
    return { root, origin, seed, rootSha };
  }

  it('uses the event-base three-dot range when it has files', () => {
    const { seed, rootSha } = createFixture();
    git(seed, ['switch', '-q', '-c', 'feature']);
    const headSha = writeAndCommit(
      seed,
      'apps/web/product.ts',
      'export const ready = true;\n',
      'add product'
    );

    const result = resolveMergeGroupPathDiff({
      git: createGitRunner(seed),
      eventBaseSha: rootSha,
      eventHeadSha: headSha,
      fetchLiveMain: false,
    });

    expect(result).toMatchObject({
      source: 'event_base',
      isNoop: false,
      files: ['apps/web/product.ts'],
      baseSha: rootSha,
      headSha,
    });
  });

  it('recomputes against live main when the event-base range is empty', () => {
    const { origin, seed, rootSha } = createFixture();
    git(seed, ['switch', '-q', '-c', 'feature']);
    const headSha = writeAndCommit(
      seed,
      'apps/web/product.ts',
      'export const ready = true;\n',
      'add product'
    );
    git(seed, ['push', '-q', 'origin', `${rootSha}:refs/heads/main`]);
    git(seed, ['push', '-q', 'origin', `${headSha}:refs/heads/feature`]);

    const work = join(seed, '..', 'work');
    git(seed, [
      'clone',
      '-q',
      '--branch',
      'feature',
      '--single-branch',
      origin,
      work,
    ]);
    git(work, ['config', 'user.name', 'Path Diff Test']);
    git(work, ['config', 'user.email', 'path-diff@example.invalid']);
    git(work, ['config', 'commit.gpgsign', 'false']);

    const result = resolveMergeGroupPathDiff({
      git: createGitRunner(work),
      eventBaseSha: headSha,
      eventHeadSha: headSha,
      fetchLiveMain: true,
    });

    expect(result).toMatchObject({
      source: 'live_main_merge_base',
      isNoop: false,
      files: ['apps/web/product.ts'],
      baseSha: rootSha,
      headSha,
    });
    expect(formatMetaEnv(result)).toContain(`PATH_DIFF_BASE_SHA=${rootSha}`);
    expect(formatMetaEnv(result)).toContain(`PATH_DIFF_HEAD_SHA=${headSha}`);
  });

  it('treats a valid empty live-main range as a typed no-op', () => {
    const { seed, rootSha } = createFixture();
    git(seed, ['push', '-q', 'origin', 'HEAD:refs/heads/main']);

    const result = resolveMergeGroupPathDiff({
      git: createGitRunner(seed),
      eventBaseSha: rootSha,
      eventHeadSha: rootSha,
      fetchLiveMain: true,
    });

    expect(result.isNoop).toBe(true);
    expect(result.source).toBe('noop');
    expect(result.files).toEqual([]);
    expect(result.headSha).toBe(rootSha);
  });

  it('falls back to live main when the event base is missing from the local graph', () => {
    const { seed, rootSha } = createFixture();
    git(seed, ['switch', '-q', '-c', 'feature']);
    const headSha = writeAndCommit(
      seed,
      'apps/web/product.ts',
      'export const ready = true;\n',
      'add product'
    );
    git(seed, ['push', '-q', 'origin', `${rootSha}:refs/heads/main`]);
    git(seed, ['push', '-q', 'origin', `${headSha}:refs/heads/feature`]);
    const missingBase = 'cd'.repeat(20);

    const result = resolveMergeGroupPathDiff({
      git: createGitRunner(seed),
      eventBaseSha: missingBase,
      eventHeadSha: headSha,
      fetchLiveMain: true,
    });

    expect(result).toMatchObject({
      source: 'live_main_merge_base',
      isNoop: false,
      files: ['apps/web/product.ts'],
      headSha,
    });
  });

  it('does not hard-fail when live main cannot be fetched after an empty event diff', () => {
    const { seed, rootSha } = createFixture();
    git(seed, ['remote', 'remove', 'origin']);

    const result = resolveMergeGroupPathDiff({
      git: createGitRunner(seed),
      eventBaseSha: rootSha,
      eventHeadSha: rootSha,
      fetchLiveMain: true,
    });

    expect(result.isNoop).toBe(true);
    expect(result.source).toBe('noop');
    expect(result.files).toEqual([]);
    expect(result.notice).toMatch(/Live refs\/heads\/main was unavailable/);
  });

  it('fails closed when the merge_group head is not a valid tree', () => {
    const { seed, rootSha } = createFixture();
    const missingHead = 'ab'.repeat(20);

    expect(() =>
      resolveMergeGroupPathDiff({
        git: createGitRunner(seed),
        eventBaseSha: rootSha,
        eventHeadSha: missingHead,
        fetchLiveMain: false,
      })
    ).toThrow(/is not a valid tree/);
  });
});
