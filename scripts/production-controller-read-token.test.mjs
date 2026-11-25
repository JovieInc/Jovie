import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { readExactGithubListing } from './lib/exact-github-listing.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '..');
const wf = load(
  readFileSync(
    resolve(root, '.github/workflows/production-controller.yml'),
    'utf8'
  )
);

// 2026-10-26: the evidence step held 1369s for the shared github.token reset (0/5000 left),
// delaying prod ~25 minutes. The release gating jobs read through the App installation bucket.
const READ_JOBS = {
  'release-source': 'source',
  'coalesce-production': 'coalesce',
  'authorize-production': 'authorize',
  'production-verified': 'current',
};

for (const [job, stepId] of Object.entries(READ_JOBS)) {
  test(`${job} mints an App read token and never reads with github.token`, () => {
    const steps = wf.jobs[job].steps;
    const mint = steps.find(s => s.id === 'read-token');
    assert.ok(mint, 'mint step present');
    assert.match(mint.uses, /^actions\/create-github-app-token@[0-9a-f]{40}/);
    assert.equal(mint['continue-on-error'], undefined, 'mint must fail closed');
    assert.equal(mint.with['permission-actions'], 'read');
    assert.equal(mint.with['permission-contents'], 'read');
    assert.equal(
      steps.indexOf(mint) < steps.findIndex(s => s.id === stepId),
      true
    );
    const text = JSON.stringify(steps);
    assert.doesNotMatch(text, /github\.token/);
    assert.doesNotMatch(text, /GITHUB_TOKEN/);
    const reader = steps.find(s => s.id === stepId);
    assert.equal(reader.env.GH_TOKEN, '${{ steps.read-token.outputs.token }}');
    for (const s of steps.filter(st => st.env?.GH_TOKEN)) {
      assert.equal(s.env.GH_TOKEN, '${{ steps.read-token.outputs.token }}');
    }
  });
}

// The marker-heal job dispatches a workflow (actions: write), which no App token here is
// granted; that single rare write stays on github.token on purpose.
test('heal-interrupted-marker is the only controller job still on github.token', () => {
  const holders = Object.entries(wf.jobs)
    .filter(([, job]) =>
      JSON.stringify(job.steps ?? []).includes('github.token')
    )
    .map(([name]) => name);
  assert.deepEqual(holders, ['heal-interrupted-marker']);
});

const jobsEndpoint = 'repos/JovieInc/Jovie/actions/runs/42/attempts/3/jobs';
const firstPage = {
  total_count: 102,
  jobs: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })),
};
const secondPage = {
  total_count: 102,
  jobs: [{ id: 101 }, { id: 102, name: 'Main Release Ready' }],
};

test('exact evidence reads both pages of the same CI attempt', () => {
  const calls = [];
  const jobs = readExactGithubListing(
    endpoint => {
      calls.push(endpoint);
      return calls.length === 1 ? firstPage : secondPage;
    },
    jobsEndpoint,
    'jobs',
    'CI jobs'
  );
  assert.deepEqual(calls, [
    `${jobsEndpoint}?per_page=100`,
    `${jobsEndpoint}?per_page=100&page=2`,
  ]);
  assert.deepEqual(jobs, [...firstPage.jobs, ...secondPage.jobs]);
});

test('controller normalizes only complete exact CI job evidence', () => {
  const reader = wf.jobs['authorize-production'].steps.find(
    step => step.id === 'authorize'
  );
  assert.match(
    reader.run,
    /gh api --paginate --slurp[\s\S]*?attempts\/\$source_run_attempt\/jobs\?per_page=100[\s\S]*?node scripts\/lib\/exact-github-listing\.mjs/
  );
  const parse = pages =>
    spawnSync(
      process.execPath,
      [resolve(root, 'scripts/lib/exact-github-listing.mjs')],
      {
        input: JSON.stringify(pages),
        encoding: 'utf8',
      }
    );
  const result = parse([firstPage, secondPage]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    total_count: 102,
    jobs: [...firstPage.jobs, ...secondPage.jobs],
  });
  const invalid = [
    [firstPage],
    [firstPage, { ...secondPage, jobs: [{ id: 101 }] }],
    [firstPage, { ...secondPage, total_count: 103 }],
    [firstPage, { ...secondPage, jobs: [{ id: 100 }, { id: 102 }] }],
    [firstPage, secondPage, secondPage],
  ];
  for (const pages of invalid) {
    const rejected = parse(pages);
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.equal(rejected.stdout, '');
  }
});
