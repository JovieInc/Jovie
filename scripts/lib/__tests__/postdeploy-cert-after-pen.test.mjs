import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/** @typedef {{ name?: string, if?: string }} Step */
const workflow = /** @type {{ jobs: Record<string, { steps?: Step[] }> }} */ (
  load(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/postdeploy-probes.yml'
      ),
      'utf8'
    )
  )
);

describe('golden path certification after the Pen export', () => {
  it('still certifies when the Pen tooling fails before writing a receipt', () => {
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
    const certify = steps.find(
      s => s.name === 'Certify the golden path on production'
    );
    // A skipped step posts no verdict; a missing receipt fails the Pen frames.
    expect(certify?.if).toBe('${{ !cancelled() }}');
  });
});
