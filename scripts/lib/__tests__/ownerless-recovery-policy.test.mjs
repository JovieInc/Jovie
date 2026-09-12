import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyQueueOwnership,
  countsAsRecoveryFailure,
  fetchOfficialSymphonyState,
  ownerlessRecoveryFailureDisposition,
  processFleetClosureRemediationIntents,
  readRecoveryEvent,
  recoveryEventDecision,
  recoveryIssueSnapshot,
  recoveryNativeAdmissionDecision,
  run,
} from '../../ownerless-recovery-sweeper.mjs';
import {
  buildPrFleetClosureAudit,
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
  shouldDispatchOwnerlessRecovery,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const main = 'b'.repeat(40);
const now = '2026-08-15T02:00:00.000Z';
const fresh = '2026-08-15T01:59:30.000Z';
const pull = (number, extra = {}) => ({
  number,
  title: extra.title ?? `Fix JOV-${number}`,
  body: extra.body ?? `Fix JOV-${number}`,
  mergeable_state: extra.mergeable_state ?? 'clean',
  head: { sha: String(number).padStart(40, '0') },
  ...extra,
});
const issue = (identifier, state = 'Human Review', extra = {}) => ({
  identifier,
  state: { name: state },
  comments: [],
  attachments: [],
  ...extra,
});
const audit = (pullRequests, linearIssues, extra = {}) =>
  buildPrFleetClosureAudit({
    pullRequests,
    linearIssues,
    now: new Date(now),
    snapshot: { complete: true, startedAt: fresh, completedAt: now },
    ...extra,
  });

describe('ownerless recovery policy', () => {
  it('retries a transient official state read before failing closed', async () => {
    let calls = 0;
    const state = {
      generated_at: fresh,
      running: [],
      retrying: [],
      blocked: [],
    };
    const result = await fetchOfficialSymphonyState({
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify(calls === 1 ? {} : state));
      },
      sleepImpl: async () => {},
    });

    expect(calls).toBe(2);
    expect(result).toEqual({
      ...state,
      source: 'official-symphony-state',
    });
  });

  it('treats a read-back Linear remediation receipt as queued while the healthy runtime is occupied', async () => {
    const intent = {
      pr: 42,
      head,
      issue: 'JOV-42',
      displayCategory: 'draft',
      reason: 'in-progress-without-live-symphony-lease',
      action: 'reattach-remediation-lane',
      consumer: 'symphony-linear-writer',
    };
    const current = issue('JOV-42', 'In Progress', { id: 'issue-id' });
    let commentsAdded = 0;
    let transitions = 0;
    const clientImpl = {
      fetchIssue: async () => current,
      addComment: async (_id, body) => {
        commentsAdded += 1;
        current.comments.push({ body });
        return { commentCreate: { success: true } };
      },
      transitionIssue: async () => {
        transitions += 1;
        current.state = { name: 'Todo' };
        return { issueUpdate: { success: true } };
      },
    };
    const symphonyState = {
      generated_at: fresh,
      running: [{ issue_identifier: 'JOV-OTHER' }],
      retrying: [],
      blocked: [],
    };
    const options = {
      clientImpl,
      fetchOfficialSymphonyStateImpl: async () => symphonyState,
      nowImpl: () => now,
      sleepImpl: async () => {},
      symphonyReadbackAttempts: 1,
      todoStateId: 'todo-id',
    };

    const first = await processFleetClosureRemediationIntents(
      { remediationIntents: [intent] },
      options
    );
    const replay = await processFleetClosureRemediationIntents(
      { remediationIntents: [intent] },
      options
    );

    expect(first).toMatchObject({
      ok: true,
      results: [{ status: 'queued', reason: intent.reason }],
    });
    expect(replay.results[0].status).toBe('queued');
    expect(commentsAdded).toBe(1);
    expect(transitions).toBe(1);
  });

  it('refuses conflicting durable remediation receipts and malformed runtime state', async () => {
    const intent = {
      pr: 42,
      head,
      issue: 'JOV-42',
      displayCategory: 'draft',
      reason: 'in-progress-without-live-symphony-lease',
      action: 'reattach-remediation-lane',
      consumer: 'symphony-linear-writer',
    };
    const conflictBody = `<!-- jovie-pr-fleet-remediation-lease:v1 -->\n${JSON.stringify(
      {
        ...intent,
        schema: 'jovie-pr-fleet-remediation-lease/v1',
        reason: 'terminal-linear-issue-open-pr',
      }
    )}\n<!-- /jovie-pr-fleet-remediation-lease -->`;
    const conflicting = issue('JOV-42', 'Todo', {
      id: 'issue-id',
      comments: [{ body: conflictBody }],
    });
    const clientImpl = {
      fetchIssue: async () => conflicting,
      addComment: async () => {
        throw new Error('must not mutate');
      },
      transitionIssue: async () => {
        throw new Error('must not mutate');
      },
    };
    const baseOptions = {
      clientImpl,
      nowImpl: () => now,
      sleepImpl: async () => {},
      symphonyReadbackAttempts: 1,
      todoStateId: 'todo-id',
    };
    const healthy = {
      generated_at: fresh,
      running: [],
      retrying: [],
      blocked: [],
    };
    const conflict = await processFleetClosureRemediationIntents(
      { remediationIntents: [intent] },
      {
        ...baseOptions,
        fetchOfficialSymphonyStateImpl: async () => healthy,
      }
    );
    expect(conflict).toMatchObject({
      ok: false,
      results: [{ status: 'failed', reason: 'intent-conflict' }],
    });

    conflicting.comments = [];
    const malformed = await processFleetClosureRemediationIntents(
      { remediationIntents: [intent] },
      {
        ...baseOptions,
        fetchOfficialSymphonyStateImpl: async () => ({
          ...healthy,
          running: null,
        }),
      }
    );
    expect(malformed).toMatchObject({
      ok: false,
      results: [{ status: 'failed', reason: 'symphony-state-malformed' }],
    });
  });

  it('defers a nested Linear cooldown with its exact retry clock', () => {
    const resetAt = Date.parse(now) + 60_000;
    const cause = Object.assign(new Error('credential cooling down'), {
      code: 'RATE_LIMITED',
      attempts: 0,
      metadata: { resetAt },
    });
    const error = Object.assign(
      new Error('Linear pagination page fetch failed'),
      {
        name: 'LinearPaginationError',
        code: 'PAGE_FETCH_FAILED',
        attempts: 0,
        resetAt,
        cause,
      }
    );

    expect(
      ownerlessRecoveryFailureDisposition(error, Date.parse(now))
    ).toMatchObject({
      schema: 'jovie-ownerless-recovery-failure/v1',
      status: 'deferred',
      code: 'PAGE_FETCH_FAILED',
      attempts: 0,
      resetAt,
      retryAt: new Date(resetAt).toISOString(),
      cause: { code: 'RATE_LIMITED', attempts: 0 },
    });
  });

  it('admits focused green recovery work after one ownerless hour', () => {
    expect(
      evaluateRecoveryCandidate({
        pr: {
          state: 'open',
          assignees: [],
          created_at: '2026-08-15T00:00:00.000Z',
          mergeable: true,
          base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
          head: { sha: head, repo: { full_name: 'JovieInc/Jovie' } },
        },
        mainSha: main,
        compare: { behind_by: 0 },
        timeline: [],
        files: ['scripts/ci-merge-queue-check.mjs'],
        patch: '+const timeout = 9;',
        checksPassing: true,
        now: Date.parse(now),
      }).eligible
    ).toBe(true);
  });

  it('allows only non-worsening workflow tuning', () => {
    const classify = patch =>
      classifyRecoveryFiles(['.github/workflows/ci.yml'], patch).eligible;
    expect(
      classify('+run: node -e "process.mainModule.require(`child_process`)"')
    ).toBe(false);
    expect(classify('-timeout-minutes: 10\n+timeout-minutes: 9')).toBe(true);
    expect(classify('-max-parallel: 2\n+max-parallel: 999999')).toBe(false);
  });

  it('keeps ownerless dispatch available unless the snapshot or Symphony is unsafe', () => {
    const ownerless = audit([pull(7, { title: 'Ownerless', body: '' })], [], {
      symphonyState: {
        observedAt: fresh,
        running: [],
        retrying: [],
        blocked: [],
      },
    });
    expect(ownerless.status).toBe('blocked');
    expect(shouldDispatchOwnerlessRecovery(ownerless)).toBe(true);
    expect(
      audit([pull(31)], [issue('JOV-31', 'Done')]).violations[0].reason
    ).toBe('terminal-linear-issue-open-pr');
    expect(
      shouldDispatchOwnerlessRecovery(
        audit([pull(50)], [issue('JOV-50')], {
          snapshot: { complete: false, startedAt: fresh, completedAt: now },
        })
      )
    ).toBe(false);
    expect(
      shouldDispatchOwnerlessRecovery(
        audit([pull(60)], [issue('JOV-60', 'In Progress')], {
          symphonyState: { running: ['JOV-60'] },
        })
      )
    ).toBe(false);
  });

  it('accepts the official Symphony API timestamp schema', () => {
    const result = audit([pull(60)], [issue('JOV-60', 'In Progress')], {
      symphonyState: {
        generated_at: fresh,
        running: [{ issue_identifier: 'JOV-60' }],
        retrying: [],
        blocked: [],
      },
    });

    expect(
      result.violations.some(
        violation => violation.reason === 'symphony-state-malformed'
      )
    ).toBe(false);
    expect(result.symphony).toMatchObject({
      healthy: true,
      observedAt: fresh,
      running: 1,
      retrying: 0,
      blocked: 0,
    });
  });

  it('validates queue ownership and comment dedupe keys', () => {
    expect(
      classifyQueueOwnership({ headRefOid: head, queued: true }, head).outcome
    ).toBe('already-delegated-exact-head');
    expect(countsAsRecoveryFailure({ queued: false, pending: false })).toBe(
      true
    );
    expect(
      readFileSync(new URL('../upsert-pr-comment.sh', import.meta.url), 'utf8')
    ).toContain('${4:+:$4}');
  });
});

describe('tracker scan admission', () => {
  it('does not read Linear for empty or draft-only PR inventories', async () => {
    for (const open of [[], [{ draft: true }], [{ isDraft: true }]]) {
      expect(
        await recoveryIssueSnapshot(open, () => {
          throw new Error('unexpected tracker read');
        })
      ).toBeNull();
    }
  });
  it('returns from the actual sweep before tracker reads when all PRs are drafts', async () => {
    await run({
      eventContext: { name: 'workflow_dispatch' },
      resolvePolicyHead: async () => main,
      readOpenPulls: async base => {
        expect(base).toBe('main');
        return [{ draft: true }];
      },
      readIssueSnapshot: async () => {
        throw new Error('unexpected tracker read');
      },
    });
  });
  it('preserves exhaustive evidence and propagates unknown for real recovery demand', async () => {
    const snapshot = {
      issues: [],
      coverage: {
        complete: true,
        pages: 1,
        scanned: 0,
        hasNextPage: false,
        endCursor: null,
        reason: null,
      },
    };
    expect(
      await recoveryIssueSnapshot([{ draft: false }], async () => snapshot)
    ).toBe(snapshot);
    await expect(
      recoveryIssueSnapshot([{ draft: false }], async () => {
        throw new Error('quota exhausted');
      })
    ).rejects.toThrow('quota exhausted');
  });
  it('skips draft scans while preserving existing workflow triggers', () => {
    const workflow = readFileSync(
      new URL(
        '../../../.github/workflows/ownerless-recovery-sweep.yml',
        import.meta.url
      ),
      'utf8'
    );
    expect(workflow).toMatch(/types: \[opened, reopened, unlabeled\]/);
    expect(workflow).not.toContain('ready_for_review');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toMatch(
      /if: github.event_name != 'pull_request' \|\| github.event.pull_request.draft == false/
    );
  });
});

describe('recovery event admission before tracker reads', () => {
  it('reads the GitHub event payload and rejects missing or malformed context', () => {
    expect(readRecoveryEvent({})).toEqual({ name: 'manual', payload: {} });
    expect(
      readRecoveryEvent({ GITHUB_EVENT_NAME: 'workflow_dispatch' })
    ).toEqual({ name: 'workflow_dispatch', payload: {} });
    expect(() =>
      readRecoveryEvent({ GITHUB_EVENT_NAME: 'pull_request' })
    ).toThrow('context is missing');
    const environment = {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: '/event.json',
    };
    expect(
      readRecoveryEvent(environment, (path, encoding) => {
        expect(path).toBe('/event.json');
        expect(encoding).toBe('utf8');
        return '{"action":"opened"}';
      })
    ).toEqual({ name: 'pull_request', payload: { action: 'opened' } });
    expect(() => readRecoveryEvent(environment, () => 'invalid')).toThrow();
  });
  const ready = {
    number: 17298,
    head: { sha: head },
    draft: false,
    state: 'open',
    base: { ref: 'main' },
    created_at: '2026-08-15T00:00:00.000Z',
    labels: [],
    assignees: [],
  };
  const event = (
    action,
    changes = {},
    label = 'needs-conflict-resolution'
  ) => ({
    name: 'pull_request',
    payload: {
      action,
      pull_request: { ...ready, ...changes },
      label: { name: label },
    },
  });
  const unexpected = async () => {
    throw new Error('unexpected external read');
  };

  it.each([
    event('opened', { draft: true }),
    event('reopened', { draft: true }),
    event('synchronize'),
    event('synchronize', { draft: true }),
    event('labeled'),
    event('unlabeled', {}, 'documentation'),
    event('unlabeled', { labels: [{ name: 'hold' }] }),
    event('unlabeled', { assignees: [{ login: 'owner' }] }),
    event('unlabeled', { created_at: '2026-08-15T01:32:00.000Z' }),
    event('unlabeled', { draft: true }),
    event('opened', { base: { ref: 'feature' } }),
    { name: 'push' },
  ])('skips ineligible event %# before GitHub inventory or Linear', async eventContext => {
    await expect(
      run({
        eventContext,
        now: Date.parse(now),
        readEventTimeline: unexpected,
        resolvePolicyHead: unexpected,
        readOpenPulls: unexpected,
        readIssueSnapshot: unexpected,
      })
    ).resolves.toBeUndefined();
  });

  it.each([
    event('opened'),
    event('reopened'),
    { name: 'workflow_dispatch' },
    { name: 'manual' },
  ])('preserves full closure audit for legitimate event %#', async eventContext => {
    await expect(
      run({
        eventContext,
        now: Date.parse(now),
        resolvePolicyHead: async () => main,
        readEventQueueState: async () => ({
          number: 17298,
          headRefOid: head,
          state: 'OPEN',
          isDraft: false,
          queued: false,
          autoMergeEnabled: false,
        }),
        readOpenPulls: async () => [ready],
        readIssueSnapshot: async () => {
          throw new Error('full closure audit reached');
        },
      })
    ).rejects.toThrow('full closure audit reached');
  });

  it.each([
    { queued: true, autoMergeEnabled: true },
    { queued: false, autoMergeEnabled: true },
  ])('repeated events for admitted exact heads never inventory GitHub or Linear: %j', async admission => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await run({
        eventContext: event('opened'),
        now: Date.parse(now),
        readEventQueueState: async input => {
          expect(input).toEqual({
            repository: 'JovieInc/Jovie',
            number: 17298,
          });
          return {
            number: 17298,
            headRefOid: head,
            state: 'OPEN',
            isDraft: false,
            ...admission,
          };
        },
        resolvePolicyHead: unexpected,
        readOpenPulls: unexpected,
        readIssueSnapshot: unexpected,
      });
    }
  });

  it.each([
    { number: 17298, headRefOid: main },
    { number: 17299, headRefOid: head },
    { number: 17298, headRefOid: head, state: 'OPEN', isDraft: false },
    { number: 17298, headRefOid: head },
    null,
  ])('rejects stale or partial live admission evidence before tracker inventory: %j', async state => {
    await expect(
      run({
        eventContext: event('opened'),
        readEventQueueState: async () => state,
        resolvePolicyHead: unexpected,
        readOpenPulls: unexpected,
        readIssueSnapshot: unexpected,
      })
    ).rejects.toThrow(/indeterminate|changed/);
  });

  it('skips a current closed or draft PR and propagates failed readback', async () => {
    for (const changed of [
      { state: 'CLOSED', isDraft: false },
      { state: 'OPEN', isDraft: true },
    ]) {
      expect(
        await recoveryNativeAdmissionDecision(event('opened'), async () => ({
          number: 17298,
          headRefOid: head,
          ...changed,
        }))
      ).toEqual({ required: false, reason: 'current-pr-not-ready' });
    }
    await expect(
      recoveryNativeAdmissionDecision(event('opened'), unexpected)
    ).rejects.toThrow('unexpected external read');
    await expect(
      recoveryNativeAdmissionDecision(event('opened', { head: {} }), unexpected)
    ).rejects.toThrow('exact PR head is indeterminate');
  });

  it('requires a full ownerless hour after the most recent assignment transition', async () => {
    for (const timeline of [
      [{ event: 'unassigned', created_at: '2026-08-15T01:32:00.000Z' }],
      [{ event: 'assigned', created_at: '2026-08-15T00:30:00.000Z' }],
    ]) {
      expect(
        await recoveryEventDecision(event('unlabeled'), {
          now: Date.parse(now),
          readTimeline: async () => timeline,
        })
      ).toEqual({ required: false, reason: 'ownerless-under-threshold' });
    }
    expect(
      await recoveryEventDecision(event('unlabeled'), {
        now: Date.parse(now),
        readTimeline: async number => {
          expect(number).toBe(17298);
          return [
            { event: 'unassigned', created_at: '2026-08-15T01:00:00.000Z' },
          ];
        },
      })
    ).toEqual({ required: true, reason: 'eligible-recovery-hold-released' });
  });

  it('propagates incomplete event and timeline evidence before the tracker scan', async () => {
    await expect(
      recoveryEventDecision(event('unlabeled'), {
        now: Date.parse(now),
        readTimeline: async () => [
          { event: 'unassigned', created_at: 'invalid' },
        ],
      })
    ).rejects.toThrow('ownership timeline is indeterminate');
    await expect(
      recoveryEventDecision({
        name: 'pull_request',
        payload: { action: 'opened' },
      })
    ).rejects.toThrow('eligibility is indeterminate');
    await expect(
      recoveryEventDecision(event('unlabeled', { created_at: 'invalid' }))
    ).rejects.toThrow('age is indeterminate');
    await expect(
      recoveryEventDecision(event('unlabeled'), {
        now: Date.parse(now),
        readTimeline: unexpected,
      })
    ).rejects.toThrow('unexpected external read');
  });
});
