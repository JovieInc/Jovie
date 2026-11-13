import { describe, expect, it } from 'vitest';
import { observeMergeQueueProgress } from '../../automation-liveness.mjs';
import {
  dispatchQueueRecovery,
  parseQueueRecovery,
  prepareQueueRecovery,
  QUEUE_FINGERPRINT,
  QUEUE_ID,
  queueSnapshot,
  readQueueIncident,
  renderQueueRecovery,
} from '../merge-queue-recovery.mjs';

import {
  at,
  commit,
  issue,
  labels,
  NOW,
  plan,
  repair,
  runtime,
  sha,
  snapshot,
  worker,
} from './fixtures/queue-recovery.mjs';

describe('stalled shipping recovery', () => {
  it('failure → accepted owner → failed repair → retry → fixed head → actual verified merge', () => {
    const first = plan();
    expect(first.dispatch).toBe(true);
    expect(first.state).toMatchObject({
      attempts: 1,
      owner: null,
      repair: { pr: 10, head: sha('a') },
    });
    const accepted = plan(first.state, { runtime: runtime([worker()]) });
    expect(accepted.state).toMatchObject({
      status: 'repair-failed',
      owner: 'JOV-8775',
      lease: 'worker-1',
      attempts: 1,
    });
    expect(accepted.close).toBe(false);
    const retry = plan(accepted.state, {
      nowMs: NOW + 46 * 60_000,
      snapshot: snapshot({ observedAt: at(46) }),
      runtime: runtime([], 46),
    });
    expect(retry.dispatch).toBe(true);
    expect(retry.state.attempts).toBe(2);
    const fixed = repair({
      headRefOid: sha('c'),
      commits: { nodes: [{ commit: commit('c') }] },
    });
    const ready = plan(retry.state, {
      snapshot: snapshot({ open: [fixed] }),
      runtime: runtime([worker()]),
    });
    expect(ready.close).toBe(false);
    expect(ready.state.repair.head).toBe(sha('c'));
    const merged = { ...fixed, mergedAt: at(1), mergeCommit: commit('d') };
    const done = plan(ready.state, {
      nowMs: NOW + 2 * 60_000,
      snapshot: snapshot({
        observedAt: at(2),
        queued: 0,
        open: [],
        merged: [merged],
        lastMergeAt: at(1),
        closure: { proven: true, repairSha: sha('d'), mainSha: sha('e') },
        main: { ...commit('e'), history: { nodes: [{ oid: sha('d') }] } },
      }),
    });
    expect(done.close).toBe(true);
    expect(done.state.status).toBe('recovered');
  });

  it('deduplicates wakeups and bounds repeated retries across queue and repair head churn', () => {
    let state = plan().state;
    expect(plan(state).dispatch).toBe(false);
    for (let n = 1; n <= 4; n += 1) {
      const next = plan(state, {
        nowMs: NOW + n * 46 * 60_000,
        runtime: runtime([], n * 46),
        snapshot: snapshot({
          observedAt: at(n * 46),
          queued: n % 2,
          open: [repair({ headRefOid: sha(String(n)) })],
        }),
      });
      state = next.state;
    }
    expect(state).toMatchObject({
      status: 'escalated',
      attempts: 3,
      nextAction: 'dispatcher-retry-budget-exhausted',
    });
  });

  it.each([
    ['empty queue', { queued: 0, open: [] }],
    ['re-enqueue', { queued: 1 }],
    ['unrelated merge', { lastMergeAt: at(1) }],
    ['unreadable snapshot', { known: false }],
    ['stale snapshot', { observedAt: at(-6) }],
    ['future snapshot', { observedAt: at(1) }],
  ])('does not close an open incident on %s', (_name, change) => {
    expect(
      plan(plan().state, {
        row: { status: 'fresh', budgetMinutes: 45 },
        snapshot: snapshot(change),
      }).close
    ).toBe(false);
  });

  it.each([
    ['missing', null, 'symphony-state-missing'],
    ['stale', runtime([], -6), 'symphony-state-stale'],
    [
      'unknown lease',
      runtime([{ issue_identifier: 'JOV-8775' }]),
      'worker-lease-unverified',
    ],
    [
      'concurrent',
      runtime([worker(), worker({ session_id: 'second' })]),
      'symphony-lease-conflict',
    ],
  ])('never fabricates acceptance for %s telemetry', (_name, data, reason) => {
    const result = plan(null, { runtime: data });
    expect(result.dispatch).toBe(false);
    expect(result.state.owner).toBeNull();
    expect(result.state.nextAction).toBe(reason);
  });

  it('reattaches a stale lease but escalates a live worker missing the repair deadline', () => {
    expect(
      plan(null, { runtime: runtime([worker({ last_event_at: at(-6) })]) })
        .dispatch
    ).toBe(true);
    const state = plan().state;
    const stuck = plan(state, {
      nowMs: NOW + 46 * 60_000,
      snapshot: snapshot({ observedAt: at(46) }),
      runtime: runtime([worker({ last_event_at: at(46) })], 46),
    });
    expect(stuck.state.nextAction).toBe(
      'accepted-worker-missed-repair-deadline'
    );
    expect(stuck.dispatch).toBe(false);
  });

  it('preserves explicit holds and refuses competing repairs', () => {
    for (const p of [
      repair({ isDraft: true }),
      repair({ labels: { ...labels, nodes: [{ name: 'hold' }] } }),
    ]) {
      expect(
        plan(plan().state, { snapshot: snapshot({ open: [p] }) }).state.status
      ).toBe('held');
    }
    expect(
      plan(null, {
        snapshot: snapshot({ open: [repair(), repair({ number: 11 })] }),
        incident: {
          known: true,
          issue: {
            ...issue,
            attachments: {
              nodes: [10, 11].map(n => ({
                url: `https://github.com/JovieInc/Jovie/pull/${n}`,
              })),
              pageInfo: { hasNextPage: false },
            },
          },
        },
      }).state.nextAction
    ).toBe('reconcile-competing-repair-prs');
  });

  it('requires the observed fixed head, queue proof, current main proof and ancestry for closure', () => {
    const prior = plan().state;
    const merged = repair({ mergedAt: at(1), mergeCommit: commit('d') });
    const evidence = {
      observedAt: at(2),
      open: [],
      merged: [merged],
      closure: { proven: true, repairSha: sha('d'), mainSha: sha('e') },
      main: { ...commit('e'), history: { nodes: [{ oid: sha('d') }] } },
    };
    for (const change of [
      { merged: [{ ...merged, headRefOid: sha('f') }] },
      { closure: { proven: false } },
      { closure: { ...evidence.closure, mainSha: sha('f') } },
      { main: { ...evidence.main, history: { nodes: [] } } },
    ])
      expect(
        plan(prior, {
          nowMs: NOW + 2 * 60_000,
          snapshot: snapshot({ ...evidence, ...change }),
        }).close
      ).toBe(false);
  });

  it('uses the durable incident after artifact loss and preserves the retry budget', () => {
    const state = { ...plan().state, attempts: 3, deadline: at(-1) };
    expect(parseQueueRecovery(renderQueueRecovery(state))).toEqual(state);
    expect(parseQueueRecovery('bad')).toBeNull();
    expect(
      plan(null, {
        incident: {
          known: true,
          issue: { ...issue, description: renderQueueRecovery(state) },
        },
      }).state.status
    ).toBe('escalated');
  });

  it('distinguishes verified idle from stranded eligible work and incomplete telemetry', async () => {
    const repo = {
      mergeQueue: {
        entries: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false } },
      },
      open: { nodes: [], pageInfo: { hasNextPage: false } },
      pullRequests: { nodes: [] },
    };
    expect(queueSnapshot(repo, NOW)).toMatchObject({
      known: true,
      queued: 0,
      eligible: [],
    });
    const read = r =>
      observeMergeQueueProgress(
        { repo: 'JovieInc/Jovie' },
        {
          nowMs: NOW,
          token: 'test',
          fetchImpl: async () =>
            new Response(JSON.stringify({ data: { repository: r } })),
        }
      );
    expect((await read(repo)).reason).toBe('merge-queue-idle');
    repo.open.nodes.push(
      repair({
        mergeStateStatus: 'CLEAN',
        isInMergeQueue: false,
        createdAt: at(-60),
      })
    );
    const stranded = await read(repo);
    expect(stranded.reason).toBe('eligible-enqueue-evidence-required');
    expect(stranded.recoverySnapshot.eligible).toHaveLength(1);
    repo.open.pageInfo.hasNextPage = true;
    expect((await read(repo)).ok).toBe(false);
  });

  it('reads the canonical incident fail-closed and suppresses false green in the real liveness path', async () => {
    expect(await readQueueIncident(null)).toEqual({
      known: false,
      issue: null,
    });
    expect(
      (
        await readQueueIncident({
          graphql: async () => ({
            issues: { nodes: [issue, issue], pageInfo: { hasNextPage: false } },
          }),
        })
      ).known
    ).toBe(false);
    const report = {
      results: [
        { id: QUEUE_ID, critical: true, status: 'fresh', budgetMinutes: 45 },
      ],
      observedAt: at(0),
      status: 'healthy',
    };
    await prepareQueueRecovery({
      report,
      observations: new Map([
        [QUEUE_ID, { recoverySnapshot: snapshot({ queued: 0 }) }],
      ]),
      previous: { [QUEUE_FINGERPRINT]: 'red' },
      linear: null,
      env: {},
      fetchImpl: async () => {
        throw new Error('unexpected network');
      },
      readIncident: async () => ({ known: true, issue }),
      readRuntime: async () => runtime(),
    });
    expect(report.results[0].status).toBe('stale');
    expect(report.status).toBe('critical');
  });

  it('uses the existing dispatcher, deduplicates its intent, and reads back actual acceptance', async () => {
    const first = { ...plan(), issue: issue.identifier };
    const current = {
      ...issue,
      description: renderQueueRecovery(first.state),
      comments: [],
    };
    let additions = 0;
    let accepted = false;
    const clientImpl = {
      fetchIssue: async () => current,
      addComment: async (_id, body) => {
        additions += 1;
        current.comments.push({ body });
        return true;
      },
      transitionIssue: async () => true,
    };
    const deps = {
      clientImpl,
      fetchOfficialSymphonyStateImpl: async () =>
        runtime(accepted ? [worker()] : []),
      nowImpl: () => at(0),
      symphonyReadbackAttempts: 1,
      sleepImpl: async () => {},
    };
    const queued = await dispatchQueueRecovery(first, deps);
    expect(queued.results[0].status).toBe('queued');
    await dispatchQueueRecovery(first, deps);
    expect(additions).toBe(1);
    accepted = true;
    expect((await dispatchQueueRecovery(first, deps)).results[0].status).toBe(
      'idempotent'
    );
    expect(additions).toBe(1);
  });
});
