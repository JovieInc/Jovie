// Guard (JOV-7998 secrets audit): a pull_request workflow job that runs PR-head
// code must not hold secrets once that code can execute. Head code could read
// the secret from its environment or poison the runner (GITHUB_ENV, PATH) for
// later steps. Secret-bearing steps must come before the first head-code step,
// and the security gate must run from the trusted base copy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../../../.github/workflows/source-validation.yml', import.meta.url),
  'utf8'
);

function jobText(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `job ${name} exists`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][a-z0-9_-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test('Security Evidence: no secret is referenced after PR-head code can run', () => {
  const job = jobText('security');
  const firstHeadCode = job.indexOf('uses: ./.github/actions/setup-node-pnpm');
  assert.notEqual(firstHeadCode, -1, 'head-code setup step exists');
  const after = job.slice(firstHeadCode);
  assert.equal(
    /secrets\.[A-Z_]+/.test(after),
    false,
    'secrets must not be referenced after the first PR-head code step'
  );
});

test('Security Evidence: the gate runs from the trusted base archive', () => {
  const job = jobText('security');
  assert.match(
    job,
    /git archive "origin\/\$BASE_REF" scripts\/security scripts\/lib/
  );
  assert.match(job, /node "\$trusted\/scripts\/security\/security-gate\.mjs"/);
  assert.equal(
    /\n\s+node scripts\/security\/security-gate\.mjs/.test(job),
    false,
    'head copy of the gate must not run with the key'
  );
});
