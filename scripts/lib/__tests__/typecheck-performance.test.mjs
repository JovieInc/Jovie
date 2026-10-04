import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateRatchet, statistics } from '../../typecheck-performance.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);

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
      process.execPath,
      [
        require.resolve('turbo/bin/turbo'),
        'typecheck',
        '--filter=@jovie/web',
        '--dry=json',
      ],
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

describe('product typecheck memory', () => {
  it('passes a bounded 8 GiB heap through the actual singleflight launcher', () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'apps/web/package.json'), 'utf8')
    );
    const [launcher, compiler, extra] =
      manifest.scripts.typecheck.split(' -- ');
    expect(extra).toBeUndefined();
    expect(compiler).toBe(
      'tsc -p tsconfig.typecheck.json --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo'
    );
    const directory = mkdtempSync(join(tmpdir(), 'jovie-typecheck-heap-'));
    try {
      const result = spawnSync(
        '/bin/sh',
        [
          '-c',
          `${launcher} -- node -e 'console.log("HEAP=" + require("node:v8").getHeapStatistics().heap_size_limit)'`,
        ],
        {
          cwd: join(ROOT, 'apps/web'),
          env: {
            ...process.env,
            NODE_OPTIONS: '',
            TYPECHECK_SINGLEFLIGHT_DIR: directory,
          },
          encoding: 'utf8',
          timeout: 10000,
        }
      );
      expect(result.status, result.stderr).toBe(0);
      const heap = Number(result.stdout.match(/HEAP=(\d+)/)?.[1]);
      expect(heap).toBeGreaterThanOrEqual(8 * 1024 ** 3);
      expect(heap).toBeLessThan(9 * 1024 ** 3);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
