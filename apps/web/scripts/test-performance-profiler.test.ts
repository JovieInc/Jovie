import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERFORMANCE_SUITE_FILES,
  PERFORMANCE_SUITE_TIMEOUT_MS,
  type ProfilerDependencies,
  TEST_PERFORMANCE_TARGETS,
  TestPerformanceProfiler,
  TestRunError,
} from './test-performance-profiler';

const workspaces: string[] = [];

function commandResult(
  overrides: Partial<ReturnType<ProfilerDependencies['runCommand']>> = {}
): ReturnType<ProfilerDependencies['runCommand']> {
  return {
    pid: 123,
    output: [null, '', ''],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    ...overrides,
  };
}

function createWorkspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'jovie-profiler-'));
  mkdirSync(join(cwd, '.cache'));
  workspaces.push(cwd);
  return cwd;
}

function createProfiler(
  cwd: string,
  runCommand: ProfilerDependencies['runCommand']
): TestPerformanceProfiler {
  return new TestPerformanceProfiler({ cwd, runCommand });
}

function seedBaseline(cwd: string): void {
  writeFileSync(join(cwd, 'test-performance-baseline.json'), 'last-valid');
}

function expectBaselinePreserved(cwd: string): void {
  expect(
    readFileSync(join(cwd, 'test-performance-baseline.json'), 'utf8')
  ).toBe('last-valid');
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('TestPerformanceProfiler fail-closed behavior', () => {
  it('profiles a fixed representative suite within a calibrated ceiling', async () => {
    const cwd = createWorkspace();
    const invocations: Array<{ args: string[]; timeout: number }> = [];
    const profiler = createProfiler(cwd, (args, timeout) => {
      invocations.push({ args, timeout });
      if (invocations.length === 1) {
        return commandResult({ stdout: 'Duration 1.0s (setup 0.2s)' });
      }
      writeFileSync(
        join(cwd, '.cache/vitest-performance-results.json'),
        JSON.stringify({
          numTotalTests: 2,
          testResults: [
            {
              assertionResults: [
                { title: 'cold start', duration: 1_999, status: 'passed' },
                { title: 'stuck test', duration: 2_001, status: 'passed' },
              ],
            },
          ],
        })
      );
      return commandResult({
        stdout:
          'Duration 2.0s (transform 100ms, tests 400ms, environment 500ms)',
      });
    });

    const metrics = await profiler.runPerformanceAnalysis();

    expect(invocations[1]).toEqual({
      args: [
        'exec',
        'vitest',
        'run',
        '--config=vitest.config.mts',
        ...PERFORMANCE_SUITE_FILES,
        '--reporter=default',
        '--reporter=json',
        '--outputFile=.cache/vitest-performance-results.json',
      ],
      timeout: PERFORMANCE_SUITE_TIMEOUT_MS,
    });
    expect(PERFORMANCE_SUITE_FILES).toHaveLength(10);
    expect(PERFORMANCE_SUITE_TIMEOUT_MS).toBe(
      TEST_PERFORMANCE_TARGETS.totalDuration + 30_000
    );
    expect(TEST_PERFORMANCE_TARGETS).toMatchObject({
      p95: 200,
      individualTest: 2_000,
    });
    expect(metrics.slowTests).toEqual([
      expect.objectContaining({ name: 'stuck test', duration: 2_001 }),
    ]);
  });

  it('reports a missing Vitest executable and preserves the baseline', async () => {
    const cwd = createWorkspace();
    seedBaseline(cwd);
    const missing = Object.assign(new Error('spawnSync pnpm ENOENT'), {
      code: 'ENOENT',
    });
    const profiler = createProfiler(cwd, () =>
      commandResult({
        error: missing,
        output: [null, undefined, undefined],
        stdout: undefined,
        stderr: undefined,
        status: null,
      })
    );

    await expect(profiler.runPerformanceAnalysis()).rejects.toMatchObject({
      name: 'TestRunError',
      details: expect.stringContaining('ENOENT'),
    });
    expectBaselinePreserved(cwd);
  });

  it('reports timeout signal details and preserves the baseline', async () => {
    const cwd = createWorkspace();
    seedBaseline(cwd);
    let invocation = 0;
    const profiler = createProfiler(cwd, () => {
      invocation += 1;
      if (invocation === 1) {
        return commandResult({ stdout: 'Duration 1.0s (setup 0.2s)' });
      }
      const timeout = Object.assign(new Error('spawnSync pnpm ETIMEDOUT'), {
        code: 'ETIMEDOUT',
      });
      return commandResult({
        error: timeout,
        status: null,
        signal: 'SIGTERM',
        stderr: `suite exceeded ${PERFORMANCE_SUITE_TIMEOUT_MS}ms`,
      });
    });

    await expect(profiler.runPerformanceAnalysis()).rejects.toEqual(
      expect.objectContaining<TestRunError>({
        details: expect.stringMatching(
          /signal=SIGTERM[\s\S]*ETIMEDOUT[\s\S]*classification=inconclusive-performance-timeout[\s\S]*remediation=/
        ),
      })
    );
    expectBaselinePreserved(cwd);
  });

  it('rejects partial or zero timing output and preserves the baseline', async () => {
    const cwd = createWorkspace();
    seedBaseline(cwd);
    let invocation = 0;
    const profiler = createProfiler(cwd, () => {
      invocation += 1;
      if (invocation === 1) {
        return commandResult({ stdout: 'Duration 1.0s (setup 0.2s)' });
      }
      writeFileSync(
        join(cwd, '.cache/vitest-performance-results.json'),
        JSON.stringify({ numTotalTests: 0, testResults: [] })
      );
      return commandResult({ stdout: 'Duration 4.2s (tests 0.0s)' });
    });

    await expect(profiler.runPerformanceAnalysis()).rejects.toMatchObject({
      details: expect.stringContaining('testResults'),
    });
    expectBaselinePreserved(cwd);
  });

  it('writes a baseline for valid Vitest 4 output without collect or prepare', async () => {
    const cwd = createWorkspace();
    seedBaseline(cwd);
    let invocation = 0;
    const profiler = createProfiler(cwd, () => {
      invocation += 1;
      if (invocation === 1) {
        return commandResult({ stdout: 'Duration 1.0s (setup 0.2s)' });
      }
      writeFileSync(
        join(cwd, '.cache/vitest-performance-results.json'),
        JSON.stringify({
          numTotalTests: 1,
          testResults: [
            {
              assertionResults: [
                { title: 'works', duration: 12, status: 'passed' },
              ],
            },
          ],
        })
      );
      return commandResult({
        stdout:
          'Duration 2.0s (transform 100ms, setup 200ms, import 300ms, tests 400ms, environment 500ms)',
      });
    });

    const metrics = await profiler.runPerformanceAnalysis();

    expect(metrics.testResults).toHaveLength(1);
    expect(metrics.setupTime).toBe(200);
    const baseline = JSON.parse(
      readFileSync(join(cwd, 'test-performance-baseline.json'), 'utf8')
    );
    expect(baseline.metrics.totalDuration).toBe(2000);
    expect(baseline.metrics.collectTime).toBe(0);
    expect(baseline.metrics.prepareTime).toBe(0);
    expect(baseline.metrics.testResults[0].name).toBe('works');
  });

  it('resets metrics between runs and preserves the valid baseline on a later partial run', async () => {
    const cwd = createWorkspace();
    let invocation = 0;
    const profiler = createProfiler(cwd, () => {
      invocation += 1;
      if (invocation === 1 || invocation === 3) {
        return commandResult({ stdout: 'Duration 1.0s (setup 0.2s)' });
      }
      if (invocation === 2) {
        writeFileSync(
          join(cwd, '.cache/vitest-performance-results.json'),
          JSON.stringify({
            numTotalTests: 1,
            testResults: [
              {
                assertionResults: [
                  { title: 'first run', duration: 12, status: 'passed' },
                ],
              },
            ],
          })
        );
        return commandResult({
          stdout:
            'Duration 2.0s (transform 100ms, tests 400ms, environment 500ms)',
        });
      }
      writeFileSync(
        join(cwd, '.cache/vitest-performance-results.json'),
        JSON.stringify({ numTotalTests: 0, testResults: [] })
      );
      return commandResult({ stdout: 'Duration 3.0s' });
    });

    const first = await profiler.runPerformanceAnalysis();
    expect(first.testResults.map(result => result.name)).toEqual(['first run']);
    const validBaseline = readFileSync(
      join(cwd, 'test-performance-baseline.json'),
      'utf8'
    );

    await expect(profiler.runPerformanceAnalysis()).rejects.toMatchObject({
      details: expect.stringContaining('testResults'),
    });
    expect(
      readFileSync(join(cwd, 'test-performance-baseline.json'), 'utf8')
    ).toBe(validBaseline);
  });

  it.each([
    {
      name: 'missing JSON',
      writeJson: (_cwd: string) => {},
      expected: 'vitestJson',
    },
    {
      name: 'malformed JSON',
      writeJson: (cwd: string) =>
        writeFileSync(
          join(cwd, '.cache/vitest-performance-results.json'),
          '{"numTotalTests":1,"testResults":'
        ),
      expected: 'vitestJson',
    },
    {
      name: 'truncated assertion set',
      writeJson: (cwd: string) =>
        writeFileSync(
          join(cwd, '.cache/vitest-performance-results.json'),
          JSON.stringify({
            numTotalTests: 2,
            testResults: [
              {
                assertionResults: [
                  { title: 'only one', duration: 10, status: 'passed' },
                ],
              },
            ],
          })
        ),
      expected: 'vitestJsonCount(declared=2, assertions=1)',
    },
    {
      name: 'non-skipped assertion without a duration',
      writeJson: (cwd: string) =>
        writeFileSync(
          join(cwd, '.cache/vitest-performance-results.json'),
          JSON.stringify({
            numTotalTests: 2,
            testResults: [
              {
                assertionResults: [
                  { title: 'timed', duration: 10, status: 'passed' },
                  { title: 'missing duration', status: 'passed' },
                ],
              },
            ],
          })
        ),
      expected: 'vitestJsonDuration(nonSkippedMissingOrInvalid=1)',
    },
  ])('rejects $name even when console timings look complete', async scenario => {
    const cwd = createWorkspace();
    seedBaseline(cwd);
    let invocation = 0;
    const profiler = createProfiler(cwd, () => {
      invocation += 1;
      if (invocation === 1) {
        return commandResult({ stdout: 'Duration 1.0s (setup 0.2s)' });
      }
      scenario.writeJson(cwd);
      return commandResult({
        stdout:
          '✓ tests/unit/example.test.ts (1 test) 20ms\nDuration 2.0s (transform 100ms, tests 400ms, environment 500ms)',
      });
    });

    await expect(profiler.runPerformanceAnalysis()).rejects.toMatchObject({
      details: expect.stringContaining(scenario.expected),
    });
    expectBaselinePreserved(cwd);
  });
});
