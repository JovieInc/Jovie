import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/ci.yml'),
  'utf8'
);
const envExample = readFileSync(resolve(repoRoot, '.env.example'), 'utf8');

/**
 * The `ci-env-example-guard` job only runs on workflow_dispatch, so a
 * placeholder that trips it can sit on main unnoticed until someone
 * dispatches CI. Replay the job's own grep patterns on every PR instead.
 */
function guardPatterns(): RegExp[] {
  const jobStart = workflow.indexOf('\n  ci-env-example-guard:');
  expect(jobStart).toBeGreaterThan(-1);
  const nextJob = workflow.slice(jobStart + 1).search(/\n {2}[a-z][\w-]*:\n/);
  const job =
    nextJob === -1
      ? workflow.slice(jobStart)
      : workflow.slice(jobStart, jobStart + 1 + nextJob);
  const patterns = [...job.matchAll(/grep -nE '([^']+)' \.env\.example/g)].map(
    match => new RegExp(match[1], 'm')
  );
  return patterns;
}

describe('.env.example guard', () => {
  it('extracts the secret and Stripe price patterns from the workflow', () => {
    const patterns = guardPatterns();
    expect(patterns).toHaveLength(2);
    expect(
      patterns.some(pattern =>
        pattern.test('STRIPE_PRICE_PRO_MONTHLY=price_1AbC')
      )
    ).toBe(true);
    expect(patterns.some(pattern => pattern.test('KEY=sk_live_abc'))).toBe(
      true
    );
  });

  it('keeps .env.example free of anything the dispatch-only guard rejects', () => {
    const offending = envExample
      .split('\n')
      .filter(line => guardPatterns().some(pattern => pattern.test(line)));
    expect(offending).toEqual([]);
  });
});
