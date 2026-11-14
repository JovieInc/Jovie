import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The rolling sweep must survive a load-driven module timeout: the module is
// recorded unscored and the run stays green (infra class), while a crashed
// harness still fails (the partial-report rejection from the lifecycle suite).
const REPO = resolve(import.meta.dirname, '..', '..', '..');
const ORIGINAL = 'export const value = true;\n';
let root;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('rolling sweep timeout contract', () => {
  it('records a timed-out module as unscored and exits 0', () => {
    root = mkdtempSync(join(tmpdir(), 'mutation-sweep-timeout-'));
    const copied = new Set();
    const copyModule = rel => {
      if (copied.has(rel)) return;
      copied.add(rel);
      const source = readFileSync(join(REPO, rel), 'utf8');
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), source);
      for (const match of source.matchAll(
        /(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/gu
      )) {
        const child = resolve(dirname(join(REPO, rel)), match[2]).slice(
          REPO.length + 1
        );
        if (/\.(mjs|ts)$/u.test(child)) copyModule(child);
      }
    };
    copyModule('scripts/mutation-sweep.mjs');
    writeFileSync(
      join(root, 'scripts/mutation-score-baseline.json'),
      JSON.stringify({ schemaVersion: 1, direction: 'lock_up', files: {} })
    );
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
    mkdirSync(join(root, 'packages/ui/atoms'), { recursive: true });
    writeFileSync(join(root, 'packages/ui/atoms/source.ts'), ORIGINAL);
    writeFileSync(
      join(root, 'packages/ui/atoms/source.test.ts'),
      "import { value } from './source';\n"
    );
    mkdirSync(join(root, 'scripts'), { recursive: true });
    // A harness that never finishes: the sweep's per-module budget stops it, the
    // module is recorded unscored (with the timeout in its error), and the run
    // stays green — a load-driven timeout is infrastructure, not a regression.
    writeFileSync(
      join(root, 'scripts/mutation-ui.mjs'),
      'setTimeout(() => {}, 60000);'
    );
    const env = {
      ...process.env,
      MUTATION_MIN_MEM_GB: '0',
      MUTATION_MAX_LOAD: '1000000000',
      MUTATION_MIN_DISK_GB: '0',
    };
    for (const key of Object.keys(env))
      if (key.startsWith('GIT_')) delete env[key];
    for (const args of [
      ['init', '-q'],
      ['add', '.'],
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'fixture',
      ],
    ]) {
      const git = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
      expect(git.status, git.stderr).toBe(0);
    }
    const state = join(root, 'state.json');
    const output = join(root, 'outputs');
    const summary = join(root, 'summary.md');
    const run = spawnSync(
      process.execPath,
      [
        'scripts/mutation-sweep.mjs',
        '--files',
        'packages/ui/atoms/source.ts',
        '--state',
        state,
        '--github-output',
        output,
        '--summary',
        summary,
        '--file-timeout-minutes',
        '0.016',
      ],
      {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 60000,
      }
    );
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const entry = JSON.parse(readFileSync(state, 'utf8')).modules[
      'packages/ui/atoms/source.ts'
    ];
    expect(entry).toMatchObject({ status: 'error', score: null });
    expect(entry.error).toContain('timed out');
    expect(readFileSync(output, 'utf8')).toContain('scored=0');
    expect(readFileSync(summary, 'utf8')).toContain('timeout (unscored)');
  });
});
