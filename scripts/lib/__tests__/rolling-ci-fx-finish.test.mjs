import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FX_EXECUTOR_POLICY } from '../fx-remediation-lane.mjs';
import {
  authorizeCommand,
  classifyNativeReadback,
  discoverCommand,
  discoverFxRepair,
  readback,
  requestVerifiedNativeMerge,
  validateFxNativeState,
  validateFxRepairLineage,
} from '../rolling-ci-fx-finish.mjs';

const NOW = Date.parse('2026-09-24T04:00:00Z');
const parent = 'a'.repeat(40);
const repairedHead = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const policyHead = 'd'.repeat(40);
const prNumber = 18219;
const runId = 1234;
const createdAt = '2026-09-24T03:00:00Z';
const digest = value => createHash('sha256').update(value).digest('hex');
const artifact = (id, name) => ({
  id,
  name,
  expired: false,
  created_at: createdAt,
  workflow_run: { id: runId, head_sha: policyHead },
});
const patchArtifact = artifact(50, `hosted-ci-patch-${prNumber}-${parent}`);
const write = artifact(51, `hosted-ci-write-receipts-${prNumber}-${parent}`);
const published = artifact(52, `hosted-ci-terminal-${prNumber}-${parent}`);
const page = artifacts => ({ total_count: artifacts.length, artifacts });
const commit = {
  sha: repairedHead,
  tree: { sha: tree },
  parents: [{ sha: parent }],
};
const discover = () =>
  discoverFxRepair({
    prNumber,
    repairedHead,
    commit,
    patchArtifacts: page([patchArtifact]),
    writeArtifacts: page([write]),
    terminalArtifacts: page([published]),
    now: NOW,
  });
const discovery = discover();
const job = (id, name) => ({
  id,
  name,
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-09-24T02:58:00Z',
  completed_at: '2026-09-24T03:02:00Z',
});
const run = {
  id: runId,
  name: 'Rolling CI Dispatch',
  path: '.github/workflows/rolling-ci-dispatch.yml',
  event: 'workflow_run',
  head_branch: 'main',
  head_sha: policyHead,
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
};
const jobsPage = {
  total_count: 3,
  jobs: [
    job(9, 'FX patch artifact without GitHub authority'),
    job(10, 'Validate acceptance and atomically update exact PR head'),
    job(11, 'Publish typed terminal receipt'),
  ],
};
const patchBytes = Buffer.from(
  'diff --git a/apps/web/components/fixture.tsx b/apps/web/components/fixture.tsx\n'
);
const plan = {
  schema: 'jovie-hosted-ci-repair-plan/v1',
  policyVersion: 'jovie-hosted-ci-remediation/2026-08-29',
  repository: 'JovieInc/Jovie',
  producerEvent: 'pull_request',
  prNumber,
  workflowRunId: '9010',
  workflowRunAttempt: 1,
  checkSuiteId: '77',
  expectedHeadOid: parent,
  baseSha: '2'.repeat(40),
  headRefName: 'codex/repair-proof',
  fingerprint: 'ci:fixture',
  allowedPaths: ['apps/web/components/fixture.tsx'],
  diffFiles: [
    {
      path: 'apps/web/components/fixture.tsx',
      status: 'modified',
      mode: '100644',
      blobSha: '3'.repeat(40),
    },
  ],
};
plan.idempotencyKey = `${plan.repository}:pr-${prNumber}:${parent}:${plan.fingerprint}:${plan.policyVersion}`;
const acceptance = {
  schema: 'jovie-hosted-ci-acceptance-receipt/v1',
  policyVersion: plan.policyVersion,
  stage: 'acceptance',
  status: 'accepted',
  terminal: false,
  repository: 'JovieInc/Jovie',
  prNumber,
  baseSha: plan.baseSha,
  expectedHeadOid: parent,
  fingerprint: 'ci:fixture',
  idempotencyKey: plan.idempotencyKey,
  maxConcurrent: 8,
  executor: {
    ...FX_EXECUTOR_POLICY,
    observedModel: FX_EXECUTOR_POLICY.expectedModel,
    stepsUsed: 2,
  },
  patchSha256: digest(patchBytes),
  changedFiles: [
    {
      path: 'apps/web/components/fixture.tsx',
      status: 'M',
      symlink: false,
      bytes: 12,
      sha256: 'f'.repeat(64),
    },
  ],
  testCommitOid: '0'.repeat(40),
  testTreeSha: tree,
  testReportSha256: '1'.repeat(64),
  coverageApplicable: false,
  coverageSha256: null,
  workflowRunId: String(runId),
  workflowRunAttempt: 1,
  patchArtifactId: '50',
  testArtifactId: '13',
  testsPassed: true,
  testCommands: [
    'pnpm biome check <changed-files>',
    'pnpm run typecheck',
    'pnpm --filter @jovie/web exec vitest run <trusted-selected-unit-tests> --reporter=json',
    'pnpm --filter @jovie/web test:coverage --changed <authenticated-base> --bail 1 (when applicable)',
  ],
  observedAt: createdAt,
};
const terminal = {
  schema: 'jovie-hosted-ci-terminal-receipt/v1',
  policyVersion: acceptance.policyVersion,
  stage: 'terminal',
  status: 'completed',
  terminal: true,
  outcome: 'repaired',
  repository: acceptance.repository,
  prNumber,
  expectedHeadOid: parent,
  committedHeadOid: repairedHead,
  fingerprint: acceptance.fingerprint,
  idempotencyKey: acceptance.idempotencyKey,
  acceptanceSha256: digest(JSON.stringify(acceptance)),
  observedAt: createdAt,
};
const validLineage = () => ({
  discovery,
  run,
  jobsPage,
  plan,
  patchBytes,
  acceptance,
  writerTerminal: terminal,
  publishedTerminal: terminal,
  now: NOW,
});
const ruleset = {
  id: 10512119,
  enforcement: 'active',
  target: 'branch',
  conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
  bypass_actors: [],
  rules: [
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [
          'PR Ready',
          'Migration Guard',
          'Fork PR Gate',
          'PR Size Guard',
        ].map(context => ({ context })),
      },
    },
    { type: 'merge_queue', parameters: {} },
  ],
};
const ciRun = {
  id: 901,
  run_attempt: 2,
  name: 'CI',
  path: '.github/workflows/ci.yml',
  event: 'pull_request',
  head_sha: repairedHead,
  status: 'completed',
  conclusion: 'success',
};
const native = () => ({
  discovery,
  pr: {
    number: prNumber,
    state: 'open',
    draft: false,
    mergeable: true,
    base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
    head: {
      sha: repairedHead,
      repo: { full_name: 'JovieInc/Jovie', fork: false },
    },
    labels: [],
  },
  ciRuns: { total_count: 1, workflow_runs: [ciRun] },
  successRunId: 901,
  successRunAttempt: 2,
  checks: {
    total_count: 3,
    check_runs: ['PR Ready', 'Migration Guard', 'PR Size Guard'].map(
      (name, index) => ({
        id: index + 1,
        name,
        head_sha: repairedHead,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-24T02:59:00Z',
        completed_at: createdAt,
      })
    ),
  },
  statuses: [
    {
      id: 4,
      context: 'Fork PR Gate',
      state: 'success',
      created_at: '2026-09-24T02:59:00Z',
      updated_at: createdAt,
    },
  ],
  reviews: [],
  ruleset,
  activationEnabled: 'true',
  activationCanaryPr: String(prNumber),
});
const liveRuleset = () => ({
  ...JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, 'fixtures/main-ruleset-10512119.json'),
      'utf8'
    )
  ),
  id: 10512119,
});

async function withOutput(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'fx-native-finish-'));
  const previous = {
    GITHUB_OUTPUT: process.env.GITHUB_OUTPUT,
    GH_TOKEN: process.env.GH_TOKEN,
    FX_HOSTED_REMEDIATION_ENABLED: process.env.FX_HOSTED_REMEDIATION_ENABLED,
    FX_HOSTED_REMEDIATION_CANARY_PR:
      process.env.FX_HOSTED_REMEDIATION_CANARY_PR,
  };
  process.env.GITHUB_OUTPUT = join(directory, 'github-output');
  process.env.GH_TOKEN = 'fixture-token';
  process.env.FX_HOSTED_REMEDIATION_ENABLED = 'true';
  process.env.FX_HOSTED_REMEDIATION_CANARY_PR = String(prNumber);
  try {
    await callback(directory);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('verified FX native finisher', () => {
  it('discovers the exact trusted run and writes artifact IDs for cross-run download', async () => {
    await withOutput(async directory => {
      const requests = [];
      const request = async path => {
        requests.push(path);
        if (path === `/git/commits/${repairedHead}`) return commit;
        if (path.includes('hosted-ci-patch-')) return page([patchArtifact]);
        if (path.includes('hosted-ci-write-receipts-')) return page([write]);
        if (path.includes('hosted-ci-terminal-')) return page([published]);
        if (path === `/actions/runs/${runId}`) return run;
        if (path.includes('/attempts/1/jobs')) return jobsPage;
        throw new Error(`unexpected fixture request ${path}`);
      };
      const path = join(directory, 'discovery.json');
      await discoverCommand(
        { pr: String(prNumber), head: repairedHead, output: path },
        { request, now: NOW }
      );
      expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
        discovery: { eligible: true, runId },
        run: { run_attempt: 1 },
      });
      expect(readFileSync(process.env.GITHUB_OUTPUT, 'utf8')).toContain(
        'patch_artifact_id=50'
      );
      expect(requests).toHaveLength(6);
    });
  });

  it('authorizes only complete downloaded evidence and the fresh live native state', async () => {
    await withOutput(async directory => {
      const files = {
        discovery: { discovery, run, jobsPage },
        plan,
        acceptance,
        'writer-terminal': terminal,
        'published-terminal': terminal,
      };
      const args = {
        'success-run-id': '901',
        'success-run-attempt': '2',
      };
      for (const [name, value] of Object.entries(files)) {
        args[name] = join(directory, `${name}.json`);
        writeFileSync(args[name], JSON.stringify(value));
      }
      args.patch = join(directory, 'repair.patch');
      writeFileSync(args.patch, patchBytes);
      const current = native();
      const request = async path => {
        if (path === `/pulls/${prNumber}`) return current.pr;
        if (path.startsWith('/actions/runs?')) return current.ciRuns;
        if (path.startsWith(`/commits/${repairedHead}/check-runs`))
          return current.checks;
        if (path.startsWith(`/commits/${repairedHead}/statuses`))
          return current.statuses;
        if (path === `/pulls/${prNumber}/reviews?per_page=100`)
          return current.reviews;
        if (path === '/rulesets/10512119') return liveRuleset();
        throw new Error(`unexpected fixture request ${path}`);
      };
      await authorizeCommand(args, { request, now: NOW });
      expect(readFileSync(process.env.GITHUB_OUTPUT, 'utf8')).toContain(
        'eligible=true'
      );
      process.env.GITHUB_OUTPUT = join(directory, 'missing-output');
      await authorizeCommand(
        { ...args, acceptance: join(directory, 'missing-acceptance.json') },
        { request, now: NOW }
      );
      expect(readFileSync(process.env.GITHUB_OUTPUT, 'utf8')).toContain(
        'reason=repair-artifact-missing-after-discovery'
      );
    });
  });

  it('reads GitHub queue state through the GraphQL field used by the native command', async () => {
    const run = vi.fn((_program, args) => {
      expect(args).toContain('graphql');
      expect(args.join(' ')).toContain('mergeQueueEntry');
      return {
        status: 0,
        stdout: JSON.stringify({
          state: 'OPEN',
          headRefOid: repairedHead,
          mergeQueueEntry: { id: 'queue-entry' },
        }),
      };
    });
    await expect(
      readback(prNumber, repairedHead, 'fixture-token', run)
    ).resolves.toBe('queued');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('finds one provider-bound pair for the exact repaired commit parent', () => {
    expect(discovery).toMatchObject({
      eligible: true,
      parent,
      repairedHead,
      tree,
      runId,
    });
  });

  it.each([
    ['missing', { patchArtifacts: page([]) }],
    ['ambiguous', { writeArtifacts: page([write, { ...write, id: 99 }]) }],
    [
      'expired',
      { patchArtifacts: page([{ ...patchArtifact, expired: true }]) },
    ],
    [
      'stale',
      {
        patchArtifacts: page([
          { ...patchArtifact, created_at: '2026-09-22T00:00:00Z' },
        ]),
      },
    ],
    [
      'spoofed run',
      {
        terminalArtifacts: page([
          { ...published, workflow_run: { id: 99, head_sha: policyHead } },
        ]),
      },
    ],
    [
      'wrong parent',
      { commit: { ...commit, parents: [{ sha: '2'.repeat(40) }] } },
    ],
    [
      'merge commit',
      {
        commit: {
          ...commit,
          parents: [{ sha: parent }, { sha: '2'.repeat(40) }],
        },
      },
    ],
  ])('refuses %s artifact lineage', (_, override) => {
    expect(
      discoverFxRepair({
        prNumber,
        repairedHead,
        commit,
        patchArtifacts: page([patchArtifact]),
        writeArtifacts: page([write]),
        terminalArtifacts: page([published]),
        now: NOW,
        ...override,
      }).eligible
    ).toBe(false);
  });

  it('requires trusted job, attempt, tested tree, acceptance digest and matching published terminal', () => {
    expect(validateFxRepairLineage(validLineage())).toEqual({
      eligible: true,
      reason: 'trusted-fx-repair',
    });
    const bad = [
      { run: { ...run, path: '.github/workflows/other.yml' } },
      { run: { ...run, run_attempt: 2 } },
      {
        jobsPage: {
          ...jobsPage,
          jobs: jobsPage.jobs.map(item => ({ ...item, conclusion: 'failure' })),
        },
      },
      { acceptance: { ...acceptance, workflowRunId: '77' } },
      { patchBytes: Buffer.from('tampered') },
      { plan: { ...plan, expectedHeadOid: '7'.repeat(40) } },
      { acceptance: { ...acceptance, testTreeSha: '3'.repeat(40) } },
      { writerTerminal: { ...terminal, acceptanceSha256: '4'.repeat(64) } },
      { publishedTerminal: { ...terminal, committedHeadOid: '5'.repeat(40) } },
      { now: NOW + 8 * 24 * 60 * 60 * 1000 },
    ];
    for (const override of bad) {
      expect(
        validateFxRepairLineage({ ...validLineage(), ...override }).eligible
      ).toBe(false);
    }
  });

  it('checks latest successful CI, live head, holds, reviews and queue policy before token creation', () => {
    // The fixture uses the exact live native policy parameters below.
    expect(validateFxNativeState(native()).eligible).toBe(false);
    const valid = native();
    // Use the canonical fixture to avoid reimplementing policy defaults.
    valid.ruleset = {
      ...JSON.parse(
        readFileSync(
          resolve(import.meta.dirname, 'fixtures/main-ruleset-10512119.json'),
          'utf8'
        )
      ),
      id: 10512119,
    };
    expect(validateFxNativeState(valid)).toEqual({
      eligible: true,
      reason: 'native-request-eligible',
    });
    expect(
      validateFxNativeState({
        ...valid,
        pr: {
          ...valid.pr,
          labels: [{ name: 'needs-conflict-resolution' }],
        },
      }).eligible
    ).toBe(true);
    for (const override of [
      { pr: { ...valid.pr, head: { ...valid.pr.head, sha: parent } } },
      { pr: { ...valid.pr, labels: [{ name: 'hold' }] } },
      { pr: { ...valid.pr, draft: true } },
      {
        reviews: [
          {
            id: 1,
            user: { login: 'reviewer' },
            state: 'CHANGES_REQUESTED',
            submitted_at: createdAt,
          },
        ],
      },
      {
        reviews: [
          {
            id: 1,
            user: { login: 'reviewer' },
            state: 'CHANGES_REQUESTED',
            submitted_at: createdAt,
          },
          {
            id: 2,
            user: { login: 'reviewer' },
            state: 'COMMENTED',
            submitted_at: '2026-09-24T03:01:00Z',
          },
        ],
      },
      {
        ciRuns: {
          total_count: 1,
          workflow_runs: [{ ...ciRun, run_attempt: 3, conclusion: 'failure' }],
        },
      },
      {
        checks: {
          total_count: 3,
          check_runs: valid.checks.check_runs.map(check =>
            check.name === 'Migration Guard'
              ? { ...check, conclusion: 'failure' }
              : check
          ),
        },
      },
      {
        statuses: [
          ...valid.statuses,
          {
            ...valid.statuses[0],
            id: 5,
            state: 'pending',
            created_at: '2026-09-24T03:01:00Z',
          },
        ],
      },
      {
        statuses: [
          ...valid.statuses,
          {
            ...valid.statuses[0],
            id: 6,
            state: 'failure',
            created_at: '2026-09-24T03:02:00Z',
          },
        ],
      },
      { statuses: Array.from({ length: 100 }, () => valid.statuses[0]) },
      { pr: { ...valid.pr, mergeable: false } },
      {
        ruleset: {
          ...valid.ruleset,
          rules: valid.ruleset.rules.filter(
            rule => rule.type !== 'merge_queue'
          ),
        },
      },
      { activationEnabled: 'false' },
    ]) {
      expect(validateFxNativeState({ ...valid, ...override }).eligible).toBe(
        false
      );
    }
  });

  it('reads authoritative native intent and never retries an uncertain mutation', async () => {
    expect(
      classifyNativeReadback({
        pr: {
          state: 'OPEN',
          headRefOid: repairedHead,
          mergeQueueEntry: { id: 'q' },
        },
        expectedHead: repairedHead,
      })
    ).toBe('queued');
    expect(
      classifyNativeReadback({
        pr: { state: 'OPEN', headRefOid: parent },
        expectedHead: repairedHead,
      })
    ).toBe('head-changed');
    const mutate = vi.fn();
    await expect(
      requestVerifiedNativeMerge({ readState: async () => 'queued', mutate })
    ).resolves.toBe('queued');
    expect(mutate).not.toHaveBeenCalled();
    const states = ['no-intent', 'intent-recorded'];
    await expect(
      requestVerifiedNativeMerge({
        readState: async () => states.shift(),
        mutate: () => {
          throw new Error('network timeout after send');
        },
      })
    ).resolves.toBe('intent-recorded');
    const failedMutation = vi.fn(() => {
      throw new Error('timeout');
    });
    await expect(
      requestVerifiedNativeMerge({
        readState: async () => 'no-intent',
        mutate: failedMutation,
      })
    ).rejects.toThrow('no retry');
    expect(failedMutation).toHaveBeenCalledTimes(1);
  });

  it('keeps the successful CI branch out of the FX model path', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/rolling-ci-dispatch.yml'
      ),
      'utf8'
    );
    const plan = workflow.split('\n  plan:\n')[1].split('\n  prepare:\n')[0];
    const finish = workflow
      .split('\n  finish:\n')[1]
      .split('\n  terminal:\n')[0];
    expect(plan.indexOf('if [[ "$CONCLUSION" == \'success\' ]]')).toBeLessThan(
      plan.indexOf('node scripts/lib/rolling-ci-fx.mjs hosted-plan')
    );
    expect(plan).toContain('success_candidate=true');
    expect(finish).toContain(
      "if: needs.plan.outputs.success_candidate == 'true'"
    );
    expect(finish.indexOf('id: authorize')).toBeLessThan(
      finish.indexOf('id: app-token')
    );
    const finisher = readFileSync(
      resolve(import.meta.dirname, '../rolling-ci-fx-finish.mjs'),
      'utf8'
    );
    expect(finisher).toContain("'--auto'");
    expect(finisher).toContain("'--match-head-commit'");
    expect(finish).not.toContain('FX_AI_GATEWAY_API_KEY');
    expect(finish).not.toContain('fx ask');
  });

  it('imports the finisher from the workflow sparse checkout alone', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/rolling-ci-dispatch.yml'
      ),
      'utf8'
    );
    const finish = workflow
      .split('\n  finish:\n')[1]
      .split('\n  terminal:\n')[0];
    const sparse = finish
      .split('sparse-checkout: |\n')[1]
      .split('\n          sparse-checkout-cone-mode:')[0]
      .trim()
      .split('\n')
      .map(path => path.trim());
    const root = resolve(import.meta.dirname, '../../..');
    const directory = mkdtempSync(join(tmpdir(), 'fx-finish-sparse-'));
    try {
      for (const path of sparse) {
        const target = join(directory, path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(root, path), target);
      }
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "await import('./scripts/lib/rolling-ci-fx-finish.mjs')",
        ],
        { cwd: directory, stdio: 'pipe' }
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
