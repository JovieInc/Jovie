import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
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
