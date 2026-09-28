import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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
const CANARY_APPLY_ENV = {
  FX_HOSTED_REMEDIATION_ENABLED: 'true',
  FX_HOSTED_REMEDIATION_CANARY_PR: '42',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: REPO,
};

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

function workflowRunScript(workflow, name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  if (start < 0) throw new Error(`workflow step not found: ${name}`);
  const next = workflow.indexOf('\n      - name:', start + 1);
  const block = workflow.slice(start, next < 0 ? undefined : next);
  const marker = '        run: |\n';
  const runStart = block.indexOf(marker);
  if (runStart < 0) throw new Error(`workflow run block not found: ${name}`);
  return block
    .slice(runStart + marker.length)
    .split('\n')
    .map(line => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n')
    .replace(/\n+$/u, '');
}

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

async function withCanaryEnv(overrides, callback) {
  for (const [key, value] of Object.entries({
    ...CANARY_APPLY_ENV,
    ...overrides,
  })) {
    vi.stubEnv(key, value);
  }
  try {
    return await callback();
  } finally {
    vi.unstubAllEnvs();
  }
}

async function withTempDir(prefix, callback) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function githubPullRequestMetadata(pr) {
  return {
    number: pr.number,
    baseRefName: pr.base.ref,
    baseRefOid: pr.base.sha,
    headRefName: pr.head.ref,
    headRefOid: pr.head.sha,
    headRepository: { name: 'Jovie', nameWithOwner: REPO },
    headRepositoryOwner: { login: 'JovieInc' },
    isCrossRepository: false,
    mergeable: pr.mergeable ? 'MERGEABLE' : 'CONFLICTING',
    mergeStateStatus: pr.mergeable_state.toUpperCase(),
    autoMergeRequest: null,
    changedFiles: 1,
    additions: 1,
    deletions: 1,
    maintainerCanModify: true,
  };
}

function createApplyClient({
  summaries,
  statusByPr = {},
  issueHistory = [[]],
  currentPrByNumber = {},
  queueForCall = (_callNumber = 0) => queueResponse(),
}) {
  const calls = [];
  const readTokens = [];
  let queueCalls = 0;
  const request = async (args, options = {}) => {
    calls.push(args);
    if (options.token) readTokens.push(options.token);
    if (args.some(arg => arg.includes('pulls?state=open'))) return summaries;
    if (args.some(arg => arg.includes('/issues/16794/comments')))
      return issueHistory;
    const query = args.find(arg => arg.startsWith('query=')) ?? '';
    if (query.includes('p0:pullRequest')) {
      return {
        data: {
          repository: Object.fromEntries(
            summaries.map((pr, index) => [
              `p${index}`,
              githubPullRequestMetadata(pr),
            ])
          ),
        },
      };
    }
    if (query.includes('c0:object')) {
      return {
        data: {
          repository: Object.fromEntries(
            summaries.map((pr, index) => [
              `c${index}`,
              {
                oid: pr.head.sha,
                status: {
                  contexts: Object.hasOwn(statusByPr, pr.number)
                    ? statusByPr[pr.number]
                    : [],
                },
              },
            ])
          ),
        },
      };
    }
    if (query.includes('mergeQueue(branch:')) return queueForCall(++queueCalls);
    const pull = args.find(arg => arg.startsWith(`repos/${REPO}/pulls/`));
    if (pull) return currentPrByNumber[Number(pull.split('/').at(-1))];
    throw new Error(`unexpected request: ${args.join(' ')}`);
  };
  return {
    calls,
    readTokens,
    request,
    get queueCalls() {
      return queueCalls;
    },
  };
}

function fxStatus(outcome, createdAt, attempt = 1, cohortId = 'shared-cohort') {
  return {
    context: CONFLICT_FX_STATUS_CONTEXT,
    state: outcome === 'pending' ? 'PENDING' : 'FAILURE',
    description: buildConflictFxStatusDescription({
      cohortId,
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
function runEvent(
  payload,
  rest = detail(),
  queueResult = queueResponse(),
  extraArgs = []
) {
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
        ...extraArgs,
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

function runRawCanaryCli({
  payload,
  eventName,
  enabled = 'true',
  canary = '42',
}) {
  const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-canary-cli-'));
  try {
    const eventPath = join(dir, 'event.json');
    const planPath = join(dir, 'plan.json');
    const callsPath = join(dir, 'gh.log');
    const fakeGh = join(dir, 'gh');
    writeFileSync(eventPath, JSON.stringify(payload));
    writeFileSync(
      fakeGh,
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
process.exit(2);
`
    );
    chmodSync(fakeGh, 0o755);
    const args = [SCRIPT, '--repo', REPO, '--apply', '--plan-file', planPath];
    if (eventName === 'pull_request_target')
      args.push('--event-payload-file', eventPath);
    const result = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FAKE_GH_LOG: callsPath,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: REPO,
        FX_HOSTED_REMEDIATION_ENABLED: enabled,
        FX_HOSTED_REMEDIATION_CANARY_PR: canary,
      },
    });
    return {
      result,
      plan: existsSync(planPath)
        ? JSON.parse(readFileSync(planPath, 'utf8'))
        : null,
      calls: existsSync(callsPath)
        ? readFileSync(callsPath, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line))
        : [],
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('single configured conflict canary boundary', () => {
  it('fails closed in the raw CLI for disabled or malformed config before any provider request', () => {
    for (const [enabled, canary] of [
      ['false', '42'],
      ['true', ''],
      ['true', '042'],
      ['true', 'not-a-pr'],
    ]) {
      const { result, calls, plan } = runRawCanaryCli({
        payload: event(),
        eventName: 'pull_request_target',
        enabled,
        canary,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('apply requires');
      expect(calls).toEqual([]);
      expect(plan).toBeNull();
    }
  });

  it('turns wrong, empty, or conflicting event associations into no-op plans without fleet reads', () => {
    const otherPr = event({
      number: 43,
      pull_request: { ...event().pull_request, number: 43 },
    });
    const wrongPr = runRawCanaryCli({
      payload: otherPr,
      eventName: 'pull_request_target',
    });
    expect(wrongPr.result.status).toBe(0);
    expect(wrongPr.calls).toEqual([]);
    expect(wrongPr.plan.eventNonAction).toBe('event_outside_configured_canary');
    expect(wrongPr.plan.items).toEqual([]);

    for (const pull_requests of [
      [],
      [{ number: 43 }],
      [{ number: 42 }, { number: 43 }],
    ]) {
      const result = runRawCanaryCli({
        payload: { workflow_run: { pull_requests } },
        eventName: 'workflow_run',
      });
      expect(result.result.status).toBe(0);
      expect(result.calls).toEqual([]);
      expect(result.plan.eventNonAction).toBe(
        'workflow_run_association_missing_ambiguous_or_outside_canary'
      );
      expect(result.plan.items).toEqual([]);
    }
  });

  it('keeps valid manual apply scoped to the configured PR while reading global capacity inventory', async () => {
    await withCanaryEnv({}, () =>
      withTempDir('jovie-conflict-canary-scope-', async dir => {
        const planPath = join(dir, 'plan.json');
        const summaries = [
          detail(),
          detail({
            number: 43,
            head: { ...detail().head, ref: 'codex/other', sha: 'c'.repeat(40) },
          }),
        ];
        const client = createApplyClient({ summaries });
        await runConflictCli(
          [
            '--apply',
            '--allow-paid-escalation',
            '--repo',
            REPO,
            '--max-concurrent',
            '40',
            '--plan-file',
            planPath,
          ],
          { request: client.request }
        );
        const plan = JSON.parse(readFileSync(planPath, 'utf8'));
        expect(plan.items.map(item => item.number)).toEqual([42]);
        expect(plan.fxMatrix.map(item => item.prNumber)).toEqual([42]);
        expect(plan.capacity.maxConcurrent).toBe(1);
        expect(plan.capacity.availableCiSlots).toBeLessThanOrEqual(1);
        expect(
          client.calls.some(args =>
            args.some(arg => arg.includes('pulls?state=open'))
          )
        ).toBe(true);
        expect(
          client.calls.some(args =>
            args.some(arg => arg.includes('/issues/16794/comments'))
          )
        ).toBe(true);
        expect(client.calls.some(args => args.includes('-X'))).toBe(false);
      })
    );
  });

  it('uses complete non-event apply capacity evidence without admitting clean observers as targets', async () => {
    await withCanaryEnv(
      {
        GH_TOKEN: 'read-only-test-token',
        GH_QUEUE_TOKEN: 'read-only-test-token',
        GH_MUTATION_TOKEN: 'unused-test-mutation-token',
      },
      async () => {
        for (const scenario of [
          'observer-pending',
          'malformed-observer-status',
          'malformed-cohort-history',
        ]) {
          await withTempDir(
            `jovie-conflict-capacity-${scenario}-`,
            async dir => {
              const planPath = join(dir, 'plan.json');
              const observerHead = 'c'.repeat(40);
              const summaries = [
                detail({ mergeable: true, mergeable_state: 'behind' }),
                detail({
                  number: 43,
                  title: 'Clean capacity observer',
                  head: {
                    ...detail().head,
                    ref: 'codex/observer',
                    sha: observerHead,
                  },
                  mergeable: true,
                  mergeable_state: 'clean',
                }),
              ];
              const createdAt = new Date(Date.now() - 10_000).toISOString();
              const observerContexts =
                scenario === 'observer-pending'
                  ? [
                      fxStatus('pending', createdAt, 1, 'observer-claim-one'),
                      fxStatus('pending', createdAt, 1, 'observer-claim-two'),
                    ]
                  : [];
              const client = createApplyClient({
                summaries,
                statusByPr: {
                  43:
                    scenario === 'malformed-observer-status'
                      ? null
                      : observerContexts,
                },
                issueHistory:
                  scenario === 'malformed-cohort-history' ? null : [[]],
                currentPrByNumber: {
                  42: detail({ mergeable: true, mergeable_state: 'behind' }),
                },
              });
              let rebaseCalls = 0;
              const rebaseImpl = async () => {
                rebaseCalls += 1;
                throw new Error('capacity rejection must not invoke rebase');
              };

              if (scenario === 'observer-pending') {
                await runConflictCli(
                  [
                    '--apply',
                    '--repo',
                    REPO,
                    '--max-concurrent',
                    '40',
                    '--plan-file',
                    planPath,
                  ],
                  { request: client.request, rebaseImpl }
                );
                const plan = JSON.parse(readFileSync(planPath, 'utf8'));
                expect(plan.items.map(item => item.number)).toEqual([42]);
                expect(plan.items[0].action).toBe('wait_capacity');
                expect(plan.fxMatrix).toEqual([]);
                expect(plan.capacity.adaptive.pendingRemediations).toBe(2);
                expect(plan.capacity.availableCiSlots).toBe(0);
                expect(
                  client.calls.some(args =>
                    args.some(arg => arg.includes('pulls?state=open'))
                  )
                ).toBe(true);
                expect(
                  client.calls.some(args =>
                    args.some(arg => arg.includes('/issues/16794/comments'))
                  )
                ).toBe(true);
              } else {
                const message =
                  scenario === 'malformed-observer-status'
                    ? 'GraphQL statuses for PR #43 omitted complete capacity evidence'
                    : 'cohort history pagination omitted complete capacity evidence';
                await expect(
                  runConflictCli(
                    ['--apply', '--repo', REPO, '--plan-file', planPath],
                    { request: client.request, rebaseImpl }
                  )
                ).rejects.toThrow(message);
                expect(existsSync(planPath)).toBe(false);
                expect(
                  client.calls.some(args =>
                    args.some(arg => arg.includes('mergeQueue(branch:'))
                  )
                ).toBe(false);
              }
              expect(rebaseCalls).toBe(0);
            }
          );
        }
      }
    );
  });

  it('revalidates non-event rebase holds and native queue immediately before mutation', async () => {
    await withCanaryEnv(
      {
        GH_TOKEN: 'read-only-test-token',
        GH_QUEUE_TOKEN: 'read-only-test-token',
        GH_MUTATION_TOKEN: 'writer-test-token',
      },
      async () => {
        for (const scenario of ['held', 'queued', 'eligible']) {
          await withTempDir(`jovie-conflict-rebase-${scenario}-`, async dir => {
            const planPath = join(dir, 'plan.json');
            const summary = detail({
              mergeable: true,
              mergeable_state: 'behind',
            });
            const fresh =
              scenario === 'held'
                ? detail({
                    mergeable: true,
                    mergeable_state: 'behind',
                    labels: [{ name: 'hold' }],
                  })
                : summary;
            const client = createApplyClient({
              summaries: [summary],
              currentPrByNumber: { 42: fresh },
              queueForCall: queueCalls =>
                queueResponse(
                  scenario === 'queued' && queueCalls > 1
                    ? [{ position: 1, pullRequest: { number: 42 } }]
                    : []
                ),
            });
            const boundaries = [];
            let mutationAttempted = false;
            const rebaseImpl = async options => {
              const boundary = await options.preMutationCheckImpl({
                prNumber: 42,
                expectedBaseRefName: 'main',
                expectedBaseOid: BASE,
                expectedHeadOid: HEAD,
                timeoutMs: 1000,
              });
              boundaries.push(boundary);
              if (boundary.ok) mutationAttempted = true;
              return {
                ok: boundary.ok,
                mutationAttempted,
                mutationApplied: mutationAttempted,
                conflict: false,
                category: boundary.category,
                reason: boundary.reason,
                action: 'request_github_rebase',
              };
            };
            const run = runConflictCli(
              ['--apply', '--repo', REPO, '--plan-file', planPath],
              { request: client.request, rebaseImpl }
            );
            if (scenario === 'eligible') await run;
            else
              await expect(run).rejects.toThrow(
                'conflict-controller mutations failed closed'
              );
            const plan = JSON.parse(readFileSync(planPath, 'utf8'));
            expect(boundaries).toHaveLength(1);
            const [boundary] = boundaries;
            expect(plan.items).toMatchObject([
              {
                number: 42,
                pr: { number: 42 },
                action: 'request_github_rebase',
              },
            ]);
            expect(boundary).toMatchObject({ ok: scenario === 'eligible' });
            expect(mutationAttempted).toBe(scenario === 'eligible');
            expect(
              client.calls.some(args =>
                args.some(arg => arg.includes('c0:object'))
              )
            ).toBe(true);
            expect(
              client.calls.some(args =>
                args.some(arg => arg.includes('/issues/16794/comments'))
              )
            ).toBe(true);
            expect(
              client.calls.some(args => args.includes(`repos/${REPO}/pulls/42`))
            ).toBe(true);
            expect(client.readTokens.length).toBeGreaterThan(0);
            expect(
              client.readTokens.every(token => token === 'read-only-test-token')
            ).toBe(true);
            if (scenario === 'held') {
              expect(boundary.category).toBe('stale_pr');
              expect(client.queueCalls).toBe(1);
            } else if (scenario === 'queued') {
              expect(boundary.category).toBe('native_queue');
              expect(client.queueCalls).toBe(2);
            } else {
              expect(boundary.reason).toContain('revalidated before rebase');
              expect(client.queueCalls).toBe(2);
            }
            expect(client.calls.flat().some(arg => arg === '-X')).toBe(false);
          });
        }
      }
    );
  });
});

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
  it('JOV-6233: denies paid FX for the automatic pull_request_target event instead of escalating', () => {
    // pull_request_target (opened/reopened/synchronize) is the automatic
    // event path the JOV-6232 cost audit flagged: it must never reach paid
    // model spend on its own. Only an explicit workflow_dispatch apply may
    // set --allow-paid-escalation (see .github/workflows/pr-conflict-handler.yml).
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
    expect(plan.items[0].action).toBe('deny_conflict_fx_unauthorized');
    expect(plan.fxMatrix).toEqual([]);
  });

  it('binds the FX matrix to the exact dirty event PR once paid escalation is explicitly authorized', () => {
    const { result, plan, calls } = runEvent(event(), detail(), undefined, [
      '--allow-paid-escalation',
    ]);
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
      const applyEnvKeys = [
        'FX_HOSTED_REMEDIATION_ENABLED',
        'FX_HOSTED_REMEDIATION_CANARY_PR',
        'GITHUB_EVENT_NAME',
        'GITHUB_REPOSITORY',
      ];
      const priorApplyEnv = Object.fromEntries(
        applyEnvKeys.map(key => [key, process.env[key]])
      );
      try {
        process.env.FX_HOSTED_REMEDIATION_ENABLED = 'true';
        process.env.FX_HOSTED_REMEDIATION_CANARY_PR = '42';
        process.env.GITHUB_EVENT_NAME = 'pull_request_target';
        process.env.GITHUB_REPOSITORY = REPO;
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
            if (args.some(arg => arg.includes('pulls?state=open')))
              return [rest];
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
            calls.some(args =>
              args.some(arg => arg.includes('pulls?state=open'))
            )
          ).toBe(['dirty', 'transientUnknown'].includes(scenario));
          if (['dirty', 'transientUnknown'].includes(scenario)) {
            // pull_request_target is an automatic event: it must deny paid
            // FX escalation (JOV-6233), not silently reach the AI Gateway.
            expect(plan.items).toHaveLength(1);
            expect(plan.items[0].action).toBe('deny_conflict_fx_unauthorized');
            expect(plan.fxMatrix).toEqual([]);
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
        for (const key of applyEnvKeys) {
          if (priorApplyEnv[key] === undefined) delete process.env[key];
          else process.env[key] = priorApplyEnv[key];
        }
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
          '--allow-paid-escalation',
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
          line.includes('.baseRepo == $repo') &&
          line.includes('.autoMerge == $autoMerge') &&
          line.includes('all(.labels[]')
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
    expect(WORKFLOW).toContain(
      'FX_HOSTED_REMEDIATION_ENABLED: ${{ vars.FX_HOSTED_REMEDIATION_ENABLED }}'
    );
    expect(WORKFLOW).toContain(
      'FX_HOSTED_REMEDIATION_CANARY_PR: ${{ vars.FX_HOSTED_REMEDIATION_CANARY_PR }}'
    );
    expect(WORKFLOW).toContain('MAX_CONCURRENT=1');
    expect(WORKFLOW).toContain('(.items | type == "array" and length <= 1)');
    expect(WORKFLOW).toContain(
      'all(.items[]?; .number == $canary and .pr.number == $canary)'
    );
    expect(WORKFLOW).toContain('(.capacity.maxConcurrent == 1)');
    expect(WORKFLOW).toContain(
      '(.capacity.availableCiSlots == 1 and all(.fxMatrix[]?; .adaptiveCap == 1))'
    );
    expect(
      WORKFLOW.match(
        /event_args=\(--event-payload-file "\$EVENT_PAYLOAD_PATH"\)/gu
      )
    ).toHaveLength(2);
    expect(WORKFLOW).toContain(
      'if node scripts/pr-conflict-handler.mjs --dry-run "${event_args[@]}"'
    );
    expect(WORKFLOW.match(/IN\("hold", "gated", "incident"\)/gu)).toHaveLength(
      3
    );
    expect(SELECTOR).toContain(
      "'scripts/lib/__tests__/pr-conflict-event.test.mjs'"
    );
    expect(SELECTOR).toContain(
      "'--coverage.include=lib/pr-conflict-event.mjs'"
    );
    expect(SELECTOR).toContain("'--coverage.include=pr-conflict-handler.mjs'");
  });

  it('executes the hosted apply filter and rejects plans outside the one-PR canary', () => {
    const filter = WORKFLOW.match(
      /jq -e --argjson canary "\$FX_HOSTED_REMEDIATION_CANARY_PR" '([\s\S]*?)'\s+"\$RUNNER_TEMP\/pr-conflict-handler-plan\.json"/u
    )?.[1];
    expect(filter).toBeTruthy();

    const validPlan = exactCanaryPlan();
    const check = plan =>
      spawnSync('jq', ['-e', '--argjson', 'canary', '42', filter], {
        input: JSON.stringify(plan),
        encoding: 'utf8',
      });

    expect(check(validPlan).status).toBe(0);
    for (const invalid of [
      {
        ...validPlan,
        items: [{ ...validPlan.items[0], number: 43 }],
      },
      {
        ...validPlan,
        items: [
          {
            ...validPlan.items[0],
            pr: { ...validPlan.items[0].pr, number: 43 },
          },
        ],
      },
      {
        ...validPlan,
        items: [...validPlan.items, validPlan.items[0]],
      },
      {
        ...validPlan,
        capacity: { ...validPlan.capacity, maxConcurrent: 2 },
      },
      {
        ...validPlan,
        capacity: { ...validPlan.capacity, availableCiSlots: 2 },
      },
      {
        ...validPlan,
        capacity: { ...validPlan.capacity, availableCiSlots: 0 },
        fxMatrix: [{ ...validPlan.fxMatrix[0], adaptiveCap: 0 }],
      },
      {
        ...validPlan,
        fxMatrix: [{ ...validPlan.fxMatrix[0], headRefOid: 'c'.repeat(40) }],
      },
    ])
      expect(check(invalid).status).toBe(1);
  });

  it('runs the pre-spend guard against exact identity, canonical base, auto-merge, fork metadata, and queue state', () => {
    const script = workflowRunScript(
      WORKFLOW,
      'Recheck live PR identity and queue before FX spend'
    );
    const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-pre-spend-'));
    const fakeGh = join(dir, 'gh');
    const callsPath = join(dir, 'gh.log');
    writeFileSync(
      fakeGh,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
if (args.some(arg => arg.startsWith('query='))) process.stdout.write(process.env.FAKE_GRAPHQL);
else if (args.some(arg => arg.includes('/pulls/42'))) process.stdout.write(process.env.FAKE_LIVE);
else process.exit(2);
`
    );
    chmodSync(fakeGh, 0o755);
    const baseLive = {
      number: 42,
      state: 'open',
      draft: false,
      head: HEAD,
      base: BASE,
      baseRef: 'main',
      headRef: 'codex/fix',
      baseRepo: REPO,
      headRepo: REPO,
      fork: false,
      labels: [],
    };
    const baseGraphql = {
      canonicalBaseOid: BASE,
      autoMergeEnabled: false,
      isInMergeQueue: false,
      mergeQueueEntryPresent: false,
    };
    const withoutFork = { ...baseLive };
    delete withoutFork.fork;
    const cases = [
      {
        name: 'eligible',
        live: baseLive,
        graphql: baseGraphql,
        eligible: 'true',
        outcome: 'model_required',
        expectedCalls: 2,
      },
      {
        name: 'held',
        live: { ...baseLive, labels: ['hold'] },
        graphql: baseGraphql,
        eligible: 'false',
        outcome: 'fx_suppressed_live_boundary',
        expectedCalls: 1,
      },
      {
        name: 'stale-head',
        live: { ...baseLive, head: 'c'.repeat(40) },
        graphql: baseGraphql,
        eligible: 'false',
        outcome: 'fx_suppressed_live_boundary',
        expectedCalls: 1,
      },
      {
        name: 'queued',
        live: baseLive,
        graphql: {
          ...baseGraphql,
          isInMergeQueue: true,
          mergeQueueEntryPresent: true,
        },
        eligible: 'false',
        outcome: 'fx_suppressed_live_boundary',
        expectedCalls: 2,
      },
      {
        name: 'canonical-base-changed-while-rest-is-stale',
        live: baseLive,
        graphql: { ...baseGraphql, canonicalBaseOid: 'c'.repeat(40) },
        eligible: 'false',
        outcome: 'fx_suppressed_live_boundary',
        expectedCalls: 2,
      },
      {
        name: 'auto-merge-changed',
        live: baseLive,
        graphql: { ...baseGraphql, autoMergeEnabled: true },
        eligible: 'false',
        outcome: 'fx_suppressed_live_boundary',
        expectedCalls: 2,
      },
      {
        name: 'missing-fork-metadata',
        live: withoutFork,
        graphql: baseGraphql,
        eligible: 'false',
        outcome: 'fx_suppressed_live_boundary',
        expectedCalls: 1,
      },
    ];

    try {
      for (const scenario of cases) {
        const outputPath = join(dir, `${scenario.name}.out`);
        const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            FAKE_GH_LOG: callsPath,
            FAKE_LIVE: JSON.stringify(scenario.live),
            FAKE_GRAPHQL: JSON.stringify(scenario.graphql),
            GITHUB_OUTPUT: outputPath,
            GH_TOKEN: 'read-only-test-token',
            REPOSITORY: REPO,
            PR_NUMBER: '42',
            SOURCE_HEAD: HEAD,
            BASE_HEAD: BASE,
            BASE_REF: 'main',
            HEAD_REF: 'codex/fix',
            EXPECTED_AUTO_MERGE: 'false',
            FX_HOSTED_REMEDIATION_ENABLED: 'true',
            FX_HOSTED_REMEDIATION_CANARY_PR: '42',
          },
        });
        expect(result.status, result.stderr).toBe(0);
        const output = Object.fromEntries(
          readFileSync(outputPath, 'utf8')
            .trim()
            .split('\n')
            .map(line => line.split('='))
        );
        expect(output).toMatchObject({
          eligible: scenario.eligible,
          outcome: scenario.outcome,
        });
        const calls = readFileSync(callsPath, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean);
        expect(calls).toHaveLength(scenario.expectedCalls);
        writeFileSync(callsPath, '');
      }
      expect(WORKFLOW).toContain(
        "steps.pre_spend_guard.outputs.eligible == 'true'"
      );
      expect(script).not.toContain('base:.base.sha');
      expect(script).toContain('refs/heads/$BASE_REF');
      expect(script).toContain('autoMergeEnabled:');
      expect(script).toContain('EXPECTED_AUTO_MERGE');
      expect(WORKFLOW).toContain(
        'LIVE_GUARD_OUTCOME: ${{ steps.pre_spend_guard.outputs.outcome }}'
      );
      expect(WORKFLOW).toContain(
        'outcome="${LIVE_GUARD_OUTCOME:-fx_suppressed_live_boundary}"'
      );
      expect(WORKFLOW).toMatch(
        /conflict_fx:[\s\S]*?permissions:\n      contents: read\n      pull-requests: read/u
      );
      const modelStart = WORKFLOW.indexOf(
        '      - name: Run pinned stronger-model FX with no executable tools'
      );
      const modelEnd = WORKFLOW.indexOf('\n      - name:', modelStart + 1);
      expect(WORKFLOW.slice(modelStart, modelEnd)).not.toContain('GH_TOKEN:');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('packages a typed no-FX receipt when the live pre-spend guard suppresses invocation', () => {
    const script = workflowRunScript(
      WORKFLOW,
      'Package model result after credential scope ends'
    );
    const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-no-fx-receipt-'));
    const artifact = join(dir, 'conflict-fx-artifact');
    mkdirSync(artifact);
    const receiptPath = join(artifact, 'receipt.json');
    const outputPath = join(dir, 'step.out');
    writeFileSync(
      receiptPath,
      JSON.stringify({
        schema: 'jovie-conflict-fx-artifact/v1',
        outcome: 'model_required',
      })
    );
    writeFileSync(join(artifact, 'prompt.txt'), 'fixture prompt');

    try {
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          RUNNER_TEMP: dir,
          GITHUB_OUTPUT: outputPath,
          MODEL_STEP_OUTCOME: 'skipped',
          LIVE_GUARD_ELIGIBLE: 'false',
          LIVE_GUARD_OUTCOME: 'fx_suppressed_live_boundary',
          LIVE_GUARD_DETAIL: 'live hold was added before model spend',
          FX_MODEL: 'openai/gpt-5.6-sol',
          SOURCE_HEAD: HEAD,
        },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toMatchObject({
        outcome: 'fx_suppressed_live_boundary',
        detail: 'live hold was added before model spend',
        observedModel: '',
      });
      expect(readFileSync(outputPath, 'utf8').trim()).toBe(
        'outcome=fx_suppressed_live_boundary'
      );
      expect(existsSync(join(artifact, 'prompt.txt'))).toBe(false);
      expect(existsSync(join(artifact, 'fx-result.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires the dedicated FX key before invocation and preserves the pinned model check', () => {
    expect(WORKFLOW).toContain(
      'FX_AI_GATEWAY_API_KEY: ${{ secrets.FX_AI_GATEWAY_API_KEY }}'
    );
    expect(WORKFLOW).not.toContain('secrets.AI_GATEWAY_API_KEY');
    expect(WORKFLOW).toContain('FX_MODEL: openai/gpt-5.6-sol');
    expect(WORKFLOW).toContain(
      'elif [[ "$observed_model" != "$FX_MODEL" ]]; then'
    );
    const keyGuard = WORKFLOW.split('\n').find(line =>
      line.trim().startsWith(': "${FX_AI_GATEWAY_API_KEY:?')
    );
    const invoke = WORKFLOW.indexOf('exec fx ask --json --no-save');
    expect(keyGuard).toBeTruthy();
    expect(WORKFLOW.indexOf(keyGuard)).toBeLessThan(invoke);

    const dir = mkdtempSync(join(tmpdir(), 'jovie-conflict-missing-key-'));
    try {
      const marker = join(dir, 'invoked');
      const fakeFx = join(dir, 'fx');
      writeFileSync(
        fakeFx,
        `#!/usr/bin/env sh\nprintf invoked > '${marker}'\n`
      );
      chmodSync(fakeFx, 0o755);
      const result = spawnSync(
        'bash',
        ['-c', `set -euo pipefail\n${keyGuard.trim()}\nfx ask`],
        {
          encoding: 'utf8',
          env: {
            PATH: `${dir}:${process.env.PATH}`,
            FX_AI_GATEWAY_API_KEY: '',
          },
        }
      );
      expect(result.status).not.toBe(0);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
