import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import RetryVisibilityReporter, {
  formatAnnotation,
  toFlakyEntry,
} from '../vitest-retry-reporter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const fixtureDir = path.join(here, 'fixtures/vitest-retry');
const vitestBin = path.join(repoRoot, 'node_modules/vitest/vitest.mjs');
const require = createRequire(import.meta.url);
const flakiness = require('../../../.github/scripts/analyze-test-flakiness.js');

const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-reporter-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function runFixture(include, dir) {
  const outputFile = path.join(dir, 'test-report.1-10.flaky.json');
  const summaryFile = path.join(dir, 'summary.md');
  const child = spawn(
    process.execPath,
    [vitestBin, 'run', '--config', 'vitest.fixture.config.mjs'],
    {
      cwd: fixtureDir,
      env: {
        ...process.env,
        CI: '',
        GITHUB_WORKSPACE: repoRoot,
        GITHUB_STEP_SUMMARY: summaryFile,
        RETRY_FIXTURE_CACHE_DIR: path.join(dir, 'cache'),
        RETRY_FIXTURE_INCLUDE: include,
        RETRY_FIXTURE_OUTPUT: outputFile,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  return new Promise((resolveRun, rejectRun) => {
    child.once('error', rejectRun);
    child.once('close', status => {
      try {
        resolveRun({
          status,
          dir,
          report: JSON.parse(fs.readFileSync(outputFile, 'utf8')),
          summary: fs.existsSync(summaryFile)
            ? fs.readFileSync(summaryFile, 'utf8')
            : '',
          warnings: stdout
            .split('\n')
            .filter(line => line.startsWith('::warning ')),
        });
      } catch (error) {
        rejectRun(error);
      }
    });
  });
}

describe('vitest retry visibility reporter (real Vitest run)', () => {
  // Each real Vitest child costs ~1s idle and 2-4s under ci-fast CPU
  // contention. The assertions below only read the runs' outputs, so run each
  // fixture once, concurrently, and share the results across the tests.
  const runDirs = [];
  let flakyRun;
  let cleanRun;

  beforeAll(async () => {
    const runDir = () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-reporter-'));
      runDirs.push(dir);
      return dir;
    };
    [flakyRun, cleanRun] = await Promise.all([
      runFixture('flaky.fixture.mjs', runDir()),
      runFixture('clean.fixture.mjs', runDir()),
    ]);
  }, 60_000);

  afterAll(() => {
    for (const dir of runDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records exactly one flaky entry for a test that fails once then passes', () => {
    const { status, report, summary, warnings } = flakyRun;

    // The run stays green: retried-then-passed is reported, never failed.
    expect(status).toBe(0);
    expect(report.flaky).toEqual([
      {
        file: 'scripts/lib/__tests__/fixtures/vitest-retry/flaky.fixture.mjs',
        name: 'fails once then passes',
        retryCount: 1,
      },
    ]);
    expect(warnings).toEqual([
      '::warning file=scripts/lib/__tests__/fixtures/vitest-retry/flaky.fixture.mjs,title=Flaky unit test::fails once then passes passed after 1 retry',
    ]);
    expect(summary).toContain('Flaky unit tests (fixture): 1');
    expect(summary).toContain('fails once then passes');
  });

  it('records no flaky entries, warnings or summary for a clean run', () => {
    const { status, report, summary, warnings } = cleanRun;

    expect(status).toBe(0);
    expect(report.flaky).toEqual([]);
    expect(warnings).toEqual([]);
    expect(summary).toBe('');
  });

  it('feeds the nightly flakiness report, which counts the flake', () => {
    const { dir } = flakyRun;
    const clean = cleanRun;

    const unitStats = flakiness.collectUnitRetryFlakes(
      [{ id: 101 }, { id: 102 }],
      'JovieInc/Jovie',
      {
        rootDir: tempDir(),
        download: (runId, _repo, dest) => {
          const artifactDir = path.join(dest, 'unit-flaky-1-1-0');
          fs.mkdirSync(artifactDir, { recursive: true });
          const source = runId === 101 ? dir : clean.dir;
          fs.copyFileSync(
            path.join(source, 'test-report.1-10.flaky.json'),
            path.join(artifactDir, 'test-report.1-10.flaky.json')
          );
          return true;
        },
      }
    );
    const flaky = flakiness.calculateUnitRetryFlakes(unitStats, 2);

    expect(flaky).toHaveLength(1);
    expect(flaky[0]).toMatchObject({
      name: 'Unit › scripts/lib/__tests__/fixtures/vitest-retry/flaky.fixture.mjs › fails once then passes',
      retries: 1,
      runs: 1,
      retryRate: '50.0',
    });
  });
});

describe('vitest retry visibility reporter (unit)', () => {
  const testCase = ({
    state = 'passed',
    retryCount = 0,
    flaky = false,
  } = {}) => ({
    fullName: 'suite > case, with: punctuation',
    module: { moduleId: '/repo/apps/web/tests/a.test.ts' },
    result: () => ({ state }),
    diagnostic: () => ({ retryCount, flaky }),
  });

  it('ignores first-try passes and tests that never passed', () => {
    expect(toFlakyEntry(testCase(), '/repo')).toBeNull();
    expect(
      toFlakyEntry(testCase({ state: 'failed', retryCount: 1 }), '/repo')
    ).toBeNull();
  });

  it('escapes annotation properties and messages', () => {
    const entry = toFlakyEntry(
      testCase({ retryCount: 2, flaky: true }),
      '/repo'
    );
    expect(entry).toEqual({
      file: 'apps/web/tests/a.test.ts',
      name: 'suite > case, with: punctuation',
      retryCount: 2,
    });
    expect(formatAnnotation({ ...entry, file: 'a,b:c.ts' })).toBe(
      '::warning file=a%2Cb%3Ac.ts,title=Flaky unit test::suite > case, with: punctuation passed after 2 retries'
    );
  });

  it('never throws when the report cannot be written', () => {
    const lines = [];
    const blocker = path.join(tempDir(), 'not-a-dir');
    fs.writeFileSync(blocker, '');
    const reporter = new RetryVisibilityReporter({
      outputFile: path.join(blocker, 'out.flaky.json'),
      env: {},
      workspaceRoot: '/repo',
      log: line => lines.push(line),
    });
    reporter.onTestCaseResult(testCase({ retryCount: 1, flaky: true }));
    reporter.onTestCaseResult({
      result: () => {
        throw new Error('boom');
      },
    });

    expect(() => reporter.onTestRunEnd()).not.toThrow();
    expect(lines[0]).toMatch(/^::warning file=apps\/web\/tests\/a\.test\.ts/);
    expect(lines.at(-1)).toMatch(
      /^::notice::Flaky-test reporter could not write/
    );
  });
});
