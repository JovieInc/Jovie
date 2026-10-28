import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '../../..');
const allow = JSON.parse(
  readFileSync(resolve(root, '.github/self-hosted-jobs.json'), 'utf8')
);

// Policy 2026-10-26: GitHub-hosted is the default for all Jovie CI. The repo is public, so hosted
// minutes are free (~120 concurrent), while the gem pool also runs the shipping lanes and agents.
// A job may run self-hosted only with a recorded reason (host-local state, or testing the runners).
function selfHostedJobs() {
  const found = [];
  const dir = resolve(root, '.github/workflows');
  for (const file of readdirSync(dir).filter(name => /\.ya?ml$/.test(name))) {
    const workflow = load(readFileSync(resolve(dir, file), 'utf8'));
    for (const [job, spec] of Object.entries(workflow.jobs ?? {})) {
      const runsOn = JSON.stringify(spec['runs-on'] ?? '');
      if (/mac-child|macos|jovie-mac|macOS/.test(runsOn)) continue;
      if (/self-hosted|jovie-runner|jovie-fixed|jovie-ephemeral/.test(runsOn))
        found.push({ workflow: file, job });
    }
  }
  return found;
}

test('every self-hosted job has a recorded reason, and no reason outlives its job', () => {
  const found = selfHostedJobs();
  const allowed = key =>
    allow.jobs.some(
      entry =>
        entry.workflow === key.workflow &&
        (entry.job === '*' || entry.job === key.job)
    );
  for (const key of found)
    assert.ok(
      allowed(key),
      `${key.workflow}:${key.job} runs self-hosted without a reason in .github/self-hosted-jobs.json. Run it on ubuntu-latest, or record why it needs the gem host.`
    );
  for (const entry of allow.jobs) {
    assert.ok(
      entry.reason.length >= 20,
      `${entry.workflow}:${entry.job} needs a real reason`
    );
    assert.ok(
      found.some(
        key =>
          key.workflow === entry.workflow &&
          (entry.job === '*' || entry.job === key.job)
      ),
      `${entry.workflow}:${entry.job} is allowlisted but no longer runs self-hosted; remove the entry.`
    );
  }
});

test('mutation testing runs on hosted runners and keeps its sweep state in an Actions cache', () => {
  const workflow = load(
    readFileSync(resolve(root, '.github/workflows/mutation-diff.yml'), 'utf8')
  );
  for (const job of ['mutate', 'sweep'])
    assert.equal(workflow.jobs[job]['runs-on'], 'ubuntu-latest');
  const uses = workflow.jobs.sweep.steps.map(step => step.uses ?? '');
  assert.ok(uses.some(u => u.startsWith('actions/cache/restore@')));
  assert.ok(uses.some(u => u.startsWith('actions/cache/save@')));
});
