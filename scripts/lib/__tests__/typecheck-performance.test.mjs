import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateRatchet, statistics } from '../../typecheck-performance.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('typecheck performance', () => {
  it('reports stable distribution statistics and noisy ratchet outcomes', () => {
    expect(statistics([4, 1, 2, 3])).toMatchObject({
      min: 1,
      max: 4,
      mean: 2.5,
      variance: 1.25,
      p50: 2,
      p95: 4,
    });
    const policy = {
      baselineP95Ms: 100,
      targetP95Ms: 125,
      minimumSamples: 3,
      warningRegression: 0.1,
      failureRegression: 0.2,
    };
    expect(evaluateRatchet([{ durationMs: 200 }], policy).status).toBe(
      'observe'
    );
    expect(
      evaluateRatchet(
        [121, 122, 123].map(durationMs => ({ durationMs })),
        policy
      ).status
    ).toBe('fail');
  });

  it('keeps ignored tests out of the product cache while retaining ambient types and package edges', () => {
    const run = spawnSync(
      'corepack',
      ['pnpm', 'turbo', 'typecheck', '--filter=@jovie/web', '--dry=json'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    expect(run.status).toBe(0);
    const web = JSON.parse(run.stdout).tasks.find(
      task => task.package === '@jovie/web'
    );
    expect(web.inputs).toHaveProperty('tests/types/vitest.d.ts');
    expect(web.inputs).not.toHaveProperty('tests/unit/utils.test.ts');
    expect(web.dependencies).toContain('@jovie/extension-contracts#typecheck');
  });
});
