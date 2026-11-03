import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  it('selects release source roots and lanes tests only on PRs', () => {
    expect(ids('pull_request', ['scripts/tests/test_x.py'])).toContain(
      'lanes-selftest-changed-tests'
    );
    expect(ids('pull_request', ['scripts/lanes/doctor.py'])).toContain(
      'lanes-selftest-changed-tests'
    );
    for (const file of [
      'scripts/merge-group-failure-hold.mjs',
      'packages/api-client/contract.ts',
      'ops/registry/capacity.json',
      '.nvmrc',
    ]) {
      expect(ids('pull_request', [file])).toContain(
        'lanes-selftest-changed-tests'
      );
    }
    expect(ids('pull_request', ['apps/web/app/page.tsx'])).not.toContain(
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

  it('runs UpdateTest whenever a release test changed, so bundle-only fixture gaps fail on the PR', () => {
    expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).toContain(
      'if [ -n "${tests// /}" ]; then case " $tests $extra " in'
    );
    expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).toMatch(
      /extra="\$extra scripts\.tests\.test_lane_runner\.UpdateTest"/
    );
  });

  function run(testBody, { listed = true, scenario = 'ancestor' } = {}) {
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
          ? 'RELEASE_EXTRAS = []\nLANE_TESTS = ["scripts/tests/test_probe.py", "scripts/tests/test_main_only.py"]\n'
          : 'RELEASE_EXTRAS = []\nLANE_TESTS = []\n'
      );
      writeFileSync(join(work, 'README.md'), 'base\n');
      // The staged-bundle proof (UpdateTest) runs whenever a release test changed; stub it green here.
      writeFileSync(
        join(work, 'scripts/tests/test_lane_runner.py'),
        'import unittest\n\n\nclass UpdateTest(unittest.TestCase):\n    def test_stub(self):\n        pass\n'
      );
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', 'base');
      git(work, 'push', '-q', 'origin', 'HEAD:main');
      git(work, 'checkout', '-q', '-b', 'pr');
      writeFileSync(join(work, 'scripts/tests/test_probe.py'), testBody);
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', 'pr');
      const head = git(work, 'rev-parse', 'HEAD').trim();
      const proof = join(dir, 'native-proof.json');
      const hookProof = join(dir, 'commit-msg-invoked');
      if (scenario !== 'ancestor') {
        git(work, 'checkout', '-q', 'main');
        writeFileSync(join(work, 'README.md'), 'advanced main\n');
        // A HEAD-vs-base diff wrongly selects this main-only failing test.
        writeFileSync(
          join(work, 'scripts/tests/test_main_only.py'),
          probe('self.fail("main-only test must not be selected")')
        );
        if (scenario === 'conflict') {
          writeFileSync(
            join(work, 'scripts/tests/test_probe.py'),
            '# main conflict\n'
          );
        }
        git(work, 'add', '-A');
        git(work, 'commit', '-q', '-m', 'advance main');
        git(work, 'push', '-q', 'origin', 'HEAD:main');
        git(work, 'checkout', '-q', 'pr');
      }
      // Install only after fixture commits. A validation merge needs no commit.
      const hooks = join(dir, 'hooks');
      mkdirSync(hooks);
      writeFileSync(
        join(hooks, 'commit-msg'),
        '#!/bin/sh\nprintf invoked > "$HOOK_PROOF"\necho "deliberate commit-msg failure" >&2\nexit 1\n',
        { mode: 0o755 }
      );
      git(work, 'config', 'core.hooksPath', hooks);
      if (scenario === 'fetch-failure') {
        git(
          work,
          'remote',
          'set-url',
          'origin',
          join(dir, 'missing-origin.git')
        );
      } else if (scenario === 'merge-prerequisite') {
        // The detached worktree shares this config; Git rejects an invalid strategy.
        git(work, 'config', 'pull.twohead', 'nonexistent-selftest-strategy');
      }
      const result = spawnSync(
        'bash',
        ['-c', LANES_SELFTEST_CHANGED_TESTS_SCRIPT],
        {
          cwd: work,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_BASE_REF: 'main',
            EXPECTED_HEAD: head,
            NATIVE_PROOF: proof,
            HOOK_PROOF: hookProof,
          },
        }
      );
      return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
        head,
        headAfter: git(work, 'rev-parse', 'HEAD').trim(),
        nativeProof: existsSync(proof)
          ? JSON.parse(readFileSync(proof, 'utf8'))
          : null,
        hookInvoked: existsSync(hookProof),
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

  const mergedProbe = `import json, os, subprocess, unittest
from pathlib import Path

class Probe(unittest.TestCase):
    def test_merged_source(self):
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        self.assertEqual(head, os.environ['EXPECTED_HEAD'])
        self.assertEqual(os.environ['LANES_SELFTEST'], '1')
        self.assertTrue(Path(os.environ['HOME']).is_relative_to(Path(os.environ['LANES_STATE'])))
        main_data = Path('README.md').read_text()
        self.assertEqual(main_data, 'advanced main\\n')
        pr_data = Path(__file__).read_text()
        self.assertIn('test_merged_source', pr_data)
        Path(os.environ['NATIVE_PROOF']).write_text(json.dumps(dict(head=head, main=main_data, pr=True)))
`;

  it('runs selected native tests on disjoint advanced main without committing or invoking commit-msg', () => {
    const result = run(mergedProbe, { scenario: 'advanced' });
    expect(result.status, result.output).toBe(0);
    expect(result.nativeProof).toEqual({
      head: result.head,
      main: 'advanced main\n',
      pr: true,
    });
    expect(result.headAfter).toBe(result.head);
    expect(result.hookInvoked).toBe(false);
    expect(result.output).toContain('scripts/tests/test_probe.py');
    expect(result.output).not.toContain('main-only test must not be selected');
    expect(result.output).not.toContain('scripts/tests/test_main_only.py');
  });

  it('runs selected native tests when base is already an ancestor without invoking commit-msg', () => {
    const result = run(
      probe(
        `__import__('pathlib').Path(os.environ['NATIVE_PROOF']).write_text('{"ran":true}')`
      )
    );
    expect(result.status, result.output).toBe(0);
    expect(result.nativeProof).toEqual({ ran: true });
    expect(result.headAfter).toBe(result.head);
    expect(result.hookInvoked).toBe(false);
  });

  it('fails genuine merge conflicts without claiming native proof', () => {
    const result = run(mergedProbe, { scenario: 'conflict' });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('merge with base conflicts');
    expect(result.output).toContain('scripts/tests/test_probe.py');
    expect(result.output).not.toContain('skipped');
    expect(result.output).not.toContain('release self-test env');
    expect(result.nativeProof).toBeNull();
    expect(result.hookInvoked).toBe(false);
    expect(result.headAfter).toBe(result.head);
  });

  it('fails fetching the base even when a stale origin/main exists', () => {
    const result = run(mergedProbe, { scenario: 'fetch-failure' });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('missing-origin.git');
    expect(result.output).not.toContain('release self-test env');
    expect(result.nativeProof).toBeNull();
    expect(result.hookInvoked).toBe(false);
    expect(result.headAfter).toBe(result.head);
  });

  it('fails non-conflict merge prerequisites with the actual Git diagnostic', () => {
    const result = run(mergedProbe, { scenario: 'merge-prerequisite' });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('nonexistent-selftest-strategy');
    expect(result.output).toContain('merge with base failed');
    expect(result.output).not.toContain('merge with base conflicts');
    expect(result.output).not.toContain('skipped');
    expect(result.output).not.toContain('release self-test env');
    expect(result.nativeProof).toBeNull();
    expect(result.hookInvoked).toBe(false);
    expect(result.headAfter).toBe(result.head);
  });

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
    expect(output).toContain('scripts.tests.test_lane_runner.UpdateTest');
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

  // The qualification guard pins the hash of its fixture file. A PR editing the
  // fixture must run the pinning test at PR time, not first in a merge group.
  it('maps the qualification guard fixture to its pinning test', () => {
    const guardSource = readFileSync(
      new URL('../../lanes/qualification_guard.py', import.meta.url),
      'utf8'
    );
    const fixture =
      /DEFAULT_POLICY = SafetyPolicy\(\s*"[0-9a-f]{40}",\s*"([^"]+)"/.exec(
        guardSource
      )?.[1];
    expect(fixture).toMatch(/^scripts\/tests\/test_.*\.py$/);
    expect(LANES_SELFTEST_CHANGED_TESTS_SCRIPT).toContain(
      `${fixture}) cand="$cand $f scripts/tests/test_qualification_guard.py"`
    );
  });
});

describe('shipped import closure before native enrollment', () => {
  const sourceRoot = new URL('../../../', import.meta.url);
  const classSource = readFileSync(
    new URL('scripts/tests/test_lane_runner.py', sourceRoot),
    'utf8'
  )
    .split('class ReleaseImportClosureTest(unittest.TestCase):')[1]
    .split('\nclass ')[0];
  const extras = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        'import ast,json,sys; from pathlib import Path; tree=ast.parse(Path(sys.argv[1]).read_text()); print(json.dumps(next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="RELEASE_EXTRAS" for t in n.targets))))',
        fileURLToPath(new URL('scripts/lanes/lane_runner.py', sourceRoot)),
      ],
      { encoding: 'utf8', timeout: 10000 }
    )
  );

  it('keeps every canonical release extra inside the candidate source roots', () => {
    for (const path of extras) {
      expect(ids('pull_request', [path]), path).toContain(
        'lanes-selftest-changed-tests'
      );
    }
  });

  function run(change) {
    const dir = mkdtempSync(join(tmpdir(), 'release-closure-guard-'));
    try {
      const origin = join(dir, 'origin.git');
      const work = join(dir, 'work');
      mkdirSync(origin);
      git(origin, 'init', '-q', '--bare', '-b', 'main');
      git(dir, 'clone', '-q', origin, work);
      for (const path of extras) {
        mkdirSync(join(work, path, '..'), { recursive: true });
        cpSync(new URL(path, sourceRoot), join(work, path));
      }
      mkdirSync(join(work, 'scripts/lanes'), { recursive: true });
      mkdirSync(join(work, 'scripts/tests'), { recursive: true });
      writeFileSync(
        join(work, 'scripts/lanes/lane_runner.py'),
        `RELEASE_EXTRAS = ${JSON.stringify(extras)}\nLANE_TESTS = ["scripts/tests/test_lane_runner.py"]\n`
      );
      // Run the actual release closure class, including its real staged Node imports.
      writeFileSync(
        join(work, 'scripts/tests/test_lane_runner.py'),
        `
import json, os, re, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import lane_runner as lane
class UpdateTest(unittest.TestCase):
    def test_existing_selector_is_retained(self):
        self.assertEqual(os.environ.get("LANES_SELFTEST"), "1")
class ReleaseImportClosureTest(unittest.TestCase):${classSource}
`
      );
      writeFileSync(
        join(work, 'scripts/tests/test_lanes_atomic_state.py'),
        `
import os, unittest
class AtomicState(unittest.TestCase):
    def test_existing_selector_is_retained(self):
        self.assertEqual(os.environ.get("LANES_SELFTEST"), "1")
`
      );
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', 'complete release');
      git(work, 'push', '-q', 'origin', 'HEAD:main');
      git(work, 'checkout', '-q', '-b', 'pr');
      const module = 'scripts/merge-group-failure-hold.mjs';
      if (change === 'missing') {
        writeFileSync(
          join(work, 'scripts/closure-canary.mjs'),
          'export const canary = true;\n'
        );
        writeFileSync(
          join(work, module),
          `import './closure-canary.mjs';\n${readFileSync(join(work, module), 'utf8')}`
        );
      } else if (change === 'complete') {
        writeFileSync(
          join(work, module),
          `${readFileSync(join(work, module), 'utf8')}\n// complete release edit\n`
        );
      } else if (change === 'nonshipped') {
        writeFileSync(
          join(work, 'scripts/unshipped.mjs'),
          "import './missing.mjs';\n"
        );
      } else if (change === 'manifest') {
        const manifest = join(work, 'scripts/lanes/lane_runner.py');
        writeFileSync(
          manifest,
          `${readFileSync(manifest, 'utf8')}\n# manifest edit\n`
        );
      } else if (change === 'deleted') {
        rmSync(join(work, 'packages/api-client/headers.ts'));
      } else {
        writeFileSync(join(work, 'README.md'), 'unrelated edit\n');
      }
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', 'source change');
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

  it('rejects a real new import missing from the shipped archive', () => {
    const result = run('missing');
    expect(result.output).toContain('ReleaseImportClosureTest');
    expect(result.output).toContain('scripts/closure-canary.mjs');
    expect(result.status).not.toBe(0);
  });

  it('qualifies complete shipped source through the actual release closure class', () => {
    const result = run('complete');
    expect(result.output).toContain('ReleaseImportClosureTest');
    expect(result.output).toContain('Ran 6 tests');
    expect(result.status).toBe(0);
  });

  it('qualifies manifest changes while retaining both existing extra selectors', () => {
    const result = run('manifest');
    expect(result.output).toContain('ReleaseImportClosureTest');
    expect(result.output).toContain('UpdateTest');
    expect(result.output).toContain('test_lanes_atomic_state.py');
    expect(result.output).toContain('Ran 8 tests');
    expect(result.status).toBe(0);
  });

  it('rejects deletion of a shipped import even without editing its importer', () => {
    const result = run('deleted');
    expect(result.output).toContain('ReleaseImportClosureTest');
    expect(result.output).toContain('packages/api-client/headers.ts');
    expect(result.status).not.toBe(0);
  });

  it.each(['nonshipped', 'unchanged'])(
    'does not run closure for %s release source',
    change => {
      const result = run(change);
      expect(result.output).toContain(
        'no changed release self-test lanes tests'
      );
      expect(result.status).toBe(0);
    }
  );
});
