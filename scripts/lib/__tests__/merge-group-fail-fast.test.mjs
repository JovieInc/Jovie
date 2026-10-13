import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const CI = /** @type {{ jobs: Record<string, any> }} */ (
  load(readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8'))
);
const STEP_NAME = 'Post a failing PR Ready on the combined head';
const ejectJob = lane => `${lane}-fail-fast`;
const SHA = 'a'.repeat(40);

// Lanes whose failure always fails the combined-head `PR Ready` aggregate and
// that can fail well before the slowest lane finishes. A lane added here must
// be a (transitive) need of ci-merge-group-ready.
const FAIL_FAST_LANES = [
  'ci-merge-group-admission',
  'ci-risk-classifier',
  'ci-secret-scan',
  'ci-golden-path-lock',
  'ci-visual-snapshot-compare',
  'ci-fast-typecheck',
  'ci-fast-remaining',
  'ci-profile-admission-browser',
  'ci-fast-structural-python',
  'ci-fast-structural-web',
  'ci-build-ovie',
  'ci-typecheck-ovie',
  'ci-storybook-surfaces',
  'ci-lighthouse-dashboard-pr',
  'ci-lighthouse-onboarding-pr',
  'ci-unit-tests',
  'ci-exact-head-coverage-shard',
];

function needsOf(job) {
  const needs = CI.jobs[job]?.needs ?? [];
  return Array.isArray(needs) ? needs : [needs];
}

function transitiveNeeds(job, seen = new Set()) {
  for (const need of needsOf(job)) {
    if (!seen.has(need)) {
      seen.add(need);
      transitiveNeeds(need, seen);
    }
  }
  return seen;
}

function ejectStep(lane) {
  return CI.jobs[ejectJob(lane)].steps.find(step => step.name === STEP_NAME);
}

let server;
afterEach(() => server?.close());

async function runEject({ status }) {
  const requests = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: JSON.parse(body),
      });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const { port } = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  const child = spawn(
    'bash',
    ['-e', '-c', ejectStep('ci-fast-remaining').run],
    {
      env: {
        PATH: process.env.PATH,
        GH_TOKEN: 'test-token',
        GITHUB_API_URL: `http://127.0.0.1:${port}`,
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
        GITHUB_SHA: SHA,
        LANE: 'ci-fast-remaining',
        GITHUB_RUN_ID: '42',
      },
    }
  );
  let stdout = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  const code = await new Promise(done => child.on('close', done));
  return { code, stdout, requests };
}

describe('merge-group fail-fast ejection', () => {
  it('covers only lanes that the combined-head PR Ready aggregate needs', () => {
    const ready = transitiveNeeds('ci-merge-group-ready');
    for (const lane of FAIL_FAST_LANES)
      expect(ready.has(lane), lane).toBe(true);
    const ejectors = Object.keys(CI.jobs).filter(job =>
      job.endsWith('-fail-fast')
    );
    expect(ejectors.sort()).toEqual(FAIL_FAST_LANES.map(ejectJob).sort());
  });

  it('runs a step-only job per lane, only for its failed merge-group lane', () => {
    const run = ejectStep(FAIL_FAST_LANES[0]).run;
    for (const lane of FAIL_FAST_LANES) {
      const job = CI.jobs[ejectJob(lane)];
      expect(needsOf(ejectJob(lane)), lane).toEqual([lane]);
      expect(job.if, lane).toBe(
        "${{ failure() && github.event_name == 'merge_group' }}"
      );
      expect(job.permissions, lane).toEqual({ statuses: 'write' });
      expect(job.steps, lane).toHaveLength(1);
      expect(ejectStep(lane).run, lane).toBe(run);
      expect(ejectStep(lane).env.LANE, lane).toBe(lane);
      // The lane itself keeps no write scope.
      const lanePermissions = Object.entries(CI.jobs[lane].permissions ?? {});
      expect(
        lanePermissions.filter(([, level]) => level === 'write'),
        lane
      ).toEqual([]);
    }
  });

  it('only posts failure, never a passing status', () => {
    const run = ejectStep(FAIL_FAST_LANES[0]).run;
    expect(run).toContain('\\"state\\":\\"failure\\"');
    expect(run).not.toMatch(/success|pending/);
  });

  it('gives statuses: write only to jobs that run no action and no checked-out code', () => {
    // 2026-10-13 review of #21539: a lane running third-party actions or the
    // queued head's code with statuses: write could forge a SUCCESS PR Ready.
    for (const [name, job] of Object.entries(CI.jobs)) {
      if ((job.permissions ?? {}).statuses !== 'write') continue;
      for (const step of job.steps ?? []) {
        expect(step.uses, `${name}: ${step.name}`).toBeUndefined();
      }
    }
    expect(
      Object.values(CI.jobs).filter(
        job => (job.permissions ?? {}).statuses === 'write'
      )
    ).toHaveLength(FAIL_FAST_LANES.length);
  });

  it('posts a failing PR Ready status on the exact combined head', async () => {
    const { code, stdout, requests } = await runEject({ status: 201 });
    expect(code).toBe(0);
    expect(stdout).toContain('status post: 201');
    expect(requests).toEqual([
      {
        method: 'POST',
        url: `/repos/JovieInc/Jovie/statuses/${SHA}`,
        auth: 'Bearer test-token',
        body: {
          state: 'failure',
          context: 'PR Ready',
          description:
            'ci-fast-remaining failed; ejected before the slowest lane',
          target_url: 'https://github.com/JovieInc/Jovie/actions/runs/42',
        },
      },
    ]);
  });

  it('never turns a rejected status post into a second failure', async () => {
    const { code, stdout, requests } = await runEject({ status: 403 });
    expect(code).toBe(0);
    expect(stdout).toContain('status post: 403');
    expect(requests).toHaveLength(1);
  });
});
