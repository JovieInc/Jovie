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
  DELIVERY_RECEIPT_SCHEMA,
  PR_LIFECYCLE_POLICY_DIGEST,
  persistClosureHealthActions,
  persistDeliveryOutcome,
  reconcileDeliveryHeartbeat,
  transitionDeliveryReceipt,
} from '../delivery-state-machine.mjs';

const HEAD = 'a'.repeat(40);
const REPO = 'JovieInc/Jovie';
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
