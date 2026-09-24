import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  attestGemService,
  buildDeliveryReceipt,
  collectDeploymentInvestigation,
  DELIVERY_RECEIPT_SCHEMA,
  PR_LIFECYCLE_POLICY_DIGEST,
  persistClosureHealthActions,
  persistDeliveryOutcome,
  persistDeploymentInvestigation,
  reconcileDeliveryHeartbeat,
  transitionDeliveryReceipt,
} from '../delivery-state-machine.mjs';

const HEAD = 'a'.repeat(40);
const REPO = 'JovieInc/Jovie';

describe('failed deployment event ingress', () => {
  const failedDeploy = (attempt = 1) => ({
    action: 'completed',
    repository: { full_name: REPO },
    workflow_run: {
      id: 35923560063,
      run_attempt: attempt,
      name: `Production Controller ${HEAD} from CI 35923443093 attempt 1`,
      path: '.github/workflows/production-controller.yml',
      head_sha: HEAD,
      head_branch: 'main',
      status: 'completed',
      conclusion: 'failure',
      html_url: 'https://github.com/JovieInc/Jovie/actions/runs/35923560063',
    },
  });

  it('routes a failed release by workflow path rather than its dynamic run title', () => {
    const receipt = buildDeliveryReceipt(failedDeploy());
    assert.equal(receipt.event.failure, 'production-controller-failed');
    assert.equal(receipt.event.workflow, 'Production Controller');
    assert.equal(receipt.stage, 'repair-pending');
    assert.equal(receipt.next.owner, 'gem');
    assert.equal(
      receipt.next.action,
      'investigate-failed-production-controller'
    );
    assert.equal(receipt.event.evidence.workflowRun.id, 35923560063);
    assert.equal(receipt.event.evidence.workflowRun.attempt, 1);
    assert.notEqual(
      receipt.receiptKey,
      buildDeliveryReceipt(failedDeploy(2)).receiptKey
    );
    assert.equal(
      receipt.receiptKey,
      buildDeliveryReceipt(failedDeploy()).receiptKey
    );
  });

  it('rejects incomplete release identities and does not turn success into repair', () => {
    for (const invalid of [
      { id: 0 },
      { run_attempt: 0 },
      { head_sha: 'short' },
      { head_branch: 'feature' },
      { status: 'in_progress' },
    ]) {
      const event = failedDeploy();
      Object.assign(event.workflow_run, invalid);
      assert.throws(
        () => buildDeliveryReceipt(event),
        /exact completed main run attempt/
      );
    }
    const success = failedDeploy();
    success.workflow_run.conclusion = 'success';
    assert.equal(buildDeliveryReceipt(success).stage, 'received');
    const timeout = failedDeploy();
    timeout.workflow_run.conclusion = 'timed_out';
    assert.equal(
      buildDeliveryReceipt(timeout).event.failure,
      'production-controller-failed'
    );
    const cancelled = failedDeploy();
    cancelled.workflow_run.conclusion = 'cancelled';
    assert.equal(
      buildDeliveryReceipt(cancelled).event.failure,
      'dropped-controller-event'
    );
  });

  it('persists a replay-safe repair receipt through the real event CLI', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'delivery-linked-'));
    try {
      const entrypoint = new URL(
        '../delivery-state-machine.mjs',
        import.meta.url
      ).pathname;
      const input = join(directory, 'event.json');
      await writeFile(input, JSON.stringify(failedDeploy()));
      const args = [
        entrypoint,
        `--event-file=${input}`,
        `--state-dir=${directory}`,
      ];
      const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
      assert.equal(first.status, 0, first.stderr);
      assert.notEqual(
        first.stdout.trim(),
        '',
        'successful ingress must emit its persisted receipt'
      );
      const result = JSON.parse(first.stdout);
      assert.equal(
        result.task.action,
        'investigate-failed-production-controller'
      );
      assert.equal(result.task.evidence.workflowRun.id, 35923560063);
      const replay = spawnSync(process.execPath, args, { encoding: 'utf8' });
      assert.equal(replay.status, 0, replay.stderr);
      assert.equal(JSON.parse(replay.stdout).task.taskKey, result.task.taskKey);
      assert.equal((await readdir(join(directory, 'repair-tasks'))).length, 1);
      const bad = spawnSync(
        process.execPath,
        [entrypoint, '--event-file=/missing-event.json'],
        { encoding: 'utf8' }
      );
      assert.equal(bad.status, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
const LYB_REPO = 'JovieInc/LogYourBody';
const CROSS_RUNTIME_LIFECYCLE_KEY =
  '5a34f15f28cdfed416aa498dd84fdf5d048f68f9f183f782c1a2b95800f28c52';

function canonicalDigest(value) {
  const canonicalize = candidate => {
    if (Array.isArray(candidate)) return candidate.map(canonicalize);
    if (!candidate || typeof candidate !== 'object') return candidate;
    return Object.fromEntries(
      Object.keys(candidate)
        .sort()
        .map(key => [key, canonicalize(candidate[key])])
    );
  };
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function lifecycleAction(overrides = {}) {
  const pr = overrides.pr ?? 17001;
  const sourceState = overrides.sourceState ?? 'repair';
  const terminal = overrides.terminal ?? false;
  const action = {
    schema: 'jovie-pr-lifecycle-action/v1',
    repository: REPO,
    inventoryIndex: overrides.inventoryIndex ?? 0,
    pr,
    headSha: overrides.headSha === undefined ? HEAD : overrides.headSha,
    issue: null,
    lifecycleKey: `${REPO}:pr:${pr}`,
    disposition: terminal ? 'terminal' : 'active-remediation',
    sourceState,
    owner: overrides.owner ?? 'symphony',
    writer: overrides.writer ?? overrides.owner ?? 'symphony',
    action: overrides.action ?? 'create-bounded-ci-repair-pr',
    reason: overrides.reason ?? 'required-checks-not-green',
    terminal,
    observedAt: overrides.observedAt ?? '2026-09-06T12:00:00.000Z',
    externalMutations: 0,
  };
  const identity = { ...action };
  delete identity.schema;
  delete identity.lifecycleKey;
  delete identity.observedAt;
  delete identity.externalMutations;
  if (pr) delete identity.inventoryIndex;
  return {
    ...action,
    actionKey: overrides.actionKey ?? canonicalDigest(identity),
  };
}

describe('delivery state machine', () => {
  it('matches the Python canonical lifecycle action digest', () => {
    assert.equal(lifecycleAction().actionKey, CROSS_RUNTIME_LIFECYCLE_KEY);
  });

  it('turns every machine-owned failure into one bounded repair route', () => {
    for (const [failure, action] of [
      ['workflow-cancelled', 'reconcile-cancelled-workflow'],
      ['queue-noop', 'reconcile-exact-head-queue-admission'],
      ['ci-failed', 'create-bounded-ci-repair-pr'],
      ['ci-failed-after-handoff', 'repair-current-pr-exact-head'],
      ['fx-auth-missing', 'restore-fx-adapter-authentication'],
      ['lease-ambiguous', 'reconcile-exact-head-lease'],
      ['stale-config', 'reload-and-attest-controller-service'],
      ['missing-trigger', 'restore-event-trigger-and-reconcile'],
      ['size-guard', 'split-source-aligned-size-guard'],
      ['missing-failing-checks', 'create-bounded-ci-repair-pr'],
      ['stale-conflicted-head', 'exact-head-branch-update'],
      ['queue-eviction', 'reconcile-exact-head-queue-admission'],
      ['provider-unavailable', 'restore-provider-availability'],
      ['missing-owner-lease', 'reconcile-exact-head-lease'],
      ['dropped-controller-event', 'restore-event-trigger-and-reconcile'],
      ['draft-stack-policy', 'split-or-retarget-draft-stack'],
      ['fleet-observation-gap', 'restore-fleet-observation'],
      ['base-not-main', 'retarget-pr-base-to-main'],
    ]) {
      const receipt = buildDeliveryReceipt({ delivery_key: failure, failure });
      assert.equal(receipt.schema, DELIVERY_RECEIPT_SCHEMA);
      assert.equal(receipt.stage, 'repair-pending');
      assert.equal(receipt.next.action, action);
      assert.equal(receipt.next.mode, 'automated');
      assert.equal(receipt.externalMutations, 0);
      assert.equal(receipt.policy.digest, PR_LIFECYCLE_POLICY_DIGEST);
    }
  });

  it('requires exactly one explicit human action for a true external block', () => {
    assert.throws(
      () =>
        buildDeliveryReceipt({
          delivery_key: 'external',
          failure: 'external-blocked',
        }),
      /exactly one external action/
    );
    const receipt = buildDeliveryReceipt({
      delivery_key: 'external',
      failure: 'external-blocked',
      external_action: 'approve the required production permission',
    });
    assert.equal(receipt.stage, 'external-blocked');
    assert.equal(receipt.terminal, true);
    assert.equal(receipt.next.owner, 'human');
  });

  it('makes duplicate delivery idempotent and cannot mint a second repair task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-state-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'queue-cancelled-1',
        failure: 'workflow-cancelled',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const [first, duplicate] = await Promise.all([
        persistDeliveryOutcome(receipt, { stateDir: directory }),
        persistDeliveryOutcome(receipt, { stateDir: directory }),
      ]);
      assert.deepEqual(
        new Set([first.status, duplicate.status]),
        new Set(['created', 'duplicate'])
      );
      assert.equal(first.task.taskKey, duplicate.task.taskKey);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps CI/queue races pending until an exact-head event advances them', () => {
    const received = buildDeliveryReceipt({
      delivery_key: 'ci-1',
      pr_number: 16019,
      head_sha: HEAD,
    });
    const pending = transitionDeliveryReceipt(received, {
      stage: 'queue-pending',
      event: 'ci-completed',
    });
    const queued = transitionDeliveryReceipt(pending, {
      stage: 'queued',
      event: 'native-queue-confirmed',
    });
    assert.equal(pending.terminal, false);
    assert.equal(queued.stage, 'queued');
    assert.equal(queued.event.headSha, HEAD);
  });

  it('refuses a production claim without a matching exact deployed SHA', () => {
    const receipt = buildDeliveryReceipt({
      delivery_key: 'deploy-1',
      pr_number: 16019,
      head_sha: HEAD,
    });
    assert.throws(
      () =>
        transitionDeliveryReceipt(receipt, {
          stage: 'production-proven',
          deployedSha: 'b'.repeat(40),
        }),
      /exact deployed SHA/
    );
    const proven = transitionDeliveryReceipt(receipt, {
      stage: 'production-proven',
      deployedSha: HEAD,
    });
    assert.equal(proven.terminal, true);
  });

  it('classifies a failed queue workflow as a queue reconciliation task', () => {
    const receipt = buildDeliveryReceipt({
      workflow_run: {
        id: 99,
        conclusion: 'failure',
        name: 'Merge Queue Auto-Enroll',
      },
    });
    assert.equal(receipt.event.failure, 'queue-noop');
    assert.equal(receipt.next.owner, 'gem');
  });

  it('includes repository identity in delivery receipt keys', () => {
    const jovie = buildDeliveryReceipt({
      repository: REPO,
      delivery_key: 'queue-eviction-42',
      failure: 'queue-noop',
      pr_number: 42,
      head_sha: HEAD,
    });
    const logYourBody = buildDeliveryReceipt({
      repository: LYB_REPO,
      delivery_key: 'queue-eviction-42',
      failure: 'queue-noop',
      pr_number: 42,
      head_sha: HEAD,
    });
    assert.equal(jovie.event.repository, REPO);
    assert.equal(logYourBody.event.repository, LYB_REPO);
    assert.notEqual(jovie.receiptKey, logYourBody.receiptKey);
  });

  it('classifies a suppressed product PR queue failure dispatch as exact-head queue repair', () => {
    const receipt = buildDeliveryReceipt({
      action: 'delivery-control-failure',
      client_payload: {
        source: 'merge-queue-autoenroll',
        event: 'suppressed-product-pr-check-failure',
        failure: 'queue-noop',
        delivery_key: `merge-queue-autoenroll:99:1:16376:${HEAD}:3`,
        pr_number: 16376,
        head_sha: HEAD,
        evidence: {
          workflow: 'Merge Queue Auto-Enroll',
          exit_code: '3',
        },
      },
    });

    assert.equal(receipt.event.failure, 'queue-noop');
    assert.equal(receipt.event.pr, 16376);
    assert.equal(receipt.event.headSha, HEAD);
    assert.equal(receipt.next.action, 'reconcile-exact-head-queue-admission');
  });

  it('classifies a suppressed non-queue product PR drain failure as a dropped controller event', () => {
    const receipt = buildDeliveryReceipt({
      action: 'delivery-control-failure',
      client_payload: {
        source: 'merge-queue-autoenroll',
        event: 'suppressed-product-pr-check-failure',
        failure: 'dropped-controller-event',
        delivery_key: `merge-queue-autoenroll:99:1:16376:${HEAD}:1`,
        pr_number: 16376,
        head_sha: HEAD,
        evidence: {
          workflow: 'Merge Queue Auto-Enroll',
          exit_code: '1',
        },
      },
    });

    assert.equal(receipt.event.failure, 'dropped-controller-event');
    assert.equal(receipt.event.pr, 16376);
    assert.equal(receipt.event.headSha, HEAD);
    assert.equal(receipt.next.action, 'restore-event-trigger-and-reconcile');
  });

  it('routes stale Gem service/config evidence to reload plus post-reload attestation', () => {
    const receipt = attestGemService({
      sourceSha: HEAD,
      installedSha: 'b'.repeat(40),
      configSha: 'config-a',
      loadedConfigSha: 'config-b',
      active: true,
      healthy: true,
    });
    assert.equal(receipt.event.failure, 'stale-config');
    assert.equal(receipt.next.owner, 'gem');
  });

  it('writes CI repair work as a formal Gem-to-Symphony task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-route-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'ci-failed-1',
        failure: 'ci-failed',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const result = await persistDeliveryOutcome(receipt, {
        stateDir: directory,
      });
      assert.equal(result.task.owner, 'symphony');
      assert.equal(result.task.route, 'gem-to-symphony');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('consumes one bounded stack repair action per root idempotently and refuses a stack action without exact root-head evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-stack-repair-'));
    try {
      const action = {
        schema: 'jovie-stack-health-action/v1',
        repository: REPO,
        taskKey: 'b'.repeat(64),
        deliveryKey: `closure-stack:${'b'.repeat(64)}`,
        action: 'split-or-retarget-draft-stack',
        owner: 'symphony',
        writer: 'symphony',
        issue: 'JOV-5362',
        rootPr: 16510,
        rootHeadSha: HEAD,
        prNumbers: [16510, 16511],
        memberHeads: [
          { pr: 16510, headSha: HEAD },
          { pr: 16511, headSha: HEAD },
        ],
        maxDepth: 2,
        promotionPath: [
          { pr: 16510, base: 'main', head: 'stack/root', headSha: HEAD },
          { pr: 16511, base: 'stack/root', head: 'stack/child', headSha: HEAD },
        ],
        integrator: null,
        deadline: null,
        violations: ['stack-depth-over-4', 'missing-stack-integrator'],
        safety: 'receipt-only; requalify exact heads before split-or-retarget',
      };
      const source = {
        schema: 'jovie-closure-health/v1',
        authority: 'Summer',
        observedAt: '2026-08-28T22:00:00.000Z',
        reasons: [],
        stackHealth: { violations: [] },
        repairActions: [action],
      };
      const variant = (key, rootPr) => ({
        ...action,
        taskKey: key.repeat(64),
        deliveryKey: `closure-stack:${key.repeat(64)}`,
        rootPr,
        rootHeadSha: key.repeat(40),
        prNumbers: [rootPr],
        memberHeads: [{ pr: rootPr, headSha: key.repeat(40) }],
        maxDepth: 1,
        promotionPath: [
          { pr: rootPr, base: 'main', head: key, headSha: key.repeat(40) },
        ],
      });
      const persist = (
        repairActions,
        observedAt = source.observedAt,
        violationRoots = repairActions.map(item => item.rootPr),
        reasons = violationRoots.length ? ['draft-stack-policy-violation'] : []
      ) =>
        persistClosureHealthActions(
          {
            ...source,
            observedAt,
            reasons,
            stackHealth: {
              violations: violationRoots.map(rootPr => ({ rootPr })),
            },
            repairActions,
          },
          { stateDir: directory }
        );
      const readQueue = async () =>
        JSON.parse(
          await readFile(join(directory, 'summer-queue.json'), 'utf8')
        );
      const otherRoot = variant('c', 16512);
      const advancedRoot = variant('d', 16510);
      const first = await persist([action]);
      const stillViolatingWithoutExactEvidence = await persist(
        [],
        '2026-08-28T22:30:00.000Z',
        [16510, 16513]
      );
      assert.equal(stillViolatingWithoutExactEvidence.evidenceCount, 2);
      const firstSeenEvidence =
        stillViolatingWithoutExactEvidence.evidence.find(
          item => item.rootPr === 16513
        );
      assert.equal(firstSeenEvidence.task.action, 'collect-missing-evidence');
      assert.equal(firstSeenEvidence.loop.mode, 'collect-evidence');
      const unknownObservation = await persist(
        [],
        '2026-08-28T22:45:00.000Z',
        [],
        ['closure-observation-unknown']
      );
      assert.equal(unknownObservation.resolution.status, 'unobserved');
      await persist([action, otherRoot], '2026-08-28T23:00:00.000Z');
      await persist([advancedRoot, otherRoot], '2026-08-29T00:00:00.000Z');
      const duplicate = await persist(
        [advancedRoot, otherRoot],
        '2026-08-29T00:00:00.000Z'
      );
      assert.equal(first.status, 'created');
      assert.equal(duplicate.status, 'duplicate');
      const queue = await readQueue();
      assert.equal(queue.items.length, 2);
      assert.equal(
        queue.items.find(item => item.pr === 16510).headSha,
        'd'.repeat(40)
      );
      assert.equal(
        first.actions[0].task.action,
        'split-or-retarget-draft-stack'
      );
      const task = JSON.parse(
        await readFile(first.actions[0].taskPath, 'utf8')
      );
      assert.deepEqual(task.evidence.prNumbers, [16510, 16511]);
      assert.deepEqual(task.evidence.memberHeads, action.memberHeads);
      assert.equal(task.repository, REPO);
      assert.equal(task.evidence.repository, REPO);
      assert.equal(task.evidence.rootHeadSha, HEAD);
      assert.equal(task.evidence.promotionPath[0].headSha, HEAD);
      const resolved = await persist([], '2026-08-29T01:00:00.000Z');
      assert.equal(resolved.status, 'resolved');
      assert.deepEqual(
        resolved.resolution.resolved.map(item => item.rootPr).sort(),
        [16510, 16512]
      );
      const resolvedQueue = await readQueue();
      assert.equal(resolvedQueue.items.length, 0);
      assert.equal(resolvedQueue.terminalTombstones.length, 2);
      assert.equal(
        resolvedQueue.terminalTombstones[0].reason,
        'draft-stack-policy-current-action-absent'
      );
      // Resolution is append-only: task/receipt history remains readable.
      assert.equal(
        JSON.parse(await readFile(first.actions[0].taskPath, 'utf8')).taskKey,
        task.taskKey
      );
      await persist([action], '2026-08-29T02:00:00.000Z');
      await persist([advancedRoot], '2026-08-29T03:00:00.000Z');
      const returned = await persist([action], '2026-08-29T04:00:00.000Z');
      assert.equal(returned.resolution.queue.items[0].headSha, HEAD);
      assert.ok(returned.actions[0].loop.supersedesLoopKey);
      await Promise.all([
        persist([action, otherRoot], '2026-08-29T05:00:00.000Z'),
        persist([], '2026-08-29T06:00:00.000Z'),
      ]);
      assert.equal((await readQueue()).items.length, 0);
      await persist([action], '2026-08-29T07:00:00.000Z');
      const olderEmpty = await persist([], '2026-08-29T06:30:00.000Z');
      assert.equal(olderEmpty.status, 'stale');
      const refreshed = await persist([action], '2026-08-29T08:00:00.000Z');
      assert.equal(
        (await readQueue()).items[0].observedAt,
        refreshed.observedAt
      );
      await assert.rejects(
        persistClosureHealthActions(
          { ...source, repairActions: [{ ...action, rootHeadSha: null }] },
          { stateDir: directory }
        ),
        /exact root PR head SHA/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('persists lifecycle replay idempotently and supersedes an older exact head', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-pr-lifecycle-'));
    try {
      const firstAction = lifecycleAction();
      const source = {
        schema: 'jovie-closure-health/v1',
        repository: REPO,
        authority: 'Summer',
        observedAt: firstAction.observedAt,
        lifecycleActions: [firstAction],
      };
      const first = await persistClosureHealthActions(source, {
        stateDir: directory,
      });
      const duplicate = await persistClosureHealthActions(source, {
        stateDir: directory,
      });
      const advancedAction = lifecycleAction({
        headSha: 'b'.repeat(40),
        observedAt: '2026-09-06T12:15:00.000Z',
      });
      const advanced = await persistClosureHealthActions(
        {
          ...source,
          observedAt: advancedAction.observedAt,
          lifecycleActions: [advancedAction],
        },
        { stateDir: directory }
      );

      assert.equal(first.lifecycleActions[0].status, 'created');
      assert.equal(duplicate.lifecycleActions[0].status, 'duplicate');
      assert.equal(advanced.lifecycleActions[0].status, 'created');
      assert.equal(advanced.lifecycleActions[0].receipt.generation, 1);
      assert.equal(
        advanced.lifecycleActions[0].receipt.supersedesActionKey,
        firstAction.actionKey
      );
      assert.equal(
        advanced.lifecycleActions[0].receipt.headSha,
        'b'.repeat(40)
      );

      const forgedReplay = await persistClosureHealthActions(
        {
          ...source,
          observedAt: '2026-09-06T12:30:00.000Z',
          lifecycleActions: [
            lifecycleAction({
              headSha: 'c'.repeat(40),
              actionKey: advancedAction.actionKey,
              observedAt: '2026-09-06T12:30:00.000Z',
            }),
          ],
        },
        { stateDir: directory }
      );
      assert.equal(forgedReplay.status, 'partial');
      assert.equal(forgedReplay.lifecycleRejectedCount, 1);
      assert.match(
        forgedReplay.lifecycleActions[0].reason,
        /key does not match its content/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails a malformed lifecycle row closed without dropping valid rows', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-pr-lifecycle-bad-'));
    try {
      const valid = lifecycleAction();
      const malformed = { ...lifecycleAction({ pr: 17002 }), owner: 'human' };
      const result = await persistClosureHealthActions(
        {
          schema: 'jovie-closure-health/v1',
          repository: REPO,
          authority: 'Summer',
          observedAt: valid.observedAt,
          lifecycleActions: [malformed, valid],
        },
        { stateDir: directory }
      );

      assert.equal(result.status, 'partial');
      assert.equal(result.failClosed, true);
      assert.equal(result.lifecycleActionCount, 1);
      assert.equal(result.lifecycleRejectedCount, 1);
      assert.equal(result.lifecycleActions[0].status, 'rejected');
      assert.equal(result.lifecycleActions[1].status, 'created');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('returns a failing CLI status after retaining valid siblings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-pr-lifecycle-cli-'));
    try {
      const valid = lifecycleAction();
      const input = join(directory, 'closure-health.json');
      await writeFile(
        input,
        JSON.stringify({
          repository: REPO,
          observedAt: valid.observedAt,
          lifecycleActions: [
            { ...lifecycleAction({ pr: 17002 }), owner: 'human' },
            valid,
          ],
        })
      );
      const result = spawnSync(
        process.execPath,
        [
          new URL('../delivery-state-machine.mjs', import.meta.url).pathname,
          `--closure-health-file=${input}`,
          `--state-dir=${directory}`,
        ],
        { encoding: 'utf8' }
      );
      const output = JSON.parse(result.stdout);

      assert.equal(result.status, 1);
      assert.equal(output.failClosed, true);
      assert.equal(output.lifecycleActionCount, 1);
      assert.equal(output.lifecycleRejectedCount, 1);
      assert.equal(output.lifecycleActions[1].status, 'created');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('quarantines malformed persisted siblings and atomically retains valid actions', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'jovie-pr-lifecycle-poison-')
    );
    const receiptDirectory = join(directory, 'pr-lifecycle-actions');
    try {
      await mkdir(receiptDirectory, { recursive: true });
      await writeFile(join(receiptDirectory, 'poison.json'), '{bad json\n');
      const action = lifecycleAction();
      const [first, replay] = await Promise.all([
        persistClosureHealthActions(
          {
            repository: REPO,
            observedAt: action.observedAt,
            lifecycleActions: [action],
          },
          { stateDir: directory }
        ),
        persistClosureHealthActions(
          {
            repository: REPO,
            observedAt: action.observedAt,
            lifecycleActions: [action],
          },
          { stateDir: directory }
        ),
      ]);

      assert.deepEqual(
        [
          first.lifecycleActions[0].status,
          replay.lifecycleActions[0].status,
        ].sort(),
        ['created', 'duplicate']
      );
      const names = await readdir(receiptDirectory);
      assert.equal(names.filter(name => name.endsWith('.json')).length, 1);
      assert.equal(
        names.some(name => name.endsWith('.tmp')),
        false
      );
      const quarantined = await readdir(join(receiptDirectory, 'quarantine'));
      assert.equal(quarantined.length, 1);
      assert.match(quarantined[0], /^poison\.json\..+\.malformed$/);
      assert.equal(
        JSON.parse(
          await readFile(
            join(receiptDirectory, `${action.actionKey}.json`),
            'utf8'
          )
        ).headSha,
        HEAD
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('accepts only the protected machine terminal disposition for PR 17156', async () => {
    const protectedAction = lifecycleAction({
      pr: 17156,
      terminal: true,
      sourceState: 'protected',
      owner: 'gem',
      action: 'preserve-protected-pr-exclusion',
      reason: 'protected-machine-exclusion:17156',
    });
    const accepted = await persistClosureHealthActions(
      {
        repository: REPO,
        observedAt: protectedAction.observedAt,
        lifecycleActions: [protectedAction],
      },
      { dryRun: true }
    );
    const rejected = await persistClosureHealthActions(
      {
        repository: REPO,
        observedAt: protectedAction.observedAt,
        lifecycleActions: [
          {
            ...protectedAction,
            terminal: false,
            disposition: 'active-remediation',
            owner: 'symphony',
            writer: 'symphony',
            action: 'create-bounded-ci-repair-pr',
          },
        ],
      },
      { dryRun: true }
    );

    assert.equal(accepted.lifecycleRejectedCount, 0);
    assert.equal(accepted.lifecycleActions[0].receipt.outcome, 'terminal');
    assert.equal(rejected.status, 'partial');
    assert.equal(rejected.lifecycleRejectedCount, 1);
  });

  it('accepts a schema-valid fleet receipt whose stack fields were omitted', async () => {
    const result = await persistClosureHealthActions(
      {
        schema: 'jovie-fleet-gate/v1',
        signals: {
          closureHealth: {
            schema: 'jovie-closure-health/v1',
            status: 'healthy',
            authority: 'Summer',
            observedAt: '2026-09-03T05:00:00.000Z',
            newIssueIntakeAllowed: true,
            promotionContinues: true,
            remediationContinues: true,
            reasons: [],
          },
        },
      },
      { dryRun: true }
    );
    assert.equal(result.actionCount, 0);
    assert.equal(result.evidenceCount, 0);
    assert.equal(result.status, 'none');
  });

  it('accepts a fail-closed fleet gate receipt with no stack repair work', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'jovie-empty-stack-actions-')
    );
    try {
      const result = await persistClosureHealthActions(
        {
          schema: 'jovie-fleet-gate/v1',
          signals: {
            closureHealth: {
              schema: 'jovie-closure-health/v1',
              status: 'red',
              authority: 'Summer',
              observedAt: '2026-09-01T01:23:29.000Z',
              newIssueIntakeAllowed: false,
              promotionContinues: true,
              remediationContinues: true,
              blockedActivities: [
                'new-issue-lease',
                'new-implementation',
                'fallback-pr-generation',
              ],
              reasons: ['gate-evaluation-failed'],
              stackHealth: {
                maxDepth: 4,
                roots: [],
                violations: [],
                repairActions: [],
              },
              repairActions: [],
            },
          },
        },
        { stateDir: directory }
      );

      assert.equal(result.actionCount, 0);
      assert.equal(result.evidenceCount, 0);
      assert.equal(result.status, 'none');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps legacy closure health without repair actions bounded and unobserved', async () => {
    const fallback = await persistClosureHealthActions(
      {
        schema: 'jovie-fleet-gate/v1',
        signals: {
          closureHealth: {
            schema: 'jovie-closure-health/v1',
            authority: 'Summer',
            status: 'red',
            observedAt: '2026-09-01T02:20:00.000Z',
            newIssueIntakeAllowed: false,
            promotionContinues: true,
            remediationContinues: true,
            reasons: ['gate-evaluation-failed'],
          },
        },
      },
      { dryRun: true }
    );
    assert.equal(fallback.actionCount, 0);
    assert.equal(fallback.evidenceCount, 0);
    assert.equal(fallback.resolution.status, 'unobserved');

    const activeViolation = await persistClosureHealthActions(
      {
        schema: 'jovie-closure-health/v1',
        authority: 'Summer',
        status: 'red',
        observedAt: '2026-09-01T02:25:00.000Z',
        newIssueIntakeAllowed: false,
        promotionContinues: true,
        remediationContinues: true,
        reasons: ['draft-stack-policy-violation'],
        stackHealth: {
          violations: [{ rootPr: 16514 }],
        },
      },
      { dryRun: true }
    );
    assert.equal(activeViolation.actionCount, 0);
    assert.equal(activeViolation.evidenceCount, 1);
    assert.equal(activeViolation.evidence[0].rootPr, 16514);
    assert.equal(activeViolation.evidence[0].loop.mode, 'collect-evidence');
  });

  it('writes handed-off repair work as one exact-head Gem-to-FX task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-fx-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'ci-fx-1',
        failure: 'ci-failed-after-handoff',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const result = await persistDeliveryOutcome(receipt, {
        stateDir: directory,
      });
      assert.equal(result.task.owner, 'fx');
      assert.equal(result.task.route, 'gem-to-fx');
      assert.equal(result.task.headSha, HEAD);
      assert.equal(result.task.action, 'repair-current-pr-exact-head');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps missing FX auth as a Gem-local configuration incident', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-fx-auth-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'fx-auth-1',
        failure: 'fx-auth-missing',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const result = await persistDeliveryOutcome(receipt, {
        stateDir: directory,
      });
      assert.equal(result.task.owner, 'gem');
      assert.equal(result.task.route, 'gem-local');
      assert.equal(result.task.action, 'restore-fx-adapter-authentication');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses reconciliation only to route a stale/missing heartbeat, never to replay work', () => {
    const receipt = reconcileDeliveryHeartbeat(null, {
      now: '2026-08-15T23:30:00.000Z',
      maxAgeMs: 60_000,
    });
    assert.equal(receipt.event.failure, 'missing-trigger');
    assert.equal(receipt.next.action, 'restore-event-trigger-and-reconcile');
    assert.equal(receipt.externalMutations, 0);
  });

  it('keeps not-proven and unbound production as evidence, never a repair claim', () => {
    const missing = buildDeliveryReceipt({
      delivery_key: 'not-proven-1',
      failure: 'not-proven',
    });
    assert.equal(missing.stage, 'evidence-pending');
    assert.equal(missing.next.action, 'collect-missing-evidence');
    const unbound = buildDeliveryReceipt({
      delivery_key: 'prod-unbound-1',
      failure: 'production-deployment-unbound',
    });
    assert.equal(unbound.stage, 'evidence-pending');
    assert.equal(unbound.next.mode, 'evidence');
  });

  it('classifies CI and size-guard workflow failures without treating them as queue-noop', async () => {
    const ci = buildDeliveryReceipt({
      workflow_run: { id: 7, conclusion: 'failure', name: 'CI' },
    });
    assert.equal(ci.event.failure, 'missing-failing-checks');
    const size = buildDeliveryReceipt({
      workflow_run: { id: 8, conclusion: 'failure', name: 'PR Size Guard' },
    });
    assert.equal(size.next.action, 'split-source-aligned-size-guard');
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-red-'));
    try {
      const result = await persistDeliveryOutcome(
        buildDeliveryReceipt({
          delivery_key: 'ci-failed-loop',
          failure: 'ci-failed',
          issue: 'JOV-5390',
          pr_number: 16019,
          head_sha: HEAD,
        }),
        { stateDir: directory }
      );
      assert.equal(result.loop.stallClass, 'missing-failing-checks');
      assert.equal(result.queue.items[0].issue, 'JOV-5390');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('read-only deployment investigation result', () => {
  const repairHead = 'b'.repeat(40);
  const now = '2026-09-24T01:00:00.000Z';
  const identity = {
    repository: REPO,
    run: 777,
    attempt: 1,
    repairPr: 18201,
    repairHead,
    deploymentUrl: 'https://jovie-fixture-jovie.vercel.app',
  };
  const run = {
    id: 777,
    run_attempt: 1,
    path: '.github/workflows/production-controller.yml',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'failure',
    head_sha: HEAD,
    repository: { full_name: REPO },
    html_url: 'https://github.com/JovieInc/Jovie/actions/runs/777',
  };
  const repair = {
    number: 18201,
    headRefOid: repairHead,
    baseRefName: 'main',
    state: 'OPEN',
    isDraft: false,
    mergeQueueEntry: { id: 'MQE_current' },
  };
  const source = {
    encoding: 'base64',
    content: Buffer.from(
      "import { WHITE_SPACE_STYLE_PROMPT } from '@/lib/services/retouching/style-prompt';"
    ).toString('base64'),
  };
  const diagnostic = {
    schema: 'jovie-vercel-deploy-failure/v1',
    mode: 'tgz',
    attempt: 3,
    exitStatus: 1,
    errorCode: 'ENOENT',
    asset: 'retouch-style-prompt',
    deploymentUrl: identity.deploymentUrl,
  };
  const checkout = {
    name: `Run actions/checkout@${'c'.repeat(40)}`,
    number: 2,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-24T00:50:00Z',
    completed_at: '2026-09-24T00:50:10Z',
  };
  const deploy = {
    name: 'Deploy (staging preview, prebuilt)',
    number: 15,
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-09-24T00:55:00Z',
    completed_at: '2026-09-24T00:56:00Z',
  };
  const jobs = {
    jobs: [
      {
        id: 888,
        run_id: 777,
        run_attempt: 1,
        name: 'Production Release / deploy-staging',
        status: 'completed',
        conclusion: 'failure',
        steps: [checkout, deploy],
      },
    ],
  };
  const authorize = {
    name: 'Cross-prove exact successful push CI',
    number: 3,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-24T00:49:00Z',
    completed_at: '2026-09-24T00:49:10Z',
  };
  const authJob = {
    id: 889,
    run_id: 777,
    run_attempt: 1,
    name: 'Authorize exact main CI evidence',
    status: 'completed',
    conclusion: 'success',
    steps: [authorize],
  };
  jobs.jobs.push(authJob);
  const sourceCi = {
    ...run,
    id: 999,
    path: '.github/workflows/ci.yml',
    event: 'push',
    conclusion: 'success',
  };
  const prefix = `2026-09-24T00:50:05.000Z ${HEAD}\n2026-09-24T00:55:00.500Z   VERCEL_GIT_COMMIT_SHA: ${HEAD}\n`;
  const diagnosticLine = value =>
    `2026-09-24T00:55:30.000Z Deploy failure diagnostic: ${JSON.stringify(value)}`;
  const log = prefix + diagnosticLine(diagnostic);
  const logs = {
    checkout: `2026-09-24T00:50:10.900Z ${HEAD}\n`,
    deploy: log,
    authorize: `2026-09-24T00:49:00Z   EXPECTED_SHA: ${HEAD}\n2026-09-24T00:49:10Z Authorized production from exact CI run 999 attempt 1 over deployed range ${'c'.repeat(40)}..${HEAD} (Web=true bind=selected_lane).\n`,
  };

  const githubWithJob = patch => async endpoint =>
    endpoint.includes('/contents/')
      ? source
      : endpoint.includes('/jobs?')
        ? { jobs: [{ ...jobs.jobs[0], ...patch }, authJob] }
        : run;
  const reads = (overrides = {}) => ({
    now,
    readGithub: async endpoint =>
      endpoint.includes('/contents/')
        ? source
        : endpoint.includes('/jobs?')
          ? jobs
          : endpoint.includes('/runs/999/')
            ? sourceCi
            : run,
    readRepair: async () => repair,
    readStepLogs: async () => logs,
    ...overrides,
  });

  it('derives a bounded observed wrapper diagnosis from authenticated API readers', async () => {
    const result = await collectDeploymentInvestigation(identity, reads());
    assert.equal(result.sourceHead, HEAD);
    assert.equal(result.diagnosis, 'retouch-style-prompt-missing');
    assert.equal(result.capability, 'read-only-investigation');
    assert.equal(
      JSON.stringify(result).includes('synthetic-private-output'),
      false
    );
    assert.equal(result.healthy, undefined);
  });

  for (const [name, overrides] of [
    [
      'wrong staging attempt',
      { readGithub: githubWithJob({ run_attempt: 2 }) },
    ],
    [
      'successful staging job',
      { readGithub: githubWithJob({ conclusion: 'success' }) },
    ],
    [
      'wrong deploy step',
      {
        readGithub: githubWithJob({
          steps: [checkout, { ...deploy, name: 'Unrelated' }],
        }),
      },
    ],
    [
      'successful deploy step',
      {
        readGithub: githubWithJob({
          steps: [checkout, { ...deploy, conclusion: 'success' }],
        }),
      },
    ],
    [
      'wrong checkout source',
      { readStepLogs: async () => ({ ...logs, checkout: repairHead }) },
    ],
    [
      'wrong deployed source',
      {
        readStepLogs: async () => ({
          ...logs,
          deploy: log.replace(
            `VERCEL_GIT_COMMIT_SHA: ${HEAD}`,
            `VERCEL_GIT_COMMIT_SHA: ${repairHead}`
          ),
        }),
      },
    ],
    [
      'wrong authorized source',
      {
        readStepLogs: async () => ({
          ...logs,
          authorize: logs.authorize.replaceAll(HEAD, repairHead),
        }),
      },
    ],
    [
      'missing authorization receipt',
      { readStepLogs: async () => ({ ...logs, authorize: 'untrusted' }) },
    ],
    [
      'adjacent-step spoof',
      {
        readStepLogs: async () => ({ ...logs, deploy: prefix, adjacent: log }),
      },
    ],
    [
      'command echo injection',
      {
        readStepLogs: async () => ({
          ...logs,
          deploy: log.replace('Z Deploy failure', 'Z echo Deploy failure'),
        }),
      },
    ],
    [
      'truncated diagnostic',
      { readStepLogs: async () => ({ ...logs, deploy: log.slice(0, -1) }) },
    ],
    [
      'unavailable log',
      { readStepLogs: async () => ({ ...logs, deploy: '' }) },
    ],
    [
      'conflicting retry records',
      {
        readStepLogs: async () => ({
          ...logs,
          deploy: log + '\n' + diagnosticLine({ ...diagnostic, attempt: 4 }),
        }),
      },
    ],
    ...[
      { name: 'extra diagnostic fields', patch: { healthy: true } },
      { name: 'unknown diagnostic schema', patch: { schema: 'untrusted' } },
      { name: 'zero exit', patch: { exitStatus: 0 } },
      { name: 'invalid wrapper attempt', patch: { attempt: 0 } },
      { name: 'unknown mode', patch: { mode: 'other' } },
      {
        name: 'mismatched URL',
        patch: { deploymentUrl: 'https://jovie-other-jovie.vercel.app' },
      },
      {
        name: 'malformed URL',
        patch: { deploymentUrl: identity.deploymentUrl + '.attacker.invalid' },
      },
      { name: 'unknown error', patch: { errorCode: 'EACCES' } },
      { name: 'unknown asset', patch: { asset: 'runtime-quarantine-ledger' } },
    ].map(({ name, patch }) => [
      name,
      {
        readStepLogs: async () => ({
          ...logs,
          deploy: prefix + diagnosticLine({ ...diagnostic, ...patch }),
        }),
      },
    ]),
    [
      'wrong run attempt',
      { readGithub: async () => ({ ...run, run_attempt: 2 }) },
    ],
    [
      'wrong workflow',
      { readGithub: async () => ({ ...run, path: 'unrelated.yml' }) },
    ],
    [
      'successful controller',
      { readGithub: async () => ({ ...run, conclusion: 'success' }) },
    ],
    [
      'changed PR head',
      { readRepair: async () => ({ ...repair, headRefOid: HEAD }) },
    ],
    [
      'unqueued PR',
      { readRepair: async () => ({ ...repair, mergeQueueEntry: null }) },
    ],
    [
      'closed unmerged PR',
      { readRepair: async () => ({ ...repair, state: 'CLOSED' }) },
    ],
    ['draft PR', { readRepair: async () => ({ ...repair, isDraft: true }) }],
    [
      'unchanged runtime read',
      {
        readGithub: async endpoint =>
          endpoint.includes('/contents/')
            ? {
                ...source,
                content: Buffer.from("import fs from 'node:fs';").toString(
                  'base64'
                ),
              }
            : run,
      },
    ],
  ]) {
    it(`rejects ${name}`, async () => {
      await assert.rejects(
        collectDeploymentInvestigation(identity, reads(overrides)),
        /deployment-investigation:/
      );
    });
  }
  it('collapses identical wrapper records without conflating wrapper and GitHub attempts', async () => {
    const result = await collectDeploymentInvestigation(
      identity,
      reads({
        readStepLogs: async () => ({
          ...logs,
          deploy: log + '\n' + diagnosticLine(diagnostic),
        }),
      })
    );
    assert.equal(result.attempt, 1);
    assert.equal(result.jobId, 888);
    assert.equal(result.stepNumber, 15);
  });

  async function seed(directory, controller = run) {
    return persistDeliveryOutcome(
      buildDeliveryReceipt(
        {
          action: 'completed',
          repository: { full_name: REPO },
          workflow_run: controller,
        },
        { now }
      ),
      { stateDir: directory }
    );
  }

  const archiveEntries = {
    [`Production Release _ deploy-staging/2_Run actions_checkout@${'c'.repeat(40)}.txt`]:
      logs.checkout,
    'Production Release _ deploy-staging/15_Deploy (staging preview, prebuilt).txt':
      logs.deploy,
    'Authorize exact main CI evidence/3_Cross-prove exact successful push CI.txt':
      logs.authorize,
  };
  function archive(entries = Object.entries(archiveEntries)) {
    const zipped = spawnSync(
      'python3',
      [
        '-c',
        'import sys,json,zipfile,io; b=io.BytesIO(); z=zipfile.ZipFile(b,"w",compression=zipfile.ZIP_DEFLATED); [z.writestr(k,v) for k,v in json.load(sys.stdin)]; z.close(); sys.stdout.buffer.write(b.getvalue())',
      ],
      { input: JSON.stringify(entries) }
    );
    assert.equal(zipped.status, 0, zipped.stderr.toString());
    return zipped.stdout.toString('base64');
  }

  it('accepts completion-second logs and binds deployed source separately from controller source', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'jovie-investigation-source-')
    );
    try {
      const controller = { ...run, head_sha: repairHead };
      await seed(directory, controller);
      const bound = reads({
        readGithub: async endpoint =>
          endpoint.includes('/contents/')
            ? source
            : endpoint.includes('/jobs?')
              ? jobs
              : endpoint.includes('/runs/999/')
                ? sourceCi
                : controller,
        readStepLogs: async () => ({
          ...logs,
          deploy: log.replace('00:55:30.000', '00:56:00.900'),
        }),
      });
      const result = await collectDeploymentInvestigation(identity, bound);
      assert.equal(result.controllerHead, repairHead);
      assert.equal(result.sourceHead, HEAD);
      const accepted = await persistDeploymentInvestigation(result, {
        ...bound,
        stateDir: directory,
      });
      assert.equal(accepted.loop.state, 'repair-verifying');
      assert.equal(accepted.investigation.sourceCiRun, 999);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('executes the producer and existing dispatch CLI through actual read-only commands', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-investigation-cli-'));
    try {
      await seed(directory);
      const bin = join(directory, 'bin');
      await mkdir(bin);
      await writeFile(
        join(bin, 'gh'),
        `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]!=='api')process.exit(17);if(a[1].endsWith('/logs')){process.stdout.write(Buffer.from(process.env.TEST_ARCHIVE_BASE64 || ${JSON.stringify(archive())},'base64'));process.exit(0);}const value=a[1]==='graphql'?{data:{repository:{pullRequest:${JSON.stringify(repair)}}}}:a[1].includes('/contents/')?${JSON.stringify(source)}:a[1].includes('/jobs?')?${JSON.stringify(jobs)}:a[1].includes('/runs/999/')?${JSON.stringify(sourceCi)}:${JSON.stringify(run)};process.stdout.write(JSON.stringify(value));`,
        { mode: 0o755 }
      );
      const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
      const scriptPath = new URL(
        '../delivery-state-machine.mjs',
        import.meta.url
      ).pathname;
      const produced = spawnSync(
        process.execPath,
        [
          scriptPath,
          '--investigate-controller-run=777',
          '--attempt=1',
          '--repair-pr=18201',
          `--repair-head=${repairHead}`,
          `--deployment-url=${identity.deploymentUrl}`,
        ],
        { env, encoding: 'utf8' }
      );
      assert.equal(produced.status, 0, produced.stderr);
      const result = JSON.parse(produced.stdout);
      for (const archiveOverride of [
        Buffer.from('not a zip').toString('base64'),
        archive(Object.entries(archiveEntries).slice(1)),
        archive([
          ...Object.entries(archiveEntries),
          Object.entries(archiveEntries)[0],
        ]),
        archive(
          Object.entries(archiveEntries).map(([key, value], index) => [
            key,
            index === 0 ? 'x'.repeat(2 * 1024 * 1024 + 1) : value,
          ])
        ),
      ]) {
        const rejected = spawnSync(
          process.execPath,
          [
            scriptPath,
            '--investigate-controller-run=777',
            '--attempt=1',
            '--repair-pr=18201',
            `--repair-head=${repairHead}`,
            `--deployment-url=${identity.deploymentUrl}`,
          ],
          {
            env: { ...env, TEST_ARCHIVE_BASE64: archiveOverride },
            encoding: 'utf8',
          }
        );
        assert.equal(rejected.status, 1);
        assert.match(rejected.stderr, /step-logs-unavailable/);
        assert.equal(rejected.stdout, '');
      }

      const eventFile = join(directory, 'event.json');
      const event = {
        action: 'delivery-investigation-result',
        repository: { full_name: REPO },
        client_payload: { investigation: result },
      };
      await writeFile(eventFile, JSON.stringify(event));
      const accepted = spawnSync(
        process.execPath,
        [scriptPath, `--event-file=${eventFile}`, `--state-dir=${directory}`],
        { env, encoding: 'utf8' }
      );
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.equal(JSON.parse(accepted.stdout).loop.state, 'repair-verifying');
      const dryRun = spawnSync(
        process.execPath,
        [
          scriptPath,
          `--event-file=${eventFile}`,
          `--state-dir=${directory}`,
          '--dry-run',
        ],
        { env, encoding: 'utf8' }
      );
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.equal(JSON.parse(dryRun.stdout).status, 'dry-run');
      await writeFile(
        join(bin, 'gh'),
        `#!${process.execPath}\nprocess.stderr.write('synthetic-private-output');process.exit(1);`,
        { mode: 0o755 }
      );
      const failed = spawnSync(
        process.execPath,
        [
          scriptPath,
          '--investigate-controller-run=777',
          '--attempt=1',
          '--repair-pr=18201',
          `--repair-head=${repairHead}`,
          `--deployment-url=${identity.deploymentUrl}`,
        ],
        { env, encoding: 'utf8' }
      );
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /read-unavailable/);
      assert.equal(failed.stderr.includes('synthetic-private-output'), false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('persists one read-only result, tolerates queued-to-merged, and leaves the loop open', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-investigation-'));
    try {
      await seed(directory);
      const result = await collectDeploymentInvestigation(identity, reads());
      const merged = reads({
        readRepair: async () => ({
          ...repair,
          state: 'MERGED',
          mergeQueueEntry: null,
          mergeCommit: { oid: 'c'.repeat(40) },
        }),
      });
      const accepted = await persistDeploymentInvestigation(result, {
        ...merged,
        stateDir: directory,
      });
      assert.equal(accepted.status, 'created');
      assert.equal(accepted.investigation.repairState, 'MERGED');
      assert.equal(accepted.loop.state, 'repair-verifying');
      assert.equal(accepted.loop.outcome, 'open');
      assert.equal(accepted.loop.terminal, false);
      assert.equal(accepted.loop.externalMutations, 0);
      const replay = await persistDeploymentInvestigation(result, {
        ...merged,
        stateDir: directory,
      });
      assert.equal(replay.status, 'duplicate');
      assert.equal(replay.loop.loopKey, accepted.loop.loopKey);
      assert.equal(replay.loop.attempt, accepted.loop.attempt);
      const queue = JSON.parse(await readFile(accepted.queuePath, 'utf8'));
      assert.equal(
        queue.items.filter(item => item.outcome === 'open').length,
        1
      );
      assert.equal(queue.items[0].state, 'repair-verifying');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a forged dispatch and a same-source deployment absent from the exact attempt log', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'jovie-investigation-forgery-')
    );
    try {
      await seed(directory);
      const result = await collectDeploymentInvestigation(identity, reads());
      await assert.rejects(
        persistDeploymentInvestigation(
          {
            ...result,
            deploymentUrl: 'https://jovie-invented-jovie.vercel.app',
          },
          { ...reads(), stateDir: directory }
        ),
        /diagnostic-missing-or-conflicting/
      );
      await assert.rejects(
        collectDeploymentInvestigation(
          identity,
          reads({
            readStepLogs: async () => ({
              ...logs,
              deploy:
                prefix +
                diagnosticLine({
                  ...diagnostic,
                  deploymentUrl: 'https://jovie-older-jovie.vercel.app',
                }),
            }),
          })
        ),
        /diagnostic-missing-or-conflicting/
      );
      await assert.rejects(readdir(join(directory, 'investigation-results')), {
        code: 'ENOENT',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('recovers an interrupted accepted write after expiry using only the exact accepted payload', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'jovie-investigation-recovery-')
    );
    try {
      await seed(directory);
      const result = await collectDeploymentInvestigation(identity, reads());
      const accepted = await persistDeploymentInvestigation(result, {
        ...reads(),
        stateDir: directory,
      });
      await rm(join(directory, 'red-loop', `${accepted.loop.loopKey}.json`));
      const later = {
        ...reads({
          now: '2026-09-24T02:00:00.000Z',
          readStepLogs: async () => {
            throw new Error('must not recollect accepted proof');
          },
        }),
        stateDir: directory,
      };
      const recovered = await persistDeploymentInvestigation(result, later);
      assert.equal(recovered.status, 'duplicate');
      assert.equal(recovered.loop.loopKey, accepted.loop.loopKey);
      assert.equal(recovered.loop.attempt, accepted.loop.attempt);
      await assert.rejects(
        persistDeploymentInvestigation(
          { ...result, observedAt: '2026-09-24T02:00:00.000Z' },
          later
        ),
        /accepted-result-payload-mismatch/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not accept a result when the persisted retry budget is exhausted', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'jovie-investigation-budget-')
    );
    try {
      const seeded = await seed(directory);
      const loopPath = join(
        directory,
        'red-loop',
        `${seeded.loop.loopKey}.json`
      );
      await writeFile(
        loopPath,
        JSON.stringify({
          ...seeded.loop,
          attempt: seeded.loop.attemptBudget - 1,
        })
      );
      const result = await collectDeploymentInvestigation(identity, reads());
      await assert.rejects(
        persistDeploymentInvestigation(result, {
          ...reads(),
          stateDir: directory,
        }),
        /investigation-transition-not-permitted/
      );
      await assert.rejects(readdir(join(directory, 'investigation-results')), {
        code: 'ENOENT',
      });
      assert.equal(
        JSON.parse(await readFile(loopPath, 'utf8')).state,
        seeded.loop.state
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed on stale, cross-bound, or authority-bearing results without creating an acceptance', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'jovie-investigation-negative-')
    );
    try {
      await seed(directory);
      const result = await collectDeploymentInvestigation(identity, reads());
      for (const change of [
        { sourceHead: repairHead },
        { attempt: 2 },
        { capability: 'execute-repair' },
        { observedAt: '2026-09-23T01:00:00Z' },
        { observedAt: '2026-09-25T01:00:00Z' },
        { healthy: true },
        { terminal: true },
        { repairPr: -1 },
        { repository: 'other/repo' },
        { deploymentUrl: identity.deploymentUrl + '/bad' },
        { diagnosticDigest: 'forged' },
        { jobId: 999 },
      ]) {
        await assert.rejects(
          persistDeploymentInvestigation(
            { ...result, ...change },
            { ...reads(), stateDir: directory }
          )
        );
      }
      await assert.rejects(readdir(join(directory, 'investigation-results')), {
        code: 'ENOENT',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
