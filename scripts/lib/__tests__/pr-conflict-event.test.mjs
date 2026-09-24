import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main as runConflictCli } from '../../pr-conflict-handler.mjs';
import {
  hasConflictHold,
  hasExactWorkflowRunCanary,
  isExactConflictCanaryPlan,
  matchesHydratedConflictPr,
  matchesRawConflictPr,
  parseConflictCanary,
  parseConflictEvent,
} from '../pr-conflict-event.mjs';
import {
  buildConflictFxStatusDescription,
  CONFLICT_FX_MAX_ATTEMPTS,
  CONFLICT_FX_STATUS_CONTEXT,
} from '../pr-conflict-handler.mjs';

const REPO = 'JovieInc/Jovie';
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
function exactCanaryPlan() {
  const identity = {
    headRefName: 'codex/fix',
    headRefOid: HEAD,
    baseRefName: 'main',
    baseRefOid: BASE,
  };
  const item = {
    number: 42,
    action: 'escalate_conflict_fx',
    model: 'openai/gpt-5.6-sol',
    pr: { number: 42, ...identity },
  };
  const fx = {
    prNumber: 42,
    ...identity,
    adaptiveCap: 1,
    model: item.model,
  };
  return {
    items: [item],
    fxMatrix: [fx],
    exceptionMatrix: [],
    capacity: { maxConcurrent: 1, availableCiSlots: 1 },
  };
}

describe('validated exact canary contract', () => {
  it('accepts only an enabled canonical PR number and one exact workflow_run association', () => {
    expect(parseConflictCanary('true', '42')).toBe(42);
    for (const [enabled, value] of [
      ['false', '42'],
      ['', '42'],
      ['true', ''],
      ['true', '042'],
      ['true', '-1'],
      ['true', '1000001'],
      ['true', '9'.repeat(32)],
    ]) {
      expect(parseConflictCanary(enabled, value)).toBeNull();
    }
    expect(
      hasExactWorkflowRunCanary(
        { workflow_run: { pull_requests: [{ number: 42 }] } },
        42
      )
    ).toBe(true);
    for (const pull_requests of [
      [],
      [{ number: 43 }],
      [{ number: 42 }, { number: 43 }],
      [{ number: '42' }],
    ]) {
      expect(
        hasExactWorkflowRunCanary({ workflow_run: { pull_requests } }, 42)
      ).toBe(false);
    }
  });

  it('rejects forged action matrices that escape the one-PR plan identity', () => {
    const plan = exactCanaryPlan();
    const [item] = plan.items;
    const [fx] = plan.fxMatrix;
    expect(isExactConflictCanaryPlan(plan, 42)).toBe(true);
    expect(
      isExactConflictCanaryPlan(
        { ...plan, fxMatrix: [{ ...fx, prNumber: 43 }] },
        42
      )
    ).toBe(false);
    expect(
      isExactConflictCanaryPlan(
        { ...plan, fxMatrix: [{ ...fx, headRefOid: 'c'.repeat(40) }] },
        42
      )
    ).toBe(false);
    expect(
      isExactConflictCanaryPlan(
        { ...plan, items: [{ ...item, pr: { ...item.pr, number: 43 } }] },
        42
      )
    ).toBe(false);
    expect(
      isExactConflictCanaryPlan(
        {
          ...plan,
          fxMatrix: [{ ...fx, adaptiveCap: 0 }],
          capacity: { ...plan.capacity, availableCiSlots: 0 },
        },
        42
      )
    ).toBe(false);
    expect(
      isExactConflictCanaryPlan(
        { ...plan, capacity: { ...plan.capacity, maxConcurrent: 40 } },
        42
      )
    ).toBe(false);
    expect(
      isExactConflictCanaryPlan(
        { ...plan, exceptionMatrix: [{ ...fx, exceptionType: 'permission' }] },
        42
      )
    ).toBe(false);
  });
});

const SCRIPT = resolve(
  import.meta.dirname,
  '..',
  '..',
  'pr-conflict-handler.mjs'
);
const WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github/workflows/pr-conflict-handler.yml'
  ),
  'utf8'
);
const ROLLING_WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github/workflows/rolling-ci-dispatch.yml'
  ),
  'utf8'
);
const SELECTOR = readFileSync(
  resolve(import.meta.dirname, '..', '..', 'run-affected-tests.mjs'),
  'utf8'
);

function event(overrides = {}) {
  return {
    action: 'synchronize',
    number: 42,
    repository: { full_name: REPO },
    pull_request: {
      number: 42,
      state: 'open',
      draft: false,
      base: { ref: 'main', sha: BASE, repo: { full_name: REPO } },
      head: {
        ref: 'codex/fix',
        sha: HEAD,
        repo: { full_name: REPO, fork: false },
      },
    },
    ...overrides,
  };
}
function detail(overrides = {}) {
  return {
    number: 42,
    state: 'open',
    draft: false,
    title: 'Fix conflict',
    html_url: 'https://github.com/JovieInc/Jovie/pull/42',
    user: { login: 'jovie-bot' },
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    base: { ref: 'main', sha: BASE, repo: { full_name: REPO } },
    head: {
      ref: 'codex/fix',
      sha: HEAD,
      repo: {
        full_name: REPO,
        name: 'Jovie',
        owner: { login: 'JovieInc' },
        fork: false,
      },
    },
    labels: [],
    mergeable: false,
    mergeable_state: 'dirty',
    ...overrides,
  };
}

function fxStatus(outcome, createdAt, attempt = 1) {
  return {
    context: CONFLICT_FX_STATUS_CONTEXT,
    state: outcome === 'pending' ? 'PENDING' : 'FAILURE',
    description: buildConflictFxStatusDescription({
      cohortId: 'shared-cohort',
      cap: 2,
      attempt,
      maxAttempts: CONFLICT_FX_MAX_ATTEMPTS,
      outcome,
      baseOid: BASE,
    }),
    targetUrl:
      'https://github.com/JovieInc/Jovie/actions/runs/123?base_ref=main',
    createdAt,
    creator: { login: 'jovie-bot[bot]', __typename: 'Bot' },
  };
}

function queueResponse(nodes = []) {
  return {
    data: {
      repository: {
        mergeQueue: {
          entries: {
            nodes,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  };
}

/** @param {unknown} queueResult */
function runEvent(payload, rest = detail(), queueResult = queueResponse()) {
  const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-event-'));
  try {
    const eventPath = join(dir, 'event.json');
    const planPath = join(dir, 'plan.json');
    const logPath = join(dir, 'gh.log');
    const fakeGh = join(dir, 'gh');
    writeFileSync(eventPath, JSON.stringify(payload));
    writeFileSync(
      fakeGh,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
const query = args.find(arg => arg.startsWith('query=')) ?? '';
let result;
if (args.some(arg => arg.endsWith('/pulls/42'))) result = JSON.parse(process.env.FAKE_REST);
else if (args.some(arg => arg.includes('pulls?state=open'))) result = [JSON.parse(process.env.FAKE_REST)];
else if (args.some(arg => arg.includes('/issues/16794/comments'))) result = [[]];
else if (query.includes('p0:pullRequest')) result = {data:{repository:{p0:JSON.parse(process.env.FAKE_META)}}};
else if (query.includes('c0:object')) result = {data:{repository:{c0:{oid:'${HEAD}',status:{contexts:[]}}}}};
else if (query.includes('mergeQueue(branch:')) result = JSON.parse(process.env.FAKE_QUEUE);
else { process.stderr.write('unexpected request ' + JSON.stringify(args)); process.exit(2); }
process.stdout.write(JSON.stringify(result));
`
    );
    chmodSync(fakeGh, 0o755);
    const meta = {
      number: 42,
      baseRefName: 'main',
      baseRefOid: BASE,
      headRefName: 'codex/fix',
      headRefOid: HEAD,
      headRepository: { name: 'Jovie', nameWithOwner: REPO },
      headRepositoryOwner: { login: 'JovieInc' },
      isCrossRepository: false,
      mergeable: rest.mergeable === false ? 'CONFLICTING' : 'MERGEABLE',
      mergeStateStatus: rest.mergeable_state.toUpperCase(),
      autoMergeRequest: null,
      changedFiles: 1,
      additions: 1,
      deletions: 1,
      maintainerCanModify: true,
    };
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--event-payload-file',
        eventPath,
        '--repo',
        REPO,
        '--dry-run',
        '--plan-file',
        planPath,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          FAKE_GH_LOG: logPath,
          FAKE_REST: JSON.stringify(rest),
          FAKE_META: JSON.stringify(meta),
          FAKE_QUEUE: JSON.stringify(queueResult),
        },
      }
    );
    return {
      result,
      plan: existsSync(planPath)
        ? JSON.parse(readFileSync(planPath, 'utf8'))
        : null,
      calls: (() => {
        try {
          return readFileSync(logPath, 'utf8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line));
        } catch {
          return [];
        }
      })(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
describe('exact PR conflict event boundary', () => {
  it('accepts only supported same-repository open ready events with exact SHA identity', () => {
    for (const action of ['opened', 'reopened', 'synchronize']) {
      expect(parseConflictEvent(event({ action }), REPO)).toMatchObject({
        number: 42,
        head: HEAD,
        base: BASE,
      });
    }
    const invalid = [
      { action: 'closed' },
      { number: '42' },
      { repository: { full_name: 'Other/Repo' } },
      { pull_request: { ...event().pull_request, draft: true } },
      { pull_request: { ...event().pull_request, state: 'closed' } },
      {
        pull_request: {
          ...event().pull_request,
          head: { ...event().pull_request.head, sha: 'bad' },
        },
      },
      {
        pull_request: {
          ...event().pull_request,
          base: { ...event().pull_request.base, ref: 'release' },
        },
      },
      {
        pull_request: {
          ...event().pull_request,
          head: {
            ...event().pull_request.head,
            repo: { full_name: REPO, fork: true },
          },
        },
      },
    ];
    for (const mutation of invalid)
      expect(parseConflictEvent(event(mutation), REPO)).toBeNull();
  });
  it('fails closed on missing REST identity, holds, or GraphQL identity overlay', () => {
    const scope = parseConflictEvent(event(), REPO);
    expect(matchesRawConflictPr(scope, detail())).toBe(true);
    expect(hasConflictHold([{ name: 'HOLD' }])).toBe(true);
    for (const changed of [
      { state: undefined },
      { draft: undefined },
      { labels: undefined },
      { labels: [{ name: 'gated' }] },
      { base: { ...detail().base, repo: undefined } },
      { head: { ...detail().head, sha: 'c'.repeat(40) } },
    ])
      expect(matchesRawConflictPr(scope, detail(changed))).toBe(false);
    const normalized = {
      number: 42,
      isDraft: false,
      baseRefName: 'main',
      headRefName: 'codex/fix',
      baseRefOid: BASE,
      headRefOid: HEAD,
      headRepository: { nameWithOwner: REPO },
      isCrossRepository: false,
      labels: [],
    };
    expect(matchesHydratedConflictPr(scope, normalized)).toBe(true);
    expect(
      matchesHydratedConflictPr(scope, {
        ...normalized,
        baseRefOid: 'c'.repeat(40),
      })
    ).toBe(false);
    expect(
      matchesHydratedConflictPr(scope, {
        ...normalized,
        headRepository: { nameWithOwner: 'Other/Repo' },
      })
    ).toBe(false);
  });
  it('rejects ready transitions before provider reads or repair actions', () => {
    const { result, plan, calls } = runEvent(
      event({ action: 'ready_for_review' })
    );
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toEqual([]);
    expect(plan.eventNonAction).toBe('invalid_or_unsupported_event');
    expect([plan.items, plan.fxMatrix, plan.exceptionMatrix]).toEqual([
      [],
      [],
      [],
    ]);
    expect(plan.summary.byAction).toEqual({});
  });
  it('rejects an invalid event without a fleet query or claim', () => {
    const { result, plan, calls } = runEvent(event({ action: 'closed' }));
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toEqual([]);
    expect(plan.eventNonAction).toBe('invalid_or_unsupported_event');
    expect(plan.fxMatrix).toEqual([]);
    const missingPath = spawnSync(
      process.execPath,
      [SCRIPT, '--event-payload-file'],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: '/nonexistent' },
      }
    );
    expect(missingPath.status).not.toBe(0);
    expect(missingPath.stderr).toContain(
      '--event-payload-file requires a path'
    );
    const declaredEvent = spawnSync(
      process.execPath,
      [SCRIPT, '--repo', REPO],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request_target',
          PATH: '/nonexistent',
        },
      }
    );
    expect(declaredEvent.status).not.toBe(0);
    expect(declaredEvent.stderr).toContain(
      'pull_request_target requires --event-payload-file'
    );
  });
  it('keeps the legacy manual dry-run fleet path available', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-manual-'));
    try {
      const fakeGh = join(dir, 'gh');
      const planPath = join(dir, 'plan.json');
      const logPath = join(dir, 'gh.log');
      writeFileSync(
        fakeGh,
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
if (args.some(arg => arg.includes('pulls?state=open'))) process.stdout.write('[]');
else if (args.some(arg => arg.includes('/issues/16794/comments'))) process.stdout.write('[[]]');
else process.exit(2);
`
      );
      chmodSync(fakeGh, 0o755);
      const result = spawnSync(
        process.execPath,
        [SCRIPT, '--dry-run', '--repo', REPO, '--plan-file', planPath],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            PATH: `${dir}:${process.env.PATH}`,
            FAKE_GH_LOG: logPath,
          },
        }
      );
      expect(result.status, result.stderr).toBe(0);
      const plan = JSON.parse(readFileSync(planPath, 'utf8'));
      expect(plan.summary.total).toBe(0);
      expect(plan.eventScope).toBeUndefined();
      const calls = readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      expect(
        calls.some(args => args.some(arg => arg.includes('pulls?state=open')))
      ).toBe(true);
      expect(calls.some(args => args.includes('-X'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('binds the FX matrix to the exact dirty event PR while reading shared capacity', () => {
    const { result, plan, calls } = runEvent(event());
    expect(result.status, result.stderr).toBe(0);
    expect(calls.some(args => args.includes(`repos/${REPO}/pulls/42`))).toBe(
      true
    );
    expect(
      calls.some(args => args.some(arg => arg.includes('pulls?state=open')))
    ).toBe(true);
    expect(calls.some(args => args.includes('-X'))).toBe(false);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].state).toBe('DIRTY');
    expect(plan.fxMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prNumber: 42,
          headRefOid: HEAD,
          baseRefOid: BASE,
        }),
      ])
    );
  });
  it('covers the real CLI event entrypoint with exact read, hydration drift, and UNKNOWN nonactions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-cli-'));
    const eventPath = join(dir, 'event.json');
    const planPath = join(dir, 'plan.json');
    writeFileSync(eventPath, JSON.stringify(event()));
    try {
      await expect(
        runConflictCli(['--event-payload-file'], {
          request: async () => {
            throw new Error('no provider read is allowed');
          },
        })
      ).rejects.toThrow('--event-payload-file requires a path');
      const previousEventName = process.env.GITHUB_EVENT_NAME;
      process.env.GITHUB_EVENT_NAME = 'pull_request_target';
      try {
        await expect(
          runConflictCli([], {
            request: async () => {
              throw new Error('no provider read is allowed');
            },
          })
        ).rejects.toThrow('pull_request_target requires --event-payload-file');
      } finally {
        if (previousEventName === undefined)
          delete process.env.GITHUB_EVENT_NAME;
        else process.env.GITHUB_EVENT_NAME = previousEventName;
      }
      for (const scenario of [
        'dirty',
        'transientUnknown',
        'drift',
        'unknown',
        'behind',
        'held',
        'queued',
        'invalid',
      ]) {
        const calls = [];
        let exactReads = 0;
        const rest =
          scenario === 'unknown'
            ? detail({ mergeable: null, mergeable_state: 'unknown' })
            : scenario === 'behind'
              ? detail({ mergeable: true, mergeable_state: 'behind' })
              : scenario === 'held'
                ? detail({ labels: [{ name: 'hold' }] })
                : detail();
        writeFileSync(
          eventPath,
          JSON.stringify(
            scenario === 'invalid' ? event({ action: 'closed' }) : event()
          )
        );
        const request = async args => {
          calls.push(args);
          if (args.includes(`repos/${REPO}/pulls/42`)) {
            exactReads += 1;
            return scenario === 'transientUnknown' && exactReads === 1
              ? detail({ mergeable: null, mergeable_state: 'unknown' })
              : rest;
          }
          if (args.some(arg => arg.includes('pulls?state=open'))) return [rest];
          if (args.some(arg => arg.includes('/issues/16794/comments')))
            return [[]];
          const query = args.find(arg => arg.startsWith('query=')) ?? '';
          if (query.includes('p0:pullRequest'))
            return {
              data: {
                repository: {
                  p0: {
                    number: 42,
                    baseRefName: 'main',
                    baseRefOid: scenario === 'drift' ? 'c'.repeat(40) : BASE,
                    headRefName: 'codex/fix',
                    headRefOid: HEAD,
                    headRepository: { name: 'Jovie', nameWithOwner: REPO },
                    headRepositoryOwner: { login: 'JovieInc' },
                    isCrossRepository: false,
                    mergeable:
                      scenario === 'behind' ? 'MERGEABLE' : 'CONFLICTING',
                    mergeStateStatus:
                      scenario === 'behind' ? 'BEHIND' : 'DIRTY',
                    autoMergeRequest: null,
                    changedFiles: 1,
                    additions: 1,
                    deletions: 1,
                    maintainerCanModify: true,
                  },
                },
              },
            };
          if (query.includes('c0:object'))
            return {
              data: {
                repository: { c0: { oid: HEAD, status: { contexts: [] } } },
              },
            };
          if (query.includes('mergeQueue(branch:'))
            return queueResponse(
              scenario === 'queued'
                ? [{ position: 1, pullRequest: { number: 42 } }]
                : []
            );
          throw new Error(`unexpected request: ${args[0]}`);
        };
        await runConflictCli(
          [
            '--event-payload-file',
            eventPath,
            '--repo',
            REPO,
            '--apply',
            '--plan-file',
            planPath,
          ],
          { request }
        );
        const plan = JSON.parse(readFileSync(planPath, 'utf8'));
        expect(
          calls.some(args => args.some(arg => arg.includes('pulls?state=open')))
        ).toBe(['dirty', 'transientUnknown'].includes(scenario));
        if (['dirty', 'transientUnknown'].includes(scenario)) {
          expect(plan.items).toHaveLength(1);
          expect(plan.fxMatrix[0]).toMatchObject({
            prNumber: 42,
            headRefOid: HEAD,
            baseRefOid: BASE,
          });
        } else {
          expect(plan.fxMatrix).toEqual([]);
          expect(plan.eventNonAction).toBe(
            {
              drift: 'hydrated_event_identity_or_hold_changed',
              unknown: 'mergeability_unknown_after_exact_reread',
              behind: 'event_pr_not_dirty',
              held: 'event_live_identity_or_hold_changed',
              queued: 'event_pr_in_native_queue',
              invalid: 'invalid_or_unsupported_event',
            }[scenario]
          );
        }
        if (scenario === 'unknown') expect(calls).toHaveLength(3);
        if (scenario === 'transientUnknown') expect(exactReads).toBe(2);
        if (scenario === 'invalid') expect(calls).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('reserves shared pending capacity without admitting observer PRs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-capacity-'));
    const eventPath = join(dir, 'event.json');
    writeFileSync(eventPath, JSON.stringify(event()));
    const heads = [HEAD, 'c'.repeat(40), 'd'.repeat(40)];
    const summaries = heads.map((sha, index) =>
      detail({
        number: 42 + index,
        head: { ...detail().head, ref: `codex/pr-${42 + index}`, sha },
      })
    );
    summaries[0] = detail();
    const metadata = summaries.map(summary => ({
      number: summary.number,
      baseRefName: 'main',
      baseRefOid: BASE,
      headRefName: summary.head.ref,
      headRefOid: summary.head.sha,
      headRepository: { name: 'Jovie', nameWithOwner: REPO },
      headRepositoryOwner: { login: 'JovieInc' },
      isCrossRepository: false,
      mergeable: 'CONFLICTING',
      mergeStateStatus: 'DIRTY',
      autoMergeRequest: null,
      changedFiles: 1,
      additions: 1,
      deletions: 1,
      maintainerCanModify: true,
    }));
    const newer = new Date().toISOString();
    const older = new Date(Date.now() - 10_000).toISOString();
    async function planFor(
      name,
      observerStatuses,
      history = [[]],
      incompleteStatus = false,
      inventoryDrift = false,
      observedEventStatuses = [],
      inventoryNotDirty = false,
      inventoryQueued = false
    ) {
      const planPath = join(dir, `${name}.json`);
      const calls = [];
      let inventorySeen = false;
      const request = async args => {
        calls.push(args);
        if (args.includes(`repos/${REPO}/pulls/42`)) return summaries[0];
        if (args.some(arg => arg.includes('pulls?state=open')))
          return summaries;
        if (args.some(arg => arg.includes('/issues/16794/comments')))
          return history;
        const query = args.find(arg => arg.startsWith('query=')) ?? '';
        if (query.includes('p0:pullRequest')) {
          const repository = { p0: metadata[0] };
          if (query.includes('p1:pullRequest')) {
            inventorySeen = true;
            if (inventoryDrift)
              repository.p0 = { ...metadata[0], headRefOid: 'e'.repeat(40) };
            if (inventoryNotDirty)
              repository.p0 = {
                ...metadata[0],
                mergeable: 'MERGEABLE',
                mergeStateStatus: 'CLEAN',
              };
            repository.p1 = metadata[1];
            repository.p2 = metadata[2];
          }
          return { data: { repository } };
        }
        if (query.includes('c0:object')) {
          const repository = {
            c0: {
              oid:
                query.includes('c1:object') && inventoryDrift
                  ? 'e'.repeat(40)
                  : heads[0],
              status: {
                contexts: query.includes('c1:object')
                  ? observedEventStatuses
                  : [],
              },
            },
          };
          if (query.includes('c1:object')) {
            repository.c1 = {
              oid: heads[1],
              status: { contexts: observerStatuses[0] },
            };
            repository.c2 = {
              oid: heads[2],
              status: incompleteStatus
                ? { contexts: null }
                : { contexts: observerStatuses[1] },
            };
          }
          return { data: { repository } };
        }
        if (query.includes('mergeQueue(branch:'))
          return queueResponse(
            inventoryQueued && inventorySeen
              ? [{ position: 1, pullRequest: { number: 42 } }]
              : []
          );
        throw new Error(`unexpected request: ${args[0]}`);
      };
      await runConflictCli(
        [
          '--event-payload-file',
          eventPath,
          '--repo',
          REPO,
          '--dry-run',
          '--plan-file',
          planPath,
        ],
        { request }
      );
      return { plan: JSON.parse(readFileSync(planPath, 'utf8')), calls };
    }
    try {
      const observed = (name, statuses) =>
        planFor(name, [[], []], [[]], false, false, statuses);
      const pending = [fxStatus('pending', newer)];
      const full = await planFor('full', [pending, pending]);
      expect(full.plan.capacity.adaptive.pendingRemediations).toBe(2);
      expect(full.plan.capacity.availableCiSlots).toBe(0);
      expect(full.plan.fxMatrix).toEqual([]);
      expect(full.plan.items.map(item => item.number)).toEqual([42]);
      expect(
        full.calls.flat().some(arg => arg.includes('pulls?state=open'))
      ).toBe(true);
      const recovered = await planFor('recovered', [
        [fxStatus('pending', older), fxStatus('exhausted', newer)],
        pending,
      ]);
      expect(recovered.plan.capacity.adaptive.pendingRemediations).toBe(1);
      expect(recovered.plan.capacity.availableCiSlots).toBe(1);
      expect(recovered.plan.fxMatrix.map(item => item.prNumber)).toEqual([42]);
      const noClaims = await planFor('no-claims', [[], []]);
      expect(noClaims.plan.capacity.availableCiSlots).toBe(1);
      const newlyPending = await observed('newly-pending', pending);
      expect(newlyPending.plan.fxMatrix).toEqual([]);
      expect(newlyPending.plan.items.map(item => item.number)).toEqual([42]);
      expect(newlyPending.plan.items[0].action).toBe('wait_conflict_fx');
      const exhausted = await observed('newly-exhausted', [
        fxStatus('exhausted', newer, CONFLICT_FX_MAX_ATTEMPTS),
      ]);
      expect(exhausted.plan.fxMatrix).toEqual([]);
      expect(exhausted.plan.exceptionMatrix).toEqual([
        expect.objectContaining({
          prNumber: 42,
          attempt: CONFLICT_FX_MAX_ATTEMPTS,
          maxAttempts: CONFLICT_FX_MAX_ATTEMPTS,
        }),
      ]);
      expect(exhausted.plan.items[0].action).toBe('emit_steering_exception');
      expect(exhausted.plan.items[0].triggersCi).toBe(false);
      const drift = await planFor(
        'inventory-drift',
        [[], []],
        [[]],
        false,
        true
      );
      expect(drift.plan.eventNonAction).toBe(
        'capacity_inventory_event_identity_changed'
      );
      expect(drift.plan.items).toEqual([]);
      const clean = await planFor(
        'observer-clean',
        [[], []],
        [[]],
        false,
        false,
        [],
        true
      );
      expect(clean.plan.eventNonAction).toBe(
        'capacity_inventory_event_not_dirty'
      );
      expect(clean.plan.items).toEqual([]);
      const queued = await planFor(
        'observer-queued',
        [[], []],
        [[]],
        false,
        false,
        [],
        false,
        true
      );
      expect(queued.plan.eventNonAction).toBe(
        'capacity_inventory_event_in_native_queue'
      );
      expect(queued.plan.items).toEqual([]);
      await expect(planFor('missing-history', [[], []], [])).rejects.toThrow(
        'cohort history pagination omitted complete capacity evidence'
      );
      await expect(
        planFor('partial-status', [[], []], [[]], true)
      ).rejects.toThrow('omitted complete capacity evidence');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('fails closed when exact native queue inventory is unavailable', () => {
    const unavailable = runEvent(event(), detail(), {
      data: { repository: {} },
    });
    expect(unavailable.result.status).not.toBe(0);
    expect(unavailable.plan).toBeNull();
    expect(
      unavailable.calls.some(args =>
        args.some(arg => arg.includes('pulls?state=open'))
      )
    ).toBe(false);
  });
  it('executes both live writer identity predicates against held and stale fixtures', () => {
    const identityFilters = WORKFLOW.split('\n')
      .filter(
        line =>
          line.includes('.baseRepo == $repo') && line.includes('all(.labels[]')
      )
      .map(line => line.trim().match(/^'(.+)' \\$/u)?.[1]);
    expect(identityFilters).toHaveLength(2);
    for (const filter of identityFilters) {
      expect(filter).toBeTruthy();
      const input = {
        state: 'open',
        draft: false,
        autoMerge: false,
        baseRepo: REPO,
        headRepo: REPO,
        fork: false,
        head: HEAD,
        base: BASE,
        baseRef: 'main',
        ref: 'codex/fix',
        labels: [],
      };
      const args = [
        '-e',
        '--arg',
        'repo',
        REPO,
        '--arg',
        'head',
        HEAD,
        '--arg',
        'base',
        BASE,
        '--arg',
        'baseRef',
        'main',
        '--arg',
        'ref',
        'codex/fix',
        '--argjson',
        'draft',
        'false',
        '--argjson',
        'autoMerge',
        'false',
        filter,
      ];
      const check = candidate =>
        spawnSync('jq', args, {
          input: JSON.stringify(candidate),
          encoding: 'utf8',
        });
      expect(check(input).status).toBe(0);
      for (const changed of [
        { labels: ['hold'] },
        { labels: ['GATED'] },
        { labels: ['incident'] },
        { labels: null },
        { head: 'c'.repeat(40) },
        { baseRepo: 'Other/Repo' },
      ])
        expect(check({ ...input, ...changed }).status).toBe(1);
    }
  });
  it('binds workflow trigger, event file, trusted checkout and live hold/queue gates', () => {
    expect(WORKFLOW).toMatch(
      /pull_request_target:\s+types: \[opened, reopened, synchronize\]/u
    );
    expect(WORKFLOW).toContain('ref: main');
    expect(WORKFLOW).toContain('persist-credentials: false');
    expect(WORKFLOW).toContain(
      'event_args=(--event-payload-file "$EVENT_PAYLOAD_PATH")'
    );
    expect(WORKFLOW).toContain('queue_before_claim');
    expect(WORKFLOW).toMatch(
      /if:\s+>-[\s\S]*?github\.event_name != 'workflow_run'[\s\S]*?github\.event\.workflow_run\.conclusion != 'cancelled'/u
    );
    expect(WORKFLOW).toMatch(
      /concurrency:\n  group: jovie-fx-shared-canary-slot-\$\{\{ github\.repository \}\}\n  cancel-in-progress: false\n  queue: max/u
    );
    expect(WORKFLOW).toContain('queue_before');
    expect(
      WORKFLOW.match(
        /event_args=\(--event-payload-file "\$EVENT_PAYLOAD_PATH"\)/gu
      )
    ).toHaveLength(2);
    expect(WORKFLOW).toContain(
      'if node scripts/pr-conflict-handler.mjs --dry-run "${event_args[@]}"'
    );
    expect(WORKFLOW.match(/IN\("hold", "gated", "incident"\)/gu)).toHaveLength(
      2
    );
    expect(SELECTOR).toContain(
      "'scripts/lib/__tests__/pr-conflict-event.test.mjs'"
    );
    expect(SELECTOR).toContain(
      "'--coverage.include=lib/pr-conflict-event.mjs'"
    );
    expect(SELECTOR).toContain("'--coverage.include=pr-conflict-handler.mjs'");
  });
});

describe('shared hosted conflict slot', () => {
  it('shares one stable non-cancelling repository slot across the two existing workflows', () => {
    const sharedGroup = workflow =>
      workflow.match(
        /^concurrency:\n  group: (.+)\n  cancel-in-progress: false\n  queue: max$/mu
      )?.[1];
    expect(sharedGroup(WORKFLOW)).toBe(
      'jovie-fx-shared-canary-slot-${{ github.repository }}'
    );
    expect(sharedGroup(ROLLING_WORKFLOW)).toBe(sharedGroup(WORKFLOW));
    expect(WORKFLOW).toMatch(
      /group: pr-conflict-handler-[^\n]+\n\s+cancel-in-progress: false\n\s+queue: max/u
    );
    expect(WORKFLOW).toContain(
      'group: pr-conflict-fx-${{ github.repository }}-${{ matrix.prNumber }}'
    );
    expect(WORKFLOW).not.toContain('cancel-in-progress: ${{');
    expect(WORKFLOW).toContain(
      'pause new intake without changing the enable switch, canary PR, or HA writer'
    );
    expect(WORKFLOW).toContain(
      'drain both workflow queues/runs and all work already accepted by'
    );
    expect(ROLLING_WORKFLOW).toContain(
      'pause new intake without changing canary'
    );
    expect(ROLLING_WORKFLOW).toContain(
      'before changing controls or restoring intake'
    );
    expect(ROLLING_WORKFLOW).toContain('hosted-live-canary');
    expect(ROLLING_WORKFLOW).toContain('FX_HOSTED_REMEDIATION_ENABLED=true');
  });
});
