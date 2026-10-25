import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LANES_SELFTEST_CHANGED_TESTS_SCRIPT,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';

const ids = (event, files) =>
  selectSourceGuards(event, files).map(guard => guard.id);

const git = (cwd, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );

// #23137: a lanes test passed at PR time and failed in the merge group because
// the lanes release self-test runs LANE_TESTS with LANES_SELFTEST=1.
describe('lanes release self-test env at PR time', () => {
  it('selects only for lanes modules and tests, on PRs', () => {
    expect(ids('pull_request', ['scripts/tests/test_x.py'])).toContain(
      'lanes-selftest-changed-tests'
    );
    expect(ids('pull_request', ['scripts/lanes/doctor.py'])).toContain(
      'lanes-selftest-changed-tests'
    );
    expect(ids('pull_request', ['scripts/lib/foo.mjs'])).not.toContain(
      'lanes-selftest-changed-tests'
    );
    expect(ids('merge_group', ['scripts/tests/test_x.py'])).not.toContain(
      'lanes-selftest-changed-tests'
    );
  });

  it('mirrors the release self-test: unittest, LANES_SELFTEST=1, scratch state and HOME', () => {
    for (const part of [
      'LANES_SELFTEST=1',
      'LANES_STATE="$t/state"',
      'HOME="$t/state/home"',
      'python3 -m unittest -q $tests',
    ])
      expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).toContain(part);
    expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).not.toContain('pytest');
  });

  it('also runs the atomic-state ratchet and UpdateTest for any scripts/lanes edit', () => {
    expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).toContain(
      'scripts/tests/test_lanes_atomic_state.py'
    );
    expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).toContain(
      'scripts.tests.test_lane_runner.UpdateTest'
    );
    expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).toContain(
      'python3 -m unittest -q $tests $extra'
    );
  });

  function run(testBody, { listed = true } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'lanes-selftest-guard-'));
    try {
      const origin = join(dir, 'origin.git');
      const work = join(dir, 'work');
      mkdirSync(origin);
      git(origin, 'init', '-q', '--bare', '-b', 'main');
      git(dir, 'clone', '-q', origin, work);
      mkdirSync(join(work, 'scripts/lanes'), { recursive: true });
      mkdirSync(join(work, 'scripts/tests'), { recursive: true });
      writeFileSync(
        join(work, 'scripts/lanes/lane_runner.py'),
        listed
          ? 'LANE_TESTS = ["scripts/tests/test_probe.py"]\n'
          : 'LANE_TESTS = []\n'
      );
      writeFileSync(join(work, 'README.md'), 'base\n');
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', 'base');
      git(work, 'push', '-q', 'origin', 'HEAD:main');
      git(work, 'checkout', '-q', '-b', 'pr');
      writeFileSync(join(work, 'scripts/tests/test_probe.py'), testBody);
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', 'pr');
      const result = spawnSync(
        'bash',
        ['-c', LANES_SELFTEST_CHANGED_TESTS_SCRIPT],
        {
          cwd: work,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_BASE_REF: 'main' },
        }
      );
      return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const probe = assertion => `import os
import unittest


class Probe(unittest.TestCase):
    def test_env(self):
        ${assertion}
`;

  it('fails a test that breaks under LANES_SELFTEST=1 (deliberate red)', () => {
    const { status, output } = run(
      probe('self.assertNotEqual(os.environ.get("LANES_SELFTEST"), "1")')
    );
    expect(output).toContain('release self-test env');
    expect(status).not.toBe(0);
  });

  it('passes a test that holds under the release self-test env', () => {
    const { status, output } = run(
      probe('self.assertEqual(os.environ.get("LANES_SELFTEST"), "1")')
    );
    expect(output).toContain('release self-test env');
    expect(status).toBe(0);
  });

  it('ignores tests the release self-test does not run', () => {
    const { status, output } = run(
      probe('self.assertNotEqual(os.environ.get("LANES_SELFTEST"), "1")'),
      { listed: false }
    );
    expect(output).toContain('no changed release self-test lanes tests');
    expect(status).toBe(0);
  });
});
