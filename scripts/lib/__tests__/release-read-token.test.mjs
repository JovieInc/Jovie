import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const release = /** @type {any} */ (
  yamlLoad(
    readFileSync(
      resolve(root, '.github/workflows/production-release.yml'),
      'utf8'
    )
  )
).jobs;

// GITHUB_TOKEN is shared by every workflow and planned past its hourly limit; on
// 2026-11-12 quota deferrals on these reads failed three releases closed. The
// Jovie Bot App token has its own REST bucket. promote-production is bound to the
// Production environment, so its secret contract (JOV-7237) admits JOVIE_BOT_PRIVATE_KEY.
describe('production release evidence reads', () => {
  it.each([
    ['migrate-production', ['predecessor-verdict']],
    ['promote-production', ['journey-gate', 'predecessor-verdict']],
  ])('%s reads with a read-only App token', (jobId, stepIds) => {
    const steps = release[jobId].steps;
    const mintAt = steps.findIndex(s => s.id === 'read-token');
    expect(mintAt).toBeGreaterThanOrEqual(0);
    expect(steps[mintAt].with['permission-actions']).toBe('read');
    expect(steps[mintAt].with['permission-contents']).toBe('read');
    for (const id of stepIds) {
      const at = steps.findIndex(s => s.id === id);
      expect(at).toBeGreaterThan(mintAt);
      expect(steps[at].env.GH_TOKEN).toBe(
        '${{ steps.read-token.outputs.token }}'
      );
    }
  });
});
