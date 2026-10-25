// Guard (JOV-7998 secrets audit): a pull_request workflow job that runs PR-head
// code must not hold secrets once that code can execute. Head code could read
// the secret from its environment or poison the runner (GITHUB_ENV, PATH) for
// later steps. Secret-bearing steps must come before the first head-code step,
// and the security gate must run from the trusted base copy.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/source-validation.yml', import.meta.url),
  'utf8'
);

function jobText(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start).not.toBe(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][a-z0-9_-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

it('Security Evidence: no secret is referenced after PR-head code can run', () => {
  const job = jobText('security');
  const firstHeadCode = job.indexOf('uses: ./.github/actions/setup-node-pnpm');
  expect(firstHeadCode).not.toBe(-1);
  const after = job.slice(firstHeadCode);
  expect(/secrets\.[A-Z_]+/.test(after)).toBe(false);
});

it('Security Evidence: the gate runs from the trusted base archive', () => {
  const job = jobText('security');
  expect(job).toMatch(
    /git archive "origin\/\$BASE_REF" scripts\/security scripts\/lib/
  );
  expect(job).toMatch(
    /node "\$trusted\/scripts\/security\/security-gate\.mjs"/
  );
  expect(/\n\s+node scripts\/security\/security-gate\.mjs/.test(job)).toBe(
    false
  );
});
