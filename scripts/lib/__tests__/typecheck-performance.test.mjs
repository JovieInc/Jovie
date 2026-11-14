import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyConfirmations,
  evaluateRatchet,
  sampleEnv,
  statistics,
} from '../../typecheck-performance.mjs';

import { commandResult } from '../typecheck-command.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);

describe('typecheck performance', () => {
  it('retains normal command output and exit codes, and refuses an exhausted budget', async () => {
    expect(
      await commandResult(
        [
          process.execPath,
          '-e',
          "console.log('measured'); process.exitCode = 7",
        ],
        {},
        1000
      )
    ).toMatchObject({
      exitCode: 7,
      timedOut: false,
      output: expect.stringContaining('measured'),
    });
    expect(
      await commandResult(
        [process.execPath, '-e', "throw Error('must not run')"],
        {},
        0
      )
    ).toMatchObject({ exitCode: 1, timedOut: true, output: '\n' });
  });

  it('writes a failing report when the shared deadline interrupts confirmation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'typecheck-confirm-budget-'));
    try {
      mkdirSync(join(directory, 'scripts/lib'), { recursive: true });
      copyFileSync(
        join(ROOT, 'scripts/lib/typecheck-command.mjs'),
        join(directory, 'scripts/lib/typecheck-command.mjs')
      );
      mkdirSync(join(directory, '.github/ci-harness'), { recursive: true });
      copyFileSync(
        join(ROOT, 'scripts/typecheck-performance.mjs'),
        join(directory, 'scripts/typecheck-performance.mjs')
      );
      writeFileSync(
        join(directory, '.github/ci-harness/typecheck-performance.json'),
        JSON.stringify({
          ratchet: {
            minimumSamples: 3,
            warningRegression: 0.1,
            failureRegression: 0.2,
          },
          scenarios: { ci: { baselineP95Ms: 1, targetP95Ms: 1 } },
        })
      );
      // Deterministic clock/runner fixtures (JOV-12511) replace the old
      // wall-clock choreography (three 1 s sleeps inside one shared 3.5 s
      // budget). That choreography kept ~0.4 s of cumulative slack for round
      // one, which vanished on loaded merge-queue runners and left the
      // confirmation round unattempted (confirmations=[]). Here the shared
      // deadline runs on a VIRTUAL clock that advances only when the runner
      // consumes workload: each round-one sample advances it 1000 ms and
      // exits, so after three samples 3000 < 3500 and the confirmation round
      // always starts; its sample no longer fits the remaining virtual
      // budget, so the runner stalls and the REAL 500 ms per-sample timeout
      // kills it. Load can stretch no cumulative budget — the deadline is
      // virtual and every real-time margin is per-sample (~1500 ms budget vs
      // a ~5 ms workload, then a 500 ms kill against a 30 s stall).
      writeFileSync(
        join(directory, 'virtual-clock.mjs'),
        [
          "import { readFileSync } from 'node:fs';",
          '',
          'const state = ' +
            JSON.stringify(join(directory, 'clock-state')) +
            ';',
          '',
          "export const now = () => Number(readFileSync(state, 'utf8'));",
          '',
        ].join('\n')
      );
      writeFileSync(join(directory, 'clock-state'), '0');
      writeFileSync(
        join(directory, 'corepack'),
        [
          '#!/bin/sh',
          '# Virtual workload: consume 1000 ms of the shared virtual clock, exit',
          '# when the workload still fits the deadline, and stall (until the real',
          '# per-sample timeout kills us) once it no longer does — mirroring a',
          '# real measurement that overruns the shared deadline.',
          `state=${JSON.stringify(join(directory, 'clock-state'))}`,
          'clock=$(( $(cat "$state") + 1000 ))',
          'printf \'%s\\n\' "$clock" > "$state"',
          'if [ "$clock" -le 3500 ]; then',
          '  exit 0',
          'fi',
          'exec sleep 30',
          '',
        ].join('\n')
      );
      chmodSync(join(directory, 'corepack'), 0o755);
      const output = join(directory, 'report.json');
      const result = spawnSync(
        process.execPath,
        [
          join(directory, 'scripts/typecheck-performance.mjs'),
          '--scenario',
          'ci',
          '--samples',
          '3',
          '--enforce',
          '--max-duration-ms',
          '3500',
          '--output',
          output,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            TYPECHECK_PERFORMANCE_CLOCK: join(directory, 'virtual-clock.mjs'),
          },
          // Harness slack only: the fixture completes in about a second even
          // on loaded runners; the assertions are unchanged.
          timeout: 30000,
        }
      );
      expect(result.status, result.stderr).toBe(1);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      expect(report.scenarios[0].samples).toHaveLength(3);
      expect(report.confirmations).toHaveLength(1);
      expect(
        report.confirmations[0].samples.some(sample => sample.timedOut)
      ).toBe(true);
      expect(report.ratchet.ci.status).toBe('fail');
      expect(report.maxDurationMs).toBe(3500);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('kills a stalled measurement and its descendants within the remaining budget', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'typecheck-deadline-'));
    const marker = join(directory, 'orphan');
    try {
      const child = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'), 800)`;
      const result = await commandResult(
        [
          process.execPath,
          join(ROOT, 'scripts/typecheck-slot.mjs'),
          '--',
          process.execPath,
          '-e',
          `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], {stdio:'inherit'}); setInterval(() => {}, 1000)`,
        ],
        {},
        200
      );
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).not.toBe(0);
      await new Promise(resolve => setTimeout(resolve, 900));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('retains the breach when confirmation has too few samples', () => {
    expect(
      applyConfirmations({ ci: { status: 'fail' } }, [
        {
          scenario: 'ci',
          verdict: { status: 'observe', reason: 'insufficient-samples' },
        },
      ]).ci.status
    ).toBe('fail');
  });

  it.each([
    { timedOut: true, exitCode: 1, reason: 'measurement-timeout' },
    { timedOut: false, exitCode: 2, reason: 'sample-error' },
  ])(
    'never clears a breach using a truncated or failing third sample ($reason)',
    failure => {
      const policy = {
        baselineP95Ms: 100,
        targetP95Ms: 125,
        minimumSamples: 3,
        warningRegression: 0.1,
        failureRegression: 0.2,
      };
      const verdict = evaluateRatchet(
        [
          { durationMs: 90, exitCode: 0 },
          { durationMs: 90, exitCode: 0 },
          { durationMs: 10, ...failure },
        ],
        policy
      );
      expect(verdict).toEqual({ status: 'fail', reason: failure.reason });
      expect(
        applyConfirmations({ ci: { status: 'fail' } }, [
          { scenario: 'ci', verdict },
          { scenario: 'ci', verdict: { status: 'pass' } },
        ]).ci
      ).toEqual(verdict);
      expect(
        applyConfirmations({ ci: verdict }, [
          { scenario: 'ci', verdict: { status: 'pass' } },
        ]).ci
      ).toEqual(verdict);
      expect(
        applyConfirmations({ ci: { status: 'fail' } }, [
          { scenario: 'ci', verdict },
        ]).ci.status
      ).toBe('fail');
    }
  );

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

  it('clears an enforced breach that fails to reproduce on its confirmation measurement', () => {
    const policy = {
      baselineP95Ms: 100000,
      targetP95Ms: 125000,
      minimumSamples: 3,
      warningRegression: 0.1,
      failureRegression: 0.2,
    };
    const verdict = samples =>
      evaluateRatchet(
        samples.map(durationMs => ({ durationMs })),
        policy
      );
    // Same tree, scheduled runs 2026-10-12..11-09: per-sample cold typecheck
    // measured ~67s on some days and ~104-123s on others, so max-of-3
    // straddles the 120s fail line. A real regression reproduces.
    const initial = { ci: verdict([112000, 118000, 124000]) };
    expect(initial.ci.status).toBe('fail');
    const cleared = applyConfirmations(initial, [
      { scenario: 'ci', verdict: verdict([96000, 101000, 106000]) },
    ]);
    expect(cleared.ci.status).toBe('pass');
    const reproduced = applyConfirmations(initial, [
      { scenario: 'ci', verdict: verdict([121000, 126000, 131000]) },
    ]);
    expect(reproduced.ci.status).toBe('fail');
    // A passing scenario is never re-measured, and a confirmation can never
    // make a healthy measurement fail.
    const healthy = { ci: verdict([90000, 95000, 100000]) };
    expect(
      applyConfirmations(healthy, [
        { scenario: 'ci', verdict: verdict([130000, 135000, 140000]) },
      ]).ci.status
    ).toBe('pass');
  });

  it('gives every sample a fresh singleflight state dir so replays cannot warm the ratchet', () => {
    const first = sampleEnv(0).TYPECHECK_SINGLEFLIGHT_DIR;
    const second = sampleEnv(0).TYPECHECK_SINGLEFLIGHT_DIR;
    expect(first).not.toBe(second);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
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
  it.each(process.platform === 'linux' ? ['', '1'] : [''])(
    'passes a bounded 8 GiB heap through the actual launcher chain (GEM_TYPECHECK_SLOTS=%j)',
    slots => {
      const manifest = JSON.parse(
        readFileSync(join(ROOT, 'apps/web/package.json'), 'utf8')
      );
      const launchers = manifest.scripts.typecheck.split(' -- ');
      const compiler = launchers.pop();
      const launcher = launchers.join(' -- ');
      expect(launchers.length).toBeGreaterThan(0);
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
              GEM_TYPECHECK_SLOTS: slots,
              GEM_TYPECHECK_LOCK_DIR: join(directory, 'slots'),
              TYPECHECK_SINGLEFLIGHT_DIR: directory,
            },
            encoding: 'utf8',
            // Harness slack only: on loaded merge-queue runners the launcher chain
            // (pnpm/turbo boot) can exceed 10s before the heap probe runs, killing the
            // spawn (status null) and failing this test nondeterministically. The
            // assertions on the propagated heap bound are unchanged.
            timeout: 60000,
          }
        );
        expect(result.status, result.stderr).toBe(0);
        const heap = Number(result.stdout.match(/HEAP=(\d+)/)?.[1]);
        expect(heap).toBeGreaterThanOrEqual(8 * 1024 ** 3);
        expect(heap).toBeLessThan(9 * 1024 ** 3);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
