import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

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

// The marker-heal job dispatches a workflow, so its App token also carries actions: write.
// It is job-scoped and fail-closed; no controller job may hold github.token.
test('no controller job holds github.token; heal mints a write-scoped App token', () => {
  const holders = Object.entries(wf.jobs)
    .filter(([, job]) =>
      JSON.stringify(job.steps ?? []).includes('github.token')
    )
    .map(([name]) => name);
  assert.deepEqual(holders, []);
  const steps = wf.jobs['heal-interrupted-marker'].steps;
  const mint = steps.find(s => s.id === 'dispatch-token');
  assert.ok(mint);
  assert.equal(mint['continue-on-error'], undefined);
  assert.equal(mint.with['permission-actions'], 'write');
  assert.equal(mint.with['permission-contents'], 'read');
  const dispatch = steps.find(s => s.env?.GH_TOKEN);
  assert.equal(
    dispatch.env.GH_TOKEN,
    '${{ steps.dispatch-token.outputs.token }}'
  );
  for (const [name, job] of Object.entries(wf.jobs)) {
    if (name === 'heal-interrupted-marker') continue;
    assert.doesNotMatch(
      JSON.stringify(job.steps ?? []),
      /permission-actions\\?": ?\\?"write/,
      name
    );
  }
});
