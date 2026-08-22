import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateVerificationBoundary,
  PUBLICATION_GATES,
  REMOTE_DRAFT_GATES,
} from '../draft-verification-boundary.mjs';
import {
  DEFAULT_POLICY_GATES,
  validatePolicyGates,
} from '../policy-gate-liveness.mjs';
import {
  emptyRollingCiState,
  MAX_REPAIR_DELIVERIES,
  normalizeFailureEvents,
  planFailureDispatch,
  planGreenRecovery,
} from '../rolling-ci-dispatch.mjs';
import {
  claimSingleWriter,
  FX_ADAPTER_NAME,
  HANDOFF_SCHEMA,
  resolveRemediationRoute,
} from '../rolling-ci-handoff.mjs';
import {
  evaluateImplementerPickupEnd,
  evaluateReadyLanding,
  staleWorkReceipt,
  timeToFirstCiReceipt,
} from '../rolling-ci-pipeline.mjs';

const head = 'a'.repeat(40);
const nextHead = 'b'.repeat(40);
const read = path =>
  readFileSync(resolve(import.meta.dirname, '../../..', path), 'utf8');
const green = names => Object.fromEntries(names.map(name => [name, 'success']));
const failure = normalizeFailureEvents({
  repository: 'JovieInc/Jovie',
  prNumber: 5271,
  headSha: head,
  workflowRunId: 9001,
  workflowRunAttempt: 1,
  failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
  source: {
    eventName: 'workflow_run',
    workflow: 'CI',
    producerEvent: 'pull_request',
    trustedPolicyRef: 'main',
    workflowPath: '.github/workflows/ci.yml',
  },
  checkSuiteId: 44,
})[0];
const identity = {
  repository: 'JovieInc/Jovie',
  pr: 5271,
  head,
  fingerprint: failure.fingerprint,
};
const fxAdapter = { name: FX_ADAPTER_NAME, authConfigured: true };
const checks = {
  tests: 'success',
  coverage: 'success',
  security: 'success',
  policy: 'success',
};

function plan(event, extra = {}) {
  return planFailureDispatch({
    event,
    liveHead: extra.liveHead ?? head,
    writer: extra.writer ?? 'tim',
    priorState: extra.priorState,
  });
}

function attempted(attempt, runId = 9000 + attempt) {
  return {
    ...failure,
    attempt,
    workflowRunId: String(runId),
    delivery: `${runId}:${attempt}:${failure.fingerprint}`,
  };
}

describe('draft-first rolling CI pipeline', () => {
  it('deliberate red: local affected failure cannot deadlock publication', () => {
    const result = evaluateVerificationBoundary({
      localEvidence: { ...green(PUBLICATION_GATES), affectedTests: 'failure' },
      remoteEvidence: {
        ...green(REMOTE_DRAFT_GATES),
        affectedTests: 'failure',
      },
      publishedHead: head,
      liveHead: head,
    });
    expect(result.publicationGreen).toBe(true);
    expect(result.promotionGreen).toBe(false);
    expect(resolveRemediationRoute({ implementer: 'tim', fxAdapter })).toEqual({
      route: 'implementer',
      writer: 'tim',
    });
  });

  it('deliberate red: stale, duplicate, competing writer, supersede, retry, recovery', () => {
    expect(
      staleWorkReceipt({
        pr: 5271,
        eventHead: head,
        liveHead: nextHead,
        fingerprint: failure.fingerprint,
      })
    ).toMatchObject({ action: 'reject_stale_head', stale: true });
    expect(plan(failure, { liveHead: nextHead })).toMatchObject({
      action: 'reject_stale_head',
      mutate: false,
    });
    const first = plan(failure);
    expect(plan(failure, { priorState: first.state })).toMatchObject({
      action: 'deduplicate_delivery',
      mutate: false,
    });
    const owned = claimSingleWriter({
      writer: 'implementer',
      identity,
      liveHead: head,
    });
    expect(
      claimSingleWriter({
        existingClaim: owned.claim,
        writer: FX_ADAPTER_NAME,
        identity,
        liveHead: head,
      }).action
    ).toBe('reject_competing_writer');
    expect(
      plan(
        { ...attempted(1, 9002), head: nextHead },
        { liveHead: nextHead, priorState: first.state }
      )
    ).toMatchObject({ action: 'dispatch_superseding_head' });
    let state = emptyRollingCiState(head);
    for (let attempt = 1; attempt <= MAX_REPAIR_DELIVERIES; attempt += 1) {
      const next = plan(attempted(attempt), { priorState: state });
      expect(next.mutate).toBe(true);
      state = next.state;
    }
    expect(plan(attempted(4, 9010), { priorState: state })).toMatchObject({
      action: 'terminal_configuration_incident',
      mutate: false,
    });
    expect(
      planGreenRecovery({
        headSha: head,
        liveHead: head,
        priorState: first.state,
      })
    ).toMatchObject({ action: 'supersede_repairs_green', mutate: true });
  });

  it('requires an explicit current-head handoff before pickup ends', () => {
    const receipt = {
      schema: HANDOFF_SCHEMA,
      pr: 5271,
      head,
      status: 'active',
      leaseExpiresAt: '2026-08-22T03:00:00Z',
      acceptanceCriteria: ['exact-head green'],
      remainingChecks: ['Unit Tests'],
      failureFingerprints: [failure.fingerprint],
      remediationOwner: 'implementer',
    };
    expect(
      evaluateImplementerPickupEnd({ liveHead: head, fxAdapter })
    ).toMatchObject({
      action: 'require_handoff_receipt',
    });
    expect(
      evaluateImplementerPickupEnd({
        receipt,
        liveHead: head,
        fxAdapter,
        now: '2026-08-22T01:00:00Z',
      }).action
    ).toBe('pickup_still_active');
    expect(
      evaluateImplementerPickupEnd({
        receipt: { ...receipt, status: 'handed-off' },
        liveHead: head,
        fxAdapter,
      })
    ).toMatchObject({ action: 'fx', route: { writer: FX_ADAPTER_NAME } });
  });

  it('deliberate red: main advance cannot recurse source checks; merge_group owns latest-main proof', () => {
    const observedBase = 'c'.repeat(40);
    const latestMain = 'd'.repeat(40);
    const combinedHead = 'e'.repeat(40);
    expect(
      evaluateReadyLanding({
        publishedHead: head,
        liveHead: head,
        observedBase,
        liveMain: latestMain,
        checks: { ...checks, coverage: 'failure' },
      }).reason
    ).toBe('missing-coverage');
    expect(
      evaluateReadyLanding({
        publishedHead: head,
        liveHead: nextHead,
        observedBase,
        liveMain: latestMain,
        checks,
      }).reason
    ).toBe('stale-head');
    expect(
      evaluateReadyLanding({
        publishedHead: head,
        liveHead: head,
        observedBase,
        liveMain: latestMain,
        checks,
      })
    ).toEqual({
      ok: true,
      reason: 'source-head-qualified-for-queue',
      baseAdvanced: true,
    });
    expect(
      evaluateReadyLanding({
        stage: 'merge-group',
        combinedHead,
        checkedCombinedHead: combinedHead,
        latestMainIncluded: false,
        checks: { ...checks, combined: 'success' },
      }).reason
    ).toBe('latest-main-not-proven');
    expect(
      evaluateReadyLanding({
        stage: 'merge-group',
        combinedHead,
        checkedCombinedHead: nextHead,
        latestMainIncluded: true,
        checks: { ...checks, combined: 'success' },
      }).reason
    ).toBe('stale-combined-head');
    expect(
      evaluateReadyLanding({
        stage: 'merge-group',
        combinedHead,
        checkedCombinedHead: combinedHead,
        latestMainIncluded: true,
        checks: { ...checks, combined: 'failure' },
      }).reason
    ).toBe('missing-combined');
    expect(
      evaluateReadyLanding({
        stage: 'merge-group',
        combinedHead,
        checkedCombinedHead: combinedHead,
        latestMainIncluded: true,
        checks: { ...checks, combined: 'success' },
      })
    ).toEqual({ ok: true, reason: 'merge-group-qualified-for-landing' });
  });

  it('records time-to-first-CI', () => {
    expect(
      timeToFirstCiReceipt({
        pr: 5271,
        head,
        publishedAt: '2026-08-22T00:18:58Z',
        firstCheckStartedAt: '2026-08-22T00:19:11Z',
      }).secondsToFirstCi
    ).toBe(13);
  });
});

describe('bootstrap-safe policy gates', () => {
  it('rejects CI-before-draft, blocking advisory, and cycles', () => {
    expect(validatePolicyGates()).toEqual({ ok: true, errors: [] });
    const policy = structuredClone(DEFAULT_POLICY_GATES);
    policy.gates.find(gate => gate.id === 'hook-policy').requires = [
      'exact-head-ci',
    ];
    expect(validatePolicyGates(policy).errors).toContain(
      'hook-policy: exact-head-ci is not available before draft-publication'
    );
    policy.gates.find(gate => gate.id === 'branch-recommendation').mode =
      'blocking';
    expect(validatePolicyGates(policy).errors).toContain(
      'branch-recommendation: blocker is not allowlisted for draft-publication'
    );
    policy.gates.push(
      {
        id: 'A',
        transition: 'fast-ci',
        mode: 'advisory',
        requires: ['github-pr-metadata'],
        dependsOn: ['B'],
      },
      {
        id: 'B',
        transition: 'remediation',
        mode: 'advisory',
        requires: ['exact-head-ci'],
        dependsOn: ['A'],
      }
    );
    expect(validatePolicyGates(policy).errors).toContain(
      'policy cycle detected at A'
    );
  });
});

describe('draft-first rolling CI policy wiring', () => {
  it('deliberate red: requires exact-head coverage before source or merge promotion', () => {
    expect(read('AGENTS.md')).toContain(
      'publish the first coherent commit as a draft'
    );
    const flow = read('docs/PR_FLOW.md');
    for (const text of [
      'JOVIE_PUSH_PHASE=publication git push',
      'Per-PR concurrency cancels superseded runs',
      'stale or duplicate deliveries are rejected',
      'One remediation writer holds the PR lease',
      'FX is the recovery tier',
      'final exact, current head',
      'PR #16336',
    ]) {
      expect(flow).toContain(text);
    }
    expect(flow).toMatch(/Moving on requires an explicit handoff\s+receipt/);
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toContain(
      'git diff --name-only "origin/${{ github.base_ref }}...HEAD"'
    );
    const coverage = workflow.slice(
      workflow.indexOf('  ci-exact-head-coverage:'),
      workflow.indexOf('  ci-a11y:')
    );
    expect(coverage).toContain("github.event_name == 'pull_request'");
    expect(coverage).toContain("github.event_name == 'merge_group'");
    expect(coverage).toContain('github.event.pull_request.head.sha');
    expect(coverage).toContain('github.event.merge_group.head_sha');
    expect(coverage).toContain(
      'test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"'
    );
    expect(coverage).toContain('has_web_coverage_changes');
    expect(coverage).toContain('pnpm --filter @jovie/web test:coverage');
    expect(coverage).toContain('scripts/check-changed-test-coverage.mjs');
    expect(coverage).toContain(String.raw`--base \"\$COVERAGE_BASE\"`);
    expect(coverage).toContain(String.raw`--head \"\$EXPECTED_HEAD\"`);
    expect(coverage).not.toContain('test:coverage:diff');
    expect(coverage).not.toContain('exact-head-coverage-baseline.json');
    expect(coverage).toContain("trap 'stop_coverage; exit 143' TERM");
    expect(coverage).not.toContain('secrets.CODECOV_TOKEN');
    const mergeReady = workflow.slice(
      workflow.indexOf('  ci-merge-group-ready:'),
      workflow.indexOf('  ci-pr-ready:')
    );
    const sourceReady = workflow.slice(
      workflow.indexOf('  ci-pr-ready:'),
      workflow.indexOf('  ci-summary:')
    );
    for (const aggregate of [mergeReady, sourceReady]) {
      expect(aggregate).toContain('ci-exact-head-coverage');
      expect(aggregate).toContain('needs.ci-exact-head-coverage.result');
    }
    expect(mergeReady).toContain('Exact-head Coverage:$COVERAGE_RESULT');
    expect(sourceReady).toContain('COVERAGE_RESULT" != "success"');
    expect(read('.husky/pre-push')).toContain('JOVIE_PUSH_PHASE:-publication');
    const publication = read('scripts/hooks/pre-push-gate.sh')
      .split('run_publication() {', 2)[1]
      .split('\n}', 1)[0];
    expect(publication).not.toMatch(
      /automation-verify|run_affected|typecheck|biome|coverage/
    );
  });
});
