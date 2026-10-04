import { execFileSync } from 'node:child_process';
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
  name?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
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
  testflightJobs?: Record<string, unknown[]>;
  legacyRuns?: Record<string, unknown>[];
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
  for (const [id, run] of Object.entries(world.testflightRuns ?? {})) {
    table.set(`actions/runs/${id}`, run);
    table.set(`actions/runs/${id}/attempts/${run.run_attempt}`, run);
  }
  for (const [key, jobs] of Object.entries(world.testflightJobs ?? {}))
    table.set(`actions/runs/${key}/jobs?per_page=100`, { jobs });
  return (path: string) => {
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
  const result = await runWithRealGh({
    script: String(authorizeStep?.run),
    env: {
      ...workflowRunEnv(),
      ...env,
      GITHUB_OUTPUT: output,
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

describe.skipIf(!gh)('iOS TestFlight release authorization (real gh)', () => {
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

  it('stands down without releasing a superseded generation', async () => {
    const supersededController = await authorize({
      controllerRun: controllerRun({
        display_title: `Production Controller ${NEWER} from CI 78 attempt 1`,
      }),
    });
    expect(supersededController.code).toBe(0);
    expect(supersededController.outputs.authorized).toBe('false');
    const mainMoved = await authorize({ mainSha: NEWER });
    expect(mainMoved.code).toBe(0);
    expect(mainMoved.outputs.authorized).toBe('false');
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
