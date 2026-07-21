import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('merge_group workflow contract', () => {
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
      'git diff --name-only "$MERGE_GROUP_BASE_SHA...$MERGE_GROUP_HEAD_SHA"'
    );
    expect(CI_WORKFLOW).not.toContain('withgraphite/graphite-ci-action');
    expect(CI_WORKFLOW).not.toContain('steps.graphite');
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
    expect(units).toContain('max-parallel: 5');
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

    for (const jobId of [
      'ci-fast',
      'ci-unit-tests',
      'ci-build-layout',
      'ci-ios',
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
    expect(ciFast).toContain("github.event_name != 'merge_group'");
    const units = getJobBlock(CI_WORKFLOW, 'ci-unit-tests');
    expect(units).not.toContain('ci-unit-runner-route');
    expect(units).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    expect(buildLayout).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'"
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
    expect(aggregate).toContain('ci-promptfoo-evals');
    expect(aggregate).toContain('ci-golden-eval-set');
    expect(aggregate).toContain('drizzle-migration-guard');
    expect(aggregate).toContain('BUILD_LAYOUT_RESULT');
    expect(aggregate).toContain('RUN_PROMPTFOO');
    expect(aggregate).toContain('RUN_GOLDEN_EVAL');
    expect(aggregate).toContain('Five affected Unit Test shards did not pass');
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
    expect(unitTests).toContain('run: echo "run_full_ci=true"');
    expect(unitTests).toContain("github.event_name == 'merge_group'");
    expect(unitTests).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    expect(unitTests).toContain("github.event_name == 'workflow_dispatch'");
    expect(unitTests).not.toContain("github.event_name == 'pull_request'");
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
    expect(unitTests).toContain("shard: ['1/5', '2/5', '3/5', '4/5', '5/5']");
    expect(unitTests).toContain('max-parallel: 5');
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
      "needs.authorize-production.outputs.authorized == 'true'"
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
    expect(resolve).toContain('.meta.githubCommitSha // .gitSource.sha');
    expect(resolve).toContain('[ "$deployment_state" != "READY" ]');
    expect(resolve).toContain('[ "$deployment_target" != "production" ]');
    expect(resolve).toContain(
      '^https://jovie-[a-z0-9-]+-jovie\\.vercel\\.app$'
    );
    expect(resolve).toContain('resolve-deployment');
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
      'ci-promptfoo-evals',
      'ci-golden-eval-set',
      'ci-secret-scan',
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
      'visual-approval-guard.yml',
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
