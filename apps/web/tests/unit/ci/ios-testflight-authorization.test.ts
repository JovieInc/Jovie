import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import * as realGhHarness from '../../../../../scripts/lib/real-gh-harness.mjs';

const { resolveRealGh, runWithRealGh, storedZip } =
  realGhHarness as unknown as {
    resolveRealGh: () => string | null;
    runWithRealGh: (options: {
      script: string;
      env?: Record<string, string>;
      route: (path: string) => { status?: number; body: unknown } | null;
    }) => Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
      requests: string[];
    }>;
    storedZip: (files: Record<string, string>) => Buffer;
  };

// JOV-7707: TestFlight release authorization is proven by executing the
// shipped workflow shell with the real gh CLI against fixture GitHub API
// state, not by matching its source text.

type Step = {
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  outputs?: Record<string, string>;
  needs?: string[];
  if?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  steps?: Step[];
};
type Workflow = {
  on: Record<string, unknown>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, Job>;
};

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const workflow = parseYaml(
  readFileSync(
    process.env.TESTFLIGHT_WORKFLOW_PATH ||
      resolve(repoRoot, '.github/workflows/ios-testflight.yml'),
    'utf8'
  )
) as Workflow;
const authorizeJob = workflow.jobs['authorize-release'];
const authorizeStep = authorizeJob?.steps?.find(
  step => step.id === 'authorize'
);
const selectStep = authorizeJob?.steps?.find(step => step.id === 'select');

const gh = resolveRealGh();
if (!gh && process.env.CI) {
  throw new Error('JOV-7707: CI must provide the real gh binary.');
}

const REPO = 'JovieInc/Jovie';
const RELEASE = 'a'.repeat(40);
const OLDER = 'b'.repeat(40);
const NEWER = 'c'.repeat(40);
const CONTROLLER_WORKFLOW_ID = 101;
const TESTFLIGHT_WORKFLOW_ID = 202;
const CONTROLLER_RUN = 5000;
const roots: string[] = [];
// Fixture git must never inherit a hook's GIT_DIR (it would hit the real repo).
const fixtureEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  ) as NodeJS.ProcessEnv;

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tempRoot(prefix: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

const controllerRun = (overrides: Record<string, unknown> = {}) => ({
  id: CONTROLLER_RUN,
  run_attempt: 1,
  workflow_id: CONTROLLER_WORKFLOW_ID,
  head_sha: RELEASE,
  head_branch: 'main',
  head_repository: { full_name: REPO },
  event: 'workflow_run',
  path: '.github/workflows/production-controller.yml',
  status: 'completed',
  conclusion: 'success',
  display_title: `Production Controller ${RELEASE} from CI 77 attempt 1`,
  ...overrides,
});

const job = (name: string, sha: string, conclusion = 'success', id = 1) => ({
  id,
  name,
  head_sha: sha,
  status: 'completed',
  conclusion,
  steps: [
    {
      name: 'Upload internal TestFlight build',
      status: 'completed',
      conclusion,
    },
  ],
});

const testflightRun = (id: number, sha: string, attempt = 1) => ({
  id,
  run_attempt: attempt,
  workflow_id: TESTFLIGHT_WORKFLOW_ID,
  path: '.github/workflows/ios-testflight.yml',
  display_title: `iOS TestFlight ${sha}`,
  event: 'workflow_run',
  head_branch: 'main',
  head_sha: sha,
  head_repository: { full_name: REPO },
  status: 'completed',
  conclusion: 'success',
  created_at: `2026-10-01T00:${String(id % 60).padStart(2, '0')}:00Z`,
});

type World = {
  controllerWorkflow?: Record<string, unknown>;
  controllerRun?: Record<string, unknown>;
  controllerJobs?: unknown[];
  mainSha?: string;
  productionMarkers?: unknown[];
  testflightMarkers?: {
    id: number;
    runId: number;
    marker: Record<string, unknown> | string;
  }[];
  testflightRuns?: Record<number, Record<string, unknown>>;
  testflightAttempts?: Record<string, Record<string, unknown>>;
  testflightJobs?: Record<string, unknown[]>;
  legacyRuns?: Record<string, unknown>[];
  quota?: {
    path: string;
    message: string;
    resetInSeconds?: number | null;
  };
  binaries?: {
    id: number;
    runId: number;
    attempt: number;
    payload: Record<string, unknown>;
  }[];
};

// Fixture GitHub API state. Every route the script may read is explicit;
// anything else is a 404, which the script must treat as missing evidence.
function routes(world: World) {
  const base = `repos/${REPO}/`;
  const table = new Map<string, unknown>([
    [
      'actions/workflows/production-controller.yml',
      world.controllerWorkflow ?? {
        id: CONTROLLER_WORKFLOW_ID,
        name: 'Production Controller',
        path: '.github/workflows/production-controller.yml',
      },
    ],
    [
      `actions/runs/${CONTROLLER_RUN}/attempts/1`,
      world.controllerRun ?? controllerRun(),
    ],
    [
      `actions/runs/${CONTROLLER_RUN}/attempts/1/jobs?per_page=100`,
      {
        jobs: world.controllerJobs ?? [job('Production Verified', RELEASE)],
      },
    ],
    ['commits/main', { sha: world.mainSha ?? RELEASE }],
    [
      `compare/${OLDER}...${RELEASE}`,
      { status: 'ahead', merge_base_commit: { sha: OLDER } },
    ],
    [
      `compare/${RELEASE}...${OLDER}`,
      { status: 'behind', merge_base_commit: { sha: OLDER } },
    ],
    [
      `compare/${RELEASE}...${NEWER}`,
      { status: 'ahead', merge_base_commit: { sha: RELEASE } },
    ],
    [
      `actions/artifacts?name=production-generation-verified-${RELEASE}&per_page=100`,
      { artifacts: world.productionMarkers ?? [] },
    ],
    [
      'actions/workflows/ios-testflight.yml',
      {
        id: TESTFLIGHT_WORKFLOW_ID,
        name: 'iOS TestFlight',
        path: '.github/workflows/ios-testflight.yml',
      },
    ],
    [
      'actions/artifacts?name=testflight-upload-verified&per_page=100',
      {
        artifacts: (world.testflightMarkers ?? []).map(marker => ({
          id: marker.id,
          name: 'testflight-upload-verified',
          expired: false,
          created_at: `2026-10-01T00:00:0${marker.id % 9}Z`,
          workflow_run: { id: marker.runId },
        })),
      },
    ],
    [
      'actions/workflows/ios-testflight.yml/runs?branch=main&status=completed&per_page=100',
      { workflow_runs: world.legacyRuns ?? [] },
    ],
  ]);
  for (const marker of world.testflightMarkers ?? [])
    table.set(
      `actions/artifacts/${marker.id}/zip`,
      storedZip({
        'testflight-upload-verified.json':
          typeof marker.marker === 'string'
            ? marker.marker
            : JSON.stringify(marker.marker),
      })
    );
  for (const binary of world.binaries ?? []) {
    table.set(`actions/runs/${binary.runId}/artifacts?per_page=100`, {
      artifacts: [
        {
          id: binary.id,
          name: `testflight-binary-${binary.attempt}`,
          expired: false,
          workflow_run: { id: binary.runId },
        },
      ],
    });
    table.set(
      `actions/artifacts/${binary.id}/zip`,
      storedZip({
        'testflight-upload-attestation.json': JSON.stringify(binary.payload),
      })
    );
  }
  for (const [id, run] of Object.entries(world.testflightRuns ?? {})) {
    table.set(`actions/runs/${id}`, run);
    table.set(`actions/runs/${id}/attempts/${run.run_attempt}`, run);
  }
  for (const [key, run] of Object.entries(world.testflightAttempts ?? {}))
    table.set(`actions/runs/${key}`, run);
  for (const [key, jobs] of Object.entries(world.testflightJobs ?? {}))
    table.set(`actions/runs/${key}/jobs?per_page=100`, { jobs });
  return (path: string) => {
    if (
      world.quota &&
      (path === 'rate_limit' || path.startsWith('rate_limit?'))
    ) {
      return {
        body: {
          resources: {
            core: {
              reset:
                world.quota.resetInSeconds === null
                  ? ''
                  : Math.floor(Date.now() / 1000) +
                    (world.quota.resetInSeconds ?? 10_000),
            },
          },
        },
      };
    }
    if (world.quota && path.includes(world.quota.path)) {
      return { status: 403, body: { message: world.quota.message } };
    }
    if (!path.startsWith(base)) return null;
    const rest = path.slice(base.length);
    return table.has(rest) ? { body: table.get(rest) as object } : null;
  };
}

const workflowRunEnv = (overrides: Record<string, string> = {}) => ({
  EVENT_NAME: 'workflow_run',
  MANUAL_SHA: '',
  REPOSITORY: REPO,
  TRIGGER_RUN_ID: String(CONTROLLER_RUN),
  TRIGGER_RUN_ATTEMPT: '1',
  TRIGGER_RUN_EVENT: 'workflow_run',
  TRIGGER_RUN_PATH: '.github/workflows/production-controller.yml',
  TRIGGER_HEAD_BRANCH: 'main',
  TRIGGER_HEAD_SHA: RELEASE,
  TRIGGER_HEAD_REPOSITORY: REPO,
  TRIGGER_RUN_STATUS: 'completed',
  TRIGGER_RUN_CONCLUSION: 'success',
  ...overrides,
});

const readOutputs = (path: string) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ])
  ) as Record<string, string>;

async function authorize(world: World, env: Record<string, string> = {}) {
  const root = tempRoot('jovie-testflight-authorize-');
  const output = join(root, 'output');
  writeFileSync(output, '');
  const bootstrap = authorizeJob.steps?.find(
    step => step.name === 'Checkout the rate-limit hold'
  );
  const bootstrapDirectory = join(
    root,
    String(bootstrap?.with?.path || ''),
    '.github/scripts'
  );
  mkdirSync(bootstrapDirectory, { recursive: true });
  writeFileSync(
    join(bootstrapDirectory, 'gh-api-hold.sh'),
    readFileSync(resolve(repoRoot, '.github/scripts/gh-api-hold.sh'))
  );
  const result = await runWithRealGh({
    script: String(authorizeStep?.run),
    env: {
      ...workflowRunEnv(),
      ...env,
      GITHUB_OUTPUT: output,
      GITHUB_WORKSPACE: root,
      GH_API_HOLD_BUDGET_SECONDS: String(
        authorizeStep?.env?.GH_API_HOLD_BUDGET_SECONDS
      ),
      RUNNER_TEMP: root,
    },
    route: routes(world),
  });
  return { ...result, outputs: readOutputs(output) };
}

const validMarker = (sha: string, runId: number) => ({
  sha,
  workflowRun: String(runId),
  uploadRunAttempt: '1',
  uploadJob: '9',
});

const binaryAttestation = (source: string, transport: string, run = 80) => ({
  schema: 'jovie-testflight-binary/v1',
  binarySha256: 'd'.repeat(64),
  buildNumber: '44',
  lease: {
    schema: 'jovie-testflight-release-lease/v1',
    repository: REPO,
    sourceSha: source,
    transportSha: transport,
    workflowRun: String(run),
    workflowAttempt: '1',
  },
});
const attestedJob = (transport: string) => ({
  ...job('Upload Internal TestFlight', transport, 'success', 9),
  steps: [
    { name: 'Upload internal TestFlight build' },
    { name: 'Preserve exact uploaded binary attestation' },
  ],
});

describe.skipIf(!gh)('iOS TestFlight release authorization (real gh)', () => {
  it('defers an installation 403 whose reset is outside the Authorize budget', async () => {
    const installation = {
      path: 'actions/workflows/production-controller.yml',
      message: 'API rate limit exceeded for installation',
    };
    const summary = join(tempRoot('jovie-testflight-summary-'), 'summary');
    writeFileSync(summary, '');
    const firstRead = await authorize(
      { quota: installation },
      { GITHUB_STEP_SUMMARY: summary }
    );
    const resetEpoch = /resets at (\d+)/.exec(firstRead.stderr)?.[1];
    const resetIso = new Date(Number(resetEpoch) * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    const sentence = `Installation quota resets at ${resetIso}. Deferring TestFlight publication of ${RELEASE} to the next reconciliation. No release was authorized.`;
    expect(firstRead.code, firstRead.stderr).toBe(0);
    expect(firstRead.outputs.authorized).toBe('false');
    expect(firstRead.outputs.release_sha).toBe('');
    expect(firstRead.stderr).toContain('outside the 480s budget');
    expect(firstRead.stdout).toContain(`::warning::${sentence}`);
    expect(readFileSync(summary, 'utf8').trim()).toBe(sentence);
    expect(firstRead.requests.some(path => path.includes('rate_limit'))).toBe(
      true
    );

    writeFileSync(summary, '');
    const afterProof = await authorize(
      {
        quota: {
          path: 'actions/workflows/ios-testflight.yml',
          message: 'API rate limit exceeded for installation',
        },
      },
      { GITHUB_STEP_SUMMARY: summary }
    );
    const laterEpoch = /resets at (\d+)/.exec(afterProof.stderr)?.[1];
    const laterIso = new Date(Number(laterEpoch) * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    const laterSentence = `Installation quota resets at ${laterIso}. Deferring TestFlight publication of ${RELEASE} to the next reconciliation. No release was authorized.`;
    expect(afterProof.code, afterProof.stderr).toBe(0);
    expect(afterProof.outputs.authorized).toBe('false');
    expect(afterProof.outputs.release_sha).toBe('');
    expect(afterProof.stdout).toContain(`::warning::${laterSentence}`);
    expect(readFileSync(summary, 'utf8').trim()).toBe(laterSentence);
  });

  it('formats a deferred reset with BSD date when GNU -d is rejected', async () => {
    const root = tempRoot('jovie-testflight-bsd-date-');
    const summary = join(root, 'summary');
    const dateLog = join(root, 'date.log');
    const dateBin = join(root, 'bin');
    mkdirSync(dateBin);
    writeFileSync(summary, '');
    writeFileSync(
      join(dateBin, 'date'),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$DATE_LOG"
has_d=0
has_r=0
prev=""
epoch=""
for arg in "$@"; do
  if [ "$arg" = "-d" ]; then
    has_d=1
  fi
  if [ "$prev" = "-r" ]; then
    has_r=1
    epoch="$arg"
  fi
  prev="$arg"
done
if [ "$has_d" -eq 1 ]; then
  echo "date: illegal option -- d" >&2
  exit 1
fi
if [ "$has_r" -eq 1 ]; then
  node -e 'const epoch = Number(process.argv[1]); if (!Number.isFinite(epoch)) process.exit(1); process.stdout.write(new Date(epoch * 1000).toISOString().slice(0, 19) + "Z\\n");' "$epoch"
  exit 0
fi
exec /usr/bin/date "$@"
`,
      { mode: 0o755 }
    );
    const result = await authorize(
      {
        quota: {
          path: 'actions/workflows/production-controller.yml',
          message: 'API rate limit exceeded for installation',
        },
      },
      {
        DATE_LOG: dateLog,
        GITHUB_STEP_SUMMARY: summary,
        PATH: `${dateBin}:${process.env.PATH}`,
      }
    );
    const resetEpoch = /resets at (\d+)/.exec(result.stderr)?.[1];
    const resetIso =
      new Date(Number(resetEpoch) * 1000).toISOString().slice(0, 19) + 'Z';
    const sentence = `Installation quota resets at ${resetIso}. Deferring TestFlight publication of ${RELEASE} to the next reconciliation. No release was authorized.`;
    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).not.toContain('could not format the reset instant');
    expect(result.stdout).toContain(`::warning::${sentence}`);
    expect(readFileSync(summary, 'utf8').trim()).toBe(sentence);
    const dateCalls = readFileSync(dateLog, 'utf8');
    expect(dateCalls).toContain('-d ');
    expect(dateCalls).toContain('-r ');
  });

  it('keeps a permission 403 and a missing reset fatal', async () => {
    const summary = join(tempRoot('jovie-testflight-summary-'), 'summary');
    writeFileSync(summary, '');
    const denied = await authorize(
      {
        quota: {
          path: 'actions/workflows/production-controller.yml',
          message: 'Resource not accessible by integration',
        },
      },
      { GITHUB_STEP_SUMMARY: summary }
    );
    expect(denied.code).toBe(1);
    expect(denied.outputs.authorized).toBe('false');
    expect(denied.stdout).not.toContain('::warning::');
    expect(denied.stdout).not.toContain('Deferring TestFlight publication');
    expect(readFileSync(summary, 'utf8')).toBe('');
    expect(denied.requests.some(path => path.includes('rate_limit'))).toBe(
      false
    );

    const missingReset = await authorize(
      {
        quota: {
          path: 'actions/workflows/production-controller.yml',
          message: 'API rate limit exceeded for installation',
          resetInSeconds: null,
        },
      },
      { GITHUB_STEP_SUMMARY: summary }
    );
    expect(missingReset.code).toBe(1);
    expect(missingReset.stderr).toContain('no x-ratelimit-reset');
    expect(missingReset.stdout).not.toContain('::warning::');
    expect(readFileSync(summary, 'utf8')).toBe('');
  });

  it('authorizes the exact verified current main as the first release', async () => {
    const result = await authorize({});
    expect(result.code, result.stderr).toBe(0);
    expect(result.outputs).toMatchObject({
      authorized: 'true',
      release_sha: RELEASE,
      baseline_sha: '',
      already_released: 'false',
    });
    expect(result.stdout).toContain('first verified release');
  });

  it.each([
    [
      'a non-controller trigger path',
      { TRIGGER_RUN_PATH: '.github/workflows/ci.yml' },
    ],
    ['a failed controller run', { TRIGGER_RUN_CONCLUSION: 'failure' }],
    ['a non-main trigger branch', { TRIGGER_HEAD_BRANCH: 'feature' }],
    ['a fork head repository', { TRIGGER_HEAD_REPOSITORY: 'fork/Jovie' }],
    ['an abbreviated head SHA', { TRIGGER_HEAD_SHA: 'abc123' }],
  ])('rejects %s before any release evidence', async (_name, env) => {
    const result = await authorize({}, env);
    expect(result.code).toBe(1);
    expect(result.outputs.authorized).toBe('false');
    expect(result.requests).toEqual([]);
  });

  it('cross-proves workflow identity by id, not by run name', async () => {
    const renamed = await authorize({
      controllerRun: controllerRun({ workflow_id: 999 }),
    });
    expect(renamed.code).toBe(1);
    expect(renamed.outputs.authorized).toBe('false');
    const impostor = await authorize({
      controllerWorkflow: {
        id: CONTROLLER_WORKFLOW_ID,
        name: 'Production Controller',
        path: '.github/workflows/other.yml',
      },
    });
    expect(impostor.code).toBe(1);
  });

  it('rejects contradictory source identity and allows a verified ancestor as main advances', async () => {
    const supersededController = await authorize({
      controllerRun: controllerRun({
        display_title: `Production Controller ${NEWER} from CI 78 attempt 1`,
      }),
    });
    expect(supersededController.code).toBe(1);
    expect(supersededController.outputs.authorized).toBe('false');
    const mainMoved = await authorize({ mainSha: NEWER });
    expect(mainMoved.code).toBe(0);
    expect(mainMoved.outputs.authorized).toBe('true');
    expect(mainMoved.outputs.release_sha).toBe(RELEASE);
  });

  it('pins the same verified source when main advances before admission', async () => {
    const result = await authorize({ mainSha: NEWER });
    expect(result.code, result.stderr).toBe(0);
    expect(result.outputs.authorized).toBe('true');
    expect(result.outputs.release_sha).toBe(RELEASE);
  });

  it('requires exactly one successful Production Verified job for the SHA', async () => {
    for (const controllerJobs of [
      [],
      [job('Production Verified', RELEASE, 'failure')],
      [job('Production Verified', NEWER)],
      [
        job('Production Verified', RELEASE),
        job('Production Verified', RELEASE, 'success', 2),
      ],
    ]) {
      const result = await authorize({ controllerJobs });
      expect(result.code, JSON.stringify(controllerJobs)).toBe(1);
      expect(result.outputs.authorized).toBe('false');
      expect(result.stdout + result.stderr).toContain(
        'lacks exact successful Production Verified evidence'
      );
    }
  });

  it('stands down when the controller skipped Production Verified', async () => {
    // A successful controller run may legitimately skip verification, e.g.
    // when the fleet gate held deployment. That is not missing evidence and
    // must not fail main; the generation simply has nothing to release.
    const result = await authorize({
      controllerJobs: [job('Production Verified', RELEASE, 'skipped')],
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.outputs.authorized).toBe('false');
    expect(result.stdout + result.stderr).toContain(
      'yielded the release lease'
    );
  });

  it('still fails when Production Verified is absent entirely', async () => {
    const result = await authorize({ controllerJobs: [] });
    expect(result.code).toBe(1);
    expect(result.outputs.authorized).toBe('false');
  });

  it('lets a manual dispatch rebuild only verified current main', async () => {
    const manual = {
      EVENT_NAME: 'workflow_dispatch',
      MANUAL_SHA: RELEASE,
      TRIGGER_RUN_ID: '',
      TRIGGER_RUN_ATTEMPT: '',
    };
    const unproven = await authorize({}, manual);
    expect(unproven.code).toBe(1);
    expect(unproven.outputs.authorized).toBe('false');
    expect(
      unproven.requests.some(request =>
        request.includes('production-generation-verified-')
      )
    ).toBe(true);
  });

  it('uses the newest fully proven upload marker as the baseline', async () => {
    const result = await authorize({
      testflightMarkers: [{ id: 7, runId: 70, marker: validMarker(OLDER, 70) }],
      testflightRuns: { 70: testflightRun(70, OLDER) },
      testflightJobs: {
        '70/attempts/1': [
          job('Upload Internal TestFlight', OLDER, 'success', 9),
        ],
      },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.outputs).toMatchObject({
      authorized: 'true',
      baseline_sha: OLDER,
    });
  });

  it('marks an exact generation that already reached TestFlight', async () => {
    const result = await authorize({
      testflightMarkers: [
        { id: 7, runId: 70, marker: validMarker(RELEASE, 70) },
      ],
      testflightRuns: { 70: testflightRun(70, RELEASE) },
      testflightJobs: {
        '70/attempts/1': [
          job('Upload Internal TestFlight', RELEASE, 'success', 9),
        ],
      },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.outputs.already_released).toBe('true');
  });

  it('fails closed when markers exist but none proves an upload', async () => {
    for (const world of [
      // Malformed marker JSON.
      { testflightMarkers: [{ id: 7, runId: 70, marker: '{not json' }] },
      // Marker run identity does not match its artifact's run.
      {
        testflightMarkers: [
          { id: 7, runId: 70, marker: validMarker(OLDER, 71) },
        ],
      },
      // Marked upload job did not succeed.
      {
        testflightMarkers: [
          { id: 7, runId: 70, marker: validMarker(OLDER, 70) },
        ],
        testflightRuns: { 70: testflightRun(70, OLDER) },
        testflightJobs: {
          '70/attempts/1': [
            job('Upload Internal TestFlight', OLDER, 'failure', 9),
          ],
        },
      },
    ] satisfies World[]) {
      const result = await authorize(world);
      expect(result.code, JSON.stringify(world)).toBe(1);
      expect(result.stdout + result.stderr).toContain(
        'none fully proves a successful upload'
      );
      // Unprovable stable history must not fall back to legacy run scanning.
      expect(
        result.requests.some(request => request.includes('/runs?branch=main'))
      ).toBe(false);
    }
  });

  it('bootstraps a legacy baseline only from an exact successful upload job', async () => {
    const legacy = await authorize({
      legacyRuns: [
        { ...testflightRun(81, NEWER), event: 'workflow_dispatch' },
        testflightRun(80, OLDER, 2),
      ],
      testflightJobs: {
        // Newest run only authorized; its upload job was skipped.
        '81/attempts/1': [job('Upload Internal TestFlight', NEWER, 'skipped')],
        '80/attempts/1': [job('Upload Internal TestFlight', OLDER, 'failure')],
        '80/attempts/2': [job('Upload Internal TestFlight', OLDER)],
      },
    });
    expect(legacy.code, legacy.stderr).toBe(0);
    expect(legacy.outputs.baseline_sha).toBe(OLDER);
    expect(legacy.requests).toContain(
      `GET repos/${REPO}/actions/runs/80/attempts/2/jobs?per_page=100`
    );
  });
});

describe.skipIf(!gh)(
  'iOS TestFlight source/transport receipts (real gh)',
  () => {
    it('recovers the certified source when beta succeeded but the first marker publisher failed', async () => {
      const result = await authorize({
        legacyRuns: [testflightRun(80, NEWER)],
        testflightJobs: { '80/attempts/1': [attestedJob(NEWER)] },
        binaries: [
          {
            id: 500,
            runId: 80,
            attempt: 1,
            payload: binaryAttestation(OLDER, NEWER),
          },
        ],
      });
      expect(result.code, result.stderr).toBe(0);
      expect(result.outputs.baseline_sha).toBe(OLDER);
    });

    it('rejects malformed beta step metadata instead of guessing a legacy source', async () => {
      const beta = {
        ...job('Upload Internal TestFlight', NEWER),
        steps: undefined,
      };
      const result = await authorize({
        legacyRuns: [testflightRun(80, NEWER)],
        testflightJobs: { '80/attempts/1': [beta] },
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('step provenance is unknown');
    });

    it('reads the uploaded source from a v2 marker while authenticating the transport job', async () => {
      const binary = binaryAttestation(OLDER, NEWER, 70);
      const marker = {
        ...validMarker(OLDER, 70),
        schema: 'jovie-testflight-upload/v2',
        transportSha: NEWER,
        ...{
          lease: binary.lease,
          binarySha256: binary.binarySha256,
          buildNumber: binary.buildNumber,
        },
      };
      const result = await authorize({
        testflightMarkers: [{ id: 7, runId: 70, marker }],
        testflightRuns: { 70: testflightRun(70, NEWER) },
        testflightJobs: {
          '70/attempts/1': [
            job('Upload Internal TestFlight', NEWER, 'success', 9),
          ],
        },
      });
      expect(result.code, result.stderr).toBe(0);
      expect(result.outputs.baseline_sha).toBe(OLDER);
      const mismatch = await authorize({
        testflightMarkers: [
          {
            id: 7,
            runId: 70,
            marker: {
              ...marker,
              lease: { ...binary.lease, sourceSha: RELEASE },
            },
          },
        ],
      });
      expect(mismatch.code).toBe(1);
      expect(mismatch.stdout).toContain(
        'contradicts its source/transport attestation'
      );
    });

    it('a late older marker cannot regress the greatest proven upload source', async () => {
      const result = await authorize({
        testflightMarkers: [
          { id: 8, runId: 70, marker: validMarker(OLDER, 70) },
          { id: 7, runId: 71, marker: validMarker(RELEASE, 71) },
        ],
        testflightRuns: {
          70: testflightRun(70, OLDER),
          71: testflightRun(71, RELEASE),
        },
        testflightJobs: {
          '70/attempts/1': [
            job('Upload Internal TestFlight', OLDER, 'success', 9),
          ],
          '71/attempts/1': [
            job('Upload Internal TestFlight', RELEASE, 'success', 9),
          ],
        },
      });
      expect(result.code, result.stderr).toBe(0);
      expect(result.outputs.already_released).toBe('true');
    });

    async function record(
      binary: ReturnType<typeof binaryAttestation>,
      betaSha = NEWER,
      { publisherAttempt = 1, source = RELEASE } = {}
    ) {
      const root = tempRoot('jovie-testflight-record-');
      const step = workflow.jobs['record-upload'].steps?.find(step => step.run);
      const result = await runWithRealGh({
        script: String(step?.run),
        env: {
          REPOSITORY: REPO,
          RELEASE_SHA: source,
          TRANSPORT_SHA: NEWER,
          RUN_ID: '90',
          RUN_ATTEMPT: String(publisherAttempt),
          LEASE: JSON.stringify(binaryAttestation(source, NEWER, 90).lease),
          GITHUB_WORKSPACE: repoRoot,
          GH_API_HOLD_BUDGET_SECONDS: String(
            step?.env?.GH_API_HOLD_BUDGET_SECONDS
          ),
          RUNNER_TEMP: root,
        },
        route: routes({
          testflightRuns: { 90: testflightRun(90, NEWER, publisherAttempt) },
          testflightJobs: {
            '90/attempts/1': [
              job('Upload Internal TestFlight', betaSha, 'success', 9),
            ],
            ...(publisherAttempt > 1
              ? { [`90/attempts/${publisherAttempt}`]: [] }
              : {}),
          },
          binaries: [{ id: 500, runId: 90, attempt: 1, payload: binary }],
        }),
      });
      return { ...result, path: join(root, 'testflight-upload-verified.json') };
    }
    it('consumes a publisher-only rerun receipt from its failed earlier upload attempt', async () => {
      const published = await record(
        binaryAttestation(OLDER, NEWER, 90),
        NEWER,
        {
          publisherAttempt: 2,
          source: OLDER,
        }
      );
      expect(published.code, published.stderr).toBe(0);
      const marker = JSON.parse(readFileSync(published.path, 'utf8'));
      expect(marker.uploadRunAttempt).toBe('1');
      const recovered = await authorize({
        mainSha: NEWER,
        testflightMarkers: [{ id: 7, runId: 90, marker }],
        testflightRuns: { 90: testflightRun(90, NEWER, 2) },
        testflightAttempts: {
          '90/attempts/1': {
            ...testflightRun(90, NEWER),
            conclusion: 'failure',
          },
        },
        testflightJobs: { '90/attempts/1': [attestedJob(NEWER)] },
      });
      expect(recovered.code, recovered.stderr).toBe(0);
      expect(recovered.outputs.baseline_sha).toBe(OLDER);
    });

    it.each([
      ['same-attempt contradiction', 'failure', 1, true, 'success'],
      ['cancelled prior attempt', 'cancelled', 2, true, 'success'],
      ['timed-out prior attempt', 'timed_out', 2, true, 'success'],
      ['unknown prior conclusion', null, 2, true, 'success'],
      ['invalid latest attempt', 'failure', 0, true, 'success'],
      ['legacy failed attempt', 'failure', 2, false, 'success'],
      ['failed beta', 'failure', 2, true, 'failure'],
    ] as const)(
      'rejects publisher recovery with %s',
      async (_name, conclusion, latestAttempt, attested, betaConclusion) => {
        const binary = binaryAttestation(OLDER, NEWER, 90);
        const marker = {
          ...validMarker(OLDER, 90),
          ...(attested
            ? {
                schema: 'jovie-testflight-upload/v2',
                transportSha: NEWER,
                lease: binary.lease,
                binarySha256: binary.binarySha256,
                buildNumber: binary.buildNumber,
              }
            : {}),
        };
        const transport = attested ? NEWER : OLDER;
        const result = await authorize({
          mainSha: NEWER,
          testflightMarkers: [{ id: 7, runId: 90, marker }],
          testflightRuns: { 90: testflightRun(90, transport, latestAttempt) },
          testflightAttempts: {
            '90/attempts/1': { ...testflightRun(90, transport), conclusion },
          },
          testflightJobs: {
            '90/attempts/1': [
              job('Upload Internal TestFlight', transport, betaConclusion, 9),
            ],
          },
        });
        expect(result.code).toBe(1);
        expect(result.stdout).toContain(
          'none fully proves a successful upload'
        );
      }
    );
    it('records independent source and transport with the exact binary digest', async () => {
      const result = await record(binaryAttestation(RELEASE, NEWER, 90));
      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(result.path, 'utf8'))).toMatchObject({
        schema: 'jovie-testflight-upload/v2',
        sha: RELEASE,
        transportSha: NEWER,
        binarySha256: 'd'.repeat(64),
        buildNumber: '44',
        uploadJob: '9',
        lease: { sourceSha: RELEASE, transportSha: NEWER },
      });
    });
    it('refuses a source/job transport mismatch or a binary from another source', async () => {
      const wrongJob = await record(
        binaryAttestation(RELEASE, NEWER, 90),
        RELEASE
      );
      expect(wrongJob.code).toBe(1);
      const wrongBinary = await record(binaryAttestation(OLDER, NEWER, 90));
      expect(wrongBinary.code).toBe(1);
    });
  }
);

describe.skipIf(!gh)(
  'TestFlight archive rate-limit preflight (real gh)',
  () => {
    async function preflight(
      mode: 'success' | 'permission' | 'budget' | 'malformed'
    ) {
      const root = tempRoot('jovie-testflight-archive-hold-');
      const tools = join(root, '.testflight-tools/.github/scripts');
      mkdirSync(tools, { recursive: true });
      writeFileSync(
        join(tools, 'gh-api-hold.sh'),
        readFileSync(resolve(repoRoot, '.github/scripts/gh-api-hold.sh'))
      );
      const guard = join(root, 'guard.mjs');
      const probe = join(root, 'guard-called');
      writeFileSync(
        guard,
        "import {writeFileSync} from 'node:fs'; writeFileSync(process.env.GUARD_PROBE, process.argv[2]);"
      );
      const step = workflow.jobs.beta.steps?.find(
        step => step.name === 'Revalidate certified lease before archive'
      );
      const lease = JSON.stringify({ sourceSha: RELEASE, transportSha: NEWER });
      const result = await runWithRealGh({
        script: String(step?.run).replaceAll('${{ github.repository }}', REPO),
        env: {
          GITHUB_WORKSPACE: root,
          GH_API_HOLD_BUDGET_SECONDS: String(
            step?.env?.GH_API_HOLD_BUDGET_SECONDS
          ),
          TESTFLIGHT_LEASE: lease,
          TESTFLIGHT_LEASE_PATH: join(root, 'lease.json'),
          TESTFLIGHT_GUARD_PATH: guard,
          GUARD_PROBE: probe,
        },
        route: path => {
          if (path === `repos/${REPO}/commits/main`) {
            if (mode === 'permission')
              return {
                status: 403,
                body: { message: 'Resource not accessible by integration' },
              };
            if (mode === 'budget')
              return {
                status: 403,
                body: { message: 'API rate limit exceeded' },
              };
            return { body: { sha: mode === 'malformed' ? 'invalid' : NEWER } };
          }
          if (path.startsWith('rate_limit'))
            return {
              body: {
                resources: {
                  core: { reset: Math.floor(Date.now() / 1000) + 10000 },
                },
              },
            };
          return null;
        },
      });
      return { ...result, root, probe, lease };
    }

    it('preserves the held main read and still invokes the lease guard after main advances', async () => {
      const result = await preflight('success');
      expect(result.code, result.stderr).toBe(0);
      expect(readFileSync(result.probe, 'utf8')).toBe('archive');
      expect(readFileSync(join(result.root, 'lease.json'), 'utf8').trim()).toBe(
        result.lease
      );
      expect(
        result.requests.filter(path => path.endsWith('/commits/main'))
      ).toHaveLength(1);
    });

    it.each(['permission', 'budget', 'malformed'] as const)(
      'fails closed before the lease guard for %s evidence',
      async mode => {
        const result = await preflight(mode);
        expect(result.code).not.toBe(0);
        expect(() => readFileSync(result.probe)).toThrow();
        expect(
          result.requests.filter(path => path.endsWith('/commits/main'))
        ).toHaveLength(1);
        if (mode === 'permission')
          expect(
            result.requests.some(path => path.startsWith('rate_limit'))
          ).toBe(false);
        if (mode === 'budget')
          expect(result.stderr).toContain('outside the 600s budget');
      }
    );
  }
);

describe('certified TestFlight checkout isolation', () => {
  const steps = authorizeJob.steps ?? [];
  const bootstrap = steps.find(
    step => step.name === 'Checkout the rate-limit hold'
  );
  const source = steps.find(
    step => step.name === 'Checkout exact authorized main'
  );
  const pin = steps.find(step => step.id === 'pin');

  it('keeps transport sparse state out of the certified root checkout', () => {
    expect(bootstrap?.with).toMatchObject({
      ref: '${{ github.sha }}',
      path: '.testflight-bootstrap',
      'persist-credentials': false,
      'sparse-checkout': '.github/scripts/gh-api-hold.sh',
      'sparse-checkout-cone-mode': false,
    });
    expect(authorizeStep?.run).toContain(
      '$GITHUB_WORKSPACE/.testflight-bootstrap/.github/scripts/gh-api-hold.sh'
    );
    expect(source?.with?.ref).toBe(
      '${{ steps.authorize.outputs.release_sha }}'
    );
    expect(source?.with?.path).toBeUndefined();
    expect(source?.with?.['sparse-checkout']).toBeUndefined();
    expect(steps.indexOf(bootstrap!)).toBeLessThan(
      steps.indexOf(authorizeStep!)
    );
    expect(steps.indexOf(authorizeStep!)).toBeLessThan(steps.indexOf(source!));
  });

  function runPin(fastfile: string | null) {
    const root = tempRoot('jovie-testflight-pin-checkout-');
    const guardDirectory = join(root, '.testflight-tools/.github/scripts');
    mkdirSync(guardDirectory, { recursive: true });
    const probe = join(root, 'guard-called');
    writeFileSync(
      join(guardDirectory, 'testflight-release-lease.mjs'),
      "import {writeFileSync} from 'node:fs'; writeFileSync(process.env.GUARD_PROBE, process.argv[2]);"
    );
    if (fastfile !== null) {
      mkdirSync(join(root, 'fastlane'));
      writeFileSync(join(root, 'fastlane/Fastfile'), fastfile);
    }
    const output = join(root, 'output');
    writeFileSync(output, '');
    // The probe isolates caller choreography; the real guard CLI's authority,
    // expiry and replay checks remain covered by its own execution suite.
    const result = spawnSync('bash', ['-c', String(pin?.run)], {
      cwd: root,
      encoding: 'utf8',
      env: { ...fixtureEnv(), GITHUB_OUTPUT: output, GUARD_PROBE: probe },
    });
    return { ...result, probe, outputs: readOutputs(output) };
  }

  it('rejects an incomplete checkout before it can look like an old certified source', () => {
    const result = runPin(null);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('checkout is missing fastlane/Fastfile');
    expect(() => readFileSync(result.probe)).toThrow();
    expect(result.outputs.lease).toBeUndefined();
  });

  it('still stands down a complete legacy source without the final guard', () => {
    const result = runPin('# legacy Fastfile');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('predates the bounded upload guard');
    expect(() => readFileSync(result.probe)).toThrow();
    expect(result.outputs.lease).toBeUndefined();
  });

  it('invokes the lease guard when the complete certified source contains it', () => {
    const result = runPin('TESTFLIGHT_GUARD_PATH');
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(result.probe, 'utf8')).toBe('admit');
  });
});

describe('iOS TestFlight release selection', () => {
  function gitRepo() {
    const root = tempRoot('jovie-testflight-select-');
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        env: fixtureEnv(),
      }).trim();
    git('init', '-q');
    git('config', 'user.email', 'select@example.test');
    git('config', 'user.name', 'select');
    const commit = (path: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), `${path}\n`);
      git('add', '.');
      git('commit', '-qm', path);
      return git('rev-parse', 'HEAD');
    };
    return { root, commit };
  }
  function select(cwd: string, env: Record<string, string>) {
    const output = join(cwd, '.select-output');
    writeFileSync(output, '');
    execFileSync('bash', ['-c', String(selectStep?.run)], {
      cwd,
      env: {
        ...fixtureEnv(),
        GITHUB_OUTPUT: output,
        AUTHORIZED: 'true',
        ALREADY_RELEASED: 'false',
        MANUAL: 'false',
        BASELINE_SHA: '',
        ...env,
      },
      stdio: 'pipe',
    });
    return readOutputs(output).should_release;
  }

  it('releases only verified generations with iOS release changes', () => {
    const { root, commit } = gitRepo();
    const baseline = commit('apps/ios/App.swift');
    const docsOnly = commit('docs/readme.md');
    expect(
      select(root, { RELEASE_SHA: docsOnly, BASELINE_SHA: baseline })
    ).toBe('false');
    const iosChange = commit('fastlane/Fastfile');
    expect(
      select(root, { RELEASE_SHA: iosChange, BASELINE_SHA: baseline })
    ).toBe('true');
    expect(select(root, { RELEASE_SHA: iosChange, AUTHORIZED: 'false' })).toBe(
      'false'
    );
    expect(
      select(root, { RELEASE_SHA: iosChange, ALREADY_RELEASED: 'true' })
    ).toBe('false');
    expect(select(root, { RELEASE_SHA: docsOnly, MANUAL: 'true' })).toBe(
      'true'
    );
    expect(select(root, { RELEASE_SHA: docsOnly })).toBe('true');
  });

  it('catches up an intermediate iOS change when the latest pending generation changes only docs', () => {
    const { root, commit } = gitRepo();
    const uploaded = commit('apps/ios/App.swift');
    const intermediate = commit('apps/ios/Next.swift');
    const latestPending = commit('docs/latest-pending.md');
    expect(
      select(root, { RELEASE_SHA: latestPending, BASELINE_SHA: uploaded })
    ).toBe('true');
    expect(
      select(root, { RELEASE_SHA: latestPending, BASELINE_SHA: intermediate })
    ).toBe('false');
  });

  it('refuses a baseline that is not an ancestor of the release', () => {
    const { root, commit } = gitRepo();
    const base = commit('apps/ios/A.swift');
    const release = commit('apps/ios/B.swift');
    expect(() =>
      select(root, { RELEASE_SHA: base, BASELINE_SHA: release })
    ).toThrow();
  });
});

describe('iOS TestFlight job graph', () => {
  it('reserves the nonhidden lease file only after admission and gates native jobs on that lease', () => {
    const pin = authorizeJob.steps?.find(step => step.id === 'pin');
    const reserve = authorizeJob.steps?.find(
      step => step.name === 'Reserve immutable upload intent'
    );
    expect(pin?.env?.TESTFLIGHT_LEASE_PATH).toBe(
      '${{ github.workspace }}/testflight-release-lease.json'
    );
    expect(reserve?.with?.path).toBe(pin?.env?.TESTFLIGHT_LEASE_PATH);
    expect(reserve?.if).toBe("${{ steps.pin.outputs.lease != '' }}");
    expect(authorizeJob.outputs?.should_release).toContain(
      "steps.pin.outputs.lease != ''"
    );
    expect(workflow.jobs.beta.env?.TESTFLIGHT_LEASE_PATH).toBe(
      pin?.env?.TESTFLIGHT_LEASE_PATH
    );
  });
  it('runs only after Production Controller on main, serialized and uncancelled', () => {
    expect(Object.keys(workflow.on).sort()).toEqual([
      'workflow_dispatch',
      'workflow_run',
    ]);
    expect(workflow.on.workflow_run).toEqual({
      workflows: ['Production Controller'],
      types: ['completed'],
      branches: ['main'],
    });
    expect(workflow.concurrency).toEqual({
      group: 'ios-testflight',
      'cancel-in-progress': false,
    });
  });

  it('uploads only after exact authorization and the full Xcode regression', () => {
    const {
      'full-regression': regression,
      beta,
      'record-upload': record,
    } = workflow.jobs;
    expect(regression?.needs).toEqual(['authorize-release']);
    expect(regression?.uses).toBe('./.github/workflows/ios-ci.yml');
    expect(regression?.with).toMatchObject({
      'full-regression': true,
      'checkout-ref': '${{ needs.authorize-release.outputs.release_sha }}',
    });
    expect(regression?.if).toContain(
      "needs.authorize-release.outputs.should_release == 'true'"
    );
    expect(beta?.needs).toEqual(['authorize-release', 'full-regression']);
    for (const condition of [
      "needs.authorize-release.result == 'success'",
      "needs.full-regression.result == 'success'",
      "needs.authorize-release.outputs.should_release == 'true'",
    ])
      expect(beta?.if).toContain(condition);
    const betaRuns = (beta?.steps ?? []).map(step => step.run ?? '').join('\n');
    expect(betaRuns).toContain('bundle exec fastlane ios beta');
    // The Xcode suite already ran in full-regression; beta must not repeat it.
    expect(betaRuns).not.toContain('fastlane ios ios_tests');
    expect(JSON.stringify(beta)).not.toContain(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
    );
    const checkout = beta?.steps?.find(step =>
      step.uses?.startsWith('actions/checkout@')
    );
    expect(checkout?.with?.ref).toBe(
      '${{ needs.authorize-release.outputs.release_sha }}'
    );
    expect(record?.needs).toEqual(['authorize-release', 'beta']);
    expect(record?.if).toContain("needs.beta.result == 'success'");
  });
});

describe('iOS TestFlight release routing and lane', () => {
  it('the actual Fastfile invokes the final upload guard and propagates its denial', () => {
    const root = tempRoot('jovie-testflight-fastfile-');
    const guard = join(root, 'guard.mjs');
    const called = join(root, 'called');
    writeFileSync(
      guard,
      `import {writeFileSync} from 'node:fs'; writeFileSync(process.env.FIXTURE_CALLED, process.argv[2]); process.exit(Number(process.env.FIXTURE_GUARD_STATUS));`
    );
    const script = `
      def default_platform(*)\nend
      def opt_out_usage\nend
      module UI
        def self.user_error!(message)\nraise message\nend
      end
      eval(File.read(ARGV.fetch(0)).split("platform :ios do").first, TOPLEVEL_BINDING, ARGV.fetch(0))
      verify_release_sha_is_current_main!
    `;
    const env = {
      ...fixtureEnv(),
      TESTFLIGHT_LEASE_PATH: join(root, 'lease.json'),
      TESTFLIGHT_GUARD_PATH: guard,
      FIXTURE_CALLED: called,
      FIXTURE_GUARD_STATUS: '0',
    };
    const fastfile = resolve(repoRoot, 'fastlane/Fastfile');
    execFileSync('ruby', ['-e', script, fastfile], { env, stdio: 'pipe' });
    expect(readFileSync(called, 'utf8')).toBe('upload');
    expect(() =>
      execFileSync('ruby', ['-e', script, fastfile], {
        env: { ...env, FIXTURE_GUARD_STATUS: '1' },
        stdio: 'pipe',
      })
    ).toThrow();
  });
  it('classifies TestFlight release inputs into the iOS lane', async () => {
    const { classifyProductLanes } = (await import(
      '../../../../../scripts/lib/product-lane-classifier.mjs'
    )) as {
      classifyProductLanes: (paths: string[]) => { selectedLanes: string[] };
    };
    for (const path of [
      '.github/workflows/ios-testflight.yml',
      '.github/workflows/ios-ci.yml',
    ])
      expect(classifyProductLanes([path]).selectedLanes, path).toContain('ios');
  });

  it('revalidates current main between archive and upload', () => {
    const fastfile = readFileSync(
      resolve(repoRoot, 'fastlane/Fastfile'),
      'utf8'
    );
    const lastMainCheck = fastfile.lastIndexOf(
      'verify_release_sha_is_current_main!'
    );
    expect(fastfile.indexOf('gym(')).toBeGreaterThan(-1);
    expect(fastfile.indexOf('gym(')).toBeLessThan(lastMainCheck);
    expect(lastMainCheck).toBeLessThan(
      fastfile.indexOf('upload_to_testflight(')
    );
  });
});
