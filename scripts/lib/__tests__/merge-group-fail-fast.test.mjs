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
const STEP_NAME = 'Eject the merge group on this lane failure';
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
  'ci-build-layout',
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

function ejectStep(job) {
  return CI.jobs[job].steps.find(step => step.name === STEP_NAME);
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
        GITHUB_JOB: 'ci-fast-remaining',
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
    const withStep = Object.keys(CI.jobs).filter(job =>
      (CI.jobs[job].steps ?? []).some(step => step.name === STEP_NAME)
    );
    expect(withStep.sort()).toEqual([...FAIL_FAST_LANES].sort());
  });

  it('runs last, only for a failed merge-group lane, with status scope', () => {
    const run = ejectStep(FAIL_FAST_LANES[0]).run;
    for (const lane of FAIL_FAST_LANES) {
      const { steps, permissions } = CI.jobs[lane];
      const step = ejectStep(lane);
      expect(steps.at(-1), lane).toBe(step);
      expect(step.if, lane).toBe(
        "${{ failure() && github.event_name == 'merge_group' }}"
      );
      expect(step.run, lane).toBe(run);
      expect(permissions.statuses, lane).toBe('write');
      expect(
        Object.entries(permissions).filter(([, level]) => level === 'write'),
        lane
      ).toEqual([['statuses', 'write']]);
    }
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
