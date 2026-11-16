import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import * as realGhHarness from '../../../../../scripts/lib/real-gh-harness.mjs';

const { resolveRealGh, runWithRealGh } = realGhHarness as unknown as {
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
};

// Superseded-before-marker TestFlight yield (2026-11-16, run 43961381820).
// A Production Controller whose generation is superseded before
// finalization ends its Production Verified job with success — without
// finalizing, without a verified marker, and without releasing anything.
// The TestFlight observer previously read that success conclusion as
// production proof and reached the lease admit, which rejected the absent
// marker and reddened main for a generation that never became verified.
// The companion suite (ios-testflight-authorization.test.ts) is size-pinned
// at 1698 lines, so these cases live here and leave that file untouched.

type Step = {
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  conclusion?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  outputs?: Record<string, string>;
  if?: string;
  env?: Record<string, string>;
  steps?: Step[];
};
type Workflow = {
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

const gh = resolveRealGh();
if (!gh && process.env.CI) {
  throw new Error('JOV-7707: CI must provide the real gh binary.');
}

const REPO = 'JovieInc/Jovie';
const RELEASE = 'a'.repeat(40);
const CONTROLLER_WORKFLOW_ID = 101;
const CONTROLLER_RUN = 5000;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tempRoot(prefix: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

const verifiedJob = (steps: Step[]) => ({
  id: 1,
  name: 'Production Verified',
  head_sha: RELEASE,
  status: 'completed',
  conclusion: 'success',
  steps,
});

const supersededSteps: Step[] = [
  {
    name: 'Resolve current main before final verification',
    conclusion: 'success',
  },
  {
    name: 'Require exact deployment and every post-deploy probe',
    conclusion: 'skipped',
  },
  { name: 'Finalize exact current release generation', conclusion: 'skipped' },
  {
    name: 'Preserve exact verified-generation marker',
    conclusion: 'skipped',
  },
];

const finalizedSteps: Step[] = [
  {
    name: 'Resolve current main before final verification',
    conclusion: 'success',
  },
  {
    name: 'Require exact deployment and every post-deploy probe',
    conclusion: 'success',
  },
  {
    name: 'Finalize exact current release generation',
    conclusion: 'success',
  },
];

function routes(controllerJobs: unknown[]) {
  const base = `repos/${REPO}/`;
  const table = new Map<string, unknown>([
    [
      'actions/workflows/production-controller.yml',
      {
        id: CONTROLLER_WORKFLOW_ID,
        name: 'Production Controller',
        path: '.github/workflows/production-controller.yml',
      },
    ],
    [
      `actions/runs/${CONTROLLER_RUN}/attempts/1`,
      {
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
      },
    ],
    [
      `actions/runs/${CONTROLLER_RUN}/attempts/1/jobs?per_page=100`,
      { jobs: controllerJobs },
    ],
    ['commits/main', { sha: RELEASE }],
    [
      `actions/artifacts?name=production-generation-verified-${RELEASE}&per_page=100`,
      { artifacts: [] },
    ],
    [
      'actions/workflows/ios-testflight.yml',
      {
        id: 202,
        name: 'iOS TestFlight',
        path: '.github/workflows/ios-testflight.yml',
      },
    ],
    [
      'actions/artifacts?name=testflight-upload-verified&per_page=100',
      { artifacts: [] },
    ],
    [
      'actions/workflows/ios-testflight.yml/runs?branch=main&status=completed&per_page=100',
      { workflow_runs: [] },
    ],
  ]);
  return (path: string) =>
    path.startsWith(base) && table.has(path.slice(base.length))
      ? { body: table.get(path.slice(base.length)) as object }
      : null;
}

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

async function authorize(controllerJobs: unknown[]) {
  const root = tempRoot('jovie-testflight-superseded-');
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
      GITHUB_OUTPUT: output,
      GITHUB_WORKSPACE: root,
      GH_API_HOLD_BUDGET_SECONDS: String(
        authorizeStep?.env?.GH_API_HOLD_BUDGET_SECONDS
      ),
      RUNNER_TEMP: root,
    },
    route: routes(controllerJobs),
  });
  return { ...result, outputs: readOutputs(output) };
}

describe.skipIf(!gh)(
  'superseded-before-marker TestFlight yield (real gh)',
  () => {
    it('yields a visible no-op when a superseded generation ends Production Verified successfully without finalizing', async () => {
      // Mirror of run 43961381820: main advanced past the generation before
      // finalization, the controller concluded success with the finalize step
      // skipped, and no verified marker exists. The observer must stand down
      // as a visible no-op instead of reaching the lease admit, which would
      // reject the absent marker and redden main.
      const result = await authorize([verifiedJob(supersededSteps)]);
      expect(result.code, result.stderr).toBe(0);
      expect(result.outputs.authorized).toBe('false');
      expect(result.outputs.release_sha).toBe('');
      expect(result.stdout + result.stderr).toContain('without finalizing');
      expect(result.stdout + result.stderr).toContain(
        'no TestFlight release is due'
      );
    });

    it('keeps the lease as the loud authority when finalization ran but no marker exists', async () => {
      // A finalized generation that somehow carries no marker is not a yield:
      // authorize still routes it to the pin step, whose lease fails loudly.
      const result = await authorize([verifiedJob(finalizedSteps)]);
      expect(result.code, result.stderr).toBe(0);
      expect(result.outputs.authorized).toBe('true');
      expect(result.outputs.release_sha).toBe(RELEASE);
      expect(result.stdout + result.stderr).not.toContain(
        'no TestFlight release is due'
      );
    });

    it('does not yield when the finalize step conclusion is unknown', async () => {
      // Missing step evidence must never look like a deliberate yield; the
      // lease stays the fail-closed authority for an ambiguous marker.
      const result = await authorize([
        verifiedJob([
          { name: 'Upload internal TestFlight build', conclusion: 'success' },
        ]),
      ]);
      expect(result.code, result.stderr).toBe(0);
      expect(result.outputs.authorized).toBe('true');
      expect(result.stdout + result.stderr).not.toContain(
        'no TestFlight release is due'
      );
    });
  }
);
