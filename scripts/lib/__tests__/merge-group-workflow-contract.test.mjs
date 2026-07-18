import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
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

describe('merge_group workflow contract', () => {
  it('models a checks_requested combined-head event', () => {
    expect(EVENT.action).toBe('checks_requested');
    expect(EVENT.merge_group.base_ref).toBe('refs/heads/main');
    expect(EVENT.merge_group.base_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(EVENT.merge_group.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(EVENT.merge_group.head_ref).toContain('gh-readonly-queue/main/');
  });

  it('runs CI against the synthetic base-to-head diff without Graphite optimization', () => {
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
    expect(CI_WORKFLOW).toContain(
      "if: github.event_name != 'merge_group' && steps.graphite-token.outputs.configured == 'true'"
    );
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
    expect(aggregate).toContain('ci-build-public');
    expect(aggregate).toContain('ci-layout-guard');
    expect(aggregate).toContain('BUILD_HAS_ARTIFACT');
    expect(aggregate).toContain(
      'Layout Guard legitimately skipped because no shared build artifact was required.'
    );
    expect(aggregate).toContain(
      'Unit Tests legitimately skipped because path detection selected no test-relevant files.'
    );
    expect(aggregate).toContain(
      'RUN_TEST="${{ needs.ci-path-changes.outputs.run_test }}"'
    );
    expect(sourceAggregate).not.toContain(
      'RUN_TEST="${{ needs.ci-path-changes.outputs.run_test }}"'
    );
    expect(sourceAggregate).toContain(
      'Source PR unit tests are intentionally deferred to the merge-group combined head.'
    );
    expect(unitTests).toContain(
      "needs.ci-path-changes.outputs.run_test == 'true'"
    );
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
      'ci-build-public',
      'ci-unit-tests',
      'ci-layout-guard',
    ]) {
      expect(getJobBlock(CI_WORKFLOW, job)).toContain(
        "github.event_name == 'merge_group'"
      );
    }
    expect(getJobBlock(CI_WORKFLOW, 'drizzle-migration-guard')).toContain(
      'name: Migration Guard'
    );
    const layoutGuard = getJobBlock(CI_WORKFLOW, 'ci-layout-guard');
    expect(layoutGuard).toContain('Require combined-head build artifact');
    expect(layoutGuard).toContain(
      "github.event_name == 'merge_group' && steps.download.outcome != 'success'"
    );
    expect(getJobBlock(CI_WORKFLOW, 'ci-a11y')).not.toContain(
      "github.event_name == 'merge_group'"
    );
    expect(aggregate).toContain(
      'Source-PR A11y evidence is inherited; merge groups do not provision Neon.'
    );
  });

  it('requires one diff-scoped secret scan on source and combined heads', () => {
    const secret = getJobBlock(CI_WORKFLOW, 'ci-secret-scan');
    const mergeReady = getJobBlock(CI_WORKFLOW, 'ci-merge-group-ready');
    const sourceReady = getJobBlock(CI_WORKFLOW, 'ci-pr-ready');
    expect(secret).not.toContain('needs: [ci-path-changes]');
    expect(secret).toContain(
      "github.event_name == 'pull_request' || github.event_name == 'merge_group'"
    );
    expect(secret).toContain('github.event.merge_group.base_sha');
    for (const aggregate of [mergeReady, sourceReady]) {
      expect(aggregate).toContain('ci-secret-scan');
      expect(aggregate).toContain('Secret Scan');
    }
    expect(sourceReady).toContain(
      "if: ${{ always() && github.event_name == 'pull_request'"
    );
    expect(sourceReady).toContain(
      'Unverified Graphite reuse reached PR Ready instead of exact-head gates.'
    );
    expect(SECURITY_WORKFLOW).not.toMatch(/^\s*pull_request:/m);
  });

  it('keeps merge groups out of PR-only and deployment jobs', () => {
    expect(getJobBlock(CI_WORKFLOW, 'neon-db')).toContain(
      "github.event_name == 'push' || (github.event_name == 'pull_request'"
    );
    expect(getJobBlock(CI_WORKFLOW, 'ci-pr-vercel-preview')).toContain(
      "github.event_name == 'pull_request'"
    );
    expect(getJobBlock(CI_WORKFLOW, 'ci-summary')).toContain(
      "github.event_name == 'pull_request'"
    );

    for (const job of ['deploy-gate', 'deploy-staging']) {
      const block = getJobBlock(CI_WORKFLOW, job);
      expect(block).toContain("github.event_name == 'push'");
      expect(block).toContain("github.ref == 'refs/heads/main'");
    }

    const promotion = getJobBlock(CI_WORKFLOW, 'promote-production');
    expect(promotion).toContain(
      'needs: [deploy-staging, canary-health-gate, alias-staging]'
    );
    expect(promotion).toContain("needs.deploy-staging.result == 'success'");

    for (const job of [
      'canary-health-gate',
      'alias-staging',
      'promote-production',
    ]) {
      expect(getJobBlock(CI_WORKFLOW, job)).toContain(
        "needs.deploy-staging.result == 'success'"
      );
    }

    const deployNotify = getJobBlock(CI_WORKFLOW, 'deploy-notify');
    expect(deployNotify).toContain("github.event_name == 'push'");
    expect(deployNotify).toContain("github.ref == 'refs/heads/main'");
  });

  it('allocates review-event fork-gate runners only for approved main-bound forks', () => {
    const controller = getJobBlock(FORK_GATE_WORKFLOW, 'fork-gate');
    const jobCondition = controller.match(
      /^    if: >-\n([\s\S]*?)^    runs-on:/m
    )?.[1];
    expect(jobCondition).toBeTruthy();
    for (const requirement of [
      "github.event_name == 'pull_request_review'",
      "github.event.pull_request.base.ref == 'main'",
      'github.event.pull_request.head.repo.fork == true',
      "github.event.review.state == 'approved'",
      "github.event.review.user.type != 'Bot'",
    ]) {
      expect(jobCondition).toContain(requirement);
    }
  });

  it('emits the metadata-only required contexts on the combined head', () => {
    expect(FORK_GATE_WORKFLOW).toMatch(
      /merge_group:\n\s+types: \[checks_requested\]/
    );
    const forkGate = getJobBlock(FORK_GATE_WORKFLOW, 'merge-group-gate');
    expect(forkGate).toContain(
      "github.event_name == 'merge_group' && 'Fork PR Gate'"
    );
    expect(forkGate).toContain("github.event_name == 'merge_group'");
    expect(forkGate).not.toContain('github.event.pull_request');

    expect(SIZE_GUARD_WORKFLOW).toMatch(
      /merge_group:\n\s+types: \[checks_requested\]/
    );
    const sizeGuard = getJobBlock(SIZE_GUARD_WORKFLOW, 'merge-group-size');
    expect(sizeGuard).toContain(
      "github.event_name == 'merge_group' && 'PR Size Guard'"
    );
    expect(sizeGuard).toContain("github.event_name == 'merge_group'");
    expect(sizeGuard).not.toContain('github.event.pull_request');
    expect(getJobBlock(SIZE_GUARD_WORKFLOW, 'size')).toContain(
      "github.event_name == 'pull_request'"
    );
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
