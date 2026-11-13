import { describe, expect, it } from 'vitest';
import { alertStateFor } from '../../automation-liveness.mjs';
import { livenessDecisions } from '../automation-registry.mjs';
import {
  dispatchQueueRecovery,
  planQueueRecovery,
  prepareQueueRecovery,
  QUEUE_FINGERPRINT,
  QUEUE_ID,
  renderQueueRecovery,
} from '../merge-queue-recovery.mjs';
import { readClosureEvidence } from '../merge-queue-recovery-evidence.mjs';
import {
  at,
  commit,
  issue,
  NOW,
  plan,
  repair,
  runtime,
  sha,
  snapshot,
  worker,
} from './fixtures/queue-recovery.mjs';

function proofClient(change = _row => {}) {
  const paths = [];
  const client = {
    rest: async (_method, path) => {
      paths.push(path);
      const group =
        path.includes('event=merge_group') || path.includes('/runs/1/');
      const id = group ? 1 : 2;
      const head = sha(group ? 'd' : 'e');
      let data;
      if (path.includes('/jobs?'))
        data = {
          total_count: 2,
          jobs: [
            group ? 'PR Ready' : 'Main Release Ready',
            'Merge Suite Scope / full_web_units',
          ].map(name => ({
            name,
            run_id: id,
            run_attempt: 2,
            head_sha: head,
            status: 'completed',
            conclusion: 'success',
          })),
        };
      else
        data = {
          workflow_runs: [
            {
              id,
              run_number: 1,
              run_attempt: 2,
              path: '.github/workflows/ci.yml',
              head_sha: head,
              event: group ? 'merge_group' : 'push',
              head_branch: group ? 'gh-readonly-queue/main/pr-10-test' : 'main',
              status: 'completed',
              conclusion: 'success',
              created_at: at(1),
              html_url: `https://github.com/JovieInc/Jovie/actions/runs/${id}`,
            },
          ],
        };
      change(data);
      return { status: 200, headers: new Headers(), json: () => data };
    },
    graphql: async () => ({
      repository: { p0: repair({ state: 'CLOSED', baseRefName: 'main' }) },
    }),
  };
  return { client, paths };
}
const mergedSnapshot = () =>
  snapshot({
    observedAt: at(5),
    open: [],
    merged: [repair({ mergedAt: at(1), mergeCommit: commit('d') })],
    main: { ...commit('e'), history: { nodes: [{ oid: sha('d') }] } },
  });

describe('exact recovery evidence and adversarial lifecycle', () => {
  it('preserves recovery ownership and retry history through quota deferral', () => {
    const recovery = plan().state;
    const previous = { status: 'red', recovery };
    expect(
      alertStateFor('deferred', previous, { ...recovery, attempts: 99 })
    ).toBe(previous);
    for (const status of ['stale', 'unknown', 'fresh'])
      expect(alertStateFor(status, previous, recovery)).toEqual({
        status: status === 'fresh' ? 'green' : 'red',
        recovery,
      });
    expect(
      livenessDecisions(
        {
          results: [
            { id: QUEUE_ID, critical: true, status: 'deferred', recovery },
          ],
        },
        { [QUEUE_FINGERPRINT]: previous }
      )
    ).toEqual([]);
  });

  it('does not turn deferred unrelated monitors red after verified queue recovery', async () => {
    const prior = plan().state;
    const s = mergedSnapshot();
    s.closure = { proven: true, repairSha: sha('d'), mainSha: sha('e') };
    const report = {
      observedAt: at(5),
      status: 'critical',
      results: [
        { id: QUEUE_ID, critical: true, status: 'stale', budgetMinutes: 45 },
        { id: 'lanes-clock:spend-guard', critical: true, status: 'deferred' },
      ],
    };
    const result = await prepareQueueRecovery({
      report,
      observations: new Map([[QUEUE_ID, { recoverySnapshot: s }]]),
      previous: {},
      linear: null,
      env: {},
      fetchImpl: async () => {
        throw new Error('network forbidden');
      },
      readIncident: async () => ({
        known: true,
        issue: { ...issue, description: renderQueueRecovery(prior) },
      }),
      readRuntime: async () => runtime(),
      readClosure: async () => {},
    });
    expect(result.close).toBe(true);
    expect(report.status).toBe('healthy');
    expect(livenessDecisions(report).map(d => d.action)).toEqual(['green']);
  });

  it('validates the same CI attempts through the existing queue-proof policy and main aggregate', async () => {
    const s = mergedSnapshot();
    const { client, paths } = proofClient();
    await readClosureEvidence({
      snapshot: s,
      repair: { pr: 10, head: sha('a') },
      openedAt: at(0),
      client,
    });
    expect(paths).toHaveLength(4);
    expect(
      paths
        .filter(p => p.includes('/jobs?'))
        .every(p => p.includes('/attempts/2/'))
    ).toBe(true);
    expect(s.closure).toMatchObject({
      proven: true,
      repairSha: sha('d'),
      mainSha: sha('e'),
    });
  });

  it.each([
    [
      'missing timestamp',
      data => {
        if (data.workflow_runs) data.workflow_runs[0].created_at = 'invalid';
      },
    ],
    [
      'future run',
      data => {
        if (data.workflow_runs) data.workflow_runs[0].created_at = at(10);
      },
    ],
    [
      'old run',
      data => {
        if (data.workflow_runs) data.workflow_runs[0].created_at = at(-60);
      },
    ],
    [
      'wrong workflow',
      data => {
        if (data.workflow_runs)
          data.workflow_runs[0].path = '.github/workflows/other.yml';
      },
    ],
    [
      'wrong run',
      data => {
        if (data.jobs) data.jobs[0].run_id = 300;
      },
    ],
    [
      'wrong attempt',
      data => {
        if (data.jobs) data.jobs[0].run_attempt = 1;
      },
    ],
    [
      'moving head',
      data => {
        if (data.jobs) data.jobs[0].head_sha = sha('f');
      },
    ],
    [
      'failed latest run',
      data => {
        if (data.workflow_runs) data.workflow_runs[0].conclusion = 'failure';
      },
    ],
    [
      'wrong scope',
      data => {
        if (data.jobs)
          data.jobs[1].name = 'Merge Suite Scope / ordinary_admission';
      },
    ],
    [
      'main missing aggregate',
      data => {
        if (data.jobs?.[0]?.name === 'Main Release Ready')
          data.jobs[0].name = 'Other';
      },
    ],
    [
      'truncated jobs',
      data => {
        if (data.jobs) data.total_count = 101;
      },
    ],
  ])('preserves recovery on %s', async (_name, change) => {
    const s = mergedSnapshot();
    await readClosureEvidence({
      snapshot: s,
      repair: { pr: 10, head: sha('a') },
      openedAt: at(0),
      ...proofClient(change),
    });
    expect(s.closure?.proven).not.toBe(true);
  });

  it('preserves read failures as unknown and targets a linked closed repair outside the fleet page', async () => {
    const s = snapshot({ open: [], merged: [], eligibilityComplete: false });
    const { client } = proofClient();
    await readClosureEvidence({
      snapshot: s,
      repair: { pr: 10, head: sha('a') },
      openedAt: at(0),
      client,
    });
    expect(s.linkedRepairs[0].state).toBe('CLOSED');
    expect(
      plan(plan().state, {
        snapshot: s,
        nowMs: NOW + 46 * 60_000,
        runtime: runtime([], 46),
        ...{ snapshot: { ...s, observedAt: at(46) } },
      }).dispatch
    ).toBe(true);
    const failure = mergedSnapshot();
    await readClosureEvidence({
      snapshot: failure,
      repair: { pr: 10, head: sha('a') },
      openedAt: at(0),
      client: {
        rest: async () => {
          throw new Error('unavailable');
        },
      },
    });
    expect(failure.closure).toEqual({
      proven: false,
      reason: 'queue-main-proof-unavailable',
    });
  });

  it('targets newly attached draft repairs before claiming an absent owner', async () => {
    const s = snapshot({ open: [], merged: [], eligibilityComplete: false });
    const { client, paths } = proofClient();
    client.graphql = async () => ({
      repository: {
        p0: repair({ isDraft: true, state: 'OPEN', baseRefName: 'main' }),
      },
    });
    await readClosureEvidence({
      snapshot: s,
      numbers: [10],
      repair: null,
      openedAt: at(0),
      client,
    });
    expect(paths).toHaveLength(0);
    expect(plan(null, { snapshot: s }).state.status).toBe('held');
  });

  it('does not dispatch when the attached repair ownership read fails', async () => {
    const report = {
      results: [
        { id: QUEUE_ID, critical: true, status: 'stale', budgetMinutes: 45 },
      ],
      observedAt: at(0),
      status: 'critical',
    };
    const result = await prepareQueueRecovery({
      report,
      observations: new Map([
        [QUEUE_ID, { recoverySnapshot: snapshot({ open: [] }) }],
      ]),
      previous: {},
      linear: null,
      env: {},
      fetchImpl: globalThis.fetch,
      readIncident: async () => ({ known: true, issue }),
      readRuntime: async () => runtime(),
      readClosure: args =>
        readClosureEvidence({
          ...args,
          client: {
            graphql: async () => {
              throw new Error('unavailable');
            },
          },
        }),
    });
    expect(result.dispatch).toBe(false);
    expect(result.state.nextAction).toBe('refresh-linked-repair');
  });

  it('escalates an overdue merged repair without claiming successful recovery', () => {
    const prior = { ...plan().state, deadline: at(-1) };
    const result = plan(prior, {
      snapshot: mergedSnapshot(),
      nowMs: NOW + 5 * 60_000,
    });
    expect(result.close).toBe(false);
    expect(result.state.status).toBe('escalated');
    expect(result.state.nextAction).toBe(
      'main-and-queue-proof-deadline-exceeded'
    );
  });

  it('never lets an old successful episode resolve the next stall', () => {
    const recovered = {
      ...plan().state,
      status: 'recovered',
      openedAt: at(-120),
      repair: { pr: 10, head: sha('a') },
    };
    const s = mergedSnapshot();
    s.merged[0].mergedAt = at(-90);
    s.closure = { proven: true, repairSha: sha('d'), mainSha: sha('e') };
    for (const active of [null, issue]) {
      const next = plan(recovered, {
        snapshot: s,
        incident: { known: true, issue: active },
      });
      expect(next.close).toBe(false);
      expect(next.state.openedAt).toBe(at(0));
    }
  });

  it('holds writes on unknown or corrupt authoritative state instead of resetting the budget', async () => {
    for (const incident of [
      { known: false, issue: null },
      {
        known: true,
        issue: {
          ...issue,
          description: '<!-- jovie-queue-recovery:v1 -->invalid',
        },
      },
    ]) {
      const report = {
        results: [
          { id: QUEUE_ID, critical: true, status: 'stale', budgetMinutes: 45 },
        ],
        observedAt: at(0),
        status: 'critical',
      };
      const result = await prepareQueueRecovery({
        report,
        observations: new Map([[QUEUE_ID, { recoverySnapshot: snapshot() }]]),
        previous: {},
        linear: null,
        env: {},
        fetchImpl: async () => {
          throw new Error('network forbidden');
        },
        readIncident: async () => incident,
        readRuntime: async () => runtime(),
        readClosure: async () => {},
      });
      expect(result.dispatch).toBe(false);
      expect(livenessDecisions(report)[0].action).toBe('hold');
    }
  });

  it('keeps the original deadline through unknown telemetry and detects competing repairs after binding', () => {
    const prior = plan().state;
    const unknown = plan(prior, {
      nowMs: NOW + 30 * 60_000,
      snapshot: snapshot({ known: false }),
    });
    expect(unknown.state.deadline).toBe(prior.deadline);
    const extraIssue = {
      ...issue,
      attachments: {
        nodes: [10, 11].map(n => ({
          url: `https://github.com/JovieInc/Jovie/pull/${n}`,
        })),
        pageInfo: { hasNextPage: false },
      },
    };
    expect(
      plan(prior, {
        incident: { known: true, issue: extraIssue },
        snapshot: snapshot({ open: [repair(), repair({ number: 11 })] }),
      }).state.nextAction
    ).toBe('reconcile-competing-repair-prs');
  });

  it('does not count an unrelated body mention as a repair or bypass eligible dwell', () => {
    const noLinks = {
      known: true,
      issue: {
        ...issue,
        attachments: { nodes: [], pageInfo: { hasNextPage: false } },
      },
    };
    expect(plan(null, { incident: noLinks }).state.repair).toBeNull();
    expect(
      planQueueRecovery({
        row: { status: 'fresh', budgetMinutes: 45 },
        snapshot: snapshot({ queued: 0, eligible: [repair()] }),
        incident: { known: true, issue: null },
        runtime: runtime(),
        nowMs: NOW,
      }).dispatch
    ).toBe(false);
  });

  it('requires exact persisted intent before dispatch and reattaches through stale membership', async () => {
    const first = { ...plan(), issue: issue.identifier };
    const current = {
      ...issue,
      state: { name: 'In Progress' },
      description: '',
      comments: [],
    };
    let transitions = 0;
    const clientImpl = {
      fetchIssue: async () => current,
      addComment: async (_id, body) => {
        current.comments.push({ body });
        return true;
      },
      transitionIssue: async () => {
        transitions += 1;
        current.state = { name: 'Todo' };
        return true;
      },
    };
    const dependencies = {
      clientImpl,
      fetchOfficialSymphonyStateImpl: async () =>
        runtime([worker({ last_event_at: at(-6) })]),
      nowImpl: () => at(0),
      symphonyReadbackAttempts: 1,
      sleepImpl: async () => {},
    };
    expect((await dispatchQueueRecovery(first, dependencies)).reason).toBe(
      'recovery-attempt-readback-missing'
    );
    expect(transitions).toBe(0);
    current.description = renderQueueRecovery(first.state);
    expect(
      (
        await dispatchQueueRecovery(first, {
          ...dependencies,
          filed: { identifier: 'JOV-OTHER' },
        })
      ).reason
    ).toBe('recovery-incident-changed');
    const result = await dispatchQueueRecovery(first, dependencies);
    expect(transitions).toBe(1);
    expect(result.results[0].status).toBe('queued');
    expect(result.results[0].readback.ok).toBe(false);
  });
});
